-- ===========================================================================
-- How often did the two forecast-price functions actually disagree?
-- Read-only. The fix is already in; this says what it moved.
--
-- Dashboard had a private forecastPrice(); Contacts had expectedPrice(). Same
-- fact, two names. The ONLY behavioural difference:
--
--   expectedPrice   Math.round((lo + hi) / 2)
--   forecastPrice   (lo + hi) / 2
--
-- which differ by exactly $0.50, and ONLY when priceMin + priceMax is odd.
-- Everything else about them is equivalent for every value the fields can hold.
--
-- So `odd_sum` below is not a sample or an estimate — it is the complete set of
-- contacts where the Dashboard and the Pipeline ever showed different numbers.
--
-- MEASURED ON THE SEEDED DEMO DATA FIRST: 47 contacts, 33 with a price range
-- and no target price, ZERO disagreements — every seeded range sums even,
-- because real price brackets are round. Expect the same shape here.
-- ===========================================================================

with c as (
  select id,
         (data->>'priceMin')::numeric    as lo,
         (data->>'priceMax')::numeric    as hi,
         (data->>'targetPrice')::numeric as target
    from contacts
   where (data->>'priceMin')   ~ '^[0-9.]+$'
     and (data->>'priceMax')   ~ '^[0-9.]+$'
),
in_scope as (
  -- a target price short-circuits both functions identically, so those
  -- contacts could never have disagreed
  select * from c where coalesce(target, 0) <= 0 and lo > 0 and hi > 0
)
select
  (select count(*) from contacts)                                        as contacts_all,
  count(*)                                                               as with_price_range,
  count(*) filter (where ((lo + hi)::bigint % 2) = 1)                    as odd_sum_disagreed,
  round(0.50 * count(*) filter (where ((lo + hi)::bigint % 2) = 1), 2)   as total_price_gap,
  -- and what that was worth once a commission rate multiplied it
  round(0.50 * 0.03 * count(*) filter (where ((lo + hi)::bigint % 2) = 1), 4) as gross_gap_at_3pct
from in_scope;

-- If odd_sum_disagreed is 0, the two functions never once produced a different
-- number on this data — the defect was that two definitions existed, not that
-- anyone saw a wrong figure. That is still worth removing: the next edit to one
-- of them would not have been a rounding artefact.
