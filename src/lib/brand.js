/* ============================================================
   BRAND / TENANT CONFIG
   ------------------------------------------------------------
   Everything that changes per brokerage lives here, driven by Vite
   env vars. One repo -> many Vercel projects, each with its own
   env vars pointing at its own Supabase.

   Set these in Vercel -> Project -> Settings -> Environment Variables.
   Anything not set falls back to the ProyTech defaults below,
   EXCEPT the Supabase creds, which are required on purpose so a
   misconfigured client project can never fall back to our database.

   DEMO: VITE_DEMO=1 swaps the data layer for an in-memory adapter
   (src/lib/demo.js) and no Supabase creds are needed at all.
   ============================================================ */

const val = (v, d) => { const s = (v ?? '').toString().trim(); return s ? s : d; };
const NAME = val(import.meta.env.VITE_BRAND_NAME, 'Dwell Real Estate Group');

/* The product name, shown at the top of every screen. The client's own brand
   lives in the sidebar; this is ours and it stays put. */
export const PRODUCT = val(import.meta.env.VITE_PRODUCT_NAME, 'ProyTech Business Suite');
export const PRODUCT_SHORT = val(import.meta.env.VITE_PRODUCT_SHORT, 'Business Suite');

export const DEMO = (import.meta.env.VITE_DEMO || '').toString().toLowerCase() === '1'
  || (import.meta.env.VITE_DEMO || '').toString().toLowerCase() === 'true';

export const BRAND = {
  /* identity */
  id:       val(import.meta.env.VITE_BRAND_ID, 'proytech'),
  name:     NAME,
  title:    val(import.meta.env.VITE_APP_TITLE, NAME + ' — ProyTech Business Suite'),
  short:    val(import.meta.env.VITE_BRAND_SHORT, 'dwellWICHITA'),

  /* The sidebar mark. Read by src/lib/assets.js, which prefers this when set
     and falls back to the bundled file in /public/brand otherwise — so an
     install can be re-branded without touching code, and one that has not set
     it still renders. Host it anywhere the browser can reach; the client's own
     Supabase Storage adds no new vendor. */
  logo:     val(import.meta.env.VITE_LOGO_URL, ''),

  /* Sign-in maps a bare username -> username@<authDomain> in Supabase Auth.

     PINNED ON PURPOSE — do not derive this from NAME. Deriving it means that
     renaming the brand silently changes the address every bare-username login
     resolves to, and everyone who signs in with a username instead of a full
     email is locked out with a wrong-password error. Move it deliberately by
     setting VITE_AUTH_DOMAIN in Vercel, never by editing the brand name. */
  authDomain: val(import.meta.env.VITE_AUTH_DOMAIN, 'summitandvine.app'),

  /* sidebar footer */
  tagline:    val(import.meta.env.VITE_TAGLINE, 'No deadline lives outside the Suite.'),
  taglineSub: val(import.meta.env.VITE_TAGLINE_SUB, 'Read it off the contract, not from memory.'),

  /* which sections this install ships with. Empty = everything on. */
  modules: val(import.meta.env.VITE_MODULES, '').split(',').map(s => s.trim()).filter(Boolean),

  /* the timezone every date in the app is rendered in. Deadlines are DATES,
     never timestamps — see src/lib/dates.js. */
  tz: val(import.meta.env.VITE_TZ, 'America/Chicago'),

  /* colors */
  colors: {
    cobalt: val(import.meta.env.VITE_COLOR_COBALT, '#1338DE'),
    indigo: val(import.meta.env.VITE_COLOR_INDIGO, '#3B3470'),
    ink:    val(import.meta.env.VITE_COLOR_INK,    '#111528'),
    gold:   val(import.meta.env.VITE_COLOR_GOLD,   '#C8A24A'),
    green:  val(import.meta.env.VITE_COLOR_GREEN,  '#1F9D55'),
    red:    val(import.meta.env.VITE_COLOR_RED,    '#D14343'),
  },

  /* appears on client-facing output (net sheets, weekly updates) */
  biz: {
    name:    val(import.meta.env.VITE_BIZ_NAME, NAME),
    address: val(import.meta.env.VITE_BIZ_ADDRESS, '150 N Main St\nWichita, KS 67202').replace(/\\n/g, '\n'),
    email:   val(import.meta.env.VITE_BIZ_EMAIL, 'hello@dwellwichita.test'),
    phone:   val(import.meta.env.VITE_BIZ_PHONE, '(316) 555-0140'),
    license: val(import.meta.env.VITE_BIZ_LICENSE, ''),
  },
};

/* THE ASSISTANT'S NAME, per tenant.

   Ported from ProyTech, including the reason the default is computed rather
   than written: forgetting to set a variable must never leak an internal name
   into somebody else's install. So the fallback is keyed off BRAND.id — ours
   is JARVIS, anybody else's is the neutral word.

   Set VITE_AI_NAME per Vercel project. It is a BUILD-TIME variable, so
   changing it needs a redeploy, not just a save. */
export const AI_NAME = val(
  import.meta.env.VITE_AI_NAME,
  BRAND.id === 'proytech' ? 'JARVIS' : 'Assistant',
);

export const icon = f => `/brands/${BRAND.id}/${f}`;

/* Supabase creds are REQUIRED in the real product — no fallback on purpose.
   In demo mode they are irrelevant and never read. */
export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').trim();
export const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_KEY || '').trim();
export const SUPABASE_OK  = !!(SUPABASE_URL && SUPABASE_KEY);
