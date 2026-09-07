/* ============================================================================
   Transactions.jsx — the closing pipeline and the critical dates.

   §4 of the brief, and the single reason a realtor switches CRM. A missed
   deadline costs a client their earnest money or their leverage, so the bar here
   is higher than anywhere else in the app:

     - Every date shows the RULE that produced it and, where it came from a
       contract, the QUOTED CLAUSE. An agent must be able to verify five
       deadlines in ten seconds without reopening the PDF.
     - Business vs calendar is printed next to the date, per deadline.
     - Changing the effective date re-cascades every UNMET deadline and reports
       exactly what moved and what did not.
     - A deadline can be met, waived or extended, each stamped with who and when.
     - Marking one met stops its remaining reminders immediately.
     - Nothing here interprets a contract. Dates and arithmetic only.
   ========================================================================== */

import React, { useState, useMemo, useEffect } from 'react';
import {
  Building2, CalendarClock, CheckCircle2, Ban, CalendarPlus, AlertTriangle, Clock,
  FileText, Plus, Trash2, ArrowRight, RefreshCw, Undo2, Users, Home, Landmark, Percent,
} from 'lucide-react';

import {
  Card, Kpi, Btn, Pill, Tag, Field, Inp, Sel, Txt, Toggle, Seg, SideChip,
  Conf, ModalShell, Board, Empty, SecTitle, LegalNote, ErrorNote,
} from '../components/ui';
import {
  phasesOf, offsetsOf, holidaysOf, rolloverOf, checklistFor,
} from '../lib/settings';
import {
  cascade, computeDeadline, urgency, effectiveDateOf, daysUntil, fmtShort, fmtLong,
  today, addDays, isDate,
} from '../lib/dates';
import { computeCommission, agentPlan, capPeriod, usd } from '../lib/commission';
import { uid, initials, sum } from '../lib/format';
import { closedOn, txGross } from '../lib/txn';
import { BRAND } from '../lib/brand';


/* -------------------------------------------------------------------------- */

/* a neutral plan: gross is plan-independent, but computeCommission wants one */
/** true when the figure shown is computed now rather than snapshotted at close */
const isEstimated = t => {
  const snap = t && t.commissionSnapshot && Number(t.commissionSnapshot.gross);
  return !(Number.isFinite(snap) && snap > 0);
};

/** days-until in words. Never renders the literal string "in nulld". */
const whenWords = n => {
  if (n == null) return 'no date';
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return '1 day overdue';
  if (n < 0) return `${-n} days overdue`;
  return `in ${n} days`;
};

export default function Transactions({ ctx }) {
  const { transactions, settings, params, go } = ctx;
  /* a coordinator reads every deal, so they need the same "whose is this"
     affordances the leader gets — it is breadth, not authority */
  const seesAll = ctx.isLeader || ctx.isCoordinator;
  const phases = phasesOf(settings);
  const scopeForParams = p => {
    if (!p) return 'active';
    if (p.focus === 'dates') return 'dates';
    if (p.focus === 'closed' || p.focus === 'fell') return p.focus;
    /* a terminal phase does not live on the active board — sending it there
       with a phase filter always landed on "Nothing under contract right now" */
    const ph = phasesOf(settings).find(x => x.key === p.phase);
    if (ph && ph.terminal) return ph.lost ? 'fell' : 'closed';
    return 'active';
  };
  const [openId, setOpenId] = useState(params.open || null);
  const [focusDeadline, setFocusDeadline] = useState(params.deadline || null);
  const [scope, setScope] = useState(() => scopeForParams(params));
  const [phaseFilter, setPhaseFilter] = useState(() => {
    const ph = phases.find(x => x.key === params.phase);
    return ph && !ph.terminal ? params.phase : null;
  });
  const [newFor, setNewFor] = useState(null);

  useEffect(() => {
    if (params.open) setOpenId(params.open);
    if (params.deadline) setFocusDeadline(params.deadline);
    if (params.phase || params.focus) {
      const next = scopeForParams(params);
      setScope(next);
      const ph = phases.find(x => x.key === params.phase);
      setPhaseFilter(next === 'active' && ph && !ph.terminal ? params.phase : null);
    }
  }, [params]);

  const open = transactions.find(t => t.id === openId) || null;

  const active = transactions.filter(t => t.status === 'active');
  const closed = transactions.filter(t => t.status === 'closed');
  const fell = transactions.filter(t => t.status === 'fell');

  /* every unmet deadline across the active book, soonest first */
  const dueList = useMemo(() => {
    const out = [];
    active.forEach(t => (t.deadlines || []).forEach(d => {
      if (d.status === 'met' || d.status === 'waived') return;
      out.push({ t, d });
    }));
    return out.sort((a, b) => String(effectiveDateOf(a.d) || '9999').localeCompare(String(effectiveDateOf(b.d) || '9999')));
  }, [active]);

  const flagHours = (settings.reminders && settings.reminders.hardFlagHours) || 48;
  const overdue = dueList.filter(x => urgency(x.d, ctx.tz) === 'overdue');
  const inside = dueList.filter(x => {
    const n = daysUntil(effectiveDateOf(x.d), ctx.tz);
    return n != null && n >= 0 && n * 24 <= flagHours;
  });

  const shown = active.filter(t => !phaseFilter || t.phase === phaseFilter);

  return (
    <>
      <div className="grid3" style={{ marginBottom: 18 }}>
        <Kpi label="Active transactions" value={active.length} icon={<Building2 size={13} />}
          d={`${usd(sum(active, t => Number(t.salePrice) || 0))} in volume`} />
        <Kpi label={`Inside ${flagHours} hours`} value={inside.length} variant={inside.length ? 'gold' : ''}
          icon={<Clock size={13} />} d={inside.length ? inside[0].d.label : 'nothing imminent'} />
        <Kpi label="Overdue" value={overdue.length} variant={overdue.length ? 'accent' : 'green'}
          icon={<AlertTriangle size={13} />} d={overdue.length ? 'deal with these first' : 'nothing overdue'} />
        <Kpi label="Closed" value={closed.length} variant="green" icon={<CheckCircle2 size={13} />}
          d={`${usd(sum(closed, txGross))} GCI · all time${closed.some(isEstimated) ? ' · some computed, not snapshotted' : ''}`} />
        <Kpi label="Fell through" value={fell.length} icon={<Ban size={13} />}
          d={fell.length ? `most often at ${commonFellPhase(fell, phases)} · all time` : 'none on record'} />
      </div>

      <div className="toolbar">
        <Seg value={scope} onChange={setScope} options={[
          { value: 'active', label: 'Board', n: active.length },
          { value: 'dates', label: 'Critical dates', n: dueList.length },
          { value: 'closed', label: 'Closed', n: closed.length },
          { value: 'fell', label: 'Fell through', n: fell.length },
        ]} />
        <span style={{ flex: 1 }} />
        <Btn kind="p" sm icon={<Plus size={14} />} onClick={() => setNewFor({})}>New transaction</Btn>
      </div>

      {scope === 'active' && (
        <>
          {phaseFilter && (
            <div className="note" style={{ marginBottom: 12 }}>
              Filtered to <b>{(phases.find(p => p.key === phaseFilter) || {}).label}</b>
              <button className="linkbtn" style={{ marginLeft: 8 }} onClick={() => setPhaseFilter(null)}>show all</button>
            </div>
          )}
          {shown.length === 0
            ? <Empty>Nothing under contract right now. A contact moving to Under Contract on the pipeline starts a transaction here.</Empty>
            : <Board
              cols={phases.filter(p => !p.terminal).map(p => ({ key: p.key, label: p.label, color: p.color }))}
              items={shown}
              colOf={t => t.phase}
              onMove={(t, phase) => movePhase(ctx, t, phase)}
              onOpen={t => setOpenId(t.id)}
              empty="—"
              card={t => <TxnCard t={t} ctx={ctx} />}
            />}
          <div className="grid2" style={{ marginTop: 16 }}>
            <Card title="Terminal columns" sub="A deal that dies is an outcome, not a delete.">
              <div className="tx-phase">
                {phases.filter(p => p.terminal).map(p => (
                  <button key={p.key} className={phaseFilter === p.key ? 'on' : ''}
                    onClick={() => { setScope(p.lost ? 'fell' : 'closed'); }}>
                    {p.label} · {transactions.filter(t => t.phase === p.key).length}
                  </button>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}

      {scope === 'dates' && (
        <DueBoard ctx={ctx} list={dueList} onOpen={(t, k) => { setOpenId(t.id); setFocusDeadline(k); }} />
      )}

      {scope === 'closed' && <ClosedTable ctx={ctx} list={closed} onOpen={setOpenId} />}
      {scope === 'fell' && <FellTable ctx={ctx} list={fell} onOpen={setOpenId} />}

      {open && <TransactionModal ctx={ctx} txn={open} focusDeadline={focusDeadline}
        onClose={() => { setOpenId(null); setFocusDeadline(null); }} />}
      {newFor && <NewTransaction ctx={ctx} onClose={() => setNewFor(null)} onCreated={id => { setNewFor(null); setOpenId(id); }} />}
    </>
  );
}

const commonFellPhase = (fell, phases) => {
  const counts = {};
  fell.forEach(t => { const k = t.fellPhase || 'unknown'; counts[k] = (counts[k] || 0) + 1; });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (!top) return '—';
  const p = phases.find(x => x.key === top[0]);
  return p ? p.label.toLowerCase() : top[0];
};

function movePhase(ctx, t, phase) {
  const p = phasesOf(ctx.settings).find(x => x.key === phase);
  const next = { ...t, phase };
  if (p && p.lost) { next.status = 'fell'; next.fellAt = ctx.todayIso; next.fellPhase = t.phase; }
  else if (p && p.terminal) { next.status = 'closed'; next.closedActual = t.closedActual || ctx.todayIso; }
  else next.status = 'active';
  ctx.upsertTransaction(next);
}

/* ------------------------------------------------------------------ cards */

function TxnCard({ t, ctx }) {
  const next = nextDeadline(t, ctx.tz);
  const u = next ? urgency(next, ctx.tz) : 'none';
  const owner = ctx.users_by_id[t.owner_id];
  const nDays = next ? daysUntil(effectiveDateOf(next), ctx.tz) : null;
  return (
    <>
      <div className="kcard-top">
        <div style={{ minWidth: 0 }}>
          <div className="kn">{shortAddr(t.address)}</div>
          <div className="kco">{cityOf(t.address)}{t.mls ? ` · ${t.mls}` : ''}</div>
        </div>
        {owner && (ctx.isLeader || ctx.isCoordinator) && <span className="kown" title={owner.name}>{initials(owner.name)}</span>}
      </div>
      <div className="ktags">
        <SideChip side={t.side} />
        <Tag>{usd(t.salePrice)}</Tag>
        {t.closeDate && <Tag>closes {fmtShort(t.closeDate)}</Tag>}
      </div>
      {next ? (
        <div className={'msdue' + (u === 'overdue' ? ' over' : '')}>
          <span className="msdue-l">{next.label}</span>
          <span className="msdue-w">{whenWords(nDays)}</span>
        </div>
      ) : <div className="cli-hint">No open deadlines</div>}
    </>
  );
}

const nextDeadline = (t, tz) => {
  const open = (t.deadlines || []).filter(d => d.status !== 'met' && d.status !== 'waived');
  return open.sort((a, b) => String(effectiveDateOf(a) || '9999').localeCompare(String(effectiveDateOf(b) || '9999')))[0] || null;
};
const shortAddr = a => String(a || 'Untitled').split(',')[0];
const cityOf = a => String(a || '').split(',').slice(1).join(',').trim();

/* -------------------------------------------------------- the dates screen */

function DueBoard({ ctx, list, onOpen }) {
  const seesAll = ctx.isLeader || ctx.isCoordinator;
  const [who, setWho] = useState('all');
  const agents = ctx.isLeader ? ctx.users.filter(u => u.active !== false) : [];
  const rows = list.filter(x => who === 'all' || x.t.owner_id === who);

  const groups = [
    { key: 'overdue', label: 'Overdue', test: x => urgency(x.d, ctx.tz) === 'overdue' },
    { key: 'urgent', label: 'Next 48 hours', test: x => { const n = daysUntil(effectiveDateOf(x.d), ctx.tz); return n >= 0 && n <= 2; } },
    { key: 'week', label: 'This week', test: x => { const n = daysUntil(effectiveDateOf(x.d), ctx.tz); return n > 2 && n <= 7; } },
    { key: 'later', label: 'Later', test: x => daysUntil(effectiveDateOf(x.d), ctx.tz) > 7 },
  ];
  const used = new Set();

  return (
    <>
      {seesAll && agents.length > 0 && (
        <div className="toolbar">
          <span className="sec-title" style={{ margin: 0 }}>Assigned to</span>
          <Seg value={who} onChange={setWho} options={[{ value: 'all', label: 'Everyone' },
            ...agents.map(a => ({ value: a.id, label: a.name.split(' ')[0] }))]} />
        </div>
      )}
      {rows.length === 0 && <Empty>No open deadlines. Nothing to chase today.</Empty>}
      {groups.map(g => {
        const items = rows.filter(x => !used.has(x) && g.test(x));
        items.forEach(x => used.add(x));
        if (!items.length) return null;
        return (
          <div key={g.key} style={{ marginBottom: 20 }}>
            <SecTitle>{g.label} <span className="kc">{items.length}</span></SecTitle>
            <div className="cd-list">
              {items.map(({ t, d }) => (
                <DeadlineRow key={t.id + d.key} ctx={ctx} t={t} d={d} onOpen={() => onOpen(t, d.key)} showAddress />
              ))}
            </div>
          </div>
        );
      })}
      <LegalNote />
    </>
  );
}

/* ------------------------------------------------------------ one deadline
   This component is the heart of the feature. Everything an agent needs to
   trust the date is on screen: the computed date, the count method, the rule,
   the quoted clause, and the arithmetic. */
export function DeadlineRow({ ctx, t, d, onOpen, showAddress, onChange, focus }) {
  const [act, setAct] = useState(null);
  const [extTo, setExtTo] = useState(d.extendedTo || '');
  const [extWhy, setExtWhy] = useState('');
  const u = urgency(d, ctx.tz);
  const dateShown = effectiveDateOf(d);
  const n = daysUntil(dateShown, ctx.tz);
  const flagHours = (ctx.settings.reminders && ctx.settings.reminders.hardFlagHours) || 48;
  const hard = n != null && n >= 0 && n * 24 <= flagHours;

  const stamp = (status, extra) => {
    const next = {
      ...d, status,
      statusBy: ctx.me.id, statusAt: new Date().toISOString(),
      /* marking a deadline met stops its remaining reminders immediately */
      remindersSent: status === 'met' || status === 'waived' ? { ...(d.remindersSent || {}), stopped: true } : (d.remindersSent || {}),
      ...extra,
    };
    if (onChange) onChange(next);
    else {
      const list = (t.deadlines || []).map(x => (x.key === d.key ? next : x));
      ctx.upsertTransaction({ ...t, deadlines: list });
    }
    setAct(null);
  };

  const cls = ['cd', u === 'overdue' ? 'overdue' : u === 'urgent' ? 'urgent' : '',
    d.status === 'met' || d.status === 'waived' ? 'met' : '', focus ? 'urgent' : ''].filter(Boolean).join(' ');

  return (
    <div className={cls}>
      <div className="cd-top">
        <div style={{ flex: 1, minWidth: 160 }}>
          <div className="cd-name">
            {d.label}
            {d.status === 'extended' && <span className="cd-flag" style={{ marginLeft: 8 }}>extended</span>}
            {d.status === 'met' && <span className="cd-flag" style={{ marginLeft: 8, background: '#E6F6EC', color: '#1a7d46' }}>met</span>}
            {d.status === 'waived' && <span className="cd-flag" style={{ marginLeft: 8 }}>waived</span>}
            {d.confidence != null && d.confidence < 0.6 && <span style={{ marginLeft: 8 }}><Conf v={d.confidence} /></span>}
          </div>
          {showAddress && (
            <div style={{ fontSize: 12, color: '#7B76A0', marginTop: 3, cursor: onOpen ? 'pointer' : undefined }} onClick={onOpen}>
              <Home size={11} style={{ verticalAlign: -1 }} /> {shortAddr(t.address)} · {ctx.users_by_id[t.owner_id]?.name || '—'}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="cd-date" style={{ color: u === 'overdue' ? '#B03030' : u === 'urgent' ? '#A85B10' : BRAND.colors.ink }}>
            {fmtLong(dateShown)}
          </div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 5, flexWrap: 'wrap' }}>
            <span className="cd-count">{d.count === 'business' ? 'business days' : 'calendar days'}</span>
            {d.status === 'open' && (
              <span className="cd-when" style={u === 'overdue'
                ? { background: '#FDECEC', color: '#B03030' }
                : hard ? { background: '#FFF0E0', color: '#A85B10' } : { background: '#EEF0FA', color: '#5A5680' }}>
                {whenWords(n)}
              </span>
            )}
          </div>
        </div>
      </div>

      {d.rule && <div className="cd-rule">{d.rule}{d.rolled ? ` · ${d.rolled.reason} → rolled ${d.rolled.direction}` : ''}</div>}
      {d.explain && <div className="cd-rule" style={{ color: '#56527a' }}>{d.explain}</div>}
      {d.quote && <div className="cd-quote">“{d.quote}”</div>}
      {!d.quote && d.source === 'default' && (
        <div className="cd-stamp">From the install defaults — no contract clause on file for this one.</div>
      )}

      {(d.statusBy || d.extendedReason) && (
        <div className="cd-stamp">
          {d.status === 'extended' && d.extendedTo
            ? <>Extended from {fmtShort(d.date)} to {fmtShort(d.extendedTo)}{d.extendedReason ? ` — ${d.extendedReason}` : ''}</>
            : <>{d.status} by {ctx.users_by_id[d.statusBy]?.name || 'someone'}{d.statusAt ? ` on ${fmtShort(String(d.statusAt).slice(0, 10))}` : ''}</>}
        </div>
      )}

      {d.status !== 'met' && d.status !== 'waived' && (
        <div className="cd-acts">
          <Btn sm kind="s" icon={<CheckCircle2 size={13} />} onClick={() => stamp('met')}>Mark met</Btn>
          <Btn sm kind="g" icon={<Ban size={13} />} onClick={() => stamp('waived')}>Waive</Btn>
          <Btn sm kind="g" icon={<CalendarClock size={13} />} onClick={() => setAct(act === 'ext' ? null : 'ext')}>Extend</Btn>
          {onOpen && <Btn sm kind="g" icon={<ArrowRight size={13} />} onClick={onOpen}>Open transaction</Btn>}
        </div>
      )}
      {(d.status === 'met' || d.status === 'waived') && (
        <div className="cd-acts">
          <Btn sm kind="g" icon={<Undo2 size={13} />} onClick={() => stamp('open', { statusBy: null, statusAt: null })}>Reopen</Btn>
        </div>
      )}

      {act === 'ext' && (
        <div className="fgrid" style={{ marginTop: 10 }}>
          <Field label="New date">
            <Inp type="date" value={extTo} onChange={e => setExtTo(e.target.value)} />
          </Field>
          <Field label="Reason">
            <Inp value={extWhy} onChange={e => setExtWhy(e.target.value)} placeholder="Amendment signed, inspector delayed…" />
          </Field>
          <div className="field full">
            <Btn kind="p" sm disabled={!isDate(extTo)}
              onClick={() => stamp('extended', { extendedTo: extTo, extendedReason: extWhy })}>
              Save extension
            </Btn>
            <span style={{ fontSize: 11.5, color: '#8E89A8', marginLeft: 10 }}>
              An extension keeps the original date on the record — nothing is overwritten.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- the modal */

export function TransactionModal({ ctx, txn, onClose, focusDeadline }) {
  const [t, setT] = useState(txn);
  const [tab, setTab] = useState('dates');
  const [cascadeReport, setCascadeReport] = useState(null);
  const [err, setErr] = useState('');
  const phases = phasesOf(ctx.settings);
  const contact = ctx.contacts.find(c => c.id === t.contact_id);
  const plan = agentPlan((ctx.users_by_id[t.owner_id] || {}).plan || ctx.settings.commissionDefaults);

  useEffect(() => { setT(txn); }, [txn.id]);

  const set = (k, v) => setT(prev => ({ ...prev, [k]: v }));
  const save = next => { const n = next || t; setT(n); ctx.upsertTransaction(n); };

  /* changing the effective (or close) date re-cascades every UNMET deadline
     and reports what moved. Met, waived, extended, absolute and hand-entered
     dates are left alone — see dates.js cascade(). */
  const recascade = (nextEffective, nextClose) => {
    const eff = nextEffective === undefined ? t.effectiveDate : nextEffective;
    const close = nextClose === undefined ? t.closeDate : nextClose;
    const r = cascade(t.deadlines || [], {
      effective: eff, closeDate: close,
      holidays: holidaysOf(ctx.settings), rollover: rolloverOf(ctx.settings),
      offsets: (t.deadlines && t.deadlines.length) ? null : offsetsOf(ctx.settings),
      assignee: t.owner_id,
    });
    const next = { ...t, effectiveDate: eff, closeDate: close, deadlines: r.deadlines };
    setCascadeReport(r);
    save(next);
  };

  const seedDates = () => {
    if (!isDate(t.effectiveDate)) { setErr('Set the effective date first — every deadline counts from it.'); return; }
    setErr('');
    const r = cascade(t.deadlines || [], {
      effective: t.effectiveDate, closeDate: t.closeDate,
      holidays: holidaysOf(ctx.settings), rollover: rolloverOf(ctx.settings),
      offsets: offsetsOf(ctx.settings), assignee: t.owner_id,
    });
    setCascadeReport(r);
    save({ ...t, deadlines: r.deadlines });
  };

  const calc = useMemo(() => computeCommission(t, plan, { capPaidToDate: capPaidBefore(ctx, t) }), [t, plan, ctx]);
  const openCount = (t.deadlines || []).filter(d => d.status !== 'met' && d.status !== 'waived').length;

  return (
    <ModalShell
      title={shortAddr(t.address)}
      sub={<>{cityOf(t.address)}{t.mls ? ` · MLS ${t.mls}` : ''} · {contact ? contact.name : 'no contact linked'}</>}
      badges={<>
        <SideChip side={t.side} />
        <Pill color={(phases.find(p => p.key === t.phase) || {}).color}>{(phases.find(p => p.key === t.phase) || {}).label}</Pill>
        <Tag>{usd(t.salePrice)}</Tag>
        {t.effectiveDate && <Tag>effective {fmtShort(t.effectiveDate)}</Tag>}
        {t.closeDate && <Tag>closes {fmtShort(t.closeDate)}</Tag>}
        <Tag>{openCount} open deadline{openCount === 1 ? '' : 's'}</Tag>
      </>}
      onClose={onClose}
    >
      <div className="mtabs">
        {[['dates', 'Critical dates'], ['detail', 'Deal'], ['checklist', 'Checklist'], ['money', 'Commission']].map(([k, l]) => (
          <button key={k} className={'mtab' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      <div className="m-left" style={{ gridColumn: '1/-1' }}>
        <ErrorNote>{err}</ErrorNote>

        {tab === 'dates' && (
          <>
            <div className="fgrid" style={{ marginBottom: 14 }}>
              <Field label="Effective / binding date" hint="Every deadline counts from this. Changing it re-cascades the unmet ones.">
                <Inp type="date" value={t.effectiveDate || ''} onChange={e => recascade(e.target.value, undefined)} />
              </Field>
              <Field label="Scheduled close date" hint="Anchors the walkthrough and closing rows.">
                <Inp type="date" value={t.closeDate || ''} onChange={e => recascade(undefined, e.target.value)} />
              </Field>
            </div>

            {cascadeReport && <CascadeReport r={cascadeReport} onDismiss={() => setCascadeReport(null)} />}

            <div className="toolbar">
              <Btn sm kind="s" icon={<RefreshCw size={13} />} onClick={seedDates}>
                {(t.deadlines || []).length ? 'Recompute from defaults' : 'Generate from defaults'}
              </Btn>
              <Btn sm kind="g" icon={<FileText size={13} />} onClick={() => ctx.go('contracts', { txn: t.id })}>
                Read dates off a contract
              </Btn>
              <span style={{ flex: 1 }} />
              <AddDeadline ctx={ctx} t={t} onAdd={d => save({ ...t, deadlines: [...(t.deadlines || []), d].sort(byDate) })} />
            </div>

            {(t.deadlines || []).length === 0 ? (
              <Empty>
                No dates yet. Upload the executed contract to read them off the clauses, or generate them from this
                install's default offsets and edit what the contract says differently.
              </Empty>
            ) : (
              <div className="cd-list">
                {(t.deadlines || []).slice().sort(byDate).map(d => (
                  <DeadlineRow key={d.key} ctx={ctx} t={t} d={d} focus={focusDeadline === d.key}
                    onChange={next => save({ ...t, deadlines: (t.deadlines || []).map(x => (x.key === d.key ? next : x)) })} />
                ))}
              </div>
            )}
            <LegalNote />
          </>
        )}

        {tab === 'detail' && <DealTab ctx={ctx} t={t} set={set} save={save} onClose={onClose} />}
        {tab === 'checklist' && <ChecklistTab ctx={ctx} t={t} save={save} />}
        {tab === 'money' && <MoneyTab ctx={ctx} t={t} calc={calc} plan={plan} set={set} save={save} />}
      </div>

      <div className="m-foot">
        <Btn kind="p" onClick={() => { save(); onClose(); }}>Save and close</Btn>
        <span className="m-foot-n">Deadline actions (met / waive / extend) save the moment you press them.</span>
      </div>
    </ModalShell>
  );
}

const byDate = (a, b) => String(effectiveDateOf(a) || '9999').localeCompare(String(effectiveDateOf(b) || '9999'));

/**
 * Cap dollars this agent had already paid BEFORE this transaction, WITHIN THE
 * SAME CAP PERIOD.
 *
 * Two things were wrong here and both of them write to the record, because
 * "Mark closed and snapshot the split" persists whatever this returns:
 *
 *  1. It summed every closed deal ever, with no cap-period filter — unlike
 *     capProgress() and replayYear(), which both filter. On 1 January it would
 *     show a fresh agent as already capped, cost the deal at the post-cap split
 *     and save a wrong capContribution into the transaction.
 *  2. Strict `<` on the close date meant two deals closing the SAME DAY never
 *     saw each other, so both were costed against the same cap balance. Order
 *     is now by close date then id: deterministic, and same-day deals stack.
 */
export function capPaidBefore(ctx, t) {
  const plan = agentPlan((ctx.users_by_id[t.owner_id] || {}).plan || ctx.settings.commissionDefaults);
  const on = closedOn(t) || t.closeDate || ctx.todayIso;
  const period = capPeriod(on, plan);
  const key = x => `${closedOn(x) || x.closeDate || ''}#${x.id || ''}`;
  const me = key({ ...t, id: t.id });
  const mine = (ctx.transactions || []).filter(x => {
    if (x.owner_id !== t.owner_id || x.status !== 'closed') return false;
    const d = closedOn(x) || x.closeDate || '';
    if (period && !(d >= period.start && d <= period.end)) return false;   // this cap period only
    return key(x) < me;                                                    // deterministic, same-day safe
  });
  return sum(mine, x => Number(x.capContribution) || 0);
}

function CascadeReport({ r, onDismiss }) {
  const { moved, kept, added } = r;
  const held = kept.filter(k => k.why !== 'unchanged');
  return (
    <div className="convert-banner fix" style={{ display: 'block' }}>
      <b>Re-cascaded.</b>{' '}
      {moved.length ? `${moved.length} date${moved.length === 1 ? '' : 's'} moved.` : 'Nothing moved.'}
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

function AddDeadline({ ctx, t, onAdd }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [mode, setMode] = useState('offset');
  const [date, setDate] = useState('');
  const [offset, setOffset] = useState(7);
  const [count, setCount] = useState('calendar');
  const [inclusive, setInclusive] = useState(false);
  const [anchor, setAnchor] = useState('effective');

  if (!open) return <Btn sm kind="g" icon={<Plus size={13} />} onClick={() => setOpen(true)}>Add a deadline</Btn>;

  const anchorDate = anchor === 'close' ? t.closeDate : t.effectiveDate;
  const preview = mode === 'offset' && isDate(anchorDate)
    ? computeDeadline({ anchorDate, offset: Number(offset), count, inclusive, rollover: rolloverOf(ctx.settings), holidays: holidaysOf(ctx.settings), anchorLabel: anchor === 'close' ? 'closing' : 'effective date' })
    : null;

  const add = () => {
    const key = 'x-' + uid().slice(0, 8);
    if (mode === 'absolute') {
      onAdd({ key, label: label || 'Deadline', date, status: 'open', source: 'manual', absolute: true,
        rule: 'entered by hand', explain: `Set to ${fmtShort(date)} by hand`, count: 'calendar', anchor: 'effective',
        assignee: t.owner_id, remindersSent: {} });
    } else if (preview) {
      onAdd({ key, label: label || 'Deadline', date: preview.date, offset: Number(offset), count, inclusive,
        anchor, rule: preview.rule, explain: preview.explain, skipped: preview.skipped, rolled: preview.rolled,
        status: 'open', source: 'manual', assignee: t.owner_id, remindersSent: {} });
    }
    setOpen(false); setLabel(''); setDate('');
  };

  return (
    <Card className="full" style={{ width: '100%', marginTop: 10 }}>
      <div className="fgrid">
        <Field label="What is it" full>
          <Inp value={label} onChange={e => setLabel(e.target.value)} placeholder="Addendum B — well inspection" />
        </Field>
        <Field label="How is it dated">
          <Sel value={mode} onChange={e => setMode(e.target.value)}
            options={[{ value: 'offset', label: 'Counted from a date' }, { value: 'absolute', label: 'A specific date the contract names' }]} />
        </Field>
        {mode === 'absolute' ? (
          <Field label="Date" hint="An absolute date never re-cascades — the contract named a day, not an offset.">
            <Inp type="date" value={date} onChange={e => setDate(e.target.value)} />
          </Field>
        ) : (
          <>
            <Field label="Anchor">
              <Sel value={anchor} onChange={e => setAnchor(e.target.value)}
                options={[{ value: 'effective', label: 'Effective date' }, { value: 'close', label: 'Closing date' }]} />
            </Field>
            <Field label="Days (negative = before)">
              <Inp type="number" value={offset} onChange={e => setOffset(e.target.value)} />
            </Field>
            <Field label="Counted as">
              <Sel value={count} onChange={e => setCount(e.target.value)}
                options={[{ value: 'calendar', label: 'Calendar days' }, { value: 'business', label: 'Business days' }]} />
            </Field>
            <div className="field">
              <Toggle on={inclusive} onChange={setInclusive} label="Inclusive start (anchor day counts as day one)" />
            </div>
          </>
        )}
      </div>
      {preview && <div className="cd-rule" style={{ marginTop: 8 }}>{preview.explain}</div>}
      <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
        <Btn kind="p" sm onClick={add} disabled={mode === 'absolute' ? !isDate(date) : !preview}>Add</Btn>
        <Btn kind="g" sm onClick={() => setOpen(false)}>Cancel</Btn>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------- tabs */

function DealTab({ ctx, t, set, save, onClose }) {
  const phases = phasesOf(ctx.settings);
  const [confirmDel, setConfirmDel] = useState(false);
  return (
    <>
      <div className="fgrid">
        <Field label="Property address" full>
          <Inp value={t.address || ''} onChange={e => set('address', e.target.value)} />
        </Field>
        <Field label="Side" hint="Inherited from the contact, overridable. Both sides is dual agency and counts as two units.">
          <Sel value={t.side || 'buyer'} onChange={e => set('side', e.target.value)}
            options={[{ value: 'buyer', label: 'Buyer' }, { value: 'seller', label: 'Seller' },
              { value: 'both', label: 'Both sides (dual agency)' }]} />
        </Field>
        <Field label="Phase">
          <Sel value={t.phase} onChange={e => movePhase(ctx, t, e.target.value)}
            options={phases.map(p => ({ value: p.key, label: p.label }))} />
        </Field>
        <Field label="MLS number"><Inp value={t.mls || ''} onChange={e => set('mls', e.target.value)} /></Field>
        <Field label="Sale price"><Inp type="number" value={t.salePrice || ''} onChange={e => set('salePrice', Number(e.target.value))} /></Field>
        <Field label="Earnest money"><Inp type="number" value={t.earnestAmount || ''} onChange={e => set('earnestAmount', Number(e.target.value))} /></Field>
        <Field label="Co-op agent"><Inp value={t.coopAgent || ''} onChange={e => set('coopAgent', e.target.value)} /></Field>
        <Field label="Co-op brokerage"><Inp value={t.coopBrokerage || ''} onChange={e => set('coopBrokerage', e.target.value)} /></Field>
        <Field label="Title company"><Inp value={t.titleCompany || ''} onChange={e => set('titleCompany', e.target.value)} /></Field>
        <Field label="Lender"><Inp value={t.lender || ''} onChange={e => set('lender', e.target.value)} /></Field>
        <Field label="Actual close date" hint="Set when it actually closed, which is often not the scheduled date.">
          <Inp type="date" value={t.closedActual || ''} onChange={e => set('closedActual', e.target.value)} />
        </Field>
        {ctx.isLeader && (
          <Field label="Assigned agent">
            <Sel value={t.owner_id || ''} onChange={e => set('owner_id', e.target.value)}
              options={ctx.users.filter(u => u.active !== false).map(u => ({ value: u.id, label: u.name }))} />
          </Field>
        )}
        <Field label="Notes" full><Txt value={t.notes || ''} onChange={e => set('notes', e.target.value)} /></Field>
      </div>

      {t.status === 'fell' && (
        <Card title="Fell through" sub="Kept on the record on purpose — this is how you learn where deals die." style={{ marginTop: 14 }}>
          <div className="fgrid">
            <Field label="Reason"><Inp value={t.fellReason || ''} onChange={e => set('fellReason', e.target.value)} /></Field>
            <Field label="Phase it died in">
              <Sel value={t.fellPhase || ''} onChange={e => set('fellPhase', e.target.value)}
                options={phases.map(p => ({ value: p.key, label: p.label }))} />
            </Field>
            <Field label="When"><Inp type="date" value={t.fellAt || ''} onChange={e => set('fellAt', e.target.value)} /></Field>
          </div>
        </Card>
      )}

      <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
        <Btn kind="s" onClick={() => save()}>Save</Btn>
        {!confirmDel
          ? <Btn kind="d" sm icon={<Trash2 size={13} />} onClick={() => setConfirmDel(true)}>Delete</Btn>
          : <>
            <span style={{ fontSize: 12.5, color: '#B03030' }}>Delete this transaction and its dates?</span>
            <Btn kind="d" sm onClick={() => { ctx.deleteTransaction(t.id); onClose(); }}>Yes, delete</Btn>
            <Btn kind="g" sm onClick={() => setConfirmDel(false)}>Keep it</Btn>
          </>}
      </div>
    </>
  );
}

function ChecklistTab({ ctx, t, save }) {
  const items = checklistFor(t.side, ctx.settings);
  const state = t.checklist || {};
  const toggle = key => {
    const cur = state[key] || {};
    save({ ...t, checklist: { ...state, [key]: { ...cur, done: cur.done ? null : ctx.todayIso } } });
  };
  const setDue = (key, due) => {
    const cur = state[key] || {};
    save({ ...t, checklist: { ...state, [key]: { ...cur, due } } });
  };
  const done = items.filter(i => (state[i.key] || {}).done).length;
  return (
    <>
      <SecTitle>{t.side === 'buyer' ? 'Buyer' : 'Listing'} checklist <span className="kc">{done}/{items.length}</span></SecTitle>
      <div className="onb-group">
        {items.map(i => {
          const e = state[i.key] || {};
          const over = e.due && !e.done && daysUntil(e.due, ctx.tz) < 0;
          return (
            <div key={i.key} className={'onb-item' + (e.done ? ' done' : '') + (over ? ' over' : '')}>
              <button className="onb-check" onClick={() => toggle(i.key)}>
                {e.done ? <CheckCircle2 size={16} /> : <span style={{ display: 'inline-block', width: 16 }} />}
              </button>
              <span className="onb-label">{i.label}</span>
              <input className="onb-date" type="date" value={e.due || ''} onChange={ev => setDue(i.key, ev.target.value)} />
              {i.dueOffset != null && !e.due && (
                <button className="linkbtn" onClick={() => setDue(i.key, addDays(ctx.todayIso, i.dueOffset))}>
                  +{i.dueOffset}d
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="cd-stamp">
        Checklist items are settings, not code. Editing them in Settings never destroys history — state is stored per
        item key, so a removed item simply stops rendering.
      </div>
      <SecTitle>Under contract</SecTitle>
      <div className="note">
        The under-contract checklist is the critical dates themselves — see the Critical dates tab. Ticking a
        deadline met there is what marks that step done.
      </div>
    </>
  );
}

function MoneyTab({ ctx, t, calc, plan, set, save }) {
  const canSee = ctx.isLeader || t.owner_id === ctx.me.id;
  if (!canSee) return <Empty>Not your transaction.</Empty>;
  return (
    <>
      <div className="fgrid" style={{ marginBottom: 14 }}>
        <Field label="Sale price"><Inp type="number" value={t.salePrice || ''} onChange={e => set('salePrice', Number(e.target.value))} /></Field>
        <Field label="Commission rate %" hint="Or set a flat amount below.">
          <Inp type="number" step="0.01" value={t.commissionRate || ''} onChange={e => set('commissionRate', Number(e.target.value))} />
        </Field>
        <Field label="Flat commission" hint="Overrides the rate when set.">
          <Inp type="number" value={t.flatCommission || ''} onChange={e => set('flatCommission', Number(e.target.value))} />
        </Field>
        <Field label="Gross commission override" hint="Derived from price × rate unless you set this.">
          <Inp type="number" value={t.grossOverride || ''} onChange={e => set('grossOverride', Number(e.target.value))} />
        </Field>
        <Field label="Referral fee out">
          <Inp type="number" value={t.referralOut || ''} onChange={e => set('referralOut', Number(e.target.value))} />
        </Field>
        <Field label="Referral fee type" hint="Comes off the top either way.">
          <Sel value={t.referralOutType || 'flat'} onChange={e => set('referralOutType', e.target.value)}
            options={[{ value: 'flat', label: 'Flat amount' }, { value: 'pct', label: '% of gross' }]} />
        </Field>
      </div>
      <Card title="How this pays out" sub={t.status === 'closed' ? 'Closed — this is the record.' : 'Projected. It moves if the price or the plan changes.'}>
        <div className="wf">
          {calc.lines.map((l, i) => (
            <div key={i} className={'wf-row' + (l.kind === 'total' ? ' tot' : '') + (l.value < 0 ? ' neg' : '')}>
              <span className="wl">
                {l.label}
                {l.note && <div className="wf-note" style={{ marginTop: 2 }}>{l.note}</div>}
              </span>
              <span className="wv">{l.value < 0 ? '−' : ''}{usd(Math.abs(l.value))}</span>
            </div>
          ))}
        </div>
        {calc.straddle && (
          <div className="note" style={{ marginTop: 12 }}>
            <b>Cap straddle.</b> The brokerage's {Math.round((1 - plan.keepPct / 100) * 100)}% would have been {usd(calc.brokerageDesired)}.
            {' '}{usd(calc.capContribution)} of it finished the cap and {usd(calc.brokerageDesired - calc.capContribution)} was treated at
            the post-cap split of {plan.postCapPct}%. Only cap dollars count as cap credit.
          </div>
        )}
        {calc.capRemainingAfter != null && (
          <div className="cap-wrap">
            <div className="cap-bar">
              <div className={'cap-fill' + (calc.capRemainingAfter <= 0 ? ' done' : '')}
                style={{ width: `${Math.min(100, Math.round((calc.capAfter / (plan.cap || 1)) * 100))}%` }} />
            </div>
            <div className="cap-legend">
              <span>{usd(calc.capAfter)} paid toward cap</span>
              <span>{calc.capRemainingAfter <= 0 ? 'capped out' : `${usd(calc.capRemainingAfter)} to go`}</span>
            </div>
          </div>
        )}
      </Card>
      <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Btn kind="s" onClick={() => save()}>Save</Btn>
        {t.status === 'active' && (
          <Btn kind="p" icon={<CheckCircle2 size={14} />} onClick={() => {
            const closeOn = t.closedActual || t.closeDate || ctx.todayIso;
            save({ ...t, status: 'closed', phase: 'closed', closedActual: closeOn,
              capContribution: calc.capContribution,
              commissionSnapshot: { gross: calc.gross, agentNet: calc.agentNet, toBrokerage: calc.toBrokerage, teamCut: calc.teamCut, at: closeOn } });
          }}>Mark closed and snapshot the split</Btn>
        )}
        <span style={{ fontSize: 11.5, color: '#8E89A8' }}>
          Closing snapshots the split so editing a plan later never rewrites history.
        </span>
      </div>
    </>
  );
}

/* -------------------------------------------------------------- new + lists */

function NewTransaction({ ctx, onClose, onCreated }) {
  const [contactId, setContactId] = useState('');
  const [address, setAddress] = useState('');
  const [side, setSide] = useState('buyer');
  const [price, setPrice] = useState('');
  const [rate, setRate] = useState(3);
  const [eff, setEff] = useState(ctx.todayIso);
  const [close, setClose] = useState('');
  const [seed, setSeed] = useState(true);

  const create = () => {
    const id = uid();
    const base = {
      id, owner_id: ctx.me.id, contact_id: contactId || null, side,
      phase: 'uc', status: 'active', address, mls: '',
      salePrice: Number(price) || 0, commissionRate: Number(rate) || 0,
      referralOutType: 'flat', referralOut: 0,
      effectiveDate: eff, closeDate: close || null, deadlines: [], checklist: {}, notes: '',
    };
    if (seed && isDate(eff)) {
      const r = cascade([], {
        effective: eff, closeDate: close || null,
        holidays: holidaysOf(ctx.settings), rollover: rolloverOf(ctx.settings),
        offsets: offsetsOf(ctx.settings), assignee: ctx.me.id,
      });
      base.deadlines = r.deadlines;
    }
    ctx.upsertTransaction(base);
    onCreated(id);
  };

  return (
    <ModalShell title="New transaction" sub="Under contract — let's get the dates right." onClose={onClose} width={620}>
      <div className="m-left" style={{ gridColumn: '1/-1' }}>
        <div className="fgrid">
          <Field label="Contact" full>
            <Sel value={contactId} onChange={e => {
              setContactId(e.target.value);
              const c = ctx.contacts.find(x => x.id === e.target.value);
              if (c) { setSide(c.side || 'buyer'); if (c.address && !address) setAddress(c.address); }
            }}>
              <option value="">— pick a contact —</option>
              {ctx.contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Sel>
          </Field>
          <Field label="Property address" full><Inp value={address} onChange={e => setAddress(e.target.value)} /></Field>
          <Field label="Side">
            <Sel value={side} onChange={e => setSide(e.target.value)}
              options={[{ value: 'buyer', label: 'Buyer' }, { value: 'seller', label: 'Seller' },
                { value: 'both', label: 'Both sides (dual agency)' }]} />
          </Field>
          <Field label="Sale price"><Inp type="number" value={price} onChange={e => setPrice(e.target.value)} /></Field>
          <Field label="Commission rate %"><Inp type="number" step="0.01" value={rate} onChange={e => setRate(e.target.value)} /></Field>
          <Field label="Effective / binding date"><Inp type="date" value={eff} onChange={e => setEff(e.target.value)} /></Field>
          <Field label="Scheduled close"><Inp type="date" value={close} onChange={e => setClose(e.target.value)} /></Field>
          <div className="field full">
            <Toggle on={seed} onChange={setSeed} label="Generate the critical dates from this install's defaults" />
            <div style={{ fontSize: 11.5, color: '#8E89A8', marginTop: 6 }}>
              You can also read them off the executed contract afterwards, which fills in the clause text and the
              deadlines this brokerage's defaults don't cover.
            </div>
          </div>
        </div>
        <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
          <Btn kind="p" onClick={create} disabled={!address}>Create</Btn>
          <Btn kind="g" onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </ModalShell>
  );
}

function ClosedTable({ ctx, list, onOpen }) {
  const seesAll = ctx.isLeader || ctx.isCoordinator;
  if (!list.length) return <Empty>Nothing closed yet in the data you can see.</Empty>;
  /* A deal dragged into the Closed column never wrote a snapshot. Falling back
     to the engine means it reports its real gross and net instead of $0 —
     marked with an asterisk, because a computed figure can move and a
     snapshotted one cannot. */
  const netOf = t => {
    const snap = t.commissionSnapshot && Number(t.commissionSnapshot.agentNet);
    if (Number.isFinite(snap) && snap !== 0) return snap;
    const plan = agentPlan((ctx.users_by_id[t.owner_id] || {}).plan || ctx.settings.commissionDefaults);
    return computeCommission(t, plan, { capPaidToDate: capPaidBefore(ctx, t) }).agentNet;
  };
  const anyEstimated = list.some(isEstimated);
  return (
    <>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr>
            <th>Property</th><th>Side</th><th>Closed</th><th>Price</th><th>Gross</th>
            {seesAll && <th>Agent</th>}<th>Net to agent</th>
          </tr></thead>
          <tbody>
            {list.slice().sort((a, b) => String(closedOn(b)).localeCompare(String(closedOn(a)))).map(t => {
              const est = isEstimated(t);
              return (
                <tr key={t.id} onClick={() => onOpen(t.id)}>
                  <td className="namecell">{shortAddr(t.address)}</td>
                  <td><SideChip side={t.side} /></td>
                  <td>{fmtShort(closedOn(t))}</td>
                  <td>{usd(t.salePrice)}</td>
                  <td title={est ? 'Computed now — no split was snapshotted when this closed' : 'Snapshotted at close'}>
                    {usd(txGross(t))}{est ? '*' : ''}
                  </td>
                  {seesAll && <td>{ctx.users_by_id[t.owner_id]?.name || '—'}</td>}
                  <td title={est ? 'Computed now — no split was snapshotted when this closed' : 'Snapshotted at close'}>
                    {usd(netOf(t))}{est ? '*' : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="cd-stamp">
        Closed on the actual close date where one is recorded, otherwise the scheduled one.
        {anyEstimated && ' * computed from the deal as it stands today — this one was closed without snapshotting the split, so it will move if the price or the plan changes. Open it and press “Mark closed and snapshot the split” to fix that.'}
      </div>
    </>
  );
}

function FellTable({ ctx, list, onOpen }) {
  const seesAll = ctx.isLeader || ctx.isCoordinator;
  const phases = phasesOf(ctx.settings);
  if (!list.length) return <Empty>No deals have fallen through in the data you can see. Long may it last.</Empty>;
  return (
    <>
      <div className="note" style={{ marginBottom: 12 }}>
        Fell through is an outcome, not a delete. Keeping these is how you find out that, say, four of your last six
        dead deals died at financing.
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Property</th><th>Side</th><th>Died in</th><th>When</th><th>Reason</th>{seesAll && <th>Agent</th>}<th>Price</th></tr></thead>
          <tbody>
            {list.map(t => (
              <tr key={t.id} onClick={() => onOpen(t.id)}>
                <td className="namecell">{shortAddr(t.address)}</td>
                <td><SideChip side={t.side} /></td>
                <td>{(phases.find(p => p.key === t.fellPhase) || {}).label || '—'}</td>
                <td>{t.fellAt ? fmtShort(t.fellAt) : '—'}</td>
                <td>{t.fellReason || '—'}</td>
                {seesAll && <td>{ctx.users_by_id[t.owner_id]?.name || '—'}</td>}
                <td>{usd(t.salePrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
