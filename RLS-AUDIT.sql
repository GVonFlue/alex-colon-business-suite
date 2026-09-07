-- ============================================================================
-- Whole-database RLS audit
--
-- Ported from GVonFlue/proytech-crm, where it was written after the incident
-- below. The SQL is schema-agnostic on purpose: it reads pg_class, pg_policy
-- and pg_roles and names no table of its own, so it runs unmodified against any
-- install's Supabase.
--
-- Paste this into the Supabase SQL Editor and run it. It changes NOTHING. It
-- reads every policy on every table in `public` and tells you which tables are
-- open, by name.
--
-- Run it after any migration, before any release, and on every customer install
-- before handing it over.
--
-- ---------------------------------------------------------------------------
-- WHY THIS FILE EXISTS
--
-- Twice in one day this database was found wide open by a check that had
-- always passed.
--
--   23 Aug 2026, eight content tables: RLS on, one policy each, expression
--   `true`. Every authenticated session had full read/write/delete on pricing,
--   unpublished marketing and the AI spend ledger.
--
--   23 Aug 2026, `leads`: FIVE CORRECT POLICIES plus one leftover called
--   `leads_all_authenticated` with `using = true` and `with check = true`.
--   Permissive policies are OR'd, so the leftover won and every authenticated
--   session could read and write every lead in the business.
--
-- The second one is the important one, and it is why "read the expression" is
-- not a strong enough rule on its own.
--
--   Counting policies on `leads` returned SIX. Reading the five correct ones —
--   which is what a careful person does, because they are the ones with
--   sensible names — returned five correct answers. The table was still open.
--
--   PERMISSIVE POLICIES ARE GRANTS, AND THEY OR TOGETHER. The WEAKEST policy
--   on a table decides what that table allows. Nothing else about the table
--   matters. Five perfect policies plus one `true` is a table with no security
--   at all, and it looks healthier than a table with one policy.
--
-- So the rule is: read EVERY policy on the table, and confirm that NONE of them
-- is permissive-and-true. That is what this file does, for every table, without
-- anyone having to remember which tables matter.
-- ============================================================================


-- ============================================================================
-- 1. THE REPORT — every table, every policy, worst case first
--
-- `verdict` is what to read. Anything that is not OK needs an answer.
-- ============================================================================

with pol as (
  select
    c.oid                                        as reloid,
    c.relname                                    as tbl,
    c.relrowsecurity                             as rls_on,
    p.polname                                    as policy,
    p.polpermissive                              as permissive,
    case p.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT'
                  when 'w' then 'UPDATE' when 'd' then 'DELETE'
                  else 'ALL' end                 as cmd,
    case when p.polroles = '{0}'::oid[] then 'PUBLIC'
         else array_to_string(array(
                select r.rolname from pg_roles r where r.oid = any (p.polroles)), ', ')
    end                                          as roles,
    pg_get_expr(p.polqual,      p.polrelid)      as using_expr,
    pg_get_expr(p.polwithcheck, p.polrelid)      as with_check_expr
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_policy p on p.polrelid = c.oid
  where n.nspname = 'public'
    and c.relkind = 'r'
),
judged as (
  select pol.*,
    -- A permissive policy whose USING is literally `true` grants unrestricted
    -- read (and, on ALL/UPDATE/DELETE, unrestricted write) to whoever it names.
    --
    -- NULL is handled by command, and this distinction matters: an INSERT
    -- policy has no USING clause at all, so NULL there is NORMAL and must not
    -- be reported. A NULL USING on SELECT/UPDATE/DELETE/ALL is not normal.
    (
      permissive
      and cmd <> 'INSERT'
      and coalesce(using_expr, 'true') = 'true'
    ) as open_read,
    (
      permissive
      and cmd in ('ALL','INSERT','UPDATE')
      and coalesce(with_check_expr, 'true') = 'true'
      and with_check_expr is not null          -- absent is not the same as `true`
    ) as open_write
  from pol
)
select
  tbl                       as table_name,
  rls_on,
  coalesce(policy, '(none)') as policy,
  cmd,
  roles,
  case when permissive then 'permissive' else 'restrictive' end as kind,
  coalesce(using_expr,      '(none)')  as using_expr,
  coalesce(with_check_expr, '(none)')  as with_check_expr,
  case
    when policy is null and rls_on
      then 'RLS ON, NO POLICY — denies everything. Safe, but probably a mistake.'
    when policy is null and not rls_on
      then '>>> WIDE OPEN — RLS is OFF and there is no policy at all.'
    when not rls_on
      then '>>> WIDE OPEN — RLS is OFF, so this policy enforces nothing.'
    when open_read and open_write
      then '>>> WIDE OPEN — permissive, using=true AND with check=true.'
    when open_read
      then '>>> OPEN TO READ — permissive policy with using=true.'
    when open_write
      then '>>> OPEN TO WRITE — permissive policy with with check=true.'
    else 'OK'
  end as verdict
from judged
order by
  (case
     when not rls_on then 0
     when open_read or open_write then 0
     when policy is null then 1
     else 2
   end),
  tbl, policy;


-- ============================================================================
-- 2. THE VERDICT — raises if anything in `public` is open
--
-- Section 1 is for reading. This is for deciding. It never counts a policy.
-- ============================================================================

do $$
declare
  open_tables text;
  rls_off     text;
  no_policy   text;
begin
  ------------------------------------------------- 2a. permissive `true` anywhere
  -- The shape found twice on 23 Aug 2026. ONE of these on a table overrides
  -- every correct policy beside it, because permissive policies OR.
  select string_agg(format('%s.%s (%s, to %s)', tbl, policy, cmd, roles), E'\n  '
                    order by tbl, policy)
    into open_tables
  from (
    select c.relname as tbl, p.polname as policy,
           case p.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT'
                         when 'w' then 'UPDATE' when 'd' then 'DELETE'
                         else 'ALL' end as cmd,
           case when p.polroles = '{0}'::oid[] then 'PUBLIC'
                else array_to_string(array(
                       select r.rolname from pg_roles r where r.oid = any (p.polroles)), ', ')
           end as roles
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and p.polpermissive
       and (
            (p.polcmd <> 'a' and coalesce(pg_get_expr(p.polqual, p.polrelid), 'true') = 'true')
         or (pg_get_expr(p.polwithcheck, p.polrelid) = 'true')
       )
  ) x;

  ------------------------------------------------------- 2b. RLS switched off
  -- A table with RLS off is governed only by GRANTs, and Supabase grants the
  -- anon and authenticated roles by default. Off means open.
  select string_agg(c.relname, ', ' order by c.relname) into rls_off
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

  --------------------------------------------- 2c. RLS on but no policy at all
  -- Denies everything, so it is SAFE — but it is usually a table someone meant
  -- to write a policy for. Reported, never raised.
  select string_agg(c.relname, ', ' order by c.relname) into no_policy
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
     and not exists (select 1 from pg_policy p where p.polrelid = c.oid);

  if no_policy is not null then
    raise notice 'RLS-AUDIT note: RLS on with no policy (denies all, probably unfinished): %', no_policy;
  end if;

  if rls_off is not null then
    raise exception E'RLS-AUDIT FAILED: row level security is OFF on:\n  %\nThese are governed only by GRANTs, and Supabase grants anon and authenticated by default.', rls_off;
  end if;

  if open_tables is not null then
    raise exception E'RLS-AUDIT FAILED: permissive policies with a `true` expression:\n  %\nPermissive policies OR together, so each of these overrides every correct policy on its table.', open_tables;
  end if;

  raise notice '----------------------------------------------------------------';
  raise notice 'RLS-AUDIT OK: every table in public has RLS on, and no permissive';
  raise notice 'policy anywhere evaluates to true. Read section 1 anyway — this';
  raise notice 'proves nothing is WIDE open, not that every expression is RIGHT.';
  raise notice '----------------------------------------------------------------';
end $$;


-- ============================================================================
-- 3. WHAT THIS FILE DOES NOT PROVE
--
-- It proves no table is trivially open. It does NOT prove any policy is
-- CORRECT — an expression can be non-`true` and still wrong, e.g. one that
-- checks the wrong column or the wrong role. That is what VERIFY-RLS.md is
-- for: real logins, real sentinel rows, and a measured before/after.
--
-- Nor does it say anything about the api/ routes, which use the service role
-- key and bypass RLS by design. Those are guarded by guard({ requireAuth }) and
-- guard({ requireLeader }) in api/_guard.js. RLS governs the browser, which is
-- the only thing it can govern.
--
-- SO RUN BOTH, AND IN THIS ORDER:
--
--   1. This file, first. It is fast, it needs no logins, and it answers the
--      question a behavioural check cannot: is any policy trivially open? The
--      incident above passed a careful behavioural review twice in one day.
--   2. VERIFY-RLS.md, second, with real logins for all three roles — leader,
--      agent, and the transaction coordinator. That is what proves the
--      expressions are RIGHT rather than merely non-true.
--
-- Neither substitutes for the other. This one reads what the policies SAY;
-- VERIFY-RLS.md observes what they DO.
-- ============================================================================
