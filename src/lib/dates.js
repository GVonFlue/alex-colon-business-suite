/* ============================================================================
   dates.js — the critical-date engine.

   THE RULES THIS FILE EXISTS TO ENFORCE
   -------------------------------------
   1. A deadline is a DATE, never a timestamp. Everything here is an
      'YYYY-MM-DD' string and integer day arithmetic. No Date objects cross a
      function boundary, so no UTC conversion can ever move a deadline a day.
   2. Business vs calendar counting is PER DEADLINE. There is no global mode.
   3. Inclusive vs exclusive start is explicit and visible. Default exclusive:
      "5 days after the Effective Date" means day one is the day AFTER signing.
   4. Business-day counting skips weekends AND a configurable holiday list.
   5. Whether a computed deadline that lands on a non-business day rolls forward
      or stands is a setting, because contracts differ.
   6. Every computed date can explain itself — see explainCount(). An agent must
      be able to see exactly where the arithmetic came from.

   No imports. No import.meta.env. Unit-testable in plain node.
   ========================================================================== */

/* ---------- day-number arithmetic (the whole trick) ---------- */

const MS = 86400000;

/** 'YYYY-MM-DD' -> integer day number. Uses Date.UTC so there is no local TZ. */
export function dnum(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return NaN;
  return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / MS);
}

/** integer day number -> 'YYYY-MM-DD' */
export function fromDnum(n) {
  if (!Number.isFinite(n)) return null;
  const d = new Date(n * MS);
  const p = x => String(x).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

export const isDate = iso => !Number.isNaN(dnum(iso));
export const addDays = (iso, n) => fromDnum(dnum(iso) + Math.trunc(n));
export const diffDays = (a, b) => dnum(b) - dnum(a);
/** 0 = Sunday ... 6 = Saturday */
export const dow = iso => ((dnum(iso) % 7) + 11) % 7;
export const isWeekend = iso => { const d = dow(iso); return d === 0 || d === 6; };

/** today's date in a timezone, as 'YYYY-MM-DD'. Default America/Chicago. */
export function today(tz) {
  const z = tz || 'America/Chicago';
  try {
    const f = new Intl.DateTimeFormat('en-CA', { timeZone: z, year: 'numeric', month: '2-digit', day: '2-digit' });
    return f.format(new Date()).replace(/\//g, '-');
  } catch { return new Date().toISOString().slice(0, 10); }
}

/* ---------- holidays ---------- */

/** normalise a holiday list into a { 'YYYY-MM-DD': 'Name' } map.
    Idempotent: isBusinessDay() is called internally with an already-built map
    (see addBusinessDays / applyRollover), so a map handed back in must pass
    straight through instead of being iterated as a list. */
export function holidayMap(holidays) {
  if (holidays && typeof holidays === 'object' && !Array.isArray(holidays)) return holidays;
  const out = {};
  (holidays || []).forEach(h => {
    if (!h) return;
    if (typeof h === 'string') { if (isDate(h)) out[h.slice(0, 10)] = 'Holiday'; return; }
    const d = h.date || h.iso;
    if (d && isDate(d)) out[String(d).slice(0, 10)] = h.name || 'Holiday';
  });
  return out;
}

const nthDow = (year, month, targetDow, n) => {
  /* n = 1..5 for nth, -1 for last */
  if (n > 0) {
    let iso = `${year}-${String(month).padStart(2, '0')}-01`;
    let count = 0;
    for (let i = 0; i < 31; i++) {
      const cur = addDays(iso, i);
      if (+cur.slice(5, 7) !== month) break;
      if (dow(cur) === targetDow && ++count === n) return cur;
    }
    return null;
  }
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (let d = last; d >= 1; d--) {
    const cur = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (dow(cur) === targetDow) return cur;
  }
  return null;
};

/** observed date of a fixed-date federal holiday: Sat -> Fri, Sun -> Mon. */
const observed = iso => (dow(iso) === 6 ? addDays(iso, -1) : dow(iso) === 0 ? addDays(iso, 1) : iso);

/** US federal holidays for one year, observed. Seed only — editable per install. */
export function usFederalHolidays(year) {
  const y = Number(year);
  const p = (m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return [
    { date: observed(p(1, 1)),   name: "New Year's Day" },
    { date: nthDow(y, 1, 1, 3),  name: 'Martin Luther King Jr. Day' },
    { date: nthDow(y, 2, 1, 3),  name: "Washington's Birthday" },
    { date: nthDow(y, 5, 1, -1), name: 'Memorial Day' },
    { date: observed(p(6, 19)),  name: 'Juneteenth' },
    { date: observed(p(7, 4)),   name: 'Independence Day' },
    { date: nthDow(y, 9, 1, 1),  name: 'Labor Day' },
    { date: nthDow(y, 10, 1, 2), name: 'Columbus Day' },
    { date: observed(p(11, 11)), name: 'Veterans Day' },
    { date: nthDow(y, 11, 4, 4), name: 'Thanksgiving Day' },
    { date: observed(p(12, 25)), name: 'Christmas Day' },
  ].filter(h => h.date);
}

/** seed list spanning a few years, so counting never runs off the end of it. */
export function seedHolidays(fromYear, years) {
  const y0 = Number(fromYear) || +today().slice(0, 4);
  const n = Number(years) || 3;
  const out = [];
  for (let i = 0; i < n; i++) out.push(...usFederalHolidays(y0 + i));
  return out;
}

/* ---------- business days ---------- */

export function isBusinessDay(iso, holidays) {
  if (isWeekend(iso)) return false;
  const map = holidays && holidays.__map ? holidays : holidayMap(holidays);
  return !map[iso];
}

const reasonFor = (iso, map) => {
  if (map[iso]) return map[iso];
  const d = dow(iso);
  return d === 6 ? 'Saturday' : d === 0 ? 'Sunday' : null;
};

/**
 * Count business days from an anchor date.
 * @param {string} from   anchor 'YYYY-MM-DD'
 * @param {number} n      how many business days (may be negative to count back)
 * @param {object} opts   { holidays, inclusive }
 *   inclusive:false (default) — day one is the next business day after `from`.
 *   inclusive:true            — `from` itself is day one when it is a business day.
 * @returns {{date, skipped:[{date,reason}], counted:number}}
 */
export function addBusinessDays(from, n, opts) {
  const o = opts || {};
  const map = holidayMap(o.holidays);
  const step = n < 0 ? -1 : 1;
  let need = Math.abs(Math.trunc(n));
  const skipped = [];
  let cur = from;
  let counted = 0;

  if (o.inclusive && need > 0 && isBusinessDay(cur, map)) { counted = 1; need -= 1; }

  while (need > 0) {
    cur = addDays(cur, step);
    if (isBusinessDay(cur, map)) { counted++; need--; }
    else skipped.push({ date: cur, reason: reasonFor(cur, map) });
  }
  return { date: cur, skipped, counted };
}

/**
 * Apply the weekend/holiday rollover setting to an already-computed date.
 * mode: 'forward' (default) | 'stand' | 'back'
 */
export function applyRollover(iso, mode, holidays) {
  const map = holidayMap(holidays);
  if (mode === 'stand') return { date: iso, rolled: null };
  if (isBusinessDay(iso, map)) return { date: iso, rolled: null };
  if (mode === 'back') {
    let cur = iso, hops = 0;
    while (!isBusinessDay(cur, map) && hops++ < 30) cur = addDays(cur, -1);
    return { date: cur, rolled: { from: iso, to: cur, reason: reasonFor(iso, map), direction: 'back' } };
  }
  let cur = iso, hops = 0;
  while (!isBusinessDay(cur, map) && hops++ < 30) cur = addDays(cur, 1);
  return { date: cur, rolled: { from: iso, to: cur, reason: reasonFor(iso, map), direction: 'forward' } };
}

/* ---------- the one function everything else calls ---------- */

/**
 * Compute one deadline.
 * @param {object} spec
 *   anchorDate  'YYYY-MM-DD'   — effective/binding date, or the close date
 *   offset      number         — days from the anchor (negative = before)
 *   count       'business'|'calendar'
 *   inclusive   boolean        — business counting only; default false (exclusive)
 *   rollover    'forward'|'stand'|'back'  — applied to CALENDAR results only,
 *               because a business-day result is already a business day.
 *   holidays    array
 *   anchorLabel string         — "Effective" / "Closing", for the explanation
 * @returns {{date, rule, explain, skipped, rolled, count, inclusive, offset, anchorDate}}
 */
export function computeDeadline(spec) {
  const s = spec || {};
  const anchor = s.anchorDate;
  const offset = Math.trunc(Number(s.offset) || 0);
  const count = s.count === 'business' ? 'business' : 'calendar';
  const inclusive = !!s.inclusive;
  const rollover = s.rollover || 'forward';
  if (!isDate(anchor)) return null;

  let date, skipped = [], rolled = null;

  if (count === 'business') {
    const r = addBusinessDays(anchor, offset, { holidays: s.holidays, inclusive });
    date = r.date; skipped = r.skipped;
    /* offset 0 on a non-business day still needs the rollover rule applied */
    if (offset === 0) { const a = applyRollover(date, rollover, s.holidays); date = a.date; rolled = a.rolled; }
  } else {
    date = addDays(anchor, offset);
    const a = applyRollover(date, rollover, s.holidays);
    date = a.date; rolled = a.rolled;
  }

  return {
    date, count, inclusive, offset, anchorDate: anchor, skipped, rolled,
    rule: ruleText({ offset, count, inclusive, anchorLabel: s.anchorLabel || 'effective date', rollover }),
    explain: explainCount({ anchorDate: anchor, anchorLabel: s.anchorLabel || 'Effective', offset, count, inclusive, skipped, rolled, date }),
  };
}

/** the short "rule used" string shown in the review table */
export function ruleText(o) {
  const n = Math.abs(o.offset);
  const dir = o.offset < 0 ? 'before' : 'after';
  const kind = o.count === 'business' ? 'business' : 'calendar';
  if (o.offset === 0) return `on the ${o.anchorLabel}`;
  const start = o.count === 'business' ? (o.inclusive ? ', inclusive start' : ', exclusive start') : '';
  const roll = o.count === 'calendar' && o.rollover === 'stand' ? ', stands on weekends' : '';
  return `${n} ${kind} day${n === 1 ? '' : 's'} ${dir} the ${o.anchorLabel}${start}${roll}`;
}

/** the arithmetic, spelled out. This is what stops an agent re-reading the PDF. */
export function explainCount(o) {
  const n = Math.abs(o.offset);
  const kind = o.count === 'business' ? 'business' : 'calendar';
  const dir = o.offset < 0 ? '−' : '+';
  const bits = [`${o.anchorLabel} ${fmtShort(o.anchorDate)} ${dir} ${n} ${kind} day${n === 1 ? '' : 's'}`];
  if (o.count === 'business' && o.inclusive) bits.push('counting the anchor day itself');
  if (o.skipped && o.skipped.length) bits.push(`skipping ${skipPhrase(o.skipped)}`);
  if (o.rolled) bits.push(`${o.rolled.reason} → rolled ${o.rolled.direction} to ${fmtShort(o.rolled.to)}`);
  return `${bits.join(', ')} = ${fmtShort(o.date)}`;
}

function skipPhrase(skipped) {
  const wk = skipped.filter(s => s.reason === 'Saturday' || s.reason === 'Sunday').length;
  const hol = skipped.filter(s => s.reason !== 'Saturday' && s.reason !== 'Sunday');
  const parts = [];
  if (wk) parts.push(wk === 2 ? 'Sat/Sun' : `${wk} weekend day${wk === 1 ? '' : 's'}`);
  hol.forEach(h => parts.push(`${fmtShort(h.date)} (${h.reason})`));
  return parts.join(' and ');
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** 'Aug 5' — no Date object, so no timezone can shift it */
export function fmtShort(iso) {
  if (!isDate(iso)) return '—';
  return `${MON[+iso.slice(5, 7) - 1]} ${+iso.slice(8, 10)}`;
}
/** 'Wed Aug 5, 2026' */
export function fmtLong(iso) {
  if (!isDate(iso)) return '—';
  const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${DAY[dow(iso)]} ${fmtShort(iso)}, ${iso.slice(0, 4)}`;
}
export const daysUntil = (iso, tz) => (isDate(iso) ? diffDays(today(tz), iso) : null);

/* ---------- the cascade ---------- */

export const UNMET = d => !d || d.status === 'open' || d.status == null;

/**
 * Build or rebuild the deadline set for a transaction.
 *
 * Re-cascade rules (§4b):
 *  - Only UNMET deadlines move. met / waived / extended are left exactly alone.
 *  - A deadline whose date came from an ABSOLUTE contract clause ("on or before
 *    August 12, 2026") never moves either — the contract said a date, not an
 *    offset. It is reported as kept, with the reason.
 *  - A manually typed date (source 'manual') never moves.
 *  - Everything else recomputes from the new anchor.
 *
 * @returns {{deadlines, moved:[], kept:[], added:[]}}
 */
export function cascade(existing, opts) {
  const o = opts || {};
  const effective = o.effective;
  const closeDate = o.closeDate;
  const holidays = o.holidays;
  const rollover = o.rollover || 'forward';
  const offsets = o.offsets || [];
  const prev = Array.isArray(existing) ? existing : [];
  const byKey = {};
  prev.forEach(d => { if (d && d.key) byKey[d.key] = d; });

  const out = [];
  const moved = [], kept = [], added = [];

  const specs = offsets.length ? offsets : prev.map(d => ({
    key: d.key, label: d.label, offset: d.offset, count: d.count,
    inclusive: d.inclusive, anchor: d.anchor,
  }));

  specs.forEach(spec => {
    const old = byKey[spec.key];
    const anchor = spec.anchor === 'close' ? closeDate : effective;
    const anchorLabel = spec.anchor === 'close' ? 'Closing' : 'Effective';
    const anchorWords = spec.anchor === 'close' ? 'closing date' : 'effective date';

    /* deadlines that must not move */
    if (old && !UNMET(old)) {
      out.push(old);
      kept.push({ key: old.key, label: old.label, date: old.date, why: `already ${old.status}` });
      return;
    }
    if (old && (old.absolute || old.source === 'manual')) {
      out.push(old);
      kept.push({ key: old.key, label: old.label, date: old.date,
        why: old.absolute ? 'contract states an absolute date' : 'entered by hand' });
      return;
    }
    if (spec.anchor === 'close' && !isDate(closeDate)) {
      if (old) { out.push(old); kept.push({ key: old.key, label: old.label, date: old.date, why: 'no closing date set' }); }
      return;
    }

    const c = computeDeadline({
      anchorDate: anchor, offset: spec.offset, count: spec.count,
      inclusive: spec.inclusive, rollover, holidays, anchorLabel: anchorWords,
    });
    if (!c) { if (old) out.push(old); return; }

    const next = {
      key: spec.key,
      label: spec.label || (old && old.label) || spec.key,
      date: c.date,
      offset: spec.offset, count: c.count, inclusive: c.inclusive,
      anchor: spec.anchor || 'effective',
      rule: c.rule, explain: c.explain, skipped: c.skipped, rolled: c.rolled,
      status: (old && old.status) || 'open',
      source: (old && old.source) || 'default',
      quote: (old && old.quote) || '',
      confidence: (old && old.confidence) || null,
      assignee: (old && old.assignee) || (o.assignee || null),
      eventId: (old && old.eventId) || null,
      remindersSent: (old && old.remindersSent) || {},
      notes: (old && old.notes) || '',
    };
    out.push(next);
    if (!old) added.push({ key: next.key, label: next.label, date: next.date });
    else if (old.date !== next.date) moved.push({ key: next.key, label: next.label, from: old.date, to: next.date });
    else kept.push({ key: next.key, label: next.label, date: next.date, why: 'unchanged' });
  });

  /* keep any deadline that wasn't in the spec list (contract-only clauses) */
  prev.forEach(d => {
    if (!d || !d.key || out.some(x => x.key === d.key)) return;
    if (UNMET(d) && !d.absolute && d.source !== 'manual' && Number.isFinite(d.offset)) {
      const anchor = d.anchor === 'close' ? closeDate : effective;
      const c = isDate(anchor) ? computeDeadline({
        anchorDate: anchor, offset: d.offset, count: d.count, inclusive: d.inclusive,
        rollover, holidays, anchorLabel: d.anchor === 'close' ? 'closing date' : 'effective date',
      }) : null;
      if (c) {
        const next = { ...d, date: c.date, rule: c.rule, explain: c.explain, skipped: c.skipped, rolled: c.rolled };
        out.push(next);
        if (d.date !== next.date) moved.push({ key: d.key, label: d.label, from: d.date, to: next.date });
        else kept.push({ key: d.key, label: d.label, date: d.date, why: 'unchanged' });
        return;
      }
    }
    out.push(d);
    kept.push({ key: d.key, label: d.label, date: d.date,
      why: !UNMET(d) ? `already ${d.status}` : d.absolute ? 'contract states an absolute date' : 'entered by hand' });
  });

  out.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
  return { deadlines: out, moved, kept, added };
}

/** urgency bucket used for colour + the 48-hour flag */
export function urgency(d, tz) {
  if (!d) return 'none';
  if (d.status === 'met') return 'met';
  if (d.status === 'waived') return 'waived';
  const iso = d.status === 'extended' && d.extendedTo ? d.extendedTo : d.date;
  const n = daysUntil(iso, tz);
  if (n == null) return 'none';
  if (n < 0) return 'overdue';
  if (n <= 2) return 'urgent';
  if (n <= 7) return 'soon';
  return 'far';
}

export const effectiveDateOf = d => (d && d.status === 'extended' && d.extendedTo ? d.extendedTo : d && d.date);
