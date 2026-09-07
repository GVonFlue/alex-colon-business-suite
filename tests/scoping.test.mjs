/* ============================================================================
   Scoping tests — AT THE QUERY LEVEL, NOT THE UI.

   The brief is explicit: "an agent's session genuinely cannot fetch another
   agent's expenses or contacts, tested at the query level, not the UI". For the
   real product that means Postgres, which jsdom cannot run — VERIFY-RLS.md is
   the manual procedure and it is not optional before letting an agent in.

   What CAN be tested here is the demo adapter, which is written to enforce the
   same rules at the same layer. These tests call db.* directly with no
   component mounted, so a passing result means the data layer refuses, not that
   a view happened to filter. If these ever fail, the demo is lying about the
   product and the demo is the thing prospects see.
   ========================================================================== */

/* The module arrives pre-bundled from run.mjs (the app's imports are
   extensionless for Vite, which node's ESM resolver will not follow). It is the
   real src/lib/demo.js, not a copy. */
export default async function run(t, mod) {
  const { db, auth, demoApi, resetDemo } = mod;
  const as = id => { demoApi.setViewAs(id); };
  resetDemo();

  /* ------------------------------------------------------------- the leader */
  as('u-leader');
  const allContacts = await db.getContacts();
  const allTxns = await db.getTransactions();
  const leaderUsers = await db.getUsers();
  t.ok(allContacts.length > 30, `the team leader sees the whole book (${allContacts.length} contacts)`);
  t.ok(allTxns.length >= 8, 'and every transaction');
  t.ok(leaderUsers.length >= 5, 'and every seat, including the coordinator and the deactivated one');
  const who = await db.whoami();
  t.eq(who.role, 'leader', 'whoami says leader');
  t.eq(who.seatLimit, 5, 'and reports the seat limit from the account row');
  t.eq(who.seatsUsed, 4, 'with four active seats used — two agents, the coordinator and the leader');

  /* ---------------------------------------------------------------- agent A */
  as('u-marcus');
  const mine = await db.getContacts();
  const notMine = mine.filter(c => c.owner_id && c.owner_id !== 'u-marcus');
  t.eq(notMine.length, 0, "an agent's contact query returns no other agent's contacts");
  t.ok(mine.length > 0 && mine.length < allContacts.length, `and fewer rows than the leader gets (${mine.length} of ${allContacts.length})`);
  t.ok(mine.some(c => c.pool === 'house' && !c.owner_id), 'but it does include the pools they are on');
  const priyaNames = allContacts.filter(c => c.owner_id === 'u-priya').map(c => c.name);
  t.ok(priyaNames.length > 0, 'sanity: the other agent does have contacts');
  t.eq(mine.filter(c => priyaNames.includes(c.name)).length, 0, "and none of them are in agent A's result set");

  const myTxns = await db.getTransactions();
  t.eq(myTxns.filter(x => x.owner_id !== 'u-marcus').length, 0, 'same for transactions');
  t.ok(myTxns.length > 0, 'and they do get their own');

  /* THE EXPENSE RULE (§7) */
  const myExp = await db.getExpenses();
  t.ok(myExp.length > 0, 'an agent sees their own expenses');
  t.eq(myExp.filter(e => e.user_id !== 'u-marcus').length, 0, 'and only their own');

  /* an agent sees only their own crm_users row — so the browser cannot even
     enumerate the team */
  const visibleUsers = await db.getUsers();
  t.eq(visibleUsers.length, 1, 'an agent can only read their own user row');
  t.eq(visibleUsers[0].id, 'u-marcus', 'which is theirs');

  /* writes the database must refuse */
  await t.throws(() => db.upsertContact({ id: 'c-new-1', name: 'Sneaky', owner_id: 'u-priya' }),
    'an agent cannot assign a contact to another agent');
  await t.throws(() => db.upsertExpense({ id: 'e-x', user_id: 'u-priya', amount: 10 }),
    'an agent cannot write an expense onto another agent');
  await t.throws(() => db.saveSettings({ stages: [] }),
    'an agent cannot change the install settings');
  await t.throws(() => db.upsertUser({ id: 'u-marcus', plan: { keepPct: 100, cap: 0 } }),
    'an agent cannot edit their own split or cap — the one permission that is locked off forever');
  await t.throws(() => db.upsertUser({ id: 'u-priya', name: 'Renamed' }),
    "an agent cannot write another agent's row");
  await t.throws(() => db.deleteUser('u-priya'), 'and cannot remove a seat');

  /* claiming a pool lead IS allowed, and takes it out of the pool */
  const poolLead = mine.find(c => c.pool === 'house' && !c.owner_id);
  await db.upsertContact({ ...poolLead, owner_id: 'u-marcus', pool: null, pooled_at: null });
  const after = await db.getContacts();
  const claimed = after.find(c => c.id === poolLead.id);
  t.eq(claimed.owner_id, 'u-marcus', 'an agent can claim a pool lead');
  t.eq(claimed.pool, null, 'and it leaves the pool');

  /* ---------------------------------------------------------------- agent B */
  as('u-priya');
  const pExp = await db.getExpenses();
  t.eq(pExp.filter(e => e.user_id !== 'u-priya').length, 0, "agent B's expenses are equally private");
  t.ok(!pExp.some(e => myExp.some(m => m.id === e.id)), 'the two agents share no expense rows at all');
  const pContacts = await db.getContacts();
  t.eq(pContacts.filter(c => c.owner_id === 'u-marcus').length, 0, "and cannot see agent A's contacts");
  t.ok(!pContacts.some(c => c.id === poolLead.id), 'a claimed lead disappears from the other agent’s pool view');

  /* ====================================================================== */
  /*            the transaction coordinator (u-robin) — the third role       */
  /* ====================================================================== */
  /* The whole closing pipeline, none of the money. Every assertion below is a
     db.* call with nothing mounted, so a pass means the DATA LAYER answers this
     way — the same thing MIGRATION.sql's is_coordinator() / sees_all_deals()
     make Postgres do. */
  as('u-robin');
  const cWho = await db.whoami();
  t.eq(cWho.role, 'coordinator', 'whoami says coordinator — a role, not a permission bundle');

  /* ---- read breadth: the same as the leader on deals and contacts ---- */
  const cTxns = await db.getTransactions();
  t.eq(cTxns.length, allTxns.length, `a coordinator reads EVERY transaction (${cTxns.length} of ${allTxns.length})`);
  t.ok(cTxns.some(x => x.owner_id === 'u-marcus') && cTxns.some(x => x.owner_id === 'u-priya'),
    'across every agent, not just one');
  const cContacts = await db.getContacts();
  t.eq(cContacts.length, allContacts.length, 'and every contact — they need the parties on a deal');
  t.ok(cContacts.some(c => c.owner_id === 'u-priya'), "including the other agents' people");
  const cTasks = await db.getTasks();
  t.ok(cTasks.length > 0 && cTasks.some(x => x.user_id !== 'u-robin'), "and other people's tasks, which is the job");
  const cContracts = await db.getContracts();
  t.ok(cContracts.length > 0 && cContracts.some(x => x.owner_id !== 'u-robin'), 'and every contract file');

  /* ---- THE MONEY RULE: expenses get no coordinator override, ever ---- */
  const cExp = await db.getExpenses();
  t.eq(cExp.filter(e => e.user_id !== 'u-robin').length, 0,
    'A COORDINATOR SEES ONLY THEIR OWN EXPENSES — the expenses policy has no role override at all');
  t.ok(cExp.length > 0, 'they do get the rows they entered themselves');
  t.eq(cExp.filter(e => myExp.some(m => m.id === e.id)).length, 0, "and none of agent A's");
  await t.throws(() => db.upsertExpense({ id: 'e-c1', user_id: 'u-marcus', amount: 25 }),
    'and cannot write an expense onto an agent either');

  /* ---- writes they SHOULD have: the closing pipeline is their desk ---- */
  const someoneElsesTxn = cTxns.find(x => x.owner_id && x.owner_id !== 'u-robin');
  await db.upsertTransaction({ ...someoneElsesTxn, phase: 'ctc' });
  t.eq((await db.getTransactions()).find(x => x.id === someoneElsesTxn.id).phase, 'ctc',
    "a coordinator can move another agent's transaction through the pipeline");
  const someoneElsesTask = cTasks.find(x => x.user_id !== 'u-robin');
  await db.upsertTask({ ...someoneElsesTask, done: true });
  t.eq((await db.getTasks()).find(x => x.id === someoneElsesTask.id).done, true, 'and work their deadlines');

  /* ---- writes the database must refuse ---- */
  await t.throws(() => db.upsertUser({ id: 'u-marcus', name: 'Renamed by the coordinator' }),
    "a coordinator cannot write another user's row");
  await t.throws(() => db.upsertUser({ id: 'u-robin', role: 'leader' }),
    'nor promote themselves — role is refused on their own row');
  await t.throws(() => db.upsertUser({ id: 'u-robin', plan: { keepPct: 100, cap: 0 } }),
    'nor give themselves a plan');
  await t.throws(() => db.upsertUser({ id: 'u-marcus', plan: { keepPct: 100, cap: 0 } }),
    "nor set an agent's plan");
  await t.throws(() => db.upsertUser({ id: 'u-robin', permissions: { seeOtherCommission: true } }),
    'nor grant themselves a permission');
  await t.throws(() => db.upsertUser({ id: 'u-robin', sections: ['commission', 'books'] }),
    'nor add Commission and The Books to their own nav');
  await t.throws(() => db.deleteUser('u-marcus'), 'nor remove a seat');
  await t.throws(() => db.saveSettings({ stages: [] }), 'nor change the install settings');
  await t.throws(() => db.upsertContact({ id: 'c-coord-1', name: 'Reassigned', owner_id: 'u-priya' }),
    'and cannot hand a contact to an agent — read breadth on contacts is not write breadth');

  /* a coordinator cannot enumerate the team either: crm_users read is
     "my own row or the leader", and coordinator is not leader */
  const cUsers = await db.getUsers();
  t.eq(cUsers.length, 1, 'a coordinator reads only their own crm_users row');
  t.eq(cUsers[0].id, 'u-robin', 'which is theirs');

  resetDemo();

  /* ------------------------------------------- the leader and agent expenses
     This is the one that surprises people, so it is asserted directly. */
  as('u-leader');
  const leaderExp = await db.getExpenses();
  t.ok(leaderExp.length > 0, 'the team leader has their own brokerage-level expenses');
  t.eq(leaderExp.filter(e => e.user_id !== 'u-leader').length, 0,
    "THE TEAM LEADER DOES NOT SEE AGENTS' INDIVIDUAL EXPENSES — deliberate, §7");
  t.ok(!leaderExp.some(e => myExp.some(m => m.id === e.id)), 'no overlap with agent A’s rows');

  /* -------------------------------------------------------- seat enforcement
     Rejected at the data layer, mirroring the Postgres trigger in
     MIGRATION.sql. Four of five seats are used at the start (leader, two agents
     and the coordinator), so the fifth goes in and the sixth must not.
     A coordinator is a seat like any other — they cost the same money and the
     trigger counts them the same way. */
  resetDemo();
  as('u-leader');
  await db.upsertUser({ id: 'u-n1', name: 'Hire One', role: 'agent', active: true });
  const now = await db.whoami();
  t.eq(now.seatsUsed, 5, 'five of five seats used');
  await t.throws(() => db.upsertUser({ id: 'u-n2', name: 'Hire Two', role: 'agent', active: true }),
    'the sixth active seat is rejected by the data layer, not by a button');
  await t.throws(() => db.upsertUser({ id: 'u-n3', name: 'Second Coordinator', role: 'coordinator', active: true }),
    'and a coordinator is refused at the limit exactly like an agent — the seat trigger counts them');
  /* deactivating frees the seat but keeps the row */
  await db.upsertUser({ id: 'u-n1', name: 'Hire One', role: 'agent', active: false });
  await db.upsertUser({ id: 'u-n2', name: 'Hire Two', role: 'agent', active: true });
  const users2 = await db.getUsers();
  t.ok(users2.some(u => u.id === 'u-n1' && u.active === false), 'a deactivated seat keeps its history');
  t.ok(users2.some(u => u.id === 'u-n2' && u.active), 'and its seat can be reused');
  /* deactivating the coordinator frees a seat too */
  await db.upsertUser({ id: 'u-robin', role: 'coordinator', active: false });
  await db.upsertUser({ id: 'u-n3', name: 'Cover Coordinator', role: 'coordinator', active: true });
  t.ok((await db.getUsers()).some(u => u.id === 'u-n3' && u.role === 'coordinator' && u.active),
    'and deactivating the coordinator frees theirs, so a stand-in can take it');

  /* ------------------------------------------------------------ demo basics */
  resetDemo();
  t.eq(demoApi.viewAs, 'u-leader', 'the demo starts as the team leader');
  t.eq(demoApi.users().length, 4, 'and offers the four active seats in the switcher');
  t.ok(demoApi.users().some(u => u.role === 'coordinator'), 'one of which is the transaction coordinator');
  const s = await auth.session();
  t.eq(s.user.id, 'u-leader', 'the session follows the switcher');
  as('u-marcus');
  t.eq((await auth.session()).user.id, 'u-marcus', 'and changes with it');
  resetDemo();
  const fresh = await db.getContacts();
  t.eq(fresh.length, (await (async () => { as('u-leader'); return db.getContacts(); })()).length,
    'resetDemo puts the seeded data back — the demo resets on refresh');
}
