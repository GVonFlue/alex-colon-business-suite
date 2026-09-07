/* ============================================================================
   Tasks — the bucketing, and the thing this screen exists for.

   Dwell was already WRITING tasks and showing them nowhere: Contracts.jsx
   creates one per contract deadline for the assigned agent, and no screen
   displayed them. So the first assertion here is not about a widget, it is
   that a deadline task lands where somebody would look for it.

   Pure — bucketOf is exported for exactly this reason.
   ========================================================================== */

import { bucketOf, TASK_BUCKETS } from '../src/lib/tasks.js';

const TODAY = '2026-08-22';

export default async function run(t) {
  t.eq(bucketOf({ due: '2026-08-01' }, TODAY), 'overdue', 'a past date is overdue');
  t.eq(bucketOf({ due: TODAY }, TODAY), 'today', 'today is today');
  t.eq(bucketOf({ due: '2026-08-23' }, TODAY), 'week', 'tomorrow is inside the week');
  t.eq(bucketOf({ due: '2026-08-29' }, TODAY), 'week', 'and so is day seven');
  t.eq(bucketOf({ due: '2026-08-30' }, TODAY), 'later', 'day eight is later');
  t.eq(bucketOf({ due: null }, TODAY), 'none', 'no date is its own bucket');
  t.eq(bucketOf({ due: 'not a date' }, TODAY), 'none', 'and so is a date nothing can read');
  t.eq(bucketOf({}, TODAY), 'none', 'a task with no due field does not throw');

  /* The bucket order is the order a day gets worked, and "no date" is LAST on
     purpose: an undated task is the one thing here nobody promised. */
  t.eq(TASK_BUCKETS.map(b => b.key).join(','), 'overdue,today,week,later,none',
    'and the bucket order is the order a day gets worked, with "no date" last');
}
