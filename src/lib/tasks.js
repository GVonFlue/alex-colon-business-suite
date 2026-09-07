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
import { isDate, diffDays } from './dates.js';

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
