-- ===========================================================================
-- What does "met on time" actually look like across the existing data?
-- Read-only. Run before deciding whether this belongs on a screen that ranks
-- agents against each other.
--
-- A deadline lives in transactions.data.deadlines[] and carries:
--   date      when it is due
--   status    'open' | 'met' | 'waived'
--   statusAt  when somebody CLICKED met or waived
--   statusBy  who clicked
--
-- THE CAVEAT THAT MATTERS MOST, and the reason this is a measurement rather
-- than a metric: statusAt is when the CRM was updated, not when the thing
-- happened. An inspection marked met three days late might mean the inspection
-- ran late, or it might mean the agent updated the file on Monday. Those are
-- very different facts about a person, and the data cannot tell them apart.
--
-- So read `late_days` below as "how far behind the paperwork ran", not as "how
-- late the agent was". If most of the lateness is one or two days, it is
-- probably admin lag and this is not a performance metric at all.
--
-- WAIVED is the other unknown. Nothing in the app explains what it means here
-- — whether it is "this clause did not apply", "we agreed to skip it", or a
-- way to clear a row that should never have existed. Its rate per agent is
-- broken out separately for exactly that reason: a high waive rate could be
-- good practice or could be someone tidying their board.
-- ===========================================================================

with d as (
  select t.id                              as txn_id,
         t.owner_id,
         t.data->>'address'                as address,
         dl->>'label'                      as label,
         dl->>'date'                       as due,
         coalesce(dl->>'status','open')    as status,
         dl->>'statusAt'                   as status_at,
         dl->>'statusBy'                   as status_by
    from transactions t
    left join lateral jsonb_array_elements(coalesce(t.data->'deadlines','[]'::jsonb)) dl on true
   where dl is not null
),
scored as (
  select d.*,
         case when status = 'met' and due ~ '^\d{4}-\d{2}-\d{2}$' and status_at is not null
              then (substring(status_at from 1 for 10))::date - due::date end as late_days
    from d
)
select
  count(*)                                                    as deadlines_total,
  count(*) filter (where status = 'open')                     as still_open,
  count(*) filter (where status = 'met')                      as met,
  count(*) filter (where status = 'waived')                   as waived,
  -- of the met ones, how many were stamped on or before the due date
  count(*) filter (where late_days is not null and late_days <= 0)  as met_on_or_before,
  count(*) filter (where late_days is not null and late_days > 0)   as met_after,
  count(*) filter (where status = 'met' and late_days is null)      as met_but_undated,
  round(avg(late_days) filter (where late_days > 0), 1)       as avg_days_late_when_late,
  max(late_days)                                              as worst_days_late
from scored;

-- ---------------------------------------------------------------------------
-- PER AGENT. This is the shape the scorecard column would take, so look at it
-- before agreeing to the column. If the counts per agent are in single digits,
-- a percentage will swing wildly on one deadline and should not be ranked on.
-- ---------------------------------------------------------------------------
-- with d as (...), scored as (...)
-- select coalesce(u.name, s.owner_id::text, '(unassigned)') as agent,
--        count(*)                                                   as deadlines,
--        count(*) filter (where s.status = 'met')                    as met,
--        count(*) filter (where s.late_days is not null and s.late_days <= 0) as on_time,
--        count(*) filter (where s.status = 'waived')                 as waived,
--        round(100.0 * count(*) filter (where s.late_days is not null and s.late_days <= 0)
--              / nullif(count(*) filter (where s.status = 'met'), 0), 1) as on_time_pct
--   from scored s
--   left join crm_users u on u.id = s.owner_id
--  group by 1 order by deadlines desc;

-- ---------------------------------------------------------------------------
-- Is statusAt admin lag or real lateness? This splits the late ones by HOW
-- late. A pile at 1-2 days is paperwork; a spread into weeks is not.
-- ---------------------------------------------------------------------------
-- with d as (...), scored as (...)
-- select late_days, count(*) from scored where late_days > 0 group by 1 order by 1;
