/* ============================================================================
   api/lead-intake.js — the website's leads, landing in the CRM.

   alexcolonhomes.com posts here every time somebody converts: a lead magnet
   form, the contact form, or Lark, the assistant. This is the receiving end of
   the contract documented at docs/lead-payload.md in the website repo, contract
   version 1.1.

   FOUR THINGS ABOUT THE SENDER THAT SHAPE THIS FILE.

   1. IT DOES NOT RETRY. Ever. If this endpoint returns non-2xx or takes longer
      than eight seconds, the lead is gone from this system's point of view. It
      still reaches the Google Sheet, which is the site's source of truth, and
      the site logs the full payload in one line tagged [lead][RECOVERABLE] so a
      human can replay it. But nothing automatic will try again. So this handler
      does the minimum work needed to durably store the row and returns. No
      enrichment, no AI, no outbound calls.

   2. IT NEVER SURFACES OUR FAILURES TO THE VISITOR. A 500 here does not break
      the website's form. That is a good property and it is also a trap: a
      silently broken intake looks exactly like a quiet week. The health check
      at the bottom of docs/LEAD-INTAKE.md exists for that reason.

   3. IDS ARE STRINGS AND ARE NEVER PARSED. `external_ref` arrives as a string
      and is stored as one. Number("9007199254740993") is 9007199254740992,
      which is a different record. The sender throws rather than send an ID that
      arrived as a number; we return the favour by never coercing one.

   4. SOURCE IS NEVER DROPPED. The sender's own comment says most CRMs default
      unattributed API leads to "Other", which destroys the reporting that
      proves ROI at the sixty day mark. Alex asked for source tracked all the
      way through to closing. Whatever arrives in `source` is what gets stored,
      verbatim, even if it is not in the settings list. An unrecognised source
      showing up in a report is a question worth asking; a lead relabelled
      "Other" is a question nobody can ask.

   AUTH. A shared bearer token, compared in constant time. This is deliberately
   not Supabase auth: the caller is a server, not a person, and it holds no
   session. The token lives in LEAD_INTAKE_TOKEN here and CRM_API_KEY on the
   website, and they have to match.

   WHAT IT WRITES. One row in `contacts`, owned by Alex, side inferred from the
   source tag, stage `new`. Everything the site sends is preserved in `data`,
   including the fields the CRM has no column for, because throwing away a
   payload you already received is not recoverable later.
   ============================================================================ */

import { createHash, timingSafeEqual } from 'node:crypto';
import { SUPA_KEY, SUPA_URL } from './_env.js';
import { ipOf } from './_guard.js';

/* The owner every lead is assigned to. A one-login business suite has exactly
   one agent, so there is no routing decision to make and no lead pool to fall
   into. Set to Alex's crm_users.id at install; see docs/LEAD-INTAKE.md. */
const OWNER_ID = process.env.LEAD_INTAKE_OWNER_ID || null;

/*
 * Timing-safe token compare, using node's own timingSafeEqual rather than a
 * hand-rolled loop.
 *
 * A plain === leaks the position of the first differing byte, which is enough
 * to recover a token given patience. A hand-rolled XOR loop closes that, but
 * tests/guards.test.mjs looks for `timingSafeEqual` or `createHmac` as its
 * proof that a route checks its caller, and it was right to reject the
 * hand-rolled version: "it looks constant-time to me" is exactly the claim that
 * suite exists to stop anyone making.
 *
 * timingSafeEqual throws on a length mismatch, so both sides are hashed to a
 * fixed width first. Comparing lengths before the compare would leak the
 * token's length, which is a smaller leak than the byte positions but is still
 * free to avoid.
 */
function tokenMatches(presented, expected) {
  const a = createHash('sha256').update(String(presented || '')).digest();
  const b = createHash('sha256').update(String(expected || '')).digest();
  return timingSafeEqual(a, b);
}

/*
 * Which side of the transaction a lead is, read off the source tag.
 *
 * The site's tags are stable and documented, so this is a lookup rather than a
 * guess. Anything unrecognised becomes 'buyer', which is the safe default: a
 * buyer record asks for preapproval and price range, and an agent correcting a
 * side takes two seconds. Guessing 'seller' on an unknown tag would create a
 * listing record with an empty address, which reads as a data problem.
 */
function sideFromSource(source) {
  const s = String(source || '').toLowerCase();
  if (s.includes('valuation') || s.includes('/sell')) return 'seller';
  if (s.includes('investment') || s.includes('/investors')) return 'buyer';
  return 'buyer';
}

/* The environment marker the site appends to non-production tags, e.g.
   "Colon - General Question [preview]". The `deployment` field carries the same
   information as its own value and is the field to filter on, so this exists
   only to keep the stored source string clean for reporting. */
function stripEnvMarker(source) {
  return String(source || '').replace(/\s*\[(preview|development|local)\]\s*$/i, '').trim();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const expected = process.env.LEAD_INTAKE_TOKEN;
  if (!expected) {
    // Refuse rather than fail open. An intake with no token configured is an
    // open write endpoint on somebody's CRM.
    console.error('[lead-intake] LEAD_INTAKE_TOKEN is not set. Refusing every request until it is.');
    return res.status(503).json({ ok: false, error: 'not_configured' });
  }

  const auth = String(req.headers.authorization || '');
  const presented = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!tokenMatches(presented, expected)) {
    console.warn('[lead-intake] rejected a request with a bad or missing token from', ipOf(req));
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  if (!SUPA_URL || !SUPA_KEY) {
    console.error('[lead-intake] Supabase is not configured. The lead is in the payload below and is not stored.');
    console.error('[lead-intake][RECOVERABLE]', JSON.stringify(req.body));
    return res.status(503).json({ ok: false, error: 'no_database' });
  }

  const b = req.body || {};

  // The sender's field names, not ours. See docs/lead-payload.md.
  const fullName = typeof b.full_name === 'string' ? b.full_name.trim() : '';
  const email = typeof b.email === 'string' ? b.email.trim() : '';

  if (!fullName || !email) {
    // A 400 here is honest: the sender sent something the contract says it
    // never sends. It still will not retry, so log the whole thing.
    console.error('[lead-intake][RECOVERABLE] missing name or email', JSON.stringify(b));
    return res.status(400).json({ ok: false, error: 'name_and_email_required' });
  }

  if (typeof b.external_ref === 'number') {
    // The sender throws rather than do this, so if it ever arrives it means
    // something other than the website is posting here.
    console.error('[lead-intake] external_ref arrived as a number, which loses precision above 2^53. Rejecting.');
    return res.status(400).json({ ok: false, error: 'external_ref_must_be_string' });
  }

  const rawSource = String(b.source || '').trim();
  const source = stripEnvMarker(rawSource) || 'Website';
  const deployment = String(b.deployment || 'production');
  const receivedAt = typeof b.received_at === 'string' ? b.received_at : new Date().toISOString();

  /*
   * The contact row.
   *
   * `data` is jsonb and holds everything the schema has no column for. The
   * shape below matches src/lib/seed.js so the pipeline, the contact drawer and
   * the assistant all read a website lead exactly as they read any other
   * contact. A lead that renders differently from the rest is a lead that gets
   * treated differently, which is the opposite of the point.
   */
  const now = new Date().toISOString();
  const notes = typeof b.notes === 'string' ? b.notes : '';

  const data = {
    name: fullName,
    email,
    phone: typeof b.phone === 'string' ? b.phone : '',
    source,
    side: sideFromSource(rawSource),
    stage: 'new',
    created_at: now,
    lastTouch: null,          // nobody has spoken to them yet, and that is the point
    nextAction: 'First contact attempt',
    nextActionDue: now.slice(0, 10),
    notes,
    /* Attribution, kept whole. Alex asked for campaign and form data preserved
       rather than everything being labelled "Facebook", and this is where the
       future cost-per-source reporting will read from. */
    attribution: {
      sourceTag: rawSource,          // with the environment marker still on it
      landingRoute: typeof b.landing_route === 'string' ? b.landing_route : null,
      externalRef: b.external_ref == null ? null : String(b.external_ref),
      deployment,
      receivedAt,
    },
    /* First-response measurement starts here. `lastTouch` stays null until
       somebody actually makes contact, so the gap between created_at and the
       first activity entry IS the speed-to-lead number. Nothing computes it
       yet; this is the field that makes computing it possible later without a
       backfill. */
    firstContactAt: null,
    activity: [
      {
        id: 'lead-' + Date.now().toString(36),
        at: now,
        kind: 'note',
        note: `Came in from the website: ${source}${b.landing_route ? ` (${b.landing_route})` : ''}.`
          + (notes ? `\n\n${notes}` : ''),
        by: OWNER_ID || 'system',
      },
    ],
  };

  const row = {
    owner_id: OWNER_ID,
    pool: OWNER_ID ? null : 'house',
    side: data.side,
    stage: 'new',
    created_at: now,
    data,
  };

  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/contacts`, {
      method: 'POST',
      headers: {
        apikey: SUPA_KEY,
        authorization: `Bearer ${SUPA_KEY}`,
        'content-type': 'application/json',
        prefer: 'return=representation',
      },
      body: JSON.stringify(row),
    });

    if (!r.ok) {
      const detail = await r.text();
      console.error('[lead-intake][RECOVERABLE] insert failed', r.status, detail, JSON.stringify(b));
      return res.status(502).json({ ok: false, error: 'insert_failed' });
    }

    const [saved] = await r.json();
    console.log('[lead-intake] stored', saved?.id, source, deployment);
    return res.status(200).json({ ok: true, id: saved?.id ?? null });
  } catch (err) {
    console.error('[lead-intake][RECOVERABLE] threw', String(err), JSON.stringify(b));
    return res.status(502).json({ ok: false, error: 'exception' });
  }
}
