/* ============================================================================
   Tasks, modeled on ProyTech's tasks screen.

   WHAT CAME ACROSS: the add bar with Today / Tomorrow chips, the Who / Show /
   When filters with counts, the overdue banner, Focus and Free time as
   sections, a card per task with a tap-to-reschedule due chip, the "picked N×"
   marker, and the edit modal.

   WHAT DID NOT, ON PURPOSE: ProyTech's Impact / Urgency / Effort knobs and its
   AI ranking. Most tasks in this install come off an executed contract with a
   real date on a real clause. The date IS the urgency here, and a ranking that
   lifts "call the photographer" above an inspection deadline is how a client
   loses their earnest money. Open tasks sort by due date, overdue first.

   Focus and Free time are SECTIONS, not another filter. Who / Show / When
   slice both; filters filter, sections group.

   A task links back to where it came from through transaction_id and
   contact_id, real columns, so "what is this?" is one click. Extra fields
   (focusDate, focusCount, doneBy) ride in the row's data jsonb, so none of
   this needed a migration.
   ========================================================================== */

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle, CalendarClock, CheckCircle2, Circle, Contact2, FileText,
  ListTodo, Pencil, Plus, Target, Trash2,
} from 'lucide-react';
import { Btn, Empty, Field, Inp, ModalShell, Seg, Sel, Txt } from '../components/ui';
import { addDays, diffDays, isDate } from '../lib/dates';
import { byDue, dueLabel, FOCUS_CAP, focusDay, isFocus, whenOf, withFocus } from '../lib/tasks';
import { uid } from '../lib/format';
import { alpha } from '../lib/color';
import { BRAND } from '../lib/brand';

const C = BRAND.colors;
const OWNER_COLORS = [C.cobalt, C.green, C.gold, C.indigo, C.red, C.ink];

export default function Tasks({ ctx }) {
  const me = ctx.me || {};
  const today = ctx.todayIso;
  const fday = focusDay(ctx.tz);
  const canSeeAll = !!(ctx.isLeader || ctx.isCoordinator);

  const team = useMemo(
    () => (ctx.users || []).filter(u => u && u.active !== false),
    [ctx.users]
  );
  const nameOf = id => {
    if (String(id || '') === String(me.id || '')) return 'Me';
    const u = (ctx.users_by_id || {})[id];
    return (u && (u.name || u.email)) || 'Unassigned';
  };
  const colorOf = id => {
    const i = team.findIndex(u => String(u.id) === String(id));
    return OWNER_COLORS[(i < 0 ? 0 : i) % OWNER_COLORS.length];
  };

  const [title, setTitle] = useState('');
  const [addDue, setAddDue] = useState(today);
  const [addOwner, setAddOwner] = useState(me.id || '');
  const [who, setWho] = useState('mine');
  const [show, setShow] = useState('open');
  const [when, setWhen] = useState('all');
  const [edit, setEdit] = useState(null);

  const add = () => {
    const t = title.trim();
    if (!t) return;
    ctx.upsertTask({
      id: uid(), user_id: canSeeAll ? (addOwner || me.id) : me.id,
      transaction_id: null, contact_id: null,
      title: t, due: isDate(addDue) ? addDue : null, done: false, kind: 'manual',
      created_at: new Date().toISOString(),
    });
    setTitle('');
  };

  const toggle = t => ctx.upsertTask({
    ...t, done: !t.done,
    doneAt: t.done ? null : new Date().toISOString(),
    doneBy: t.done ? null : (me.id || null),
  });

  const remove = t => {
    const msg = t.kind === 'deadline'
      ? 'Delete this task? The deadline stays on the transaction; only the task goes.'
      : 'Delete this task?';
    if (window.confirm(msg)) ctx.deleteTask(t.id);
  };

  /* ---------------------------------------------------------- filtering */
  const base = useMemo(() => {
    const passWho = t => {
      if (!canSeeAll || who === 'mine') return String(t.user_id || '') === String(me.id || '');
      if (who === 'all') return true;
      return String(t.user_id || '') === String(who);
    };
    const passShow = t => show === 'all' || (show === 'open' ? !t.done : !!t.done);
    return (ctx.tasks || []).filter(Boolean).filter(t => passWho(t) && passShow(t));
  }, [ctx.tasks, who, show, canSeeAll, me.id]);

  const counts = useMemo(() => ({
    today: base.filter(t => whenOf(t, today) === 'today').length,
    later: base.filter(t => whenOf(t, today) === 'later').length,
    none: base.filter(t => whenOf(t, today) === 'none').length,
    all: base.length,
  }), [base, today]);
  const overdue = base.filter(t => !t.done && isDate(t.due) && diffDays(today, t.due) < 0).length;

  const ordered = useMemo(() => {
    const list = base.filter(t => when === 'all' || whenOf(t, today) === when);
    const open = list.filter(t => !t.done).sort(byDue);
    const done = list.filter(t => t.done)
      .sort((a, b) => String(b.doneAt || '').localeCompare(String(a.doneAt || '')));
    return [...open, ...done];
  }, [base, when, today]);

  const focusList = ordered.filter(t => isFocus(t, fday));
  const pile = ordered.filter(t => !isFocus(t, fday));
  const focusOpen = focusList.filter(t => !t.done).length;
  const pileOpen = pile.filter(t => !t.done).length;
  const over = focusOpen > FOCUS_CAP;

  const others = team.filter(u => String(u.id) !== String(me.id || ''));

  /* ---------------------------------------------------------- origin */
  const originOf = t => {
    if (t.transaction_id) {
      const txn = (ctx.transactions || []).find(x => x.id === t.transaction_id);
      if (txn) return { icon: FileText, label: String(txn.address || 'Transaction').split(',')[0], go: () => ctx.go('transactions', { id: txn.id }) };
    }
    if (t.contact_id) {
      const c = (ctx.contacts || []).find(x => x.id === t.contact_id);
      if (c) return { icon: Contact2, label: c.name || 'Contact', go: () => ctx.go('contacts', { id: c.id }) };
    }
    return null;
  };

  /* ---------------------------------------------------------- a row */
  const row = t => {
    const origin = originOf(t);
    const O = origin && origin.icon;
    const du = isDate(t.due) ? diffDays(today, t.due) : null;
    const dueColor = du == null ? '#8b88a0' : du < 0 ? C.red : du === 0 ? C.gold : '#5A5680';
    const dueBg = du != null && du < 0 ? alpha(C.red, 0.1) : du === 0 ? alpha(C.gold, 0.14) : '#F0F1F7';
    const focused = isFocus(t, fday);
    const picks = Number(t.focusCount) || 0;
    const oc = colorOf(t.user_id);
    return (
      <div key={t.id} className={'card task-card' + (t.done ? ' done' : '')}>
        <button className={'task-check' + (t.done ? ' on' : '')} onClick={() => toggle(t)}
          title={t.done ? 'Mark open' : 'Mark done'} aria-label={t.done ? 'Mark open' : 'Mark done'}>
          {t.done ? <CheckCircle2 size={22} /> : <Circle size={22} />}
        </button>

        <div className="task-main">
          <div className="task-title">{t.title}</div>
          {t.note && !t.done && <div className="task-notes">{t.note}</div>}
          <div className="task-meta">
            {canSeeAll && (
              <span className="pill" style={{ background: alpha(oc, 0.1), color: oc }}>
                <span className="dot" style={{ background: oc }} />{nameOf(t.user_id)}
              </span>
            )}
            {t.kind === 'deadline' && (
              <span className="pill" style={{ background: alpha(C.indigo, 0.1), color: C.indigo }}>From the contract</span>
            )}
            {origin && (
              <button className="task-origin" onClick={origin.go} title="Open it">
                <O size={11} />{origin.label}
              </button>
            )}
            <label className="task-due-chip" style={{ background: dueBg, color: dueColor }} title="Tap to reschedule">
              <CalendarClock size={11} />{dueLabel(t, today)}
              <input type="date" value={t.due || ''} onChange={e => ctx.upsertTask({ ...t, due: e.target.value || null })} />
            </label>
            {!t.done && !focused && picks > 1 && (
              <span className="task-picked"
                title={`Pulled into Focus on ${picks} separate days and still open. Worth asking whether it is blocked or badly scoped.`}>
                picked {picks}×
              </span>
            )}
          </div>
        </div>

        <div className="task-acts">
          {!t.done && (
            <button className={'task-focus' + (focused ? ' on' : '')} aria-pressed={focused}
              onClick={() => ctx.upsertTask(withFocus(t, !focused, fday))}
              title={focused ? 'Take out of Focus' : 'Pull into Focus for today'}>
              <Target size={15} />
            </button>
          )}
          <button className="task-icon" onClick={() => setEdit(t)} title="Edit" aria-label="Edit task"><Pencil size={14} /></button>
          <button className="task-icon del" onClick={() => remove(t)} title="Delete" aria-label="Delete task"><Trash2 size={14} /></button>
        </div>
      </div>
    );
  };

  const tomorrow = addDays(today, 1);

  return (
    <>
      {/* ------------------------------------------------------- add bar */}
      <div className="card task-addcard">
        <div className="task-add">
          <input className="task-input" value={title} onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add(); }}
            placeholder="Add a task and hit Enter…" aria-label="New task" />
          <div className="task-daypick">
            <button type="button" className={'day-chip' + (addDue === today ? ' on' : '')} onClick={() => setAddDue(today)}>Today</button>
            <button type="button" className={'day-chip' + (addDue === tomorrow ? ' on' : '')} onClick={() => setAddDue(tomorrow)}>Tomorrow</button>
            <label className="day-date"><CalendarClock size={14} />
              <input type="date" value={addDue || ''} onChange={e => setAddDue(e.target.value || today)} aria-label="Due date" />
            </label>
          </div>
          {canSeeAll && team.length > 1 && (
            <Sel className="selctl task-owner" value={addOwner} onChange={e => setAddOwner(e.target.value)}
              aria-label="Assign to"
              options={team.map(u => ({ value: u.id, label: String(u.id) === String(me.id) ? 'For me' : `For ${u.name || u.email}` }))} />
          )}
          <Btn kind="p" icon={<Plus size={16} />} onClick={add} disabled={!title.trim()}>Add</Btn>
        </div>
        <div className="task-add-sub">Contract deadlines land here on their own. This is for everything else.</div>
      </div>

      {/* ------------------------------------------------------- filters */}
      <div className="task-filters">
        {canSeeAll && (
          <div className="task-who">
            <Seg value={who === 'mine' || who === 'all' ? who : 'person'} onChange={setWho}
              options={[{ value: 'mine', label: 'Mine' }, { value: 'all', label: 'Everyone' }]} />
            {others.length > 0 && (
              <Sel className="selctl" value={who === 'mine' || who === 'all' ? '' : who}
                onChange={e => setWho(e.target.value || 'all')} aria-label="Someone on the team"
                options={[{ value: '', label: 'Someone on the team…' }, ...others.map(u => ({ value: u.id, label: u.name || u.email }))]} />
            )}
          </div>
        )}
        <Seg value={show} onChange={setShow}
          options={[{ value: 'open', label: 'Open' }, { value: 'done', label: 'Done' }, { value: 'all', label: 'All' }]} />
        <Seg value={when} onChange={setWhen}
          options={[
            { value: 'today', label: 'Due today', n: counts.today },
            { value: 'later', label: 'Upcoming', n: counts.later },
            { value: 'none', label: 'No date', n: counts.none },
            { value: 'all', label: 'All', n: counts.all },
          ]} />
      </div>

      {when === 'today' && overdue > 0 && (
        <div className="task-overdue" style={{ marginBottom: 14 }}>
          <AlertTriangle size={15} />
          {overdue === 1 ? '1 of these was due before today.' : `${overdue} of these were due before today.`} Oldest first.
        </div>
      )}
      {when === 'today' && counts.today === 0 && counts.none > 0 && (
        <div className="task-hint" style={{ marginBottom: 14 }}>
          <CalendarClock size={15} />
          Nothing is due today. {counts.none} {counts.none === 1 ? 'task has' : 'tasks have'} no date. Tap the date chip on any task to schedule it.
        </div>
      )}

      {/* ------------------------------------------------------- lists */}
      {!ordered.length ? (
        <div className="card">
          <Empty>
            {show === 'done'
              ? 'Nothing checked off yet.'
              : 'No tasks here. Add one above, or upload a contract and its deadlines show up on their own.'}
          </Empty>
        </div>
      ) : (
        <>
          <div className="task-sec">
            <h3><Target size={16} />Focus</h3>
            <span className={'task-cap' + (over ? ' over' : '')}>{focusOpen} / {FOCUS_CAP}</span>
            {over && <span className="task-cap-note">Over {FOCUS_CAP}. Something should come off.</span>}
            <span className="task-sec-sub">Clears at 4am</span>
          </div>
          {focusList.length
            ? <div className="task-list">{focusList.map(row)}</div>
            : <div className="card task-empty"><Empty>Nothing picked for today. Hit the target on anything below to pull it in.</Empty></div>}

          <div className="task-sec free">
            <h3><ListTodo size={16} />Free time</h3>
            <span className="task-cap plain">{pileOpen}</span>
          </div>
          {pile.length
            ? <div className="task-list">{pile.map(row)}</div>
            : <div className="card task-empty"><Empty>Nothing else in the pile.</Empty></div>}
        </>
      )}

      {edit && (
        <TaskModal
          ctx={ctx} task={edit} team={team} canSeeAll={canSeeAll}
          onClose={() => setEdit(null)}
          onSave={t => { ctx.upsertTask(t); setEdit(null); }}
          onDelete={t => { remove(t); setEdit(null); }}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------ edit modal */
function TaskModal({ ctx, task, team, canSeeAll, onClose, onSave, onDelete }) {
  const [d, setD] = useState({ ...task });
  const set = p => setD(x => ({ ...x, ...p }));
  const me = ctx.me || {};

  const contacts = useMemo(
    () => (ctx.contacts || []).filter(Boolean).slice()
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
    [ctx.contacts]
  );
  const txn = d.transaction_id ? (ctx.transactions || []).find(x => x.id === d.transaction_id) : null;
  const owner = (ctx.users_by_id || {})[d.user_id];

  const save = () => onSave({
    ...d,
    title: String(d.title || '').trim() || 'Untitled task',
    due: isDate(d.due) ? d.due : null,
    contact_id: d.contact_id || null,
  });

  return (
    <ModalShell
      title="Edit task"
      sub={task.kind === 'deadline' ? 'Created from a contract deadline. Changing the date here does not change the deadline on the transaction.' : null}
      onClose={onClose}
      width={560}
      foot={
        <>
          <Btn kind="d" sm icon={<Trash2 size={13} />} onClick={() => onDelete(task)} style={{ marginRight: 'auto' }}>Delete</Btn>
          <Btn kind="g" onClick={onClose}>Cancel</Btn>
          <Btn kind="p" icon={<CheckCircle2 size={14} />} onClick={save}>Save</Btn>
        </>
      }
    >
      <div className="m-left" style={{ flex: 1, minHeight: 0 }}>
        <Field label="Task">
          <Inp value={d.title || ''} onChange={e => set({ title: e.target.value })} placeholder="What needs doing?" />
        </Field>
        <div className="fgrid" style={{ marginTop: 11 }}>
          <Field label="Assigned to">
            {canSeeAll
              ? <Sel value={d.user_id || ''} onChange={e => set({ user_id: e.target.value })}
                  options={team.map(u => ({ value: u.id, label: String(u.id) === String(me.id) ? `${u.name || u.email} (me)` : (u.name || u.email) }))} />
              : <Inp value={(owner && owner.name) || me.name || ''} disabled />}
          </Field>
          <Field label="Due date">
            <Inp type="date" value={d.due || ''} onChange={e => set({ due: e.target.value })} />
          </Field>
          <Field label="Contact" full>
            <Sel value={d.contact_id || ''} onChange={e => set({ contact_id: e.target.value })}
              options={[{ value: '', label: 'None' }, ...contacts.map(c => ({ value: c.id, label: c.name || 'Unnamed contact' }))]} />
          </Field>
          {txn && (
            <Field label="Transaction" full>
              <Inp value={String(txn.address || 'Transaction')} disabled />
            </Field>
          )}
          <Field label="Notes" full>
            <Txt value={d.note || ''} onChange={e => set({ note: e.target.value })} placeholder="Anything worth knowing when you pick this up" />
          </Field>
        </div>
      </div>
    </ModalShell>
  );
}
