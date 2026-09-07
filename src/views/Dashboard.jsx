/* ============================================================================
   Dashboard.jsx — the realtor dashboard (brief §10).

   Two things make this view different from every other CRM dashboard:

   1. CRITICAL DATES ARE THE TOP SECTION. Not production, not a leaderboard.
      A realtor loses a deal by missing an inspection objection deadline, never
      by not knowing their GCI, so the daily driver is pinned first by default.

   2. THE LAYOUT IS DATA. `settings.dashOrder` / `settings.dashHidden` decide
      which sections render and in what order. The team leader arranges it once
      behind the Rearrange button and every agent inherits that layout, minus
      the leader-only sections. Nothing here is hard-coded except the fallback
      order in DASH_SECTIONS.

   Privacy is the database's job (see docs/VIEW-CONTRACT.md) — `ctx.contacts`
   and `ctx.transactions` are already scoped to what this user may see. The one
   thing this view does check is `ctx.isLeader`, and only for layout: whether to
   offer the Rearrange button, and whether the team scorecard / all-agent cap
   bars exist at all.

   All date arithmetic goes through lib/dates. All commission arithmetic goes
   through lib/commission. No `new Date()` in this file.
   ========================================================================== */

import React, { useMemo, useState } from 'react';
import {
  GripVertical, CalendarClock, TrendingUp, Activity, LayoutGrid,
  Filter, Target, Flame, AlertTriangle, ArrowRight, Clock, Sliders,
  CheckCircle2, CircleSlash,
} from 'lucide-react';

import {
  DASH_SECTIONS, phasesOf, stagesOf, stageOf, stageLabel, apptCounts,
} from '../lib/settings';
import {
  urgency, daysUntil, diffDays, fmtShort, fmtLong, effectiveDateOf, isDate, addDays,
} from '../lib/dates';
import { capProgress, agentPlan, computeCommission } from '../lib/commission';
import { usd, sum, pct } from '../lib/format';
import { Card, Kpi, Btn, Empty, SecTitle, Pill, LegalNote, Drill } from '../components/ui';
import { FLAT_PLAN, closedOn, expectedPrice, onClosedDate, txGross } from '../lib/txn';
import { alpha } from '../lib/color';
import { BRAND } from '../lib/brand';

/* ============================================================ small helpers */

/* A forecast needs a commission rate for deals that have no contract yet.
   `settings.forecastRate` is the install's answer; 3 is the seed. The screen
   says which one it used, because a silent assumption in a money number is a
   lie waiting to happen. */
const FORECAST_FALLBACK = 3;
function forecastRate(settings) {
  const r = Number(settings && settings.forecastRate);
  return Number.isFinite(r) && r > 0
    ? { rate: r, assumed: false }
    : { rate: FORECAST_FALLBACK, assumed: true };
}

/* a neutral plan: gross is plan-independent, but computeCommission wants one.
   Going through the engine for gross means one definition of "gross" exists. */
const grossFor = (salePrice, rate) =>
  computeCommission({ salePrice, commissionRate: rate }, FLAT_PLAN, { capPaidToDate: 0 }).gross;



/* ONE definition of "when it closed", used by every screen that asks.
   The actual close date wins over the scheduled one, because a deal that closed
   a week late closed a week late. Transactions.jsx and Commission.jsx import
   this same helper so a calendar-year tile and a cap-period bar can never be
   reading two different dates off the same record. */
/** the same record, with closeDate normalised so cap maths sees the real date */
/** a side counts as one unit; a dual-agency deal is two */
const unitsOf = t => (t && t.side === 'both' ? 2 : 1);

function median(nums) {
  const a = (nums || []).filter(n => Number.isFinite(n)).slice().sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

/** days-until, in words a human uses out loud */
function whenWords(n) {
  if (n == null) return 'no date';
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  /* a deadline that passed is OVERDUE, not "yesterday" — the wording has to
     read the same as the flag beside it */
  if (n === -1) return '1 day overdue';
  if (n < 0) return `${-n} days overdue`;
  if (n === 7) return 'in a week';
  return `in ${n} days`;
}

const WHEN_STYLE = {
  overdue: { background: alpha(BRAND.colors.red,.12), color: '#B03030' },
  urgent: { background: '#FFF0E0', color: '#A85B10' },
  soon: { background: '#EEF0FA', color: BRAND.colors.indigo },
  far: { background: '#F1F2F8', color: '#7B76A0' },
  none: { background: '#F1F2F8', color: '#7B76A0' },
};

/* No denominator means NO ANSWER, not zero. A zero here used to print "0 %" in
   the amber "weak step" style next to a perfectly healthy count. Callers render
   null as an em dash. */
const ratio = (a, b) => (b > 0 ? a / b : null);
/** a percentage for display, or an em dash when there is nothing to divide by */
const pctOrDash = v => (v == null ? '—' : pct(v));
/** a bar width, which needs a number even when the ratio is undefined */
const barPct = v => (v == null ? 0 : v);

/* the activity kinds that are an OUTBOUND touch. `note` is not one: every
   contact is created with an auto-logged "Came in from {source}" note, so a
   first-touch measured across all kinds is structurally always zero.
   Mirrors ACT_KINDS in Contacts.jsx. */
const OUTBOUND_KINDS = ['call', 'text', 'email'];

/* ================================================================== the model
   One pass over contacts and transactions builds everything every section
   needs. Sections stay dumb; the arithmetic lives here where it can be read
   top to bottom. */
export function buildModel(ctx) {
  const settings = ctx.settings || {};
  const stages = stagesOf(settings);
  const phases = phasesOf(settings);
  const contacts = ctx.contacts || [];
  const txns = ctx.transactions || [];
  const today = ctx.todayIso;
  const year = String(today).slice(0, 4);

  const stageIndex = {};
  stages.forEach((s, i) => { stageIndex[s.key] = i; });
  const byId = {};
  contacts.forEach(c => { byId[c.id] = c; });

  /* ------------------------------------------------------- critical dates */
  const hardHoursRaw = Number(settings.reminders && settings.reminders.hardFlagHours);
  const hardHours = Number.isFinite(hardHoursRaw) && hardHoursRaw > 0 ? hardHoursRaw : 48;
  const hardDays = hardHours / 24;

  const dueRows = [];
  txns.filter(t => t.status === 'active').forEach(t => {
    (t.deadlines || []).forEach(d => {
      if (!d) return;
      const st = d.status == null ? 'open' : d.status;
      if (st !== 'open' && st !== 'extended') return;         // met / waived are done
      const iso = effectiveDateOf(d);
      if (!isDate(iso)) return;
      const n = daysUntil(iso, ctx.tz);
      dueRows.push({
        id: `${t.id}:${d.key}`,
        txn: t, dl: d, iso, days: n,
        urg: urgency(d, ctx.tz),
        /* "inside 48h" needs a LOWER bound. Without `n >= 0` every overdue
           deadline also reads as imminent and the header says "2 overdue ·
           2 inside 48h" about the same two rows. Transactions.jsx:75 and
           App.jsx already count it this way. */
        hard: n != null && n >= 0 && n <= hardDays,
        extended: st === 'extended',
      });
    });
  });
  dueRows.sort((a, b) => a.iso.localeCompare(b.iso) || String(a.txn.address).localeCompare(String(b.txn.address)));
  const due = {
    rows: dueRows,
    overdue: dueRows.filter(r => r.urg === 'overdue').length,
    hard: dueRows.filter(r => r.hard).length,
    hardHours,
    activeCount: txns.filter(t => t.status === 'active').length,
  };

  /* ------------------------------------------------- pipeline & production
     A contact whose deal is already ON the transactions board is NOT open
     pipeline. Counting it in both places double-counts it against the "Under
     contract" tile sitting on the same row, and a contact whose deal has
     already CLOSED carries forecast for money that is already in the GCI tile.
     Only a deal that fell through puts a contact back in play. */
  const { rate: fRate, assumed: fAssumed } = forecastRate(settings);
  const txnsByContact = {};
  txns.forEach(t => {
    if (!t || !t.contact_id) return;
    (txnsByContact[t.contact_id] = txnsByContact[t.contact_id] || []).push(t);
  });
  const hasTxn = c => !!txnsByContact[c && c.id];
  const hasLiveOrClosedTxn = c => (txnsByContact[(c && c.id)] || []).some(t => t.status !== 'fell');

  const openStageContacts = contacts.filter(c => {
    const st = stageOf(c.stage, settings);
    return st && st.open;
  });
  const alreadyOnTheBoard = openStageContacts.filter(hasLiveOrClosedTxn);
  const openContacts = openStageContacts.filter(c => !hasLiveOrClosedTxn(c));
  const openRows = openContacts.map(c => {
    const price = expectedPrice(c);
    const st = stageOf(c.stage, settings) || {};
    const gross = price > 0 ? grossFor(price, fRate) : 0;
    return { c, price, gross, prob: Number(st.prob) || 0 };
  });
  const closedAll = txns.filter(t => t.status === 'closed');
  const closedYtd = closedAll.filter(t => closedOn(t).slice(0, 4) === year);
  const activeTxns = txns.filter(t => t.status === 'active');

  const pipeline = {
    openCount: openRows.length,
    openVolume: sum(openRows, r => r.price),
    openGross: sum(openRows, r => r.gross),
    weighted: sum(openRows, r => r.gross * r.prob),
    excluded: alreadyOnTheBoard.length,
    gciYtd: sum(closedYtd, txGross),
    closedCount: closedYtd.length,
    units: sum(closedYtd, unitsOf),
    dualUnits: sum(closedYtd, t => unitsOf(t) - 1),
    volumeYtd: sum(closedYtd, t => Number(t.salePrice) || 0),
    ucCount: activeTxns.length,
    ucGross: sum(activeTxns, txGross),
    rate: fRate,
    rateAssumed: fAssumed,
    year,
  };

  /* ------------------------------------------------------------- the seats
     ONE seat list for the cap bars, the scorecard and the activity goal.
     Commission.jsx keeps any user who owns a transaction, active or not;
     if this list dropped them, the GCI tile above would exceed the sum of the
     rows beneath it the moment a leader deactivates an agent mid-year. */
  const ownerIds = new Set(txns.map(t => t.owner_id).filter(Boolean));
  const seats = (ctx.isLeader ? (ctx.users || []) : [ctx.me])
    .filter(u => u && (u.active !== false || ownerIds.has(u.id)));

  /* -------------------------------------------------------- cap progress
     Cap periods are NOT the calendar year unless the plan says so, and the
     close date they run on is closedOn() — the same one the GCI tile uses. */
  const capRows = seats.map(u => {
    const mine = txns.filter(t => t.status === 'closed' && t.owner_id === u.id).map(onClosedDate);
    const plan = agentPlan(u.plan);
    return { user: u, plan, prog: capProgress(mine, plan, today), closed: mine.length };
  }).sort((a, b) => (b.prog.pct - a.prog.pct) || String(a.user.name).localeCompare(String(b.user.name)));

  /* --------------------------------------------------- activity & health
     A 30-day window, because "appointments held" with no window is a vanity
     number that only ever goes up.

     WHAT THE APPOINTMENT NUMBERS ACTUALLY ARE: an appointment record carries
     the date it is FOR, not the date it was booked, so a window can only ever
     select appointments that HAPPENED in it. This used to be labelled
     "appointments set", which quietly dropped every future booking out of the
     denominator of the hold rate. It is now labelled for what it counts. */
  const WINDOW = 30;
  const windowStart = addDays(today, -WINDOW);
  let apptInWindow = 0, apptHeld = 0, apptNoShow = 0, apptUpcoming = 0;
  const firstTouch = [];
  const yearStart = `${year}-01-01`;
  const heldByContact = {};
  contacts.forEach(c => {
    (c.appointments || []).forEach(a => {
      if (!a || !apptCounts(a.type, settings)) return;        // showings are not sales conversations
      const at = String(a.at || '').slice(0, 10);
      if (!isDate(at)) return;
      if (a.status === 'cancelled') return;
      if (at >= windowStart && at <= today) {
        apptInWindow++;
        if (a.status === 'held') apptHeld++;
        if (a.status === 'noshow') apptNoShow++;
      } else if (at > today && a.status === 'booked') apptUpcoming++;
      /* the appointment-to-close ratio runs on the calendar year, to sit
         alongside the GCI tile rather than a rolling window nothing else uses */
      if (a.status === 'held' && at >= yearStart && at <= today) {
        (heldByContact[c.id] = heldByContact[c.id] || []).push(at);
      }
    });
    /* Speed to first OUTBOUND touch. Every contact's earliest activity is the
       auto-logged "Came in from {source}" note stamped at creation, so counting
       notes makes this structurally 0 and the dashboard claims the team called
       all forty leads the day they landed. */
    const outbound = (c.activity || []).filter(a =>
      a && OUTBOUND_KINDS.includes(a.kind) && isDate(String(a.at || '').slice(0, 10)));
    if (outbound.length && isDate(String(c.created_at || '').slice(0, 10))) {
      const first = outbound.slice().sort((a, b) => String(a.at).localeCompare(String(b.at)))[0];
      const d = diffDays(String(c.created_at).slice(0, 10), String(first.at).slice(0, 10));
      firstTouch.push(Math.max(0, d));
    }
  });

  /* ---------------------------------------- appointment → close (brief §22)
     Only counting appointment types, only status 'held', and — the rule that
     is easy to get wrong — an appointment only counts toward a close if it
     HAPPENED BEFORE that close. An appointment logged after the closing table
     did not produce the closing. */
  const a2cCloses = closedYtd.filter(t => {
    const on = closedOn(t);
    if (!isDate(on)) return false;
    return (heldByContact[t.contact_id] || []).some(at => at < on);
  });
  const heldYtd = Object.keys(heldByContact).reduce((s, k) => s + heldByContact[k].length, 0);
  const apptToClose = {
    held: heldYtd,
    closes: a2cCloses.length,
    closedTotal: closedYtd.length,
    rate: ratio(a2cCloses.length, heldYtd),
    from: yearStart,
    year,
  };

  const coldRaw = Number(settings.goals && settings.goals.coldAfterDays);
  const coldDays = Number.isFinite(coldRaw) && coldRaw > 0 ? coldRaw : 14;
  const live = contacts.filter(c => {
    const st = stageOf(c.stage, settings);
    return !(st && st.lost);
  });
  /* A past client is not "going cold" — they are on a deliberate annual
     cadence, and burying four of them in an urgent-looking number teaches the
     agent to ignore the number. */
  const isPastClient = c => !!(c && (isDate(c.closedWithUsOn)
    || (txnsByContact[c.id] || []).some(t => t.status === 'closed')));
  const followDueList = live.filter(c => {
    if (!isDate(c.nextActionDue)) return false;
    const n = daysUntil(c.nextActionDue, ctx.tz);
    return n != null && n <= 0;
  });
  const goneQuiet = c => {
    if (!isDate(c.lastTouch)) return true;
    const n = daysUntil(c.lastTouch, ctx.tz);
    return n != null && -n >= coldDays;
  };
  const quietList = live.filter(goneQuiet);
  const coldList = quietList.filter(c => !isPastClient(c));
  const coldPast = quietList.length - coldList.length;
  const goalPerWeek = Number(settings.goals && settings.goals.apptsPerWeek) || 0;
  /* apptsPerWeek is a PER-AGENT, appointments-SET goal. On the leader's
     dashboard the number beside it is the whole team, so the goal is scaled by
     the seats in scope and the label says so. */
  const goalForWindow = goalPerWeek ? Math.round((goalPerWeek * seats.length * WINDOW) / 7) : 0;

  const activity = {
    window: WINDOW,
    windowStart,
    apptInWindow, apptHeld, apptNoShow, apptUpcoming,
    holdRate: ratio(apptHeld, apptInWindow),
    goalPerWeek,
    goalSeats: seats.length,
    goalForWindow,
    apptToClose,
    speed: median(firstTouch),
    speedN: firstTouch.length,
    speedNone: contacts.length - firstTouch.length,
    sameDay: firstTouch.filter(d => d === 0).length,
    followDue: followDueList.length,
    followOverdue: followDueList.filter(c => (daysUntil(c.nextActionDue, ctx.tz) || 0) < 0).length,
    cold: coldList.length,
    coldPast,
    coldDays,
    liveCount: live.filter(c => !isPastClient(c)).length,
  };

  /* ------------------------------------------- transactions board summary */
  const fell = txns.filter(t => t.status === 'fell');
  const fellPhaseCount = {};
  fell.forEach(t => {
    const k = t.fellPhase || t.phase || 'uc';
    fellPhaseCount[k] = (fellPhaseCount[k] || 0) + 1;
  });
  const worstFellPhase = Object.keys(fellPhaseCount)
    .sort((a, b) => fellPhaseCount[b] - fellPhaseCount[a])[0] || null;
  const phaseTiles = phases
    .filter(p => !p.lost)
    .map(p => ({
      key: p.key,
      label: p.label,
      color: p.color,
      terminal: !!p.terminal,
      n: txns.filter(t => t.phase === p.key && t.status !== 'fell').length,
    }));
  const txsummary = {
    tiles: phaseTiles,
    fell: fell.length,
    fellVolume: sum(fell, t => Number(t.salePrice) || 0),
    worstFellPhase: worstFellPhase
      ? ((phases.find(p => p.key === worstFellPhase) || {}).label || worstFellPhase)
      : null,
    total: txns.length,
  };

  /* ------------------------------------------------------ conversion funnel
     Cumulative, not a snapshot: a contact sitting at "Agreement Signed" has
     been through the appointment.

     EVERY ROW COUNTS CONTACTS, ALL TIME. It used to count contacts for three
     rows, transactions for the fourth and every closed transaction ever for the
     fifth, so one contact with two deals could push a step over 100% and the
     bottom row silently disagreed with the YTD tile above it.

     A contact with a transaction has provably signed and been under contract,
     whatever its stage says. A LOST contact is credited only for what it can
     prove — the appointments actually on its record — and that test now runs
     BEFORE the transaction short-circuit, which used to hand a lost contact
     with no appointments at all credit for all three steps. */
  const heldEvidence = c => (c.appointments || []).some(a => a && apptCounts(a.type, settings) && a.status === 'held');
  const setEvidence = c => (c.appointments || []).some(a => a && apptCounts(a.type, settings) && a.status !== 'cancelled');
  const hasClosedTxn = c => (txnsByContact[c.id] || []).some(t => t.status === 'closed');

  const reached = (c, key) => {
    const st = stageOf(c.stage, settings) || {};
    const evidence = key === 'apptset' ? setEvidence(c) : key === 'apptheld' ? heldEvidence(c) : false;
    if (st.lost) {
      if (key === 'apptset' || key === 'apptheld') return evidence;
      return hasTxn(c);                                   // a dead deal was still signed and under contract
    }
    if (evidence) return true;
    if (hasTxn(c)) return true;
    const here = stageIndex[c.stage];
    const want = stageIndex[key];
    if (here == null || want == null) return false;
    return here >= want;
  };

  const FUNNEL_KEYS = [
    { key: 'apptset', fallback: 'Appointment set' },
    { key: 'apptheld', fallback: 'Appointment held' },
    { key: 'signed', fallback: 'Agreement signed' },
    { key: 'contract', fallback: 'Under contract' },
  ];
  const funnelRows = FUNNEL_KEYS.map(f => {
    const st = stages.find(s => s.key === f.key);
    return {
      key: f.key,
      label: st ? stageLabel(f.key, 'both', settings) : f.fallback,
      short: st ? (st.sellerLabel || f.fallback) : f.fallback,
      color: (st && st.color) || '#6B73C9',
      n: contacts.filter(c => reached(c, f.key)).length,
    };
  });
  funnelRows.push({
    key: 'closed', label: 'Closed', short: 'Closed', color: BRAND.colors.green,
    n: contacts.filter(hasClosedTxn).length,
  });
  const funnelTop = funnelRows.length ? funnelRows[0].n : 0;
  const funnel = funnelRows.map((r, i) => ({
    ...r,
    ofTop: ratio(r.n, funnelTop),
    step: i === 0 ? null : ratio(r.n, funnelRows[i - 1].n),
    prev: i === 0 ? null : funnelRows[i - 1].short,
  }));

  /* ----------------------------------------------------- lead source ROI
     Ranked by closed GCI. Lead count flatters the portals; dollars do not.
     The dollars are the SAME window as the GCI tile — this calendar year — and
     the screen says so, because all-time GCI over a live lead count is a
     per-lead figure with no period at all. */
  const srcMap = {};
  const touch = name => {
    const k = String(name || '').trim() || 'Unattributed';
    if (!srcMap[k]) srcMap[k] = { source: k, leads: 0, units: 0, gci: 0, volume: 0 };
    return srcMap[k];
  };
  contacts.forEach(c => { touch(c.source).leads++; });
  closedYtd.forEach(t => {
    const c = byId[t.contact_id];
    const row = touch(c ? c.source : 'Unattributed');
    row.units += unitsOf(t);
    row.gci += txGross(t);
    row.volume += Number(t.salePrice) || 0;
  });
  const sources = Object.keys(srcMap).map(k => srcMap[k])
    .filter(r => r.leads > 0 || r.gci > 0)
    .map(r => ({ ...r, perLead: r.leads > 0 ? r.gci / r.leads : 0 }))
    .sort((a, b) => b.gci - a.gci || b.leads - a.leads);
  const sourceTotals = {
    leads: sum(sources, r => r.leads),
    units: sum(sources, r => r.units),
    gci: sum(sources, r => r.gci),
    year,
  };

  /* -------------------------------------------------------- team scorecard
     Same seat list as the cap bars, so the GCI tile can never exceed the sum
     of the rows underneath it. */
  const scorecard = seats
    .map(u => {
      const own = contacts.filter(c => c.owner_id === u.id);
      const openMine = openRows.filter(r => r.c.owner_id === u.id);
      const closedMine = closedYtd.filter(t => t.owner_id === u.id);
      let held = 0;
      own.forEach(c => (c.appointments || []).forEach(a => {
        if (!a || !apptCounts(a.type, settings) || a.status !== 'held') return;
        const at = String(a.at || '').slice(0, 10);
        if (isDate(at) && at >= windowStart && at <= today) held++;
      }));
      const fell = txns.filter(t => t.owner_id === u.id && t.status === 'fell').length;

      /* VOLUME is the sale price of what closed — the number agents actually
         quote each other, and the one GCI hides: GCI depends on the split, and
         two agents on different splits close the same house for different GCI.

         AVERAGE PRICE divides volume by the number of closed TRANSACTIONS, not
         by units. Units count sides, so a dual-agency deal is 2 units and 1
         house — dividing by units would halve the average price of every deal
         where the agent represented both sides. A transaction missing a price
         is left out of the average rather than counted as zero, which would
         drag it down for a data-entry gap. */
      const priced = closedMine.filter(t => Number(t.salePrice) > 0);
      const volume = sum(priced, t => Number(t.salePrice) || 0);

      /* FALL-THROUGH RATE over RESOLVED deals only — closed plus fell. Deals
         still under contract have not had their chance to fall yet, and
         including them would flatter whoever happens to have a full board this
         month. Null rather than 0 when nothing has resolved: a rate over no
         deals is not zero, it is unknown. */
      const resolved = closedMine.length + fell;

      return {
        user: u,
        open: openMine.length,
        weighted: sum(openMine, r => r.gross * r.prob),
        held,
        uc: txns.filter(t => t.owner_id === u.id && t.status === 'active').length,
        units: sum(closedMine, unitsOf),
        gci: sum(closedMine, txGross),
        fell,
        volume,
        avgPrice: priced.length ? Math.round(volume / priced.length) : null,
        unpricedClosed: closedMine.length - priced.length,
        fellRate: resolved > 0 ? fell / resolved : null,
        resolved,
        /* the SAME cap figure the bars above render — joined, not recomputed,
           so the two can never disagree about how far through a cap somebody is */
        cap: (capRows.find(r => r.user.id === u.id) || {}).prog || null,
      };
    })
    .sort((a, b) => b.gci - a.gci || b.units - a.units);

  /* ------------------------------------------------- follow-ups & hot leads
     Two lists, not one blended one. Twenty overdue follow-ups must not push the
     one contact who is about to sign off the bottom of the section. */
  const HOT = 0.65;
  const probOf = c => Number((stageOf(c.stage, settings) || {}).prob) || 0;
  const dueIds = {};
  const followDue = followDueList
    .map(c => {
      dueIds[c.id] = true;
      return { c, reason: 'due', days: daysUntil(c.nextActionDue, ctx.tz), hot: probOf(c) >= HOT };
    })
    .sort((a, b) => (a.days || 0) - (b.days || 0) || probOf(b.c) - probOf(a.c));
  const followHot = live
    .filter(c => !dueIds[c.id] && probOf(c) >= HOT)
    .map(c => ({
      c, reason: 'hot', hot: true,
      days: isDate(c.nextActionDue) ? daysUntil(c.nextActionDue, ctx.tz) : null,
      cold: isDate(c.lastTouch) ? -(daysUntil(c.lastTouch, ctx.tz) || 0) : null,
    }))
    .sort((a, b) => probOf(b.c) - probOf(a.c) || (b.cold || 0) - (a.cold || 0));
  const followups = { due: followDue, hot: followHot, total: followDue.length + followHot.length };

  return { settings, stages, phases, byId, due, pipeline, capRows, activity, txsummary, funnel, sources, sourceTotals, scorecard, followups, hotThreshold: HOT };
}

/* ====================================================== 1. critical dates
   Only the next two render on the dashboard. Everything else sits behind one
   summary box, because an agent with fifteen live deadlines was getting a
   dashboard that was nothing but this card. The box still has to earn its place
   on the daily driver, so it carries the counts and the very next date rather
   than just saying "see more". */
function DatesSection({ ctx, m }) {
  const [drill, setDrill] = useState(false);
  const { rows, overdue, hard, hardHours, activeCount } = m.due;

  const INLINE = 2;
  const shown = rows.slice(0, INLINE);
  const rest = rows.slice(INLINE);
  const restOverdue = rest.filter(r => r.urg === 'overdue').length;
  const restHard = rest.filter(r => r.hard).length;
  const next = rest[0];

  const card = r => <DeadlineCard key={r.id} r={r} ctx={ctx} hardHours={hardHours} />;

  return (
    <>
      <Card
        title="Critical dates due"
        sub={activeCount
          ? `Every unmet deadline on your ${activeCount} active transaction${activeCount === 1 ? '' : 's'}, soonest first.`
          : 'No active transactions yet.'}
        right={
          <div style={{ display: 'flex', gap: 6 }}>
            {overdue > 0 && <Pill color="${BRAND.colors.red}">{overdue} overdue</Pill>}
            {hard > 0 && <Pill color="${BRAND.colors.gold}">{hard} inside {hardHours}h</Pill>}
          </div>
        }
      >
        {!rows.length && (
          <Empty>
            Nothing is due. Every deadline on your active transactions is met, waived, or has no date yet.
          </Empty>
        )}

        {!!rows.length && <div className="cd-list">{shown.map(card)}</div>}

        {rest.length > 0 && (
          <button type="button" className="cd-more" onClick={() => setDrill(true)}>
            <span className="cd-more-n">+{rest.length}</span>
            <span className="cd-more-t">
              <b>{rest.length} more deadline{rest.length === 1 ? '' : 's'}</b>
              <span>
                {next ? <>next up: {next.dl.label || next.dl.key} · {fmtShort(next.iso)}</> : null}
              </span>
            </span>
            <span className="cd-more-p">
              {restOverdue > 0 && <span className="cd-flag" style={{ background: '#FDECEC', color: '#B03030' }}>{restOverdue} overdue</span>}
              {restHard > 0 && <span className="cd-flag">{restHard} inside {hardHours}h</span>}
            </span>
            <ArrowRight size={16} className="cd-more-a" />
          </button>
        )}

        {!!rows.length && <LegalNote />}
      </Card>

      {drill && (
        <Drill
          title="Every deadline due"
          sub={`${rows.length} unmet across ${activeCount} active transaction${activeCount === 1 ? '' : 's'}, soonest first`}
          onClose={() => setDrill(false)}
        >
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            {overdue > 0 && <Pill color="${BRAND.colors.red}">{overdue} overdue</Pill>}
            {hard > 0 && <Pill color="${BRAND.colors.gold}">{hard} inside {hardHours}h</Pill>}
            <Btn sm kind="g" style={{ marginLeft: 'auto' }} onClick={() => { setDrill(false); ctx.go('transactions', { focus: 'dates' }); }}>
              Open the full board
            </Btn>
          </div>
          <div className="cd-list">{rows.map(card)}</div>
          <LegalNote />
        </Drill>
      )}
    </>
  );
}

/** one deadline, rendered the same on the dashboard and inside the drill */
function DeadlineCard({ r, ctx, hardHours }) {
  return (
    <div
      className={`cd${r.urg === 'overdue' ? ' overdue' : r.urg === 'urgent' ? ' urgent' : ''}`}
      style={{ cursor: 'pointer' }}
      onClick={() => ctx.go('transactions', { open: r.txn.id, deadline: r.dl.key })}
      title={r.dl.explain || ''}
    >
      <div className="cd-top">
        <div className="cd-name">
          {r.dl.label || r.dl.key}
          <div style={{ fontSize: 12, fontWeight: 500, color: '#8E89A8', marginTop: 3 }}>
            {r.txn.address || 'Address not set'}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="cd-date" style={{ color: r.urg === 'overdue' ? '#B03030' : BRAND.colors.ink }}>
            {fmtShort(r.iso)}
          </div>
          <div style={{ fontSize: 11, color: '#8E89A8' }}>{fmtLong(r.iso)}</div>
        </div>
        <span className="cd-when" style={WHEN_STYLE[r.urg] || WHEN_STYLE.none}>
          {whenWords(r.days)}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginTop: 8 }}>
        <span className="cd-count">{r.dl.count === 'business' ? 'business days' : 'calendar days'}</span>
        {r.hard && <span className="cd-flag"><AlertTriangle size={10} style={{ verticalAlign: -1 }} /> inside {hardHours}h</span>}
        {r.extended && <span className="cd-flag" style={{ background: '#EEF0FA', color: BRAND.colors.indigo }}>extended</span>}
        {ctx.isLeader && r.txn.owner_id && ctx.users_by_id[r.txn.owner_id] && (
          <span className="cd-count" style={{ background: '#F1F2F8' }}>
            {ctx.users_by_id[r.txn.owner_id].name}
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 700, color: '#8E89A8', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          open <ArrowRight size={12} />
        </span>
      </div>

      {r.dl.rule && <div className="cd-rule">{r.dl.rule}</div>}
    </div>
  );
}
/* =================================================== 2. pipeline & production */
function PipelineSection({ ctx, m }) {
  const p = m.pipeline;
  const rateNote = p.rateAssumed
    ? `No forecast rate is configured (settings.forecastRate) — this uses ${p.rate}% of price.`
    : `Forecast uses the install's ${p.rate}% commission rate.`;

  return (
    <div>
      <SecTitle right={<span style={{ fontSize: 11.5, color: '#8E89A8' }}>{rateNote}</span>}>
        <TrendingUp size={14} /> Pipeline &amp; production
      </SecTitle>
      <div className="kgrid">
        <Kpi
          label="Open pipeline"
          value={p.openCount}
          d={p.openVolume > 0
            ? `${usd(p.openVolume)} of volume in play${p.excluded ? ` · ${p.excluded} already on the transactions board, not counted twice` : ''}`
            : 'no priced opportunities yet'}
          icon={<Filter size={13} />}
          onClick={() => ctx.go('pipeline')}
        />
        <Kpi
          variant="accent"
          label={<span title={rateNote}>Weighted forecast</span>}
          value={usd(p.weighted)}
          d={`${usd(p.openGross)} unweighted · ${p.rate}%${p.rateAssumed ? ' assumed' : ''} · open stages only`}
          icon={<Target size={13} />}
        />
        <Kpi
          variant="gold"
          label={`GCI closed ${p.year}`}
          value={usd(p.gciYtd)}
          d={p.volumeYtd > 0
            ? `${usd(p.volumeYtd)} closed volume · calendar year, by actual close date`
            : `nothing closed in calendar ${p.year} yet`}
        />
        <Kpi
          label={`Transactions closed ${p.year}`}
          value={p.closedCount}
          d={`${p.units} unit${p.units === 1 ? '' : 's'}${p.dualUnits ? ` — ${p.dualUnits} dual-agency deal${p.dualUnits === 1 ? '' : 's'} counted twice` : ' — a dual-agency deal counts twice'}`}
          icon={<CheckCircle2 size={13} />}
        />
        <Kpi
          variant="green"
          label="Under contract"
          value={p.ucCount}
          d={p.ucCount ? `${usd(p.ucGross)} of gross commission in flight` : 'nothing under contract'}
          onClick={() => ctx.go('transactions')}
        />
      </div>
      <div style={{ fontSize: 11.5, color: '#9b98ad', marginTop: 8 }}>
        Open pipeline, its volume and the forecast count only contacts in an open stage that do <b>not</b> already have a
        transaction — a deal on the board is counted under “Under contract”, and one that has closed is already in GCI.
        A deal that fell through puts its contact back in the forecast.
      </div>
    </div>
  );
}

/* ============================================================ 3. cap progress */
function CapSection({ ctx, m }) {
  const rows = m.capRows;
  return (
    <Card
      title={ctx.isLeader ? 'Cap progress — every seat' : 'Your cap progress'}
      sub={`${ctx.isLeader
        ? 'One bar per seat. Only dollars that actually went to the cap count — post-cap brokerage dollars are not cap credit.'
        : 'Only dollars that actually went to the cap count toward it.'} Each bar runs on that plan's CAP PERIOD, which is not the calendar year unless the plan says so — the GCI tile above is calendar ${m.pipeline.year}. Both use the actual close date.`}
    >
      {!rows.length && <Empty>No seats to show.</Empty>}

      {rows.map(r => {
        const g = r.prog;
        const noCap = !(g.cap > 0);
        return (
          <div key={r.user.id} className="cap-wrap" style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <b style={{ fontSize: 13.5 }}>{r.user.name || r.user.email || 'Seat'}</b>
              {r.user.active === false && <span className="pool-chip">inactive seat</span>}
              {g.period && <span style={{ fontSize: 11.5, color: '#8E89A8' }}>{g.period.label} cap period</span>}
              {g.capped && <Pill color="${BRAND.colors.green}">capped out</Pill>}
              <span style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 700, color: '#56527a' }}>
                {noCap ? 'no cap configured' : `${usd(g.paid)} of ${usd(g.cap)}`}
              </span>
            </div>

            <div className="cap-bar" style={{ marginTop: 7 }}>
              <div className={'cap-fill' + (g.capped ? ' done' : '')} style={{ width: `${Math.round(g.pct * 100)}%` }} />
            </div>

            <div className="cap-legend">
              <span>
                {noCap
                  ? `${g.count} closed this period — this plan keeps 100% with no cap`
                  : `${usd(g.paid)} paid to date · ${usd(g.remaining)} remaining · ${g.count} closed`}
              </span>
              <span>
                {noCap ? '—'
                  : g.capped ? 'cap met'
                    : g.projected ? `projected cap date ${fmtLong(g.projected)}`
                      : 'not on pace to cap this period'}
              </span>
            </div>

            {!noCap && !g.capped && !g.projected && g.paid === 0 && (
              <div style={{ fontSize: 11.5, color: '#9b98ad', marginTop: 4 }}>
                No cap dollars yet this period, so there is no pace to project from.
              </div>
            )}
          </div>
        );
      })}
    </Card>
  );
}

/* ======================================================= 4. activity & health */
function ActivitySection({ ctx, m }) {
  const a = m.activity;
  const c = a.apptToClose;
  /* the goal is an appointments-SET goal, so it is judged against the
     appointments in the window, not against how many of them were held */
  const goalMiss = a.goalForWindow > 0 && a.apptInWindow < a.goalForWindow;
  const goalNote = a.goalForWindow > 0
    ? `goal ${a.goalForWindow} — ${a.goalPerWeek} per agent per week × ${a.goalSeats} seat${a.goalSeats === 1 ? '' : 's'} × ${a.window} days`
    : '';
  return (
    <div>
      <SecTitle
        right={<span style={{ fontSize: 11.5, color: '#8E89A8' }}>
          {fmtShort(a.windowStart)} – {fmtShort(ctx.todayIso)}
        </span>}
      >
        <Activity size={14} /> Activity &amp; health — last {a.window} days
      </SecTitle>
      <div className="an-grid">
        <div className={'an-card' + (goalMiss ? ' warn' : '')}>
          <div className="an-l">Appointments in the window</div>
          <div className="an-v">{a.apptInWindow}</div>
          <div className="an-d">
            {`dated in the last ${a.window} days${a.apptUpcoming ? ` · ${a.apptUpcoming} booked ahead, not in this number` : ''}`}
            {goalNote && ` · ${goalNote}`}
          </div>
        </div>

        <div className="an-card">
          <div className="an-l">Appointments held</div>
          <div className="an-v">{a.apptHeld}</div>
          <div className="an-d">
            {a.apptInWindow
              ? `${pctOrDash(a.holdRate)} of the ${a.apptInWindow} dated in this window${a.apptNoShow ? ` · ${a.apptNoShow} no-show` : ''}`
              : 'nothing dated in this window'}
          </div>
        </div>

        <div className="an-card">
          <div className="an-l">Appointment to close</div>
          <div className="an-v">{c.rate == null ? '—' : pct(c.rate)}</div>
          <div className="an-d">
            {c.held
              ? `${c.closes} of ${c.held} held appointment${c.held === 1 ? '' : 's'} since ${fmtShort(c.from)} came before a close`
              : `no qualifying appointments held in ${c.year} — nothing to divide by`}
          </div>
        </div>

        <div className="an-card">
          <div className="an-l">Speed to first outbound touch</div>
          <div className="an-v">{a.speed == null ? '—' : `${Math.round(a.speed * 10) / 10}d`}</div>
          <div className="an-d">
            {a.speedN
              ? `median call, text or email · ${a.speedN} contact${a.speedN === 1 ? '' : 's'} · ${a.sameDay} same day${a.speedNone ? ` · ${a.speedNone} with no outbound touch logged` : ''}`
              : 'no outbound touch logged — notes do not count'}
          </div>
        </div>

        <div className={'an-card' + (a.followOverdue ? ' warn' : '')}>
          <div className="an-l">Follow-ups due</div>
          <div className="an-v">{a.followDue}</div>
          <div className="an-d">
            {a.followOverdue ? `${a.followOverdue} already overdue` : a.followDue ? 'all due today' : 'nothing outstanding'}
          </div>
        </div>

        <div className={'an-card' + (a.cold ? ' warn' : '')}>
          <div className="an-l">Prospects going cold</div>
          <div className="an-v">{a.cold}</div>
          <div className="an-d">
            no contact in {a.coldDays}+ days, of {a.liveCount} live prospect{a.liveCount === 1 ? '' : 's'}
            {a.coldPast ? ` · ${a.coldPast} past client${a.coldPast === 1 ? '' : 's'} excluded — they are on an annual cadence` : ''}
          </div>
        </div>
      </div>

      <div style={{ fontSize: 11.5, color: '#9b98ad', marginTop: 8 }}>
        An appointment record carries the date it is <i>for</i>, not the date it was booked, so a window can only select
        appointments that happened in it. Appointment to close counts only types marked as sales conversations in
        Settings, only ones marked held, and only when the appointment happened <b>before</b> the close it is credited
        with — over calendar {c.year}, the same window as the GCI tile.
        {c.held > 0 && c.closes === 0 && ' Nothing is credited yet: every close this year happened before its contact’s logged appointment, or that contact has none.'}
      </div>
    </div>
  );
}

/* ============================================ 5. transactions board summary */
function TxSummarySection({ ctx, m }) {
  const t = m.txsummary;
  return (
    <div>
      <SecTitle right={<span style={{ fontSize: 11.5, color: '#8E89A8' }}>{t.total} transaction{t.total === 1 ? '' : 's'} on the board</span>}>
        <LayoutGrid size={14} /> Transactions board
      </SecTitle>

      {!t.total && (
        <Card><Empty>No transactions yet. A contact that goes under contract lands here.</Empty></Card>
      )}

      {!!t.total && (
        <div className="kgrid">
          {t.tiles.map(tile => (
            <Kpi
              key={tile.key}
              label={tile.label}
              value={tile.n}
              d={tile.n ? (tile.terminal ? 'open the closed list' : 'open the board') : 'nothing here'}
              variant={tile.key === 'closed' && tile.n ? 'green' : ''}
              /* a terminal phase is NOT on the active board — sending it there
                 with a phase filter always landed on "Nothing under contract
                 right now". Terminal tiles open their own list instead. */
              onClick={() => ctx.go('transactions', tile.terminal ? { focus: 'closed' } : { phase: tile.key })}
            />
          ))}
          <Kpi
            label="Fell through"
            value={t.fell}
            icon={<CircleSlash size={13} />}
            d={t.fell
              ? `${usd(t.fellVolume)} of volume lost${t.worstFellPhase ? ` · most often at ${t.worstFellPhase}` : ''}`
              : 'none — keep it that way'}
            onClick={() => ctx.go('transactions', { focus: 'fell' })}
          />
        </div>
      )}
    </div>
  );
}

/* ======================================================== 6. conversion funnel */
function FunnelSection({ m }) {
  const rows = m.funnel;
  const top = rows.length ? rows[0].n : 0;
  return (
    <Card
      title="Conversion funnel"
      sub="Every row counts CONTACTS, all time. Cumulative — a contact that reached a later stage is counted at every stage before it, and a contact with a transaction record counts as having signed and been under contract. A lost contact is credited only for the appointments actually on its record."
    >
      {!top && <Empty>No contacts have reached an appointment yet, so there is no funnel to draw.</Empty>}

      {!!top && (
        <div className="funnel">
          <div className="fn-row fn-head">
            <span className="fn-l">Stage</span>
            <span />
            <span className="fn-c">#</span>
            <span className="fn-r">All</span>
            <span className="fn-r">Step</span>
          </div>

          {rows.map(r => {
            const weak = r.step != null && r.step < 0.4;
            return (
              <div className="fn-row" key={r.key} title={r.prev ? `${pctOrDash(r.step)} of ${r.prev}` : 'top of funnel'}>
                <span className="fn-l">{r.short}</span>
                <span className="fn-bar">
                  <div style={{ width: `${Math.max(2, Math.round(barPct(r.ofTop) * 100))}%`, background: r.color }} />
                </span>
                <span className="fn-c">{r.n}</span>
                <span className="fn-r">{pctOrDash(r.ofTop)}</span>
                <span className={'fn-r close' + (weak ? ' warn' : '')}>
                  {pctOrDash(r.step)}
                </span>
              </div>
            );
          })}

          <div className="fn-hint">
            <Clock size={12} />
            {rows[rows.length - 1].n} contact{rows[rows.length - 1].n === 1 ? '' : 's'} closed from {top} that reached an
            appointment — {pctOrDash(ratio(rows[rows.length - 1].n, top))} end to end, all time.
          </div>
        </div>
      )}
    </Card>
  );
}

/* ========================================================== 7. lead source ROI */
function SourceSection({ m }) {
  const rows = m.sources;
  const t = m.sourceTotals;
  const best = rows.length ? rows[0] : null;
  return (
    <Card
      title="Lead source ROI"
      sub={`Ranked by closed GCI, not lead count. A source that delivers fifty leads and no closings is a cost, not a channel. GCI and units are what closed in calendar ${t.year} — the same window as the GCI tile. Leads is every contact currently attributed to that source, whenever it arrived, so "per lead" mixes this year's dollars with the whole book.`}
      right={t.gci > 0 ? <Pill color="${BRAND.colors.green}">{usd(t.gci)} attributed in {t.year}</Pill> : null}
    >
      {!rows.length && <Empty>No contacts have a source recorded yet.</Empty>}

      {!!rows.length && (
        <div className="src-list">
          <div className="src-row src-head">
            <span className="src-name">Source</span>
            <span>Leads</span>
            <span>Units {t.year}</span>
            <span>GCI {t.year}</span>
            <span>Per lead</span>
          </div>

          {rows.map(r => {
            const dry = r.gci === 0 && r.leads >= 3;
            const win = best && r.source === best.source && r.gci > 0;
            return (
              <div className="src-row" key={r.source} title={r.volume ? `${usd(r.volume)} of closed volume` : 'no closed volume yet'}>
                <span className="src-name">{r.source}</span>
                <span>{r.leads}</span>
                <span>{r.units}</span>
                <span className={win ? 'src-hi' : dry ? 'src-lo' : ''}>{usd(r.gci)}</span>
                <span className={dry ? 'src-lo' : ''}>{r.leads ? usd(r.perLead) : '—'}</span>
              </div>
            );
          })}

          <div className="src-row" style={{ borderTop: '1px solid #EDEEF5', fontWeight: 700, marginTop: 4 }}>
            <span className="src-name">All sources</span>
            <span>{t.leads}</span>
            <span>{t.units}</span>
            <span>{usd(t.gci)}</span>
            <span>{t.leads ? usd(t.gci / t.leads) : '—'}</span>
          </div>
        </div>
      )}
    </Card>
  );
}

/* =========================================================== 8. team scorecard */
function ScorecardSection({ m }) {
  const rows = m.scorecard;
  return (
    <Card
      title="Team scorecard"
      sub={`Open pipeline (open stages, excluding contacts already on the transactions board), appointments held in the last ${m.activity.window} days, and closed production in calendar ${m.pipeline.year} by actual close date. A seat that has been deactivated but still owns closed deals stays on this table, so these rows always add up to the GCI tile. Fall-through is measured over RESOLVED deals only — closed plus fell — because a deal still under contract has not had its chance to fall. Average price divides by transactions rather than units, so representing both sides of one house does not halve it.`}
      right={<Pill color="${BRAND.colors.indigo}">team leader view</Pill>}
    >
      {!rows.length && <Empty>No active seats to compare.</Empty>}

      {!!rows.length && (
        <div className="tbl-wrap" style={{ boxShadow: 'none', border: '1px solid #EDEEF5' }}>
          <table className="tbl sc">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Open pipeline</th>
                <th>Weighted</th>
                <th>Appts held</th>
                <th>Under contract</th>
                <th>Closed units</th>
                <th>Closed volume</th>
                <th>Avg price</th>
                <th>Fell through</th>
                <th>Cap</th>
                <th>Closed GCI</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.user.id}>
                  <td>
                    <b>{r.user.name || r.user.email}</b>
                    {r.user.role === 'leader' && <span className="pool-chip" style={{ marginLeft: 7 }}>leader</span>}
                    {r.user.active === false && <span className="pool-chip" style={{ marginLeft: 7 }}>inactive</span>}
                  </td>
                  <td>{r.open}</td>
                  <td>{usd(r.weighted)}</td>
                  <td>{r.held}</td>
                  <td>{r.uc}</td>
                  <td>{r.units}</td>
                  <td>{r.volume > 0 ? usd(r.volume) : <span className="sc-none">—</span>}</td>
                  <td>
                    {r.avgPrice ? usd(r.avgPrice) : <span className="sc-none">—</span>}
                    {r.unpricedClosed > 0 && (
                      <div className="sc-sub" title="Closed transactions with no sale price recorded are left out of the average rather than counted as zero.">
                        {r.unpricedClosed} without a price
                      </div>
                    )}
                  </td>
                  <td>
                    {r.fellRate == null
                      ? <span className="sc-none">—</span>
                      : <span className={r.fellRate >= 0.25 ? 'sc-bad' : ''}>
                          {Math.round(r.fellRate * 100)}%
                          <div className="sc-sub">{r.fell} of {r.resolved} resolved</div>
                        </span>}
                  </td>
                  <td>
                    {r.cap && r.cap.cap > 0
                      ? <>
                          {Math.round(r.cap.pct * 100)}%
                          <div className="sc-sub">{usd(r.cap.remaining)} to go</div>
                        </>
                      : <span className="sc-none">no cap</span>}
                  </td>
                  <td><b>{usd(r.gci)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ fontSize: 11.5, color: '#9b98ad', marginTop: 10 }}>
        Agents never see this section — an agent's dashboard has no team numbers on it at all.
      </div>
    </Card>
  );
}

/* ==================================================== 9. follow-ups & hot leads */
function FollowupRow({ ctx, settings, r }) {
  const c = r.c;
  const overdue = r.reason === 'due' && r.days != null && r.days < 0;
  const cls = overdue ? 'hli bad' : r.reason === 'due' ? 'hli warn' : 'hli win';
  return (
    <div className={cls} style={{ cursor: 'pointer' }} onClick={() => ctx.go('contacts', { open: c.id })}>
      {overdue ? <AlertTriangle size={13} /> : r.reason === 'due' ? <Clock size={13} /> : <Flame size={13} />}
      <b style={{ fontWeight: 700 }}>{c.name}</b>
      <span style={{ color: '#8E89A8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {stageLabel(c.stage, c.side, settings)}
      </span>
      {r.reason === 'due' && r.hot && <Flame size={12} />}
      <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', whiteSpace: 'nowrap' }}>
        {c.nextAction && <span style={{ color: '#56527a' }}>{c.nextAction}</span>}
        <b>
          {r.reason === 'due'
            ? whenWords(r.days)
            : r.cold != null ? `${r.cold}d since contact` : 'no touch logged'}
        </b>
      </span>
    </div>
  );
}

function FollowupsSection({ ctx, m }) {
  const { due, hot, total } = m.followups;
  const [allDue, setAllDue] = useState(false);
  const [allHot, setAllHot] = useState(false);
  const settings = m.settings;
  const CAP = 8;

  return (
    <Card
      title="Follow-ups and hot leads"
      sub={`Anything due today or overdue, plus every contact in a stage worth ${pct(m.hotThreshold)} or better. Two lists, so a pile of overdue calls can never bury the deal that is about to sign.`}
      right={total ? <Pill color="${BRAND.colors.cobalt}">{total}</Pill> : null}
    >
      {!total && (
        <Empty>Nothing is due and nothing is hot. Enjoy it — then go set an appointment.</Empty>
      )}

      {!!due.length && (
        <div style={{ marginBottom: hot.length ? 16 : 0 }}>
          <div className="kgroup">Due now — {due.length}</div>
          <div className="hlist">
            {(allDue ? due : due.slice(0, CAP)).map(r => (
              <FollowupRow key={r.c.id} ctx={ctx} settings={settings} r={r} />
            ))}
          </div>
          {due.length > CAP && (
            <div style={{ marginTop: 10 }}>
              <Btn kind="s" sm onClick={() => setAllDue(x => !x)}>
                {allDue ? `Show the first ${CAP}` : `Show all ${due.length} due`}
              </Btn>
            </div>
          )}
        </div>
      )}

      {!!hot.length && (
        <div>
          <div className="kgroup">Hot — {hot.length}</div>
          <div className="hlist">
            {(allHot ? hot : hot.slice(0, CAP)).map(r => (
              <FollowupRow key={r.c.id} ctx={ctx} settings={settings} r={r} />
            ))}
          </div>
          {hot.length > CAP && (
            <div style={{ marginTop: 10 }}>
              <Btn kind="s" sm onClick={() => setAllHot(x => !x)}>
                {allHot ? `Show the first ${CAP}` : `Show all ${hot.length} hot`}
              </Btn>
            </div>
          )}
        </div>
      )}

      {!!total && !due.length && (
        <div style={{ fontSize: 11.5, color: '#9b98ad', marginTop: 10 }}>
          Nothing is due today or overdue.
        </div>
      )}
    </Card>
  );
}

/* ============================================================ layout plumbing */

/** the sections this user can be shown at all — leader-only ones vanish for agents */
/* Exported so the boundary can be ASSERTED rather than read. The scorecard
   carries GCI, volume and cap progress per agent — the money a coordinator is
   deliberately not shown and an agent has no business seeing about a
   colleague. isLeader is strictly role === 'leader' (App.jsx keeps a
   coordinator out of it on purpose), so this one filter is the whole control. */
export function allowedSections(isLeader) {
  return DASH_SECTIONS.filter(s => !s.leaderOnly || isLeader);
}

/**
 * Reconcile the saved order with the canonical list.
 * A key the install has never seen is inserted at its CANONICAL position, not
 * appended — otherwise a new build would push Critical Dates to the bottom of
 * every existing brokerage's dashboard, which is exactly the section that must
 * stay at the top.
 */
function reconcileOrder(saved, allowed) {
  const known = allowed.map(s => s.key);
  const out = (Array.isArray(saved) ? saved : []).filter((k, i, a) => known.includes(k) && a.indexOf(k) === i);
  known.forEach((k, ci) => {
    if (out.includes(k)) return;
    let at = 0;
    for (let j = ci - 1; j >= 0; j--) {
      const pos = out.indexOf(known[j]);
      if (pos >= 0) { at = pos + 1; break; }
    }
    out.splice(at, 0, k);
  });
  return out;
}

/* ==================================================================== view */
export default function Dashboard({ ctx }) {
  const [arranging, setArranging] = useState(false);
  const [draftOrder, setDraftOrder] = useState(null);
  const [draftHidden, setDraftHidden] = useState(null);
  const [dragKey, setDragKey] = useState(null);

  const settings = ctx.settings || {};
  const allowed = useMemo(() => allowedSections(ctx.isLeader), [ctx.isLeader]);
  const savedOrder = useMemo(() => reconcileOrder(settings.dashOrder, allowed), [settings.dashOrder, allowed]);
  const savedHidden = useMemo(
    () => (Array.isArray(settings.dashHidden) ? settings.dashHidden : []),
    [settings.dashHidden],
  );

  const order = arranging && draftOrder ? draftOrder : savedOrder;
  const hidden = arranging && draftHidden ? draftHidden : savedHidden;

  const m = useMemo(() => buildModel(ctx), [ctx]);

  const labelOf = key => {
    const s = DASH_SECTIONS.find(x => x.key === key);
    return (s && s.label) || key;
  };

  /* ------------------------------------------------------------ arranging */
  const startArrange = () => {
    setDraftOrder(savedOrder.slice());
    setDraftHidden(savedHidden.slice());
    setArranging(true);
  };
  const cancelArrange = () => {
    setArranging(false);
    setDraftOrder(null);
    setDraftHidden(null);
    setDragKey(null);
  };
  const saveArrange = async () => {
    const nextOrder = (draftOrder || savedOrder).slice();
    const nextHidden = (draftHidden || savedHidden).filter(k => nextOrder.includes(k));
    await ctx.saveSettings({ ...settings, dashOrder: nextOrder, dashHidden: nextHidden });
    setArranging(false);
    setDraftOrder(null);
    setDraftHidden(null);
    setDragKey(null);
  };
  const move = (i, dir) => {
    setDraftOrder(prev => {
      const next = (prev || savedOrder).slice();
      const j = i + dir;
      if (j < 0 || j >= next.length) return next;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };
  const dropOn = key => {
    if (!dragKey || dragKey === key) return;
    setDraftOrder(prev => {
      const next = (prev || savedOrder).slice();
      const from = next.indexOf(dragKey);
      const to = next.indexOf(key);
      if (from < 0 || to < 0) return next;
      next.splice(from, 1);
      next.splice(to, 0, dragKey);
      return next;
    });
    setDragKey(null);
  };
  const toggleHide = key => {
    setDraftHidden(prev => {
      const cur = prev || savedHidden;
      return cur.includes(key) ? cur.filter(k => k !== key) : [...cur, key];
    });
  };
  const resetArrange = () => {
    setDraftOrder(DASH_SECTIONS.filter(s => !s.leaderOnly || ctx.isLeader).map(s => s.key));
    setDraftHidden([]);
  };

  /* --------------------------------------------------------------- render */
  const renderSection = key => {
    switch (key) {
      case 'dates': return <DatesSection ctx={ctx} m={m} />;
      case 'pipeline': return <PipelineSection ctx={ctx} m={m} />;
      case 'cap': return <CapSection ctx={ctx} m={m} />;
      case 'activity': return <ActivitySection ctx={ctx} m={m} />;
      case 'txsummary': return <TxSummarySection ctx={ctx} m={m} />;
      case 'funnel': return <FunnelSection m={m} />;
      case 'source': return <SourceSection m={m} />;
      case 'scorecard': return ctx.isLeader ? <ScorecardSection m={m} /> : null;
      case 'followups': return <FollowupsSection ctx={ctx} m={m} />;
      default: return null;
    }
  };

  const live = order.filter(k => !hidden.includes(k));
  const hiddenCount = order.length - live.length;

  return (
    <div>
      {/* -------------------------------------------------------- toolbar */}
      <div className="dash-arrange">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#56527a' }}>
          <CalendarClock size={15} style={{ color: BRAND.colors.cobalt }} />
          {m.due.overdue > 0
            ? <b style={{ color: '#B03030' }}>{m.due.overdue} deadline{m.due.overdue === 1 ? '' : 's'} overdue.</b>
            : m.due.hard > 0
              ? <b style={{ color: '#A85B10' }}>{m.due.hard} deadline{m.due.hard === 1 ? '' : 's'} inside {m.due.hardHours} hours.</b>
              : <span>No deadline is overdue. {m.activity.followDue} follow-up{m.activity.followDue === 1 ? '' : 's'} due.</span>}
        </div>

        {ctx.isLeader && !arranging && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            {hiddenCount > 0 && (
              <span style={{ fontSize: 11.5, color: '#9b98ad' }}>
                {hiddenCount} section{hiddenCount === 1 ? '' : 's'} hidden
              </span>
            )}
            <Btn kind="s" sm icon={<Sliders size={13} />} onClick={startArrange}>Rearrange</Btn>
          </div>
        )}

        {ctx.isLeader && arranging && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11.5, color: '#9b98ad' }}>
              Your agents get this layout, minus the leader-only sections.
            </span>
            <Btn kind="s" sm onClick={resetArrange}>Reset</Btn>
            <Btn kind="s" sm onClick={cancelArrange}>Cancel</Btn>
            <Btn kind="p" sm onClick={saveArrange}>Save layout</Btn>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------- arrange mode */}
      {arranging && (
        <div>
          {order.map((key, i) => {
            const off = hidden.includes(key);
            return (
              <div
                key={key}
                className={'dsec' + (off ? ' off' : '') + (dragKey === key ? ' dragging' : '')}
                draggable
                onDragStart={() => setDragKey(key)}
                onDragEnd={() => setDragKey(null)}
                onDragOver={e => { if (dragKey) e.preventDefault(); }}
                onDrop={e => { e.preventDefault(); dropOn(key); }}
              >
                <div className="dsec-h">
                  <GripVertical size={14} className="dsec-grip" />
                  <span className="dsec-t">{labelOf(key)}</span>
                  {key === 'scorecard' && <span className="pool-chip">leader only</span>}
                  <div className="dsec-btns">
                    <button className="dsec-b" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                    <button className="dsec-b" onClick={() => move(i, 1)} disabled={i === order.length - 1} aria-label="Move down">↓</button>
                    <button className="dsec-b wide" onClick={() => toggleHide(key)}>{off ? 'Show' : 'Hide'}</button>
                  </div>
                </div>
                {!off && <div className="dsec-body">{renderSection(key)}</div>}
              </div>
            );
          })}
          <div style={{ fontSize: 11.5, color: '#9b98ad', marginTop: 4 }}>
            Nothing is saved until you press Save layout. Drag a section by its header, or use the arrows.
          </div>
        </div>
      )}

      {/* -------------------------------------------------------- live mode */}
      {!arranging && (
        <div>
          {live.map(key => {
            const body = renderSection(key);
            if (!body) return null;
            return <div key={key} style={{ marginBottom: 20 }}>{body}</div>;
          })}

          {!live.length && (
            <Card>
              <Empty>
                Every dashboard section is hidden.{' '}
                {ctx.isLeader ? 'Press Rearrange to turn some back on.' : 'Ask your team leader to turn one back on.'}
              </Empty>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
