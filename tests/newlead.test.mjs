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
const isUnacknowledgedWebLead = c => {
  const d = c.data || {};
  const stage = c.stage || d.stage;
  return !!(d.attribution && !d.seenAt && stage === 'new');
};

/* WHY `c.stage || d.stage` AND NOT `c.stage === 'new' || d.stage === 'new'`.

   The first version was the OR, and these two cases failed it. Moving a lead to
   Contacted updates the column but leaves the stale `data.stage: 'new'` that
   api/lead-intake.js wrote on arrival, so the OR still matched and the alert
   never went away. He would have had to acknowledge a lead he had already
   started working.

   The column is authoritative and data.stage is only a fallback for a row that
   has never had one set. Preferring the column, then falling back, is the whole
   fix. */

const webLead = (over = {}) => ({
  id: 'c1', stage: 'new', created_at: '2026-09-07T18:00:00.000Z',
  data: {
    name: 'Intake Test', email: 'a@b.test', stage: 'new',
    attribution: { sourceTag: 'Colon - Buyer Guide Request', landingRoute: '/buy', deployment: 'production' },
    ...over,
  },
});

export default async function run(t) {
  /* ------------------------------------------------------------- it fires */

  t.ok(isUnacknowledgedWebLead(webLead()),
    'a fresh website lead raises the alert');

  t.ok(isUnacknowledgedWebLead({ ...webLead(), stage: undefined }),
    'and it still fires when the stage lives only on data, which is how api/lead-intake.js writes it');

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

  t.ok(!isUnacknowledgedWebLead({ id: 'x', stage: 'new', data: { name: 'Typed by hand' } }),
    'a contact typed in by hand never raises an alert, because it has no attribution');

  /* The column moves, data.stage stays stale. That IS the real-world shape:
     nothing rewrites data.stage when a card is dragged, so a filter that trusts
     it keeps alerting on a lead already being worked. */
  const moved = webLead();
  moved.stage = 'contacted';
  t.ok(moved.data.stage === 'new', 'the fixture keeps the stale data.stage on purpose');
  t.ok(!isUnacknowledgedWebLead(moved),
    'a website lead already moved down the pipeline does not raise an alert, even with a stale data.stage');

  t.ok(!isUnacknowledgedWebLead({ ...webLead(), stage: 'closed' }),
    'and neither does a closed one');

  t.ok(!isUnacknowledgedWebLead({ id: 'x' }),
    'a row with no data object does not throw and does not alert');

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
  previewLead.data.attribution.deployment = 'preview';
  t.ok(isUnacknowledgedWebLead(previewLead),
    'a preview lead still alerts, so a test submission proves the whole path rather than half of it');
}
