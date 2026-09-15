/* ============================================================================
   src/lib/areas.js — areas of interest, whatever shape they arrived in.

   Lives here rather than in Contacts.jsx because it is data normalisation, not
   UI, and because a .jsx file cannot be imported by the test runner.

   THE BUG IT EXISTS FOR. The contact drawer did `(d.areas || []).map(...)`,
   which guards null and nothing else. A contact whose areas arrived as a
   STRING — "Maize, Goddard", which is what a SQL seed wrote and what any CSV
   import would write — hits .map on a string, throws, and React unmounts the
   whole tree. A blank white page, on some contacts and not others, with a
   green build and a passing suite.

   Splitting on commas is the reading somebody meant in every case where a
   string has actually turned up.
   ============================================================================ */

export function areaList(v) {
  if (Array.isArray(v)) return v.filter(Boolean);
  if (typeof v === 'string') return v.split(',').map(s => s.trim()).filter(Boolean);
  return [];
}
