-- ============================================================================
-- ProyTech Realtor CRM — schema + Row Level Security
--
-- Run this ONCE in the Supabase SQL editor for a new install. It is written to
-- be re-runnable (create ... if not exists / drop policy if exists), so running
-- it again after a code update is safe.
--
-- THE POINT OF THIS FILE
-- ---------------------
-- Ground rule 3 of the build brief: every privacy rule is enforced in the
-- database. A UI filter is not a permission. If a rule says an agent cannot see
-- another agent's expenses, then the QUERY must not return them — so the client
-- code sends no owner filters at all and relies on these policies.
--
-- The two rules worth stating out loud, because they surprise people:
--   1. An agent sees their own contacts plus the lead pools they are listed on.
--      Nothing else. Not with a permission toggle flipped either — the toggles
--      in Settings control UI affordances and team roll-ups, not raw row access.
--   2. EXPENSES ARE PRIVATE TO THE PERSON WHO ENTERED THEM, INCLUDING FROM THE
--      TEAM LEADER AND FROM THE TRANSACTION COORDINATOR. That is deliberate
--      (§7). Agents on a real estate team are typically 1099 and their spending
--      is their own business. If a brokerage wants it otherwise, that is a
--      policy change here, made knowingly.
--   3. A transaction coordinator reads the whole closing pipeline — every
--      transaction, task, contract and contact — and writes transactions, tasks
--      and contracts, because that is the job. They get NO widening on expenses.
--      Commission, however, lives in columns ON the transaction row, so a
--      coordinator's session can read those columns. The app does not offer them
--      the Commission or Books sections, but that is an app-level answer, not a
--      database one. ROLES.md says so plainly. Do not sell this role as a
--      guarantee the policies below do not make.
--
-- Verify it rather than trusting it: VERIFY-RLS.md.
-- ============================================================================

-- ---------------------------------------------------------------- extensions
create extension if not exists pgcrypto;

-- ------------------------------------------------------------------- account
-- One row, id 'main'. seat_limit lives HERE and not in client-editable
-- settings, because we bill per seat.
create table if not exists accounts (
  id           text primary key,
  name         text not null default 'My Brokerage',
  seat_limit   int  not null default 4,
  contact_url  text default 'mailto:hello@getproytech.com?subject=Add%20a%20seat',
  created_at   timestamptz not null default now()
);
insert into accounts (id, name) values ('main', 'My Brokerage')
  on conflict (id) do nothing;

-- --------------------------------------------------------------------- users
-- One row per Supabase Auth user. `role` is the only thing that grants breadth.
create table if not exists crm_users (
  id           uuid primary key,                       -- = auth.users.id
  name         text not null default '',
  email        text,
  role         text not null default 'agent',          -- 'leader' | 'agent' | 'coordinator'
  active       boolean not null default true,
  sections     text[] not null default '{}',           -- narrows the module list
  permissions  jsonb  not null default '{}',           -- UI affordances, not row access
  plan         jsonb  not null default '{}',           -- split / cap, leader-editable only
  pools        text[] not null default '{}',
  created_at   timestamptz not null default now()
);
alter table crm_users add column if not exists sections    text[] not null default '{}';
alter table crm_users add column if not exists permissions jsonb  not null default '{}';
alter table crm_users add column if not exists plan        jsonb  not null default '{}';
alter table crm_users add column if not exists pools       text[] not null default '{}';

-- ------------------------------------------------------------------ contacts
create table if not exists contacts (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid references crm_users(id) on delete set null,
  pool       text,                                     -- set when unclaimed
  side       text not null default 'buyer',            -- buyer | seller | both
  stage      text not null default 'new',
  pooled_at  date,
  created_at timestamptz not null default now(),
  data       jsonb not null default '{}'
);
create index if not exists contacts_owner_idx on contacts(owner_id);
create index if not exists contacts_pool_idx  on contacts(pool);

-- -------------------------------------------------------------- transactions
create table if not exists transactions (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid references crm_users(id) on delete set null,
  contact_id     uuid references contacts(id) on delete set null,
  side           text not null default 'buyer',
  phase          text not null default 'uc',
  status         text not null default 'active',       -- active | closed | fell
  effective_date date,
  close_date     date,
  created_at     timestamptz not null default now(),
  data           jsonb not null default '{}'           -- deadlines live in here
);
create index if not exists txn_owner_idx  on transactions(owner_id);
create index if not exists txn_status_idx on transactions(status);

-- ---------------------------------------------------------------------- tasks
create table if not exists tasks (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references crm_users(id) on delete cascade,
  transaction_id uuid references transactions(id) on delete cascade,
  contact_id     uuid references contacts(id) on delete cascade,
  due            date,
  done           boolean not null default false,
  data           jsonb not null default '{}'
);
create index if not exists tasks_user_idx on tasks(user_id);

-- ------------------------------------------------------------------- expenses
create table if not exists expenses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references crm_users(id) on delete cascade,
  spent_on   date,
  amount     numeric(12,2) not null default 0,
  category   text,
  data       jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists expenses_user_idx on expenses(user_id);

-- ------------------------------------------------------------------ contracts
-- Metadata only. The PDF itself is a Storage object in the private
-- 'contracts' bucket; `path` is the object key.
create table if not exists contracts (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references crm_users(id) on delete cascade,
  transaction_id uuid references transactions(id) on delete cascade,
  filename       text not null default 'contract.pdf',
  path           text not null,
  uploaded_at    timestamptz not null default now(),
  extracted      jsonb,
  delete_after   date                                  -- retention, a real default
);
create index if not exists contracts_owner_idx on contracts(owner_id);

-- --------------------------------------------------------------- app_settings
create table if not exists app_settings (
  id   text primary key,                               -- 'main' | 'huddle'
  data jsonb not null default '{}'
);

-- --------------------------------------------------------------- reminder_log
-- Idempotency for /api/notify. The unique key is what makes "running the cron
-- twice sends one email" a fact rather than an intention.
create table if not exists reminder_log (
  id             bigserial primary key,
  transaction_id uuid not null,
  deadline_key   text not null,
  tier           text not null,                        -- 'd7' | 'd1' | 'd0' | 'overdue-YYYY-MM-DD'
  deadline_date  date,
  sent_to        text,
  sent_at        timestamptz not null default now()
);
create unique index if not exists reminder_log_once
  on reminder_log(transaction_id, deadline_key, tier);

-- ============================================================================
-- helpers (security definer, so they can see rows the caller cannot)
-- ============================================================================

create or replace function is_leader() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from crm_users u where u.id = auth.uid() and u.role = 'leader' and u.active);
$$;

-- The transaction coordinator. Read breadth like the leader on the closing
-- pipeline; write on the things they work (transactions, tasks, contracts); and
-- NO widening anywhere near expenses — see the expenses policy below.
create or replace function is_coordinator() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from crm_users u where u.id = auth.uid() and u.role = 'coordinator' and u.active);
$$;

-- "Sees the whole team's pipeline" — leader or coordinator. Written once so the
-- policies below cannot drift apart from each other.
create or replace function sees_all_deals() returns boolean
language sql stable security definer set search_path = public as $$
  select is_leader() or is_coordinator();
$$;

create or replace function crm_active() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from crm_users u where u.id = auth.uid() and u.active);
$$;

create or replace function my_pools() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce((select u.pools from crm_users u where u.id = auth.uid()), '{}');
$$;

create or replace function no_users() returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from crm_users);
$$;

-- "Who am I", answered definitively.
-- An agent can only SELECT their own crm_users row, so from the browser
-- "no leader exists" and "I am not allowed to see the leader" look identical.
-- This function can tell them apart, and it also returns the seat counts, which
-- an agent could not otherwise read.
create or replace function crm_whoami()
returns table (
  id uuid, name text, email text, role text, active boolean, setup boolean,
  sections text[], permissions jsonb, plan jsonb, pools text[],
  seat_limit int, seats_used bigint
)
language sql stable security definer set search_path = public as $$
  select u.id, u.name, u.email, u.role, u.active, true as setup,
         u.sections, u.permissions, u.plan, u.pools,
         (select a.seat_limit from accounts a where a.id = 'main'),
         (select count(*) from crm_users x where x.active)
  from crm_users u where u.id = auth.uid();
$$;

grant execute on function is_leader, is_coordinator, sees_all_deals, crm_active, my_pools, no_users, crm_whoami to authenticated;

-- ============================================================================
-- seat enforcement — a trigger, not a button
-- ============================================================================
create or replace function enforce_seat_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare lim int; used int;
begin
  if new.active is not true then return new; end if;
  select seat_limit into lim from accounts where id = 'main';
  select count(*) into used from crm_users where active and id <> new.id;
  if used + 1 > coalesce(lim, 0) then
    raise exception 'Seat limit is %. Contact ProyTech to add more.', lim
      using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists seat_limit_ins on crm_users;
create trigger seat_limit_ins before insert on crm_users
  for each row execute function enforce_seat_limit();
drop trigger if exists seat_limit_upd on crm_users;
create trigger seat_limit_upd before update of active on crm_users
  for each row when (new.active is true and old.active is not true)
  execute function enforce_seat_limit();

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table accounts      enable row level security;
alter table crm_users     enable row level security;
alter table contacts      enable row level security;
alter table transactions  enable row level security;
alter table tasks         enable row level security;
alter table expenses      enable row level security;
alter table contracts     enable row level security;
alter table app_settings  enable row level security;
alter table reminder_log  enable row level security;

-- ---- accounts: everyone signed in may read it, nobody may write it from the
--      browser. Seats are sold, not self-served.
drop policy if exists accounts_read on accounts;
create policy accounts_read on accounts for select to authenticated using (crm_active());

-- ---- crm_users
--   read : leader sees everyone; an agent and a coordinator see ONLY their own
--          row. A coordinator does not get to enumerate the team either.
--   write: leader only, except that the bootstrap case (an empty table) lets the
--          first signed-in account claim the leader seat.
drop policy if exists users_read on crm_users;
create policy users_read on crm_users for select to authenticated
  using (id = auth.uid() or is_leader());

drop policy if exists users_insert on crm_users;
create policy users_insert on crm_users for insert to authenticated
  with check (is_leader() or (no_users() and id = auth.uid() and role = 'leader'));

drop policy if exists users_update on crm_users;
create policy users_update on crm_users for update to authenticated
  using (is_leader() or id = auth.uid())
  with check (
    is_leader()
    -- an agent or a coordinator may edit their own row (name, email) but NOT
    -- their role, their plan, their permissions or their section list. Nobody
    -- promotes themselves, nobody sets their own split, and nobody hands
    -- themselves a nav section the team leader did not give them. A coordinator
    -- gets exactly the same restriction an agent has — the role grants read
    -- breadth on deals, never authority over seats.
    or (id = auth.uid()
        and role = (select role from crm_users x where x.id = auth.uid())
        and plan = (select plan from crm_users x where x.id = auth.uid())
        and permissions = (select permissions from crm_users x where x.id = auth.uid())
        and sections = (select sections from crm_users x where x.id = auth.uid()))
  );

drop policy if exists users_delete on crm_users;
create policy users_delete on crm_users for delete to authenticated using (is_leader());

-- ---- contacts: own rows + the pools you are listed on. Deactivated = nothing.
--      A coordinator reads all of them — they need the parties on a deal — but
--      gets no extra WRITE breadth: they still cannot hand a contact to someone
--      else, because the with-check below is unchanged.
drop policy if exists contacts_read on contacts;
create policy contacts_read on contacts for select to authenticated
  using (crm_active() and (sees_all_deals() or owner_id = auth.uid() or (pool is not null and pool = any(my_pools()))));

drop policy if exists contacts_insert on contacts;
create policy contacts_insert on contacts for insert to authenticated
  with check (crm_active() and (is_leader() or owner_id = auth.uid() or owner_id is null));

drop policy if exists contacts_update on contacts;
create policy contacts_update on contacts for update to authenticated
  using (crm_active() and (sees_all_deals() or owner_id = auth.uid() or (pool is not null and pool = any(my_pools()))))
  -- an agent may claim a pool lead (owner becomes them) but may NOT hand a
  -- contact to somebody else.
  with check (crm_active() and (is_leader() or owner_id = auth.uid()));

drop policy if exists contacts_delete on contacts;
create policy contacts_delete on contacts for delete to authenticated
  using (crm_active() and (is_leader() or owner_id = auth.uid()));

-- ---- transactions: own only; the leader and the coordinator get all of them,
--      including write, because working the closing pipeline IS the coordinator's
--      job — they move the phase, log the deadline, mark it met.
--      NOTE, and say it out loud: salePrice, commissionRate and
--      commissionSnapshot are columns on this row. Granting the read grants
--      those columns. The app does not show a coordinator the Commission
--      section; the database cannot make that promise. ROLES.md, §coordinator.
drop policy if exists txn_read on transactions;
create policy txn_read on transactions for select to authenticated
  using (crm_active() and (sees_all_deals() or owner_id = auth.uid()));

drop policy if exists txn_write on transactions;
create policy txn_write on transactions for insert to authenticated
  with check (crm_active() and (sees_all_deals() or owner_id = auth.uid()));

drop policy if exists txn_update on transactions;
create policy txn_update on transactions for update to authenticated
  using (crm_active() and (sees_all_deals() or owner_id = auth.uid()))
  with check (crm_active() and (sees_all_deals() or owner_id = auth.uid()));

drop policy if exists txn_delete on transactions;
create policy txn_delete on transactions for delete to authenticated
  using (crm_active() and (sees_all_deals() or owner_id = auth.uid()));

-- ---- tasks: own only; leader and coordinator all. The coordinator's whole
--      working day is other people's deadlines, so a task list scoped to their
--      own rows would be an empty screen.
drop policy if exists tasks_all on tasks;
create policy tasks_all on tasks for all to authenticated
  using (crm_active() and (sees_all_deals() or user_id = auth.uid()))
  with check (crm_active() and (sees_all_deals() or user_id = auth.uid()));

-- ---- expenses: OWN ONLY, FOR EVERYONE. No is_leader() here, and NO
--      is_coordinator() here either, on purpose. This is the one policy in the
--      file with no override of any kind. §7.
--      A transaction coordinator sees exactly the rows they entered themselves,
--      the same as everybody else. "The coordinator reconciles the books" is a
--      request that gets answered by changing this line knowingly, in front of
--      the agents whose spending it exposes — not by adding a role.
drop policy if exists expenses_all on expenses;
create policy expenses_all on expenses for all to authenticated
  using (crm_active() and user_id = auth.uid())
  with check (crm_active() and user_id = auth.uid());

-- ---- contracts: the owning agent, the team leader and the coordinator, who
--      is usually the person doing the uploading. Nobody else, ever.
drop policy if exists contracts_all on contracts;
create policy contracts_all on contracts for all to authenticated
  using (crm_active() and (sees_all_deals() or owner_id = auth.uid()))
  with check (crm_active() and (sees_all_deals() or owner_id = auth.uid()));

-- ---- app_settings: everyone reads, leader writes.
drop policy if exists settings_read on app_settings;
create policy settings_read on app_settings for select to authenticated using (crm_active());

drop policy if exists settings_write on app_settings;
create policy settings_write on app_settings for insert to authenticated
  with check (is_leader() or no_users() or id = 'huddle');
drop policy if exists settings_update on app_settings;
create policy settings_update on app_settings for update to authenticated
  using (is_leader() or no_users() or id = 'huddle')
  with check (is_leader() or no_users() or id = 'huddle');

-- ---- reminder_log: nothing in the browser touches it. The cron uses the
--      service key, which bypasses RLS. No policy = no client access.

-- ============================================================================
-- Storage buckets
-- ============================================================================
insert into storage.buckets (id, name, public) values ('contracts', 'contracts', false)
  on conflict (id) do update set public = false;
insert into storage.buckets (id, name, public) values ('receipts', 'receipts', false)
  on conflict (id) do update set public = false;

-- Object keys are '<user_id>/<transaction_id>/<file>' for contracts and
-- '<user_id>/<file>' for receipts, so the first path segment is the owner.
-- The coordinator is usually the one uploading the executed contract, and they
-- have to be able to open one an agent uploaded, so they get the same breadth
-- here that contracts_all gives them on the metadata row.
drop policy if exists contracts_objects on storage.objects;
create policy contracts_objects on storage.objects for all to authenticated
  using (
    bucket_id = 'contracts' and crm_active()
    and ((storage.foldername(name))[1] = auth.uid()::text or sees_all_deals())
  )
  with check (
    bucket_id = 'contracts' and crm_active()
    and ((storage.foldername(name))[1] = auth.uid()::text or sees_all_deals())
  );

-- Receipts follow the expenses rule: own files only — team leader AND
-- coordinator included. No sees_all_deals() here. Same reason as §7.
drop policy if exists receipts_objects on storage.objects;
create policy receipts_objects on storage.objects for all to authenticated
  using (bucket_id = 'receipts' and crm_active() and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'receipts' and crm_active() and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================================
-- bootstrap
-- ============================================================================
-- 1. Create the first login in Supabase Auth (Authentication -> Users -> Add).
-- 2. Sign in to the app. With crm_users empty, no_users() is true, so the app
--    can insert your own row as the leader.
-- 3. Everything after that is done from Settings -> Team.
--
-- To promote an account by hand:
--   insert into crm_users (id, name, email, role)
--   values ('<auth uid>', 'Your Name', 'you@brokerage.com', 'leader')
--   on conflict (id) do update set role = 'leader', active = true;
--
-- Adding people is Settings -> Team: it creates the gotrue login and the
-- crm_users row together. That form is the only supported way in, because it is
-- the one that keeps the two ids in step. If "Confirm email" is ON in
-- Authentication -> Providers -> Email, the signup call returns no user id, the
-- seat cannot be linked, and the screen says so — turn it off.
--
-- Roles: 'leader' | 'agent' | 'coordinator'. To make somebody the transaction
-- coordinator by hand:
--   update crm_users set role = 'coordinator' where email = 'them@brokerage.com';
