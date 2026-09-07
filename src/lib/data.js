/* ============================================================================
   data.js — the ONE seam.

   The app imports { auth, db } from here and never from supabase.js or demo.js
   directly. VITE_DEMO=1 swaps the implementation; nothing above this line knows
   which one it got. That is what makes the demo the real product rather than a
   parallel build that drifts.

   Static imports on purpose: Vite tree-shakes the unused branch out of the
   bundle at build time, so a demo build ships no Supabase calls and a real
   build ships no seed data.
   ========================================================================== */

import { DEMO } from './brand';
import * as real from './supabase';
import * as demo from './demo';

const impl = DEMO ? demo : real;

export const auth = impl.auth;
export const db = impl.db;
export const configured = impl.configured;
export const isDemo = !!DEMO;
export const demoApi = DEMO ? demo.demoApi : null;

/* ---------------------------------------------------------------------------
   apiPost — the ONE way the browser talks to /api/*.

   Every AI route now requires a signed-in session. The token has to travel with
   the request, and it has to travel the same way from every call site, because
   a route that is guarded server-side and called without a header from one
   screen is a feature that is broken rather than protected.

   Ported from ProyTech, where the same helper exists for the same reason.

   In demo mode there is no Supabase session and no token, so the AI routes
   answer 401 and the UI shows its "that came back unavailable" path. That is
   correct: the demo has no account to bill.
   ------------------------------------------------------------------------- */
export async function apiPost(url, body) {
  let tok = '';
  try { const s = await auth.session(); tok = (s && s.access_token) || ''; } catch {}
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) },
    body: JSON.stringify(body || {}),
  });
}
