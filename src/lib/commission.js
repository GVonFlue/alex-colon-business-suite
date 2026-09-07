/* ============================================================================
   commission.js — the split / cap engine.

   Order of operations is fixed by the brief (§5) and must not be reordered:

     1. gross            = sale price x rate   (or a flat commission)
     2. minus referral fee out                 (comes off the top)
     3. team split       (if configured to run FIRST)
     4. brokerage split  against REMAINING CAP
     5. team split       (if configured to run SECOND)
     6. minus per-transaction fees
     7. = agent net

   The cap straddle is the case every other CRM gets wrong, so it is explicit:
   if the brokerage's share of this transaction is larger than what is left on
   the agent's cap, the cap gets what remains of it and the EXCESS is treated at
   the post-cap split (usually 100% to the agent). Worked example from the brief:
   $2,000 left on cap, brokerage share $3,500 -> $2,000 to the cap, $1,500 at
   the post-cap split.

   Only the amount that goes to the cap counts toward the cap. Money the
   brokerage takes out of post-cap dollars does not (it is not cap credit).

   No imports, no env. Unit-testable in plain node.
   ========================================================================== */

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const r2 = v => Math.round(num(v) * 100) / 100;
const clampPct = v => Math.min(100, Math.max(0, num(v)));

/** the per-agent settings this engine needs, with safe defaults */
export function agentPlan(partial) {
  const p = partial || {};
  return {
    keepPct:      p.keepPct == null ? 85 : clampPct(p.keepPct),      // agent keeps, pre-cap
    cap:          Math.max(0, num(p.cap)),                           // 0 = no cap
    postCapPct:   p.postCapPct == null ? 100 : clampPct(p.postCapPct),
    postCapFee:   Math.max(0, num(p.postCapFee)),
    postCapFeeOnStraddle: !!p.postCapFeeOnStraddle,                  // default: not charged on the deal that caps
    teamPct:      clampPct(p.teamPct),                               // team leader's cut of the agent's side
    teamOrder:    p.teamOrder === 'brokerage-first' ? 'brokerage-first' : 'team-first',
    fees:         Array.isArray(p.fees) ? p.fees : [],               // [{label, type:'flat'|'pct', value}]
    capStart:     p.capStart || null,                                // 'YYYY-MM-DD' anniversary
    capCadence:   p.capCadence === 'calendar' ? 'calendar' : 'anniversary',
  };
}

/**
 * Compute one transaction's commission.
 *
 * @param {object} txn   { salePrice, commissionRate, flatCommission, grossOverride,
 *                         referralOutType:'pct'|'flat', referralOut }
 * @param {object} plan  agentPlan()
 * @param {object} state { capPaidToDate }  cap dollars already paid this period
 * @returns full breakdown + a printable waterfall
 */
export function computeCommission(txn, plan, state) {
  const t = txn || {};
  const p = agentPlan(plan);
  const capPaid = Math.max(0, num(state && state.capPaidToDate));
  const lines = [];

  /* 1. gross */
  const rate = num(t.commissionRate);
  const byRate = r2(num(t.salePrice) * (rate / 100));
  const flat = num(t.flatCommission);
  let gross = num(t.grossOverride) > 0 ? r2(t.grossOverride)
            : flat > 0 ? r2(flat)
            : byRate;
  const grossBasis = num(t.grossOverride) > 0 ? 'override'
                   : flat > 0 ? 'flat amount'
                   : `${num(t.salePrice).toLocaleString()} x ${rate}%`;
  lines.push({ label: 'Gross commission', note: grossBasis, value: gross, kind: 'gross' });

  /* 2. referral fee out — off the top */
  let referral = 0;
  if (t.referralOutType === 'pct') referral = r2(gross * (clampPct(t.referralOut) / 100));
  else referral = Math.max(0, r2(t.referralOut));
  referral = Math.min(referral, gross);
  let running = r2(gross - referral);
  if (referral) lines.push({
    label: 'Referral fee out',
    note: t.referralOutType === 'pct' ? `${clampPct(t.referralOut)}% of gross` : 'flat, off the top',
    value: -referral, kind: 'out',
  });

  const afterReferral = running;

  /* 3. team split, first pass */
  let teamCut = 0;
  if (p.teamPct > 0 && p.teamOrder === 'team-first') {
    teamCut = r2(running * (p.teamPct / 100));
    running = r2(running - teamCut);
    lines.push({ label: 'Team split', note: `${p.teamPct}% to the team, before the brokerage`, value: -teamCut, kind: 'out' });
  }

  /* 4. brokerage split against the remaining cap */
  const brokerageRate = r2(100 - p.keepPct) / 100;
  const desired = r2(running * brokerageRate);
  const remainingCap = p.cap > 0 ? Math.max(0, r2(p.cap - capPaid)) : Infinity;

  let toCap = 0, brokerageFromExcess = 0, straddle = false, fullyPostCap = false;

  if (p.cap <= 0) {
    toCap = 0;
    brokerageFromExcess = desired;                 // no cap configured: plain split, no cap credit
  } else if (remainingCap <= 0) {
    fullyPostCap = true;
    brokerageFromExcess = r2(desired * ((100 - p.postCapPct) / 100));
  } else if (desired > remainingCap) {
    straddle = true;
    toCap = remainingCap;
    const excess = r2(desired - remainingCap);
    brokerageFromExcess = r2(excess * ((100 - p.postCapPct) / 100));
  } else {
    toCap = desired;
  }
  const toBrokerage = r2(toCap + brokerageFromExcess);
  running = r2(running - toBrokerage);

  if (p.keepPct < 100 || toBrokerage) {
    const note = p.cap <= 0 ? `${r2(100 - p.keepPct)}% to the brokerage (no cap configured)`
      : fullyPostCap ? `capped out — post-cap split is ${p.postCapPct}% to the agent`
      : straddle ? `${r2(100 - p.keepPct)}% would be ${usd(desired)}; ${usd(toCap)} finishes the cap, ${usd(r2(desired - toCap))} at the post-cap ${p.postCapPct}%`
      : `${r2(100 - p.keepPct)}% to the brokerage, against the cap`;
    lines.push({ label: 'Brokerage split', note, value: -toBrokerage, kind: 'out' });
  }

  /* 5. team split, second pass */
  if (p.teamPct > 0 && p.teamOrder === 'brokerage-first') {
    teamCut = r2(running * (p.teamPct / 100));
    running = r2(running - teamCut);
    lines.push({ label: 'Team split', note: `${p.teamPct}% to the team, after the brokerage`, value: -teamCut, kind: 'out' });
  }

  /* 6. per-transaction fees */
  const feeRows = [];
  p.fees.forEach(f => {
    const v = f.type === 'pct' ? r2(gross * (clampPct(f.value) / 100)) : Math.max(0, r2(f.value));
    if (!v) return;
    feeRows.push({ label: f.label || 'Fee', value: v });
    running = r2(running - v);
    lines.push({ label: f.label || 'Fee', note: f.type === 'pct' ? `${clampPct(f.value)}% of gross` : 'per transaction', value: -v, kind: 'out' });
  });
  let postCapFee = 0;
  if (p.postCapFee > 0 && (fullyPostCap || (straddle && p.postCapFeeOnStraddle))) {
    postCapFee = p.postCapFee;
    running = r2(running - postCapFee);
    lines.push({ label: 'Post-cap transaction fee', note: 'flat, charged once capped', value: -postCapFee, kind: 'out' });
  }
  const fees = r2(feeRows.reduce((s, f) => s + f.value, 0) + postCapFee);

  /* 7. agent net */
  const agentNet = r2(running);
  lines.push({ label: 'Agent net', value: agentNet, kind: 'total' });

  return {
    gross, referral, afterReferral, teamCut, brokerageRate,
    brokerageDesired: desired, toBrokerage, capContribution: toCap, brokerageFromExcess,
    fees, feeRows, postCapFee, agentNet,
    straddle, fullyPostCap,
    capBefore: capPaid,
    capAfter: p.cap > 0 ? r2(Math.min(p.cap, capPaid + toCap)) : r2(capPaid + toCap),
    capRemainingBefore: p.cap > 0 ? Math.max(0, r2(p.cap - capPaid)) : null,
    capRemainingAfter: p.cap > 0 ? Math.max(0, r2(p.cap - capPaid - toCap)) : null,
    capMetOnThis: p.cap > 0 && capPaid < p.cap && r2(capPaid + toCap) >= p.cap,
    plan: p, lines,
  };
}

export const usd = v => '$' + Math.round(num(v)).toLocaleString();
export const usd2 = v => '$' + num(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ---------- cap periods ---------- */

/** which cap period a date falls in, given the plan. Dates are 'YYYY-MM-DD'. */
export function capPeriod(iso, plan) {
  const p = agentPlan(plan);
  const d = String(iso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  if (p.capCadence === 'calendar' || !p.capStart) {
    const y = d.slice(0, 4);
    return { start: `${y}-01-01`, end: `${y}-12-31`, label: y };
  }
  const md = p.capStart.slice(5);               // 'MM-DD' anniversary
  const y = +d.slice(0, 4);
  const thisYear = `${y}-${md}`;
  const start = d >= thisYear ? thisYear : `${y - 1}-${md}`;
  const endY = +start.slice(0, 4) + 1;
  /* end = the day before the next anniversary */
  const nextStart = `${endY}-${md}`;
  const end = shiftDay(nextStart, -1);
  return { start, end, label: `${start.slice(0, 4)}–${String(endY).slice(2)}` };
}

const shiftDay = (iso, n) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]) + n * 86400000;
  const d = new Date(t), p = x => String(x).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
};

/**
 * Cap progress for one agent.
 * @param {array} closed  closed transactions for this agent, each { closeDate, capContribution }
 *                        (capContribution is snapshotted at close — see BUILD-NOTES)
 * @param {object} plan
 * @param {string} asOf   today's date
 */
export function capProgress(closed, plan, asOf) {
  const p = agentPlan(plan);
  const period = capPeriod(asOf, p);
  const inPeriod = (closed || []).filter(t => {
    const d = String(t.closeDate || '').slice(0, 10);
    return period && d >= period.start && d <= period.end;
  });
  const paid = r2(inPeriod.reduce((s, t) => s + num(t.capContribution), 0));
  const cap = p.cap;
  const remaining = cap > 0 ? Math.max(0, r2(cap - paid)) : 0;
  const pct = cap > 0 ? Math.min(1, paid / cap) : 0;

  /* projection: pace so far across this period, extended forward */
  let projected = null;
  if (cap > 0 && remaining > 0 && paid > 0 && period) {
    const elapsed = Math.max(1, dayDiff(period.start, asOf));
    const perDay = paid / elapsed;
    if (perDay > 0) {
      const daysNeeded = Math.ceil(remaining / perDay);
      const guess = shiftDay(asOf, daysNeeded);
      projected = guess <= period.end ? guess : null;   // null = not on pace to cap this period
    }
  }
  return {
    period, cap, paid, remaining, pct, projected,
    capped: cap > 0 && remaining <= 0,
    count: inPeriod.length,
    onPace: !!projected,
  };
}

const dayDiff = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

/**
 * Replay an agent's closed transactions in date order so each one is costed
 * against the cap as it stood at the time. Editing an old deal therefore
 * changes later ones — which is correct, and why the UI stores the snapshot at
 * close and only recomputes on demand.
 */
export function replayYear(transactions, plan, period) {
  const p = agentPlan(plan);
  const list = (transactions || [])
    .filter(t => t.closeDate && (!period || (t.closeDate >= period.start && t.closeDate <= period.end)))
    .slice().sort((a, b) => String(a.closeDate).localeCompare(String(b.closeDate)));
  let paid = 0;
  const rows = list.map(t => {
    const c = computeCommission(t, p, { capPaidToDate: paid });
    paid = r2(paid + c.capContribution);
    return { txn: t, calc: c, capAfter: paid };
  });
  return { rows, capPaid: paid, gci: r2(rows.reduce((s, r) => s + r.calc.gross, 0)), net: r2(rows.reduce((s, r) => s + r.calc.agentNet, 0)) };
}
