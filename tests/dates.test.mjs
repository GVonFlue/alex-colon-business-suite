/* ============================================================================
   Unit tests for the critical-date engine.

   These are the tests the brief asks for by name: weekends, the seeded holiday
   list, inclusive vs exclusive start, and rollover both ways. Plus the cascade
   rules, because "changing the effective date re-cascades every unmet deadline"
   is a claim that needs proving.

   Pure node — src/lib/dates.js has no imports and no import.meta.env.
   ========================================================================== */

import {
  dnum, fromDnum, addDays, dow, isWeekend, isBusinessDay, addBusinessDays,
  applyRollover, computeDeadline, cascade, usFederalHolidays, seedHolidays,
  holidayMap, fmtShort, urgency, effectiveDateOf, ruleText,
} from '../src/lib/dates.js';

export default function run(t) {
  /* ---------------------------------------------------------- day arithmetic */
  t.eq(dow('2026-07-29'), 3, 'Jul 29 2026 is a Wednesday');
  t.eq(dow('2026-07-30'), 4, 'Jul 30 2026 is a Thursday');
  t.eq(dow('1970-01-01'), 4, 'epoch day was a Thursday');
  t.eq(dow('1969-12-31'), 3, 'negative day numbers still give the right weekday');
  t.eq(addDays('2026-12-31', 1), '2027-01-01', 'crosses a year boundary');
  t.eq(addDays('2028-02-28', 1), '2028-02-29', 'leap year');
  t.eq(addDays('2027-02-28', 1), '2027-03-01', 'non-leap year');
  t.eq(fromDnum(dnum('2026-07-29')), '2026-07-29', 'round trips');
  t.ok(isWeekend('2026-08-08') && isWeekend('2026-08-09'), 'Aug 8/9 2026 are the weekend');

  /* NO TIMEZONE DRIFT. This is the whole reason the engine is integer-based:
     run the same computation with the process pinned to a UTC+13 zone and a
     UTC-11 zone and it must not move a day. */
  const before = process.env.TZ;
  const results = [];
  for (const tz of ['Pacific/Kiritimati', 'Pacific/Midway', 'UTC', 'America/Chicago']) {
    process.env.TZ = tz;
    results.push(addDays('2026-07-29', 1) + '|' + dow('2026-07-29'));
  }
  process.env.TZ = before;
  t.eq(new Set(results).size, 1, 'date arithmetic is identical in every timezone');

  /* ------------------------------------------------------------- holidays */
  const h2026 = usFederalHolidays(2026);
  const map26 = holidayMap(h2026);
  t.eq(map26['2026-09-07'], 'Labor Day', 'Labor Day 2026 is Mon Sep 7');
  t.eq(map26['2026-11-26'], 'Thanksgiving Day', 'Thanksgiving 2026 is Thu Nov 26');
  t.eq(map26['2026-05-25'], 'Memorial Day', 'Memorial Day 2026 is the last Monday in May');
  t.eq(map26['2026-01-19'], 'Martin Luther King Jr. Day', 'third Monday in January');
  /* Jul 4 2026 falls on a Saturday, so it is observed on Friday Jul 3 */
  t.eq(map26['2026-07-03'], 'Independence Day', 'a Saturday holiday is observed on the Friday');
  t.ok(!map26['2026-07-04'], 'and not on the Saturday itself');
  /* Jan 1 2027 is a Friday — no shift */
  t.eq(holidayMap(usFederalHolidays(2027))['2027-01-01'], "New Year's Day", 'a weekday holiday stands');
  t.eq(seedHolidays(2026, 3).length, usFederalHolidays(2026).length * 3, 'the seed spans several years');
  t.ok(holidayMap(map26) === map26, 'holidayMap is idempotent — a map handed back in passes through');

  /* holidays are not business days; ordinary weekdays are */
  t.ok(!isBusinessDay('2026-09-07', h2026), 'Labor Day is not a business day');
  t.ok(!isBusinessDay('2026-08-08', h2026), 'Saturday is not a business day');
  t.ok(isBusinessDay('2026-09-08', h2026), 'the Tuesday after Labor Day is');

  /* -------------------------------------------------- business day counting */
  /* the brief's own worked example: Wed Jul 29 + 5 business days */
  t.eq(addBusinessDays('2026-07-29', 5, { holidays: h2026 }).date, '2026-08-05',
    'Jul 29 + 5 business days, exclusive start = Aug 5');
  t.eq(addBusinessDays('2026-07-29', 5, { holidays: h2026, inclusive: true }).date, '2026-08-04',
    'the same count with an inclusive start lands a day earlier — this is the off-by-one that loses money');
  t.eq(addBusinessDays('2026-07-29', 0, { holidays: h2026 }).date, '2026-07-29', 'zero offset does not move');

  /* counting across a holiday weekend: Fri Sep 4 + 1 business day skips
     Sat, Sun and Labor Day Monday */
  const acrossLabor = addBusinessDays('2026-09-04', 1, { holidays: h2026 });
  t.eq(acrossLabor.date, '2026-09-08', 'Fri Sep 4 + 1 business day = Tue Sep 8');
  t.eq(acrossLabor.skipped.length, 3, 'and reports the three days it skipped');
  t.eq(acrossLabor.skipped.map(s => s.reason).join(','), 'Saturday,Sunday,Labor Day', 'each with its reason');

  /* the same count with NO holiday list gets it wrong by a day — which is the
     argument for the holiday list existing at all */
  t.eq(addBusinessDays('2026-09-04', 1, { holidays: [] }).date, '2026-09-07',
    'without the holiday list the same clause lands on Labor Day');

  /* an inclusive start on a NON-business day does not count that day */
  t.eq(addBusinessDays('2026-08-08', 1, { holidays: h2026, inclusive: true }).date, '2026-08-10',
    'an inclusive start on a Saturday still starts counting at the next business day');

  /* counting backwards, for close-anchored deadlines */
  t.eq(addBusinessDays('2026-08-10', -1, { holidays: h2026 }).date, '2026-08-07',
    'one business day before Mon Aug 10 is Fri Aug 7');

  /* --------------------------------------------------------------- rollover */
  /* Jul 29 + 10 calendar days = Sat Aug 8 */
  t.eq(addDays('2026-07-29', 10), '2026-08-08', 'the raw calendar count');
  t.eq(applyRollover('2026-08-08', 'forward', h2026).date, '2026-08-10', 'forward rolls to the Monday');
  t.eq(applyRollover('2026-08-08', 'stand', h2026).date, '2026-08-08', 'stand leaves it on the Saturday');
  t.eq(applyRollover('2026-08-08', 'back', h2026).date, '2026-08-07', 'back rolls to the Friday');
  t.eq(applyRollover('2026-09-05', 'forward', h2026).date, '2026-09-08',
    'forward from a Saturday jumps the holiday Monday too');
  t.eq(applyRollover('2026-08-10', 'forward', h2026).rolled, null, 'a business day is not rolled');

  /* ---------------------------------------------------- computeDeadline ---- */
  const c1 = computeDeadline({ anchorDate: '2026-07-29', offset: 3, count: 'business', holidays: h2026, rollover: 'forward', anchorLabel: 'effective date' });
  t.eq(c1.date, '2026-08-03', 'earnest money: 3 business days after Jul 29 = Mon Aug 3');
  t.ok(/exclusive start/.test(c1.rule), 'the rule text says which start it used');
  t.ok(/Jul 29/.test(c1.explain) && /Aug 3/.test(c1.explain), 'the explanation shows both ends of the arithmetic');
  t.ok(/skipping Sat\/Sun/.test(c1.explain), 'and names the days it skipped');

  const c2 = computeDeadline({ anchorDate: '2026-07-29', offset: 10, count: 'calendar', holidays: h2026, rollover: 'forward' });
  t.eq(c2.date, '2026-08-10', 'a calendar deadline landing on a Saturday rolls forward');
  t.ok(c2.rolled && c2.rolled.direction === 'forward', 'and records that it was rolled');
  t.ok(/rolled forward/.test(c2.explain), 'the explanation says so out loud');

  const c3 = computeDeadline({ anchorDate: '2026-07-29', offset: 10, count: 'calendar', holidays: h2026, rollover: 'stand' });
  t.eq(c3.date, '2026-08-08', 'with rollover set to stand, the same clause stays on the Saturday');

  const c4 = computeDeadline({ anchorDate: '2026-08-20', offset: -1, count: 'calendar', holidays: h2026, rollover: 'forward', anchorLabel: 'closing' });
  t.eq(c4.date, '2026-08-19', 'final walkthrough is the day before closing');
  t.ok(/before the closing/.test(c4.rule), 'and reads as "before"');

  t.eq(computeDeadline({ anchorDate: 'nonsense', offset: 3, count: 'business' }), null, 'a bad anchor returns null rather than a wrong date');
  t.eq(ruleText({ offset: 0, count: 'calendar', anchorLabel: 'closing' }), 'on the closing', 'zero offset reads naturally');

  /* --------------------------------------------------------------- cascade */
  const offsets = [
    { key: 'earnest', label: 'Earnest money delivered', offset: 3, count: 'business', inclusive: false, anchor: 'effective' },
    { key: 'inspend', label: 'Inspection period ends', offset: 10, count: 'calendar', inclusive: false, anchor: 'effective' },
    { key: 'closing', label: 'Closing', offset: 0, count: 'calendar', inclusive: false, anchor: 'close' },
    { key: 'walk', label: 'Final walkthrough', offset: -1, count: 'calendar', inclusive: false, anchor: 'close' },
  ];
  const first = cascade([], { effective: '2026-07-29', closeDate: '2026-08-28', holidays: h2026, rollover: 'forward', offsets });
  t.eq(first.deadlines.length, 4, 'a first cascade builds every offset');
  t.eq(first.added.length, 4, 'and reports them as added');
  t.eq(first.deadlines.find(d => d.key === 'earnest').date, '2026-08-03', 'earnest lands where the unit test says');
  t.eq(first.deadlines[0].date <= first.deadlines[1].date, true, 'the list comes back in date order');

  /* mark one met, one waived, add an absolute one and a hand-entered one */
  let set = first.deadlines.map(d => (d.key === 'earnest' ? { ...d, status: 'met', statusBy: 'u1' } : d));
  set = set.map(d => (d.key === 'inspend' ? { ...d, status: 'open' } : d));
  set.push({ key: 'hoa', label: 'HOA docs (contract names a date)', date: '2026-08-14', absolute: true, status: 'open', source: 'contract', count: 'calendar' });
  set.push({ key: 'mine', label: 'Typed by the agent', date: '2026-08-20', source: 'manual', status: 'open', count: 'calendar' });

  /* now move the effective date forward a week */
  const second = cascade(set, { effective: '2026-08-05', closeDate: '2026-08-28', holidays: h2026, rollover: 'forward', offsets });
  const byKey = Object.fromEntries(second.deadlines.map(d => [d.key, d]));

  t.eq(byKey.earnest.date, '2026-08-03', 'a MET deadline does not move when the effective date changes');
  t.eq(byKey.earnest.status, 'met', 'and keeps its status');
  t.ok(second.kept.some(k => k.key === 'earnest' && /already met/.test(k.why)), 'and is reported as kept, with the reason');

  t.eq(byKey.inspend.date, '2026-08-17', 'an UNMET deadline re-cascades from the new effective date');
  /* from Aug 10, not Aug 8: the first cascade already rolled that Saturday
     forward, and the report shows the date that was on the record */
  t.ok(second.moved.some(m => m.key === 'inspend' && m.from === '2026-08-10' && m.to === '2026-08-17'),
    'and the report says exactly what moved, from and to');

  t.eq(byKey.hoa.date, '2026-08-14', 'an ABSOLUTE contract date never re-cascades');
  t.ok(second.kept.some(k => k.key === 'hoa' && /absolute/.test(k.why)), 'and says why it did not');
  t.eq(byKey.mine.date, '2026-08-20', 'a hand-entered date never re-cascades either');
  t.ok(second.kept.some(k => k.key === 'mine' && /by hand/.test(k.why)), 'and says why');

  /* close-anchored deadlines follow the close date, not the effective date */
  const third = cascade(second.deadlines, { effective: '2026-08-05', closeDate: '2026-09-04', holidays: h2026, rollover: 'forward', offsets });
  const byKey3 = Object.fromEntries(third.deadlines.map(d => [d.key, d]));
  t.eq(byKey3.walk.date, '2026-09-03', 'moving the close date moves the walkthrough');
  t.eq(byKey3.closing.date, '2026-09-04', 'and the closing row');
  t.eq(byKey3.inspend.date, '2026-08-17', 'without touching the effective-anchored ones');

  /* a close-anchored deadline with no close date set is kept, not invented */
  const noClose = cascade([], { effective: '2026-08-05', closeDate: null, holidays: h2026, rollover: 'forward', offsets });
  t.ok(!noClose.deadlines.some(d => d.key === 'walk'), 'no close date means no walkthrough row rather than a wrong one');

  /* ------------------------------------------------------------- urgency */
  t.eq(urgency({ status: 'met', date: '2020-01-01' }), 'met', 'met beats overdue');
  t.eq(urgency({ status: 'waived', date: '2020-01-01' }), 'waived', 'so does waived');
  t.eq(urgency({ status: 'open', date: '2020-01-01' }), 'overdue', 'a past open date is overdue');
  t.eq(effectiveDateOf({ status: 'extended', date: '2026-08-01', extendedTo: '2026-08-11' }), '2026-08-11',
    'an extension is what counts once it exists');
  t.eq(fmtShort('2026-08-05'), 'Aug 5', 'short format needs no Date object');
}
