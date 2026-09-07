/* ============================================================================
   The CSV import does not invent a contact you never made.

   importcsv.js used to write `lastTouch: lastTouch || o.todayIso`, so a file
   with no last-contact column recorded that somebody made contact on the day
   the file was uploaded. Nobody did.

   It matters because lastTouch is not decoration. It drives the Contacts sort,
   the cold check on the dashboard and the cold sort key — so an import landed
   every new contact at the WARM end of the list and out of every "who has gone
   quiet" view, which is the exact question the field exists to answer.

   MEASURED BEFORE FIXING, on the live database: no contact carries an import
   activity at all, so nothing has ever come through this path and there was
   nothing to backfill. The defect was real and the blast radius was zero — it
   was found before Jeff's first real import rather than after.

   Pure node: importcsv.js has no imports, no DOM and no env by design.
   ========================================================================== */

import { buildContact } from '../src/components/importcsv.js';

const TODAY = '2026-08-23';
const opt = extra => ({
  byField: { name: 0, email: 1, lastTouch: 2 },
  todayIso: TODAY, dateOrder: 'mdy', sideDefault: 'buyer',
  stages: [{ key: 'new', sellerLabel: 'New Lead', buyerLabel: 'New Lead' }],
  ...extra,
});

export default async function run(t) {
  /* ---- the fix ---- */
  const noTouch = buildContact(['Dana Ruiz', 'dana@example.test', ''], opt());
  t.eq(noTouch.contact.lastTouch, null,
    'a file with no last-contact date leaves lastTouch EMPTY, not today');
  t.ok(noTouch.contact.created_at === TODAY,
    'while created_at still says today — the record is new, the relationship is not');

  /* ---- a real date is still honoured ---- */
  const withTouch = buildContact(['Sam Trilling', 'sam@example.test', '03/14/2026'], opt());
  t.eq(withTouch.contact.lastTouch, '2026-03-14', 'a real last-contact date is kept');

  /* ---- an unreadable date is empty, and SAYS so ---- */
  const bad = buildContact(['Vera Dunlop', 'vera@example.test', 'last spring'], opt());
  t.eq(bad.contact.lastTouch, null, 'a date nothing can parse leaves lastTouch empty');
  t.ok(bad.warnings.some(w => /left empty/.test(w)),
    'and the warning says it was left empty rather than set to today',
    JSON.stringify(bad.warnings));
  t.ok(!bad.warnings.some(w => /today instead/.test(w)),
    'the old wording is gone — it described behaviour that no longer happens');

  /* ---- the readers this protects ---- */
  t.ok(!noTouch.contact.lastTouch,
    'an imported contact is therefore never contacted, so it sorts cold and shows in the quiet views');
}
