/* ============================================================================
   importcsv.js — the CSV importer's brain. No React, no DOM, no env.

   Deliberately separate from ImportContacts.jsx so the parser and every mapping
   decision can be run in plain node with no bundler and no DOM. Nothing in here
   touches ctx or settings objects directly: the caller passes plain arrays
   (stages, sources, users) so the same functions work in a test with no app.

   WHAT THIS FILE REFUSES TO DO
   ----------------------------
   1. It does not split on commas. A real CSV has quoted fields with commas and
      newlines inside them ("Smith, John", every street address), doubled quotes
      as the escape, a BOM in front of the header and CRLF line endings. The
      parser below is a character state machine that handles all of it.
   2. It does not guess a date format. If a numeric date is genuinely ambiguous
      (both parts <= 12) the caller has to say which order the file is in; if a
      value will not parse the field falls back to today rather than to a
      confidently wrong day, and the row says so.
   3. It does not overwrite the client's own data. Updating an existing contact
      fills in that record's BLANK fields and touches nothing else.
   4. It does not merge two people on a name alone. Email, then phone, then
      name AND address — a book with two John Smiths in it is normal.

   Imports carry the .js extension on purpose — Vite and node both resolve that,
   which is what lets the test import this module without a bundler.
   ========================================================================== */

import { uid, phoneFmt } from '../lib/format.js';
import { dnum, fromDnum } from '../lib/dates.js';

/* ========================================================== 1. the parser */

/** the first LOGICAL line of a delimited file — quotes may contain newlines */
export function firstLine(text) {
  const s = String(text || '');
  let inQ = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQ) {
      if (ch === '"') { if (s[i + 1] === '"') { i++; continue; } inQ = false; }
      continue;
    }
    if (ch === '"') { inQ = true; continue; }
    if (ch === '\n' || ch === '\r') return s.slice(0, i);
  }
  return s;
}

export const stripBom = s => (String(s || '').charCodeAt(0) === 0xFEFF ? String(s).slice(1) : String(s || ''));

const CANDIDATES = [',', '\t', ';'];

/** count a delimiter in a line, ignoring anything inside quotes */
function countOutsideQuotes(line, d) {
  let n = 0, inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') { if (line[i + 1] === '"') { i++; continue; } inQ = false; }
      continue;
    }
    if (ch === '"') { inQ = true; continue; }
    if (ch === d) n++;
  }
  return n;
}

/** comma vs tab vs semicolon, decided by counting candidates in the header */
export function sniffDelimiter(text) {
  const line = firstLine(stripBom(text));
  let best = ',', bestN = 0;
  CANDIDATES.forEach(d => {
    const n = countOutsideQuotes(line, d);
    if (n > bestN) { best = d; bestN = n; }
  });
  return bestN > 0 ? best : ',';
}

/**
 * RFC-4180 parse. Handles quoted fields, embedded delimiters, embedded
 * newlines, doubled quotes, a UTF-8 BOM, CRLF / LF / lone CR, and ragged rows.
 *
 * Returns { delimiter, header:[], rows:[[]], ragged:[{n,cells}], blank }
 * Rows are padded to the header width so a short row never reads a neighbour's
 * value; the short ones are reported so the preview can say how many.
 */
export function parseDelimited(text, delimiter) {
  const s = stripBom(text);
  const d = delimiter || sniffDelimiter(s);
  const out = [];
  let row = [], field = '', inQ = false, quoted = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQ) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; continue; }   // doubled quote escape
        inQ = false; continue;
      }
      field += ch;
      continue;
    }
    /* a quote only opens a field at its start — that way 5'6" in the middle of
       a value stays a literal character instead of swallowing the rest of it */
    if (ch === '"' && field === '' && !quoted) { inQ = true; quoted = true; continue; }
    if (ch === d) { row.push(field); field = ''; quoted = false; continue; }
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field); out.push(row);
      row = []; field = ''; quoted = false;
      continue;
    }
    field += ch;
  }
  if (field !== '' || row.length) { row.push(field); out.push(row); }

  const isBlank = r => r.every(c => String(c).trim() === '');
  let blank = 0;
  const kept = out.filter(r => { if (isBlank(r)) { blank++; return false; } return true; });

  const header = (kept.shift() || []).map(h => String(h).trim());
  const w = header.length;
  const ragged = [];
  const rows = kept.map((r, i) => {
    if (r.length !== w) ragged.push({ n: i + 1, had: r.length, want: w });
    const padded = r.slice(0, w);
    while (padded.length < w) padded.push('');
    return padded;
  });
  return { delimiter: d, header, rows, ragged, blank };
}

/** the reverse, for the "rows that failed" download */
export function toCsv(rows) {
  const esc = v => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return (rows || []).map(r => (r || []).map(esc).join(',')).join('\r\n');
}

/* ================================================== 2. the target fields */

/* Aliases are stored ALREADY NORMALISED (lowercase, punctuation stripped), so
   "Primary E-Mail", "primary_email" and "PRIMARY EMAIL" all hit the same rule. */
export const FIELDS = [
  { key: 'name',        label: 'Full name',            aliases: ['name', 'full name', 'fullname', 'contact name', 'client name', 'contact', 'lead name', 'customer name', 'display name', 'person'] },
  { key: 'firstName',   label: 'First name',           aliases: ['first name', 'firstname', 'first', 'fname', 'given name', 'forename'] },
  { key: 'lastName',    label: 'Last name',            aliases: ['last name', 'lastname', 'last', 'lname', 'surname', 'family name'] },
  { key: 'email',       label: 'Email',                aliases: ['email', 'e mail', 'email address', 'primary email', 'email 1', 'email1', 'home email', 'work email', 'emails', 'e mail address'] },
  { key: 'phone',       label: 'Phone',                aliases: ['phone', 'mobile', 'cell', 'cell phone', 'mobile phone', 'primary phone', 'phone number', 'phone 1', 'phone1', 'home phone', 'work phone', 'telephone', 'contact number', 'mobile number'] },
  { key: 'address',     label: 'Street address',       aliases: ['address', 'street', 'street address', 'property address', 'address 1', 'address line 1', 'mailing address', 'home address', 'street 1', 'subject property'] },
  { key: 'city',        label: 'City',                 aliases: ['city', 'town', 'property city', 'mailing city'] },
  { key: 'state',       label: 'State',                aliases: ['state', 'province', 'state province', 'region', 'property state'] },
  { key: 'zip',         label: 'ZIP / postal code',    aliases: ['zip', 'zip code', 'zipcode', 'postal code', 'postcode', 'postal', 'property zip'] },
  { key: 'source',      label: 'Lead source',          aliases: ['source', 'lead source', 'origin', 'lead origin', 'referral source', 'how they found us', 'how did you hear about us', 'channel', 'source of lead'] },
  { key: 'stage',       label: 'Stage',                aliases: ['stage', 'status', 'lead status', 'lead stage', 'pipeline stage', 'deal stage', 'contact status', 'sales stage', 'current stage'] },
  { key: 'side',        label: 'Side — buyer / seller', aliases: ['side', 'type', 'contact type', 'lead type', 'client type', 'buyer or seller', 'buyer seller', 'buyer selle', 'represents', 'representing', 'role', 'category'] },
  { key: 'price',       label: 'Price / budget (one column)', aliases: ['price', 'budget', 'price range', 'budget range', 'price point', 'purchase price', 'price band'] },
  { key: 'priceMin',    label: 'Price — minimum',      aliases: ['price min', 'min price', 'budget min', 'min budget', 'price from', 'price low', 'low price', 'minimum price', 'price range min'] },
  { key: 'priceMax',    label: 'Price — maximum',      aliases: ['price max', 'max price', 'budget max', 'max budget', 'price to', 'price high', 'high price', 'maximum price', 'price range max'] },
  { key: 'targetPrice', label: 'Target / list price',  aliases: ['list price', 'target price', 'asking price', 'target list price', 'listing price', 'sale price'] },
  { key: 'notes',       label: 'Notes',                aliases: ['notes', 'note', 'comments', 'comment', 'background', 'description', 'remarks', 'details', 'memo', 'summary'] },
  { key: 'created',     label: 'Created / date added', aliases: ['created', 'created at', 'created date', 'created on', 'date added', 'added', 'added on', 'date created', 'entry date', 'lead date', 'date', 'inquiry date'] },
  { key: 'lastTouch',   label: 'Last contact',         aliases: ['last contact', 'last touch', 'last touched', 'last activity', 'last contacted', 'last call', 'last communication', 'last contact date', 'last activity date'] },
  { key: 'tags',        label: 'Tags',                 aliases: ['tags', 'tag', 'labels', 'label', 'groups', 'group', 'lists', 'categories'] },
  { key: 'agent',       label: 'Assigned agent',       aliases: ['agent', 'assigned to', 'assigned', 'owner', 'assigned agent', 'agent name', 'account owner', 'listing agent', 'responsible'] },
  { key: 'timeline',    label: 'Timeline',             aliases: ['timeline', 'time frame', 'timeframe', 'when', 'buying timeline', 'move timeline', 'time horizon'] },
  { key: 'preapproval', label: 'Pre-approval',         aliases: ['preapproval', 'pre approval', 'pre approved', 'preapproved', 'pre approval status', 'financing status', 'prequalified'] },
  { key: 'lender',      label: 'Lender',               aliases: ['lender', 'mortgage lender', 'lending partner', 'loan officer'] },
  { key: 'propertyType', label: 'Property type',       aliases: ['property type', 'home type', 'type of property', 'property style'] },
  { key: 'beds',        label: 'Beds',                 aliases: ['beds', 'bedrooms', 'bed', 'br', 'number of bedrooms'] },
  { key: 'baths',       label: 'Baths',                aliases: ['baths', 'bathrooms', 'bath', 'ba', 'number of bathrooms'] },
  { key: 'areas',       label: 'Areas of interest',    aliases: ['areas', 'area', 'areas of interest', 'neighborhood', 'neighbourhood', 'preferred areas', 'subdivision', 'farm area'] },
];

export const FIELD_BY_KEY = FIELDS.reduce((m, f) => { m[f.key] = f; return m; }, {});
export const IGNORE = '';

/** lowercase, punctuation and separators to single spaces */
export const normHeader = s => String(s == null ? '' : s)
  .toLowerCase()
  .replace(/[‘’“”]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

/**
 * Guess a field for one header. Exact alias match first (so "Property Type"
 * beats the "type" alias on side), then the longest alias that appears as a
 * whole phrase in the header, so "Client Email Address" still lands on email.
 */
export function guessField(header) {
  const h = normHeader(header);
  if (!h) return IGNORE;
  for (const f of FIELDS) if (f.aliases.indexOf(h) !== -1) return f.key;

  let best = IGNORE, bestLen = 0;
  const padded = ` ${h} `;
  for (const f of FIELDS) {
    for (const a of f.aliases) {
      if (a.length <= bestLen) continue;
      if (padded.indexOf(` ${a} `) !== -1) { best = f.key; bestLen = a.length; }
    }
  }
  return best;
}

/**
 * Map every column. First column to claim a field keeps it — a second "Email"
 * column becomes "ignore" rather than silently overwriting the first.
 */
export function autoMap(header) {
  const taken = {};
  return (header || []).map(h => {
    const k = guessField(h);
    if (!k) return IGNORE;
    if (taken[k]) return IGNORE;
    taken[k] = true;
    return k;
  });
}

/** field key -> column index, first column wins */
export function columnsByField(mapping) {
  const m = {};
  (mapping || []).forEach((k, i) => { if (k && m[k] == null) m[k] = i; });
  return m;
}

/** the first non-empty value in a column, for the "sample" cell on screen */
export function sampleFor(rows, i) {
  for (const r of rows || []) {
    const v = String((r || [])[i] == null ? '' : r[i]).trim();
    if (v) return v;
  }
  return '';
}

/**
 * The first `n` non-empty values in a column. The mapping screen shows two,
 * because one value is not enough to tell a ZIP from a house number and it is
 * the human, not us, who has to make that call.
 */
export function samplesFor(rows, i, n) {
  const want = n || 2;
  const out = [];
  for (const r of rows || []) {
    const v = String((r || [])[i] == null ? '' : r[i]).trim();
    if (v && out.indexOf(v) === -1) out.push(v);
    if (out.length >= want) break;
  }
  return out;
}

/** every value in one column, in file order — for the name-order sniff */
export const columnValues = (rows, i) =>
  (i == null || i < 0 ? [] : (rows || []).map(r => String((r || [])[i] == null ? '' : r[i]).trim()));

/** every distinct non-empty value in a column, with a count, most common first */
export function distinctValues(rows, i) {
  if (i == null || i < 0) return [];
  const counts = new Map();
  (rows || []).forEach(r => {
    const v = String((r || [])[i] == null ? '' : r[i]).trim();
    if (!v) return;
    counts.set(v, (counts.get(v) || 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([value, n]) => ({ value, n }))
    .sort((a, b) => b.n - a.n || a.value.localeCompare(b.value));
}

/* ==================================================== 3. value coercions */

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

const isoOf = (y, m, d) => {
  const s = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  /* round-tripping through the date engine proves it is a real calendar day —
     31 February parses as a number but does not come back as itself */
  return fromDnum(dnum(s)) === s ? s : '';
};

/**
 * One cell -> 'YYYY-MM-DD', or '' when it will not parse. Never guesses:
 * `order` ('mdy' | 'dmy') only decides the genuinely ambiguous numeric case,
 * and the caller asks the user for it.
 */
export function parseDateCell(v, order) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return '';

  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(s);
  if (m) return isoOf(+m[1], +m[2], +m[3]);

  m = /^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/.exec(s);
  if (m) return isoOf(+m[1], +m[2], +m[3]);

  /* "Jan 5, 2026" / "January 5 2026" — unambiguous, no order needed */
  m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/.exec(s);
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()]) return isoOf(+m[3], MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2]);

  /* "5 Jan 2026" */
  m = /^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})$/.exec(s);
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()]) return isoOf(+m[3], MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1]);

  m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(s);
  if (m) {
    const a = +m[1], b = +m[2];
    let y = +m[3];
    if (m[3].length <= 2) y = y <= 69 ? 2000 + y : 1900 + y;
    let mo, da;
    if (a > 12 && b <= 12) { da = a; mo = b; }            // only one reading works
    else if (b > 12 && a <= 12) { mo = a; da = b; }
    else if (a > 12 && b > 12) return '';                  // neither reading works
    else if (order === 'dmy') { da = a; mo = b; }
    else { mo = a; da = b; }
    return isoOf(y, mo, da);
  }
  return '';
}

/**
 * Does this column need the MM/DD vs DD/MM question asked?
 * Returns { ask, guess, example, evidence }. `evidence` is a value from THEIR
 * data that settles it (a 13th day, say), so the screen can show why.
 */
export function dateOrderHint(values) {
  let mdy = 0, dmy = 0, ambiguous = 0, example = '', evidence = '';
  (values || []).forEach(v => {
    const s = String(v == null ? '' : v).trim();
    const m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(s);
    if (!m) return;
    const a = +m[1], b = +m[2];
    if (a > 12 && b <= 12) { dmy++; if (!evidence) evidence = s; return; }
    if (b > 12 && a <= 12) { mdy++; if (!evidence) evidence = s; return; }
    if (a <= 12 && b <= 12) { ambiguous++; if (!example) example = s; }
  });
  if (mdy && !dmy) return { ask: false, guess: 'mdy', example: example || evidence, evidence };
  if (dmy && !mdy) return { ask: false, guess: 'dmy', example: example || evidence, evidence };
  if (ambiguous) return { ask: true, guess: 'mdy', example, evidence };
  return { ask: false, guess: 'mdy', example: '', evidence: '' };
}

/** "$250,000" / "250k" / "1.2m" -> 250000 / 250000 / 1200000 */
export function parseMoney(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return '';
  const m = /^\$?\s*(\d[\d,]*(?:\.\d+)?)\s*([kKmM])?/.exec(s.replace(/\s/g, ' '));
  if (!m) return '';
  let n = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(n)) return '';
  if (m[2]) n *= /[kK]/.test(m[2]) ? 1000 : 1000000;
  return Math.round(n);
}

/** "250000-300000", "$250k to $300k", "300000+", "up to 400k", "325000" */
export function parsePriceRange(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return { min: '', max: '' };
  const nums = [];
  const re = /\$?\s*(\d[\d,]*(?:\.\d+)?)\s*([kKmM])?/g;
  let m;
  while ((m = re.exec(s))) {
    let n = Number(m[1].replace(/,/g, ''));
    if (!Number.isFinite(n)) continue;
    if (m[2]) n *= /[kK]/.test(m[2]) ? 1000 : 1000000;
    nums.push(Math.round(n));
    if (nums.length >= 2) break;
  }
  if (!nums.length) return { min: '', max: '' };
  if (nums.length >= 2) {
    const lo = Math.min(nums[0], nums[1]), hi = Math.max(nums[0], nums[1]);
    return { min: lo, max: hi };
  }
  const low = s.toLowerCase();
  if (/\+|\bover\b|\babove\b|\bat least\b|\bmin\b|\bstarting\b/.test(low)) return { min: nums[0], max: '' };
  if (/\bunder\b|\bup to\b|\bbelow\b|\bmax\b|\bless than\b/.test(low)) return { min: '', max: nums[0] };
  return { min: nums[0], max: nums[0] };
}

export function parseNum(v) {
  const s = String(v == null ? '' : v).replace(/[^0-9.\-]/g, '');
  if (!s || s === '-' || s === '.') return '';
  const n = Number(s);
  return Number.isFinite(n) ? n : '';
}

/** digits only, US country code dropped, so (316) 555-0100 == 1-316-555-0100 */
export function normPhone(p) {
  let d = String(p == null ? '' : p).replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') d = d.slice(1);
  return d;
}

export const normEmail = e => String(e == null ? '' : e).trim().toLowerCase();
export const normName = n => String(n == null ? '' : n).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export const splitList = v => String(v == null ? '' : v)
  .split(/[;,|]/).map(x => x.trim()).filter(Boolean);

/* An address good enough to say "this is the same person", not good enough to
   post a letter: the street line only, lowercased, punctuation gone. */
export const normAddr = a => normName(String(a == null ? '' : a).split(',')[0]);

/* Deliberately loose. It is not our job to enforce RFC 5322 on somebody else's
   database — it is our job to notice "n/a", "none", "bob at gmail" and a
   trailing comma before they become a mailto: link that goes nowhere. */
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[A-Za-z]{2,}$/;
export const isEmailish = e => EMAIL_RE.test(String(e == null ? '' : e).trim());

/* Suffixes that follow a comma but are not a first name. "Kidd, Jr." is one
   person, not a Kidd called Jr. */
const NAME_SUFFIXES = ['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv', 'v', 'md', 'm.d.', 'phd', 'ph.d.',
  'esq', 'esq.', 'dds', 'cpa', 'ret', 'ret.', 'usaf', 'usa', 'usn', 'usmc'];
/* A comma inside a business name is not a "Last, First" comma either. */
const ENTITY_RE = /\b(llc|l\.l\.c|inc|corp|corporation|trust|company|co|ltd|lp|llp|pllc|partners|properties|realty|holdings|estate of)\b/i;

/**
 * 'Smith, John'      -> 'John Smith'
 * 'Smith, John A.'   -> 'John A. Smith'
 * 'John Smith, Jr.'  -> 'John Smith Jr.'   (suffix, not a first name)
 * 'Kidd Holdings, LLC' -> unchanged        (a company, not a person)
 * anything with no comma -> unchanged
 */
export function flipLastFirst(v) {
  const s = String(v == null ? '' : v).trim().replace(/\s+/g, ' ');
  const i = s.indexOf(',');
  if (i < 0) return s;
  const a = s.slice(0, i).trim();
  const b = s.slice(i + 1).trim().replace(/,.*$/, '').trim();   // ignore a second comma
  if (!a) return b;
  if (!b) return a;
  if (NAME_SUFFIXES.indexOf(b.toLowerCase().replace(/\.$/, '.')) !== -1
    || NAME_SUFFIXES.indexOf(b.toLowerCase()) !== -1) return `${a} ${b}`;
  if (ENTITY_RE.test(b) || ENTITY_RE.test(a)) return s;
  return `${b} ${a}`;
}

/** does a whole name column look like "Last, First"? 60% of the filled rows */
export function looksLastFirst(values) {
  let flips = 0, total = 0;
  (values || []).forEach(v => {
    const s = String(v == null ? '' : v).trim();
    if (!s) return;
    total++;
    if (flipLastFirst(s) !== s) flips++;
  });
  return total > 0 && flips / total >= 0.6;
}

/** apply the name-order decision to one cell. 'auto' judges value by value. */
export function applyNameOrder(v, order) {
  const s = String(v == null ? '' : v).trim().replace(/\s+/g, ' ');
  if (!s) return '';
  if (order === 'firstlast') return s;
  if (order === 'lastfirst') {
    const i = s.indexOf(',');
    if (i < 0) return s;
    const a = s.slice(0, i).trim(), b = s.slice(i + 1).trim();
    return a && b ? `${b} ${a}` : (a || b);
  }
  return flipLastFirst(s);
}

/** 'buyer' | 'seller' | 'both' from whatever word they used */
export function parseSide(v, fallback) {
  const s = String(v == null ? '' : v).toLowerCase();
  if (!s.trim()) return fallback || 'buyer';
  const buy = /buy|purchas|b2b|tenant|renter/.test(s);
  const sell = /sell|list|vendor|seller/.test(s);
  if (/both|dual|buy.*sell|sell.*buy/.test(s)) return 'both';
  if (buy && sell) return 'both';
  if (sell) return 'seller';
  if (buy) return 'buyer';
  return fallback || 'buyer';
}

/* ================================== 4. mapping their values onto ours */

/* Synonyms map onto the DEFAULT stage keys. They are only used when the install
   actually has that key — a brokerage with its own stage list gets label
   matching and nothing invented. */
const STAGE_SYNONYMS = [
  ['new', ['new', 'new lead', 'open', 'unworked', 'fresh', 'inquiry', 'lead']],
  ['nurturing', ['contacted', 'nurture', 'nurturing', 'working', 'attempted contact', 'in progress', 'follow up', 'warm', 'engaged', 'qualified']],
  ['apptset', ['appointment set', 'appt set', 'meeting set', 'consultation set', 'consult scheduled', 'appointment scheduled', 'scheduled']],
  ['apptheld', ['appointment held', 'appt held', 'met', 'consultation held', 'appointment completed', 'meeting held']],
  ['signed', ['signed', 'agreement signed', 'listing signed', 'buyer agreement', 'under agreement', 'client']],
  ['active', ['active', 'showing', 'actively showing', 'live', 'listed', 'on market', 'active listing']],
  ['offer', ['offer', 'offer made', 'offer submitted', 'offer received', 'negotiating', 'negotiation']],
  ['contract', ['under contract', 'pending', 'contract', 'in escrow', 'escrow', 'won', 'closed', 'sold']],
  ['lost', ['lost', 'dead', 'archived', 'unqualified', 'withdrawn', 'expired', 'do not contact', 'no longer interested', 'inactive', 'cold']],
];

/** the stage a row falls back to when nothing matched */
export function fallbackStage(stages) {
  const list = stages || [];
  const open = list.find(s => s.open);
  return (open || list[0] || { key: 'new' }).key;
}

const stageStrings = s => [s.key, s.sellerLabel, s.buyerLabel].filter(Boolean).map(normHeader);

/** best guess of one of THEIR stage values onto one of OUR stage keys, or '' */
export function guessStage(raw, stages) {
  const v = normHeader(raw);
  if (!v) return '';
  const list = stages || [];
  for (const s of list) if (stageStrings(s).indexOf(v) !== -1) return s.key;
  /* containment, longest label wins. Three characters minimum, or "A" would
     match half the stage list. */
  let best = '', bestLen = 0;
  for (const s of list) {
    for (const str of stageStrings(s)) {
      if (!str || str.length < 3 || str.length <= bestLen) continue;
      if (v.length >= 3 && (v.indexOf(str) !== -1 || str.indexOf(v) !== -1)) { best = s.key; bestLen = str.length; }
    }
  }
  if (best) return best;
  for (const [key, words] of STAGE_SYNONYMS) {
    if (!list.some(s => s.key === key)) continue;
    if (words.indexOf(v) !== -1) return key;
  }
  for (const [key, words] of STAGE_SYNONYMS) {
    if (!list.some(s => s.key === key)) continue;
    if (words.some(w => v.indexOf(w) !== -1)) return key;
  }
  return '';
}

/** best guess of one of THEIR source values onto one of OUR sources, or '' */
export function guessSource(raw, sources) {
  const v = normHeader(raw);
  if (!v) return '';
  const list = sources || [];
  for (const s of list) if (normHeader(s) === v) return s;
  let best = '', bestLen = 0;
  for (const s of list) {
    const n = normHeader(s);
    if (!n || n.length < 3 || n.length <= bestLen) continue;
    if (v.length >= 3 && (v.indexOf(n) !== -1 || n.indexOf(v) !== -1)) { best = s; bestLen = n.length; }
  }
  if (best) return best;
  /* the handful of names every portal exports under a different spelling */
  const alt = [
    ['Zillow', ['zillow', 'zillow premier', 'zillow flex', 'trulia']],
    ['Realtor.com', ['realtor com', 'realtor', 'opcity', 'move com']],
    ['Referral', ['referral', 'referred', 'agent referral', 'client referral', 'word of mouth']],
    ['Past Client', ['past client', 'previous client', 'repeat client', 'prior client']],
    ['Sphere of Influence', ['sphere', 'sphere of influence', 'soi', 'friend', 'family']],
    ['Open House', ['open house', 'openhouse', 'oh']],
    ['Sign Call', ['sign call', 'sign', 'yard sign']],
    ['Social', ['social', 'facebook', 'fb', 'instagram', 'ig', 'tiktok', 'social media']],
    ['Website', ['website', 'web', 'web form', 'site', 'idx', 'landing page']],
    ['FSBO', ['fsbo', 'for sale by owner']],
    ['Expired', ['expired', 'expired listing']],
    ['Farming', ['farm', 'farming', 'geographic farm', 'mailer', 'door knock']],
  ];
  for (const [name, words] of alt) {
    if (!list.some(s => normHeader(s) === normHeader(name))) continue;
    if (words.indexOf(v) !== -1 || words.some(w => v.indexOf(w) !== -1)) return name;
  }
  return '';
}

/** pre-fill the whole value map for a column */
export function guessValueMap(values, kind, opts) {
  const out = {};
  (values || []).forEach(({ value }) => {
    out[value] = kind === 'stage' ? guessStage(value, opts) : guessSource(value, opts);
  });
  return out;
}

/* ================================================ 5. one row -> a contact */

const NEW_SOURCE = '__new__';
export const NEW_SOURCE_KEY = NEW_SOURCE;

const cell = (cells, i) => (i == null || i < 0 ? '' : String((cells || [])[i] == null ? '' : cells[i]).trim());

/**
 * Turn one parsed row into a contact record shaped exactly like the one in
 * docs/VIEW-CONTRACT.md. Returns { contact, skip, reason, warnings, ... }.
 *
 * opt: { byField, stages, stageMap, sourceMap, dateOrder, nameOrder, meId,
 *        meName, todayIso, fileName, batchId, sideDefault }
 */
export function buildContact(cells, opt) {
  const o = opt || {};
  const f = o.byField || {};
  const warnings = [];
  const get = k => cell(cells, f[k]);

  /* ---- name: one column ("Last, First" or "First Last"), or first + last */
  let name = applyNameOrder(get('name'), o.nameOrder || 'auto');
  if (!name) name = [get('firstName'), get('lastName')].filter(Boolean).join(' ').trim();
  const hadName = !!name;

  const email = get('email');
  const phoneRaw = get('phone');
  const digits = normPhone(phoneRaw);
  const phone = digits.length === 10 ? phoneFmt(digits) : phoneRaw;

  if (!name && !email && !phone) {
    return {
      contact: null, skip: true, hadName: false,
      reason: 'no name, no email and no phone — there is nothing here to identify a person by',
      warnings,
    };
  }
  if (!name) {
    name = email || phone;
    warnings.push(`no name in this row — using the ${email ? 'email address' : 'phone number'} as the name. Fix it after the import, or fix the file and run it again.`);
  }
  if (email && !isEmailish(email)) {
    warnings.push(`"${email}" is not a usable email address — it is saved as-is so nothing is lost, but it will not match a duplicate and it will not send.`);
  }
  if (phoneRaw && digits.length !== 10) {
    warnings.push(digits.length
      ? `"${phoneRaw}" is ${digits.length} digit${digits.length === 1 ? '' : 's'}, not 10 — saved as it was written rather than reformatted.`
      : `"${phoneRaw}" has no digits in it, so it is not a phone number.`);
  }

  /* ---- address, rebuilt from whichever parts they gave us */
  const street = get('address'), city = get('city'), st = get('state'), zip = get('zip');
  const tail = [st, zip].filter(Boolean).join(' ');
  const address = [street, city, tail].filter(Boolean).join(', ');

  /* ---- money: one range column, or a min and a max, or a target */
  const range = parsePriceRange(get('price'));
  let priceMin = get('priceMin') ? parseMoney(get('priceMin')) : range.min;
  let priceMax = get('priceMax') ? parseMoney(get('priceMax')) : range.max;
  if (priceMin !== '' && priceMax !== '' && priceMin > priceMax) { const x = priceMin; priceMin = priceMax; priceMax = x; }
  const targetPrice = get('targetPrice') ? parseMoney(get('targetPrice')) : '';

  /* ---- stage and source come from the value map, never from the raw text */
  const rawStage = get('stage'), rawSource = get('source');
  const stages = o.stages || [];
  const fb = fallbackStage(stages);
  const mapped = o.stageMap ? o.stageMap[rawStage] : '';
  const stage = mapped || fb;
  if (rawStage && !mapped) warnings.push(`stage "${rawStage}" is not one of yours and was not mapped — this row lands in the first open stage instead.`);

  let source = o.sourceMap ? o.sourceMap[rawSource] : '';
  if (source === NEW_SOURCE) source = rawSource;
  if (!source) source = '';

  /* ---- dates: parse or fall back to today. Never invent a wrong one. */
  const createdRaw = get('created'), touchRaw = get('lastTouch');
  const created = parseDateCell(createdRaw, o.dateOrder);
  const lastTouch = parseDateCell(touchRaw, o.dateOrder);
  if (createdRaw && !created) warnings.push(`"${createdRaw}" is not a date anything here can read — the created date is today instead.`);
  if (touchRaw && !lastTouch) warnings.push(`"${touchRaw}" is not a date anything here can read — last contact is left empty.`);

  /* ---- notes, with the tags column preserved rather than dropped */
  const tags = splitList(get('tags'));
  const noteBits = [get('notes'), tags.length ? `Tags: ${tags.join(', ')}` : ''].filter(Boolean);

  const areas = splitList(get('areas'));
  const side = parseSide(get('side'), o.sideDefault || 'buyer');

  const contact = {
    id: uid(),
    name,
    email,
    phone,
    side,
    stage,
    source,
    owner_id: o.meId || null,
    pool: null,
    pooled_at: null,
    created_at: created || o.todayIso || null,
    /* NOT `|| o.todayIso`. Stamping today would record that somebody made
       contact on the day the file was uploaded, which nobody did — and
       lastTouch drives the Contacts sort, the cold check on the dashboard and
       the cold sort key, so an import would land every new contact at the WARM
       end of the list and out of every "who has gone quiet" view.

       Empty is the honest answer and the readers already handle it: the
       dashboard treats a non-date as needing attention, the cold key goes null,
       and the column reads as never contacted. Same defect ProyTech had, found
       here before it bit rather than after.

       created_at above KEEPS its fallback, deliberately: the record really was
       created today. It is the contact that is new, not the relationship. */
    lastTouch: lastTouch || null,
    priceMin: priceMin === '' ? '' : priceMin,
    priceMax: priceMax === '' ? '' : priceMax,
    targetPrice: targetPrice === '' ? '' : targetPrice,
    preapproval: get('preapproval'),
    lender: get('lender'),
    timeline: get('timeline'),
    propertyType: get('propertyType'),
    areas,
    address,
    beds: parseNum(get('beds')),
    baths: parseNum(get('baths')),
    nextAction: '',
    nextActionDue: null,
    notes: noteBits.join('\n\n'),
    closedWithUsOn: null,
    appointments: [],
    checklist: {},
    activity: [importActivity(o)],
  };
  return { contact, skip: false, reason: '', warnings, hadName, agentCell: get('agent') };
}

/** the provenance line every imported contact carries */
export function importActivity(o) {
  const opt = o || {};
  const who = opt.meName ? ` by ${opt.meName}` : '';
  const batch = opt.batchId ? ` · batch ${opt.batchId}` : '';
  return {
    id: uid(),
    at: new Date().toISOString(),
    kind: 'import',
    note: `Imported from ${opt.fileName || 'a CSV file'} on ${opt.todayIso || 'an unrecorded date'}${who}.${batch}`,
    by: opt.meId || null,
  };
}

/* ============================================= 6. duplicates and merging */

const isEmpty = v => v == null || v === '' || (Array.isArray(v) && v.length === 0);

/**
 * An index over a list of contacts, matched EMAIL first, then PHONE, then
 * NAME + ADDRESS. Name on its own is not a match: two John Smiths in a book of
 * two thousand is normal, and quietly merging them is worse than importing a
 * duplicate somebody can delete.
 *
 * `nameOnly` is kept separately and never used to match — only to raise
 * "same name, different address, have a look" on the preview.
 */
export function makeIndex(list) {
  const byEmail = new Map(), byPhone = new Map(), byNameAddr = new Map(), byName = new Map();
  const keyNameAddr = c => `${normName(c && c.name)}|${normAddr(c && c.address)}`;

  const add = c => {
    if (!c) return;
    const e = normEmail(c.email);
    if (e && isEmailish(e) && !byEmail.has(e)) byEmail.set(e, c);
    const p = normPhone(c.phone);
    if (p.length === 10 && !byPhone.has(p)) byPhone.set(p, c);
    const n = normName(c.name);
    if (n) {
      const k = keyNameAddr(c);
      if (!byNameAddr.has(k)) byNameAddr.set(k, c);
      if (!byName.has(n)) byName.set(n, c);
    }
  };
  (list || []).forEach(add);

  return {
    add,
    /** a real match, in the order the client would check it themselves */
    find(c) {
      if (!c) return null;
      const e = normEmail(c.email);
      if (e && isEmailish(e) && byEmail.has(e)) return { existing: byEmail.get(e), on: 'email' };
      const p = normPhone(c.phone);
      if (p.length === 10 && byPhone.has(p)) return { existing: byPhone.get(p), on: 'phone' };
      const n = normName(c.name);
      if (n && byNameAddr.has(keyNameAddr(c))) {
        return { existing: byNameAddr.get(keyNameAddr(c)), on: normAddr(c.address) ? 'name + address' : 'name (neither has an address)' };
      }
      return null;
    },
    /** not a match — just worth a human's eye */
    nearName(c) {
      if (!c) return null;
      const n = normName(c.name);
      if (!n || !byName.has(n)) return null;
      const other = byName.get(n);
      if (normAddr(other.address) === normAddr(c.address)) return null;
      return other;
    },
  };
}

const MERGE_SCALARS = [
  'name', 'email', 'phone', 'side', 'stage', 'source', 'address', 'lastTouch',
  'created_at', 'priceMin', 'priceMax', 'targetPrice', 'preapproval', 'lender',
  'timeline', 'propertyType', 'beds', 'baths', 'nextAction', 'nextActionDue',
];

/**
 * Update an existing contact from an incoming row.
 *
 * THE RULE: fill in the blanks and nothing else. A value the client already
 * has is never overwritten, however confident the file looks — their record is
 * the one they have been working, the export is a snapshot of a system they
 * are leaving. Notes are appended, areas are a union, and the existing id,
 * pool, appointments, checklist and history stay its own. An unclaimed record
 * picks up the owner this import is assigning; an owned one keeps its agent.
 */
export function mergeContact(existing, incoming) {
  const out = { ...existing };
  const filled = [];
  MERGE_SCALARS.forEach(k => {
    const cur = existing ? existing[k] : undefined;
    const v = incoming ? incoming[k] : undefined;
    if (isEmpty(cur) && !isEmpty(v)) { out[k] = v; filled.push(k); }
  });

  const a = String((existing && existing.notes) || '').trim();
  const b = String((incoming && incoming.notes) || '').trim();
  out.notes = !b ? a : !a ? b : (a.indexOf(b) !== -1 ? a : `${a}\n\n${b}`);
  if (out.notes !== a) filled.push('notes');

  const before = ((existing && existing.areas) || []).length;
  out.areas = Array.from(new Set([...((existing && existing.areas) || []), ...((incoming && incoming.areas) || [])]));
  if (out.areas.length > before) filled.push('areas');

  if ((existing && existing.owner_id) == null && incoming && incoming.owner_id) {
    out.owner_id = incoming.owner_id;
    out.pool = incoming.pool == null ? (existing && existing.pool) || null : incoming.pool;
    filled.push('owner');
  }

  out.activity = [...((incoming && incoming.activity) || []), ...((existing && existing.activity) || [])];
  out.id = existing.id;
  out.__filled = filled;
  return out;
}

/* ==================================================== 7. the whole plan */

/**
 * Turn the parsed file + every mapping decision into the exact list of writes.
 * NOTHING HERE WRITES: the caller loops over plan.rows and calls upsertContact.
 *
 * Two passes, in this order, because the order changes the answer:
 *   1. collapse rows that duplicate each OTHER inside the file, first one wins
 *      and the later ones fill its blanks;
 *   2. match what survives against the book the client already has.
 *
 * opts: { rows, mapping, existing, stages, sources, stageMap, sourceMap,
 *         dateOrder, nameOrder, dupAction:'skip'|'update', dupOverrides:{n},
 *         ownerMode:'me'|'user'|'file'|'pool', ownerId, pool, users, meId,
 *         meName, todayIso, fileName, batchId, sideDefault }
 */
export function buildPlan(opts) {
  const o = opts || {};
  const byField = columnsByField(o.mapping);
  const users = o.users || [];
  const userByName = new Map();
  users.forEach(u => { const n = normName(u.name); if (n && !userByName.has(n)) userByName.set(n, u.id); });

  let unmatchedAgents = 0;
  const ownerFor = agentCell => {
    if (o.ownerMode === 'pool') return { owner_id: null, pool: o.pool || null, pooled_at: o.todayIso || null };
    if (o.ownerMode === 'file') {
      const hit = userByName.get(normName(agentCell));
      if (agentCell && !hit) unmatchedAgents++;
      return { owner_id: hit || o.meId || null, pool: null, pooled_at: null };
    }
    if (o.ownerMode === 'user') return { owner_id: o.ownerId || o.meId || null, pool: null, pooled_at: null };
    return { owner_id: o.meId || null, pool: null, pooled_at: null };
  };

  /* ---------------------------------------------- pass 1: build + collapse */
  const rows = [];
  const byId = new Map();             // surviving contact id -> its plan row
  const fileIdx = makeIndex([]);
  let skippedNoId = 0, collapsed = 0, needName = 0;

  (o.rows || []).forEach((cells, i) => {
    const n = i + 1;
    const built = buildContact(cells, {
      byField, stages: o.stages, stageMap: o.stageMap, sourceMap: o.sourceMap,
      dateOrder: o.dateOrder, nameOrder: o.nameOrder, meId: o.meId, meName: o.meName,
      todayIso: o.todayIso, fileName: o.fileName, batchId: o.batchId, sideDefault: o.sideDefault,
    });

    if (built.skip) {
      skippedNoId++;
      rows.push({
        n, cells, action: 'skip', reason: built.reason, warnings: built.warnings,
        contact: null, existing: null, dupOn: '', mergedRows: [], nearName: null, hadName: false,
      });
      return;
    }
    if (!built.hadName) needName++;

    const own = ownerFor(built.agentCell);
    built.contact.owner_id = own.owner_id;
    built.contact.pool = own.pool;
    built.contact.pooled_at = own.pooled_at;

    /* duplicate of an earlier row in this same file? fold it in and move on */
    const twin = fileIdx.find(built.contact);
    if (twin) {
      const target = byId.get(twin.existing.id);
      if (target) {
        collapsed++;
        target.contact = mergeContact(target.contact, built.contact);
        target.mergedRows.push(n);
        target.warnings = target.warnings.concat(built.warnings);
        fileIdx.add(target.contact);
        rows.push({
          n, cells, action: 'collapsed', reason: `the same person as row ${target.n} (matched on ${twin.on}) — the two rows were folded into one`,
          warnings: [], contact: null, existing: null, dupOn: '', mergedRows: [], nearName: null,
          intoRow: target.n, hadName: built.hadName,
        });
        return;
      }
    }

    const row = {
      n, cells, action: 'create', reason: '', warnings: built.warnings,
      contact: built.contact, existing: null, dupOn: '', mergedRows: [], nearName: null,
      hadName: built.hadName,
    };
    fileIdx.add(built.contact);
    byId.set(built.contact.id, row);
    rows.push(row);
  });

  /* ------------------------------------- pass 2: against the existing book */
  const idx = makeIndex(o.existing);
  let created = 0, updated = 0, dupSkipped = 0, warned = 0;

  rows.forEach(r => {
    if (!r.contact) return;
    const hit = idx.find(r.contact);
    if (hit) {
      const action = (o.dupOverrides && o.dupOverrides[r.n]) || o.dupAction || 'skip';
      r.existing = hit.existing;
      r.dupOn = hit.on;
      r.reason = `already in your contacts — matched on ${hit.on}`;
      if (action === 'update') {
        updated++;
        r.action = 'update';
        r.contact = mergeContact(hit.existing, r.contact);
        idx.add(r.contact);
      } else {
        dupSkipped++;
        r.action = 'dup';
      }
    } else {
      const near = idx.nearName(r.contact);
      if (near) {
        r.nearName = near;
        r.warnings = r.warnings.concat([`you already have a "${r.contact.name}" at a different address — this is being imported as a separate person, which is right if they are two different people.`]);
      }
      created++;
      r.action = 'create';
      idx.add(r.contact);
    }
    if (r.warnings.length) warned++;
  });

  return {
    rows,
    counts: {
      total: rows.length,
      create: created,
      update: updated,
      write: created + updated,
      skipNoId: skippedNoId,
      dupSkip: dupSkipped,
      dups: updated + dupSkipped,
      collapsed,
      needName,
      unmatchedAgents,
      warned,
    },
  };
}

/* ============================================================ 8. receipts */

/** rows that never made it in, as a CSV of just those, reason appended */
export function failuresCsv(header, failures) {
  const head = [...(header || []), 'Import problem'];
  const body = (failures || []).map(f => [...(f.cells || []), f.error || f.reason || 'failed']);
  return toCsv([head, ...body]);
}

/**
 * Exactly what was written, ids and all. This is the way back out: if the
 * import turns out to have been a mistake, this file is the list of ids to
 * delete, and it is the only record of which file row became which contact.
 *
 * opt: { batchId, fileName, todayIso, stageLabel(key, side), ownerName(id) }
 */
export function writtenCsv(written, opt) {
  const o = opt || {};
  const label = o.stageLabel || ((k) => k);
  const owner = o.ownerName || (id => id || '');
  const head = [
    'id', 'File row', 'What happened', 'Name', 'Email', 'Phone', 'Side', 'Stage',
    'Source', 'Owner', 'Pool', 'Address', 'Price min', 'Price max', 'Target price',
    'Created', 'Last contact', 'Imported from', 'Imported on', 'Batch',
  ];
  const body = (written || []).map(w => {
    const c = w.contact || {};
    return [
      c.id, w.n, w.action === 'update' ? 'updated an existing contact' : 'created',
      c.name, c.email, c.phone, c.side, label(c.stage, c.side), c.source,
      owner(c.owner_id), c.pool || '', c.address,
      c.priceMin === '' || c.priceMin == null ? '' : c.priceMin,
      c.priceMax === '' || c.priceMax == null ? '' : c.priceMax,
      c.targetPrice === '' || c.targetPrice == null ? '' : c.targetPrice,
      c.created_at || '', c.lastTouch || '',
      o.fileName || '', o.todayIso || '', o.batchId || '',
    ];
  });
  return toCsv([head, ...body]);
}
