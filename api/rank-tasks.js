import { guard, sweep } from './_guard.js';
import { costOf, logSpend } from './_spend.js';

/* ============================================================================
   api/rank-tasks.js — ranks the open task list with Claude.

   Ported from ProyTech's endpoint of the same name, with the prompt rewritten.
   That one ranks against "collect $10,000 in cash within 3 weeks", which is
   ProyTech's own sprint goal and means nothing to a real estate agent. Copying
   it verbatim would have produced confident rankings against somebody else's
   business objective, which is worse than no ranking at all.

   WHAT IT RANKS AGAINST HERE: keeping deals alive and keeping leads warm. For
   an agent the expensive failure is not doing the wrong task first, it is a
   contract deadline passing or a new lead going cold, and both of those are
   recoverable only before they happen.

   TWO THINGS THE PROMPT IS TOLD TO RESPECT THAT PROYTECH'S IS NOT:

   1. A contract deadline outranks a judgement call, almost always. The date
      came off a real clause and missing it has consequences a to-do list does
      not. The model is told not to demote one below discretionary work.

   2. Speed to lead. A lead with no first contact attempt is the most
      time-sensitive thing in the business and its value decays in hours, not
      days.

   THE KEY NEVER REACHES THE BROWSER. It lives here, behind guard() with
   requireAuth, per-IP limits and the shared daily dollar ceiling — the same
   protection every other AI route in this install carries.
   ============================================================================ */

const MODEL = 'claude-haiku-4-5';

export default async function handler(req, res) {
  /* Signed-in only, rate limited, and inside the shared daily spend cap.
     `spends: true` opts this route into the same ceiling as ai, jarvis,
     extract-contract and parse-receipt — one budget across all of them, not
     five separate ones. */
  const gate = await guard(req, res, {
    name: 'rank-tasks', perIp: 30, windowMin: 10, perDay: 900,
    maxChars: 120000, requireAuth: true, spends: true,
  });
  if (!gate.ok) return;
  sweep();

  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  const key = process.env.ANTHROPIC_API_KEY;
  /* 200 with ok:false, not a 500. The screen falls back to sorting by impact
     times urgency and says so; an unconfigured key is a setup state, not an
     error the user did anything to cause. */
  if (!key) { res.status(200).json({ ok: false, error: 'AI is not configured on this install' }); return; }

  try {
    const { tasks } = req.body || {};
    if (!Array.isArray(tasks) || !tasks.length) {
      res.status(200).json({ ok: false, error: 'No open tasks to rank' });
      return;
    }

    const list = tasks.slice(0, 300).map(t => ({
      id: String(t.id || ''),
      title: String(t.title || '').slice(0, 300),
      due: String(t.due || ''),
      kind: t.kind === 'deadline' ? 'contract deadline' : 'manual',
      context: String(t.context || '').slice(0, 200),
      impact: Number(t.impact) || 3,
      urgency: Number(t.urgency) || 3,
      effort: Number(t.effort) || 3,
    })).filter(t => t.id && t.title);

    if (!list.length) { res.status(200).json({ ok: false, error: 'No rankable tasks' }); return; }

    const today = new Date().toISOString().slice(0, 10);

    const prompt =
      'You are the operating chief of staff for a single real estate agent working Wichita, Kansas. '
      + 'Rank the open tasks below from most to least important to do next.\n\n'
      + `Today is ${today}.\n\n`
      + 'What matters, in order:\n'
      + '1. CONTRACT DEADLINES. A task marked "contract deadline" came off a real clause in a signed '
      + 'contract. Missing one has consequences a to-do list does not, and it is usually not recoverable. '
      + 'Do not rank one below discretionary work unless it is genuinely weeks away.\n'
      + '2. SPEED TO LEAD. Anything about contacting a new lead for the first time decays in hours. '
      + 'A lead nobody has called yet is the most time-sensitive thing in this business.\n'
      + '3. Keeping a live deal moving. Inspections, appraisals, financing, anything a closing waits on.\n'
      + '4. Work that wins the next deal: appointments, follow-ups, people already in conversation.\n'
      + '5. Everything else, ordered by impact times urgency, with lower effort breaking ties.\n\n'
      + 'Rules:\n'
      + '- Rank EVERY task exactly once. Do not invent, merge, split or drop any.\n'
      + '- Copy each id EXACTLY as given.\n'
      + '- The reason is one short clause, under 12 words, saying WHY it is there. '
      + 'No pep talk, no restating the title.\n'
      + '- Reply with JSON only. No preamble, no markdown fences.\n\n'
      + 'Shape: {"ranking":[{"id":"...","reason":"..."}]}\n\n'
      + 'Tasks:\n' + JSON.stringify(list);

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(45000),
    });

    if (!r.ok) {
      const detail = await r.text();
      console.error('[rank-tasks] model call failed', r.status, detail.slice(0, 400));
      res.status(200).json({ ok: false, error: 'The ranking service did not respond' });
      return;
    }

    const j = await r.json();
    void logSpend('rank-tasks:spend', costOf(MODEL, j.usage));

    const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    /* Fences stripped defensively. The prompt forbids them and the model
       usually obeys, but a JSON.parse that throws on a stray ``` would turn a
       good ranking into a failure the user sees. */
    const clean = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();

    let parsed;
    try { parsed = JSON.parse(clean); }
    catch {
      console.error('[rank-tasks] unparseable reply', clean.slice(0, 300));
      res.status(200).json({ ok: false, error: 'The ranking came back unreadable' });
      return;
    }

    /*
     * Only ids we sent, each at most once.
     *
     * A hallucinated id would land on no task and quietly leave it unranked,
     * and a duplicate would give two tasks the same number. Filtering here
     * rather than trusting the model means the worst case is a partial
     * ranking, which the screen handles, instead of a wrong one.
     */
    const sent = new Set(list.map(t => t.id));
    const seen = new Set();
    const ranking = (Array.isArray(parsed.ranking) ? parsed.ranking : [])
      .filter(x => x && sent.has(String(x.id)) && !seen.has(String(x.id)) && seen.add(String(x.id)))
      .map(x => ({ id: String(x.id), reason: String(x.reason || '').slice(0, 120) }));

    if (!ranking.length) {
      res.status(200).json({ ok: false, error: 'The ranking came back empty' });
      return;
    }

    res.status(200).json({ ok: true, ranking });
  } catch (err) {
    console.error('[rank-tasks] threw', String(err));
    res.status(200).json({ ok: false, error: 'Ranking failed' });
  }
}
