/* ============================================================================
   Tasks — ported to match ProyTech's task screen in look and behaviour.

   Same sections, same controls, same ordering logic, same AI ranking. What
   differs is what the ranking is ranked AGAINST, and one rule about which
   tasks get scored by hand.

   WHAT CAME ACROSS WHOLE, and why each is worth having:

     Focus / Free time as SECTIONS, not a fourth filter. Who, Show and When
       still slice both. Filters filter, sections group, and a fourth filter
       chip would fight the three already there.

     The SOFT cap. Focus warns at six and never blocks. A cap that refuses you
       at 4pm when something urgent lands is how a tool gets abandoned.

     Focus stored as a DAY, not a boolean, so it expires on its own with no
       nightly job and is still right if nobody opens the CRM for three days.
       Rolls at 4am so working late does not clear the list mid-evening.

     "picked 3x" on a task pulled into Focus on three separate days and still
       open. That is the most useful thing on this screen: it is the tell for
       work that is blocked or badly scoped, and nothing else surfaces it.

     Date view leads with the date. In a date-filtered view an AI rank is about
       what is worth doing, not about what is already late.

     The overdue and no-date hints under the filter row.

   THE ONE DELIBERATE DIFFERENCE. ProyTech scores every task on three dials by
   hand. Half the tasks here are not typed by anybody: Contracts.jsx writes one
   per contract deadline, off a real clause, with a real date. The date already
   IS the urgency, so the dials are editable on manual tasks and hidden on
   deadline ones — and api/rank-tasks.js is told a contract deadline outranks a
   judgement call. Asking somebody to rate a task the contract already rated is
   work for its own sake.
   ========================================================================== */

import React, { useMemo, useState } from 'react';
import {
  CheckCircle2, Circle, Plus, FileText, Contact2, Trash2, Target, ListTodo,
  Sparkles, Loader2, CalendarClock, AlertTriangle, SlidersHorizontal,
} from 'lucide-react';
import { Card, Btn, Empty, Inp, Pill, Sel, Seg } from '../components/ui';
import { isDate, diffDays, fmtLong, addDays } from '../lib/dates';
import { apiPost } from '../lib/data';
import { uid } from '../lib/format';
import { BRAND } from '../lib/brand';

/* Local: lib/format.js exports no numeric coercion, and adding one repo-wide
   for one screen is a wider change than this needs. Also guards a task saved
   before the scoring fields existed, where undefined * 3 is NaN. */
const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);

const FOCUS_ROLLOVER_HOUR = 4;
const FOCUS_CAP = 6;

function focusDay(now) {
  const d = now ? new Date(now) : new Date();
  if (d.getHours() < FOCUS_ROLLOVER_HOUR) d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}
const isFocus = t => !!t && t.focusDate === focusDay();

/* Picking counts once per day however many times it is toggled, so the pile
   can show what somebody keeps choosing and not finishing. lastFocusDay is the
   guard: without it, off and on in one afternoon reads as two picks. */
function withFocus(t, on) {
  const day = focusDay();
  if (!on) return { ...t, focusDate: '' };
  const firstToday = t.lastFocusDay !== day;
  return { ...t, focusDate: day, lastFocusDay: day, focusCount: num(t.focusCount) + (firstToday ? 1 : 0) };
}

const score = t => num(t.impact || 3) * num(t.urgency || 3);

export default function Tasks({ ctx }) {
  const [scope, setScope] = useState('mine');
  const [show, setShow] = useState('open');
  const [when, setWhen] = useState('all');
  const [title, setTitle] = useState('');
  const [addDue, setAddDue] = useState(ctx.todayIso);
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);
  const [aiNote, setAiNote] = useState('');

  const me = ctx.me || {};
  const today = ctx.todayIso;
  const canSeeAll = ctx.isLeader || ctx.isCoordinator;

  const mine = useMemo(() => {
    const list = (ctx.tasks || []).filter(Boolean);
    return scope === 'mine' || !canSeeAll
      ? list.filter(t => String(t.user_id || '') === String(me.id || ''))
      : list;
  }, [ctx.tasks, scope, canSeeAll, me.id]);

  /* "Today" means what you owe today, which INCLUDES anything you already owed
     and did not do. An overdue task is not a future problem. */
  const whenOf = t => (!isDate(t.due) ? 'none' : t.due <= today ? 'today' : 'later');

  const base = useMemo(
    () => mine.filter(t => (show === 'all' ? true : show === 'open' ? !t.done : !!t.done)),
    [mine, show],
  );

  const whenCounts = useMemo(() => ({
    today: base.filter(t => whenOf(t) === 'today').length,
    later: base.filter(t => whenOf(t) === 'later').length,
    none: base.filter(t => whenOf(t) === 'none').length,
    all: base.length,
  }), [base, today]);

  const overdueCount = useMemo(
    () => base.filter(t => !t.done && isDate(t.due) && diffDays(today, t.due) < 0).length,
    [base, today],
  );

  const ordered = useMemo(() => {
    const filtered = base.filter(t => when === 'all' || whenOf(t) === when);
    return [...filtered].sort((a, b) => {
      if (!!a.done !== !!b.done) return a.done ? 1 : -1;
      /* In a date view the date leads. An AI rank is about what is worth
         doing, not about what is already late. */
      if (when !== 'all' && !a.done && !b.done && (a.due || '') !== (b.due || '')) {
        return String(a.due || '9999').localeCompare(String(b.due || '9999'));
      }
      if (a.aiRank != null && b.aiRank != null) return a.aiRank - b.aiRank;
      if (a.aiRank != null) return -1;
      if (b.aiRank != null) return 1;
      if (score(b) !== score(a)) return score(b) - score(a);
      if (num(a.effort) !== num(b.effort)) return num(a.effort) - num(b.effort);
      return String(a.created_at || '').localeCompare(String(b.created_at || ''));
    });
  }, [base, when, today]);

  const ranked = useMemo(() => mine.some(t => !t.done && t.aiRank != null), [mine]);

  const add = () => {
    const t = title.trim();
    if (!t) return;
    ctx.upsertTask({
      id: uid(), user_id: me.id, transaction_id: null, contact_id: null,
      title: t, due: isDate(addDue) ? addDue : today, done: false, kind: 'manual',
      /* Middle of the scale, not blank. An unscored task would sort below every
         scored one forever, quietly hiding the thing somebody just typed. */
      impact: 3, urgency: 3, effort: 3,
      focusDate: '', focusCount: 0, lastFocusDay: '', aiRank: null, aiReason: '',
      created_at: new Date().toISOString(),
    });
    setTitle('');
  };

  const contextOf = t => {
    if (t.transaction_id) {
      const x = (ctx.transactions || []).find(v => v.id === t.transaction_id);
      if (x) return { icon: FileText, label: String(x.address || 'transaction').split(',')[0], go: () => ctx.go('transactions', { id: x.id }) };
    }
    if (t.contact_id) {
      const c = (ctx.contacts || []).find(v => v.id === t.contact_id);
      if (c) return { icon: Contact2, label: c.name || 'contact', go: () => ctx.go('contacts', { id: c.id }) };
    }
    return null;
  };

  const runAI = async () => {
    const openTasks = mine.filter(t => !t.done);
    if (!openTasks.length) { setAiNote('Nothing open to rank yet.'); return; }
    setBusy(true); setAiNote('');
    try {
      const payload = openTasks.map(t => {
        const c = contextOf(t);
        return {
          id: t.id, title: t.title, due: t.due || '', kind: t.kind || 'manual',
          context: c ? c.label : '',
          impact: num(t.impact || 3), urgency: num(t.urgency || 3), effort: num(t.effort || 3),
        };
      });
      const r = await apiPost('/api/rank-tasks', { tasks: payload });
      const j = await r.json();
      if (!j.ok) {
        /* Told plainly, on the screen, not in an alert. The list is still
           sorted by impact times urgency, which is worth saying so nobody
           thinks the button did nothing. */
        setAiNote(`${j.error || 'Ranking is unavailable'}. The list is still sorted by impact times urgency.`);
        setBusy(false);
        return;
      }
      const map = {};
      (j.ranking || []).forEach((x, i) => { map[x.id] = { rank: i + 1, reason: x.reason || '' }; });
      /* Every task is rewritten, including the ones the model did not return:
         a stale rank from a previous run sitting on a task the model dropped
         this time would put it at the top for no reason. */
      await ctx.saveTasks((ctx.tasks || []).map(t => {
        if (t.done) return { ...t, aiRank: null, aiReason: '' };
        const m = map[t.id];
        return m ? { ...t, aiRank: m.rank, aiReason: m.reason } : { ...t, aiRank: null, aiReason: '' };
      }));
    } catch (e) {
      setAiNote(`Ranking failed: ${e.message || e}`);
    }
    setBusy(false);
  };

  const clearAI = () => ctx.saveTasks((ctx.tasks || []).map(t => ({ ...t, aiRank: null, aiReason: '' })));

  const Row = t => {
    const c = contextOf(t);
    const C = c && c.icon;
    const du = isDate(t.due) ? diffDays(today, t.due) : null;
    const dueColor = du == null ? '#8b88a0' : du < 0 ? BRAND.colors.red : du === 0 ? BRAND.colors.gold : '#5A5680';
    const dueLabel = du == null ? 'No date'
      : du < 0 ? `${-du}d overdue` : du === 0 ? 'Due today' : du === 1 ? 'Due tomorrow' : `Due in ${du}d`;
    const foc = isFocus(t);
    const manual = t.kind !== 'deadline';

    return (
      <div className="tkr" key={t.id} style={{ opacity: t.done ? 0.6 : 1 }}>
        <button
          className="tkr-check"
          onClick={() => ctx.upsertTask({
            ...t, done: !t.done,
            doneAt: t.done ? null : new Date().toISOString(),
            /* Finishing clears the rank. A done task holding #1 would sit at
               the top of the next ranking for work already behind you. */
            aiRank: t.done ? t.aiRank : null, aiReason: t.done ? t.aiReason : '',
          })}
          title={t.done ? 'Mark open' : 'Mark done'}
          style={{ color: t.done ? BRAND.colors.green : '#c3c2d4' }}
        >
          {t.done ? <CheckCircle2 size={22} /> : <Circle size={22} />}
        </button>

        <div className="tkr-mid">
          <div className="tkr-head">
            {t.aiRank != null && !t.done && <span className="tkr-rank">#{t.aiRank}</span>}
            <span className={'tkr-title' + (t.done ? ' done' : '')}>{t.title}</span>
          </div>

          {t.aiReason && !t.done && (
            <div className="tkr-why"><Sparkles size={12} />{t.aiReason}</div>
          )}

          <div className="tkr-meta">
            {t.kind === 'deadline' && <Pill color={BRAND.colors.indigo}>from the contract</Pill>}
            {c && (
              <button className="tk-origin" onClick={c.go}>
                <C size={11} />{c.label}
              </button>
            )}
            <label className="tkr-due" style={{ color: dueColor, background: du != null && du < 0 ? 'rgba(209,67,67,.1)' : '#F0F1F7' }} title="Tap to reschedule">
              <CalendarClock size={11} />{dueLabel}
              <input type="date" value={t.due || ''} onChange={e => ctx.upsertTask({ ...t, due: e.target.value || null })} />
            </label>
            {/* The tell for work that is blocked or badly scoped. Nothing else
                on this screen surfaces it. */}
            {!t.done && !foc && num(t.focusCount) > 1 && (
              <span className="tkr-picked" title={`Pulled into Focus on ${num(t.focusCount)} separate days and still open — worth asking whether it is blocked or badly scoped`}>
                picked {num(t.focusCount)}&times;
              </span>
            )}
            {manual && (
              <span className="tkr-dials">
                Impact {num(t.impact || 3)} · Urgency {num(t.urgency || 3)} · Effort {num(t.effort || 3)}
              </span>
            )}
          </div>

          {manual && edit === t.id && (
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

        <div className="tkr-acts">
          <button
            className={'tkr-act' + (foc ? ' on' : '')}
            onClick={() => ctx.upsertTask(withFocus(t, !foc))}
            aria-pressed={foc}
            title={foc ? 'Take out of Focus' : 'Pull into Focus for today'}
          >
            <Target size={15} />
          </button>
          {manual && (
            <button
              className={'tkr-act' + (edit === t.id ? ' on' : '')}
              onClick={() => setEdit(edit === t.id ? null : t.id)}
              title="Impact, urgency, effort"
            >
              <SlidersHorizontal size={15} />
            </button>
          )}
          <button
            className="tkr-act del"
            onClick={() => { if (window.confirm('Delete this task?')) ctx.deleteTask(t.id); }}
            title="Delete"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    );
  };

  const focusList = ordered.filter(isFocus);
  const pile = ordered.filter(t => !isFocus(t));
  const focusOpen = focusList.filter(t => !t.done).length;
  const pileOpen = pile.filter(t => !t.done).length;
  /* Soft. It warns and never blocks — open tasks only, because finishing work
     should not eat the cap. */
  const over = focusOpen > FOCUS_CAP;

  return (
    <>
      {/* A bare card, no heading. ProyTech's add row is just the input and the
          controls, and the reason is vertical space: a title and a subtitle
          above a single text field pushes the actual task list a third of a
          screen down, on the screen somebody opens to see the list. What the
          field is for is already obvious from its placeholder. */}
      <div className="card tk-addcard">
        <div className="tk-add2">
          <Inp
            placeholder="Add a task and hit Enter…"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()}
          />
          <div className="tk-daypick">
            <button type="button" className={'day-chip' + (addDue === today ? ' on' : '')} onClick={() => setAddDue(today)}>Today</button>
            <button type="button" className={'day-chip' + (addDue === addDays(today, 1) ? ' on' : '')} onClick={() => setAddDue(addDays(today, 1))}>Tomorrow</button>
            <label className="day-date">
              <CalendarClock size={14} />
              <input type="date" value={addDue || ''} onChange={e => setAddDue(e.target.value || today)} />
            </label>
          </div>
          <Btn kind="p" icon={<Plus size={16} />} onClick={add} disabled={!title.trim()}>Add</Btn>
        </div>
      </div>

      <div className="tk-bar2">
        {canSeeAll && (
          <Seg
            value={scope}
            onChange={setScope}
            options={[{ value: 'mine', label: 'Mine' }, { value: 'all', label: 'Everyone' }]}
          />
        )}
        <Seg
          value={show}
          onChange={setShow}
          options={[{ value: 'open', label: 'Open' }, { value: 'done', label: 'Done' }, { value: 'all', label: 'All' }]}
        />
        <Seg
          value={when}
          onChange={setWhen}
          options={[
            { value: 'today', label: 'Due today', n: whenCounts.today },
            { value: 'later', label: 'Upcoming', n: whenCounts.later },
            { value: 'none', label: 'No date', n: whenCounts.none },
            { value: 'all', label: 'All', n: whenCounts.all },
          ]}
        />
        <div className="tk-bar2-r">
          {ranked && <Btn sm onClick={clearAI}>Clear ranking</Btn>}
          <Btn
            kind="p"
            disabled={busy}
            onClick={runAI}
            icon={busy ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}
          >
            {busy ? 'Ranking…' : 'AI rank'}
          </Btn>
        </div>
      </div>

      {aiNote && <div className="tk-hint warn"><AlertTriangle size={15} />{aiNote}</div>}

      {ranked && (
        <div className="tk-hint ai">
          <Sparkles size={15} />
          Ranked for what keeps deals alive and leads warm — contract deadlines and uncontacted leads first.
        </div>
      )}

      {when === 'today' && overdueCount > 0 && (
        <div className="tk-hint late">
          <AlertTriangle size={15} />
          {overdueCount === 1 ? '1 of these was due before today.' : `${overdueCount} of these were due before today.`} Oldest first.
        </div>
      )}

      {when === 'today' && whenCounts.today === 0 && whenCounts.none > 0 && (
        <div className="tk-hint">
          <CalendarClock size={15} />
          Nothing is dated for today. {whenCounts.none} {whenCounts.none === 1 ? 'task has' : 'tasks have'} no date on {whenCounts.none === 1 ? 'it' : 'them'} — tap the date chip on any task to schedule it.
        </div>
      )}

      {!ordered.length ? (
        <Empty>
          {show === 'done'
            ? 'Nothing checked off yet.'
            : 'No tasks yet. Add your first one above, or upload a contract and its deadlines land here.'}
        </Empty>
      ) : (
        <>
          <div className="tk-sec">
            <h3><Target size={16} />Focus</h3>
            <span className={'tk-cap' + (over ? ' over' : '')}>{focusOpen} / {FOCUS_CAP}</span>
            {over && <span className="tk-cap-note">Over six — something should come off.</span>}
            <span className="tk-sec-sub">Clears at 4am</span>
          </div>
          {focusList.length
            ? <div className="tk-list">{focusList.map(Row)}</div>
            : <Empty>Nothing picked yet. Hit the target on anything below to pull it into today.</Empty>}

          <div className="tk-sec free">
            <h3><ListTodo size={16} />Free time</h3>
            <span className="tk-cap plain">{pileOpen}</span>
          </div>
          {pile.length
            ? <div className="tk-list">{pile.map(Row)}</div>
            : <Empty>Everything open is in Focus.</Empty>}
        </>
      )}
    </>
  );
}
