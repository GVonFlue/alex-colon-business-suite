-- ===========================================================================
-- How many contacts have a "last contact" nobody ever made?
-- Read-only. Run before any backfill.
--
-- The CSV import stamps lastTouch = today when the file carries no last-touch
-- column, or carries one that will not parse. It also writes an activity entry
-- with kind = 'import', which is a REAL FIELD — so unlike the ProyTech version
-- of this problem, the recogniser is exact and needs no text matching.
--
-- A contact is caught only when ALL THREE hold:
--   * it has an activity entry of kind 'import'
--   * it has NO activity entry of any other kind — nothing a person did
--   * its lastTouch equals its created_at — the stamp is the import, not a touch
--
-- Grouped by source file, which is the closest thing to a batch: the batch id
-- lives only inside the import note's text, not in a field of its own.
--
-- RUN 2026-08-23. BOTH QUERIES CAME BACK EMPTY:
--
--   the batch query        zero rows — no contact carries an import activity
--   the sanity check       0, as it must be
--
-- So nothing has ever come through the CSV import on this install, and there
-- was nothing to backfill. The defect in importcsv.js was real and its blast
-- radius was zero. It is fixed in code, without a backfill, because there are
-- no affected rows — which is a different statement from "we did not check".
-- ===========================================================================
with c as (
  select id,
         data->>'lastTouch'                      as last_touch,
         data->>'created_at'                     as created_at,
         coalesce(data->'activity','[]'::jsonb)  as acts
    from contacts
),
f as (
  select c.*,
         exists (select 1 from jsonb_array_elements(acts) a where a->>'kind' =  'import') as imported,
         exists (select 1 from jsonb_array_elements(acts) a where a->>'kind' <> 'import') as human_activity,
         (select a->>'note' from jsonb_array_elements(acts) a
           where a->>'kind' = 'import' order by a->>'at' limit 1)                         as import_note
    from c
)
select
  coalesce(substring(import_note from 'Imported from (.*) on '), '(file not recorded)') as source_file,
  count(*)                                                                as imported_contacts,
  count(*) filter (where last_touch = created_at)                         as stamped_at_import,
  count(*) filter (where not human_activity)                              as never_worked_since,
  count(*) filter (where not human_activity and last_touch = created_at)  as would_be_cleared
from f
where imported
group by 1
order by imported_contacts desc;

-- ---------------------------------------------------------------------------
-- Sanity check — run this too. It must return 0. Anything else means the
-- recogniser is catching contacts that were never imported, and the backfill
-- must not run until that is understood.
-- ---------------------------------------------------------------------------
-- with c as (...same as above...), f as (...same as above...)
-- select count(*) from f where not imported and last_touch = created_at and not human_activity;
