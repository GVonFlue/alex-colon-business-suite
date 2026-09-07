/* ============================================================================
   Unit tests for the split / cap engine.

   The four scenarios the brief names explicitly:
     - the cap straddle (its own worked example, to the dollar)
     - the first transaction of a new cap year
     - a transaction that exactly hits the cap
     - a fully capped agent
   plus team-split order, referral off the top, per-transaction fees, cap
   periods, and the replay that costs each deal against the cap as it stood.
   ========================================================================== */

import {
  computeCommission, agentPlan, capPeriod, capProgress, replayYear, usd,
} from '../src/lib/commission.js';

const PLAN = {
  keepPct: 85, cap: 12000, postCapPct: 100, postCapFee: 285,
  teamPct: 0, teamOrder: 'team-first', fees: [], capCadence: 'calendar',
};

export default function run(t) {
  /* ------------------------------------------------------------- the basics */
  const a = computeCommission({ salePrice: 300000, commissionRate: 3 }, PLAN, { capPaidToDate: 0 });
  t.eq(a.gross, 9000, '300,000 at 3% is 9,000 gross');
  t.eq(a.toBrokerage, 1350, '15% of it goes to the brokerage');
  t.eq(a.capContribution, 1350, 'and all of that counts toward the cap');
  t.eq(a.agentNet, 7650, 'leaving the agent 7,650');
  t.eq(a.capRemainingAfter, 10650, 'with 10,650 left on the cap');
  t.ok(!a.straddle && !a.fullyPostCap, 'no straddle, not capped');
  t.eq(a.lines[0].kind, 'gross', 'the waterfall starts at gross');
  t.eq(a.lines[a.lines.length - 1].kind, 'total', 'and ends at the agent net');

  /* a flat commission overrides the rate; an explicit gross override beats both */
  t.eq(computeCommission({ salePrice: 300000, commissionRate: 3, flatCommission: 5000 }, PLAN, {}).gross, 5000,
    'a flat commission wins over the rate');
  t.eq(computeCommission({ salePrice: 300000, commissionRate: 3, flatCommission: 5000, grossOverride: 4200 }, PLAN, {}).gross, 4200,
    'an override wins over everything');

  /* ------------------------------------------------- 1. THE CAP STRADDLE ---
     The brief's example: $2,000 left on the cap, this transaction owes the
     brokerage $3,500. $2,000 finishes the cap; $1,500 is treated at the
     post-cap split, which is 100% to the agent. */
  const straddleGross = 3500 / 0.15;                    // 23,333.33
  const s = computeCommission({ grossOverride: straddleGross }, PLAN, { capPaidToDate: 10000 });
  t.eq(s.capRemainingBefore, 2000, '2,000 left on the cap going in');
  t.eq(s.brokerageDesired, 3500, 'the brokerage would have taken 3,500');
  t.ok(s.straddle, 'so this is a straddle and the engine says so');
  t.eq(s.capContribution, 2000, 'exactly the remaining cap goes to the cap');
  t.eq(s.brokerageFromExcess, 0, 'the excess is at the post-cap split of 100%, so the brokerage takes none of it');
  t.eq(s.toBrokerage, 2000, 'total to the brokerage is the cap remainder');
  t.eq(s.agentNet, Math.round((straddleGross - 2000) * 100) / 100, 'the agent keeps the other 1,500 on top of their 85%');
  t.eq(s.capRemainingAfter, 0, 'the cap is now met');
  t.ok(s.capMetOnThis, 'and this is the transaction that met it');
  t.ok(/finishes the cap/.test(s.lines.find(l => l.label === 'Brokerage split').note),
    'the waterfall line explains the straddle in words');
  /* the post-cap fee is NOT charged on the deal that caps them out, by setting */
  t.eq(s.postCapFee, 0, 'no post-cap fee on the capping deal by default');
  const sFee = computeCommission({ grossOverride: straddleGross }, { ...PLAN, postCapFeeOnStraddle: true }, { capPaidToDate: 10000 });
  t.eq(sFee.postCapFee, 285, 'unless the brokerage sets postCapFeeOnStraddle');

  /* a straddle where the post-cap split is NOT 100% */
  const s80 = computeCommission({ grossOverride: straddleGross }, { ...PLAN, postCapPct: 80 }, { capPaidToDate: 10000 });
  t.eq(s80.brokerageFromExcess, 300, 'with a post-cap split of 80/20 the brokerage takes 20% of the 1,500 excess');
  t.eq(s80.toBrokerage, 2300, 'so 2,300 total');
  t.eq(s80.capContribution, 2000, 'but only the 2,000 is cap credit — post-cap dollars never are');

  /* ------------------------------------- 2. FIRST TRANSACTION OF A NEW YEAR */
  const fresh = computeCommission({ salePrice: 415000, commissionRate: 3 }, PLAN, { capPaidToDate: 0 });
  t.eq(fresh.gross, 12450, 'gross on a 415,000 sale at 3%');
  t.eq(fresh.capContribution, 1867.5, 'the whole brokerage share counts toward a fresh cap');
  t.eq(fresh.capRemainingAfter, 10132.5, 'and the cap has that much less on it');
  t.ok(!fresh.straddle && !fresh.fullyPostCap, 'nothing special about it');
  t.eq(fresh.postCapFee, 0, 'no post-cap fee before the cap is met');

  /* ------------------------------------------ 3. EXACTLY HITTING THE CAP --- */
  const exactGross = 2000 / 0.15;                       // brokerage share = exactly 2,000
  const e = computeCommission({ grossOverride: exactGross }, PLAN, { capPaidToDate: 10000 });
  t.eq(e.brokerageDesired, 2000, 'the brokerage share is exactly what is left');
  t.ok(!e.straddle, 'that is not a straddle — nothing spills over');
  t.eq(e.capContribution, 2000, 'all of it is cap credit');
  t.eq(e.capRemainingAfter, 0, 'the cap is met to the dollar');
  t.ok(e.capMetOnThis, 'and this transaction met it');
  t.eq(e.postCapFee, 0, 'no post-cap fee on the deal that hits it exactly');

  /* -------------------------------------------- 4. A FULLY CAPPED AGENT --- */
  const capped = computeCommission({ salePrice: 415000, commissionRate: 3 }, PLAN, { capPaidToDate: 12000 });
  t.ok(capped.fullyPostCap, 'the engine knows they are past the cap');
  t.eq(capped.toBrokerage, 0, 'a 100% post-cap split means the brokerage takes nothing from the split');
  t.eq(capped.capContribution, 0, 'and nothing is cap credit');
  t.eq(capped.postCapFee, 285, 'but the flat post-cap transaction fee is charged');
  t.eq(capped.agentNet, 12165, 'so the agent nets gross minus the fee');
  t.eq(capped.capRemainingAfter, 0, 'the cap stays met');

  const capped90 = computeCommission({ salePrice: 415000, commissionRate: 3 }, { ...PLAN, postCapPct: 90 }, { capPaidToDate: 12000 });
  t.eq(capped90.toBrokerage, 186.75, 'a 90% post-cap split still gives the brokerage 10% of their would-be share');
  t.eq(capped90.capContribution, 0, 'still no cap credit');

  /* -------------------------------------------------- no cap configured --- */
  const nocap = computeCommission({ salePrice: 300000, commissionRate: 3 }, { ...PLAN, cap: 0 }, { capPaidToDate: 0 });
  t.eq(nocap.toBrokerage, 1350, 'with no cap the split is just the split');
  t.eq(nocap.capContribution, 0, 'and there is no cap to credit');
  t.eq(nocap.capRemainingBefore, null, 'cap fields are null rather than zero, so the UI can tell the difference');

  /* ------------------------------------------------- referral off the top - */
  const ref = computeCommission({ salePrice: 300000, commissionRate: 3, referralOutType: 'pct', referralOut: 25 }, PLAN, { capPaidToDate: 0 });
  t.eq(ref.gross, 9000, 'gross is before the referral');
  t.eq(ref.referral, 2250, '25% of gross goes out as a referral fee');
  t.eq(ref.afterReferral, 6750, 'the split is calculated on what is left');
  t.eq(ref.toBrokerage, 1012.5, 'so the brokerage takes 15% of 6,750, not of 9,000');
  t.eq(ref.agentNet, 5737.5, 'and the agent nets 5,737.50');
  const refFlat = computeCommission({ grossOverride: 9000, referralOutType: 'flat', referralOut: 1000 }, PLAN, {});
  t.eq(refFlat.referral, 1000, 'a flat referral is taken as-is');
  t.eq(computeCommission({ grossOverride: 500, referralOutType: 'flat', referralOut: 9000 }, PLAN, {}).referral, 500,
    'a referral larger than the gross is capped at the gross rather than going negative');

  /* ------------------------------------------------- team split ORDER ----- */
  const teamFirst = computeCommission({ grossOverride: 10000 }, { ...PLAN, teamPct: 10, teamOrder: 'team-first' }, { capPaidToDate: 0 });
  t.eq(teamFirst.teamCut, 1000, 'team-first takes 10% of the 10,000');
  t.eq(teamFirst.toBrokerage, 1350, 'and the brokerage takes 15% of the remaining 9,000');
  t.eq(teamFirst.agentNet, 7650, 'agent nets 7,650');

  const brokFirst = computeCommission({ grossOverride: 10000 }, { ...PLAN, teamPct: 10, teamOrder: 'brokerage-first' }, { capPaidToDate: 0 });
  t.eq(brokFirst.toBrokerage, 1500, 'brokerage-first takes 15% of the full 10,000');
  t.eq(brokFirst.teamCut, 850, 'then the team takes 10% of what is left');
  t.eq(brokFirst.agentNet, 7650, 'the agent net happens to match here…');
  t.ok(teamFirst.capContribution !== brokFirst.capContribution,
    '…but the CAP CREDIT differs — 1,350 vs 1,500 — which is why the order cannot be picked silently');
  t.eq(brokFirst.capContribution, 1500, 'brokerage-first sends more to the cap');

  /* ------------------------------------------------ per-transaction fees -- */
  const fees = computeCommission({ grossOverride: 10000 },
    { ...PLAN, fees: [{ label: 'E&O', type: 'flat', value: 45 }, { label: 'Tech', type: 'pct', value: 1 }] }, { capPaidToDate: 0 });
  t.eq(fees.fees, 145, 'a 45 flat fee plus 1% of gross is 145');
  t.eq(fees.agentNet, 8355, 'taken after the splits');

  /* --------------------------------------------------------- cap periods - */
  const calYear = capPeriod('2026-07-30', { capCadence: 'calendar' });
  t.eq(calYear.start + '..' + calYear.end, '2026-01-01..2026-12-31', 'a calendar cap year');
  const anniv = capPeriod('2026-07-30', { capCadence: 'anniversary', capStart: '2024-09-15' });
  t.eq(anniv.start + '..' + anniv.end, '2025-09-15..2026-09-14', 'an anniversary cap year, mid-period');
  const anniv2 = capPeriod('2026-09-20', { capCadence: 'anniversary', capStart: '2024-09-15' });
  t.eq(anniv2.start, '2026-09-15', 'and it rolls on the anniversary');
  t.eq(capPeriod('nonsense', {}), null, 'a bad date gives null, not a wrong period');

  /* -------------------------------------------------------- cap progress - */
  const closed = [
    { closeDate: '2026-02-10', capContribution: 1800 },
    { closeDate: '2026-04-02', capContribution: 2400 },
    { closeDate: '2026-06-19', capContribution: 2850 },
    { closeDate: '2025-11-30', capContribution: 5000 },   // last cap year, must not count
  ];
  const prog = capProgress(closed, PLAN, '2026-07-30');
  t.eq(prog.paid, 7050, 'only this cap period counts');
  t.eq(prog.remaining, 4950, 'so 4,950 to go');
  t.eq(prog.count, 3, 'three transactions in the period');
  t.ok(prog.pct > 0.58 && prog.pct < 0.59, 'the bar is around 59%');
  t.ok(!prog.capped, 'not capped');
  t.ok(prog.projected && prog.projected > '2026-07-30', 'and a projected cap date in the future');
  const cappedProg = capProgress([{ closeDate: '2026-03-01', capContribution: 12000 }], PLAN, '2026-07-30');
  t.ok(cappedProg.capped && cappedProg.remaining === 0, 'a capped agent reads as capped');
  t.eq(cappedProg.projected, null, 'with no projection needed');
  t.eq(capProgress([], PLAN, '2026-07-30').projected, null, 'no closings means no pace to project from');

  /* ------------------------------------------------------------- replay --- */
  /* five deals in close order against a 12,000 cap: the cap must be consumed
     progressively and the straddle must land on the deal that crosses it */
  const txns = [
    { closeDate: '2026-01-20', salePrice: 400000, commissionRate: 3 },   // 12,000 gross, 1,800 to cap
    { closeDate: '2026-03-15', salePrice: 500000, commissionRate: 3 },   // 15,000 gross, 2,250
    { closeDate: '2026-05-01', salePrice: 900000, commissionRate: 3 },   // 27,000 gross, 4,050
    { closeDate: '2026-06-10', salePrice: 800000, commissionRate: 3 },   // 24,000 gross, 3,600 -> total 11,700
    { closeDate: '2026-07-05', salePrice: 600000, commissionRate: 3 },   // would be 2,700 -> straddles at 300
  ];
  const rep = replayYear(txns, PLAN, capPeriod('2026-07-30', PLAN));
  t.eq(rep.rows.length, 5, 'all five replayed');
  t.eq(rep.rows[3].capAfter, 11700, 'the cap stands at 11,700 after the fourth');
  t.ok(rep.rows[4].calc.straddle, 'the fifth straddles');
  t.eq(rep.rows[4].calc.capContribution, 300, 'contributing only the last 300');
  t.eq(rep.capPaid, 12000, 'and the cap ends exactly met, never over');
  t.eq(rep.gci, 96000, 'GCI is the sum of the grosses (12k + 15k + 27k + 24k + 18k)');
  /* order matters: shuffling the input must not change the outcome, because
     replayYear sorts by close date itself */
  const shuffled = replayYear([txns[4], txns[0], txns[3], txns[1], txns[2]], PLAN, capPeriod('2026-07-30', PLAN));
  t.eq(shuffled.capPaid, rep.capPaid, 'replay is order-independent on input');
  t.eq(shuffled.net, rep.net, 'and so is the net');

  /* ---------------------------------------------------------- agentPlan --- */
  const p = agentPlan({});
  t.eq(p.keepPct, 85, 'a missing keepPct defaults to 85');
  t.eq(p.postCapPct, 100, 'post-cap defaults to 100');
  t.eq(p.teamOrder, 'team-first', 'and the team order defaults to team-first, which is the confirmed install default');
  t.eq(agentPlan({ keepPct: 900 }).keepPct, 100, 'a nonsense percentage is clamped');
  t.eq(agentPlan({ cap: -5 }).cap, 0, 'a negative cap becomes no cap');
  t.eq(usd(1234.56), '$1,235', 'usd rounds for display');
}
