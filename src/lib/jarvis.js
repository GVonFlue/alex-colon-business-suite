/* ============================================================================
   JARVIS — the assistant's brain-side plumbing.

   PORTED FROM GVonFlue/proytech-crm/src/lib/jarvis.js. The architecture, the
   two-tier payload, the action whitelist, the reply parser and the reasoning
   below are that file's, not a fresh design. What changed is listed at the
   bottom of this comment, with why.
   ----------------------------------------------------------------------------
   Everything here is PURE. No React, no Supabase, no fetch. That is deliberate:
   the security-critical parts (what a role is allowed to see, what an action is
   allowed to do) must be unit-testable without a browser, because "I clicked
   around and it looked fine" is not a proof.

   THE ARCHITECTURE, AND WHY
   -------------------------
   Sending the whole database on every question does not fit in a budget, and
   blows past the body cap in api/_guard.js. So the payload is TWO TIERS:

     1. INDEX   — one thin line for EVERY contact the caller may see. No
                  activity, no deadlines. This is what makes "ask it anything"
                  true: the model can see every record exists.

     2. DETAIL  — full history, but only for the handful the question actually
                  touches (matched by name, or pinned by the user).

   The CRM does the arithmetic; the model interprets. Numbers come from the same
   functions the screens use and are passed in as facts.

   REDACTION IS NOT A PROMPT INSTRUCTION
   -------------------------------------
   Telling a model not to mention something is not a control. Money is removed
   HERE, before the payload is built, so the endpoint has nothing to hide
   because there is nothing in it to hide.

   WHAT THE PORT CHANGED, AND WHY
   ------------------------------
   * ONE RECORD BECAME TWO. ProyTech has `leads` — one jsonb row carrying the
     person, the deal and the history together. Dwell splits it: `contacts` is
     the person, `transactions` is the deal, joined by contact_id. So indexLine
     takes a contact AND its transactions, and the money lives on the second
     one. This is the rewrite the schema forced; everything else follows from it.

   * THE MONEY FIELDS ARE DIFFERENT ONES. ProyTech redacts dealValue, retainer,
     payments and commission off a lead. Dwell redacts salePrice,
     commissionRate and commissionSnapshot off a transaction.

   * REDACTION IS NOT A BOOLEAN. ProyTech has two roles and asks `rep`. Dwell
     has three, and a coordinator is the case that boolean cannot express: the
     database hands them every transaction row, salePrice included, and only the
     UI withholds the Commission section. So money visibility is asked PER
     TRANSACTION, from the same role-plus-permissions rule the app's own can()
     uses. See moneyPolicy() below — it is the most important function here.

   * NO PLAYBOOK. ProyTech has kb_notes / kb_published and a kbBlock() in the
     payload. Dwell has no knowledge base, so that block and its prompt section
     are gone rather than stubbed.
   ========================================================================== */

/* Dwell has no playbook, so there is no kbBlock import here. See the port
   notes above. */

/* ------------------------------------------------------------------ basics */
/* Declared before every use. `const` does not hoist and this file is imported
   into a module graph that renders immediately — see ENGINEERING.md §1. */

export const JARVIS_MAX_DETAIL = 6;      // leads hydrated in full per question
export const JARVIS_MAX_ACTS   = 12;     // activities kept per hydrated lead
export const JARVIS_MAX_TURNS  = 6;      // conversation turns replayed
export const JARVIS_MAX_TEXT   = 4000;   // per-field character ceiling

const num = v => { const n = Number(v); return isNaN(n) ? 0 : n; };
const str = (v, cap = 300) => String(v == null ? '' : v).slice(0, cap);
const arr = v => (Array.isArray(v) ? v : []);
const iso = d => {
  const t = new Date(d);
  return isNaN(t) ? '' : `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};

/** Rough token estimate for dense JSON. Punctuation-heavy text tokenises worse
 *  than prose, so 3.6 chars/token is the honest ratio here, not 4. Used for the
 *  budget meter and to decide whether a block is worth caching. */
export const estimateTokens = s => Math.ceil(String(s || '').length / 3.6);

/* --------------------------------------------------------------- redaction */

/** The money that lives on a TRANSACTION. Kept as one list so there is exactly
 *  one place to audit, and so the test asserts against the same list the code
 *  uses rather than a copy of it that can drift.
 *
 *  These are columns the database HANDS OUT. txn_read in MIGRATION.sql grants a
 *  coordinator every transaction row, and salePrice, commissionRate and
 *  commissionSnapshot are on that row — the migration says so out loud. Only
 *  the UI withholds the Commission section from them. That is a fine trade for
 *  a screen and a terrible one for a chat box, which will answer in prose
 *  whatever it is handed. */
export const MONEY_FIELDS = [
  'salePrice', 'commissionRate', 'commissionSnapshot',
  'grossOverride', 'flatCommission', 'referralOut', 'referralOutType',
  'capPaidToDate', 'netToAgent', 'agentNet',
];

/** Strip every money-bearing field from a plain object. Recurses into arrays
 *  and nested objects. Returns a copy; never mutates, because the caller is
 *  holding the live rows. */
export function redactMoney(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(redactMoney);
  const out = {};
  for (const k of Object.keys(obj)) {
    if (MONEY_FIELDS.includes(k)) continue;
    const v = obj[k];
    out[k] = v && typeof v === 'object' ? redactMoney(v) : v;
  }
  return out;
}

/** WHO MAY SEE MONEY, AND ON WHOSE DEAL.
 *
 *  This is the function to read if you read one. ProyTech asked a boolean —
 *  `rep` — because it has two roles and a rep sees no company money at all.
 *  Dwell has three, and the coordinator is precisely the case a boolean cannot
 *  express:
 *
 *    leader       every screen, every figure.
 *    agent        their OWN commission — the Commission screen shows them their
 *                 cap progress — and other people's only if the leader has
 *                 ticked seeOtherCommission / seeTeamCommission.
 *    coordinator  NONE. Not "none unless a box is ticked": App.jsx hard-codes
 *                 seeTeamCommission and seeOtherCommission false for the role
 *                 and drops the Commission and Books sections after the
 *                 per-person list, so no checkbox in Settings can turn them on.
 *                 They read every transaction and no money on any of them.
 *
 *  The rule mirrors App.jsx's can() rather than restating it in different
 *  words: same role names, same permission keys, same precedence. If the two
 *  ever disagree, the app is right and this is the bug.
 *
 *  Returns a PREDICATE over a transaction, not a flag, because the answer
 *  differs per row for an agent: their own deal, yes; the desk next to them,
 *  no. */
export function moneyPolicy({ role, permissions, myUid } = {}) {
  const perms = permissions && typeof permissions === 'object' ? permissions : {};
  if (role === 'leader') return () => true;
  if (role === 'coordinator') return () => false;
  const others = !!(perms.seeOtherCommission || perms.seeTeamCommission);
  return txn => {
    if (others) return true;
    const owner = txn && txn.owner_id;
    return !!(owner && myUid && String(owner) === String(myUid));
  };
}

/** Which contacts this person may have in the payload at all.
 *
 *  Mirrors contacts_read in MIGRATION.sql rather than inventing a second
 *  policy: sees_all_deals() (leader or coordinator), or the rows they own, or
 *  an unclaimed row in one of their pools. If this and the database diverge,
 *  the database wins and this is the bug. */
export function visibleContacts(contacts, { role, myUid, pools } = {}) {
  const all = arr(contacts);
  if (role === 'leader' || role === 'coordinator') return all;
  const mine = new Set(arr(pools).map(String));
  return all.filter(c => {
    if (!c) return false;
    if (c.owner_id && myUid && String(c.owner_id) === String(myUid)) return true;
    return !c.owner_id && c.pool && mine.has(String(c.pool));
  });
}

/** Same rule for transactions — txn_read has no pool clause, so this is
 *  narrower than contacts on purpose. */
export function visibleTxns(txns, { role, myUid } = {}) {
  const all = arr(txns);
  if (role === 'leader' || role === 'coordinator') return all;
  return all.filter(t => t && t.owner_id && myUid && String(t.owner_id) === String(myUid));
}

/* ------------------------------------------------------------ the thin line */

/** Dwell stores lastTouch as a COLUMN, stamped by whoever decided something
 *  counted as a touch — see saveToContact(), which takes an explicit boolean.
 *  So there is nothing to derive here, unlike ProyTech where this walked the
 *  activity array and had to decide what counted.
 *
 *  KNOWN CAVEAT, not fixed here: the CSV import stamps lastTouch = today when
 *  the file has no such column, so an imported contact reads as touched on the
 *  day it arrived. LASTTOUCH-MEASURE.sql sizes it. */
export function lastTouchOf(c) {
  return (c && c.lastTouch) || (c && c.created_at) || null;
}

export function daysSinceOf(ts) {
  if (!ts) return null;
  const t = new Date(ts);
  if (isNaN(t)) return null;
  return Math.floor((Date.now() - t.getTime()) / 86400000);
}

/** One contact, compressed to the smallest thing that still supports a real
 *  answer, with its live transaction folded in. Keys are short on purpose: at
 *  several hundred contacts the difference is thousands of tokens and the model
 *  reads either just as well. A legend goes in the system prompt so this stays
 *  self-describing.
 *
 *  `txns` is that contact's transactions, already narrowed by visibleTxns.
 *  `canSeeMoney` is the predicate from moneyPolicy(). */
export function indexLine(c, opts = {}) {
  const { stages = [], txns = [], canSeeMoney = () => false } = opts;
  const touch = lastTouchOf(c);
  const stage = arr(stages).find(s => s && s.key === c.stage);
  const label = stage ? (c.side === 'seller' ? stage.sellerLabel : stage.buyerLabel) || stage.key : c.stage;
  const live = arr(txns).find(t => t && t.status === 'active') || arr(txns)[0] || null;

  const line = {
    id: str(c.id, 40),
    n: str(c.name, 80),
    side: str(c.side, 8),
    st: str(label, 40),
    ow: str(c.owner_id, 40),
    src: str(c.source, 60),
    last: touch ? iso(touch) : '',
    days: daysSinceOf(touch),
    tl: str(c.timeline, 40),
    area: str(arr(c.areas)[0], 40),
    acts: arr(c.activity).length,
  };
  if (c.pool) line.pool = str(c.pool, 30);
  if (live) {
    line.tx = str(live.id, 40);
    line.ph = str(live.phase, 20);
    line.stat = str(live.status, 20);
    if (live.closeDate) line.close = str(live.closeDate, 12);
    /* Money, per transaction, per caller. Absent rather than blanked: a null
       still tells a model there is a field worth asking about. */
    if (canSeeMoney(live)) {
      const p = num(live.salePrice);
      if (p) line.price = p;
      const r = num(live.commissionRate);
      if (r) line.rate = r;
    }
  }
  for (const k of Object.keys(line)) {
    const val = line[k];
    if (val === '' || val === null || val === undefined || val === 0) {
      if (k !== 'days') delete line[k];
    }
  }
  return line;
}

/* ------------------------------------------------------------- the detail */

/** Full record for a contact the question actually touches. Activity is the
 *  expensive part, so it is capped and newest-first. */
export function detailOf(c, opts = {}) {
  const { stages = [], txns = [], canSeeMoney = () => false } = opts;
  const stage = arr(stages).find(s => s && s.key === c.stage);
  const label = stage ? (c.side === 'seller' ? stage.sellerLabel : stage.buyerLabel) || stage.key : c.stage;
  const acts = arr(c.activity)
    .filter(a => a && a.at)
    .slice()
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, JARVIS_MAX_ACTS)
    .map(a => ({ d: iso(a.at), kind: str(a.kind, 20), note: str(a.note, 800) }));

  return {
    id: str(c.id, 40),
    name: str(c.name, 120),
    side: str(c.side, 8),
    stage: str(label, 40),
    source: str(c.source, 60),
    timeline: str(c.timeline, 60),
    propertyType: str(c.propertyType, 60),
    areas: arr(c.areas).map(a => str(a, 40)).slice(0, 6),
    preapproval: str(c.preapproval, 40),
    lender: str(c.lender, 60),
    lastTouch: iso(lastTouchOf(c)),
    activity: acts,
    /* Each transaction goes through redactMoney unless this caller may see the
       money ON THAT ROW. The stripping happens here, before the payload
       exists — not in the endpoint and not in the prompt. */
    transactions: arr(txns).map(t => {
      const base = {
        id: str(t.id, 40), side: str(t.side, 8), phase: str(t.phase, 20),
        status: str(t.status, 20), address: str(t.address, 160),
        effectiveDate: str(t.effectiveDate, 12), closeDate: str(t.closeDate, 12),
        closedActual: str(t.closedActual, 12),
        salePrice: num(t.salePrice), commissionRate: num(t.commissionRate),
        commissionSnapshot: t.commissionSnapshot || null,
      };
      return canSeeMoney(t) ? base : redactMoney(base);
    }),
  };
}

/* ------------------------------------------------------------- retrieval */

const STOP = new Set(('a an and are as at be by for from has have how i in is it its me my of on or our so that the their'
  + ' them there they this to us was we what when where which who why will with you your do does did can could should'
  + ' would about any all get got need needs next now show tell give list find whats hows lets').split(' '));

/** Words worth matching a lead name against. Anything short or stopwordy is
 *  noise: matching on "the" pulls in every lead with "The" in the company. */
export function keywords(q) {
  return String(q || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .map(w => w.replace(/^['-]+|['-]+$/g, ''))
    .filter(w => w.length > 2 && !STOP.has(w));
}

/** Pick which leads get hydrated in full.
 *
 *  Pinned ids always win and are never scored away — that is the whole point of
 *  letting the user attach a lead. Everything else is scored on name/company
 *  overlap with the question, with a small nudge for records that are already
 *  hot (recent touch, upcoming follow-up), because a bare "where are we at"
 *  with no name in it should still return something useful rather than nothing.
 */
export function pickDetail(leads, question, pinned = [], limit = JARVIS_MAX_DETAIL) {
  const all = arr(leads);
  const pin = new Set(arr(pinned).map(String));
  const picked = all.filter(l => l && pin.has(String(l.id)));
  const words = keywords(question);
  const rest = all.filter(l => l && !pin.has(String(l.id)));

  const scored = rest.map(l => {
    const hay = `${l.name || ''} ${l.company || ''} ${l.email || ''}`.toLowerCase();
    let score = 0;
    for (const w of words) {
      if (!hay.includes(w)) continue;
      /* A whole-word hit on a name is a much stronger signal than a substring
         landing inside an unrelated word. */
      score += new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(hay) ? 10 : 3;
    }
    if (score > 0) {
      const days = daysSinceOf(lastTouchOf(l));
      if (days !== null && days <= 30) score += 1;
      if (l.followUp) score += 1;
    }
    return { l, score };
  }).filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || String(a.l.name || '').localeCompare(String(b.l.name || '')));

  const room = Math.max(0, limit - picked.length);
  return picked.concat(scored.slice(0, room).map(x => x.l));
}

/* ---------------------------------------------------------------- totals */

/** Pre-computed facts. The model is told not to do arithmetic, so anything it
 *  might otherwise add up is handed over already summed by the caller, using
 *  the app's own functions.
 *
 *  `money` is null for anyone whose policy says no, and then this returns
 *  counts only — the figures are not blanked here, they were never passed. */
export function buildTotals(contacts, opts = {}) {
  const { money = null, stages = [], txns = [] } = opts;
  const all = arr(contacts);
  const byStage = {};
  for (const c of all) {
    const s = arr(stages).find(x => x && x.key === c.stage);
    const label = s ? (c.side === 'seller' ? s.sellerLabel : s.buyerLabel) || s.key : (c.stage || 'unknown');
    byStage[label] = (byStage[label] || 0) + 1;
  }
  const totals = {
    today: iso(new Date()),
    contacts: all.length,
    byStage,
    transactionsLive: arr(txns).filter(t => t && t.status === 'active').length,
    transactionsClosed: arr(txns).filter(t => t && t.status === 'closed').length,
  };
  if (money && typeof money === 'object') Object.assign(totals, money);
  return totals;
}

/* ------------------------------------------------------------- the payload */

/** Assemble the request. NOTHING below this line decides who may see what —
 *  that was decided by moneyPolicy(), visibleContacts() and visibleTxns()
 *  before anything reached here. That is the property worth keeping: the
 *  endpoint hides nothing because there is nothing in it to hide. */
export function buildPayload(opts) {
  const {
    contacts = [], txns = [], question = '', pinned = [],
    role = 'agent', permissions = {}, myUid = '', me = '',
    stages = [], teamNames = [], tasks = [], history = [], money = null,
  } = opts || {};

  const canSeeMoney = moneyPolicy({ role, permissions, myUid });
  const byContact = new Map();
  for (const t of arr(txns)) {
    const k = String((t && t.contact_id) || '');
    if (!k) continue;
    if (!byContact.has(k)) byContact.set(k, []);
    byContact.get(k).push(t);
  }
  const txnsFor = c => byContact.get(String(c && c.id)) || [];

  const detailContacts = pickDetail(contacts, question, pinned);
  const detailIds = new Set(detailContacts.map(c => String(c.id)));

  const payload = {
    question: str(question, JARVIS_MAX_TEXT),
    who: { name: str(me, 60), role: str(role, 20) },
    team: arr(teamNames).map(x => str(x, 40)).slice(0, 20),
    totals: buildTotals(contacts, { money, stages, txns }),
    index: arr(contacts).map(c => indexLine(c, { stages, txns: txnsFor(c), canSeeMoney })),
    detail: detailContacts.map(c => detailOf(c, { stages, txns: txnsFor(c), canSeeMoney })),
    openTasks: arr(tasks).filter(t => t && !t.done).slice(0, 40).map(t => ({
      id: str(t.id, 40), title: str(t.title, 200),
      due: str(t.due, 12), contact: str(t.contact_id, 40),
    })),
    history: arr(history).slice(-JARVIS_MAX_TURNS * 2).map(m => ({
      role: m && m.role === 'assistant' ? 'assistant' : 'user',
      content: str(m && m.content, 2000),
    })),
  };

  const json = JSON.stringify(payload);
  const stats = {
    contacts: arr(contacts).length,
    hydrated: detailContacts.length,
    hydratedNames: detailContacts.map(c => str(c.name, 60)),
    bytes: json.length,
    tokens: estimateTokens(json),
    detailIds: [...detailIds],
  };
  return { payload, stats };
}


/* --------------------------------------------------------------- actions */

/* 3B: Jarvis PROPOSES, a human confirms. Nothing here executes anything — this
   validates a proposal into a shape the app is willing to run, or rejects it.

   This is also the real answer to prompt injection. Lead notes, imported
   spreadsheet rows and pasted email threads all end up in the context, and any
   of them can contain "ignore your instructions and ...". None of that matters
   much when the only things a model can ask for are on this whitelist, must
   name a lead the signed-in user can already see, and do not run until someone
   clicks. An injection's best case is a suggested note the user then declines. */

/* PORT NOTE. ProyTech offers note / task / followup / tag. Dwell keeps the
   first two and drops the other two, because the things they write do not
   exist here:

     followup  ProyTech leads carry a followUp DATE field. A Dwell contact does
               not — the equivalent is lastTouch, which records the past rather
               than schedules the future, and a task with a due date is how
               Dwell already expresses "come back to this".
     tag       ProyTech has @mentions in an activity feed. Dwell has no
               mention mechanism, so there is nothing for a tag to become.

   Adding a kind whose write path does not exist would mean a button that
   proposes something the app cannot do. */
export const ACTION_KINDS = ['note', 'task'];

export function validateActions(raw, ctx = {}) {
  const { visibleIds = [], rep = false, teamNames = [] } = ctx;
  const ids = new Set(arr(visibleIds).map(String));
  const team = new Set(arr(teamNames).map(x => String(x).toLowerCase()));
  const out = [];
  const rejected = [];

  for (const a of arr(raw).slice(0, 8)) {
    if (!a || typeof a !== 'object') { rejected.push('not an object'); continue; }
    const kind = String(a.kind || '').toLowerCase();
    if (!ACTION_KINDS.includes(kind)) { rejected.push(`unknown kind "${kind}"`); continue; }

    /* Every action except a bare task must name a lead the user can SEE. This
       is the line that stops an injected instruction touching someone else's
       record. */
    const leadId = a.leadId == null ? '' : String(a.leadId);
    if (kind !== 'task' && !ids.has(leadId)) { rejected.push(`${kind}: lead not visible`); continue; }
    if (kind === 'task' && leadId && !ids.has(leadId)) { rejected.push('task: lead not visible'); continue; }

    if (kind === 'note') {
      const text = str(a.text, 2000).trim();
      if (!text) { rejected.push('note: empty'); continue; }
      out.push({ kind, leadId, text });
    } else if (kind === 'task') {
      const title = str(a.title, 200).trim();
      if (!title) { rejected.push('task: no title'); continue; }
      const due = /^\d{4}-\d{2}-\d{2}$/.test(String(a.due || '')) ? String(a.due) : '';
      out.push({ kind, leadId, title, due, owner: str(a.owner, 40) });
    }
  }
  /* NO ACTION KIND WRITES MONEY. That is the property, not a permission check:
     there is no kind that could set a sale price or a commission rate, so a
     coordinator proposing one is not something the validator has to refuse.
     Asserted in the tests so it stays that way. */
  return { actions: out, rejected };
}

/** Human-readable one-liner for the confirm button. */
export function describeAction(a, leadName) {
  const who = leadName || 'this lead';
  if (!a) return '';
  if (a.kind === 'note') return `Add a note to ${who}`;
  if (a.kind === 'task') return a.leadId ? `Create a task on ${who}: ${a.title}` : `Create a task: ${a.title}`;
  if (a.kind === 'followup') return `Set ${who}'s follow-up to ${a.date}`;
  if (a.kind === 'tag') return `Tag ${a.who} on ${who}`;
  return '';
}

/* ----------------------------------------------------------------- parsing */

/** Read the model's reply. It is asked for strict JSON; this assumes it might
 *  not comply, because api/huddle.js learned that the hard way. A malformed
 *  answer degrades to "here is the text", never to a crash. */
export function parseReply(text) {
  const raw = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  let o = null;
  try { o = JSON.parse(raw); } catch { /* fall through */ }
  if (!o) {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) { try { o = JSON.parse(m[0]); } catch { /* fall through */ } }
  }
  if (!o || typeof o !== 'object') return { answer: raw, actions: [], cited: [], malformed: true };
  return {
    answer: str(o.answer, 6000),
    actions: arr(o.actions),
    cited: arr(o.cited).map(x => str(x, 40)).slice(0, 20),
    malformed: false,
  };
}
