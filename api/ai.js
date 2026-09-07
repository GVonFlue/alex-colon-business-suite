import { guard, sweep } from './_guard.js';
import { aiKey, logAiFailure } from './_aikey.js';
/* ============================================================================
   POST /api/ai — one route, several jobs.

   { job, payload } in, JSON out. The Anthropic key is read from
   process.env.ANTHROPIC_API_KEY and NEVER leaves this file; nothing in src/
   knows it exists.

   Three rules this route exists to enforce:

   1. THE MODEL DOES NOT DO ARITHMETIC. Every dollar figure on a net sheet or an
      offer comparison is computed here in JS from the numbers the agent typed,
      and the model is handed the finished totals so it can only write words
      about them. A hallucinated subtotal on a client-facing net sheet is worse
      than no net sheet at all.
   2. FAIL SOFT, ALWAYS HTTP 200. No key -> {ok:false,reason:'not_configured'}.
      Malformed model output -> {ok:false,reason:'bad_json',raw} so the UI can
      say "that came back malformed, try again" instead of throwing. The only
      non-200 is a non-POST request.
   3. NO LEGAL ADVICE, NO VALUATIONS. Both are in the system prompt of every job
      that could drift into them, in the words the job actually needs.

   Parsing is defensive and never uses eval: fences stripped, JSON.parse in a
   try, one salvage attempt on the outermost {...}, then give up honestly.

   job === 'probe' answers whether the key is set without calling the model, so
   the UI can hide its Generate buttons before spending a token.
   ========================================================================== */

const API = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

/* Sonnet for anything a client will read. Haiku for extraction/classification
   shaped work, where the job is pattern-spotting rather than judgement. */
const SONNET = 'claude-sonnet-5';
const HAIKU = 'claude-haiku-4-5';   // alias, resolves to claude-haiku-4-5-20251001

const TIMEOUT_MS = 45000;

/* ------------------------------------------------------------------ helpers */

const num = v => {
  const n = Number(String(v == null ? '' : v).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const r2 = v => Math.round(num(v) * 100) / 100;
const usd = v => '$' + Math.round(num(v)).toLocaleString('en-US');
const str = (v, max) => String(v == null ? '' : v).slice(0, max || 2000).trim();
const arr = v => (Array.isArray(v) ? v : []);
/** array of plain strings out of whatever the model returned */
const strs = (v, n, max) => arr(v)
  .map(x => (typeof x === 'string' ? x : (x && (x.text || x.caption || x.title || x.label || x.theme)) || ''))
  .map(s => str(s, max || 600))
  .filter(Boolean)
  .slice(0, n || 6);

/** strip fences, parse, salvage once, never eval */
function readJson(text) {
  let t = String(text || '').trim();
  t = t.replace(/^```[a-zA-Z]*\s*/, '').replace(/```\s*$/, '').trim();
  const attempt = s => { try { const v = JSON.parse(s); return v && typeof v === 'object' ? v : null; } catch { return null; } };
  const direct = attempt(t);
  if (direct) return direct;
  const i = t.indexOf('{'), j = t.lastIndexOf('}');
  if (i >= 0 && j > i) return attempt(t.slice(i, j + 1));
  return null;
}

/** hard character cap. The model is told the limit; this is the belt to that
    braces, cutting at a sentence then a word boundary rather than mid-syllable. */
function clip(text, limit) {
  const s = String(text || '').trim();
  if (!limit || s.length <= limit) return { text: s, truncated: false };
  let cut = s.slice(0, limit);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (stop > limit * 0.6) cut = cut.slice(0, stop + 1);
  else { const sp = cut.lastIndexOf(' '); if (sp > limit * 0.5) cut = cut.slice(0, sp); }
  return { text: cut.trim(), truncated: true };
}

/* ------------------------------------------------------- standing guardrails */

const NO_LEGAL = 'You never give legal advice. Describe contract terms in plain factual language only — never say what a party is required, entitled or permitted to do, never interpret a remedy or a deadline consequence, and if the reader would need that, say it is a question for their broker or an attorney.';
const NO_VALUE = 'You never state, estimate, imply or hint at a property value, appraised value, CMA, market value or recommended list price. Not as a range, not as a comparison, not as "homes like this".';
const NO_INVENT = 'Never invent a number, name, date, feature or event. Every fact you use must appear in the input. If something is missing, write around it rather than guessing.';
const JSON_ONLY = 'Reply with STRICT JSON and nothing else: no markdown fences, no preamble, no trailing commentary.';
const FAIR_HOUSING = 'Fair housing: describe the property, never the people who should live in it. No reference to race, colour, religion, sex, familial status, national origin, disability or any coded equivalent ("safe neighbourhood", "great for a young family", "walk to church", "exclusive area").';

/* ============================================================================
   money, computed in JS
   ========================================================================== */

/** The seller's side of a closing statement. Sale price in, deductions out,
    net at the bottom. Rows carry a deterministic note so the sheet still reads
    like English with no model in the loop at all. */
function netSheet(p) {
  const price = r2(p.salePrice);
  const rate = num(p.commissionRate);
  const flat = num(p.commissionFlat);
  const commission = flat > 0 ? r2(flat) : r2(price * rate / 100);

  const out = [];
  const push = (key, label, amount, note) => {
    const a = r2(amount);
    if (key !== 'price' && a === 0) return;
    out.push({ key, label, amount: a, note: note || '' });
  };

  push('price', 'Sale price', price, 'The contract price before any deductions.');
  push('payoff', 'Loan payoff', -num(p.payoff), 'Your lender sets the exact payoff, including interest to the closing date.');
  push('commission', 'Real estate commission', -commission,
    flat > 0 ? 'Flat fee as agreed in the listing agreement.' : `${rate}% of ${usd(price)}, split as set out in the listing agreement.`);
  push('closing', 'Seller closing costs', -num(p.closingCosts), 'Title, escrow, recording and settlement fees.');
  push('taxes', 'Property tax proration', -num(p.taxes), 'Prorated to the closing date; the title company sets the final figure.');
  push('concessions', 'Buyer concessions / credits', -num(p.concessions), 'Credited to the buyer at closing under the contract.');
  push('other', 'Other', -num(p.other), str(p.otherNote, 200) || 'Repairs, HOA transfer, home warranty and anything else agreed.');

  const deductions = r2(out.filter(r => r.key !== 'price').reduce((s, r) => s + r.amount, 0));
  const net = r2(price + deductions);
  return { rows: out, deductions, net, commission, price };
}

/** One offer's seller-side net proceeds. Same waterfall as the net sheet, run
    per offer so two offers are compared on money that lands, not sticker price. */
function offerTable(p) {
  const rate = num(p.commissionRate);
  const shared = r2(num(p.payoff) + num(p.closingCosts) + num(p.taxes) + num(p.other));
  return arr(p.offers).slice(0, 6).map((o, i) => {
    const price = r2(o.price);
    const flat = num(o.commissionFlat);
    const commission = flat > 0 ? r2(flat) : r2(price * rate / 100);
    const concessions = r2(num(o.concessions) + num(o.repairCredits));
    const deductions = r2(commission + shared + concessions);
    return {
      index: i,
      offer: str(o.label, 60) || `Offer ${i + 1}`,
      price,
      commission,
      concessions,
      deductions,
      netProceeds: r2(price - deductions),
      financing: str(o.financing, 60),
      earnest: r2(o.earnest),
      contingencies: strs(o.contingencies, 8, 80),
      closeDate: str(o.closeDate, 10),
      possession: str(o.possession, 80),
      appraisalGap: r2(o.appraisalGap),
      notes: str(o.notes, 400),
      terms: '',
      risks: '',
    };
  });
}

/* ============================================================================
   the jobs
   Each builder returns { model, max_tokens, system, user, computed, shape }.
   `computed` is echoed on failure responses too, so a bad_json reply still
   carries the arithmetic the UI can render without the model.
   ========================================================================== */

const JOBS = {

  /* ------------------------------------------------------ listing description */
  'listing-description': p => {
    const limit = Math.max(200, Math.min(4000, Math.round(num(p.mlsLimit) || 1000)));
    const facts = {
      address: str(p.address, 200),
      area: str(Array.isArray(p.areas) ? p.areas.join(', ') : (p.area || p.areas), 200),
      propertyType: str(p.propertyType, 60),
      beds: num(p.beds) || null,
      baths: num(p.baths) || null,
      sqft: num(p.sqft) || null,
      lot: str(p.lot, 60),
      yearBuilt: str(p.yearBuilt, 12),
      garage: str(p.garage, 80),
      listPrice: num(p.price) ? usd(p.price) : null,
      features: str(p.features, 1600),
      recentUpdates: str(p.updates, 600),
      showingNotes: str(p.notes, 600),
      tone: str(p.tone, 60) || 'warm, concrete, no hype',
    };
    return {
      model: SONNET,
      max_tokens: 1600,
      system: [
        'You write listing copy for a licensed real estate agent, who edits every word before it is published. You are a first draft, not a publisher.',
        'Write only from the details given. Do not add finishes, schools, commute times, neighbourhood claims or lifestyle promises that are not in the input.',
        NO_VALUE,
        FAIR_HOUSING,
        NO_INVENT,
        `HARD LIMIT: the MLS description must be at most ${limit} characters including spaces and punctuation. Count as you write. If you are close, cut adjectives, not facts.`,
        'Social captions: 2 or 3, each under 280 characters, each usable on its own. No hashtag walls — three at most.',
        'Email blast: first line is "Subject: ..." then a blank line, then a short body an agent could send to their database today.',
        JSON_ONLY,
        'Shape: {"mls":"string","social":["string"],"email":"string"}',
      ].join('\n'),
      user: 'Property details:\n' + JSON.stringify(facts, null, 1),
      computed: { mlsLimit: limit },
      shape: j => {
        const c = clip(str(j.mls, limit * 4), limit);
        return {
          mls: c.text,
          mlsChars: c.text.length,
          mlsLimit: limit,
          mlsTruncated: c.truncated,
          social: strs(j.social, 3, 400),
          email: str(j.email, 4000),
        };
      },
    };
  },

  /* ------------------------------------------------------------- net sheet
     Arithmetic in JS. The model writes the notes column and the paragraph the
     seller reads, and is told in as many words that the numbers are settled. */
  'net-sheet': p => {
    const c = netSheet(p);
    return {
      model: SONNET,
      max_tokens: 1200,
      system: [
        'You annotate a seller net sheet that has ALREADY been calculated. The numbers are final and correct. You do not add, subtract, restate, round or check them, and you never produce a figure of your own.',
        'For each row you are given, write one short plain-language sentence explaining what that line is and who determines it. Speak to the seller, not to the agent.',
        'Then write a 2-3 sentence summary that says what the seller walks away with and that every figure is an estimate until the title company issues the settlement statement.',
        NO_VALUE,
        NO_LEGAL,
        NO_INVENT,
        JSON_ONLY,
        'Shape: {"notes":{"<row key>":"one sentence"},"summary":"2-3 sentences"}',
      ].join('\n'),
      user: 'Net sheet, already computed:\n' + JSON.stringify({
        property: str(p.address, 200),
        seller: str(p.sellerName, 120),
        closingDate: str(p.closeDate, 10),
        rows: c.rows.map(r => ({ key: r.key, label: r.label, amount: r.amount, display: usd(r.amount) })),
        estimatedNetToSeller: c.net,
        estimatedNetDisplay: usd(c.net),
      }, null, 1),
      computed: { rows: c.rows, net: c.net, deductions: c.deductions },
      shape: j => {
        const given = (j && typeof j.notes === 'object' && j.notes) || {};
        const notes = {};
        const rows = c.rows.map(r => {
          const n = str(given[r.key], 300);
          const note = n || r.note;
          notes[r.key] = note;
          return { ...r, note };
        });
        return { rows, net: c.net, deductions: c.deductions, notes, summary: str(j.summary, 1200) };
      },
    };
  },

  /* ------------------------------------------------------ offer comparison
     Net proceeds per offer computed in JS. The model writes the terms and risk
     columns and the seller-facing summary — words, not numbers. */
  'offer-comparison': p => {
    const table = offerTable(p);
    return {
      model: SONNET,
      max_tokens: 1800,
      system: [
        'You help a listing agent lay several offers side by side for their seller. Net proceeds have ALREADY been calculated for every offer; treat them as final and never compute, adjust or second-guess a figure.',
        'For each offer write two things: "terms" — what this offer actually asks for, in plain language (financing, earnest money, contingencies, timing, possession); and "risks" — what could realistically slow it down or cost the seller money, based only on what is in front of you.',
        'Then write a summary for the seller comparing the offers on money, certainty and timing. Say plainly if the highest price is not the strongest offer. Do not tell the seller which offer to take — lay it out so they can choose.',
        NO_LEGAL,
        NO_VALUE,
        NO_INVENT,
        'Do not describe any offer as legally binding, enforceable, safe or protected.',
        JSON_ONLY,
        'Shape: {"offers":[{"index":0,"terms":"string","risks":"string"}],"summary":"string"}',
      ].join('\n'),
      user: 'Offers on one listing, net proceeds already computed:\n' + JSON.stringify({
        property: str(p.address, 200),
        sellerCosts: {
          payoff: r2(p.payoff), closingCosts: r2(p.closingCosts),
          taxProration: r2(p.taxes), other: r2(p.other), commissionRate: num(p.commissionRate),
        },
        sellerPriorities: str(p.priorities, 400),
        offers: table.map(o => ({
          index: o.index, offer: o.offer, price: o.price, priceDisplay: usd(o.price),
          financing: o.financing, earnest: o.earnest, concessionsAndCredits: o.concessions,
          contingencies: o.contingencies, closeDate: o.closeDate, possession: o.possession,
          appraisalGapCoverage: o.appraisalGap || null, agentNotes: o.notes,
          netProceeds: o.netProceeds, netProceedsDisplay: usd(o.netProceeds),
        })),
      }, null, 1),
      computed: { table },
      shape: j => {
        const by = {};
        arr(j.offers).forEach(o => {
          if (!o || typeof o !== 'object') return;
          const i = Math.trunc(num(o.index));
          if (!table[i]) return;
          by[i] = { terms: str(o.terms, 800), risks: str(o.risks, 800) };
        });
        return {
          table: table.map(o => ({ ...o, terms: (by[o.index] && by[o.index].terms) || '', risks: (by[o.index] && by[o.index].risks) || '' })),
          commentary: table.map(o => ({ index: o.index, terms: (by[o.index] && by[o.index].terms) || '', risks: (by[o.index] && by[o.index].risks) || '' })),
          summary: str(j.summary, 1600),
        };
      },
    };
  },

  /* ---------------------------------------------------------- weekly update */
  'weekly-update': p => {
    const dates = arr(p.dates).slice(0, 20).map(d => ({
      label: str(d.label, 80), date: str(d.date, 10), status: str(d.status, 12) || 'open',
      daysAway: Number.isFinite(Number(d.daysAway)) ? Math.trunc(Number(d.daysAway)) : null,
    })).filter(d => d.label && d.date);
    return {
      model: SONNET,
      max_tokens: 1200,
      system: [
        'You draft the weekly "here is where we are" email an agent sends to one side of a transaction. The agent edits and sends it; you never send anything.',
        'Structure: one sentence on where the deal stands, then what is done, then what is next with the dates it hangs on, then one clear ask if there is one. Short paragraphs or a short list. No filler, no exclamation marks, no congratulating anyone twice.',
        'Use only the dates given, and write them the way they are given to you. Never move, recompute or infer a date, and never predict a date the input does not contain.',
        NO_LEGAL,
        NO_VALUE,
        NO_INVENT,
        'Do not promise an outcome. "The appraisal is ordered" is fine; "the appraisal will come in fine" is not.',
        JSON_ONLY,
        'Shape: {"subject":"string","body":"string"}',
      ].join('\n'),
      user: 'Transaction:\n' + JSON.stringify({
        writingTo: str(p.audience, 60) || (str(p.side, 10) === 'buyer' ? 'the buyer' : 'the seller'),
        clientName: str(p.clientName, 120),
        agentName: str(p.agentName, 120),
        brokerage: str(p.brokerage, 120),
        property: str(p.address, 200),
        side: str(p.side, 10),
        phase: str(p.phase, 60),
        closeDate: str(p.closeDate, 10),
        effectiveDate: str(p.effectiveDate, 10),
        titleCompany: str(p.titleCompany, 120),
        lender: str(p.lender, 120),
        done: strs(p.done, 30, 120),
        open: strs(p.open, 30, 120),
        criticalDates: dates,
        agentNotes: str(p.notes, 800),
      }, null, 1),
      computed: { dates },
      shape: j => ({ subject: str(j.subject, 200), body: str(j.body, 4000), dates }),
    };
  },

  /* --------------------------------------------------------- showing digest
     Extraction shaped: read N pieces of feedback, name the pattern. Haiku. */
  'showing-digest': p => {
    const entries = arr(p.entries).slice(0, 40).map((e, i) => ({
      n: i + 1, at: str(e.at, 10), from: str(e.from, 80), text: str(e.text || e.note, 900),
    })).filter(e => e.text);
    return {
      model: HAIKU,
      max_tokens: 1400,
      system: [
        'You compile showing feedback on one listing into a weekly report the agent sends to their seller. You are reading what other agents and buyers said and reporting the pattern.',
        'Summary: 2-4 sentences on what the week of showings actually said. Quote the feedback rather than characterising it.',
        'Themes: the repeated points, most-mentioned first, each naming how many pieces of feedback raised it. Only patterns that appear more than once are themes.',
        NO_VALUE,
        'You may include ONE recommendation ONLY when the feedback itself makes the pattern unmistakable (for example most visitors raising the same room, the same condition item, or the same reaction to price). Write it as a talking point off the feedback — "four of six agents mentioned the kitchen, worth discussing whether to address it or reflect it" — attributed to the feedback, never as your own view, never as a number, never as a price change, never as a valuation or CMA. If the feedback does not clearly support one, return an empty string. An empty recommendation is the correct answer more often than not.',
        NO_INVENT,
        JSON_ONLY,
        'Shape: {"summary":"string","themes":["string"],"recommendation":"string or empty"}',
      ].join('\n'),
      user: 'Listing and feedback:\n' + JSON.stringify({
        property: str(p.address, 200),
        listPrice: num(p.price) ? usd(p.price) : null,
        daysOnMarket: num(p.daysOnMarket) || null,
        showingCount: entries.length,
        weekOf: str(p.weekOf, 10),
        feedback: entries,
      }, null, 1),
      computed: { entryCount: entries.length },
      shape: j => ({
        summary: str(j.summary, 1600),
        themes: strs(j.themes, 8, 300),
        recommendation: str(j.recommendation, 600),
        entryCount: entries.length,
      }),
    };
  },

  /* ------------------------------------------------------------ reactivation
     Short, specific, one contact. Haiku: the work is picking the right detail
     out of the history, not composing prose. */
  reactivation: p => ({
    model: HAIKU,
    max_tokens: 700,
    system: [
      'You draft a short personal check-in an agent sends to someone they have not spoken to in a while. The agent edits and sends it.',
      'The whole point is the specific reference: the draft must mention what was actually last discussed, by name or detail, in the first two sentences. A message that would work for any contact is a failed draft.',
      'Under 90 words. No market commentary, no "just checking in", no "I wanted to reach out", no pressure, no availability calendar, no sales close. End with one easy, low-stakes question.',
      NO_VALUE,
      NO_INVENT,
      'Do not claim anything happened since the last conversation. You only know what is in the input.',
      JSON_ONLY,
      'Shape: {"subject":"short, human, no colon-heavy marketing","body":"string"}',
    ].join('\n'),
    user: 'Contact:\n' + JSON.stringify({
      name: str(p.name, 120),
      agentName: str(p.agentName, 120),
      side: str(p.side, 10),
      daysSinceTouch: num(p.daysSinceTouch) || null,
      lastConversation: { at: str(p.lastAt, 10), kind: str(p.lastKind, 30), what: str(p.lastNote, 1200) },
      earlierHistory: strs(p.history, 6, 400),
      theyWereLookingFor: str(p.looking, 400),
      timeline: str(p.timeline, 60),
      closedWithUsOn: str(p.closedWithUsOn, 10),
      notes: str(p.notes, 600),
    }, null, 1),
    computed: {},
    shape: j => ({ subject: str(j.subject, 200), body: str(j.body, 2000) }),
  }),

  /* ------------------------------------------------------------------ huddle */
  huddle: p => ({
    model: SONNET,
    max_tokens: 1600,
    system: [
      'You write the readout for a small real estate team\'s Monday huddle. The team can already see the numbers on the screen in front of them; your job is what the numbers MEAN and what to do about them this week.',
      'Be specific and name real people, listings and transactions from the input. "Bluff Ridge inspection objections land Tuesday" beats "several deadlines are approaching".',
      'If the week was thin, say so. Do not cheerlead, do not pad, do not congratulate the team for activity that did not produce anything.',
      'Misses are things that slipped, with why they matter. Focus items are concrete enough to act on today, ordered by what protects or produces the most money.',
      NO_INVENT,
      NO_VALUE,
      NO_LEGAL,
      JSON_ONLY,
      'Shape: {"read":"3-5 sentences","wins":["string"],"misses":["string"],"focus":["string"]}',
    ].join('\n'),
    user: 'The week:\n' + JSON.stringify({
      weekOf: str(p.weekOf, 10),
      team: str(p.team, 120),
      scope: str(p.scope, 60),
      numbers: {
        appointmentsSet: num(p.apptsSet), appointmentsHeld: num(p.apptsHeld),
        agreementsSigned: num(p.agreementsSigned), wentUnderContract: num(p.underContract),
        closed: num(p.closed),
      },
      goals: p.goals && typeof p.goals === 'object' ? p.goals : null,
      perAgent: arr(p.perAgent).slice(0, 25).map(a => ({
        agent: str(a.name, 80), apptsSet: num(a.apptsSet), apptsHeld: num(a.apptsHeld),
        agreementsSigned: num(a.agreementsSigned), underContract: num(a.underContract), closed: num(a.closed),
        activeDeals: num(a.active), staleContacts: num(a.stale),
      })),
      criticalDatesThisWeek: arr(p.dates).slice(0, 25).map(d => ({
        label: str(d.label, 80), date: str(d.date, 10), property: str(d.property, 160),
        status: str(d.status, 12), daysAway: Number.isFinite(Number(d.daysAway)) ? Math.trunc(Number(d.daysAway)) : null,
      })),
      overdue: strs(p.overdue, 15, 200),
      openItems: strs(p.openItems, 20, 200),
      leaderNotedWins: strs(p.wins, 10, 300),
      leaderNotedMisses: strs(p.misses, 10, 300),
      leaderNotes: str(p.notes, 900),
    }, null, 1),
    computed: {},
    shape: j => ({
      read: str(j.read, 2000),
      wins: strs(j.wins, 6, 300),
      misses: strs(j.misses, 6, 300),
      focus: strs(j.focus, 6, 300),
    }),
  }),
};

/* ============================================================================
   handler
   ========================================================================== */

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ ok: false, reason: 'method', error: 'POST only' }); return; }
  /* net sheets and offer comparisons — several per listing appointment, so perIp is generous. Signed-in users only: before this, anyone who found
     the URL could spend this install's Anthropic key. */
  const gate = await guard(req, res, {
    name: 'ai', perIp: 40, windowMin: 10, perDay: 1500,
    maxChars: 200000, requireAuth: true,
  });
  if (!gate.ok) return;
  sweep();


  const key = aiKey('ai');

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body && typeof body === 'object' ? body : {};

  const job = str(body.job, 40);
  const payload = body.payload && typeof body.payload === 'object' ? body.payload : {};

  /* the UI asks this before it draws a single Generate button. No tokens, no
     model, nothing about the key beyond whether it is there. */
  if (job === 'probe') { res.status(200).json({ ok: !!key, reason: key ? 'configured' : 'not_configured' }); return; }

  if (!key) { res.status(200).json({ ok: false, reason: 'not_configured' }); return; }

  const builder = JOBS[job];
  if (!builder) { res.status(200).json({ ok: false, reason: 'unknown_job', job, jobs: Object.keys(JOBS) }); return; }

  let spec;
  try { spec = builder(payload); }
  catch (e) { res.status(200).json({ ok: false, reason: 'bad_payload', detail: String((e && e.message) || e) }); return; }

  const computed = spec.computed || {};

  /* per-call model override, but only ever an Anthropic model id */
  const override = str(payload.model, 64);
  const model = /^claude-/.test(override) ? override : spec.model;

  const ac = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ac ? setTimeout(() => { try { ac.abort(); } catch {} }, TIMEOUT_MS) : null;

  let text = '';
  try {
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION },
      signal: ac ? ac.signal : undefined,
      body: JSON.stringify({
        model,
        max_tokens: spec.max_tokens || 1200,
        system: spec.system,
        messages: [{ role: 'user', content: [{ type: 'text', text: spec.user }] }],
      }),
    });

    if (!r.ok) {
      const raw = await r.text().catch(() => '');
      try { logAiFailure('ai', r.status, JSON.parse(raw)); } catch { logAiFailure('ai', r.status, null); }
      let detail = raw.slice(0, 400);
      try { const j = JSON.parse(raw); detail = (j.error && j.error.message) || detail; } catch {}
      res.status(200).json({ ok: false, reason: 'api_error', status: r.status, detail, job, ...computed });
      return;
    }

    const data = await r.json();
    text = arr(data.content).filter(b => b && b.type === 'text').map(b => b.text).join('').trim();
  } catch (e) {
    const aborted = e && (e.name === 'AbortError' || /abort/i.test(String(e.message || '')));
    res.status(200).json({
      ok: false, reason: aborted ? 'timeout' : 'network',
      detail: aborted ? `no response in ${Math.round(TIMEOUT_MS / 1000)}s` : String((e && e.message) || e),
      job, ...computed,
    });
    return;
  } finally {
    if (timer) clearTimeout(timer);
  }

  const parsed = readJson(text);
  if (!parsed) {
    /* the arithmetic still goes back, so a malformed narrative does not cost the
       agent their net sheet */
    res.status(200).json({ ok: false, reason: 'bad_json', raw: text.slice(0, 4000), job, model, ...computed });
    return;
  }

  let shaped;
  try { shaped = spec.shape(parsed); }
  catch (e) {
    res.status(200).json({ ok: false, reason: 'bad_json', raw: text.slice(0, 4000), detail: String((e && e.message) || e), job, model, ...computed });
    return;
  }

  res.status(200).json({ ok: true, job, model, ...shaped });
}
