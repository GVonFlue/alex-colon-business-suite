/* ============================================================================
   src/lib/velocity.js — how long things take.

   Alex asked for this by name: "Track time between important stages... I
   especially want first-response time tracked because speed-to-lead matters."

   PURE FUNCTIONS, NO REACT, NO DATABASE. Everything here takes a contact and
   returns a number of hours or days, so it can be tested without mounting
   anything and so the Dashboard, the Assistant and any future report all get
   the same answer from the same place. Two screens computing "days to close"
   two different ways is how a CRM starts disagreeing with itself.

   WHERE THE DATA COMES FROM. Nothing new is recorded. Every contact already
   carries `created_at` and an `activity` array where each entry has an `at`
   and a `kind`, and api/lead-intake.js writes the arrival note the moment a
   website lead lands. So these are derivable for leads that already exist,
   with no migration and no backfill.

   WHAT IS DELIBERATELY NOT HERE. No averages over stages a contact has not
   reached yet, no imputing a missing timestamp from a neighbouring one, and no
   default when a thing genuinely has not happened. Every function returns null
   rather than a guess, and the callers below render null as "—" rather than as
   zero. A zero in a speed-to-lead report means "answered instantly", which is
   the opposite of "never answered", and that is not a distinction worth
   getting wrong.
   ============================================================================ */

const MS_HOUR = 36e5;
const MS_DAY = 864e5;

const time = v => {
  const t = new Date(v || 0).getTime();
  return Number.isFinite(t) && t > 0 ? t : null;
};

/** Activity entries, oldest first, with a usable timestamp. */
function timeline(c) {
  return (c?.activity || [])
    .filter(a => time(a?.at))
    .sort((a, b) => time(a.at) - time(b.at));
}

/*
 * A real outbound contact attempt. Notes do not count.
 *
 * This is the distinction the whole metric rests on. api/lead-intake.js writes
 * a note the instant a website lead arrives, and if a note counted as a
 * response then every website lead would show a first-response time of zero
 * seconds and the number would be worthless — it would measure how fast the
 * webhook fired, not how fast Alex called.
 */
const REACHED_OUT = new Set(['call', 'text', 'email', 'meeting']);

/**
 * Hours from a lead arriving to the first time somebody actually reached out.
 *
 * Null when nobody has yet, which is a different fact from "quickly" and is
 * rendered differently.
 */
export function firstResponseHours(c) {
  const created = time(c?.created_at);
  if (!created) return null;
  const first = timeline(c).find(a => REACHED_OUT.has(a.kind));
  if (!first) return null;
  const hrs = (time(first.at) - created) / MS_HOUR;
  /* Clamped at zero rather than dropped. A contact typed in by hand and logged
     in the same minute can produce a small negative from clock skew between
     the browser and Postgres; that is noise, not a lead answered before it
     existed. */
  return Math.max(hrs, 0);
}

/** Hours to the first two-way conversation: a call or a meeting, not a text blast. */
export function timeToConversationHours(c) {
  const created = time(c?.created_at);
  if (!created) return null;
  const first = timeline(c).find(a => a.kind === 'call' || a.kind === 'meeting');
  if (!first) return null;
  return Math.max((time(first.at) - created) / MS_HOUR, 0);
}

/** Days from the lead arriving to the first appointment being booked. */
export function daysToAppointment(c) {
  const created = time(c?.created_at);
  if (!created) return null;
  const appt = (c?.appointments || [])
    .filter(a => time(a?.at))
    .sort((a, b) => time(a.at) - time(b.at))[0];
  if (!appt) return null;
  return Math.max((time(appt.at) - created) / MS_DAY, 0);
}

/**
 * A contact still waiting for its first outbound attempt, and for how long.
 *
 * This is the working version of the metric. An average first-response time
 * across last quarter is a report; "these three have been sitting since
 * Tuesday" is something to do this morning.
 */
export function awaitingFirstResponse(contacts, nowMs = Date.now()) {
  return (contacts || [])
    .filter(c => {
      const created = time(c?.created_at);
      if (!created) return false;
      if (firstResponseHours(c) !== null) return false;      // already answered
      const st = String(c?.stage || '');
      return st !== 'lost' && st !== 'contract';             // not still owed a call
    })
    .map(c => ({ contact: c, waitingHours: (nowMs - time(c.created_at)) / MS_HOUR }))
    .sort((a, b) => b.waitingHours - a.waitingHours);
}

/**
 * The median, not the mean.
 *
 * One lead that sat for three weeks over a holiday drags a mean far enough to
 * make a good month look bad, and the number Alex would act on is the typical
 * one. Median is the honest summary of a small, skewed set.
 */
export function medianFirstResponseHours(contacts) {
  const vals = (contacts || [])
    .map(firstResponseHours)
    .filter(v => v !== null)
    .sort((a, b) => a - b);
  if (!vals.length) return null;
  const mid = Math.floor(vals.length / 2);
  return vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
}

/** "18 minutes", "4 hours", "2 days". Null renders as an em dash, never as 0. */
export function humanHours(h) {
  if (h === null || h === undefined || !Number.isFinite(h)) return '—';
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.round(h)} hr`;
  return `${Math.round(h / 24)} days`;
}

/**
 * Median days from a transaction's effective date to its close date.
 *
 * Only closed transactions count. Including live ones would measure how long
 * deals have been open rather than how long they take, and the answer would
 * fall every time a new one is written.
 */
export function medianDaysToClose(transactions) {
  const vals = (transactions || [])
    .map(t => {
      const a = time(t?.effective_date ?? t?.effectiveDate);
      const b = time(t?.close_date ?? t?.closeDate);
      if (!a || !b || String(t?.status || '') !== 'closed') return null;
      return (b - a) / MS_DAY;
    })
    .filter(v => v !== null && v >= 0)
    .sort((a, b) => a - b);
  if (!vals.length) return null;
  const mid = Math.floor(vals.length / 2);
  return Math.round(vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2);
}

/**
 * Where leads fall out, grouped by the reason recorded at the time.
 *
 * Contacts on a lost stage with no reason are counted separately rather than
 * bucketed as "Other". "Other" is a reason somebody chose; blank is a reason
 * nobody recorded, and telling Alex he has fourteen Others when he has
 * fourteen blanks would send him looking for a pattern that is not there.
 */
export function lostReasonBreakdown(contacts, stages) {
  const lostKeys = new Set((stages || []).filter(s => s.lost).map(s => s.key));
  const out = new Map();
  let unrecorded = 0;
  for (const c of contacts || []) {
    if (!lostKeys.has(String(c?.stage || ''))) continue;
    const r = String(c?.lostReason || '').trim();
    if (!r) { unrecorded += 1; continue; }
    out.set(r, (out.get(r) || 0) + 1);
  }
  return {
    rows: [...out.entries()].map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
    unrecorded,
    total: [...out.values()].reduce((a, b) => a + b, 0) + unrecorded,
  };
}
