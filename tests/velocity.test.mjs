/* ============================================================================
   tests/velocity.test.mjs — speed to lead, and where leads fall out.

   Pure functions, so this runs without mounting anything.

   THE CASE THAT MATTERS MOST is the first one. api/lead-intake.js writes a
   note the instant a website lead arrives. If a note counted as a response,
   every website lead would show a first-response time of zero seconds, and the
   metric would be measuring how fast the webhook fired rather than how fast
   Alex called. Only a call, text, email or meeting counts.

   THE SECOND IS NULL VERSUS ZERO. "Answered instantly" and "never answered"
   are opposite facts. A dashboard that renders them the same way is worse than
   one that shows nothing.

   Exports a default taking the shared harness, like every other suite here.
   The first version ran at import time with its own `p` and `f` counters and
   the harness threw "Identifier 'p' has already been declared" — run.mjs
   imports these into one scope, so a top-level name in one suite collides with
   the same name in another. The harness owns the counting.
   ============================================================================ */

import {
  firstResponseHours,
  timeToConversationHours,
  awaitingFirstResponse,
  medianFirstResponseHours,
  humanHours,
  medianDaysToClose,
  lostReasonBreakdown,
} from '../src/lib/velocity.js';

/** A fixed clock, so these never depend on when the suite runs. */
const H = h => new Date(Date.UTC(2026, 0, 1, h)).toISOString();

export default async function run(t) {
  /* ------------------------------------------------ what counts as a response */

  t.eq(
    firstResponseHours({ created_at: H(0), activity: [{ at: H(1), kind: 'note' }] }),
    null,
    'a note is NOT a response, so the arrival note lead-intake writes cannot fake a zero',
  );
  t.eq(
    firstResponseHours({ created_at: H(0), activity: [{ at: H(2), kind: 'call' }] }),
    2,
    'a call two hours after arrival is two hours',
  );
  t.eq(
    firstResponseHours({ created_at: H(0), activity: [{ at: H(0), kind: 'note' }, { at: H(3), kind: 'text' }] }),
    3,
    'the arrival note is skipped and the text is counted',
  );
  t.eq(
    firstResponseHours({ created_at: H(0), activity: [{ at: H(9), kind: 'call' }, { at: H(2), kind: 'email' }] }),
    2,
    'unsorted activity still finds the earliest real attempt',
  );

  /* ----------------------------------------------------------- null, not zero */

  t.eq(
    firstResponseHours({ created_at: H(0), activity: [] }),
    null,
    'nobody has reached out yet is null, never 0',
  );
  t.eq(
    firstResponseHours({ activity: [{ at: H(1), kind: 'call' }] }),
    null,
    'a contact with no created_at is null rather than a nonsense number',
  );
  t.eq(
    firstResponseHours({ created_at: H(5), activity: [{ at: H(4), kind: 'call' }] }),
    0,
    'clock skew between the browser and Postgres clamps to 0, not a negative',
  );

  t.eq(
    timeToConversationHours({ created_at: H(0), activity: [{ at: H(1), kind: 'text' }, { at: H(6), kind: 'call' }] }),
    6,
    'a two-way conversation means a call or a meeting, not a text',
  );

  /* ---------------------------------------------------------- median, not mean */

  const three = [
    { created_at: H(0), activity: [{ at: H(1), kind: 'call' }] },
    { created_at: H(0), activity: [{ at: H(3), kind: 'call' }] },
    { created_at: H(0), activity: [{ at: H(11), kind: 'call' }] },
  ];
  t.eq(
    medianFirstResponseHours(three),
    3,
    'median of 1, 3 and 11 is 3 — the mean would be 5 and one holiday weekend would set it',
  );
  t.eq(medianFirstResponseHours(three.slice(0, 2)), 2, 'an even count averages the middle two');
  t.eq(
    medianFirstResponseHours([{ created_at: H(0), activity: [] }]),
    null,
    'no answered leads at all is null, not 0',
  );

  /* ------------------------------------------------- the list he acts on today */

  const now = new Date(Date.UTC(2026, 0, 1, 10)).getTime();
  const waiting = awaitingFirstResponse(
    [
      { id: 'a', created_at: H(0), stage: 'new', activity: [] },
      { id: 'b', created_at: H(8), stage: 'new', activity: [] },
      { id: 'c', created_at: H(0), stage: 'lost', activity: [] },
      { id: 'd', created_at: H(0), stage: 'new', activity: [{ at: H(1), kind: 'call' }] },
    ],
    now,
  );
  t.eq(
    waiting.map(x => x.contact.id),
    ['a', 'b'],
    'a lost lead and an already-answered one are both off the list',
  );
  t.eq(Math.round(waiting[0].waitingHours), 10, 'longest waiting is first');

  /* -------------------------------------------------------------- rendering */

  t.eq(humanHours(null), '—', 'null renders as an em dash');
  t.eq(humanHours(0), '1 min', 'never renders the string "0", which would read as instant');
  t.eq(humanHours(0.3), '18 min', 'under an hour is minutes');
  t.eq(humanHours(30), '30 hr', 'under two days is hours');
  t.eq(humanHours(72), '3 days', 'beyond that is days');

  /* ------------------------------------------------------------ days to close */

  t.eq(
    medianDaysToClose([{ effective_date: '2026-01-01', close_date: '2026-02-01', status: 'active' }]),
    null,
    'open deals are excluded, or the number falls every time a new one is written',
  );
  t.eq(
    medianDaysToClose([{ effective_date: '2026-01-01', close_date: '2026-02-01', status: 'closed' }]),
    31,
    'a closed deal measures effective date to close date',
  );

  /* ------------------------------------------------------------ lost reasons */

  const stages = [{ key: 'lost', lost: true }, { key: 'new', lost: false }];
  const lost = lostReasonBreakdown(
    [
      { stage: 'lost', lostReason: 'Timing' },
      { stage: 'lost', lostReason: 'Timing' },
      { stage: 'lost', lostReason: 'Financing' },
      { stage: 'lost' },
      { stage: 'new', lostReason: 'x' },
    ],
    stages,
  );
  t.eq(
    lost.rows,
    [{ reason: 'Timing', count: 2 }, { reason: 'Financing', count: 1 }],
    'counted and sorted by frequency, and a reason on a non-lost contact is ignored',
  );
  t.eq(
    lost.unrecorded,
    1,
    'a blank reason is counted separately: "Other" is a reason somebody chose, blank is one nobody recorded',
  );
  t.eq(lost.total, 4, 'the total includes the unrecorded one');
}
