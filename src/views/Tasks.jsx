/* ============================================================================
   Tasks.

   NOT A PORT of ProyTech's tasks screen, deliberately. That one carries three
   scoring knobs — revenue, urgency, effort — and an AI ranking built on them,
   because ProyTech's tasks are freeform and mostly undated: something has to
   decide what comes first.

   Dwell's tasks are mostly the opposite. Contracts.jsx already creates one per
   contract deadline, with a real date off a real clause. The date IS the
   urgency, and asking somebody to score a task the contract already scored is
   work for its own sake.

   WHAT THIS SCREEN IS FOR, THOUGH, IS THE PART WORTH SAYING: those tasks were
   already being written and nothing displayed them. Every contract uploaded
   with "create tasks" ticked generated deadline tasks that no screen in the
   product showed. This is not a new feature so much as opening the curtains on
   one that was already running.

   A task links back to the file it came from through transaction_id and
   contact_id — real columns, not ProyTech's loose leadId string — so "what is
   this?" is one click rather than a name match.
   ========================================================================== */

import React, { useMemo, useState } from 'react';
import { CheckCircle2, Circle, Plus, FileText, Contact2, Trash2 } from 'lucide-react';
import { Card, Btn, Empty, Inp, Pill, Sel } from '../components/ui';
import { isDate, diffDays, fmtLong } from '../lib/dates';
import { TASK_BUCKETS, bucketOf, byDue } from '../lib/tasks';
import { uid } from '../lib/format';
import { BRAND } from '../lib/brand';

export default function Tasks({ ctx }) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [scope, setScope] = useState('mine');

  const me = ctx.me || {};
  const today = ctx.todayIso;

  /* A leader or coordinator reads every task the policy gives them; the
     default view is still their own, because a list of everybody's deadlines
     is a report rather than a to-do list. */
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
    [all]
  );

  const grouped = useMemo(() => {
    const m = {};
    for (const b of TASK_BUCKETS) m[b.key] = [];
    for (const t of open) m[bucketOf(t, today)].push(t);
    return m;
  }, [open, today]);

  const add = () => {
    const t = title.trim();
    if (!t) return;
    ctx.upsertTask({
      id: uid(), user_id: me.id, transaction_id: null, contact_id: null,
      title: t, due: isDate(due) ? due : null, done: false, kind: 'manual',
      created_at: new Date().toISOString(),
    });
    setTitle(''); setDue('');
  };

  const toggle = t => ctx.upsertTask({
    ...t, done: !t.done, doneAt: !t.done ? new Date().toISOString() : null,
  });

  /* Where a task came from. A deadline task carries the transaction; a task
     somebody typed carries nothing, and says nothing rather than pretending. */
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
    return (
      <div className="tk-row" key={t.id}>
        <button className="tk-check" onClick={() => toggle(t)} title={t.done ? 'Mark not done' : 'Mark done'}>
          {t.done ? <CheckCircle2 size={18} /> : <Circle size={18} />}
        </button>
        <div className="tk-mid">
          <div className={'tk-title' + (t.done ? ' done' : '')}>{t.title}</div>
          <div className="tk-meta">
            {isDate(t.due)
              ? <span className={'tk-due' + (late ? ' late' : '')}>{fmtLong(t.due)}</span>
              : <span className="tk-due none">no date</span>}
            {t.kind === 'deadline' && <Pill color="${BRAND.colors.indigo}">from the contract</Pill>}
            {origin && (
              <button className="tk-origin" onClick={origin.go}>
                <O size={11} />{origin.label}
              </button>
            )}
            {t.note && <span className="tk-note">{t.note}</span>}
          </div>
        </div>
        <button className="tk-del" onClick={() => ctx.deleteTask(t.id)} title="Delete">
          <Trash2 size={14} />
        </button>
      </div>
    );
  };

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

      <Card
        title="Open"
        sub={`${open.length} open${done.length ? ` · ${done.length} done` : ''}`}
        right={canSeeAll && (
          <Sel
            value={scope}
            onChange={e => setScope(e.target.value)}
            options={[{ value: 'mine', label: 'My tasks' }, { value: 'all', label: 'Everyone' }]}
          />
        )}
      >
        {!open.length && <Empty>Nothing open. Upload a contract and its deadlines land here.</Empty>}
        {TASK_BUCKETS.map(b => grouped[b.key].length > 0 && (
          <div className="tk-grp" key={b.key}>
            <div className={'tk-grp-h' + (b.key === 'overdue' ? ' late' : '')}>
              {b.label}<span className="tk-grp-n">{grouped[b.key].length}</span>
            </div>
            {grouped[b.key].map(Row)}
          </div>
        ))}
      </Card>

      {done.length > 0 && (
        <Card
          title="Done"
          right={<Btn sm onClick={() => setShowDone(v => !v)}>{showDone ? 'Hide' : `Show ${done.length}`}</Btn>}
        >
          {showDone
            ? done.slice(0, 50).map(Row)
            : <Empty>{done.length} completed. The Activity screen shows what was finished and when.</Empty>}
        </Card>
      )}
    </>
  );
}
