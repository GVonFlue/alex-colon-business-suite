# BUILD-NOTES — ProyTech Realtor CRM v1

What was built, what was assumed, and what was deliberately left out. Written for
the next person to open this repo, which may be you in three months.

**Source:** a new repo, forked in spirit from `GVonFlue/proytech-crm@main`. The
design system (`src/styles.js`) is that repo's CSS carried over verbatim, with a
realtor block appended and the card radius moved to 22px. The Google Calendar
routes (`api/_google.js`, `api/calendar-event.js`, `api/google-*.js`), the receipt
scanner and the task ranker came across too. Everything else is new.

**Stack:** unchanged — Vite + React, Supabase (Postgres + RLS + Auth + Storage),
Vercel, Anthropic API. No new runtime dependencies; `package.json` gained only
scripts.

---

## 1. The shape of the repo, and why it is not one big file

The source repo is one 5,523-line `src/App.jsx`. That is fine for one product and
miserable for a template, which is what this repo is meant to be. So:

```
src/lib/        no React, no env, no Supabase — pure logic, unit tested
  dates.js        the critical-date engine
  commission.js   the split/cap engine
  settings.js     every editable default (config over fork)
  format.js       formatters + uuid
  supabase.js     the real data layer
  demo.js         the in-memory data layer (VITE_DEMO=1)
  seed.js         demo data, dated relative to today
  data.js         THE SEAM: `import { auth, db } from './lib/data'`
  brand.js        per-deployment env config
src/components/ui.jsx   shared primitives, including the Board with arrow fallback
src/views/*.jsx         one file per section, each taking one prop: { ctx }
src/App.jsx             the shell: session, data, mutations, nav, ctx
api/                    serverless routes
tests/                  unit + jsdom harness (see §8)
docs/VIEW-CONTRACT.md   what `ctx` contains and the rules a view must follow
```

`src/lib/*` is importable from plain node, which is what makes the money maths
and the date maths testable without a browser. Nothing in a view does date or
money arithmetic — see the rules at the bottom of `docs/VIEW-CONTRACT.md`.

## 2. Removed entirely (§1 of the brief)

MRR, retainers, invoicing and every agency-only concept are **gone**, not hidden.
There is no invoices module, no Settings section for it, no MRR tile, no delivery
tracks framed as website builds. The jsdom harness asserts this: it walks every
section as both roles and fails on the words *MRR*, *retainer*, *invoice* or
*monthly recurring* appearing anywhere in the rendered DOM.

## 3. The critical-date engine (`src/lib/dates.js`)

The flagship, and the part to read first.

- **A deadline is a date, never a timestamp.** Every function takes and returns
  `'YYYY-MM-DD'` strings and does integer day arithmetic via `Date.UTC`. No
  `Date` object crosses a function boundary, so no timezone conversion can move
  a deadline a day. There is a unit test that runs the same computation with the
  process pinned to UTC+14 and UTC-11 and asserts the results are identical.
- **Business vs calendar is per deadline**, stored on the deadline, and printed
  on screen next to the date. There is no global mode.
- **Inclusive vs exclusive start is explicit.** The default is exclusive — "5
  days after the Effective Date" means day one is the day *after* signing — and
  the rule text says which one it used.
- **Holidays** are a settings list seeded with computed US federal holidays
  (observed: a Saturday holiday shifts to the Friday) spanning four years.
  Regenerating from Settings *merges*, so custom entries survive.
- **Rollover** is a setting: `forward` (the confirmed default), `stand` or
  `back`. It applies to calendar-counted results; a business-counted result is
  already a business day.
- **Everything explains itself.** `computeDeadline()` returns `rule` ("3 business
  days after the effective date, exclusive start") and `explain` ("effective date
  Jul 18 + 3 business days, skipping 1 weekend day = Jul 22"). Both render on
  screen. An agent can verify five deadlines in ten seconds without opening the
  PDF, which was the whole point.
- **`cascade()`** is the only way deadlines get built or rebuilt. Its rules:
  - only UNMET deadlines move;
  - `met`, `waived` and `extended` are left exactly alone;
  - a deadline whose date came from an **absolute** clause ("on or before August
    12, 2026") never moves, because the contract named a day, not an offset;
  - a hand-entered date never moves;
  - it returns `{deadlines, moved, kept, added}` and the UI shows that report —
    every mover with from/to, every hold-out with the reason.

## 4. Contract ingestion (§4a)

`api/extract-contract.js` → the review table in `src/views/Contracts.jsx`.

Two deliberate design decisions worth knowing:

1. **The model does not compute dates.** For a relative clause it returns the
   *rule* — offset, business/calendar, inclusive, anchor — and the app computes
   the date with the tested engine. A model that counts business days over a
   holiday list correctly today is still a model. Only absolute dates come back
   as dates.
2. **The model does not interpret.** Extraction only. No summary of obligations,
   no opinion on whether a term is favourable, no remedies. That is in the system
   prompt and repeated per field, and every client-facing surface carries a
   "dates and arithmetic only, not legal advice" note.

Also implemented, per the seven non-negotiables:

- every value carries its **verbatim source quote** and a confidence, and the
  quote renders beside the computed date, in the review table and forever after
  on the transaction;
- **nothing is created until the agent presses Confirm** — the upload, the row,
  the tasks and the calendar events all happen inside that one handler;
- **low confidence is flagged, not guessed.** Anything ambiguous, contradictory
  or unreadable comes back in `unresolved` and creates nothing;
- **contact matching is proposed with a reason** ("property address matches
  exactly", "surname Vaughn appears on the contract"), and the agent confirms,
  picks another, or creates a new contact;
- **re-uploading against an existing transaction** re-reads the document,
  re-cascades unmet deadlines, leaves met ones alone, and shows a before/after;
- a malformed model response is `{ok:false, reason:'bad_json'}` and the UI says
  "enter the dates by hand rather than trusting a partial read". It never throws
  and never half-writes.

**Model choice:** §4a says Sonnet for contract ingestion; §9's design notes say
Haiku for extraction. Contract ingestion uses **Sonnet** (`claude-sonnet-4-5`,
overridable in Settings) because §4a is specific and this is the highest-stakes
read in the app. Receipt scanning and classification use Haiku.

**Storage and privacy:** private `contracts` bucket, object keys prefixed with the
owning agent's uid, storage policies restricting reads to that agent and the team
leader, five-minute signed URLs minted on demand. No public URL and no long-lived
signed URL exists anywhere in the codebase. Retention defaults to 84 months and
delete removes the object, not just the row.

## 5. Commission (§5)

`src/lib/commission.js`, exercised by 91 assertions.

The order is fixed: gross → referral out → team split (if first) → brokerage
split against remaining cap → team split (if second) → per-transaction fees →
agent net. `computeCommission()` returns a `lines` array which is what the UI
renders, so the screen cannot drift from the maths.

**The cap straddle** is implemented as the brief describes it and tested against
its own worked example: with $2,000 left on the cap and a brokerage share of
$3,500, $2,000 finishes the cap and $1,500 is treated at the post-cap split. Only
the cap dollars count as cap credit; money the brokerage takes out of post-cap
dollars does not. Also tested: the first deal of a new cap year, a deal that hits
the cap exactly, a fully capped agent, and a post-cap split that is not 100%.

**Team split order** is a setting with no silent default beyond the one you
confirmed (team-before-brokerage). The tests show why it cannot be silent: on the
same deal the two orders produce the same agent net but different *cap credit*
($1,350 vs $1,500), so picking one quietly changes when an agent caps.

**Closing snapshots the split** onto the transaction (`capContribution`,
`commissionSnapshot`), so editing a plan later never rewrites history.
`replayYear()` re-costs a period in close-date order when you do want the
recomputation, and the Commission view says out loud when the replay and the
snapshots disagree — that is the signature of someone having edited a closed deal.

## 6. Privacy, seats and permissions (§6, §7)

Everything is in `MIGRATION.sql`, and the client sends **no owner filters** —
`db.getContacts()` has no `.eq('owner_id', …)` anywhere, on purpose. The queries
are written on the assumption that Postgres will refuse.

- An agent's contact query returns their own rows plus the pools they are listed
  on. An agent can only read their own `crm_users` row, so the browser cannot even
  enumerate the team.
- An agent may claim a pool lead (ownership becomes theirs) but the `with check`
  clause blocks handing a contact to somebody else.
- An agent may edit their own user row but not their `role`, `plan` or
  `permissions`. Nobody promotes themselves; nobody sets their own split.
- **Expenses: own rows only, for everyone.** The `expenses` policy is the one
  policy in the file with no `is_leader()` override, and the receipts bucket
  matches. The team leader sees only the brokerage-level expenses they entered
  themselves. This is §7 and it is deliberate; you confirmed it.
- **Seats are enforced by a trigger**, not a button: inserting or reactivating a
  user past `accounts.seat_limit` raises `P0001`, and the UI surfaces the message
  the database sent. `seat_limit` is on the account row, not in client-editable
  settings. Settings shows "N of M seats used — contact ProyTech to add more".
  Deactivating frees a seat and keeps the history and the commission record.
- The permission matrix controls UI affordances and team roll-ups. It is **not**
  the enforcement, and the Settings screen says so above the table. `Edit their
  own split/cap settings` renders as permanently off, labelled "never".

## 7. Demo mode (§11)

`VITE_DEMO=1` swaps `src/lib/data.js` from `supabase.js` to `demo.js`, an
in-memory adapter exposing the identical `auth` and `db` interface. Vite
tree-shakes the unused branch, so a demo build ships no Supabase calls and a real
build ships no seed data. Without the flag it is the real product.

The part that matters: **the demo adapter enforces the same scoping the RLS
policies do, at the same layer** — inside the data calls, not in the views. So
"View as: Marcus" genuinely cannot fetch Priya's contacts or expenses. If the
demo only looked right because a component filtered, the demo would be lying
about the product, which is worse than having no demo.

Seeded, all dated relative to today so the urgency is always live:

- 40 contacts across every stage and both sides, including four unclaimed pool
  leads with real time-in-pool and four past clients old enough to be
  reactivation candidates;
- 3 active transactions at different phases — one with contract-sourced deadlines
  and quoted clauses, one overdue item (HOA documents, the most common real one),
  and the inspection-objection deadline landing **tomorrow** so the 48-hour flag
  is visible;
- 8 closed transactions and 1 fell-through (financing denied at underwriting);
- one agent at **45% of cap** and one **capped out with a straddle on the
  record**, so the hard case is demonstrable rather than described;
- expenses for each agent plus brokerage-level ones for the leader, which the
  leader cannot see the agents' half of;
- a populated Monday Huddle.

A persistent banner says *"Demo — data resets on refresh."*

## 8. Tests

`node tests/run.mjs` — **298 assertions, all passing.** Four suites:

| suite | what it proves |
|---|---|
| `dates` | 71 checks: weekends, the seeded holiday list, observed holidays, inclusive vs exclusive, rollover all three ways, negative offsets, timezone invariance, and every cascade rule |
| `commission` | 91 checks: the straddle to the dollar, new cap year, exact cap hit, fully capped, post-cap splits, team order, referral off the top, fees, cap periods, projection, replay |
| `scoping` | 41 checks called **at the query level, not the UI**: what each seat's `db.*` calls return and which writes throw, including the seat-limit boundary |
| `app` | 95 checks: the real app bundled with esbuild in demo mode, mounted in jsdom, clicked through **every section as the team leader and as an agent** — no blank screens, no `$NaN`, no other agent's name anywhere in an agent's DOM, the deadline evidence on screen, one pipeline board with side-aware labels, and no MRR/invoicing language |

`npm i --no-save jsdom` for the fourth suite; the first three need nothing beyond
what Vite already installs. `npm run build` exits 0.

Two real bugs the tests caught during the build, for the record: `holidayMap()`
was not idempotent, so every business-day computation threw once a holiday list
was passed; and `seedData()` returned the module-level users array by reference,
so "data resets on refresh" was quietly false for seats.

**RLS itself is not covered by these tests and cannot be** — it is Postgres, not
jsdom. `VERIFY-RLS.md` is the manual two-account procedure plus the SQL checks.
Run it before letting a real agent in.

## 9. Assumptions made

Decisions taken with your confirmation, all editable in Settings:

- a computed deadline landing on a non-business day **rolls forward**;
- the **team split runs before the brokerage split**;
- the **team leader does not see agents' individual expenses**;
- contracts are retained **7 years** and delete is **hard** (the object goes);
- reminders go to the **assigned agent only**, escalating 7 days / 1 day /
  morning of, then daily while overdue; coordinator and client are opt-in per
  transaction;
- the post-cap transaction fee is **not** charged on the deal that caps an agent
  out (`postCapFeeOnStraddle: false`) — both conventions exist, so it is a
  setting;
- seeded brand is a neutral "Summit & Vine Realty" with Wichita-area addresses,
  rebrandable from Settings in about a minute.

Assumptions made without asking, because they are conventions rather than
choices, and all of them are settings:

- the default commission rate used for *forecasting* open pipeline is 3%, shown
  in a tooltip wherever it is used;
- "going cold" is 14 days without a touch; a pool lead goes cold at 7;
- the default cap cadence is a calendar year;
- appointment types that count toward the appointment-to-close ratio are listing
  appointments and buyer consultations only.

## 10. Deliberately left out of v1

Named so nobody thinks they are bugs:

- **Six of the eleven §9 AI features.** Built: contract ingestion, listing
  description writer, seller net sheet, offer comparison, weekly client update,
  showing-feedback digest, database reactivation, plus the carried-over receipt
  scanning, task ranking and Monday Huddle. **Not built:** buyer match, voice memo
  to CRM, open house sign-in, anniversary touchpoints. The `api/ai.js` route is
  structured as one job-dispatched endpoint, so each is a job handler plus a
  panel, not an architecture change.
- **Google Calendar writes to the connected account's primary calendar only.** A
  dedicated transaction calendar needs a calendar picker and a stored calendar
  id; the limitation is inherited from the source repo and is flagged in the UI.
- **No self-serve billing.** Seats are requested from ProyTech, per §6.
- **Reminder emails need Resend configured**; without `RESEND_API_KEY` the cron
  returns `{ok:false, reason:'not_configured'}` and the in-app deadline surfaces
  remain the source of truth. Failing soft here is deliberate: an email provider
  being down must never break a deadline record.
- **The reminder cron reads deadlines out of `transactions.data` jsonb.** Fine at
  this scale and simpler to keep consistent with the app; if a brokerage grows
  past a few thousand active transactions, promote deadlines to their own table
  with their own policies.
- **Mobile is arrow-driven, not drag-driven.** Every board card has `‹ ›` buttons
  because drag does not work on a touchscreen. Drag still works on desktop.
- **The bundle is one ~1.2 MB chunk.** Code-splitting the views would fix it;
  left alone because the demo loads fine and the first change any client asks for
  should not be a build refactor.

## 11. Where to change things

| You want to change… | Go to |
|---|---|
| stages, phases, labels per side | Settings → Stages / Phases (`settings.stages`, `.phases`) |
| deadline offsets, business vs calendar, inclusive start | Settings → Critical-date offsets (with a live preview of the arithmetic) |
| the holiday list | Settings → Holidays |
| splits, caps, fees, team order | Settings → Commission defaults, and per agent under Team |
| who can see what | Settings → Permission matrix, **and** `MIGRATION.sql` for the real rules |
| checklists | Settings → Checklist templates |
| the dashboard | the Rearrange button, or Settings → Dashboard layout |
| brand, colours, name | env vars (`src/lib/brand.js`) for the deployment default, Settings → Brand to override |
| what the demo shows | `src/lib/seed.js` |
