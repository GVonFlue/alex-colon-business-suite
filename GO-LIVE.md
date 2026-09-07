# GO-LIVE — from this zip to a URL

Two paths. Do **Path A** first even if you have a client waiting: it takes about
ten minutes, needs no database and no credentials, and gives you a permanent demo
link to sell with.

- **Path A — the demo.** GitHub → Vercel → one env var. No Supabase, no API keys.
  Seeded data, no login, the View-as switcher. Resets on refresh.
- **Path B — a real brokerage.** Supabase project, the migration, real env vars,
  reminders, AI. About 45–60 minutes the first time, 20 minutes once you have done
  it twice.

Everything below is current as of **30 July 2026**. Where a platform limit matters
(Vercel's Hobby cron restriction, Supabase's free-tier pausing) it is called out
with the source.

---

# Step 1 — get the code on GitHub

Unzip, then from inside the folder:

```bash
cd realtor-crm
git init
git add .
git commit -m "ProyTech Realtor CRM v1"
git branch -M main
```

Create an empty repo at **https://github.com/new** — no README, no .gitignore,
the zip already has one — then:

```bash
git remote add origin https://github.com/GVonFlue/proytech-realtor-crm.git
git push -u origin main
```

Sanity check before you go further:

```bash
npm install
npm run build          # must exit 0
npm run dev:demo       # http://localhost:5173 — the demo, locally
```

`.gitignore` already excludes `node_modules`, `dist`, `.env` and `.env.local`. The
zip contains no secrets; `.env.example` is a template with empty values.

---

# Path A — the demo, live in ten minutes

### A1. Import to Vercel

1. Go to **https://vercel.com/new**.
2. Pick the repo. Vercel detects Vite on its own — framework preset **Vite**,
   build command `npm run build`, output directory `dist`. Leave all three alone.
3. Before clicking Deploy, open **Environment Variables** and add exactly one:

   | Name | Value |
   |---|---|
   | `VITE_DEMO` | `1` |

4. Deploy.

You get `https://<project>.vercel.app` with the seeded team, no login, and the
"View as: Dana (team leader) / Marcus / Priya" switcher in the banner. Every
refresh resets it, so it cannot be broken by a prospect clicking around.

### A2. Optional — make the AI panels live in the demo

Add `ANTHROPIC_API_KEY` (see **B5**) and redeploy. Now contract upload actually
reads a PDF in the demo. Uploaded files stay in browser memory and are never
stored anywhere. Without the key, every AI panel shows "not configured on this
deployment" and the net sheet and offer comparison still compute their arithmetic
in JavaScript, so the screen is not dead weight.

### A3. Name it something you can say out loud

Vercel → project → **Settings → Domains**. `summitvine-crm-demo.vercel.app` reads
better than `proytech-realtor-crm-git-main-xyz.vercel.app` on a call.

### A4. Rebrand the demo per prospect (optional, two minutes)

Either set `VITE_BRAND_NAME` / `VITE_BRAND_SHORT` / `VITE_LOGO_URL` and redeploy,
or just change it live in **Settings → Brand** during the call — in demo mode that
edit lives until the next refresh, which is usually exactly what you want.

> **Redeploy required.** Every `VITE_*` variable is baked into the JavaScript
> bundle at build time. Vercel's own docs are explicit that env-var changes "are
> not applied to previous deployments, they only apply to new deployments." So
> after changing one: Deployments → ⋯ → **Redeploy**.

---

# Path B — a real brokerage

One repo, one Vercel project per client, one Supabase project per client. **Never
share a database between clients.** The whole privacy model is per-install.

## B1. Create the Supabase project

1. **https://supabase.com/dashboard** → New project. Pick a region near the
   brokerage (`us-east-1` or `us-central`, for Kansas either is fine).
2. Save the database password somewhere real.
3. **Settings → API** and copy three things:
   - **Project URL** → `https://xxxxx.supabase.co`
   - **`anon` / publishable key** → goes in the browser, this is fine and intended
   - **`service_role` key** → **server only, never in a `VITE_` variable.** It
     bypasses Row Level Security completely. It exists in this app for exactly one
     purpose: the nightly reminder cron.

> **Free tier caveat that will bite you.** Supabase's free plan includes 500 MB of
> database, 1 GB of file storage and 50,000 MAUs, but **free projects are paused
> after 1 week of inactivity**, and you only get 2 active free projects per
> account. A paying brokerage goes on **Pro, from $25/month**. Use free tiers for
> your own testing, not for a client whose CRM must be up on a Monday morning.

## B2. Run the migration

1. Supabase dashboard → **SQL Editor** → New query.
2. Paste the **entire** contents of `MIGRATION.sql` and Run.
3. It is written to be re-runnable (`create table if not exists`, `drop policy if
   exists`), so re-running it after a code update is safe.

What it creates: `accounts`, `crm_users`, `contacts`, `transactions`, `tasks`,
`expenses`, `contracts`, `app_settings`, `reminder_log`; the helper functions
`is_leader()`, `crm_active()`, `my_pools()`, `no_users()`, `crm_whoami()`; the
seat-limit trigger; Row Level Security with policies on every table; and the two
private storage buckets, `contracts` and `receipts`.

Then verify it took, in the same SQL editor:

```sql
-- every one of these must say true
select tablename, rowsecurity from pg_tables
 where schemaname = 'public'
   and tablename in ('contacts','transactions','tasks','expenses','contracts','crm_users','app_settings','accounts');

-- policies exist
select tablename, policyname from pg_policies where schemaname = 'public' order by tablename;

-- the seat trigger is installed
select tgname from pg_trigger where tgname like 'seat_limit%';

-- both buckets private
select id, public from storage.buckets where id in ('contracts','receipts');
```

If `rowsecurity` is false anywhere, or `storage.buckets.public` is true, stop and
re-run the migration — a public bucket makes every contract in the account
readable by anyone with the URL.

Set the seat count you sold them:

```sql
update accounts set seat_limit = 8, name = 'Cornerstone Realty Group' where id = 'main';
```

`seat_limit` deliberately lives here and not in Settings, because seats are billed
and a trigger — not a button — enforces them.

## B3. Configure Auth

Supabase → **Authentication**:

1. **Providers → Email**: enabled. **Turn "Confirm email" OFF.** With confirmation
   on, Supabase does not return the new user's id when you add a seat, so the
   `crm_users` row cannot be created. The app says so on screen if it happens, but
   save yourself the round trip.
2. **URL Configuration → Site URL**: your production URL.
3. **URL Configuration → Redirect URLs**: add your production URL *and* any
   preview URL you will test from. Password-reset links come back here; a stale
   value sends the brokerage to `localhost`.
4. **Users → Add user**: create the team leader's login with a temporary password.
   Everyone else gets added from inside the app.

## B4. Get the Anthropic API key

1. **https://platform.claude.com** → **Settings → API keys**
   (https://platform.claude.com/settings/keys) → create a key. Set an expiry.
2. Add credits under Billing. Start with $20; see the cost section below for why
   that lasts a long time.
3. Consider a **workspace** per client (Settings → Workspaces) so you can see and
   cap each brokerage's spend separately.

The key is used only server-side, by `api/extract-contract.js`, `api/ai.js`,
`api/parse-receipt.js`, `api/rank-tasks.js` and `api/huddle.js`. It never reaches
the browser, which is why it must **not** have a `VITE_` prefix.

Models used, and where to change them:

| Job | Model | Where |
|---|---|---|
| Contract extraction | `claude-sonnet-5` | Settings → Contracts, or `MODEL_DEFAULT` in `api/extract-contract.js` |
| Anything client-facing (net sheet prose, listing copy, client update) | `claude-sonnet-5` | `SONNET` in `api/ai.js` |
| Extraction / classification (receipts, showing-feedback themes, reactivation) | `claude-haiku-4-5` | `HAIKU` in `api/ai.js`, `MODEL` in `api/parse-receipt.js` |

## B5. Set up email for reminders (Resend)

Skip this and the app still works — deadlines surface in-app and on the dashboard —
but nothing gets emailed, and the cron returns
`{ok:false, reason:'not_configured'}`.

1. **https://resend.com** → sign up.
2. **https://resend.com/domains** → add the brokerage's domain and add the DNS
   records it gives you (SPF, DKIM, and a return-path CNAME). Wait for verified.
   **You cannot send from a domain you have not verified**, and sending from a
   generic address gets deadline emails filed as spam, which defeats the point.
3. **https://resend.com/api-keys** → create a key with send permission.
4. Free plan: **3,000 emails/month, 100/day, 1 domain**. A ten-agent team with
   twenty live transactions sends maybe 15–30 a day, so free is genuinely fine at
   first; **Pro is $20/month for 50,000** with no daily cap.

## B6. Create the Vercel project and set the variables

**https://vercel.com/new** → import the repo → framework preset **Vite** → then
add the variables below **before** the first deploy. Set each one for
**Production** (and Preview too, if you will test from preview URLs).

### Browser variables — inlined into the bundle at build time

Anyone can read these by viewing source. That is fine for what is here, and it is
why the service key is not here.

| Variable | Required | Value / where it comes from |
|---|---|---|
| `VITE_SUPABASE_URL` | **yes** | Supabase → Settings → API → Project URL |
| `VITE_SUPABASE_KEY` | **yes** | Supabase → Settings → API → `anon` / publishable key. RLS is the protection, not secrecy |
| `VITE_BRAND_NAME` | recommended | `Cornerstone Realty Group` |
| `VITE_BRAND_SHORT` | | sidebar + home-screen label, e.g. `Cornerstone` |
| `VITE_APP_TITLE` | | browser tab text |
| `VITE_LOGO_URL` | | https URL to their logo; replaces the wordmark in the sidebar |
| `VITE_AUTH_DOMAIN` | | lets a bare username sign in as `username@thatdomain`; leave unset to require real emails |
| `VITE_TZ` | | defaults `America/Chicago`. **Every deadline is rendered in this zone** |
| `VITE_MODULES` | | comma-separated section keys to ship a narrower app, e.g. `dashboard,pipeline,contacts,transactions,contracts,commission` |
| `VITE_COLOR_COBALT` `VITE_COLOR_INK` `VITE_COLOR_GOLD` `VITE_COLOR_GREEN` `VITE_COLOR_RED` | | brand colours as hex |
| `VITE_BIZ_NAME` `VITE_BIZ_ADDRESS` `VITE_BIZ_EMAIL` `VITE_BIZ_PHONE` `VITE_BIZ_LICENSE` | | appear on client-facing output (net sheets, weekly updates) |
| `VITE_DEMO` | **do not set** | if set, the app never touches the database |

### Server variables — never prefixed with `VITE_`

| Variable | Needed for | Value / where it comes from |
|---|---|---|
| `ANTHROPIC_API_KEY` | all AI features | https://platform.claude.com/settings/keys |
| `SUPABASE_URL` | reminder cron | the same project URL again, without the `VITE_` prefix |
| `SUPABASE_SERVICE_ROLE_KEY` | reminder cron | Supabase → Settings → API → `service_role`. **Bypasses RLS. Server only.** |
| `RESEND_API_KEY` | reminder emails | https://resend.com/api-keys |
| `NOTIFY_FROM` | reminder emails | `"Cornerstone CRM <crm@cornerstone.com>"` — domain must be verified in Resend |
| `APP_URL` | links inside emails | `https://cornerstone-crm.vercel.app` |
| `CRON_SECRET` | recommended | any long random string. If set, `/api/notify?cron=1` requires `Authorization: Bearer <it>` |
| `NOTIFY_TO` | optional | fallback recipients for the ad-hoc notify path |
| `GOOGLE_CLIENT_ID` `GOOGLE_CLIENT_SECRET` `GOOGLE_REDIRECT_URI` | calendar | see `api/GOOGLE-CALENDAR-SETUP.md` |

Generate a cron secret:

```bash
openssl rand -hex 32
```

> **Two rules that cause most of the mistakes.** (1) A `VITE_` prefix means *the
> browser can read it* — putting the service key behind one would hand every
> visitor full database access. (2) `VITE_` values are frozen at build time, so
> changing one does nothing until you redeploy.

## B7. Deploy, then bootstrap the team leader

1. Deploy. Open the URL. You should get the sign-in screen — if you get "Not
   configured", one of the two `VITE_SUPABASE_*` values is missing or you have not
   redeployed since adding it.
2. Sign in as the leader you created in B3.
3. The app finds no team-member record for the account and shows **"This account
   has no seat yet"** with a *Claim this as the team leader* button. Press it. The
   insert only succeeds while `crm_users` is empty — that is the only
   self-promotion the database ever permits, and it closes the moment the first
   row exists. If the team already exists the button is refused and the screen
   tells you to ask the leader to add you.

If you would rather do it by hand — Supabase → Authentication → Users, copy the
uid:

```sql
insert into crm_users (id, name, email, role)
values ('PASTE-AUTH-UID', 'Dana Whitfield', 'dana@cornerstone.com', 'leader')
on conflict (id) do update set role = 'leader', active = true;
```

## B8. Walk Settings with the brokerage on the call

Order matters. Top to bottom, but these four are the ones that decide whether they
trust the thing:

1. **Critical-date offsets.** Go through every row against *their* state contract
   and *their* usual addenda. Each row has a live preview showing the computed date
   and the arithmetic ("effective date Jul 18 + 3 business days, skipping 1 weekend
   day = Jul 22"). Check business vs calendar per row, and check the inclusive/
   exclusive start — an off-by-one here costs a client their earnest money.
2. **Holidays.** Seeded with computed US federal holidays for four years, observed
   (a Saturday holiday shifts to the Friday). Add their local closures. The
   regenerate button merges, so custom entries survive.
3. **Commission defaults, then each agent's plan.** Split, cap, cap cadence,
   post-cap split and fee, team split **and its order** (team-before-brokerage or
   brokerage-before-team — both exist in the wild and the choice changes when an
   agent caps). The card has a live worked example including the straddle.
4. **Team and seats.** Add each agent; they get a temporary password to hand over
   or a set-your-password email. Then the **permission matrix** — everything
   defaults closed, and the screen states plainly that these are UI affordances
   while the database policies are the real rule.

Then the rest: stages and side labels, transaction phases, checklists, appointment
types and which count toward the ratio, lead sources, pools and their visibility,
the dashboard layout, mileage rate, contract retention, and the reminder
escalation schedule.

Finally, **Settings → Backup**: download the settings JSON and keep it with the
client's file. Restoring it is how you stand up a second install for a brokerage
with the same conventions in one click.

## B9. Turn on and verify the reminder cron

`vercel.json` already registers it:

```json
{ "crons": [ { "path": "/api/notify?cron=1", "schedule": "0 12 * * *" } ] }
```

`0 12 * * *` is 12:00 UTC = **07:00 America/Chicago in summer, 06:00 in winter**.
Vercel crons are always UTC; there is no timezone field. If they want 7am
year-round, you change the schedule twice a year or accept the hour drift.

> **Vercel Hobby caps crons at once per day**, with ±59 minutes of scheduling
> slop. A more frequent expression **fails at deploy time** with "Hobby accounts
> are limited to daily cron jobs." This app's single daily cron is deliberately
> within that limit. If a brokerage wants same-day escalation for a deadline set
> that morning, that needs **Pro** ($20/month per member) and a schedule like
> `0 12,20 * * *`.

Verify it by hand after deploying:

```bash
curl -s -X POST "https://cornerstone-crm.vercel.app/api/notify?cron=1" \
  -H "Authorization: Bearer $CRON_SECRET" | jq
```

Expected: `{"ok":true,"date":"2026-07-30","checked":42,"due":3,"sent":3,"skipped":0,...}`

**Now run it a second time.** The same deadlines must come back as `skipped`, not
`sent`. That is the `reminder_log` unique index doing its job — a cron that runs
twice must not email twice. If the second run says `sent` again, the migration's
`reminder_log_once` index did not create.

Check it fired on schedule the next day: Vercel → project → **Logs**, filter to
`/api/notify`. Also Vercel → **Settings → Cron Jobs** shows the registered job and
its last run.

## B10. Google Calendar (optional)

Full steps are in `api/GOOGLE-CALENDAR-SETUP.md`. Short version: a Google Cloud
project at **https://console.cloud.google.com**, Calendar API enabled, an OAuth
2.0 client with `GOOGLE_REDIRECT_URI` pointed at
`https://your-app.vercel.app/api/google-callback`, then each agent connects their
own calendar from inside the app.

Known limitation, inherited and flagged in the UI: it writes to the connected
account's **primary** calendar. A dedicated "Transactions" calendar needs a
calendar picker and a stored calendar id — a small, well-scoped change if a client
asks.

## B11. Custom domain

Vercel → project → **Settings → Domains** → add `crm.cornerstone.com`, then add
the CNAME it shows you at the brokerage's DNS. Then go back and update:

- `APP_URL` (email links)
- Supabase → Authentication → **Site URL** and **Redirect URLs**
- `GOOGLE_REDIRECT_URI` and the matching Google Cloud OAuth client, if calendar is on

and redeploy.

---

# The API routes, one line each

All are Vercel Node functions under `api/`. None of them run under `vite dev` —
use `vercel dev` if you need them locally, or work in demo mode. Every one of them
**fails soft**: a missing key or a bad model response returns HTTP 200 with
`{ok:false, reason:'...'}` so the UI can say something honest instead of throwing.

| Route | Method | What it does | Env it needs |
|---|---|---|---|
| `/api/extract-contract` | POST | The headline feature. Takes `{pdf: base64, isAddendum, knownAddress, model}`; returns parties, property, money, the effective and closing dates, and every dated clause **as a rule** (offset, business/calendar, inclusive, anchor) with its verbatim quote and a confidence. **It never computes a date** — the app does that with the tested engine — and it never interprets the contract. Malformed output comes back as `{ok:false,reason:'bad_json'}` and creates nothing | `ANTHROPIC_API_KEY` |
| `/api/ai` | POST | One job-dispatched endpoint: `listing-description`, `net-sheet`, `offer-comparison`, `weekly-update`, `showing-digest`, `reactivation`, `huddle`, plus `probe` (which reports whether the key is set without spending a token). Money arithmetic is done in JavaScript; the model only writes the prose | `ANTHROPIC_API_KEY` |
| `/api/notify?cron=1` | POST | The nightly reminder run. Finds due deadlines across active transactions, applies the escalation schedule, claims each send in `reminder_log` **before** sending so a double run cannot double-email, and releases the claim if the send fails so tomorrow can retry | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `NOTIFY_FROM`, optional `APP_URL`, `CRON_SECRET` |
| `/api/notify` | POST | The ad-hoc path, kept from the source repo: `{to, subject, text}` | `RESEND_API_KEY`, `NOTIFY_FROM` |
| `/api/parse-receipt` | POST | Reads a receipt image or PDF and returns a **draft** expense — vendor, date, total, tax, category from the install's own category list. The agent edits and saves; nothing auto-saves | `ANTHROPIC_API_KEY` |
| `/api/rank-tasks` | POST | Carried over: ranks the day's tasks | `ANTHROPIC_API_KEY` |
| `/api/huddle` | POST | Carried over: the weekly review narrative | `ANTHROPIC_API_KEY` |
| `/api/calendar-event` | POST | Creates or updates one calendar event per deadline. The `eventId` is stored on the deadline, so editing a date updates the event instead of duplicating it | Google vars |
| `/api/google-auth`, `/api/google-callback`, `/api/google-status`, `/api/google-disconnect` | GET | The OAuth dance for an agent connecting their calendar | Google vars |

---

# Before you hand it over

- [ ] `npm run build` exits 0 locally and the Vercel build is green
- [ ] `node tests/run.mjs` → 298 checks pass (`npm i --no-save jsdom` first)
- [ ] Sign-in works; the leader's `crm_users` row exists with `role = 'leader'`
- [ ] **`RLS-AUDIT.sql` run in the Supabase SQL Editor and reporting OK.** One
      minute, no logins. It raises if any table has RLS off or carries a
      permissive policy with a `true` expression — the failure a behavioural
      review has already missed twice in one day on a sibling install
- [ ] **`VERIFY-RLS.md` run end to end, with the date and your name written into
      the client's notes.** This is the one step with no automated substitute —
      RLS is Postgres, not something jsdom can test. The audit above proves
      nothing is trivially open; this proves the expressions are right
- [ ] Both storage buckets show `public = false`
- [ ] Seat limit matches what they bought; adding one past it is refused by the
      database with "Seat limit is N"
- [ ] Critical-date offsets checked against their actual contract, row by row
- [ ] Upload one real (or realistic) executed contract end to end: the review
      table shows a quote and the arithmetic for every date, you edit one, confirm,
      and the deadlines, tasks and calendar events appear
- [ ] Re-upload it as an amendment with a changed effective date: unmet deadlines
      re-cascade, met ones stay, and the before/after report is right
- [ ] Cron run twice by hand → second run reports `skipped`
- [ ] One reminder email actually arrives, and does not land in spam
- [ ] Commission checked against one real closed deal they already know the answer
      to. Do this. It is the number they will check first
- [ ] Open it on their phone: every board moves with the `‹ ›` arrows

---

# What it costs to run

Per brokerage, at July 2026 prices:

| | Free tier | When you outgrow it |
|---|---|---|
| **Vercel** | Hobby: fine for a demo. Crons limited to once a day, ±59 min | Pro $20/month per member — needed for sub-daily crons, and required anyway for commercial use |
| **Supabase** | 500 MB db, 1 GB storage, 50k MAUs — **but free projects pause after 1 week idle**, max 2 active | Pro from $25/month. A paying client belongs here from day one |
| **Resend** | 3,000 emails/month, 100/day, 1 domain | Pro $20/month for 50,000 |
| **Anthropic** | pay as you go, no free tier | see below |

Anthropic is usage-based and small. Sonnet 5 is $3/MTok in and $15/MTok out (with
introductory pricing of $2/$10 running through 31 August 2026); Haiku 4.5 is
$1/$5. A 10–15 page contract extraction is roughly 25–40k input tokens and a few
thousand out, so **call it 5–15 cents per contract**. A team doing 20 transactions
a month, with receipt scanning and the weekly AI drafts, lands in the low single
digits of dollars per month. $20 of credit lasts a long time — set a spend alert in
the console and stop thinking about it.

So a real install is realistically **$45–65/month of infrastructure** (Vercel Pro
+ Supabase Pro + a few dollars of Anthropic), before whatever you charge.

---

# Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "Not configured" screen | `VITE_SUPABASE_URL` / `VITE_SUPABASE_KEY` missing, or set but not redeployed since | add them, then Deployments → ⋯ → Redeploy |
| Sign-in works, then a blank or stuck screen | no `crm_users` row for that account | let the bootstrap insert it, or insert it by hand (B7) |
| "Seat deactivated" screen | `active = false` on their row | Settings → Team → reactivate |
| Adding a seat fails with "Seat limit is N" | working as designed, the trigger refused it | `update accounts set seat_limit = …` |
| Adding a seat says the login could not be created | "Confirm email" is ON in Supabase Auth | turn it off (B3) |
| Password reset link goes to localhost | Supabase Site URL / Redirect URLs still default | fix both under Authentication → URL Configuration |
| AI panels say "not configured" | `ANTHROPIC_API_KEY` missing, or you are on `vite dev` where `api/*` does not run | add the key and redeploy, or use `vercel dev` |
| Contract extraction returns "came back malformed" | the model did not return usable JSON | retry once; if it repeats, the PDF is probably a scan — nothing was created, so enter the dates by hand |
| Deadline dates look a day off | the offsets, not a bug in the engine | Settings → Critical-date offsets: check business vs calendar and the inclusive-start toggle on that row. The live preview shows the arithmetic |
| A deadline landed on a Saturday | rollover is set to `stand` | Settings → Counting rules → `forward` |
| Business-day counts wrong every November | the holiday list is missing that year | Settings → Holidays → regenerate for the year (it merges, it does not wipe) |
| No reminder emails | cron returned `not_configured`, or the Resend domain is unverified | check all four of `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `NOTIFY_FROM`; verify the domain at resend.com/domains |
| Two identical reminder emails | `reminder_log_once` index missing | re-run `MIGRATION.sql` and check for errors |
| Cron fails at deploy time | the schedule runs more than once a day on Hobby | daily expression, or upgrade to Pro |
| An agent can see another agent's data | a policy did not apply | re-run `MIGRATION.sql`, then work through `VERIFY-RLS.md` — do not patch this in the UI |
| Calendar events duplicate | the `eventId` is not being stored back on the deadline | check `/api/calendar-event` responses in Vercel logs |
| Contract file will not open | signed URLs last 5 minutes on purpose | click View again |

---

# Doing this for the next client

Once the first install is done, the repeat is short:

1. New Supabase project → run `MIGRATION.sql` → set `seat_limit` and `name`.
2. New Vercel project from the **same repo** → env vars, changing only the
   Supabase pair, the brand block and `APP_URL`.
3. Auth: Confirm-email off, Site URL, Redirect URLs, create the leader.
4. Sign in, bootstrap, then **Settings → Backup → restore** the JSON from a
   brokerage with similar conventions and edit the differences. This is where the
   twenty minutes comes from.
5. Their contract's date offsets, row by row. Never inherit these blind — this is
   the one thing that is genuinely different per brokerage and per state.
6. `VERIFY-RLS.md`, recorded.
7. Cron verified twice.

Because it is one repo, a fix you make for one brokerage reaches all of them on
their next deploy. Which is the point of building it this way, and the reason to
keep resisting the urge to fork it for a client who wants something different —
put it in Settings instead.

---

Sources for the platform facts above: Vercel
[cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing) and
[environment variables](https://vercel.com/docs/environment-variables);
[Supabase pricing](https://supabase.com/pricing); [Resend pricing](https://resend.com/pricing);
Claude [models overview](https://platform.claude.com/docs/en/about-claude/models/overview).
Checked 30 July 2026 — worth re-checking before quoting a client a number.
