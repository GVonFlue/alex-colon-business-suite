/* ============================================================================
   activity.js — what happened, and the narrower question of what somebody did.

   TWO VIEWS, ONE DEFINITION. "Everything that happened" and "what I
   accomplished today" are not the same list, and building them as two screens
   would give them two definitions of what counts. They are one stream with two
   filters, and the accomplishment one is the restrictive one.

   THE MACHINE-NOTE PROBLEM, AGAIN.
   ProyTech spent a day learning that a note the app wrote about itself reads as
   human contact, and that a hand-maintained list of prefixes goes stale the
   moment somebody adds a writer. Dwell has the same problem in a smaller and
   sharper form:

     kind: 'import'   honest — the kind itself says a machine did it
     Contracts.jsx    writes kind: 'note' with "Created from a contract
                      upload." — a MACHINE NOTE WEARING A HUMAN KIND, which is
                      exactly the shape that cost ProyTech a day

   So the classifier reads the kind first and falls back to a text list for the
   liars. tests/activity.test.mjs scans the source for every writer of an
   activity entry and fails the build when one appears that is classified
   neither way — the list cannot go stale silently, because the test maintains
   the question rather than the answer.
   ========================================================================== */

/* Kinds a machine writes. The kind is honest here, so no text matching is
   needed and none is done. */
export const MACHINE_KINDS = ['import'];

/* Machine notes wearing a human kind. One entry today; the source scan is what
   stops it being one entry tomorrow while a second writer exists. */
export const MACHINE_NOTES = [
  'Created from a contract upload.',
];

/* Kinds that represent a person doing something to a relationship. A task
   completion is folded in separately — it is not stored on the contact. */
export const DOING_KINDS = ['call', 'appointment', 'note', 'feedback', 'text', 'email'];

export const isMachineEntry = a => {
  if (!a) return false;
  if (MACHINE_KINDS.includes(a.kind)) return true;
  const note = String(a.note || '');
  return MACHINE_NOTES.some(p => note.startsWith(p));
};

/** Did a PERSON do this? The question the accomplishment view asks.
 *  A machine entry is never an accomplishment, whatever kind it wears. */
export const isAccomplishment = a => !!a && !isMachineEntry(a) && DOING_KINDS.includes(a.kind);

/* ---------------------------------------------------------------- the stream */

const arr = v => (Array.isArray(v) ? v : []);
const day = s => String(s || '').slice(0, 10);

/** One stream across contacts and tasks.
 *
 *  Transactions deliberately contribute NOTHING here. They have no activity
 *  array — their history is the deadline list and the phase — and a deadline
 *  coming due is not something a person did. Folding them in would mix a
 *  contract clause with somebody's phone call, which is the merge that makes
 *  "what happened" useless for answering "what did I get done".
 *
 *  `preset` is 'all' (everything that happened) or 'done' (what a person did).
 */
export function buildStream(opts = {}) {
  const { contacts = [], tasks = [], preset = 'all', who = '', from = '', to = '' } = opts;
  const out = [];

  for (const c of arr(contacts)) {
    for (const a of arr(c && c.activity)) {
      if (!a || !a.at) continue;
      if (preset === 'done' && !isAccomplishment(a)) continue;
      out.push({
        id: a.id, at: a.at, day: day(a.at), kind: a.kind || 'note',
        note: a.note || '', by: a.by || null,
        contactId: c.id, contactName: c.name || '',
        machine: isMachineEntry(a),
      });
    }
  }

  /* A finished task is an accomplishment and belongs in both views — it is the
     one thing in "what I got done" that is not stored on a contact. */
  for (const t of arr(tasks)) {
    if (!t || !t.done || !t.doneAt) continue;
    out.push({
      id: t.id, at: t.doneAt, day: day(t.doneAt), kind: 'task',
      note: t.title || '', by: t.user_id || null,
      contactId: t.contact_id || null, contactName: '',
      transactionId: t.transaction_id || null,
      machine: false,
    });
  }

  const filtered = out.filter(e => {
    if (who && String(e.by || '') !== String(who)) return false;
    if (from && e.day < from) return false;
    if (to && e.day > to) return false;
    return true;
  });
  return filtered.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

/** Group a stream by day, newest first, for rendering. */
export function byDay(stream) {
  const m = new Map();
  for (const e of arr(stream)) {
    if (!m.has(e.day)) m.set(e.day, []);
    m.get(e.day).push(e);
  }
  return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}
