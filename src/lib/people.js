/* ============================================================================
   people.js — headshots for named seats.

   Why a lookup instead of hard-coding one <img> into the sidebar: the sidebar
   footer renders whoever is SIGNED IN, not the owner of the install. Painting
   one face there unconditionally would put Jeff's headshot on every agent's
   screen, and on the demo's "View as" switcher. So: an explicit map, an
   initials fallback, and one deliberate escape hatch for the owner seat.

   Match order:
     1. email        — exact, lowercased. The reliable one.
     2. name         — lowercased, punctuation and spacing normalised.
     3. leader seat  — see OWNER_PHOTO_ON_LEADER below.
     4. null         — the caller falls back to initials.

   TO ADD SOMEONE: drop the square JPG in /public/brand and add one line to
   BY_EMAIL (preferred) or BY_NAME. Images should be square and at least
   240x240; they are rendered as a circle with object-fit:cover.
   ========================================================================== */

const JEFF = '/brand/jeff-schnell.jpg';

/* Preferred: keyed on the Supabase Auth email, which cannot be typo'd into a
   different person the way a display name can. Add Jeff's real login here as
   soon as his seat exists and the name matches below become belt-and-braces. */
export const BY_EMAIL = {
  'jeff@dwellwichita.com': JEFF,
  'jeff@dwellwichita.test': JEFF,
};

/* Fallback: display name. Spelling variants are listed on purpose — the seat
   record is typed by a human and "Schell" is the common miss. */
export const BY_NAME = {
  'jeff schnell': JEFF,
  'jeff schell': JEFF,
  'jeffrey schnell': JEFF,
  'jeff schnell jr': JEFF,
};

/* This is a single-brokerage install and the leader seat is Jeff's. Rather than
   depend on his display name being spelled the way we guessed, whoever holds
   the leader seat gets the owner headshot.

   Set this to false the day Dwell has a second leader, or the day you would
   rather the photo appear ONLY for an exact email match above. */
export const OWNER_PHOTO_ON_LEADER = true;
export const OWNER_PHOTO = JEFF;

const norm = s => String(s || '')
  .toLowerCase()
  .replace(/[.,'’]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

/**
 * The headshot URL for a seat, or null if there isn't one.
 * @param {{email?:string,name?:string,role?:string}|null} u a crm_users row
 * @returns {string|null}
 */
export function photoOf(u) {
  if (!u) return null;
  const email = String(u.email || '').toLowerCase().trim();
  if (email && BY_EMAIL[email]) return BY_EMAIL[email];

  const name = norm(u.name);
  if (name && BY_NAME[name]) return BY_NAME[name];

  if (OWNER_PHOTO_ON_LEADER && u.role === 'leader') return OWNER_PHOTO;
  return null;
}

export default photoOf;
