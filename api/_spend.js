import { SUPA_KEY, SUPA_URL } from './_env.js';
// api/_spend.js — a spend ceiling denominated in DOLLARS, not requests.
//
// _guard.js caps how MANY calls happen. That is the right shape for abuse, and
// the wrong shape for a budget: one question against a big install can cost
// 30x another, so "2000 requests a day" tells you nothing about the bill.
// This counts what was actually spent and stops at a number you set.
//
// Deliberately a separate file. api/_guard.js is load-bearing for four working
// endpoints and there is no reason to risk them to add a feature to a fifth.
//
// Requires the `cost` column added by JARVIS-MIGRATION.sql.

const SUPA = SUPA_URL;
const KEY  = SUPA_KEY;

/* Per-million-token rates, USD. Override with JARVIS_RATE_IN / JARVIS_RATE_OUT
   if the rate card moves — the code should not need a deploy to stay honest. */
export const RATES = {
  'claude-haiku-4-5-20251001': { in: 1, out: 5 },
  'claude-sonnet-4-6':         { in: 3, out: 15 },
  'claude-sonnet-5':           { in: 2, out: 10 },
  'claude-opus-5':             { in: 5, out: 25 },
};

/** Cost of one call in dollars. Cached reads bill at 10% of input and cache
 *  writes at 125%, which is the entire reason caching is worth the complexity
 *  here — the lead index is the same block on every question in a session. */
export function costOf(model, usage) {
  const envIn = Number(process.env.JARVIS_RATE_IN);
  const envOut = Number(process.env.JARVIS_RATE_OUT);
  const r = RATES[model] || { in: 3, out: 15 };
  const rin = isFinite(envIn) && envIn > 0 ? envIn : r.in;
  const rout = isFinite(envOut) && envOut > 0 ? envOut : r.out;
  const u = usage || {};
  const n = v => (isFinite(Number(v)) ? Number(v) : 0);
  const fresh = n(u.input_tokens);
  const cacheWrite = n(u.cache_creation_input_tokens);
  const cacheRead = n(u.cache_read_input_tokens);
  const out = n(u.output_tokens);
  return (
    (fresh * rin) + (cacheWrite * rin * 1.25) + (cacheRead * rin * 0.10) + (out * rout)
  ) / 1e6;
}

async function sb(path, opts = {}) {
  if (!SUPA || !KEY) return null;
  try {
    const r = await fetch(`${SUPA}/rest/v1/${path}`, {
      ...opts,
      headers: {
        apikey: KEY,
        authorization: `Bearer ${KEY}`,
        'content-type': 'application/json',
        ...(opts.headers || {}),
      },
    });
    if (!r.ok) return null;
    const t = await r.text();
    return t ? JSON.parse(t) : [];
  } catch { return null; }
}

/** Dollars spent on `bucket` since the first of the current month. */
export async function spentThisMonth(bucket) {
  const d = new Date();
  const from = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
  const rows = await sb(`api_hits?bucket=eq.${encodeURIComponent(bucket)}&at=gte.${from}&select=cost`);
  // Unreachable ledger: report null, and let the caller decide. Unlike the rate
  // limiter, failing OPEN on a spend cap is a decision worth making explicitly.
  if (rows === null) return null;
  return rows.reduce((a, r) => a + (Number(r && r.cost) || 0), 0);
}

/**
 * Dollars spent across EVERY bucket since midnight UTC.
 *
 * Deliberately not per-bucket. The question worth answering is "what did AI
 * cost today", not "what did each endpoint cost today", and four separate
 * two-dollar caps is an eight dollar day nobody chose. Every call still logs
 * its own bucket, so the split is a `group by` away whenever somebody wants
 * it — the cap is shared, the reporting is not.
 *
 * Midnight UTC, matching spentThisMonth() above. A local-midnight window and a
 * UTC-midnight window give two different answers to the same question, and one
 * clock that is not local beats two clocks that disagree.
 */
export async function spentToday() {
  const from = new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z';
  const rows = await sb(`api_hits?at=gte.${from}&select=cost`);
  // Unreachable ledger reports null. See withinDailyCap for what is done with
  // that, which is a decision and not a default.
  if (rows === null) return null;
  return rows.reduce((a, r) => a + (Number(r && r.cost) || 0), 0);
}

/** The configured daily ceiling in dollars, or null for no cap. */
export function dailyCap() {
  const v = Number(process.env.AI_DAILY_CAP_USD);
  return isFinite(v) && v > 0 ? v : null;
}

/**
 * Whether anything in this install may spend right now.
 *
 * FAILS OPEN when the ledger cannot be read, loudly. A CRM whose AI stops
 * working because a select timed out is a worse outcome than an unenforced cap
 * for one request. Silence would be worse than either, so it logs every time.
 *
 * It is a ceiling and not a budget: spending stops within one call of crossing
 * it, never exactly on it, because a call's cost is only known once it is made.
 */
export async function withinDailyCap() {
  const cap = dailyCap();
  if (cap === null) return { allowed: true, spent: null, cap: null };
  const spent = await spentToday();
  if (spent === null) {
    console.error('[spend] the ledger is unreachable, so the daily cap is NOT enforced for this request.');
    return { allowed: true, spent: null, cap };
  }
  return { allowed: spent < cap, spent, cap };
}

/** Record what a call cost. Best effort — a failed write must never fail the
 *  user's request, they already paid for the tokens. */
export async function logSpend(bucket, cost) {
  const c = Number(cost);
  if (!isFinite(c) || c <= 0) return;
  await sb('api_hits', {
    method: 'POST',
    body: JSON.stringify({ bucket, at: new Date().toISOString(), cost: c }),
  });
}
