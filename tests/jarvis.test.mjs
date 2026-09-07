/* ============================================================================
   The assistant's brain-side plumbing, and the boundary that matters.

   Two of these are security properties rather than features, and they are the
   reason this file is pure and testable without a browser:

     1. A COORDINATOR MUST NOT REACH MONEY THROUGH THE CHAT BOX.
        Postgres hands them every transaction row — txn_read grants it, and
        salePrice, commissionRate and commissionSnapshot are columns on that
        row. MIGRATION.sql says so out loud: "The app does not show a
        coordinator the Commission section; the database cannot make that
        promise." A screen can keep that promise by not rendering. A chat box
        cannot: it answers in prose whatever it was handed.

        So the money is removed BEFORE the payload exists, and the test below
        asks the way a coordinator would actually ask — by name, about a
        specific deal — and then proves the number is not in the request at all,
        rather than proving a model declined to say it.

     2. A PROPOSED ACTION MUST NOT REACH A RECORD THE USER CANNOT SEE.
        Contact notes and imported spreadsheet rows end up in the model's
        context, and any of them can contain something shaped like an
        instruction. The id whitelist is what makes that harmless.

   Pure functions only — no jsdom needed.
   ========================================================================== */

import {
  MONEY_FIELDS, moneyPolicy, redactMoney, visibleContacts, visibleTxns,
  buildPayload, indexLine, detailOf, validateActions, parseReply, ACTION_KINDS,
} from '../src/lib/jarvis.js';

const LEADER = { id: 'u-leader', role: 'leader', permissions: {} };
const AGENT  = { id: 'u-agent',  role: 'agent',  permissions: {} };
const COORD  = { id: 'u-coord',  role: 'coordinator', permissions: {} };

const STAGES = [{ key: 'contract', sellerLabel: 'Under Contract', buyerLabel: 'Under Contract' }];

const HENDERSON = {
  id: 'c-hend', name: 'Henderson', side: 'seller', stage: 'contract',
  owner_id: 'u-agent', lastTouch: '2026-08-01', created_at: '2026-05-01',
  areas: ['Riverside'], timeline: '30 days',
  activity: [{ id: 'a1', at: '2026-08-01T10:00:00Z', kind: 'call', note: 'Talked through the inspection.' }],
};
const HENDERSON_TXN = {
  id: 't-hend', contact_id: 'c-hend', owner_id: 'u-agent', side: 'seller',
  phase: 'uc', status: 'active', address: '18 Cedar Ln',
  closeDate: '2026-09-15', salePrice: 415000, commissionRate: 3,
  commissionSnapshot: { gross: 12450, net: 9337.5 },
};
const OTHER = { id: 'c-oth', name: 'Vance', side: 'buyer', stage: 'contract', owner_id: 'u-other', lastTouch: '2026-08-10', activity: [] };
const OTHER_TXN = { id: 't-oth', contact_id: 'c-oth', owner_id: 'u-other', status: 'active', salePrice: 250000, commissionRate: 3 };

const CONTACTS = [HENDERSON, OTHER];
const TXNS = [HENDERSON_TXN, OTHER_TXN];

const payloadFor = (who, question = 'what did the Henderson deal pay out?') => buildPayload({
  contacts: visibleContacts(CONTACTS, { role: who.role, myUid: who.id, pools: [] }),
  txns: visibleTxns(TXNS, { role: who.role, myUid: who.id }),
  question, role: who.role, permissions: who.permissions, myUid: who.id,
  me: who.role, stages: STAGES, teamNames: ['Jeff'], tasks: [], history: [],
  money: who.role === 'leader' ? { gciYtd: 98000 } : null,
});

/* every number that must never reach a coordinator, as a string */
const SECRETS = ['415000', '12450', '9337.5', '250000'];

export default async function run(t) {
  /* ---------------- 1. the coordinator ---------------- */
  const coord = JSON.stringify(payloadFor(COORD));
  t.ok(coord.includes('Henderson'), 'the coordinator can see the Henderson file at all');
  t.ok(coord.includes('2026-09-15'), 'and its close date — dates are their job');
  for (const n of SECRETS) {
    t.ok(!coord.includes(n), `the coordinator's payload does not contain ${n}`);
  }
  t.ok(!/salePrice|commissionRate|commissionSnapshot/.test(coord),
    'and carries no money field names either');

  /* asked the way they would actually ask it */
  const direct = JSON.stringify(payloadFor(COORD, 'what did the Henderson deal pay out? give me the exact commission'));
  for (const n of SECRETS) t.ok(!direct.includes(n), `asking directly does not surface ${n}`);

  /* the transaction is still THERE — this is not achieved by hiding the row */
  const coordP = payloadFor(COORD);
  const hend = coordP.payload.detail.find(d => d.name === 'Henderson');
  t.ok(!!hend, 'the coordinator still gets the Henderson detail record');
  t.ok(hend.transactions.length === 1, 'including its transaction');
  t.ok(!('salePrice' in hend.transactions[0]), 'with salePrice absent, not zeroed');

  /* ---------------- 2. the agent ---------------- */
  const agent = payloadFor(AGENT);
  const agentJson = JSON.stringify(agent);
  t.ok(agentJson.includes('415000'), 'an agent sees the money on their OWN deal');
  t.ok(!agentJson.includes('250000'), "and not another agent's deal at all");
  t.ok(!agentJson.includes('Vance'), "whose contact is not in their payload either");

  const shared = moneyPolicy({ role: 'agent', permissions: { seeOtherCommission: true }, myUid: 'u-agent' });
  t.ok(shared(OTHER_TXN) === true, 'seeOtherCommission opens other agents’ money');
  const plain = moneyPolicy({ role: 'agent', permissions: {}, myUid: 'u-agent' });
  t.ok(plain(OTHER_TXN) === false, 'and without it, it stays shut');
  t.ok(plain(HENDERSON_TXN) === true, 'while their own deal is always theirs');

  /* ---------------- 3. no permission opens the coordinator ---------------- */
  const bribed = moneyPolicy({ role: 'coordinator', permissions: { seeOtherCommission: true, seeTeamCommission: true }, myUid: 'u-coord' });
  t.ok(bribed(HENDERSON_TXN) === false,
    'no permission flag turns money on for a coordinator — the role decides, as App.jsx does');

  /* ---------------- 4. the leader ---------------- */
  const leader = JSON.stringify(payloadFor(LEADER));
  t.ok(leader.includes('415000') && leader.includes('250000'), 'the leader sees every deal');
  t.ok(leader.includes('98000'), 'and the pre-computed totals');

  /* ---------------- 5. redaction itself ---------------- */
  const stripped = redactMoney({ a: 1, salePrice: 9, nested: { commissionRate: 3, keep: 'yes' } });
  t.ok(!('salePrice' in stripped) && !('commissionRate' in stripped.nested), 'redactMoney recurses');
  t.ok(stripped.nested.keep === 'yes', 'and keeps everything else');
  t.ok(MONEY_FIELDS.includes('salePrice') && MONEY_FIELDS.includes('commissionRate')
    && MONEY_FIELDS.includes('commissionSnapshot'), 'the three named fields are on the list');

  /* ---------------- 6. actions ---------------- */
  const { actions, rejected } = validateActions([
    { kind: 'note', leadId: 'c-hend', text: 'called them' },
    { kind: 'note', leadId: 'c-oth', text: 'not mine' },
    { kind: 'task', leadId: '', title: 'Order the survey', due: '2026-09-01' },
    { kind: 'setPrice', leadId: 'c-hend', salePrice: 1 },
  ], { visibleIds: ['c-hend'] });
  t.ok(actions.length === 2, 'a note on a visible contact and a bare task are accepted');
  t.ok(rejected.some(r => /not visible/.test(r)), 'a note on an invisible contact is refused');
  t.ok(rejected.some(r => /unknown kind/.test(r)), 'an invented kind is refused');
  t.ok(!ACTION_KINDS.some(k => /price|commission|split|rate/i.test(k)),
    'no action kind can write money — the property, not a permission check');

  /* ---------------- 7. the reply parser ---------------- */
  const parsed = parseReply('```json\n{"answer":"ok","actions":[],"cited":[]}\n```');
  t.ok(parsed.answer === 'ok', 'a fenced reply still parses');
}
