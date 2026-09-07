/* ============================================================================
   Huddle.jsx — the Monday Huddle, carried over from the source repo and
   re-pointed at real estate.

   The one rule that makes this meeting work: THE NUMBERS ARE NOT TYPED. Every
   count on this screen is derived from ctx.contacts and ctx.transactions for
   the selected week, using dates.js for every date comparison, and each one can
   say which records it counted. A number somebody typed last Monday is a number
   nobody trusts by Wednesday.

   What is counted, and from what:
     appointments this week — appointments DATED inside the week whose type
                          counts as a real sales conversation
                          (settings.apptTypes), excluding cancelled ones. The
                          record has no "booked at" stamp, so this is
                          appointments that happened, not appointments booked.
     appointments held  — of those, status 'held'
     agreements signed  — the checklist item on the contact whose label mentions
                          an agreement, completed inside the week. Nothing in
                          the normal workflow ticks one, so when no agreement
                          date exists anywhere the tile falls back to a STANDING
                          count of contacts at or past the Agreement Signed
                          stage and says so on its own sub-label.
     went under contract— transactions whose effective date lands in the week
     closed             — transactions closed inside the week

   Overdue is measured against TODAY, never against the Monday on screen.
   Fell-through is shown when it happened, because a huddle that only counts
   wins is a sales meeting, not a review.

   Scope needs no filtering here: ctx.contacts and ctx.transactions are already
   scoped by the database, so an agent's numbers ARE their own numbers and a
   leader's are the team's. The only thing gated on ctx.isLeader is the
   per-agent breakdown, which is a layout decision — the rows are already there.
   ========================================================================== */

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  CalendarCheck, ChevronLeft, ChevronRight, Sparkles, Save, Plus, X, Trophy,
  AlertTriangle, Target, Users, ShieldOff, CalendarClock, Copy,
} from 'lucide-react';

import { Card, Btn, Inp, Txt, Empty, SecTitle, Pill, Spinner, ErrorNote, IconBtn, Tag } from '../components/ui';
import { addDays, dow, isDate, fmtLong, fmtShort, daysUntil, urgency, effectiveDateOf } from '../lib/dates';
import { apptCounts, checklistFor, stagesOf } from '../lib/settings';
import { computeCommission, agentPlan } from '../lib/commission';
import { usd } from '../lib/format';
import { apiPost } from '../lib/data';
import { closedOn, txGross } from '../lib/txn';
import { BRAND } from '../lib/brand';

/* a neutral plan: gross is plan-independent, but computeCommission wants one.
   Going through the engine means one definition of "gross" exists app-wide. */
/** gross on a transaction: the snapshot if there is one, else the engine.
    A deal closed by dragging it into the Closed column never writes a snapshot,
    and reading the snapshot alone reported those as $0 of GCI. */

/* ------------------------------------------------------------------ plumbing */

const AI_OFF = 'AI is not configured on this deployment — set ANTHROPIC_API_KEY in Vercel. The numbers, the lists and the critical dates below all still work.';

const REASONS = {
  not_configured: AI_OFF,
  bad_json: 'That came back malformed. Press Generate again — nothing was saved.',
  api_error: 'The AI service refused that request.',
  network: 'Could not reach the AI service.',
  timeout: 'The AI service did not answer in time. Try again.',
  bad_response: 'The server sent back something this screen could not read.',
};
const reasonText = j => (j && (REASONS[j.reason] || j.detail)) || 'That did not work.';

async function callAi(job, payload) {
  try {
    const r = await apiPost('/api/ai', { job, payload });
    const j = await r.json();
    return j && typeof j === 'object' ? j : { ok: false, reason: 'bad_response' };
  } catch (e) {
    return { ok: false, reason: 'not_configured', detail: String((e && e.message) || e) };
  }
}

const arr = v => (Array.isArray(v) ? v : []);

/** days-until, in words a human uses out loud. Never prints "in -1 days".
    Same wording as Dashboard.jsx so the two screens read alike. */
function whenWords(n) {
  if (n == null) return 'no date';
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return '1 day overdue';
  if (n < 0) return `${-n} days overdue`;
  return `in ${n} day${n === 1 ? '' : 's'}`;
}

/* ---------------------------------------------------------------- the week
   All week maths is dates.js plus string comparison on 'YYYY-MM-DD', which is
   safe because the format sorts lexicographically. No Date objects. */

/** the Monday on or before a date */
const mondayOf = iso => (isDate(iso) ? addDays(iso, -((dow(iso) + 6) % 7)) : iso);

const within = (iso, from, to) => {
  const d = String(iso || '').slice(0, 10);
  return !!d && isDate(d) && d >= from && d <= to;
};

/** checklist keys on a side that represent a signed agreement */
function agreementKeys(side, settings) {
  const sides = side === 'both' ? ['seller', 'buyer'] : [side === 'buyer' ? 'buyer' : 'seller'];
  const keys = [];
  sides.forEach(s => checklistFor(s, settings).forEach(i => {
    if (/agreement/i.test(String(i.label || i.key))) keys.push(i.key);
  }));
  return keys;
}

/** does anything in the book actually carry a dated agreement tick?
    Nothing in the normal workflow ticks one, so "agreements signed" was a
    permanent 0 sitting next to a funnel that said 15. When there are no dates
    to count, the tile falls back to a standing stage count and says so. */
function anyAgreementDates(contacts, settings) {
  return (contacts || []).some(c => {
    const cl = c.checklist || {};
    return agreementKeys(c.side, settings).some(k => cl[k] && isDate(String(cl[k].done || '').slice(0, 10)));
  });
}

/** contacts that have reached the `signed` stage — the standing fallback */
function atOrPastSigned(contacts, settings) {
  const stages = stagesOf(settings);
  const want = stages.findIndex(s => s.key === 'signed');
  if (want < 0) return [];
  return (contacts || []).filter(c => {
    const here = stages.findIndex(s => s.key === c.stage);
    if (here < 0) return false;
    const st = stages[here];
    if (st.lost) return false;
    return here >= want;
  });
}

/**
 * Every number on the screen, plus the records behind it so the leader can say
 * "which two?" and get an answer.
 */
export function weekNumbers(contacts, transactions, from, to, settings, opts) {
  const apptsSetList = [], apptsHeldList = [], signedList = [], ucList = [], closedList = [], fellList = [];
  const trackable = opts && opts.agreementDatesExist;

  (contacts || []).forEach(c => {
    (c.appointments || []).forEach(a => {
      if (!a || !within(a.at, from, to)) return;
      if (a.status === 'cancelled') return;
      if (!apptCounts(a.type, settings)) return;
      const row = { id: a.id, name: c.name, contact: c, at: a.at, type: a.type, status: a.status };
      apptsSetList.push(row);
      if (a.status === 'held') apptsHeldList.push(row);
    });
    const keys = agreementKeys(c.side, settings);
    const cl = c.checklist || {};
    keys.forEach(k => {
      const item = cl[k];
      if (item && within(item.done, from, to)) signedList.push({ id: `${c.id}-${k}`, name: c.name, contact: c, at: item.done, side: c.side });
    });
  });

  (transactions || []).forEach(t => {
    if (within(t.effectiveDate, from, to)) ucList.push({ id: t.id, txn: t, at: t.effectiveDate });
    /* closedOn() from lib/txn, not a local `t.closedActual || t.closeDate`.
       The local one skipped the normalisation the shared one applies, so the
       two screens agreed only for as long as every writer stored a plain
       YYYY-MM-DD. */
    const closedAt = closedOn(t);
    if (t.status === 'closed' && within(closedAt, from, to)) closedList.push({ id: t.id, txn: t, at: closedAt });
    if (t.status === 'fell' && within(t.fellAt, from, to)) fellList.push({ id: t.id, txn: t, at: t.fellAt });
  });

  /* Agreements signed: dated checklist ticks when this brokerage actually uses
     them, otherwise the standing count of contacts at or past the agreement
     stage. Which one is on screen is stated on the tile — a number whose
     definition is invisible is a number nobody trusts. */
  const standing = trackable ? null : atOrPastSigned(contacts, settings);

  return {
    apptsSet: apptsSetList.length,
    apptsHeld: apptsHeldList.length,
    agreementsSigned: trackable ? signedList.length : standing.length,
    agreementsAreStanding: !trackable,
    underContract: ucList.length,
    closed: closedList.length,
    fell: fellList.length,
    lists: {
      appts: apptsSetList, held: apptsHeldList, signed: trackable ? signedList : (standing || []),
      uc: ucList, closed: closedList, fell: fellList,
    },
  };
}

/**
 * The critical dates for the week on screen, plus anything already overdue.
 *
 * OVERDUE IS AGAINST TODAY, NOT AGAINST THE MONDAY ON SCREEN. Measuring it
 * against the selected week's Monday meant a deadline that passed on Thursday
 * read as "lands this week" in the header while its own chip said "in -1 days"
 * and the dashboard called it overdue. urgency() and daysUntil() both count
 * from today, so the header and the chip can no longer disagree.
 */
export function weekDates(transactions, weekOf, weekEnd, tz) {
  const out = [];
  (transactions || []).filter(t => t.status === 'active').forEach(t => {
    (t.deadlines || []).forEach(d => {
      if (!d || !d.date) return;
      if (d.status === 'waived' || d.status === 'met') return;
      const when = effectiveDateOf(d);
      const u = urgency(d, tz);
      const overdue = u === 'overdue';
      const inWeek = within(when, weekOf, weekEnd);
      if (!overdue && !inWeek) return;
      out.push({
        key: `${t.id}-${d.key}`, label: d.label, date: when, overdue, inWeek,
        property: t.address || t.id, txn: t, assignee: d.assignee,
        u, away: daysUntil(when, tz), rule: d.rule,
      });
    });
  });
  return out.sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

/** gross commission booked on the deals that closed in the week */
const closedGci = list => list.reduce((s, r) => s + txGross(r.txn), 0);

/* ------------------------------------------------------------------- pieces */

function Stat({ label, value, sub, prev }) {
  const delta = prev == null ? null : Number(value) - Number(prev);
  const cls = delta == null ? '' : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  return (
    <div className="hstat">
      <div className="hs-l">{label}</div>
      <div className="hs-v">
        {value}
        {delta != null && <span className={`dl ${cls}`}>{delta > 0 ? `+${delta}` : delta === 0 ? 'same' : delta}</span>}
      </div>
      {sub && <div className="hs-p">{sub}</div>}
    </div>
  );
}

/** one editable list: wins, misses, or focus */
function ListEdit({ title, icon, tone, items, onChange, placeholder, empty, suggestions, onUseSuggestion }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    onChange([...items, v]);
    setDraft('');
  };
  const remaining = (suggestions || []).filter(s => !items.includes(s));
  return (
    <Card title={title} right={icon}>
      {items.length === 0 && <Empty>{empty}</Empty>}
      {items.length > 0 && (
        <div className="hlist">
          {items.map((t, i) => (
            <div key={`${i}-${t.slice(0, 12)}`} className={`hli ${tone || ''}`}>
              <span style={{ flex: 1, whiteSpace: 'normal' }}>{t}</span>
              <button className="iconbtn" aria-label="Remove" onClick={() => onChange(items.filter((_, j) => j !== i))}><X size={13} /></button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'flex-start' }}>
        <div className="field" style={{ flex: 1 }}>
          <Inp value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
            placeholder={placeholder} />
        </div>
        <Btn sm kind="s" onClick={add} icon={<Plus size={13} />}>Add</Btn>
      </div>
      {remaining.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="hs-l" style={{ marginBottom: 6 }}>Drafted for you — click to keep</div>
          <div className="chips">
            {remaining.map((s, i) => (
              <button key={i} type="button" className="chip add" style={{ whiteSpace: 'normal', textAlign: 'left' }}
                onClick={() => onUseSuggestion(s)}>
                <Plus size={12} /> {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

/* ============================================================================
   the view
   ========================================================================== */

export default function Huddle({ ctx }) {
  const settings = ctx.settings || {};
  const thisMonday = mondayOf(ctx.todayIso);

  const saved = ctx.huddle || null;
  const [weekOf, setWeekOf] = useState(saved && isDate(saved.weekOf) ? saved.weekOf : thisMonday);
  const [wins, setWins] = useState(arr(saved && saved.wins));
  const [misses, setMisses] = useState(arr(saved && saved.misses));
  const [focus, setFocus] = useState(arr(saved && saved.focus));
  const [notes, setNotes] = useState((saved && saved.notes) || '');
  const [read, setRead] = useState((saved && saved.narrative && saved.narrative.read) || '');
  const [dirty, setDirty] = useState(false);

  const [suggest, setSuggest] = useState({ wins: [], misses: [], focus: [] });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [aiOn, setAiOn] = useState(null);
  const [showAgents, setShowAgents] = useState(true);

  /* the saved row arrives after the first render (App loads it async). Adopt it
     once, and never over the top of something the leader has started typing. */
  const loaded = useRef('');
  useEffect(() => {
    if (!ctx.huddle || dirty) return;
    const sig = JSON.stringify(ctx.huddle);
    if (loaded.current === sig) return;
    loaded.current = sig;
    const h = ctx.huddle;
    if (isDate(h.weekOf)) setWeekOf(h.weekOf);
    setWins(arr(h.wins)); setMisses(arr(h.misses)); setFocus(arr(h.focus));
    setNotes(h.notes || '');
    setRead((h.narrative && h.narrative.read) || '');
  }, [ctx.huddle, dirty]);

  useEffect(() => {
    let alive = true;
    (async () => { const j = await callAi('probe', {}); if (alive) setAiOn(!!(j && j.ok)); })();
    return () => { alive = false; };
  }, []);

  const touch = useCallback(fn => (...a) => { setDirty(true); fn(...a); }, []);

  const weekEnd = addDays(weekOf, 6);
  const prevStart = addDays(weekOf, -7);
  const prevEnd = addDays(weekOf, -1);

  /* whether agreement ticks are trackable at all is a property of the BOOK, not
     of the week on screen, so it is decided once and passed to both weeks */
  const agreementDatesExist = useMemo(
    () => anyAgreementDates(ctx.contacts, settings), [ctx.contacts, settings]);
  const wkOpts = useMemo(() => ({ agreementDatesExist }), [agreementDatesExist]);

  const num = useMemo(() => weekNumbers(ctx.contacts, ctx.transactions, weekOf, weekEnd, settings, wkOpts),
    [ctx.contacts, ctx.transactions, weekOf, weekEnd, settings, wkOpts]);
  const prev = useMemo(() => weekNumbers(ctx.contacts, ctx.transactions, prevStart, prevEnd, settings, wkOpts),
    [ctx.contacts, ctx.transactions, prevStart, prevEnd, settings, wkOpts]);

  /* --------------------------------------------------------- critical dates */
  const dates = useMemo(() => weekDates(ctx.transactions, weekOf, weekEnd, ctx.tz),
    [ctx.transactions, weekOf, weekEnd, ctx.tz]);

  /* ------------------------------------------------------ per-agent (leader)
     Same seat rule as the dashboard and Commission: a deactivated seat that
     still owns deals keeps its row, or the totals stop adding up. */
  const perAgent = useMemo(() => {
    if (!ctx.isLeader) return [];
    const owners = new Set((ctx.transactions || []).map(t => t.owner_id).filter(Boolean));
    return (ctx.users || []).filter(u => u.active !== false || owners.has(u.id)).map(u => {
      const cs = (ctx.contacts || []).filter(c => c.owner_id === u.id);
      const ts = (ctx.transactions || []).filter(t => t.owner_id === u.id);
      const w = weekNumbers(cs, ts, weekOf, weekEnd, settings, wkOpts);
      return {
        user: u, ...w,
        active: ts.filter(t => t.status === 'active').length,
        gci: closedGci(w.lists.closed),
      };
    }).sort((a, b) => (b.closed - a.closed) || (b.underContract - a.underContract) || (b.apptsHeld - a.apptsHeld));
  }, [ctx.isLeader, ctx.users, ctx.contacts, ctx.transactions, weekOf, weekEnd, settings, wkOpts]);

  /* ------------------------------------------------------------------- goals */
  const goals = settings.goals || {};
  const gci = closedGci(num.lists.closed);

  /* -------------------------------------------------------------- generate */
  const gen = async () => {
    setBusy(true); setErr('');
    const j = await callAi('huddle', {
      weekOf, team: (ctx.account && ctx.account.name) || '',
      scope: ctx.isLeader ? 'the whole team' : `${(ctx.me && ctx.me.name) || 'this agent'} only`,
      apptsSet: num.apptsSet, apptsHeld: num.apptsHeld, agreementsSigned: num.agreementsSigned,
      underContract: num.underContract, closed: num.closed,
      goals: { appointmentsPerWeek: goals.apptsPerWeek || null, closingsPerMonth: goals.closingsPerMonth || null },
      perAgent: perAgent.map(a => ({
        name: a.user.name, apptsSet: a.apptsSet, apptsHeld: a.apptsHeld,
        agreementsSigned: a.agreementsSigned, underContract: a.underContract, closed: a.closed, active: a.active,
      })),
      dates: dates.map(d => ({ label: d.label, date: fmtLong(d.date), property: d.property, status: d.overdue ? 'overdue' : 'open', daysAway: d.away })),
      overdue: dates.filter(d => d.overdue).map(d => `${d.label} on ${d.property} was due ${fmtLong(d.date)}`),
      openItems: [
        ...num.lists.uc.map(r => `Under contract this week: ${r.txn.address || r.txn.id}`),
        ...num.lists.fell.map(r => `Fell through: ${r.txn.address || r.txn.id}${r.txn.fellReason ? ` — ${r.txn.fellReason}` : ''}`),
        ...num.lists.appts.filter(r => r.status === 'noshow').map(r => `No-show: ${r.name}`),
      ],
      wins, misses, notes,
    });
    setBusy(false);
    if (!j.ok) { setErr(reasonText(j)); if (j.reason === 'not_configured') setAiOn(false); return; }
    setDirty(true);
    setRead(j.read || '');
    setSuggest({ wins: arr(j.wins), misses: arr(j.misses), focus: arr(j.focus) });
  };

  const save = () => {
    ctx.saveHuddle({
      ...(ctx.huddle || {}),
      weekOf, wins, misses, focus, notes,
      numbers: {
        apptsSet: num.apptsSet, apptsHeld: num.apptsHeld, agreementsSigned: num.agreementsSigned,
        underContract: num.underContract, closed: num.closed, fell: num.fell, gci,
      },
      narrative: read ? { read, at: ctx.todayIso, by: ctx.me ? ctx.me.id : null } : null,
      savedAt: ctx.todayIso,
    });
    setDirty(false);
    ctx.flash('Huddle saved.');
  };

  const agenda = useMemo(() => [
    `MONDAY HUDDLE — week of ${fmtLong(weekOf)}`,
    '',
    `Appointments dated this week ${num.apptsSet} · held ${num.apptsHeld} · agreements signed ${num.agreementsSigned}${num.agreementsAreStanding ? ' (standing count, at or past Agreement Signed)' : ''} · under contract ${num.underContract} · closed ${num.closed}${num.fell ? ` · fell through ${num.fell}` : ''}`,
    '',
    read ? `${read}\n` : '',
    wins.length ? 'Wins:' : '', ...wins.map(w => `  · ${w}`),
    misses.length ? 'Misses:' : '', ...misses.map(w => `  · ${w}`),
    focus.length ? 'Focus this week:' : '', ...focus.map(w => `  · ${w}`),
    '',
    dates.length ? 'Dates that land this week:' : 'No critical dates land this week.',
    ...dates.map(d => `  ${fmtLong(d.date)} — ${d.label} — ${d.property}${d.overdue ? ' (OVERDUE)' : ''}`),
    notes ? `\nNotes:\n${notes}` : '',
  ].filter(x => x !== '').join('\n'), [weekOf, num, read, wins, misses, focus, dates, notes]);

  const copyAgenda = () => {
    const done = () => ctx.flash('Agenda copied.');
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(agenda).then(done, () => ctx.flash('Could not copy.')); return; }
    } catch { /* falls through */ }
    ctx.flash('Could not copy — select the agenda and copy it by hand.');
  };

  const isThisWeek = weekOf === thisMonday;
  const savedWeek = saved && isDate(saved.weekOf) ? saved.weekOf : null;
  const totalAppts = num.apptsSet;
  const heldRate = num.apptsSet ? Math.round((num.apptsHeld / num.apptsSet) * 100) : null;

  return (
    <div>
      {/* ------------------------------------------------------------- header */}
      <div className="hud-top">
        <div>
          <div className="hud-t">Week of {fmtLong(weekOf)}</div>
          <div className="hud-d">
            {fmtShort(weekOf)} – {fmtShort(weekEnd)}
            {isThisWeek ? ' · this week' : ''}
            {' · '}{ctx.isLeader ? 'the whole team' : 'your numbers'}
            {' · counted from your records, not typed'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <IconBtn aria-label="Previous week" onClick={() => { setWeekOf(w => addDays(w, -7)); }}><ChevronLeft size={16} /></IconBtn>
          <IconBtn aria-label="Next week" onClick={() => { setWeekOf(w => addDays(w, 7)); }}><ChevronRight size={16} /></IconBtn>
          {!isThisWeek && <Btn sm onClick={() => setWeekOf(thisMonday)} icon={<CalendarCheck size={13} />}>This week</Btn>}
          <Btn sm onClick={copyAgenda} icon={<Copy size={13} />}>Copy the agenda</Btn>
          <Btn kind="p" sm onClick={save} icon={<Save size={14} />}>{dirty ? 'Save the huddle' : 'Saved'}</Btn>
        </div>
      </div>

      {savedWeek && savedWeek !== weekOf && (
        <div className="note" style={{ marginBottom: 14 }}>
          <b>You are looking at the week of {fmtLong(weekOf)}.</b> The saved huddle is the week of {fmtLong(savedWeek)}.
          The numbers and dates below are for the week on screen; saving replaces the stored huddle with this one.
        </div>
      )}

      {aiOn === false && <div className="ai-banner ai-off"><ShieldOff size={14} /> {AI_OFF}</div>}

      {/* ------------------------------------------------------------ numbers */}
      <div className="hstats">
        <Stat label="Appointments this week" value={num.apptsSet} prev={prev.apptsSet}
          sub={`dated Mon–Sun${goals.apptsPerWeek ? ` · goal ${goals.apptsPerWeek} an agent` : ''}`} />
        <Stat label="Appointments held" value={num.apptsHeld} prev={prev.apptsHeld}
          sub={heldRate == null ? 'none dated this week' : `${heldRate}% of the ${num.apptsSet} dated this week`} />
        <Stat label="Agreements signed" value={num.agreementsSigned}
          prev={num.agreementsAreStanding ? null : prev.agreementsSigned}
          sub={num.agreementsAreStanding
            ? 'standing count — at or past Agreement Signed. No agreement checklist dates are ticked anywhere, so there is nothing weekly to count.'
            : 'listing + buyer agreement checklist items ticked this week'} />
        <Stat label="Went under contract" value={num.underContract} prev={prev.underContract} sub="by effective date" />
        <Stat label="Closed" value={num.closed} prev={prev.closed} sub={gci ? `${usd(gci)} gross commission` : 'nothing closed this week'} />
        {(num.fell > 0 || prev.fell > 0) && <Stat label="Fell through" value={num.fell} prev={prev.fell} sub="an outcome, not a deletion" />}
      </div>

      {totalAppts === 0 && num.underContract === 0 && num.closed === 0
        && (num.agreementsAreStanding || num.agreementsSigned === 0) && (
        <div className="hud-empty">
          <CalendarCheck size={26} />
          <b>Nothing landed in this week</b>
          <span>
            No appointments, agreements, contracts or closings dated {fmtShort(weekOf)}–{fmtShort(weekEnd)}. If that is
            wrong, the dates on the records are wrong — appointments count off their date, agreements off the checklist
            item, contracts off the effective date. Use ‹ › above to look at another week.
          </span>
        </div>
      )}

      {/* ----------------------------------------------------------- the read */}
      <Card title="The read"
        sub="Generated from the numbers on this screen, then edited by whoever runs the meeting. It saves with the huddle."
        right={<Tag>{read ? 'draft on file' : 'not written yet'}</Tag>}>
        {aiOn === false
          ? <div className="ai-note">No AI on this deployment — write the read yourself in the box below. It saves the same way.</div>
          : (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
              <Btn kind="p" onClick={gen} disabled={busy} icon={busy ? <Spinner /> : <Sparkles size={15} />}>
                {busy ? 'Reading the week…' : read ? 'Write it again' : 'Write the read'}
              </Btn>
              <span style={{ fontSize: 12, color: '#8E89A8' }}>
                It sees the counts, the per-agent rows{ctx.isLeader ? '' : ' for you'}, the dates that land this week and
                anything you have already put in the lists. Nothing saves until you press Save.
              </span>
            </div>
          )}
        <ErrorNote>{err}</ErrorNote>
        <div className="field">
          <Txt rows={6} value={read} onChange={e => { setDirty(true); setRead(e.target.value); }}
            placeholder="Where the week actually landed, and what it means for this one." />
        </div>
        {read && (
          <div className="hud-brief" style={{ marginTop: 14, marginBottom: 0 }}>
            <div className="hb-head">Week of {fmtLong(weekOf)}</div>
            <p className="hb-read">{read}</p>
            <div className="hb-when">
              {num.apptsSet} set · {num.apptsHeld} held · {num.agreementsSigned} signed · {num.underContract} under contract · {num.closed} closed
            </div>
          </div>
        )}
      </Card>

      {/* --------------------------------------------------------- the lists */}
      <div className="grid2" style={{ marginTop: 16 }}>
        <ListEdit title="Wins" icon={<Trophy size={15} style={{ color: BRAND.colors.green }} />} tone="win"
          items={wins} onChange={touch(setWins)} suggestions={suggest.wins}
          onUseSuggestion={s => { setDirty(true); setWins(w => [...w, s]); }}
          placeholder="Central Park cleared to close three days early"
          empty="Nothing logged yet. One line per win, named." />
        <ListEdit title="Misses" icon={<AlertTriangle size={15} style={{ color: BRAND.colors.red }} />} tone="bad"
          items={misses} onChange={touch(setMisses)} suggestions={suggest.misses}
          onUseSuggestion={s => { setDirty(true); setMisses(m => [...m, s]); }}
          placeholder="Two pool leads sat unclaimed for a fortnight"
          empty="Nothing logged yet. A huddle with no misses is a huddle nobody is being honest in." />
      </div>

      <div style={{ marginTop: 16 }}>
        <ListEdit title="Focus this week" icon={<Target size={15} style={{ color: BRAND.colors.cobalt }} />} tone="warn"
          items={focus} onChange={touch(setFocus)} suggestions={suggest.focus}
          onUseSuggestion={s => { setDirty(true); setFocus(f => [...f, s]); }}
          placeholder="Chase the financing commitment on Osage — 21 days out"
          empty="Nothing set yet. Two or three things, concrete enough to do today." />
      </div>

      {/* ------------------------------------------------------ the deadlines */}
      <SecTitle right={<span style={{ fontSize: 11.5, color: '#8E89A8', textTransform: 'none', letterSpacing: 0 }}>
        {dates.filter(d => d.overdue).length} overdue as of today · {dates.filter(d => !d.overdue && d.inWeek).length} still to land this week
      </span>}>
        <CalendarClock size={14} /> Dates that land this week
      </SecTitle>
      {dates.length === 0
        ? <Empty>No unmet critical dates fall inside {fmtShort(weekOf)}–{fmtShort(weekEnd)} on any active transaction, and nothing is overdue as of today. Nothing to walk out of the room unaware of.</Empty>
        : (
          <div className="grid3">
            {dates.map(d => (
              <div key={d.key} className={'cd' + (d.overdue ? ' overdue' : d.u === 'urgent' ? ' urgent' : '')}>
                <div className="cd-top">
                  <span className="cd-name">{d.label}</span>
                  <span className="cd-date">{fmtShort(d.date)}</span>
                </div>
                <div className="cd-stamp">{d.property}</div>
                <div className="cd-acts">
                  <span className="cd-when" style={d.overdue
                    ? { background: '#FDECEC', color: '#B03030' }
                    : d.u === 'urgent' ? { background: '#FFF3E6', color: '#A85B10' } : { background: '#EEF0FA', color: '#5A5680' }}>
                    {whenWords(d.away)}
                  </span>
                  {d.assignee && ctx.users_by_id[d.assignee] && <span className="cd-count">{ctx.users_by_id[d.assignee].name}</span>}
                </div>
                {d.rule && <div className="cd-rule">{d.rule}</div>}
              </div>
            ))}
          </div>
        )}
      <div className="legal-note">
        Dates as computed by the CRM from the effective and closing dates on each transaction. Read against the contract
        before you act on one — this is arithmetic, not legal advice.
      </div>

      {/* ------------------------------------------------------- per agent */}
      {ctx.isLeader && (
        <>
          <SecTitle right={<Btn sm onClick={() => setShowAgents(s => !s)}>{showAgents ? 'Hide' : 'Show'}</Btn>}>
            <Users size={14} /> Per agent, this week
          </SecTitle>
          {showAgents && (perAgent.length === 0
            ? <Empty>No active seats to break down.</Empty>
            : (
              <div className="tbl-wrap">
                <table className="tbl sc">
                  <thead>
                    <tr>
                      <th>Agent</th><th>Appts set</th><th>Held</th><th>Agreements</th>
                      <th>Under contract</th><th>Closed</th><th>GCI closed</th><th>Active deals</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perAgent.map(a => (
                      <tr key={a.user.id}>
                        <td>
                          <b>{a.user.name}</b>
                          {a.user.role === 'leader' && <span style={{ fontSize: 11, color: '#8E89A8' }}> · team leader</span>}
                        </td>
                        <td>{a.apptsSet}</td>
                        <td>{a.apptsHeld}{a.apptsSet > 0 && a.apptsHeld < a.apptsSet ? <span style={{ color: '#8E89A8', fontSize: 11.5 }}> of {a.apptsSet}</span> : null}</td>
                        <td>{a.agreementsSigned}</td>
                        <td>{a.underContract}</td>
                        <td>{a.closed}</td>
                        <td>{a.gci ? usd(a.gci) : '—'}</td>
                        <td>{a.active}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          <div className="ai-note">
            Counted the same way as the totals above, per owner. Commission shown is the gross snapshotted when the deal
            closed — an agent's own split and cap live in Commission.
          </div>
        </>
      )}

      {/* ------------------------------------------------------------- notes */}
      <Card title="Notes from the room" sub="Anything said in the meeting that should still be here next Monday." style={{ marginTop: 16 }}>
        <div className="field">
          <Txt rows={4} value={notes} onChange={e => { setDirty(true); setNotes(e.target.value); }}
            placeholder="Price review on Farrah Nsubuga hits 14 days on Thursday." />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <Btn kind="p" onClick={save} icon={<Save size={14} />}>Save the huddle</Btn>
          {dirty
            ? <Pill color="#D98A3D">unsaved changes</Pill>
            : <span style={{ fontSize: 12, color: '#8E89A8' }}>{saved && saved.savedAt ? `Last saved ${fmtLong(saved.savedAt)}.` : 'Nothing saved yet.'}</span>}
        </div>
      </Card>

      <div className="ai-note" style={{ marginBottom: 24 }}>
        The read is written by Claude Sonnet from the counts on this screen and nothing else — it never sees your
        database, and the API key lives only in the serverless route.
      </div>
    </div>
  );
}
