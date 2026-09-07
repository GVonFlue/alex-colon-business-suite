import { SUPA_KEY, SUPA_URL } from './_env.js';
// api/_guard.js — rate limiting and spend protection for every AI endpoint.
//
// The threat isn't a clever attacker, it's a cheap one: a loop calling a public
// endpoint a few thousand times overnight. Anthropic bills per token and Vercel
// bills per invocation, so an open endpoint is a direct line to your card.
//
// Four layers, because each one covers a hole the others don't:
//
//   1. Per-IP     — stops one machine hammering you
//   2. Global     — stops a BOTNET, which per-IP limits cannot. This is the one
//                   that actually caps your worst-case bill.
//   3. Input size — stops one request costing $2 by pasting a whole website
//   4. Auth       — private endpoints shouldn't be reachable by strangers at all
//
// Auth has two strengths, and the difference matters. requireAuth proves there
// is a REAL SESSION. requireLeader additionally proves that session is a LEADER,
// by asking Postgres through crm_whoami() with the caller's own token — a
// security-definer function that derives the role from auth.uid(), so a caller
// cannot assert their own role. A role in the request body is a claim, not a
// check, and is never used for this.
//
// State lives in Supabase because Vercel functions are stateless and there is
// no shared memory between invocations. An in-memory counter would reset on
// every cold start, which is exactly when you're being hit hardest.
//
// Requires the table in MIGRATION.sql (api_hits) and SUPABASE_SERVICE_KEY.

const SUPA = SUPA_URL;
const KEY  = SUPA_KEY;

/** Caller's IP. Vercel sets x-forwarded-for; take the FIRST entry — later ones
 *  are proxies and are trivially spoofable by the client. */
/* The host only — never the key, never the token. Enough to see at a glance
   whether two installs are pointed at the same project. */
const hostOf = u => { try { return new URL(String(u)).host; } catch { return String(u).slice(0, 40); } };

export function ipOf(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length) return xf.split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

async function sb(path, opts = {}) {
  if (!SUPA || !KEY) return null;                    // not configured — fail open
  try {
    return await sbCall(path, opts);
  } catch {
    // Network error, DNS failure, Supabase outage. Returning null makes the
    // caller fail OPEN. Letting this throw would 500 the endpoint — a rate
    // limiter that takes the product down when its own datastore blips is
    // worse than the abuse it prevents.
    return null;
  }
}

async function sbCall(path, opts = {}) {
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
}

/** Count hits in a rolling window and record this one. Returns {ok, used, of}. */
async function bump(bucket, limit, windowMin) {
  const since = new Date(Date.now() - windowMin * 60000).toISOString();
  const rows = await sb(
    `api_hits?bucket=eq.${encodeURIComponent(bucket)}&at=gte.${since}&select=id`
  );
  // Supabase unreachable: allow the request. A rate limiter that takes the site
  // down when its own datastore hiccups is worse than the problem it solves.
  if (rows === null) return { ok: true, used: 0, of: limit, degraded: true };
  const used = rows.length;
  if (used >= limit) return { ok: false, used, of: limit };
  await sb('api_hits', {
    method: 'POST',
    body: JSON.stringify({ bucket, at: new Date().toISOString() }),
  });
  return { ok: true, used: used + 1, of: limit };
}

/** Is the caller a LEADER? Asked of Postgres, using THEIR token, through the
 *  function the app already trusts for exactly this question.
 *
 *  PORTED FROM PROYTECH, WHERE THIS ASKED FOR role === 'owner'. Dwell's roles
 *  are leader / coordinator / agent, and crm_whoami() returns a wider row here
 *  (id, name, email, role, active, setup, sections, permissions, plan, pools,
 *  seat_limit, seats_used). Only `role` and `active` are read, and both exist
 *  in both installs, so the shape difference does not matter — but the role
 *  NAME does, and 'owner' matches nobody in Dwell. Left as an exported helper
 *  rather than inlined: the AI routes below need requireAuth, not this, and a
 *  role check that silently returns false for everyone is the kind of thing
 *  that gets discovered by an endpoint quietly refusing to work.
 *
 *  Fails CLOSED, unlike the rate limiter above: a failure to prove the role is
 *  not permission. The rate limiter fails open because a limiter that takes the
 *  product down when its datastore blips is worse than the abuse it prevents;
 *  an authorisation check that does the same is just a hole. */
export async function isLeader(token) {
  if (!SUPA || !KEY || !token) return false;
  try {
    const r = await fetch(`${SUPA}/rest/v1/rpc/crm_whoami`, {
      method: 'POST',
      headers: { apikey: KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: '{}',
    });
    if (!r.ok) return false;
    const rows = await r.json();
    const me = Array.isArray(rows) ? rows[0] : rows;
    return !!(me && me.role === 'leader' && me.active !== false);
  } catch {
    return false;
  }
}

/**
 * Guard an endpoint. Call it first thing in the handler:
 *
 *   const gate = await guard(req, res, { name:'chat', perIp:20, perDay:2000 });
 *   if (!gate.ok) return;                 // guard already sent the response
 *
 * Options:
 *   name      required. Namespaces the counters per endpoint.
 *   perIp     requests per IP per window       (default 20)
 *   windowMin window length in minutes         (default 10)
 *   perDay    GLOBAL cap across all callers    (default 2000)
 *   maxChars  reject bodies larger than this   (default 12000)
 *             ALWAYS set this per endpoint. The default is sized for a chat
 *             box; an endpoint that takes a pasted transcript needs twenty
 *             times it, and one that takes a lead id needs a fiftieth. A
 *             shared default is either a paste that fails for no visible
 *             reason or a hole big enough to run the bill up through.
 *   requireAuth  verify a Supabase JWT         (default false)
 *   requireLeader verify the JWT AND that the caller's crm_users role is leader
 *                (default false). Implies requireAuth.
 */
export async function guard(req, res, opts = {}) {
  const {
    name,
    perIp = 20,
    windowMin = 10,
    perDay = 2000,
    maxChars = 12000,
    requireAuth = false,
    requireLeader = false,
  } = opts;
  const needAuth = requireAuth || requireLeader;

  if (req.method === 'OPTIONS') { res.status(204).end(); return { ok: false }; }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return { ok: false };
  }

  // --- 3. input size, checked before anything expensive ---------------------
  const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  if (raw.length > maxChars) {
    // State BOTH numbers. "Limit is about 12k" leaves the one question the
    // sender actually has unanswered — how much of what they pasted has to
    // go — and they find out by trimming blind and trying again. The raw
    // counts go alongside the prose so a client can render its own hint
    // without parsing English.
    const n = v => v.toLocaleString('en-US');
    res.status(413).json({
      error: 'That is too long to process in one go.',
      hint: `That request was ${n(raw.length)} characters and the limit here is ${n(maxChars)}. Trim about ${n(raw.length - maxChars)}.`,
      chars: raw.length,
      limit: maxChars,
      over: raw.length - maxChars,
    });
    return { ok: false };
  }

  // --- 4. auth, for endpoints that should never be public -------------------
  // Checked BEFORE the counters below on purpose: a caller who is not allowed
  // in should not be able to spend the day's budget getting turned away.
  let user = null, leader = false;
  if (needAuth) {
    const tok = String(req.headers.authorization || '').replace(/^Bearer /i, '');
    if (!tok) { res.status(401).json({ error: 'Sign in required.' }); return { ok: false }; }
    /* WHY THIS IS INSTRUMENTED.
       Four different failures used to collapse into one "Session expired." and
       one null: no SUPABASE_URL, no service key, a URL pointing at the wrong
       project, and a token that really has expired. From the browser they are
       indistinguishable, so diagnosing it meant guessing.

       Loud on the server, unchanged to the caller — the same posture the daily
       cap below already takes. Nothing here logs the token, the key, or any
       part of either: only whether they were present, and what Supabase said. */
    let who = null;
    if (!SUPA || !KEY) {
      console.error(`[guard] ${name}: cannot verify a session — `
        + `${!SUPA ? 'SUPABASE_URL (or VITE_SUPABASE_URL) is not set' : 'SUPABASE_URL is set'}; `
        + `${!KEY ? 'SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY) is not set' : 'service key is set'}. `
        + `Every guarded endpoint on this deployment will answer 401 until both exist.`);
    } else {
      let status = 0;
      who = await fetch(`${SUPA}/auth/v1/user`, {
        headers: { apikey: KEY, authorization: `Bearer ${tok}` },
      }).then(r => { status = r.status; return r.ok ? r.json() : null; }).catch(e => {
        console.error(`[guard] ${name}: could not reach ${hostOf(SUPA)}/auth/v1/user — ${e && e.message}`);
        return null;
      });
      if (!who || !who.id) {
        console.error(`[guard] ${name}: ${hostOf(SUPA)} rejected the token with HTTP ${status || 'no response'}. `
          + `401 here usually means the token was issued by a DIFFERENT Supabase project than SUPABASE_URL points at, `
          + `or the service key belongs to a different project; 403 usually means the key is not a service key.`);
      }
    }
    if (!who || !who.id) { res.status(401).json({ error: 'Session expired.' }); return { ok: false }; }
    user = who;

    if (requireLeader) {
      leader = await isLeader(tok);
      if (!leader) {
        // 403, not 401: the session is fine, the person is not allowed. Telling
        // a rep to sign in again when signing in again cannot help is the kind
        // of error message that costs an afternoon.
        res.status(403).json({ error: 'Only a team leader can do that.' });
        return { ok: false };
      }
    }
  }

  // --- 2. global cap FIRST. A botnet passes every per-IP check, so this is
  //        the only layer that bounds the bill in the worst case. ------------
  const day = await bump(`${name}:global`, perDay, 60 * 24);
  if (!day.ok) {
    res.status(429).json({
      error: 'This service is busy right now. Please try again later.',
    });
    // Loud on the server, vague to the caller: a real user gets a useful
    // message, an attacker learns nothing about where the ceiling is.
    console.error(`[guard] DAILY CAP HIT on ${name}: ${day.used}/${day.of}`);
    return { ok: false };
  }

  // --- 1. per-IP ------------------------------------------------------------
  const ip = ipOf(req);
  const one = await bump(`${name}:ip:${ip}`, perIp, windowMin);
  if (!one.ok) {
    res.setHeader('retry-after', String(windowMin * 60));
    res.status(429).json({
      error: `Too many requests. Try again in ${windowMin} minutes.`,
    });
    return { ok: false };
  }

  return { ok: true, ip, user, leader, used: one.used, of: one.of };
}

/** Best-effort cleanup so the table doesn't grow forever. Cheap, ~1% of calls. */
export async function sweep() {
  if (Math.random() > 0.01) return;
  const cutoff = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  // Spend rows live in this same table and the monthly ledger must survive the
  // 48h sweep, so only rate-limit rows (cost is null) are deleted.
  await sb(`api_hits?at=lt.${cutoff}&cost=is.null`, { method: 'DELETE' }).catch(() => {});
}
