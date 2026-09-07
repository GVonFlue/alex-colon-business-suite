# ProyTech Business Suite

A CRM for a real estate team: one side-aware pipeline, a closing board, and
critical dates read straight off the executed contract with the arithmetic shown.
Built to be the template for custom CRM work — one repo, one Vercel project per
brokerage, everything a brokerage would change living in Settings.

```bash
npm install
npm run dev:demo     # seeded demo, no database, resets on refresh
npm run dev          # the real product (needs Supabase env vars)
npm run build        # exits 0
npm test             # 298 checks (npm i --no-save jsdom for the browser suite)
```

## What it does

- **One pipeline, side-aware.** Buyer and seller stages map one-to-one, so a card
  renders the label for its own side — *Listing Appt Set* or *Buyer Consult Set*,
  one board, filterable to All / Buyers / Sellers.
- **Transactions board** for the closing pipeline: under contract → inspection →
  appraisal → financing → clear to close → closed, with *fell through* as a
  first-class outcome rather than a delete.
- **Critical dates, done properly.** Upload the executed contract; the model
  extracts the clauses and the app computes the dates with a unit-tested engine.
  Every deadline shows the quoted clause, the rule used, and the arithmetic
  ("effective date Jul 18 + 3 business days, skipping 1 weekend day = Jul 22").
  Business vs calendar is per deadline. Nothing is created until a human confirms.
  Changing the effective date re-cascades the unmet deadlines and tells you what
  moved.
- **Reminders that actually fire**, from a Vercel cron, idempotent at the database.
- **Commission** with splits, caps, team-split order and the cap straddle handled
  explicitly and tested to the dollar.
- **Per-agent privacy enforced in Postgres**, not in the UI. Including expenses,
  which the team leader deliberately cannot see.
- **AI tools**: contract ingestion, listing description writer, seller net sheet,
  offer comparison, weekly client update, showing-feedback digest, database
  reactivation, receipt scanning, Monday Huddle. Every output is a draft the agent
  edits and sends; nothing auto-sends, nothing gives legal advice, and no
  valuation is ever presented as a CMA.

## Read these in this order

| File | Why |
|---|---|
| `GO-LIVE.md` | **start here** — GitHub → Vercel → Supabase, every env var, every API route, what it costs |
| `BUILD-NOTES.md` | what was built, assumed, and deliberately left out |
| `docs/VIEW-CONTRACT.md` | how the views are wired, and the rules they follow |
| `MIGRATION.sql` | the schema, and the privacy rules as they are actually enforced |
| `VERIFY-RLS.md` | the manual procedure to run before letting an agent in |
| `ROLES.md` | the three roles — leader, agent, transaction coordinator — and what the permission matrix does and does not do |
| `DEPLOY.md` | deploying the demo, and standing up a real brokerage |

## Layout

```
src/lib/        pure logic — no React, no env, unit tested in plain node
src/views/      one file per section, each taking one prop: { ctx }
src/App.jsx     the shell: session, data, mutations, nav
api/            serverless routes (extraction, AI, reminders, calendar)
tests/          unit suites + a jsdom harness that mounts the real app
```

The seam that matters is `src/lib/data.js`: `VITE_DEMO=1` swaps the Supabase data
layer for an in-memory one with the identical interface, and the demo adapter
enforces the same scoping the RLS policies do. The demo is the real product with a
different data layer, not a throwaway.
