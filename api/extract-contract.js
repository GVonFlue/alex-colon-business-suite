import { guard, sweep } from './_guard.js';
import { aiKey, logAiFailure } from './_aikey.js';
/* ============================================================================
   POST /api/extract-contract

   Reads an executed real-estate contract PDF and returns the parties, the
   property, the money and every date or deadline clause it can find.

   TWO THINGS THIS ROUTE DELIBERATELY DOES NOT DO
   ----------------------------------------------
   1. It does not do date arithmetic. For a relative clause ("within five (5)
      business days of the Effective Date") it returns the RULE — offset, count
      method, inclusive/exclusive, anchor — and the app computes the date with
      src/lib/dates.js, which is unit tested. A model that can count business
      days over a holiday list on a good day is still a model. The arithmetic
      shown to the agent has to come from code.
   2. It does not interpret. No opinion on whether a term is favourable, no
      advice on remedies, no summary of obligations. Extraction only. That is a
      hard line in the system prompt and it is repeated per field.

   Everything is returned with the SOURCE QUOTE that produced it and a
   confidence. Anything ambiguous, unreadable or contradictory comes back in
   `unresolved` rather than as a confident guess — a blank the agent fills in
   beats a wrong date that looks right.

   The client creates NOTHING from this response until a human confirms it.

   Env (Vercel → Settings → Environment Variables):
     ANTHROPIC_API_KEY   sk-ant-...
   ========================================================================== */

/* Current Sonnet as of July 2026. Overridable per install in
   Settings -> Contracts, and by payload.model when it starts with 'claude-'. */
const MODEL_DEFAULT = 'claude-sonnet-5';
const MAX_PDF_BYTES = 24 * 1024 * 1024;

const SYSTEM = `You extract structured data from executed United States real-estate purchase contracts.

Rules you must follow exactly:

1. EXTRACTION ONLY. Never interpret, summarise obligations, assess whether a term
   is favourable, or suggest remedies. You are not giving legal advice and must not
   phrase anything as advice.
2. NEVER compute a date. When a clause is relative ("within five (5) business days
   after the Effective Date"), return the rule: the number of days, whether the
   contract says business or calendar days, whether it counts from the anchor day
   itself, and which date it counts from. The calling application does the
   arithmetic. Only return a date when the contract states an actual date.
3. Every value you return carries the verbatim source quote it came from. Quote the
   contract, do not paraphrase it. Keep quotes under 300 characters.
4. Confidence is honest: 0.9+ only when the clause is explicit and unambiguous.
   Anything you are guessing at belongs in "unresolved" with the quote and the
   reason, NOT in the extracted fields with a low confidence attached.
5. If the document is not a real-estate purchase contract, or is unreadable, say so
   in "documentType" and return empty fields rather than inventing plausible ones.
6. Return STRICT JSON only. No markdown, no code fences, no commentary.`;

const SCHEMA_NOTE = `Return exactly this shape:

{
  "documentType": "purchase_contract" | "addendum" | "amendment" | "other" | "unreadable",
  "documentNote": "one factual sentence about what the document is",
  "parties": { "buyers": ["..."], "sellers": ["..."], "quote": "...", "confidence": 0.0 },
  "property": { "address": "...", "mls": "...", "quote": "...", "confidence": 0.0 },
  "money": {
    "purchasePrice": 0, "purchasePriceQuote": "...", "purchasePriceConfidence": 0.0,
    "earnestAmount": 0, "earnestQuote": "...", "earnestConfidence": 0.0,
    "concessions": 0, "concessionsQuote": ""
  },
  "effective": { "date": "YYYY-MM-DD" | null, "quote": "...", "confidence": 0.0,
                 "note": "what the contract calls it — Effective Date, Binding Agreement Date, etc." },
  "closing":   { "date": "YYYY-MM-DD" | null, "quote": "...", "confidence": 0.0,
                 "possessionDate": "YYYY-MM-DD" | null, "possessionTime": "...", "possessionQuote": "" },
  "deadlines": [
    {
      "key": "short_snake_case_key",
      "label": "Human label, e.g. Inspection objections due",
      "kind": "relative" | "absolute",
      "date": "YYYY-MM-DD" | null,        // absolute only
      "offset": 0,                         // relative only, negative = before the anchor
      "count": "business" | "calendar",    // exactly what the contract says
      "inclusive": false,                  // true only if the contract counts the anchor day itself
      "anchor": "effective" | "close",
      "quote": "verbatim clause",
      "confidence": 0.0,
      "note": ""
    }
  ],
  "unresolved": [ { "label": "...", "quote": "...", "why": "ambiguous | contradictory | unreadable | missing" } ]
}

Look for at least these deadlines when present: earnest money delivery, inspection
period, inspection objection, seller response to objections, appraisal ordered and
received, financing / loan commitment, title commitment delivery and objection,
survey, HOA document delivery and review period, final walkthrough, closing,
possession, and any addendum-specific deadline. Use "calendar" only when the
contract says days without qualifying them, and say so in "note".`;

const clean = s => String(s == null ? '' : s).trim();
const num = v => { const n = Number(String(v).replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : 0; };
const conf = v => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : null; };
const isoOrNull = v => (/^\d{4}-\d{2}-\d{2}$/.test(clean(v)) ? clean(v) : null);
const quote = s => clean(s).replace(/\s+/g, ' ').slice(0, 300);

/** strip fences, find the outermost object, parse. Never eval, never trust. */
function parseStrict(text) {
  let t = clean(text).replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); } catch {}
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch {} }
  return null;
}

/** coerce whatever came back into the shape the app expects. */
function shape(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const p = r.parties && typeof r.parties === 'object' ? r.parties : {};
  const prop = r.property && typeof r.property === 'object' ? r.property : {};
  const m = r.money && typeof r.money === 'object' ? r.money : {};
  const eff = r.effective && typeof r.effective === 'object' ? r.effective : {};
  const cl = r.closing && typeof r.closing === 'object' ? r.closing : {};

  const seen = new Set();
  const deadlines = (Array.isArray(r.deadlines) ? r.deadlines : []).map((d, i) => {
    const o = d && typeof d === 'object' ? d : {};
    let key = clean(o.key).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || `clause_${i + 1}`;
    while (seen.has(key)) key += '_2';
    seen.add(key);
    const kind = o.kind === 'absolute' ? 'absolute' : 'relative';
    return {
      key,
      label: clean(o.label) || key.replace(/_/g, ' '),
      kind,
      date: kind === 'absolute' ? isoOrNull(o.date) : null,
      offset: kind === 'relative' ? Math.trunc(Number(o.offset) || 0) : null,
      count: o.count === 'business' ? 'business' : 'calendar',
      inclusive: !!o.inclusive,
      anchor: o.anchor === 'close' ? 'close' : 'effective',
      quote: quote(o.quote),
      confidence: conf(o.confidence),
      note: clean(o.note).slice(0, 240),
    };
  }).filter(d => d.kind === 'absolute' ? !!d.date : Number.isFinite(d.offset));

  return {
    documentType: ['purchase_contract', 'addendum', 'amendment', 'other', 'unreadable'].includes(r.documentType)
      ? r.documentType : 'other',
    documentNote: clean(r.documentNote).slice(0, 300),
    parties: {
      buyers: (Array.isArray(p.buyers) ? p.buyers : []).map(clean).filter(Boolean).slice(0, 8),
      sellers: (Array.isArray(p.sellers) ? p.sellers : []).map(clean).filter(Boolean).slice(0, 8),
      quote: quote(p.quote), confidence: conf(p.confidence),
    },
    property: { address: clean(prop.address), mls: clean(prop.mls), quote: quote(prop.quote), confidence: conf(prop.confidence) },
    money: {
      purchasePrice: num(m.purchasePrice), purchasePriceQuote: quote(m.purchasePriceQuote), purchasePriceConfidence: conf(m.purchasePriceConfidence),
      earnestAmount: num(m.earnestAmount), earnestQuote: quote(m.earnestQuote), earnestConfidence: conf(m.earnestConfidence),
      concessions: num(m.concessions), concessionsQuote: quote(m.concessionsQuote),
    },
    effective: { date: isoOrNull(eff.date), quote: quote(eff.quote), confidence: conf(eff.confidence), note: clean(eff.note).slice(0, 200) },
    closing: {
      date: isoOrNull(cl.date), quote: quote(cl.quote), confidence: conf(cl.confidence),
      possessionDate: isoOrNull(cl.possessionDate), possessionTime: clean(cl.possessionTime).slice(0, 60),
      possessionQuote: quote(cl.possessionQuote),
    },
    deadlines,
    unresolved: (Array.isArray(r.unresolved) ? r.unresolved : []).map(u => ({
      label: clean(u && u.label).slice(0, 160),
      quote: quote(u && u.quote),
      why: ['ambiguous', 'contradictory', 'unreadable', 'missing'].includes(u && u.why) ? u.why : 'ambiguous',
    })).filter(u => u.label).slice(0, 25),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, reason: 'method', error: 'POST only' });
  /* a scanned contract, same reasoning as the receipt above. Signed-in users only: before this, anyone who found
     the URL could spend this install's Anthropic key. */
  const gate = await guard(req, res, {
    name: 'extract-contract', perIp: 20, windowMin: 10, perDay: 400,
    maxChars: 8000000, requireAuth: true,
  });
  if (!gate.ok) return;
  sweep();


  const KEY = aiKey('extract-contract');
  if (!KEY) return res.status(200).json({ ok: false, reason: 'not_configured' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  const pdf = clean(body.pdf).replace(/^data:application\/pdf;base64,/, '');
  if (!pdf) return res.status(200).json({ ok: false, reason: 'no_file' });
  if (pdf.length * 0.75 > MAX_PDF_BYTES) return res.status(200).json({ ok: false, reason: 'too_large' });

  const model = /^claude-/.test(clean(body.model)) ? clean(body.model) : MODEL_DEFAULT;
  const isAddendum = !!body.isAddendum;

  const ask = [
    SCHEMA_NOTE,
    isAddendum
      ? 'This document is being uploaded against an existing transaction, so it is likely an addendum or amendment. Extract only what THIS document states. If it changes the effective date or a deadline, return that deadline; do not repeat deadlines it does not mention.'
      : 'This is the executed contract for a transaction being set up.',
    body.knownAddress ? `For context only, the agent believes the property is: ${clean(body.knownAddress)}. Do not let this override what the document says.` : '',
    'Extract now. STRICT JSON only.',
  ].filter(Boolean).join('\n\n');

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model,
        max_tokens: 8000,
        temperature: 0,
        system: SYSTEM,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf } },
            { type: 'text', text: ask },
          ],
        }],
      }),
    });

    const j = await r.json().catch(() => null);
    if (!r.ok) {
      logAiFailure('extract-contract', r.status, j);
      return res.status(200).json({ ok: false, reason: 'api_error', status: r.status,
        detail: (j && (j.error?.message || j.message)) || 'The model call failed.' });
    }

    const text = (j && Array.isArray(j.content) ? j.content : [])
      .filter(c => c && c.type === 'text').map(c => c.text).join('\n');
    const parsed = parseStrict(text);
    if (!parsed) {
      /* malformed response is "extraction failed, enter manually" — never a crash */
      return res.status(200).json({ ok: false, reason: 'bad_json', raw: clean(text).slice(0, 2000) });
    }

    const data = shape(parsed);
    return res.status(200).json({
      ok: true, model, data,
      usage: j && j.usage ? { in: j.usage.input_tokens, out: j.usage.output_tokens } : null,
    });
  } catch (e) {
    return res.status(200).json({ ok: false, reason: 'network', detail: String((e && e.message) || e) });
  }
}
