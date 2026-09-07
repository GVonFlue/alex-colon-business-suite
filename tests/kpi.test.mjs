/* ============================================================================
   kpi — the numbers on the dashboard, the huddle, the pipeline and the
   transactions board.

   Every assertion here pins a defect that shipped once and must not ship again.
   None of it re-implements the rule: the views' own model functions are bundled
   with esbuild (their imports are extensionless for Vite, and they are JSX) and
   called directly, so a regression in the view fails here rather than in a
   realtor's Monday meeting.

   What is pinned:
     1  the "inside 48h" flag needs a LOWER bound or every overdue date is also
        "imminent"
     2  the huddle decides overdue against TODAY, not the Monday on screen, and
        never renders a negative "in N days"
     3  the weighted pipeline total sums OPEN stages only
     4  open pipeline excludes contacts that already have a transaction
     5  speed to first touch counts outbound kinds only, never the auto-note
     7  capPaidBefore() filters to the CAP PERIOD, and is deterministic for two
        deals closing the same day
    11  every funnel row counts the same unit
    18  a zero denominator is null, not 0
    20  a deal closed without a snapshot still reports its gross
    22  an appointment only counts toward a close if it happened BEFORE it
   ========================================================================== */

import { mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

/* ------------------------------------------------------------- the fixture
   Small and hand-built, not the demo seed: every date is stated relative to a
   fixed TODAY so these assertions mean the same thing in 2031. */
/* Dates are computed RELATIVE TO THE REAL CLOCK, not hardcoded.
   `daysUntil()` in dates.js reads the wall clock, so a fixture pinned to a
   literal date is a suite that goes red at midnight — which is exactly what it
   did the first time this file crossed a day boundary. Anchor on today and
   derive everything from it. */
import { today as realToday, addDays as plus, dow as dayOfWeek } from '../src/lib/dates.js';

/* ONE timezone for the fixture and the ctx it builds. daysUntil() resolves
   "today" in whatever tz it is handed, so anchoring the fixture in Chicago while
   telling the model UTC puts them a day apart for six hours every evening. */
const TZ = 'America/Chicago';
const TODAY = realToday(TZ);
const MONDAY = plus(TODAY, -((dayOfWeek(TODAY) + 6) % 7));   // Monday of this week
const SUNDAY = plus(MONDAY, 6);
/* The fixture's calendar-year dates are built from TODAY's year, not written as
   2026 literals. Several KPIs (GCI year-to-date, appointments held this
   calendar year, conversion ratio) filter on the CURRENT year, so a hardcoded
   2026 date silently stops matching at midnight on 1 Jan and takes eight
   assertions red with it. YEAR/PRIOR keep "earlier this year" and "last year"
   meaning what they say, forever. */
const YEAR  = TODAY.slice(0, 4);
const PRIOR = String(+YEAR - 1);
const inYear  = md => `${YEAR}-${md}`;
const inPrior = md => `${PRIOR}-${md}`;

const YESTERDAY = plus(TODAY, -1);
const TOMORROW = plus(TODAY, 1);

const dl = (key, date, extra) => ({ key, label: key, date, status: 'open', count: 'calendar', ...(extra || {}) });

const CONTACTS = [
  /* an open-stage contact with no transaction — real open pipeline */
  { id: 'c-open', name: 'Open Olive', side: 'seller', stage: 'apptheld', source: 'Referral',
    owner_id: 'u-a', targetPrice: 400000, created_at: inYear('06-01'), lastTouch: TODAY,
    appointments: [{ id: 'ap-1', type: 'listing', at: inYear('07-01'), status: 'held' }],
    activity: [
      { id: 'x1', at: inYear('06-01'), kind: 'note', note: 'Came in from Referral.' },
      { id: 'x2', at: inYear('06-05'), kind: 'call', note: 'Rang them.' },
    ] },
  /* an open-stage contact that is ALREADY under contract — must not be in the
     open-pipeline figures, it is on the transactions board */
  { id: 'c-uc', name: 'Under Ursula', side: 'seller', stage: 'offer', source: 'Zillow',
    owner_id: 'u-a', targetPrice: 500000, created_at: inYear('05-01'), lastTouch: TODAY,
    appointments: [], activity: [{ id: 'x3', at: inYear('05-01'), kind: 'note', note: 'Came in from Zillow.' }] },
  /* an open-stage contact whose deal has already CLOSED — its money is in GCI */
  { id: 'c-done', name: 'Closed Cleo', side: 'seller', stage: 'active', source: 'Past Client',
    owner_id: 'u-a', targetPrice: 300000, created_at: inYear('01-02'), lastTouch: TODAY,
    closedWithUsOn: inYear('03-01'),
    /* the appointment is AFTER the close: it cannot have produced it */
    appointments: [{ id: 'ap-2', type: 'listing', at: inYear('06-01'), status: 'held' }],
    activity: [{ id: 'x4', at: inYear('01-02'), kind: 'note', note: 'Came in from Past Client.' }] },
  /* a contact with a held appointment BEFORE its close — this one counts */
  { id: 'c-credit', name: 'Credit Cyrus', side: 'buyer', stage: 'nurturing', source: 'Referral',
    owner_id: 'u-a', priceMin: 200000, priceMax: 200000, created_at: inYear('01-05'), lastTouch: TODAY,
    appointments: [{ id: 'ap-3', type: 'consult', at: inYear('02-01'), status: 'held' }],
    activity: [{ id: 'x5', at: inYear('01-05'), kind: 'note', note: 'Came in from Referral.' }] },
  /* a LOST contact with a transaction and no appointments at all */
  { id: 'c-lost', name: 'Lost Lena', side: 'buyer', stage: 'lost', source: 'Social',
    owner_id: 'u-a', priceMin: 100000, priceMax: 100000, created_at: inYear('02-01'), lastTouch: TODAY,
    appointments: [], activity: [{ id: 'x6', at: inYear('02-01'), kind: 'note', note: 'Came in from Social.' }] },
];

const TXNS = [
  { id: 't-uc', owner_id: 'u-a', contact_id: 'c-uc', side: 'seller', phase: 'uc', status: 'active',
    address: '1 Live Ln', salePrice: 500000, commissionRate: 3,
    effectiveDate: inYear('07-20'), closeDate: inYear('09-01'),
    deadlines: [
      dl('overdue-one', YESTERDAY),             // overdue, and NOT inside 48h
      dl('tomorrow-one', TOMORROW),             // inside 48h
      dl('later-one', plus(TODAY, 4)),        // outside the window below, not overdue
      dl('nodate-one', null),                   // no date at all
    ] },
  { id: 't-closed', owner_id: 'u-a', contact_id: 'c-done', side: 'seller', phase: 'closed', status: 'closed',
    address: '2 Done Dr', salePrice: 300000, commissionRate: 3,
    effectiveDate: inYear('02-01'), closeDate: inYear('03-01'), closedActual: inYear('03-01'),
    capContribution: 1350,
    commissionSnapshot: { gross: 9000, agentNet: 7650, toBrokerage: 1350, teamCut: 0, at: inYear('03-01') } },
  /* closed by dragging the card into the Closed column: NO snapshot was written */
  { id: 't-nosnap', owner_id: 'u-a', contact_id: 'c-credit', side: 'buyer', phase: 'closed', status: 'closed',
    address: '3 Drag Way', salePrice: 200000, commissionRate: 3,
    effectiveDate: inYear('04-01'), closeDate: inYear('05-01'), closedActual: inYear('05-01') },
  { id: 't-fell', owner_id: 'u-a', contact_id: 'c-lost', side: 'buyer', phase: 'fell', status: 'fell',
    address: '4 Dead End', salePrice: 100000, commissionRate: 3,
    effectiveDate: inYear('03-01'), closeDate: inYear('04-01'), fellAt: inYear('03-20'), fellPhase: 'financing' },
];

const USERS = [
  { id: 'u-a', name: 'Agent A', role: 'agent', active: true,
    plan: { keepPct: 85, cap: 12000, postCapPct: 100, postCapFee: 0, teamPct: 0, fees: [], capCadence: 'calendar' } },
];

function makeCtx(settings, over) {
  const users_by_id = {};
  USERS.forEach(u => { users_by_id[u.id] = u; });
  return {
    me: USERS[0], isLeader: true, users: USERS, users_by_id,
    settings, contacts: CONTACTS, transactions: TXNS,
    todayIso: TODAY, tz: TZ,
    can: () => true, go: () => {}, params: {},
    ...(over || {}),
  };
}

/* --------------------------------------------------------------- the suite */
export default async function run(t) {
  /* Bundle the four views' pure model functions. The app suite in run.mjs
     already proves this bundles; here it is only imported, never rendered. */
  const esbuild = await import('esbuild');
  const outDir = path.join(root, '.test-build');
  mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'kpi-views.mjs');

  await esbuild.build({
    stdin: {
      contents: `
        export { buildModel, allowedSections } from './src/views/Dashboard.jsx';
        export { weekNumbers, weekDates } from './src/views/Huddle.jsx';
        export { weightedForecast } from './src/views/Pipeline.jsx';
        export { capPaidBefore } from './src/views/Transactions.jsx';
        /* txGross, closedOn and onClosedDate moved to lib/txn.js — they were
           defined in three views and two views respectively, and the tests were
           importing whichever copy happened to be exported. */
        export { closedOn, onClosedDate, txGross } from './src/lib/txn.js';
        export { defaultSettings, stagesOf } from './src/lib/settings.js';
        export { capPeriod, computeCommission, agentPlan } from './src/lib/commission.js';
      `,
      resolveDir: root,
      loader: 'js',
    },
    bundle: true, outfile: outFile, platform: 'browser', format: 'esm',
    jsx: 'transform', loader: { '.js': 'jsx', '.jsx': 'jsx' },
    define: {
      'import.meta.env': JSON.stringify({ VITE_DEMO: '1', MODE: 'test', DEV: false, PROD: true }),
      'process.env.NODE_ENV': '"production"',
    },
    logLevel: 'silent',
  });

  const V = await import(outFile + '?t=' + Date.now());
  const S = V.defaultSettings();
  const ctx = makeCtx(S);
  const m = V.buildModel(ctx);

  /* ==================================================================== 1
     THE INSIDE-48H LOWER BOUND.
     Three dated deadlines: one yesterday, one tomorrow, one in a fortnight.
     Without `n >= 0` the yesterday one counts as imminent too and the header
     reads "1 overdue · 2 inside 48h" about two rows. */
  t.eq(m.due.overdue, 1, 'one deadline is overdue');
  t.eq(m.due.hard, 1, 'and exactly ONE is inside 48 hours — the overdue one is not also imminent');
  const overdueRow = m.due.rows.find(r => r.dl.key === 'overdue-one');
  const soonRow = m.due.rows.find(r => r.dl.key === 'tomorrow-one');
  t.ok(overdueRow && overdueRow.days === -1 && overdueRow.hard === false,
    'a deadline that passed yesterday is overdue and NOT flagged inside 48h');
  t.ok(soonRow && soonRow.days === 1 && soonRow.hard === true,
    'a deadline landing tomorrow is flagged inside 48h');
  t.eq(m.due.rows.filter(r => r.dl.key === 'nodate-one').length, 0,
    'a deadline with no date is not counted as anything');

  /* ==================================================================== 4
     OPEN PIPELINE EXCLUDES CONTACTS THAT ALREADY HAVE A TRANSACTION.
     Three contacts sit in an open stage: one clean, one under contract, one
     whose deal has closed. Only the clean one is open pipeline. */
  t.eq(m.pipeline.openCount, 1, 'open pipeline counts only the contact with no transaction');
  t.eq(m.pipeline.openVolume, 400000, 'and only that contact\'s volume');
  t.eq(m.pipeline.excluded, 3,
    'the three already on the transactions board are reported as excluded, not silently dropped');
  t.ok(m.pipeline.weighted > 0 && m.pipeline.weighted < m.pipeline.openGross,
    'the weighted forecast is a fraction of the unweighted one');
  /* the closed deal is in GCI, so counting its contact in the forecast too
     would be the same dollars twice */
  t.eq(m.pipeline.gciYtd, 15000, 'GCI is the two closed deals, snapshot plus computed');

  /* a deal that FELL puts its contact back in play: move the lost contact to an
     open stage and it reappears in the forecast */
  const revived = makeCtx(S, {
    contacts: CONTACTS.map(c => (c.id === 'c-lost' ? { ...c, stage: 'nurturing' } : c)),
  });
  t.eq(V.buildModel(revived).pipeline.openCount, 2,
    'a contact whose only deal fell through is open pipeline again');

  /* ==================================================================== 3
     THE WEIGHTED PIPELINE TOTAL IS OPEN STAGES ONLY.
     The won column is already sold — the caption always said so, the total did
     not. Move a card into the won stage and the total must FALL, never rise. */
  const stages = V.stagesOf(S);
  const cols = stages.map(s => ({ key: s.key, label: s.key, color: s.color }));
  const clean = [{ id: 'c-x', stage: 'apptheld', targetPrice: 400000 }];
  const before = V.weightedForecast(cols, clean, [], S, 3);
  const after = V.weightedForecast(cols, [{ ...clean[0], stage: 'contract' }], [], S, 3);
  t.ok(before.total > 0, 'a contact in an open stage carries a forecast');
  t.eq(after.total, 0, 'the same contact in the WON column carries nothing');
  const lost = V.weightedForecast(cols, [{ ...clean[0], stage: 'lost' }], [], S, 3);
  t.eq(lost.total, 0, 'and nothing in the lost column either');
  t.ok(before.per.every(x => x.carries === !!(x.st && x.st.open)),
    'exactly the open columns are marked as carrying a forecast');
  /* and the pipeline agrees with the dashboard about contacts on the board */
  const onBoard = V.weightedForecast(cols, [{ id: 'c-uc', stage: 'offer', targetPrice: 500000 }], TXNS, S, 3);
  t.eq(onBoard.total, 0, 'a contact that already has a live transaction carries no forecast here either');
  t.eq(onBoard.excluded, 1, 'and the screen can say how many it left out');

  /* ==================================================================== 5
     SPEED TO FIRST TOUCH IS OUTBOUND ONLY.
     Every contact is created with an auto-logged "Came in from {source}" note
     stamped at creation. Counting notes makes this structurally 0 for every
     contact ever — the dashboard used to claim the team called every lead the
     day it landed. */
  t.eq(m.activity.speedN, 1, 'only the one contact with a call/text/email is measurable');
  t.eq(m.activity.speed, 4, 'and its speed is created 1 Jun -> called 5 Jun = 4 days, not 0');
  t.eq(m.activity.sameDay, 0, 'nothing is credited as a same-day touch');
  t.eq(m.activity.speedNone, CONTACTS.length - 1,
    'the rest are reported as having no outbound touch logged rather than as a zero');

  /* ==================================================================== 22
     AN APPOINTMENT ONLY COUNTS TOWARD A CLOSE IF IT HAPPENED BEFORE IT.
     c-credit was seen in February and closed in May: credited.
     c-done closed in March and was seen in June: NOT credited — an appointment
     after the closing table did not produce the closing. */
  const a2c = m.activity.apptToClose;
  t.eq(a2c.held, 3, 'three qualifying held appointments this calendar year');
  t.eq(a2c.closes, 1, 'exactly one close had a held appointment BEFORE it');
  t.eq(a2c.closedTotal, 2, 'even though two deals closed this year');
  t.eq(Math.round(a2c.rate * 1000) / 1000, 0.333, 'so the ratio is 1 in 3, not 2 in 3');

  /* move the June appointment to before the March close and it starts counting */
  const earlier = makeCtx(S, {
    contacts: CONTACTS.map(c => (c.id === 'c-done'
      ? { ...c, appointments: [{ id: 'ap-2', type: 'listing', at: inYear('02-15'), status: 'held' }] }
      : c)),
  });
  t.eq(V.buildModel(earlier).activity.apptToClose.closes, 2,
    'the same appointment moved BEFORE the close is credited');

  /* a showing is not a sales conversation, and a no-show is not a held one */
  const noisy = makeCtx(S, {
    contacts: CONTACTS.map(c => (c.id === 'c-credit'
      ? { ...c, appointments: [
        { id: 'ap-3', type: 'showing', at: inYear('02-01'), status: 'held' },
        { id: 'ap-4', type: 'consult', at: inYear('02-02'), status: 'noshow' },
      ] }
      : c)),
  });
  const noisyA2c = V.buildModel(noisy).activity.apptToClose;
  t.eq(noisyA2c.held, 2, 'a showing does not count and neither does a no-show');
  t.eq(noisyA2c.closes, 0, 'so that close is credited to nothing');

  /* zero denominator: no answer, not a confident zero */
  const noAppts = makeCtx(S, { contacts: CONTACTS.map(c => ({ ...c, appointments: [] })) });
  t.eq(V.buildModel(noAppts).activity.apptToClose.rate, null,
    'with no held appointments at all the ratio is null, so the screen can say so');

  /* ==================================================================== 18
     A ZERO DENOMINATOR IS NULL, NOT 0.
     ratio() returning 0 printed "0 %" in the amber "weak step" style beside a
     count that was not weak at all — it was unmeasurable. */
  const empty = V.buildModel(makeCtx(S, { contacts: [], transactions: [] }));
  t.ok(empty.funnel.every(r => r.ofTop === null),
    'with no contacts every funnel share is null rather than 0%');
  t.ok(empty.funnel.every(r => r.step === null), 'and so is every step');
  t.eq(empty.activity.holdRate, null, 'a hold rate with nothing set is null, not 0%');
  t.eq(empty.activity.apptToClose.rate, null, 'and so is the appointment-to-close ratio');
  /* with real data it is a number again */
  t.ok(m.funnel[1].step != null, 'a step with a real denominator is still a number');

  /* ==================================================================== 11
     EVERY FUNNEL ROW COUNTS THE SAME UNIT — CONTACTS.
     Row 4 used to count transactions and row 5 every closed transaction ever,
     so one contact with two deals could push a step over 100%. */
  const twoDeals = makeCtx(S, {
    transactions: [...TXNS, {
      id: 't-second', owner_id: 'u-a', contact_id: 'c-uc', side: 'buyer', phase: 'closed',
      status: 'closed', salePrice: 250000, commissionRate: 3,
      closeDate: inYear('06-01'), closedActual: inYear('06-01'),
    }],
  });
  const f2 = V.buildModel(twoDeals).funnel;
  const uc = f2.find(r => r.key === 'contract');
  const cl = f2.find(r => r.key === 'closed');
  t.eq(uc.n, 4, 'under contract counts the four CONTACTS with a transaction, not the five transactions');
  t.eq(cl.n, 3, 'closed counts the three contacts with a closed deal, not the three closed deals plus the double');
  t.ok(f2.every(r => r.step == null || r.step <= 1),
    'no step exceeds 100% once every row counts the same thing');

  /* A LOST contact is credited only for the appointments it actually had.
     The transaction short-circuit used to run FIRST, so a lost contact with a
     dead deal and no appointments at all was credited with every step —
     contradicting the comment three lines above it. */
  const onlyLost = V.buildModel(makeCtx(S, {
    contacts: CONTACTS.filter(c => c.id === 'c-lost'),
    transactions: TXNS.filter(x => x.id === 't-fell'),
  })).funnel;
  const at = k => onlyLost.find(r => r.key === k).n;
  t.eq(at('apptset'), 0, 'a lost contact with a transaction but NO appointments is not credited with one set');
  t.eq(at('apptheld'), 0, 'nor with one held');
  t.eq(at('contract'), 1, 'but it IS credited with having been under contract — a dead deal was still a deal');
  t.eq(at('closed'), 0, 'and it never closed');
  t.eq(m.funnel.find(r => r.key === 'apptset').n, 4,
    'so the appointment row counts four of the five contacts, not all five');

  /* ==================================================================== 20
     A DEAL CLOSED WITHOUT A SNAPSHOT STILL REPORTS ITS GROSS.
     Dragging a card into the Closed column never writes a commissionSnapshot;
     reading the snapshot alone reported those deals as $0 of GCI. */
  const snapped = TXNS.find(x => x.id === 't-closed');
  const dragged = TXNS.find(x => x.id === 't-nosnap');
  t.eq(V.txGross(snapped), 9000, 'a snapshotted deal reports its snapshot');
  t.eq(V.txGross(dragged), 6000, 'a deal closed with no snapshot reports 200,000 x 3% = 6,000, not $0');
  t.eq(m.pipeline.gciYtd, 15000, 'so the GCI tile is 9,000 + 6,000');

  /* the huddle counts the same way */
  const wk = V.weekNumbers([], [{ ...dragged, closedActual: plus(MONDAY, 2) }], MONDAY, SUNDAY, S, {});
  t.eq(wk.closed, 1, 'the huddle sees the deal that closed this week');
  t.eq(wk.lists.closed.length, 1, 'and can name it');

  /* ==================================================================== 2
     THE HUDDLE DECIDES OVERDUE AGAINST TODAY.
     The overdue deadline is yesterday — inside the window on screen, so the old
     `when < weekOf` test called it "lands this week" while its own chip computed
     daysUntil() against today and printed "in -1 days". */
  /* The window is TODAY +/- 3 days, not Monday-Sunday. A Mon-Sun week cannot
     hold both YESTERDAY and TOMORROW on the days that matter: run this on a
     Monday and YESTERDAY falls in the previous week, run it on a Sunday and
     TOMORROW falls in the next one, and either way the row being asserted on
     comes back undefined. weekDates() takes an arbitrary window, so widening it
     tests exactly the same logic on all seven days instead of five.

     TZ, not 'UTC' — see the note at the top of this file. The fixture is
     anchored in Chicago and handing the model a different zone puts them a day
     apart for six hours every evening. */
  const WIN_FROM = plus(TODAY, -3), WIN_TO = plus(TODAY, 3);
  const wd = V.weekDates(TXNS, WIN_FROM, WIN_TO, TZ);
  const od = wd.find(d => d.label === 'overdue-one');
  const soon = wd.find(d => d.label === 'tomorrow-one');
  t.ok(od && od.overdue === true, 'a deadline that passed yesterday is overdue in the window it sits in');
  t.ok(od && od.inWeek === true, 'and it is still inside the window on screen');
  t.ok(soon && soon.overdue === false, "tomorrow's deadline is not overdue");
  t.eq(wd.filter(d => d.overdue).length, 1, 'the header says 1 overdue, matching the dashboard');
  t.eq(wd.filter(d => !d.overdue && d.inWeek).length, 1, 'and 1 still to land inside the window');
  t.ok(wd.every(d => d.away == null || d.overdue === d.away < 0),
    'no row can be "lands this week" while its own days-until is negative');

  /* a deadline that passed BEFORE the week on screen still surfaces */
  /* Relative, not hardcoded. inYear('08-10') to inYear('08-16') was a future window
     when it was written and is the CURRENT week now, so YESTERDAY sits inside
     it and the !inWeek assertion inverts. */
  const nextWeek = V.weekDates(TXNS, plus(TODAY, 7), plus(TODAY, 13), TZ);
  t.ok(nextWeek.some(d => d.label === 'overdue-one' && d.overdue && !d.inWeek),
    'an overdue date from a past week is carried into a later week\'s huddle, flagged as overdue');

  /* ==================================================================== 7
     capPaidBefore() FILTERS TO THE CAP PERIOD.
     A deal that closed in a PRIOR cap year must not be counted against this
     year's cap. It used to be, and because "Mark closed and snapshot the split"
     writes the result, the wrong capContribution was persisted to the record. */
  const plan = USERS[0].plan;                       // calendar-year cap, 12,000
  const priorYear = { id: 't-2025', owner_id: 'u-a', status: 'closed',
    closeDate: inPrior('11-01'), closedActual: inPrior('11-01'), capContribution: 11000,
    salePrice: 700000, commissionRate: 3 };
  const thisYear = { id: 't-2026a', owner_id: 'u-a', status: 'closed',
    closeDate: inYear('02-01'), closedActual: inYear('02-01'), capContribution: 1000,
    salePrice: 300000, commissionRate: 3 };
  const subject = { id: 't-2026b', owner_id: 'u-a', status: 'active',
    closeDate: inYear('09-01'), salePrice: 400000, commissionRate: 3 };
  const capCtx = {
    settings: S, todayIso: TODAY,
    users_by_id: { 'u-a': USERS[0] },
    transactions: [priorYear, thisYear, subject],
  };
  t.eq(V.capPaidBefore(capCtx, subject), 1000,
    'only the 1,000 paid THIS cap period counts — last year\'s 11,000 does not');
  t.ok(V.capPeriod(inPrior('11-01'), plan).label !== V.capPeriod(inYear('02-01'), plan).label,
    'those two closings really are in different cap periods');
  /* and the consequence: without the filter this deal would price as capped out */
  const wrong = V.computeCommission(subject, plan, { capPaidToDate: 12000 });
  const right = V.computeCommission(subject, plan, { capPaidToDate: V.capPaidBefore(capCtx, subject) });
  t.ok(wrong.fullyPostCap && !right.fullyPostCap,
    'the unfiltered figure would have costed this deal post-cap; the filtered one does not');
  t.eq(right.capContribution, 1800, 'so 1,800 goes to the cap, and that is what gets snapshotted');

  /* same-day determinism: strict `<` on the date alone meant two deals closing
     on the same day never saw each other and both used the same cap balance */
  const sameA = { id: 'aaa', owner_id: 'u-a', status: 'closed', closeDate: inYear('03-01'),
    closedActual: inYear('03-01'), capContribution: 2000, salePrice: 300000, commissionRate: 3 };
  const sameB = { id: 'bbb', owner_id: 'u-a', status: 'closed', closeDate: inYear('03-01'),
    closedActual: inYear('03-01'), capContribution: 2000, salePrice: 300000, commissionRate: 3 };
  const sameCtx = { ...capCtx, transactions: [sameA, sameB] };
  t.eq(V.capPaidBefore(sameCtx, sameA), 0, 'the first of two same-day closings starts from nothing');
  t.eq(V.capPaidBefore(sameCtx, sameB), 2000, 'and the second sees the first — they no longer share a cap balance');
  const flipped = { ...sameCtx, transactions: [sameB, sameA] };
  t.eq(V.capPaidBefore(flipped, sameB), 2000, 'and the answer does not depend on array order');

  /* capPaidBefore reads closedOn(), so a deal that closed late lands in the
     period it actually closed in, not the one it was scheduled for */
  t.eq(V.closedOn({ closeDate: inPrior('12-30'), closedActual: inYear('01-05') }), inYear('01-05'),
    'the actual close date wins over the scheduled one');
  t.eq(V.onClosedDate({ closeDate: inPrior('12-30'), closedActual: inYear('01-05') }).closeDate, inYear('01-05'),
    'and the cap engine is handed that date, so both screens agree on the period');
  const late = { id: 't-late', owner_id: 'u-a', status: 'closed',
    closeDate: inPrior('12-30'), closedActual: inYear('01-05'), capContribution: 500 };
  t.eq(V.capPaidBefore({ ...capCtx, transactions: [late, subject] }, subject), 500,
    'a deal scheduled for December but closed in January counts against the January cap period');

  /* ---------------------------------------------------------------- tidy up */
  try { rmSync(outFile, { force: true }); } catch { /* the runner cleans the dir */ }

  /* ==================================================================== N
     THE SCORECARD'S NEW COLUMNS.

     Volume, average price, fall-through rate and cap progress. Three of the
     four are arithmetic; the interesting ones are the two judgment calls,
     which are asserted rather than left to a comment:

       AVERAGE PRICE divides by TRANSACTIONS, not units. A dual-agency deal is
       two units and one house — dividing by units would halve the average
       price of every deal where the agent represented both sides.

       FALL-THROUGH is measured over RESOLVED deals only, closed plus fell. A
       deal still under contract has not had its chance to fall, and counting
       it would flatter whoever has a full board this month. When nothing has
       resolved the rate is NULL, not zero: a rate over no deals is unknown.
     ------------------------------------------------------------------ */
  {
    const sc = m.scorecard;
    t.ok(Array.isArray(sc) && sc.length > 0, 'the scorecard has rows');

    for (const r of sc) {
      t.ok(r.volume >= 0, `${r.user.name}: volume is a number, not NaN`);
      t.ok(r.avgPrice === null || r.avgPrice > 0, `${r.user.name}: average price is null or positive, never zero`);
      t.ok(r.fellRate === null || (r.fellRate >= 0 && r.fellRate <= 1),
        `${r.user.name}: fall-through is a fraction or null`);
      if (r.fellRate !== null) {
        t.eq(r.resolved, r.units > 0 || r.fell > 0 ? r.resolved : 0,
          `${r.user.name}: resolved is carried on the row rather than reconstructed from the rate`);
        t.ok(r.resolved >= r.fell, `${r.user.name}: resolved includes the ones that fell`);
      }
      /* the cap figure is JOINED from the same rows the bars render, so the two
         cannot disagree about how far through a cap somebody is */
      const bar = m.capRows && m.capRows.find(x => x.user.id === r.user.id);
      if (bar && r.cap) {
        t.eq(r.cap.pct, bar.prog.pct, `${r.user.name}: the scorecard cap matches the cap bar exactly`);
      }
    }

    /* THE BOUNDARY. This section is the only place on the dashboard carrying
       per-agent money, and the rule is the same one the assistant's redaction
       follows: the UI is the boundary because Postgres deliberately is not.
       A coordinator reads every transaction row in the database, salePrice
       included — so the ONLY thing keeping GCI off their screen is that this
       section never renders for them. Asserted, not assumed. */
    t.ok(V.allowedSections(true).some(x => x.key === 'scorecard'),
      'the leader gets the team scorecard');
    t.ok(!V.allowedSections(false).some(x => x.key === 'scorecard'),
      'and nobody else does — one filter, and it is the whole control');

    /* a seat with nothing resolved must read unknown, not 0% */
    const untouched = sc.find(r => r.units === 0 && r.fell === 0);
    if (untouched) t.eq(untouched.fellRate, null, 'a seat with nothing resolved has no fall-through rate at all');
  }
}
