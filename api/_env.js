/* ============================================================================
   _env.js — one place that knows how to find Supabase from the server.

   WHY THIS EXISTS RATHER THAN A TWO-LINE FIX IN EACH FILE.

   Three server files read these variables slightly differently from the rest:
   _guard.js and _spend.js accepted either spelling of the key and fell back to
   VITE_SUPABASE_URL for the URL; _google.js and notify.js accepted neither.

   That asymmetry is invisible at setup and expensive later. An install that set
   only SUPABASE_SERVICE_KEY got a working assistant, a working rate limiter,
   and a Google Calendar integration that silently could not read its own token.
   Nothing errored — it just did not work, weeks later, for no visible reason.
   The sister install lost every guarded endpoint to the same shape.

   Patching the three files would fix today's instances and leave the fourth
   file free to reintroduce it. So the knowledge lives here once, and
   tests/guards.test.mjs fails the build if any api/ file reads these variables
   directly again.

   BOTH SPELLINGS, BOTH DIMENSIONS, deliberately:

     SUPABASE_URL              the server-side name
     VITE_SUPABASE_URL         the browser's copy — same value, and every real
                               install already has it, so accepting it turns a
                               dead subsystem into a working one at no cost
     SUPABASE_SERVICE_KEY      the older short spelling, still set on installs
     SUPABASE_SERVICE_ROLE_KEY the name Supabase itself uses, and the one the
                               docs now tell you to set

   THE KEY HAS NO VITE_ FALLBACK AND MUST NEVER GET ONE. A VITE_ variable is
   compiled into the browser bundle, and the service-role key bypasses RLS
   entirely. That asymmetry is the point, not an oversight: the URL is public,
   the key is not.
   ========================================================================== */

export const SUPA_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';

export const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY
  || process.env.SUPABASE_SERVICE_ROLE_KEY
  || '';

/** Host only, for logs — never the key, never a token. */
export const supaHost = () => {
  try { return new URL(SUPA_URL).host; } catch { return SUPA_URL.slice(0, 40) || '(not set)'; }
};
