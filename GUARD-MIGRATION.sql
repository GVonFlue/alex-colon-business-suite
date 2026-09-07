-- ===========================================================================
-- One table, for the rate limiter in api/_guard.js.
--
-- Run this on Dwell's Supabase BEFORE deploying the guard. Without it the
-- limiter fails OPEN — every request is allowed and nothing is counted — which
-- is deliberate (a limiter that takes the product down when its datastore
-- blips is worse than the abuse it prevents) but is not the state to ship in.
--
-- The AUTH half does not need this table and is unaffected: requireAuth
-- verifies the caller's Supabase JWT and fails CLOSED. So even without this
-- migration the endpoints stop being anonymous the moment the code deploys.
-- This is what makes them rate-limited as well.
-- ---------------------------------------------------------------------------
-- BEFORE YOU RUN THIS, CHECK THE ENVIRONMENT.
--
-- This table is only half of what the guard needs. The other half is
-- SUPABASE_SERVICE_ROLE_KEY on the Vercel project, and its absence is a trap
-- worth knowing about: the browser never needs it, so the app works perfectly
-- while EVERY guarded endpoint answers 401 "Session expired." on a session that
-- is entirely valid. The URL half falls back to VITE_SUPABASE_URL and looks
-- fine; the key half has no VITE_ equivalent by design and cannot.
--
-- It happened on a live install. See DEPLOY.md, "The service-key trap".
-- ---------------------------------------------------------------------------
-- ===========================================================================

create table if not exists api_hits (
  id     bigserial primary key,
  bucket text        not null,
  at     timestamptz not null default now(),
  -- the dollar column the assistant will use later, added now so the Jarvis
  -- port does not need a second migration
  cost   numeric(10,6)
);

create index if not exists api_hits_bucket_at on api_hits (bucket, at desc);

-- RLS ON WITH NO POLICY. This is the point, not an omission: no anon or
-- authenticated client can read or write a single row. The serverless functions
-- reach it with the service key, which bypasses RLS. A policy here would only
-- widen it.
alter table api_hits enable row level security;

-- crm_whoami() already exists on Dwell and _guard.js calls it to check a role.
-- It returns a wider row here than on ProyTech (id, name, email, role, active,
-- setup, sections, permissions, plan, pools, seat_limit, seats_used) — the
-- guard reads only `role` and `active`, both of which exist. Nothing to change.
