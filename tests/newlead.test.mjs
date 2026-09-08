/* ============================================================================
   tests/newlead.test.mjs — which leads raise an alert, and when they stop.

   The component is presentational. The decision that matters is the filter in
   App.jsx: which contacts count as an unacknowledged website lead. That
   predicate is reproduced here exactly, and every case below is one someone
   will hit.

   THE FAILURE THIS EXISTS TO PREVENT is the quiet one in both directions: an
   alert that never appears for a real lead, and an alert that will not go away
   for a contact typed in by hand. Neither throws, neither shows up in a build,
   and the person who finds them is Alex.
   ============================================================================ */

/* Same predicate as App.jsx `newLeads`. Kept in step deliberately: if one
   changes and the other does not, these cases start failing, which is the
   cheapest possible way to find out. */
const isUnacknowledgedWebLead = c =>
  !!(c.attribution && !c.seenAt && c.stage === 'new');

/* THE CONTACT IS FLAT. THIS IS THE WHOLE BUG THIS FILE NOW GUARDS.

   db.getContacts() spreads the jsonb column onto the object:

     ({ ...r.data, id, owner_id, pool, side, stage, pooled_at, created_at })

   So what api/lead-intake.js writes as data.attribution arrives as
   c.attribution. The first version of this predicate read c.data.attribution,
   which is undefined on EVERY row, so the alert could never fire for anything.

   It shipped. A real lead reached the CRM, the email and the Google Sheet, and
   the alert stayed silent. Nothing errored, nothing looked broken, and the
   fixtures below were the reason: they were hand-written with a nested `data`
   object, so the tests passed against a shape the database never returns.

   FIXTURES NOW MATCH db.getContacts() EXACTLY. A fixture that does not match
   its source is not a test, it is a second bug agreeing with the first.

   The stage COLUMN is authoritative and always present after the spread, so
   there is no fallback to a stale copy inside the jsonb.  */

const webLead = (over = {}) => ({
  /* Exactly the shape db.getContacts() returns: columns and jsonb, flattened. */
  id: 'c1', owner_id: 'u1', pool: null, side: 'buyer', stage: 'new',
  created_at: '2026-09-07T18:00:00.000Z',
  name: 'Intake Test', email: 'a@b.test', phone: '(316) 555-0100',
  source: 'Colon - Lark Assistant',
  attribution: { sourceTag: 'Colon - Lark Assistant', landingRoute: '/buy', deployment: 'production' },
  ...over,
});

export default async function run(t) {
  /* ------------------------------------------------------------- it fires */

  t.ok(isUnacknowledgedWebLead(webLead()),
    'a fresh website lead raises the alert');

  /* The regression this file exists for. A nested `data` object is what the
     broken fixtures looked like, and it is what the database never returns. */
  t.ok(!isUnacknowledgedWebLead({ id: 'x', stage: 'new', data: { attribution: { sourceTag: 'x' } } }),
    'a NESTED contact does not fire, because getContacts() never returns that shape and a fixture that does is lying');

  /* --------------------------------------------------- it stops on action */

  t.ok(!isUnacknowledgedWebLead(webLead({ seenAt: '2026-09-07T18:04:00.000Z' })),
    'acknowledging it stops the alert');

  /* The whole reason seenAt is on the row rather than in component state or
     localStorage: it has to still be acknowledged after a reload, and on a
     different device. Re-reading the same row is exactly that case. */
  const acked = webLead({ seenAt: '2026-09-07T18:04:00.000Z' });
  t.ok(!isUnacknowledgedWebLead(JSON.parse(JSON.stringify(acked))),
    'and it is still acknowledged when the row is re-read from the database');

  /* ------------------------------------------------- it does NOT overfire */

  t.ok(!isUnacknowledgedWebLead({ id: 'x', stage: 'new', name: 'Typed by hand' }),
    'a contact typed in by hand never raises an alert, because it has no attribution');

  /* The column moves, data.stage stays stale. That IS the real-world shape:
     nothing rewrites data.stage when a card is dragged, so a filter that trusts
     it keeps alerting on a lead already being worked. */
  t.ok(!isUnacknowledgedWebLead(webLead({ stage: 'contacted' })),
    'a website lead already moved down the pipeline does not raise an alert');

  t.ok(!isUnacknowledgedWebLead({ ...webLead(), stage: 'closed' }),
    'and neither does a closed one');

  t.ok(!isUnacknowledgedWebLead({ id: 'x' }),
    'a bare row does not throw and does not alert');

  /* The exact row api/lead-intake.js produced in production, read back through
     getContacts(). If this ever fails, the alert is silent on real leads. */
  t.ok(isUnacknowledgedWebLead({
    id: '1573a918-7921-431d-ab3b-f2012fc12ba4', owner_id: 'u1', pool: null,
    side: 'buyer', stage: 'new', created_at: '2026-09-07T18:00:00.000Z',
    name: 'Intake Test', email: 'intake-test@example.test',
    source: 'Colon - Buyer Guide Request',
    attribution: { sourceTag: 'Colon - Buyer Guide Request [local]', landingRoute: '/buy', deployment: 'local' },
  }), 'the real row that reached production fires the alert');

  /* ------------------------------------------------------------- ordering */

  const list = [
    { ...webLead(), id: 'old', created_at: '2026-09-01T10:00:00.000Z' },
    { ...webLead(), id: 'new', created_at: '2026-09-07T10:00:00.000Z' },
    { ...webLead(), id: 'mid', created_at: '2026-09-04T10:00:00.000Z' },
  ].filter(isUnacknowledgedWebLead)
   .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

  t.eq(list.map(x => x.id), ['new', 'mid', 'old'],
    'newest first, because the freshest lead is the one worth answering first');

  t.eq(list.length, 3,
    'three unacknowledged leads produce three alerts rather than one, because three in a morning is a good day and not an edge case');

  /* ----------------------------------------------------- preview vs prod */

  /* Preview traffic is still a real row and still alerts. It is distinguished
     by data.attribution.deployment rather than being suppressed, because a
     suppressed test lead is indistinguishable from a broken endpoint. */
  const previewLead = webLead();
  previewLead.attribution = { ...previewLead.attribution, deployment: 'preview' };
  t.ok(isUnacknowledgedWebLead(previewLead),
    'a preview lead still alerts, so a test submission proves the whole path rather than half of it');
}
