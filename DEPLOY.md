# DEPLOY

> **For the full walkthrough with links, costs, the API reference and
> troubleshooting, read `GO-LIVE.md`.** This file is the condensed version.

Two things you can deploy from this repo: **the demo** (no database, no
credentials, resets on refresh) and **a real install** for one brokerage.

---

## A. The demo — five minutes, nothing to configure

```bash
npm install
npm run dev:demo          # http://localhost:5173
```

Deploying it to Vercel:

1. Import the repo as a new Vercel project.
2. Environment variables: **`VITE_DEMO` = `1`**. That is the only one needed.
3. Deploy.

You get: seeded data dated relative to today, no login, a "View as: Dana (team
leader) / Marcus / Priya" switcher in the banner, and a reset on every refresh.
The AI panels will show "not configured on this deployment" unless you also set
`ANTHROPIC_API_KEY`, which is fine for most walkthroughs — the net sheet and the
offer comparison still compute their arithmetic without it.

To demo contract ingestion live, add `ANTHROPIC_API_KEY`. Uploads in demo mode
stay in browser memory; nothing is stored anywhere.

---

## B. A real install — one brokerage, one Vercel project, one Supabase project

One repo, many deployments. Each client gets their own Vercel project pointing at
their own Supabase, configured entirely by environment variables. Never share a
database between clients.

### 1. Supabase

1. Create a project. Note the URL and the **publishable** (anon) key from
   Settings → API, and the **service role** key (server only — it must never
   appear in a `VITE_*` variable).
2. SQL Editor → paste **all of `MIGRATION.sql`** → Run. It is re-runnable.
3. Authentication → Providers → Email: enabled, and **turn "Confirm email" OFF**
   if you want the in-app "add a seat" flow to work. With confirmation on,
   Supabase does not return the new user's id and the `crm_users` row cannot be
   created; the app tells you so on screen if it happens.
4. Authentication → URL Configuration → add your deployment origin to **Redirect
   URLs**, so password-reset links come back to the right place.
5. Authentication → Users → Add user: create the team leader's login.

### 2. Vercel

Import the repo. Environment variables:

| Variable | Required | What |
|---|---|---|
| `VITE_SUPABASE_URL` | yes | `https://xxxx.supabase.co` |
| `VITE_SUPABASE_KEY` | yes | the publishable / anon key. Safe in the browser; RLS is the protection |
| `VITE_BRAND_NAME` | recommended | "Cornerstone Realty Group" |
| `VITE_BRAND_SHORT` | | sidebar / home-screen label |
| `VITE_APP_TITLE` | | browser tab |
| `VITE_LOGO_URL` | | replaces the wordmark in the sidebar |
| `VITE_AUTH_DOMAIN` | | maps a bare username to `username@<domain>` for legacy-style logins |
| `VITE_COLOR_COBALT` / `_INK` / `_GOLD` / `_GREEN` / `_RED` | | brand colours |
| `VITE_TZ` | | defaults to `America/Chicago`. **Deadlines are rendered in this zone** |
| `VITE_MODULES` | | comma-separated section keys to ship a narrower app |
| `VITE_BIZ_NAME` / `_ADDRESS` / `_EMAIL` / `_PHONE` / `_LICENSE` | | appear on client-facing output |
| `ANTHROPIC_API_KEY` | for AI | server-side only. Contract extraction, receipt scanning, the assistant, every AI panel |
| `SUPABASE_URL` | **yes** | the same URL again, without the `VITE_` prefix. See the trap below |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** | **server only, never prefixed with `VITE_`.** See the trap below |
| `RESEND_API_KEY` | for reminders | from resend.com |
| `NOTIFY_FROM` | for reminders | `"Cornerstone CRM <crm@theirdomain.com>"` — the domain must be verified in Resend |
| `APP_URL` | for reminders | `https://their-crm.vercel.app`, used for links in emails |
| `CRON_SECRET` | recommended | if set, the cron endpoint requires `Authorization: Bearer <it>` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | for calendar | see `api/GOOGLE-CALENDAR-SETUP.md` |

Do **not** set `VITE_DEMO` on a real install. If it is set, the app never touches
the database.

#### The service-key trap — read this one

`SUPABASE_SERVICE_ROLE_KEY` used to be listed here as "for reminders". It is
not. **Every endpoint behind `api/_guard.js` needs it** — the assistant, the AI
panels, receipt scanning, contract extraction and the calendar sync — because
the guard verifies the caller's session by asking Supabase, and that call needs
a server key.

The trap is what happens when it is missing, and it is nastier than it sounds:

* the browser only ever needs `VITE_SUPABASE_URL` and the anon key, so **the app
  itself works perfectly** — you sign in, the data loads, everything renders;
* the guard falls back to `VITE_SUPABASE_URL` when `SUPABASE_URL` is absent, so
  the URL half looks fine and quietly is;
* but the service key **has no `VITE_` equivalent by design** — it must never
  reach a browser — so nothing else can stand in for it;
* so every guarded endpoint answers **401 "Session expired."** while the session
  is perfectly valid, and signing out and back in does not help.

An install can therefore look correctly configured, be correctly configured from
the browser's point of view, and have every server-side feature failing. This
happened on a live install and cost a round trip to diagnose.

**If you see "Session expired." on an AI feature while the CRM itself works,
check this variable first.** The guard now says which precondition failed in the
Vercel function log — it will name `SUPABASE_SERVICE_ROLE_KEY` directly — so one
reproduction and the log answers it rather than guesswork.

### 3. First run

1. Open the deployment and sign in as the leader you created.
2. You land on "This account has no seat yet" — press **Claim this as the team
   leader**. It only works while `crm_users` is empty; that is the only bootstrap
   the policies permit.
3. Settings → Team: add the agents. Each gets a temporary password to hand over,
   or a "set your password" email.
4. Settings → walk the cards top to bottom with the brokerage on the call. The
   two that matter most: **Critical-date offsets** (check each one against their
   state contract — the live preview shows the arithmetic) and **Commission
   defaults** plus each agent's plan.
5. Run `VERIFY-RLS.md` before letting an agent in.

### 4. Reminders

`vercel.json` registers one cron: `/api/notify?cron=1` at 12:00 UTC daily, which
is 07:00 America/Chicago in summer. Change the schedule there — Vercel crons are
in UTC.

Check it by hand after deploying:

```bash
curl -s -X POST "https://their-crm.vercel.app/api/notify?cron=1" \
  -H "Authorization: Bearer $CRON_SECRET" | jq
```

You should get `{ok:true, checked, due, sent, skipped, tiers}`. Run it twice: the
second run must report the same sends as `skipped`, not `sent` — that is the
`reminder_log` unique index doing its job. If it says
`{ok:false, reason:'not_configured'}`, one of `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY` or `NOTIFY_FROM` is missing.

### 5. Seats

`accounts.seat_limit` is 4 by default. Change it in SQL, not in the app:

```sql
update accounts set seat_limit = 12 where id = 'main';
```

A trigger rejects an active user past the limit, so the browser cannot get around
it and neither can a mistake in the UI.

---

## Local development against a real database

```bash
cp .env.example .env.local     # then fill in VITE_SUPABASE_URL / VITE_SUPABASE_KEY
npm run dev
```

`api/*` routes do not run under `vite dev`. Use `vercel dev` if you need them, or
work in demo mode, where every AI panel degrades to a clear "not configured"
state instead of erroring.

## Tests before you ship

```bash
npm run build              # must exit 0
npm i --no-save jsdom
npm test                   # 298 checks
```
