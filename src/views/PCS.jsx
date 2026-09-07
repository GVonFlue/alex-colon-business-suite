/* ============================================================================
   PCS.jsx — military relocation, the thing Dwell is actually known for.

   THE ONE RULE THIS SCREEN IS BUILT AROUND
   ----------------------------------------
   A PCS is driven by the ORDERS, not by a contract. The anchor is the REPORT
   DATE (RNLTD — "report no later than date"), which exists months before there
   is ever a property, and every step counts BACKWARDS from it. That is why
   settings.pcs.offsets are negative and anchored to 'report', and why this
   screen refuses to pretend a move starts when someone finds a house.

   THE LINE THIS SCREEN DOES NOT CROSS
   -----------------------------------
   It counts days and records what the member told us. It does NOT calculate
   BAH, decide TLE or DLA eligibility, or interpret a VA benefit. Those belong
   to the finance office and the lender, and getting them wrong costs a service
   member real money. settings.pcs.disclaimer says so and it is rendered
   wherever an entitlement is so much as mentioned. Nothing here is ever phrased
   as advice about what somebody is owed.

   Everything else follows the house rules:
     - all date arithmetic goes through src/lib/dates.js (cascade / computeDeadline)
     - the deadline row is the SAME component the contract deadlines use, so the
       met / waived / extended behaviour is the tested one
     - the board is the shared Board, so every card has ‹ › arrows for a phone
     - nothing filters for privacy: ctx.contacts is already scoped
     - drive time is a number the AGENT types. This app has no mapping service
       and never implies one.
   ========================================================================== */

import React, { useState, useMemo, useEffect } from 'react';
import {
  BarChart, Bar, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  ShieldCheck, AlertTriangle, CalendarClock, Users, Video, Plus, RefreshCw,
  CheckCircle2, Clock, FileText, ArrowRight, Trash2, Search,
} from 'lucide-react';

import {
  Card, Kpi, Btn, Pill, Tag, Field, Inp, Sel, Txt, Toggle, Seg,
  ModalShell, Board, Empty, SecTitle, LegalNote,
} from '../components/ui';
import { pcsOf, pcsOffsetsOf, DEFAULT_PCS, holidaysOf, rolloverOf } from '../lib/settings';
import {
  cascade, computeDeadline, effectiveDateOf, daysUntil, diffDays,
  fmtShort, fmtLong, isDate,
} from '../lib/dates';
import { initials, phoneFmt } from '../lib/format';
import { DeadlineRow } from './Transactions';
import { PCS_CSS } from './pcs.css.js';
import { alpha } from '../lib/color';
import { BRAND } from '../lib/brand';

/* ============================================================================
   plumbing — everything here is pure and lives above the components so the
   arithmetic can be read in one place.
   ========================================================================== */

const PALETTE = ['#6B73C9', '#5C76EE', BRAND.colors.cobalt, BRAND.colors.gold, BRAND.colors.green, '#2BA7A0', '#7A5CC8', '#B0606A'];

/** the anchor is spelled out in every rule and explanation this screen writes */
const ANCHOR_WORDS = 'report date';

/** a contact is on this board when it has been flagged, and only then */
export const isPcs = c => !!(c && c.pcs && c.pcs.isPcs);

/** days-until in words. Never renders "in nulld". */
const whenWords = n => {
  if (n == null) return 'no date';
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return '1 day ago';
  if (n < 0) return `${-n} days ago`;
  return `in ${n} days`;
};
const dayWord = n => `${n} day${Math.abs(n) === 1 ? '' : 's'}`;

/** inbound / outbound / separating, read off the configured move-type label.
    The move types are a SETTING, so this degrades to "no direction on file"
    rather than guessing at a label it does not recognise. */
export function directionOf(moveType) {
  const s = String(moveType || '').toLowerCase();
  if (!s) return { key: 'na', label: 'no move type' };
  if (/separat|retir|terminal/.test(s)) return { key: 'sep', label: 'separating' };
  if (/\bout\b|outbound|off-base|off base/.test(s)) return { key: 'out', label: 'outbound' };
  if (/\bin\b|inbound/.test(s)) return { key: 'in', label: 'inbound' };
  return { key: 'na', label: moveType };
}

/** the statuses, always a usable list even if a leader empties the setting */
const statusesOf = cfg => (cfg.statuses && cfg.statuses.length ? cfg.statuses : DEFAULT_PCS.statuses);
const remoteStepsOf = cfg => (cfg.remoteBuyerSteps && cfg.remoteBuyerSteps.length ? cfg.remoteBuyerSteps : DEFAULT_PCS.remoteBuyerSteps);
const bandsOf = cfg => ((cfg.installation && cfg.installation.commuteBands) || DEFAULT_PCS.installation.commuteBands || []);
const installOf = cfg => (cfg.installation || DEFAULT_PCS.installation || {});

/**
 * Re-label a cascaded step so it explains itself in PCS words.
 *
 * cascade() only knows two anchor names ('effective' / 'close'), so a step
 * anchored to 'report' comes back explaining itself as an effective date. The
 * fix is NOT to rewrite the sentence — it is to ask the same tested engine for
 * the same date with the right anchor label and take its wording. If the date
 * it returns is not the date on the record (a met step frozen against an older
 * report date), the old wording stands, because rewriting it would describe an
 * anchor that did not produce it.
 */
function relabel(d, o) {
  if (!d || !Number.isFinite(d.offset) || d.absolute || d.source === 'manual') return d;
  const c = computeDeadline({
    anchorDate: o.report, offset: d.offset, count: d.count, inclusive: d.inclusive,
    rollover: o.rollover, holidays: o.holidays, anchorLabel: ANCHOR_WORDS,
  });
  const src = d.source === 'default' ? 'pcs' : d.source;
  if (!c || c.date !== d.date) return d.source === src ? d : { ...d, source: src };
  return { ...d, source: src, rule: c.rule, explain: c.explain };
}

/**
 * Build or rebuild a family's timeline from the report date.
 *
 * This is the SAME cascade() the contract deadlines use — met, waived,
 * extended and hand-entered steps are left exactly where they are and the
 * caller is told what moved. Nothing about the arithmetic is re-implemented
 * here; the only PCS-specific part is the anchor wording.
 */
export function cascadePcs(prev, o) {
  const r = cascade(prev || [], {
    effective: o.report,
    closeDate: null,
    holidays: o.holidays,
    rollover: o.rollover,
    /* first build seeds from the settings list; after that the family's own
       steps are the spec, exactly as a transaction's own deadlines are.
       `force` re-reads the settings list, which is how a step added in
       Settings later reaches a family that already has a timeline. */
    offsets: (o.force || !(prev && prev.length)) ? o.offsets : null,
    assignee: o.assignee,
  });
  return { ...r, deadlines: r.deadlines.map(d => relabel(d, o)) };
}

/** the plan's rows for a report date, WITHOUT saving anything — used to show a
    family what the default plan would have wanted before they build it */
function previewSteps(o) {
  if (!isDate(o.report)) return [];
  return (o.offsets || []).map(spec => {
    const c = computeDeadline({
      anchorDate: o.report, offset: spec.offset, count: spec.count,
      inclusive: spec.inclusive, rollover: o.rollover, holidays: o.holidays, anchorLabel: ANCHOR_WORDS,
    });
    return c ? { key: spec.key, label: spec.label, date: c.date, offset: spec.offset, status: 'open' } : null;
  }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * THE COMPRESSION WARNING.
 *
 * How it decides, in one place, in plain terms:
 *
 *   needed  = the lead time the configured plan wants = the largest number of
 *             days any step sits BEFORE the report date (120 with the shipped
 *             defaults, because "orders in hand" is −120).
 *   have    = days from today to the report date.
 *   short   = needed − have. Positive means the move is compressed: the plan
 *             wanted more runway than this family has.
 *   behind  = the steps whose ideal date has ALREADY PASSED and which are not
 *             met, waived or extended. Those are the ones that are not "tight",
 *             they are gone, and the screen says so by name.
 *
 * No opinion, no colour-coded guesswork about whether it is achievable — it
 * reports the arithmetic and names the steps that are already in the past.
 * A family with no report date returns known:false and the screen asks for one
 * instead of inventing a number.
 */
export function compression(fam, o) {
  const p = (fam && fam.pcs) || {};
  const report = p.reportDate;
  if (!isDate(report)) return { known: false, report: null };

  const have = daysUntil(report, o.tz);
  const negs = (o.offsets || []).map(x => Number(x.offset)).filter(n => Number.isFinite(n) && n < 0);
  const needed = negs.length ? -Math.min(...negs) : 0;
  const short = needed - have;

  const rows = (p.steps && p.steps.length) ? p.steps : previewSteps(o);
  const openRows = rows.filter(s => s.status !== 'met' && s.status !== 'waived');
  const behind = openRows
    .filter(s => { const n = daysUntil(effectiveDateOf(s), o.tz); return n != null && n < 0; })
    .sort((a, b) => String(effectiveDateOf(a)).localeCompare(String(effectiveDateOf(b))));

  return {
    known: true, report, have, needed, short,
    compressed: short > 0,
    behind,
    built: !!(p.steps && p.steps.length),
    /* past the report date entirely — a different sentence, not a squeeze */
    reported: have < 0,
  };
}

/* month keys, from the ISO strings themselves. Integer month arithmetic on two
   numbers, never a Date object, so nothing can shift a bar by a timezone. */
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function monthKeys(fromIso, n) {
  let y = +String(fromIso).slice(0, 4), m = +String(fromIso).slice(5, 7);
  const out = [];
  for (let i = 0; i < n; i++) { out.push({ key: `${y}-${String(m).padStart(2, '0')}`, label: `${MON[m - 1]}${m === 1 || i === 0 ? ` ’${String(y).slice(2)}` : ''}` }); m++; if (m > 12) { m = 1; y++; } }
  return out;
}

/* ============================================================================
   the screen
   ========================================================================== */

export default function PCS({ ctx }) {
  const { contacts, settings, params } = ctx;
  const cfg = pcsOf(settings);
  const offsets = pcsOffsetsOf(settings);
  const statuses = statusesOf(cfg);
  const install = installOf(cfg);

  const [openId, setOpenId] = useState(params && params.open ? params.open : null);
  const [addOpen, setAddOpen] = useState(false);
  const [q, setQ] = useState('');
  const [dir, setDir] = useState('all');
  const [band, setBand] = useState('all');
  const [tightOnly, setTightOnly] = useState(false);

  useEffect(() => { if (params && params.open) setOpenId(params.open); }, [params]);

  const cascadeOpts = useMemo(() => ({
    offsets, holidays: holidaysOf(settings), rollover: rolloverOf(settings), tz: ctx.tz,
  }), [offsets, settings, ctx.tz]);

  const families = useMemo(() => contacts.filter(isPcs), [contacts]);
  const open = families.find(c => c.id === openId) || null;

  /* one compression read per family, computed once and reused by the tiles,
     the cards and the modal */
  const squeeze = useMemo(() => {
    const m = {};
    families.forEach(c => { m[c.id] = compression(c, { ...cascadeOpts, report: c.pcs.reportDate }); });
    return m;
  }, [families, cascadeOpts]);

  const shown = families.filter(c => {
    const p = c.pcs || {};
    if (q && !`${c.name} ${p.rank || ''} ${p.branch || ''} ${p.currentStation || ''} ${p.nextStation || ''}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (dir !== 'all' && directionOf(p.moveType).key !== dir) return false;
    if (band !== 'all' && String(p.commuteBand || '') !== String(band)) return false;
    if (tightOnly && !(squeeze[c.id] || {}).compressed) return false;
    return true;
  });

  const cols = statuses.map((s, i) => ({ key: s, label: s, color: PALETTE[i % PALETTE.length] }));
  const moveTo = (c, status) => ctx.upsertContact({ ...c, pcs: { ...(c.pcs || {}), status } });

  const colOf = c => {
    const s = (c.pcs || {}).status;
    return statuses.includes(s) ? s : statuses[0];
  };

  return (
    <>
      <style>{PCS_CSS}</style>

      <div className="pcs-lead">
        <h2>PCS &amp; relocation — {install.name || 'the installation'}</h2>
        <span>
          Every date on this screen counts backwards from the report date (RNLTD), because the orders come long
          before the house.
        </span>
      </div>

      <Disclaimer cfg={cfg} />

      <Rollup ctx={ctx} families={families} squeeze={squeeze} cfg={cfg} />

      <div className="toolbar">
        <Seg value={dir} onChange={setDir} options={[
          { value: 'all', label: 'Everyone', n: families.length },
          { value: 'in', label: 'Inbound', n: families.filter(c => directionOf(c.pcs.moveType).key === 'in').length },
          { value: 'out', label: 'Outbound', n: families.filter(c => directionOf(c.pcs.moveType).key === 'out').length },
          { value: 'sep', label: 'Separating', n: families.filter(c => directionOf(c.pcs.moveType).key === 'sep').length },
        ]} />
        <div className="searchbox">
          <Search size={16} style={{ color: '#928DAD', flex: 'none' }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Name, rank, branch, duty station…" />
        </div>
        <select className="selctl" value={band} onChange={e => setBand(e.target.value)}>
          <option value="all">Any drive-time band</option>
          {bandsOf(cfg).map(b => <option key={b} value={b}>within {b} min of {install.name || 'the base'}</option>)}
          <option value="">no band set</option>
        </select>
        <button className={'chip' + (tightOnly ? ' on' : '')} onClick={() => setTightOnly(v => !v)}>
          <AlertTriangle size={13} /> Compressed only
        </button>
        <span style={{ flex: 1 }} />
        <Btn kind="p" sm icon={<Plus size={14} />} onClick={() => setAddOpen(true)}>Flag a PCS family</Btn>
      </div>

      {families.length === 0 ? (
        <Empty>
          No PCS families flagged yet. Press <b>Flag a PCS family</b> to mark one of your contacts as a military
          move — you only need a report date to start the clock, and that arrives long before a property does.
        </Empty>
      ) : shown.length === 0 ? (
        <Empty>No PCS family matches those filters. Clear them to see all {families.length}.</Empty>
      ) : (
        <Board
          cols={cols}
          items={shown}
          colOf={colOf}
          onMove={moveTo}
          onOpen={c => setOpenId(c.id)}
          empty="—"
          card={c => <FamilyCard c={c} ctx={ctx} sq={squeeze[c.id]} />}
        />
      )}

      {band !== 'all' && (
        <div className="pcs-note">
          Filtered by the drive-time band <b>you</b> recorded on each family. This app has no mapping service and
          does not calculate drive times — the minutes are your own estimate, stored as your note.
        </div>
      )}

      {open && (
        <FamilyModal
          ctx={ctx} c={open} cfg={cfg} offsets={offsets} statuses={statuses}
          sq={squeeze[open.id]} onClose={() => setOpenId(null)}
        />
      )}
      {addOpen && <AddFamily ctx={ctx} cfg={cfg} statuses={statuses} onClose={() => setAddOpen(false)} onAdded={id => { setAddOpen(false); setOpenId(id); }} />}
    </>
  );
}

/* ------------------------------------------------------------- disclaimer */

function Disclaimer({ cfg, tight }) {
  const text = cfg.disclaimer || DEFAULT_PCS.disclaimer;
  return (
    <div className="pcs-disc" style={tight ? { margin: '10px 0 0' } : undefined}>
      <ShieldCheck size={14} />
      <span><b>Dates and checklists only.</b> {text.replace(/^Dates and checklists only\.\s*/i, '')}</span>
    </div>
  );
}

/* ---------------------------------------------------------------- roll-up */

function Rollup({ ctx, families, squeeze, cfg }) {
  const statuses = statusesOf(cfg);
  const last = statuses[statuses.length - 1];
  const live = families.filter(c => (c.pcs || {}).status !== last);
  const withDate = families.filter(c => isDate((c.pcs || {}).reportDate));
  const within = n => withDate.filter(c => { const d = daysUntil(c.pcs.reportDate, ctx.tz); return d != null && d >= 0 && d <= n; }).length;
  const remote = families.filter(c => (c.pcs || {}).remote).length;
  const inHand = families.filter(c => (c.pcs || {}).ordersInHand).length;
  const pending = families.length - inHand;
  /* a family whose report date has already gone by is not "compressed", it is
     finished or late — a different sentence, and not this tile's number */
  const tight = families.filter(c => { const s = squeeze[c.id] || {}; return s.compressed && !s.reported; }).length;

  const none = families.length === 0;
  const noDates = withDate.length === 0;

  const months = monthKeys(ctx.todayIso, 12);
  const counts = {};
  withDate.forEach(c => { const k = String(c.pcs.reportDate).slice(0, 7); counts[k] = (counts[k] || 0) + 1; });
  const bars = months.map(m => ({ name: m.label, key: m.key, n: counts[m.key] || 0 }));
  const inWindow = bars.reduce((a, b) => a + b.n, 0);
  const outside = withDate.length - inWindow;

  return (
    <>
      <div className="grid3" style={{ marginBottom: 16 }}>
        <Kpi label="Live PCS families" value={none ? '—' : live.length}
          icon={<Users size={13} />}
          d={none ? 'not enough data — nothing flagged yet'
            : `${families.length} flagged · ${families.length - live.length} in “${last}”`} />

        <Kpi label="Report within 30 days" value={noDates ? '—' : within(30)}
          variant={!noDates && within(30) ? 'gold' : ''}
          icon={<CalendarClock size={13} />}
          d={noDates ? 'not enough data — no report dates on file'
            : `${within(60)} within 60 · ${within(90)} within 90`} />

        <Kpi label="House-hunting remotely" value={none ? '—' : remote}
          icon={<Video size={13} />}
          d={none ? 'not enough data' : remote ? 'buying before they ever see it' : 'nobody buying sight-unseen'} />

        <Kpi label="Orders in hand" value={none ? '—' : `${inHand} of ${families.length}`}
          icon={<FileText size={13} />}
          d={none ? 'not enough data' : pending ? `${pending} still waiting on orders` : 'everybody has their orders'} />

        <Kpi label="Compressed timelines" value={none ? '—' : tight}
          variant={tight ? 'accent' : (none ? '' : 'green')}
          icon={<AlertTriangle size={13} />}
          d={none ? 'not enough data'
            : tight ? 'the plan needs more runway than they have' : 'every dated family has the runway'} />
      </div>

      <Card title="PCS-season load" sub={`Report dates by month, next 12 months from ${fmtShort(ctx.todayIso)}. This is when families need you, not when they close.`}
        style={{ marginBottom: 18 }}>
        {noDates ? (
          <div className="pcs-nodata">
            Not enough data. {none ? 'No PCS families are flagged yet.' : `None of the ${families.length} flagged families has a report date on file yet.`}
            <br />A report date is the only thing this screen needs to start counting.
          </div>
        ) : (
          <>
            <div className="pcs-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bars} margin={{ top: 6, right: 8, bottom: 4, left: -18 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#8E89A8' }} axisLine={false} tickLine={false} interval={0} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#8E89A8' }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={v => [`${v} famil${v === 1 ? 'y' : 'ies'}`, 'reporting']} labelStyle={{ fontWeight: 700 }} cursor={{ fill: alpha(BRAND.colors.cobalt,.05) }} />
                  <Bar dataKey="n" radius={[6, 6, 0, 0]} barSize={22}>
                    {bars.map((b, i) => <Cell key={b.key} fill={b.n ? PALETTE[i % PALETTE.length] : '#EEF0FA'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="pcs-tblnote">
              {inWindow} of {withDate.length} dated famil{withDate.length === 1 ? 'y' : 'ies'} fall in the next twelve months.
              {outside > 0 && ` ${outside} report date${outside === 1 ? '' : 's'} outside that window — usually one already past — and ${outside === 1 ? 'is' : 'are'} not on this chart.`}
              {families.length - withDate.length > 0 && ` ${families.length - withDate.length} famil${families.length - withDate.length === 1 ? 'y has' : 'ies have'} no report date yet and cannot be counted.`}
            </div>
          </>
        )}
      </Card>
    </>
  );
}

/* ------------------------------------------------------------- board card */

function FamilyCard({ c, ctx, sq }) {
  const p = c.pcs || {};
  const d = directionOf(p.moveType);
  const owner = ctx.users_by_id[c.owner_id];
  const n = sq && sq.known ? sq.have : null;
  const cls = n == null ? '' : n < 0 ? ' past' : n <= 45 ? ' tight' : '';

  return (
    <>
      <div className="kcard-top">
        <div style={{ minWidth: 0 }}>
          <div className="kn">{c.name}</div>
          <div className="pcs-kmeta">
            {[p.rank, p.branch].filter(Boolean).join(' · ') || 'branch and rank not recorded'}
          </div>
        </div>
        {owner && (ctx.isLeader || ctx.isCoordinator) && <span className="kown" title={owner.name}>{initials(owner.name)}</span>}
      </div>

      <div className={'pcs-rnltd' + cls}>
        <span className="l">RNLTD</span>
        <span className="v">
          {sq && sq.known
            ? (sq.have < 0 ? `reported ${whenWords(sq.have)}` : `in ${dayWord(sq.have)}`)
            : 'no report date'}
        </span>
      </div>

      <div className="ktags">
        <span className={'pcs-dir ' + d.key}>{d.label}</span>
        {p.loanType && <Tag>{p.loanType}</Tag>}
        {p.remote && <Tag>remote buyer</Tag>}
        {!p.ordersInHand && <Tag>orders pending</Tag>}
      </div>

      {sq && sq.known && (
        <div className="pcs-krow">
          <span>Report date</span><b>{fmtShort(sq.report)}</b>
        </div>
      )}
      {p.commuteBand ? (
        <div className="pcs-krow"><span>Your drive-time band</span><b>≤ {p.commuteBand} min</b></div>
      ) : null}

      {/* the hard flag. Red once steps are actually behind, amber while the
          move is merely tighter than the plan wants, and a different sentence
          again once the report date itself has gone by — "−12 days of runway"
          would be arithmetic nobody can act on. */}
      {sq && sq.known && sq.reported && sq.behind.length > 0 && (
        <div className="pcs-flag">
          <AlertTriangle size={13} />
          <span>
            Reported {dayWord(-sq.have)} ago and {sq.behind.length} step{sq.behind.length === 1 ? '' : 's'} still open.
          </span>
        </div>
      )}
      {sq && sq.known && !sq.reported && sq.compressed && (
        <div className={'pcs-flag' + (sq.behind.length ? '' : ' warn')}>
          <AlertTriangle size={13} />
          <span>
            Timeline compressed — the plan wants {dayWord(sq.needed)} of runway and there {sq.have === 1 ? 'is' : 'are'} {dayWord(sq.have)}.
            {sq.behind.length ? ` ${sq.behind.length} step${sq.behind.length === 1 ? '' : 's'} already past.` : ' Nothing behind yet.'}
          </span>
        </div>
      )}
    </>
  );
}

/* ==========================================================================
   the family modal
   ========================================================================== */

function FamilyModal({ ctx, c, cfg, offsets, statuses, sq, onClose }) {
  const [tab, setTab] = useState('timeline');
  const [report, setReport] = useState(null);   // last cascade report, if any

  const p = c.pcs || {};
  const d = directionOf(p.moveType);
  const opts = {
    offsets, holidays: holidaysOf(ctx.settings), rollover: rolloverOf(ctx.settings),
    tz: ctx.tz, report: p.reportDate, assignee: c.owner_id,
  };

  const savePcs = (patch, contactPatch) => {
    ctx.upsertContact({ ...c, ...(contactPatch || {}), pcs: { ...(c.pcs || {}), ...patch } });
  };

  /* Changing the report date re-cascades the UNMET steps and reports exactly
     what moved — the same behaviour, and the same engine, as changing a
     contract's effective date. */
  const setReportDate = iso => {
    if (!isDate(iso)) { savePcs({ reportDate: iso || '' }); setReport(null); return; }
    const r = cascadePcs(p.steps || [], { ...opts, report: iso });
    savePcs({ reportDate: iso, steps: r.deadlines });
    setReport(r);
  };

  const buildTimeline = () => {
    if (!isDate(p.reportDate)) return;
    const r = cascadePcs(p.steps || [], { ...opts, report: p.reportDate, offsets, force: true });
    savePcs({ steps: r.deadlines });
    setReport(r);
  };

  const steps = (p.steps || []).slice().sort((a, b) => String(effectiveDateOf(a) || '9999').localeCompare(String(effectiveDateOf(b) || '9999')));
  const openSteps = steps.filter(s => s.status !== 'met' && s.status !== 'waived').length;
  const remoteSteps = remoteStepsOf(cfg);
  const doneRemote = remoteSteps.filter(s => ((p.remoteSteps || {})[s.key] || {}).done).length;

  return (
    <ModalShell
      title={c.name}
      sub={<>
        {[p.rank, p.branch].filter(Boolean).join(' · ') || 'branch and rank not recorded'}
        {p.currentStation || p.nextStation ? ` · ${p.currentStation || 'current station unknown'} → ${p.nextStation || 'next station unknown'}` : ''}
        {c.phone ? ` · ${phoneFmt(c.phone)}` : ''}
      </>}
      badges={<>
        <span className={'pcs-dir ' + d.key}>{d.label}</span>
        <Pill color="${BRAND.colors.cobalt}">{statuses.includes(p.status) ? p.status : statuses[0]}</Pill>
        {isDate(p.reportDate)
          ? <Tag>RNLTD {fmtShort(p.reportDate)} · {sq && sq.known ? (sq.have < 0 ? whenWords(sq.have) : `in ${dayWord(sq.have)}`) : ''}</Tag>
          : <Tag>no report date</Tag>}
        {p.loanType && <Tag>{p.loanType}</Tag>}
        <Tag>{openSteps} open step{openSteps === 1 ? '' : 's'}</Tag>
      </>}
      onClose={onClose}
      right={<Btn kind="g" sm icon={<ArrowRight size={13} />} onClick={() => ctx.go('contacts', { open: c.id })}>Open the contact</Btn>}
    >
      <div className="mtabs">
        {[['timeline', 'Timeline', steps.length], ['remote', 'Remote buyer', `${doneRemote}/${remoteSteps.length}`], ['detail', 'PCS details', null]].map(([k, l, n]) => (
          <button key={k} className={'mtab' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>
            {l}{n != null && n !== 0 && <span className="mtab-n">{n}</span>}
          </button>
        ))}
      </div>

      <div className="m-left" style={{ gridColumn: '1/-1' }}>
        <Squeeze sq={sq} c={c} tz={ctx.tz} />

        {tab === 'timeline' && (
          <>
            <div className="fgrid" style={{ marginBottom: 14 }}>
              <Field label="Report date (RNLTD)" hint="The anchor. Every step counts backwards from it, and changing it re-cascades the unmet ones.">
                <Inp type="date" value={p.reportDate || ''} onChange={e => setReportDate(e.target.value)} />
              </Field>
              <div className="pcs-tog">
                <div className="pcs-tog-l">Orders in hand?</div>
                <Toggle on={!!p.ordersInHand} onChange={v => savePcs({ ordersInHand: v })} label={p.ordersInHand ? 'Orders in hand' : 'Orders still pending'} />
                <div className="pcs-tog-h">Until the orders land, the report date is what the member expects, not what is signed.</div>
              </div>
            </div>

            {report && <CascadeReport r={report} onDismiss={() => setReport(null)} />}

            <div className="toolbar">
              <Btn sm kind="s" icon={<RefreshCw size={13} />} onClick={buildTimeline} disabled={!isDate(p.reportDate)}>
                {steps.length ? 'Recompute from the report date' : 'Build the timeline'}
              </Btn>
              <span style={{ flex: 1 }} />
            </div>

            {!isDate(p.reportDate) ? (
              <Empty>
                No report date yet. That is normal this early — set it as soon as the member tells you, even before
                the orders are cut, and the whole plan falls out of it.
              </Empty>
            ) : steps.length === 0 ? (
              <>
                <Empty>No timeline built yet. This is what the install's default plan would want:</Empty>
                <div className="cd-list">
                  {previewSteps({ ...opts, report: p.reportDate }).map(s => {
                    const n = daysUntil(s.date, ctx.tz);
                    return (
                      <div key={s.key} className={'cd' + (n < 0 ? ' overdue' : '')}>
                        <div className="cd-top">
                          <div style={{ flex: 1, minWidth: 160 }}><div className="cd-name">{s.label}</div></div>
                          <div style={{ textAlign: 'right' }}>
                            <div className="cd-date">{fmtLong(s.date)}</div>
                            <div className="cd-count" style={{ marginTop: 5, display: 'inline-block' }}>{whenWords(n)}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="cd-list">
                {steps.map(s => (
                  <DeadlineRow
                    key={s.key} ctx={ctx} t={c} d={s}
                    onChange={next => savePcs({ steps: (p.steps || []).map(x => (x.key === s.key ? next : x)) })}
                  />
                ))}
              </div>
            )}

            <Disclaimer cfg={cfg} tight />
            <LegalNote>
              Dates and arithmetic only — this is not legal advice, and it is not entitlement advice either. The VA
              and temporary-lodging rows are calendar reminders about paperwork, nothing more.
            </LegalNote>
          </>
        )}

        {tab === 'remote' && <RemoteFlow ctx={ctx} c={c} cfg={cfg} savePcs={savePcs} />}
        {tab === 'detail' && <DetailTab ctx={ctx} c={c} cfg={cfg} statuses={statuses} savePcs={savePcs} setReportDate={setReportDate} />}
      </div>

      <div className="m-foot">
        <Btn kind="p" onClick={onClose}>Done</Btn>
        <span className="m-foot-n">Everything on this screen saves the moment you change it.</span>
      </div>
    </ModalShell>
  );
}

/* --------------------------------------------------------- the compression
   warning, spelled out in days. */

function Squeeze({ sq, c, tz }) {
  if (!sq || !sq.known) {
    return (
      <div className="pcs-sq">
        <div className="pcs-sq-h"><Clock size={15} /> No report date yet</div>
        <div className="pcs-sq-p">
          There is nothing to count from until you have a report date. Ask for it on the first call — the member
          usually knows the month long before the orders are cut, and an approximate date beats no clock at all.
        </div>
      </div>
    );
  }

  const { have, needed, short, behind, compressed, reported, built } = sq;
  const tone = reported ? 'warn' : compressed ? 'bad' : 'ok';

  return (
    <div className={'pcs-sq ' + tone}>
      <div className="pcs-sq-h">
        {compressed || reported ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
        {reported
          ? `The report date has passed — ${dayWord(-have)} ago`
          : compressed
            ? `Compressed move — ${dayWord(short)} short of the plan`
            : 'The runway is there'}
      </div>

      <div className="pcs-sq-p">
        {reported ? (
          <>
            {c.name} was due to report on <b>{fmtLong(sq.report)}</b>. Anything still open below is being worked
            after the fact — update the report date if the orders moved.
          </>
        ) : compressed ? (
          <>
            The default plan wants <b>{dayWord(needed)}</b> between the first step and the report date. This family
            has <b>{dayWord(have)}</b>. That is <b>{dayWord(short)} short</b>
            {behind.length
              ? <>, and the steps named below are not tight — they are already behind.</>
              : <>. Nothing has slipped past yet, so the whole plan has to run {dayWord(short)} faster than it was written to.</>}
          </>
        ) : (
          <>
            The plan wants <b>{dayWord(needed)}</b> of runway and this family has <b>{dayWord(have)}</b>
            {have - needed > 0 ? <> — <b>{dayWord(have - needed)}</b> to spare</> : ' — exactly enough'}.
          </>
        )}
      </div>

      {/* once the report date is behind them, "short by 132 days" is arithmetic
          nobody can use. The runway numbers only appear while there is runway. */}
      <div className="pcs-sq-nums">
        {reported ? (
          <>
            <div className="pcs-sq-n"><div className="l">Reported</div><div className="v">{-have} days ago</div></div>
            <div className="pcs-sq-n"><div className="l">Past and still open</div><div className="v">{behind.length}</div></div>
          </>
        ) : (
          <>
            <div className="pcs-sq-n"><div className="l">Days to report</div><div className="v">{have}</div></div>
            <div className="pcs-sq-n"><div className="l">Plan needs</div><div className="v">{needed}</div></div>
            <div className="pcs-sq-n"><div className="l">{short > 0 ? 'Short by' : 'Spare'}</div><div className="v">{short > 0 ? short : -short}</div></div>
            <div className="pcs-sq-n"><div className="l">Steps already past</div><div className="v">{behind.length}</div></div>
          </>
        )}
      </div>

      {behind.length > 0 && (
        <>
          <div className="pcs-sq-p" style={{ marginTop: 10 }}>
            <b>Already past, not yet done:</b>
          </div>
          <ul className="pcs-sq-list">
            {behind.map(s => (
              <li key={s.key}>
                <b>{s.label}</b> — wanted {fmtShort(effectiveDateOf(s))}, {whenWords(daysUntil(effectiveDateOf(s), tz))}
              </li>
            ))}
          </ul>
          <div className="pcs-sq-foot">
            These are not warnings to plan around; the dates are behind you. Mark the ones that happened anyway as
            met, waive the ones that will not happen, and extend the rest with a date you can actually hit — the
            record keeps what the plan wanted either way.
          </div>
        </>
      )}
      {!built && (
        <div className="pcs-sq-foot">
          Counted against the install's default plan — this family's timeline has not been built yet, so these are
          the dates the defaults would produce.
        </div>
      )}
    </div>
  );
}

function CascadeReport({ r, onDismiss }) {
  const { moved, kept, added } = r;
  const held = kept.filter(k => k.why !== 'unchanged');
  return (
    <div className="convert-banner fix" style={{ display: 'block' }}>
      <b>Re-cascaded from the new report date.</b>{' '}
      {moved.length ? `${moved.length} step${moved.length === 1 ? '' : 's'} moved.` : 'Nothing moved.'}
      {added.length ? ` ${added.length} added.` : ''}
      {held.length ? ` ${held.length} left alone.` : ''}
      {moved.length > 0 && (
        <ul style={{ margin: '8px 0 0 0', paddingLeft: 18, fontSize: 12.5 }}>
          {moved.map(m => <li key={m.key}>{m.label}: {fmtShort(m.from)} → <b>{fmtShort(m.to)}</b></li>)}
        </ul>
      )}
      {held.length > 0 && (
        <ul style={{ margin: '8px 0 0 0', paddingLeft: 18, fontSize: 12.5, color: '#56527a' }}>
          {held.map(k => <li key={k.key}>{k.label} stayed on {fmtShort(k.date)} — {k.why}</li>)}
        </ul>
      )}
      <button className="linkbtn" style={{ marginTop: 8 }} onClick={onDismiss}>Dismiss</button>
    </div>
  );
}

/* ---------------------------------------------------------- remote buyers */

function RemoteFlow({ ctx, c, cfg, savePcs }) {
  const p = c.pcs || {};
  const steps = remoteStepsOf(cfg);
  const state = p.remoteSteps || {};

  const toggle = key => {
    const cur = state[key] || {};
    savePcs({
      remoteSteps: {
        ...state,
        [key]: cur.done
          ? { done: null, by: null, note: cur.note || '' }
          : { done: ctx.todayIso, by: ctx.me.id, note: cur.note || '' },
      },
    });
  };
  const setNote = (key, note) => {
    const cur = state[key] || {};
    savePcs({ remoteSteps: { ...state, [key]: { ...cur, note } } });
  };

  const done = steps.filter(s => (state[s.key] || {}).done).length;

  return (
    <>
      <SecTitle right={`${done}/${steps.length} done`}>Remote buyer flow</SecTitle>
      <div className="note" style={{ marginBottom: 14 }}>
        {p.remote
          ? <>This family is house-hunting remotely, so most of them will own the place before they stand in it. Every step below is a thing that has to happen for that to be safe.</>
          : <>This family is not flagged as house-hunting remotely. The checklist is still here — half of a PCS goes remote at some point anyway — and you can flag it on the PCS details tab.</>}
      </div>

      {steps.map(s => {
        const e = state[s.key] || {};
        const by = ctx.users_by_id[e.by];
        return (
          <div key={s.key} className={'pcs-rb' + (e.done ? ' done' : '')}>
            <button className="pcs-rb-x" onClick={() => toggle(s.key)} aria-label={e.done ? 'Undo' : 'Mark done'}>
              <CheckCircle2 size={14} />
            </button>
            <div className="pcs-rb-b">
              <div className="pcs-rb-l">{s.label}</div>
              <div className="pcs-rb-s">
                {e.done
                  ? <>Done {fmtLong(e.done)}{by ? ` · ${by.name}` : ''}</>
                  : 'Not done yet'}
              </div>
              <input
                style={{ marginTop: 7 }} placeholder="Note — who did it, what was agreed…"
                value={e.note || ''} onChange={ev => setNote(s.key, ev.target.value)}
              />
            </div>
          </div>
        );
      })}

      <div className="pcs-stamp">
        Each step stamps who marked it and the day they did. Un-ticking one clears the stamp rather than hiding it,
        so the record is what happened and not what somebody meant to do.
      </div>
      <Disclaimer cfg={cfg} tight />
    </>
  );
}

/* ------------------------------------------------------------- the editor */

function DetailTab({ ctx, c, cfg, statuses, savePcs, setReportDate }) {
  const p = c.pcs || {};
  const install = installOf(cfg);
  const bands = bandsOf(cfg);
  const [confirmOff, setConfirmOff] = useState(false);
  const set = (k, v) => savePcs({ [k]: v });

  const hhtBad = isDate(p.hhtStart) && isDate(p.hhtEnd) && diffDays(p.hhtStart, p.hhtEnd) < 0;
  /* if the plan has a house-hunting window, say whether the trip they booked
     lands inside it. Comparison only — it never moves their dates. */
  const hhtStep = (p.steps || []).find(s => s.key === 'hht');
  const hhtEndStep = (p.steps || []).find(s => s.key === 'hhtend');
  const hhtOutside = isDate(p.hhtStart) && hhtStep && hhtEndStep
    && (diffDays(hhtStep.date, p.hhtStart) < 0 || diffDays(p.hhtStart, hhtEndStep.date) < 0);

  return (
    <>
      <SecTitle>The orders</SecTitle>
      <div className="fgrid">
        <Field label="Branch">
          <Sel value={p.branch || ''} onChange={e => set('branch', e.target.value)}>
            <option value="">— not recorded —</option>
            {(cfg.branches || DEFAULT_PCS.branches).map(b => <option key={b} value={b}>{b}</option>)}
          </Sel>
        </Field>
        <Field label="Rank" hint="However they say it — E-6, TSgt, MAJ. It is their word, not a lookup.">
          <Inp value={p.rank || ''} onChange={e => set('rank', e.target.value)} placeholder="TSgt" />
        </Field>
        <Field label="Move type">
          <Sel value={p.moveType || ''} onChange={e => set('moveType', e.target.value)}>
            <option value="">— not recorded —</option>
            {(cfg.moveTypes || DEFAULT_PCS.moveTypes).map(m => <option key={m} value={m}>{m}</option>)}
          </Sel>
        </Field>
        <Field label="Where they are on this board">
          <Sel value={statuses.includes(p.status) ? p.status : statuses[0]} onChange={e => set('status', e.target.value)}
            options={statuses} />
        </Field>
        <Field label="Report date (RNLTD)" hint="The anchor for the whole timeline.">
          <Inp type="date" value={p.reportDate || ''} onChange={e => setReportDate(e.target.value)} />
        </Field>
        <div className="pcs-tog">
          <div className="pcs-tog-l">Orders in hand</div>
          <Toggle on={!!p.ordersInHand} onChange={v => set('ordersInHand', v)}
            label={p.ordersInHand ? 'Signed orders on file' : 'Still pending'} />
          <div className="pcs-tog-h">Until they are cut, treat the report date as the member's expectation.</div>
        </div>
        <Field label="Current duty station">
          <Inp value={p.currentStation || ''} onChange={e => set('currentStation', e.target.value)} placeholder="Nellis AFB, NV" />
        </Field>
        <Field label="Next duty station">
          <Inp value={p.nextStation || ''} onChange={e => set('nextStation', e.target.value)} placeholder={install.name || 'McConnell AFB'} />
        </Field>
      </div>

      <SecTitle>The move</SecTitle>
      <div className="fgrid">
        <div className="pcs-tog">
          <div className="pcs-tog-l">House-hunting remotely</div>
          <Toggle on={!!p.remote} onChange={v => set('remote', v)}
            label={p.remote ? 'Yes — buying before they see it' : 'No — they will be here in person'} />
          <div className="pcs-tog-h">Turns the remote-buyer checklist into the thing you work from.</div>
        </div>
        <Field label="House-hunting trip — from">
          <Inp type="date" value={p.hhtStart || ''} onChange={e => set('hhtStart', e.target.value)} />
        </Field>
        <Field label="House-hunting trip — to">
          <Inp type="date" value={p.hhtEnd || ''} onChange={e => set('hhtEnd', e.target.value)} />
        </Field>
        <Field label="Bedrooms needed">
          <Inp type="number" min="0" value={p.bedsNeeded == null ? '' : p.bedsNeeded}
            onChange={e => set('bedsNeeded', e.target.value === '' ? null : Number(e.target.value))} />
        </Field>
        <Field label="Dependents moving">
          <Inp type="number" min="0" value={p.dependents == null ? '' : p.dependents}
            onChange={e => set('dependents', e.target.value === '' ? null : Number(e.target.value))} />
        </Field>
        <Field label="Pets" hint="Breed and weight decide half the rentals and some HOAs, so write what they told you.">
          <Inp value={p.pets || ''} onChange={e => set('pets', e.target.value)} placeholder="2 dogs, one 70lb" />
        </Field>
      </div>
      {hhtBad && <div className="note bad" style={{ marginTop: 10 }}>The house-hunting trip ends before it starts. Check those two dates.</div>}
      {hhtOutside && !hhtBad && (
        <div className="note" style={{ marginTop: 10 }}>
          Their trip starts {fmtShort(p.hhtStart)}, outside the window the plan wanted
          ({fmtShort(hhtStep.date)} – {fmtShort(hhtEndStep.date)}). That is often fine — it is flagged, not fixed.
        </div>
      )}

      <SecTitle>Drive time to {install.name || 'the installation'}</SecTitle>
      <div className="fgrid">
        <Field label="Band you are working to">
          <Sel value={p.commuteBand == null ? '' : String(p.commuteBand)}
            onChange={e => set('commuteBand', e.target.value === '' ? null : Number(e.target.value))}>
            <option value="">— no preference recorded —</option>
            {bands.map(b => <option key={b} value={b}>within {b} minutes</option>)}
          </Sel>
        </Field>
        <Field label="Your own note on the commute" full>
          <Inp value={p.commuteNote || ''} onChange={e => set('commuteNote', e.target.value)}
            placeholder="~18 min via Rock Rd outside the gate rush, per my own drive" />
        </Field>
      </div>
      <div className="pcs-note">
        <b>These minutes are your estimate, not a calculation.</b> This app has no mapping service, does not call
        one, and does not know traffic, gate hours or which gate they will use. It stores what you typed and filters
        the board by it — nothing else.
        {install.address ? <> The installation on file is {install.address}.</> : null}
      </div>

      <SecTitle>Money side — what they told you</SecTitle>
      <div className="fgrid">
        <Field label="Loan type they expect to use">
          <Sel value={p.loanType || ''} onChange={e => set('loanType', e.target.value)}>
            <option value="">— not recorded —</option>
            {(cfg.loanTypes || DEFAULT_PCS.loanTypes).map(l => <option key={l} value={l}>{l}</option>)}
          </Sel>
        </Field>
        <div className="pcs-tog">
          <div className="pcs-tog-l">Certificate of Eligibility in hand</div>
          <Toggle on={!!p.coeInHand} onChange={v => set('coeInHand', v)}
            label={p.coeInHand ? 'They have their COE' : 'Not yet — lender is pulling it'} />
          <div className="pcs-tog-h">Whether the paperwork exists. Nothing here reads it or says what it entitles anyone to.</div>
        </div>
        <Field label="Temporary lodging days they expect to use"
          hint={`What the member told you. The default in Settings is ${cfg.tleDefaultDays == null ? DEFAULT_PCS.tleDefaultDays : cfg.tleDefaultDays} days.`}>
          <Inp type="number" min="0" value={p.tleDays == null ? '' : p.tleDays}
            onChange={e => set('tleDays', e.target.value === '' ? null : Number(e.target.value))} />
        </Field>
      </div>
      <Disclaimer cfg={cfg} tight />

      <SecTitle>Notes</SecTitle>
      <div className="fgrid">
        <Field label="Anything else worth keeping" full>
          <Txt value={p.notes || ''} onChange={e => set('notes', e.target.value)}
            placeholder="Sponsor's name, what the finance office told them, which gate they use…" />
        </Field>
      </div>

      <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {!confirmOff
          ? <Btn kind="g" sm icon={<Trash2 size={13} />} onClick={() => setConfirmOff(true)}>Not a PCS after all</Btn>
          : <>
            <span style={{ fontSize: 12.5, color: '#8a3b3b' }}>Take {c.name} off the relocation board?</span>
            <Btn kind="d" sm onClick={() => savePcs({ isPcs: false })}>Yes, unflag</Btn>
            <Btn kind="g" sm onClick={() => setConfirmOff(false)}>Keep them</Btn>
          </>}
        <span style={{ fontSize: 11.5, color: '#8E89A8' }}>
          Unflagging keeps every field and the timeline on the record — it only takes them off this board.
        </span>
      </div>
    </>
  );
}

/* --------------------------------------------------------- flag a new one */

function AddFamily({ ctx, cfg, statuses, onClose, onAdded }) {
  const [id, setId] = useState('');
  const [branch, setBranch] = useState('');
  const [rank, setRank] = useState('');
  const [moveType, setMoveType] = useState((cfg.moveTypes || DEFAULT_PCS.moveTypes)[0] || '');
  const [reportDate, setReportDate] = useState('');
  const [ordersInHand, setOrders] = useState(false);
  const [build, setBuild] = useState(true);

  const candidates = ctx.contacts.filter(c => !isPcs(c));
  const chosen = ctx.contacts.find(c => c.id === id) || null;

  const add = () => {
    if (!chosen) return;
    /* someone unflagged earlier keeps everything, so re-flagging picks their
       record back up rather than wiping it */
    const prior = chosen.pcs || {};
    const pcs = {
      status: statuses[0],
      currentStation: '', nextStation: (installOf(cfg).name || ''),
      remote: false, hhtStart: '', hhtEnd: '',
      tleDays: cfg.tleDefaultDays == null ? DEFAULT_PCS.tleDefaultDays : cfg.tleDefaultDays,
      loanType: '', coeInHand: false,
      dependents: null, bedsNeeded: chosen.beds == null ? null : chosen.beds,
      pets: '', commuteBand: null, commuteNote: '',
      steps: [], remoteSteps: {}, notes: '',
      ...prior,
      isPcs: true,
      branch: branch || prior.branch || '',
      rank: rank || prior.rank || '',
      moveType: moveType || prior.moveType || '',
      reportDate: isDate(reportDate) ? reportDate : (prior.reportDate || ''),
      ordersInHand,
    };
    if (!statuses.includes(pcs.status)) pcs.status = statuses[0];
    if (build && isDate(pcs.reportDate)) {
      const r = cascadePcs(pcs.steps || [], {
        offsets: pcsOffsetsOf(ctx.settings), holidays: holidaysOf(ctx.settings),
        rollover: rolloverOf(ctx.settings), report: pcs.reportDate, assignee: chosen.owner_id,
        force: true,
      });
      pcs.steps = r.deadlines;
    }
    ctx.upsertContact({ ...chosen, pcs });
    onAdded(chosen.id);
  };

  return (
    <ModalShell title="Flag a PCS family" sub="A military move starts with the orders, so all this needs is a person and a report date." onClose={onClose} width={620}>
      <div className="m-left" style={{ gridColumn: '1/-1' }}>
        {candidates.length === 0 ? (
          <Empty>Every contact you can see is already flagged as a PCS family.</Empty>
        ) : (
          <>
            <div className="fgrid">
              <Field label="Which contact" full hint="They stay a normal contact — this adds the relocation side to their record.">
                <Sel value={id} onChange={e => setId(e.target.value)}>
                  <option value="">— pick a contact —</option>
                  {candidates.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Sel>
              </Field>
              <Field label="Branch">
                <Sel value={branch} onChange={e => setBranch(e.target.value)}>
                  <option value="">— not recorded —</option>
                  {(cfg.branches || DEFAULT_PCS.branches).map(b => <option key={b} value={b}>{b}</option>)}
                </Sel>
              </Field>
              <Field label="Rank"><Inp value={rank} onChange={e => setRank(e.target.value)} placeholder="TSgt" /></Field>
              <Field label="Move type">
                <Sel value={moveType} onChange={e => setMoveType(e.target.value)} options={cfg.moveTypes || DEFAULT_PCS.moveTypes} />
              </Field>
              <Field label="Report date (RNLTD)" hint="Leave it blank if they genuinely do not know yet — you can add it the moment they do.">
                <Inp type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} />
              </Field>
              <div className="pcs-tog full">
                <Toggle on={!!ordersInHand} onChange={setOrders} label="Orders already in hand" />
              </div>
              <div className="pcs-tog full">
                <Toggle on={build} onChange={setBuild} label="Build the timeline from this install's default plan" />
                <div className="pcs-tog-h">
                  Needs a report date. Every step counts backwards from it and you can move, waive or extend any of
                  them afterwards.
                </div>
              </div>
            </div>
            <Disclaimer cfg={cfg} tight />
            <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
              <Btn kind="p" onClick={add} disabled={!chosen}>Flag as a PCS family</Btn>
              <Btn kind="g" onClick={onClose}>Cancel</Btn>
            </div>
          </>
        )}
      </div>
    </ModalShell>
  );
}
