import { guard, sweep } from './_guard.js';
import { aiKey, logAiFailure } from './_aikey.js';
/* ============================================================================
   POST /api/parse-receipt — reads a receipt (image or PDF) and returns fields.

   Carried over from GVonFlue/proytech-crm and re-pointed at real estate: the
   category list is no longer a hardcoded agency list, it is whatever the install
   has in settings.books.categories, passed in by the caller. Anything the model
   returns that is not in that list comes back as 'Other'.

   Extraction only, and it is a DRAFT: the app pre-fills the expense form and the
   agent saves it. Nothing here writes to the database.

   Accepts either shape, because both exist in the wild:
     { image: 'data:image/jpeg;base64,...' }        (what the Books view sends)
     { file: '<base64>', mime: 'application/pdf' }  (the original route)

   Env: ANTHROPIC_API_KEY (server only).
   ========================================================================== */

const MODEL = 'claude-haiku-4-5';   // extraction / classification — cheap and fast
const DEFAULT_CATEGORIES = ['Mileage', 'Marketing', 'Signage & lockboxes', 'Photography', 'Staging',
  'MLS & dues', 'CE & licensing', 'Client gifts', 'Meals', 'Software', 'Office', 'Other'];

const clean = s => String(s == null ? '' : s).trim();
const num = v => { const n = Number(String(v).replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : 0; };

function parseStrict(text) {
  const t = clean(text).replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); } catch {}
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch {} }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });
  /* a receipt photo arrives base64-encoded, so maxChars is sized for an image rather than for text. Signed-in users only: before this, anyone who found
     the URL could spend this install's Anthropic key. */
  const gate = await guard(req, res, {
    name: 'parse-receipt', perIp: 30, windowMin: 10, perDay: 900,
    maxChars: 8000000, requireAuth: true,
  });
  if (!gate.ok) return;
  sweep();


  const key = aiKey('parse-receipt');
  if (!key) return res.status(200).json({ ok: false, reason: 'not_configured' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  /* accept a data URL or a bare base64 + mime */
  let data = clean(body.file), mime = clean(body.mime);
  const img = clean(body.image);
  if (!data && img) {
    const m = /^data:([^;]+);base64,(.*)$/.exec(img);
    if (m) { mime = m[1]; data = m[2]; } else { data = img; mime = mime || 'image/jpeg'; }
  }
  if (!data) return res.status(200).json({ ok: false, reason: 'no_file' });

  const categories = Array.isArray(body.categories) && body.categories.length
    ? body.categories.map(clean).filter(Boolean) : DEFAULT_CATEGORIES;

  const isPdf = mime.includes('pdf');
  const block = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
    : { type: 'image', source: { type: 'base64', media_type: mime || 'image/jpeg', data } };

  const prompt = 'You are reading a real-estate agent\'s business expense receipt. Extract the details and respond with '
    + 'ONLY minified JSON, no markdown, no prose: '
    + '{"vendor":string,"date":"YYYY-MM-DD","total":number,"tax":number,"category":string,"summary":string,"confidence":number}. '
    + `category must be exactly one of: ${categories.join(', ')}. `
    + 'total is the final amount paid as a number with no currency symbol. If a field is unreadable use "" for strings '
    + 'and 0 for numbers rather than guessing. confidence is 0-1 for the total and the date specifically. '
    + 'summary is a 3-6 word description of what was purchased.';

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: /^claude-/.test(clean(body.model)) ? clean(body.model) : MODEL,
        max_tokens: 700, temperature: 0,
        messages: [{ role: 'user', content: [block, { type: 'text', text: prompt }] }],
      }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) logAiFailure('parse-receipt', r.status, j);
    if (!r.ok) return res.status(200).json({ ok: false, reason: 'api_error', status: r.status,
      detail: (j && (j.error?.message || j.message)) || 'The model call failed.' });

    const text = (j && Array.isArray(j.content) ? j.content : [])
      .filter(c => c && c.type === 'text').map(c => c.text).join('\n');
    const p = parseStrict(text);
    if (!p) return res.status(200).json({ ok: false, reason: 'bad_json', raw: clean(text).slice(0, 800) });

    const cat = clean(p.category);
    const draft = {
      vendor: clean(p.vendor).slice(0, 120),
      date: /^\d{4}-\d{2}-\d{2}$/.test(clean(p.date)) ? clean(p.date) : '',
      total: num(p.total),
      tax: num(p.tax),
      category: categories.includes(cat) ? cat : 'Other',
      summary: clean(p.summary).slice(0, 160),
      confidence: Number.isFinite(Number(p.confidence)) ? Math.max(0, Math.min(1, Number(p.confidence))) : null,
    };
    /* legacy shape kept alongside the new one so either client works */
    return res.status(200).json({ ok: true, draft, ...draft });
  } catch (e) {
    return res.status(200).json({ ok: false, reason: 'network', detail: String(e.message || e) });
  }
}
