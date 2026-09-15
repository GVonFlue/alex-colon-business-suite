/* ============================================================================
   tasks.js — when a task is due, expressed as the bucket a day gets worked in.

   Pure and in lib rather than inside the view, for the reason lib/txn.js
   exists: this is a fact about a task, several things will eventually want it
   (the screen, the dashboard, the assistant), and a fact defined inside a
   component is a fact the next screen copies.
   ========================================================================== */

/* The extension is required. tests/tasks.test.mjs imports this file directly
   under plain Node ESM, which does not do extensionless resolution — only the
   bundler does. Dropping the '.js' builds green and fails the suite. */
import { isDate, diffDays, addDays } from './dates.js';

/* Order matters — it is the order a day actually gets worked. "No date" sits
   LAST rather than first: an undated task is the one thing here nobody
   promised anybody. */
export const TASK_BUCKETS = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'today',   label: 'Today' },
  { key: 'week',    label: 'Next 7 days' },
  { key: 'later',   label: 'Later' },
  { key: 'none',    label: 'No date' },
];

export function bucketOf(task, todayIso) {
  const due = task && task.due;
  if (!isDate(due)) return 'none';
  const n = diffDays(todayIso, due);
  if (n < 0) return 'overdue';
  if (n === 0) return 'today';
  if (n <= 7) return 'week';
  return 'later';
}

/** Soonest first; anything undated sorts to the end of its own bucket. */
export const byDue = (a, b) => {
  const x = isDate(a && a.due) ? a.due : '9999-12-31';
  const y = isDate(b && b.due) ? b.due : '9999-12-31';
  return x.localeCompare(y) || String((a && a.title) || '').localeCompare(String((b && b.title) || ''));
};

/* ---------------------------------------------------------------- when ---
   The three date filters on the Tasks screen, ported from ProyTech.

   "Today" means what you owe today, which includes anything you already owed
   and did not do. An overdue task is not a future problem, so it is counted
   here rather than hidden in a bucket of its own. */
export function whenOf(task, todayIso) {
  const due = task && task.due;
  if (!isDate(due)) return 'none';
  return diffDays(todayIso, due) <= 0 ? 'today' : 'later';
}

/** The words on a task's due chip. */
export function dueLabel(task, todayIso) {
  const due = task && task.due;
  if (!isDate(due)) return 'No date';
  const n = diffDays(todayIso, due);
  if (n < 0) return `${-n}d overdue`;
  if (n === 0) return 'Due today';
  if (n === 1) return 'Due tomorrow';
  return `Due in ${n}d`;
}

/* --------------------------------------------------------------- focus ---
   Ported from ProyTech. Focus is what you decided to work on now, which is a
   different thing from a due date: a due date is a promise to somebody else.

   The flag is stored as the DAY it was set rather than a boolean, so it expires
   on its own with no nightly job. The day rolls at 4am in the install's
   timezone, not midnight, so working late does not clear the list mid-evening.

   The cap warns and never blocks. A cap that refuses you at 4pm when something
   urgent lands is how a tool gets abandoned. */
export const FOCUS_CAP = 6;
export const FOCUS_ROLLOVER_HOUR = 4;

export function focusDay(tz, now) {
  const at = now instanceof Date ? now : new Date(now == null ? Date.now() : now);
  let iso, hour;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz || 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', hourCycle: 'h23',
    }).formatToParts(at);
    const g = k => (parts.find(p => p.type === k) || {}).value;
    iso = `${g('year')}-${g('month')}-${g('day')}`;
    hour = Number(g('hour')) % 24;
  } catch {
    iso = at.toISOString().slice(0, 10);
    hour = at.getUTCHours();
  }
  return hour < FOCUS_ROLLOVER_HOUR ? addDays(iso, -1) : iso;
}

export const isFocus = (task, day) => !!task && !!day && task.focusDate === day;

/* Picking a task counts once per day however many times it is toggled, so the
   list can show what keeps getting picked and not finished. lastFocusDay is the
   guard: without it, off and on again in one afternoon reads as two picks. */
export function withFocus(task, on, day) {
  if (!on) return { ...task, focusDate: '' };
  const first = task.lastFocusDay !== day;
  return {
    ...task, focusDate: day, lastFocusDay: day,
    focusCount: (Number(task.focusCount) || 0) + (first ? 1 : 0),
  };
}
