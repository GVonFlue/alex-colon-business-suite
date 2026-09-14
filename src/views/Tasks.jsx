/* ============================================================================
   Tasks.

   REWRITTEN to carry ProyTech's task screen treatment: a filter row with live
   counts, a Focus list, and rows dense enough to scan. The old version was a
   correct list and looked like a placeholder next to the product it sits
   beside.

   WHAT IT DOES NOT TAKE FROM PROYTECH, AND WHY.

   ProyTech scores every task on revenue, urgency and effort and ranks with an
   AI pass over those three. That exists because ProyTech's tasks are freeform
   and mostly undated, so something has to decide what comes first.

   Half of the tasks here are not freeform. Contracts.jsx writes one per
   contract deadline, off a real clause, with a real date. The date already IS
   the urgency, and asking somebody to score a task the contract scored is work
   for its own sake.

   So scoring is available on MANUAL tasks and absent on deadline tasks, and
   the Focus list ranks by what is actually known about each: a deadline task
   by how close its date is, a manual one by impact times urgency. One list,
   two honest sources of order, and nobody typing a number the contract already
   answered.

   FOCUS IS PORTED WHOLE, because the mechanism is better than a boolean. It
   stores the DAY it was set rather than true, so it expires on its own with no
   nightly job, no timer, and it is still correct if nobody opens the CRM for
   three days. The day rolls at 4am so working late does not clear the list out
   from under you mid-evening.
   ========================================================================== */

import React, { useMemo, useState } from 'react';
import {
  CheckCircle2, Circle, Plus, FileText, Contact2, Trash2, Target, Sliders,
} from 'lucide-react';
import { Card, Btn, Empty, Inp, Pill, Sel } from '../components/ui';
import { isDate, diffDays, fmtLong } from '../lib/dates';
import { TASK_BUCKETS, bucketOf, byDue } from '../lib/tasks';
import { uid } from '../lib/format';
import { BRAND } from '../lib/brand';

/* Local, not imported: lib/format.js does not export a numeric coercion and
   adding one repo-wide for a single screen is a wider change than this needs.
   Guards against a task saved before the scoring fields existed, where
   t.impact is undefined and undefined * 3 is NaN. */
const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);

/* ---------------------------------------------------------------- focus ---
   Ported from ProyTech. See the header for why it is a day and not a boolean. */
const FOCUS_ROLLOVER_HOUR = 4;
const FOCUS_CAP = 6;

function focusDay(now) {
  const d = now ? new Date(now) : new Date();
  if (d.getHours() < FOCUS_ROLLOVER_HOUR) d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}
const isFocus = t => !!t && t.focusDate === focusDay();

/* Picking a task counts once per day however many times it is toggled, so the
   pile can show what somebody keeps choosing and not finishing. lastFocusDay
   is the guard: without it, off and on in one afternoon reads as two picks. */
function withFocus(t, on) {
  const day = focusDay();
  if (!on) return { ...t, focusDate: '' };
  const firstToday = t.lastFocusDay !== day;
  return {
    ...t, focusDate: day, lastFocusDay: day,
    focusCount: num(t.focusCount) + (firstToday ? 1 : 0),
  };
}

/*
 * What to work on first, from what is actually known.
 *
 * A deadline task is ordered by its date, because the contract set it. A
 * manual task is ordered by impact times urgency, because nothing else did.
 * Deliberately NOT one blended score across both: a contract deadline three
 * days out and a typed task somebody rated 5 are not comparable quantities,
 * and pretending they are produces a confident ordering nobody can explain.
 */
function priority(t, todayIso) {
  if (t.kind === 'deadline' && isDate(t.due)) {
    const n = diffDays(todayIso, t.due);
    return { score: 1000 - Math.max(n, -30), why: n < 0 ? `${Math.abs(n)}d overdue` : n === 0 ? 'due today' : `${n}d out` };
  }
  const s = num(t.impact || 3) * num(t.urgency || 3);
  return { score: s, why: `impact ${num(t.impact || 3)} · urgency ${num(t.urgency || 3)}` };
}

export default function Tasks({ ctx }) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [scope, setScope] = useState('mine');
  const [filter, setFilter] = useState('open');
  const [bucket, setBucket] = useState('all');
  const [editing, setEditing] = useState(null);

  const me = ctx.me || {};
  const today = ctx.todayIso;

  const canSeeAll = ctx.isLeader || ctx.isCoordinator;
  const all = useMemo(() => {
    const list = (ctx.tasks || []).filter(Boolean);
    return scope === 'mine' || !canSeeAll
      ? list.filter(t => String(t.user_id || '') === String(me.id || ''))
      : list;
  }, [ctx.tasks, scope, canSeeAll, me.id]);

  const open = useMemo(() => all.filter(t => !t.done).sort(byDue), [all]);
  const done = useMemo(
    () => all.filter(t => t.done).sort((a, b) => String(b.doneAt || '').localeCompare(String(a.doneAt || ''))),
    [all],
  );

  /* Counts for the chip row. Computed over OPEN tasks, because a chip that
     counts finished work is a chip nobody clicks twice. */
  const counts = useMemo(() => {
    const c = { all: open.length, overdue: 0, today: 0, week: 0, later: 0, none: 0 };
    for (const t of open) c[bucketOf(t, today)] += 1;
    return c;
  }, [open, today]);

  const focused = useMemo(
    () => open.filter(isFocus).sort((a, b) => priority(b, today).score - priority(a, today).score),
    [open, today],
  );

  const visible = useMemo(() => {
    const base = filter === 'done' ? done : open;
    return bucket === 'all' ? base : base.filter(t => bucketOf(t, today) === bucket);
  }, [filter, bucket, open, done, today]);

  const grouped = useMemo(() => {
    const m = {};
    for (const b of TASK_BUCKETS) m[b.key] = [];
    for (const t of visible) m[bucketOf(t, today)].push(t);
    return m;
  }, [visible, today]);

  const add = () => {
    const t = title.trim();
    if (!t) return;
    ctx.upsertTask({
      id: uid(), user_id: me.id, transaction_id: null, contact_id: null,
      title: t, due: isDate(due) ? due : null, done: false, kind: 'manual',
      /* Defaults, not blanks. A manual task with no scores would sort below
         every scored one forever, which quietly hides the thing somebody just
         typed. Three is the middle of the scale. */
      impact: 3, urgency: 3, effort: 3,
      created_at: new Date().toISOString(),
    });
    setTitle(''); setDue('');
  };

  const toggle = t => ctx.upsertTask({
    ...t, done: !t.done, doneAt: !t.done ? new Date().toISOString() : null,
  });

  const toggleFocus = t => {
    if (!isFocus(t) && focused.length >= FOCUS_CAP) return;
    ctx.upsertTask(withFocus(t, !isFocus(t)));
  };

  const originOf = t => {
    if (t.transaction_id) {
      const txn = (ctx.transactions || []).find(x => x.id === t.transaction_id);
      if (txn) return { icon: FileText, label: String(txn.address || 'transaction').split(',')[0], go: () => ctx.go('transactions', { id: txn.id }) };
    }
    if (t.contact_id) {
      const c = (ctx.contacts || []).find(x => x.id === t.contact_id);
      if (c) return { icon: Contact2, label: c.name || 'contact', go: () => ctx.go('contacts', { id: c.id }) };
    }
    return null;
  };

  const Row = t => {
    const origin = originOf(t);
    const late = !t.done && isDate(t.due) && diffDays(today, t.due) < 0;
    const O = origin && origin.icon;
    const foc = isFocus(t);
    const manual = t.kind !== 'deadline';
    const p = priority(t, today);
    return (
      <div className={'tk-row' + (foc ? ' foc' : '')} key={t.id}>
        <button className="tk-check" onClick={() => toggle(t)} title={t.done ? 'Mark not done' : 'Mark done'}>
          {t.done ? <CheckCircle2 size={18} /> : <Circle size={18} />}
        </button>
        <div className="tk-mid">
          <div className={'tk-title' + (t.done ? ' done' : '')}>{t.title}</div>
          <div className="tk-meta">
            {isDate(t.due)
              ? <span className={'tk-due' + (late ? ' late' : '')}>{fmtLong(t.due)}</span>
              : <span className="tk-due none">no date</span>}
            {t.kind === 'deadline' && <Pill color={BRAND.colors.indigo}>from the contract</Pill>}
            {origin && (
              <button className="tk-origin" onClick={origin.go}>
                <O size={11} />{origin.label}
              </button>
            )}
            {manual && <span className="tk-score">{p.why}</span>}
            {t.note && <span className="tk-note">{t.note}</span>}
          </div>

          {/* The dials, only on a manual task and only when opened. A deadline
              task never shows them: its date is the score. */}
          {manual && editing === t.id && (
            <div className="tk-dials">
              {[['impact', 'Impact'], ['urgency', 'Urgency'], ['effort', 'Effort']].map(([k, label]) => (
                <label className="tk-dial" key={k}>
                  <span>{label}</span>
                  <Sel
                    value={String(num(t[k] || 3))}
                    onChange={e => ctx.upsertTask({ ...t, [k]: Number(e.target.value) })}
                    options={[1, 2, 3, 4, 5].map(n => ({ value: String(n), label: String(n) }))}
                  />
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="tk-acts">
          <button
            className={'tk-act' + (foc ? ' on' : '')}
            onClick={() => toggleFocus(t)}
            disabled={!foc && focused.length >= FOCUS_CAP}
            title={foc ? 'Take off today\u2019s focus' : focused.length >= FOCUS_CAP ? `Focus is full at ${FOCUS_CAP}` : 'Work on this today'}
          >
            <Target size={14} />
          </button>
          {manual && (
            <button
              className={'tk-act' + (editing === t.id ? ' on' : '')}
              onClick={() => setEditing(editing === t.id ? null : t.id)}
              title="Impact, urgency, effort"
            >
              <Sliders size={14} />
            </button>
          )}
          <button className="tk-act del" onClick={() => ctx.deleteTask(t.id)} title="Delete">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    );
  };

  const Chip = ({ k, label, n }) => (
    <button
      className={'tk-chip' + (bucket === k ? ' on' : '') + (k === 'overdue' && n > 0 ? ' late' : '')}
      onClick={() => setBucket(k)}
    >
      {label}{n !== undefined && <span className="tk-chip-n">{n}</span>}
    </button>
  );

  return (
    <>
      <Card
        title="Add a task"
        sub="Deadlines from a contract arrive here on their own — this is for everything else."
      >
        <div className="tk-add">
          <Inp
            placeholder="What needs doing?"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()}
          />
          <Inp type="date" value={due} onChange={e => setDue(e.target.value)} />
          <Btn kind="p" icon={<Plus size={15} />} onClick={add} disabled={!title.trim()}>Add</Btn>
        </div>
      </Card>

      {/* Focus. Above the list, because it is the answer to "what now" and the
          list below is the answer to "what else". */}
      {focused.length > 0 && (
        <Card
          title="Focus"
          sub={`${focused.length} of ${FOCUS_CAP} · clears at 4am on its own`}
          right={<Pill color={BRAND.colors.gold}>today</Pill>}
        >
          {focused.map(Row)}
        </Card>
      )}

      <Card
        title={filter === 'done' ? 'Done' : 'Open'}
        sub={`${open.length} open${done.length ? ` · ${done.length} done` : ''}`}
        right={canSeeAll && (
          <Sel
            value={scope}
            onChange={e => setScope(e.target.value)}
            options={[{ value: 'mine', label: 'My tasks' }, { value: 'all', label: 'Everyone' }]}
          />
        )}
      >
        <div className="tk-bar">
          <div className="tk-chips">
            <button className={'tk-chip' + (filter === 'open' ? ' on' : '')} onClick={() => setFilter('open')}>Open</button>
            <button className={'tk-chip' + (filter === 'done' ? ' on' : '')} onClick={() => setFilter('done')}>Done</button>
          </div>
          <div className="tk-chips">
            <Chip k="all" label="All" n={counts.all} />
            <Chip k="overdue" label="Overdue" n={counts.overdue} />
            <Chip k="today" label="Today" n={counts.today} />
            <Chip k="week" label="Next 7" n={counts.week} />
            <Chip k="none" label="No date" n={counts.none} />
          </div>
        </div>

        {!visible.length && (
          <Empty>
            {filter === 'done'
              ? 'Nothing finished yet.'
              : bucket === 'all'
                ? 'Nothing open. Upload a contract and its deadlines land here.'
                : 'Nothing in this one.'}
          </Empty>
        )}

        {TASK_BUCKETS.map(b => grouped[b.key].length > 0 && (
          <div className="tk-grp" key={b.key}>
            <div className={'tk-grp-h' + (b.key === 'overdue' ? ' late' : '')}>
              {b.label}<span className="tk-grp-n">{grouped[b.key].length}</span>
            </div>
            {grouped[b.key].map(Row)}
          </div>
        ))}
      </Card>
    </>
  );
}
