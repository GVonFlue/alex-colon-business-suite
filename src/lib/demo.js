/* ============================================================================
   demo.js — the in-memory adapter behind VITE_DEMO=1.

   It exposes EXACTLY the auth + db interface of src/lib/supabase.js, so the
   demo is the real product with a different data layer, not a throwaway build.
   Nothing here is imported when VITE_DEMO is unset.

   THE IMPORTANT PART: this adapter enforces the same scoping the RLS policies
   in MIGRATION.sql do, at the same layer — inside the data access calls, not in
   the views. So switching "View as" to an agent genuinely cannot return another
   agent's contacts or expenses, exactly as a real session cannot. If the demo
   showed the right thing only because a component filtered it, the demo would
   be lying about the product.

     contacts     leader + coordinator: all   agent: own + pools they can see
     transactions leader + coordinator: all   agent: own
     tasks        leader + coordinator: all   agent: own
     contracts    leader + coordinator: all   agent: own
     expenses     EVERYONE: only their own rows — team leader AND transaction
                  coordinator included (§7). No role widens this one.
     crm_users    leader: all      agent + coordinator: only their own row
     settings     read: all        write: leader only (throws otherwise)
     seats        adding an active user past seat_limit throws (the DB trigger)

   The coordinator is a role, not a permission toggle: they work every closing
   and see no money. What they CAN reach at the row level is the transaction,
   which carries salePrice and commissionSnapshot — the same honest caveat
   MIGRATION.sql and ROLES.md carry. The app does not offer them the Commission
   or Books sections; this adapter does not pretend the row hides them.

   Data resets on refresh because it lives in this module's closure.
   ========================================================================== */

import { seedData } from './seed';
import { defaultSettings, mergeSettings } from './settings';

let STORE = null;
let VIEW_AS = 'u-leader';
const listeners = new Set();

function store() {
  if (!STORE) STORE = seedData('America/Chicago');
  return STORE;
}
export function resetDemo() { STORE = null; VIEW_AS = 'u-leader'; notify(); }
function notify() { listeners.forEach(fn => { try { fn(VIEW_AS); } catch {} }); }

/* ---- the View-as switcher: the only way to show per-seat permissions and
   per-agent expense privacy to a prospect without making them accounts ---- */
export const demoApi = {
  get enabled() { return true; },
  users() { return store().users.filter(u => u.active); },
  get viewAs() { return VIEW_AS; },
  setViewAs(id) {
    if (!store().users.some(u => u.id === id)) return;
    VIEW_AS = id;
    notify();
  },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  reset: resetDemo,
};

const me = () => store().users.find(u => u.id === VIEW_AS) || store().users[0];
const isLeader = () => me().role === 'leader';
/* is_coordinator() / sees_all_deals() from MIGRATION.sql, same names, same
   meaning. Every read below that says "the whole team" asks seesAllDeals(); the
   expense reads deliberately ask neither. */
const isCoordinator = () => me().role === 'coordinator';
const seesAllDeals = () => isLeader() || isCoordinator();
const myPools = () => me().pools || [];

const clone = v => (v == null ? v : JSON.parse(JSON.stringify(v)));
const deny = msg => { const e = new Error(msg); e.code = '42501'; throw e; };   // RLS violation code

export const configured = true;
export const isDemo = true;

/* ------------------------------------------------------------------ auth */
export const auth = {
  async login() { return { data: { session: session() }, error: null }; },
  async logout() { return { error: null }; },
  async session() { return session(); },
  onChange(cb) {
    const off = demoApi.onChange(() => cb(session(), 'SIGNED_IN'));
    setTimeout(() => cb(session(), 'INITIAL_SESSION'), 0);
    return { data: { subscription: { unsubscribe: off } } };
  },
  isRecoveryUrl() { return false; },
  async setPassword() { return true; },
  username(s) { return (s?.user?.email || '').split('@')[0]; },
  uid(s) { return s?.user?.id || null; },
  email(s) { return s?.user?.email || ''; },
  /* same shape as the real one: { id, needsConfirm }. needsConfirm is what the
     Settings screen keys the "Confirm email is on in Supabase" message off, so
     the demo returns an id and the happy path is the one a prospect sees. */
  async createLogin(email) { return { id: 'u-' + String(email || '').split('@')[0], needsConfirm: false }; },
  async sendReset() { return true; },
  /* same generator the real build uses, so the demo shows a real-looking
     temporary password rather than a placeholder */
  tempPassword() {
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const buf = new Uint32Array(20);
    crypto.getRandomValues(buf);
    const out = Array.from(buf, x => A[x % A.length]);
    out[0] = 'ABCDEFGHJKLMNPQRSTUVWXYZ'[out[0].charCodeAt(0) % 24];
    out[1] = 'abcdefghijkmnopqrstuvwxyz'[out[1].charCodeAt(0) % 25];
    out[2] = '23456789'[out[2].charCodeAt(0) % 8];
    return out.join('');
  },
};
const session = () => ({ user: { id: me().id, email: me().email }, demo: true });

/* ------------------------------------------------------------------ data */
export const db = {
  async whoami() {
    const u = me();
    const s = store();
    return {
      id: u.id, name: u.name, email: u.email, role: u.role, active: u.active !== false,
      setup: true, sections: u.sections || [], permissions: u.permissions || {},
      plan: u.plan || {}, pools: u.pools || [],
      seatLimit: s.account.seat_limit, seatsUsed: s.users.filter(x => x.active).length,
    };
  },
  async getUsers() {
    const s = store();
    return clone(isLeader() ? s.users : s.users.filter(u => u.id === me().id));
  },
  /* users_update's with-check, line for line: anyone who is not the leader may
     edit their own name and email and nothing else. Not their role, not their
     plan, not their permissions, not their section list. A coordinator is under
     exactly the same restriction as an agent — the role buys read breadth on
     deals, never authority over seats. */
  async upsertUser(u) {
    const s = store();
    if (!isLeader()) {
      if (u.id !== me().id) deny('Only the team leader can write another seat\'s row.');
      const cur = s.users.find(x => x.id === me().id) || {};
      const same = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
      if (u.role !== undefined && u.role !== cur.role) deny('Nobody promotes themselves.');
      if (u.plan !== undefined && !same(u.plan, cur.plan || {})) deny('Nobody sets their own split or cap.');
      if (u.permissions !== undefined && !same(u.permissions, cur.permissions || {})) deny('Only the team leader sets permissions.');
      if (u.sections !== undefined && !same(u.sections, cur.sections || [])) deny('Only the team leader sets which sections a seat sees.');
    }
    const i = s.users.findIndex(x => x.id === u.id);
    /* the seat trigger, mimicked: an active user past the limit is rejected */
    const activeAfter = s.users.filter(x => x.active && x.id !== u.id).length + (u.active !== false ? 1 : 0);
    if (activeAfter > s.account.seat_limit) {
      const e = new Error(`Seat limit is ${s.account.seat_limit}. Contact ProyTech to add more.`);
      e.code = 'P0001'; throw e;
    }
    if (i < 0) s.users.push(clone(u)); else s.users[i] = { ...s.users[i], ...clone(u) };
  },
  async deleteUser(id) {
    if (!isLeader()) deny('Only the team leader can remove a seat.');
    const s = store();
    s.users = s.users.filter(u => u.id !== id);
  },
  async getAccount() { return clone(store().account); },

  /* ---- contacts: read breadth for the coordinator (they need the parties on
     a deal), but NOT write breadth — contacts_update's with-check is unchanged,
     so a coordinator still cannot hand a contact to somebody else. ---- */
  async getContacts() {
    const s = store();
    if (seesAllDeals()) return clone(s.contacts);
    const pools = myPools();
    return clone(s.contacts.filter(c => c.owner_id === me().id || (c.pool && pools.includes(c.pool))));
  },
  async upsertContact(c) {
    const s = store();
    if (!isLeader() && c.owner_id && c.owner_id !== me().id)
      deny('Only the team leader can assign a contact to somebody else.');
    const i = s.contacts.findIndex(x => x.id === c.id);
    if (i < 0) s.contacts.push(clone(c)); else s.contacts[i] = clone(c);
  },
  async upsertContacts(list) { for (const c of list || []) await db.upsertContact(c); },
  async deleteContact(id) {
    const s = store();
    const c = s.contacts.find(x => x.id === id);
    if (c && !isLeader() && c.owner_id !== me().id) deny('Not yours to delete.');
    s.contacts = s.contacts.filter(x => x.id !== id);
  },

  /* ---- transactions: the closing pipeline. Read AND write for the
     coordinator — moving a phase and marking a deadline met is the job. ---- */
  async getTransactions() {
    const s = store();
    return clone(seesAllDeals() ? s.transactions : s.transactions.filter(t => t.owner_id === me().id));
  },
  async upsertTransaction(t) {
    const s = store();
    if (!seesAllDeals() && t.owner_id && t.owner_id !== me().id) deny('Not yours.');
    const i = s.transactions.findIndex(x => x.id === t.id);
    if (i < 0) s.transactions.push(clone(t)); else s.transactions[i] = clone(t);
  },
  async deleteTransaction(id) {
    const s = store();
    const t = s.transactions.find(x => x.id === id);
    if (t && !seesAllDeals() && t.owner_id !== me().id) deny('Not yours to delete.');
    s.transactions = s.transactions.filter(x => x.id !== id);
  },

  /* ---- tasks ---- */
  async getTasks() {
    const s = store();
    return clone(seesAllDeals() ? s.tasks : s.tasks.filter(t => t.user_id === me().id));
  },
  async upsertTask(t) {
    const s = store();
    if (!seesAllDeals() && t.user_id && t.user_id !== me().id) deny('Not yours.');
    const i = s.tasks.findIndex(x => x.id === t.id);
    if (i < 0) s.tasks.push(clone(t)); else s.tasks[i] = clone(t);
  },
  async deleteTask(id) {
    const s = store();
    s.tasks = s.tasks.filter(t => t.id !== id || (!seesAllDeals() && t.user_id !== me().id));
  },

  /* ---- expenses: own rows only, for everyone. This is the §7 rule and it is
     enforced here, at the data layer, not in The Books view.
     Note what is NOT in these three functions: seesAllDeals(). A transaction
     coordinator gets no more here than an agent does. ---- */
  async getExpenses() {
    const s = store();
    return clone(s.expenses.filter(e => e.user_id === me().id));
  },
  async upsertExpense(e) {
    const s = store();
    if (e.user_id && e.user_id !== me().id) deny('Expenses are per agent.');
    const row = { ...clone(e), user_id: me().id };
    const i = s.expenses.findIndex(x => x.id === e.id);
    if (i < 0) s.expenses.push(row); else s.expenses[i] = row;
  },
  async deleteExpense(id) {
    const s = store();
    s.expenses = s.expenses.filter(e => !(e.id === id && e.user_id === me().id));
  },

  /* ---- contracts ---- */
  async getContracts() {
    const s = store();
    return clone(seesAllDeals() ? s.contracts : s.contracts.filter(c => c.owner_id === me().id));
  },
  async uploadContract(path, file) {
    const s = store();
    s._files = s._files || {};
    s._files[path] = file;
    return path;
  },
  async saveContract(c) {
    const s = store();
    const i = s.contracts.findIndex(x => x.id === c.id);
    const row = clone({ ...c, owner_id: c.owner_id || me().id });
    if (i < 0) s.contracts.push(row); else s.contracts[i] = row;
  },
  async contractUrl(path) {
    const s = store();
    const f = (s._files || {})[path];
    if (f && typeof URL !== 'undefined' && URL.createObjectURL) { try { return URL.createObjectURL(f); } catch {} }
    return null;                       // seeded contracts have no bytes in the demo
  },
  async downloadContract(path) { return ((store()._files || {})[path]) || null; },
  async removeContract(id, path) {
    const s = store();
    const c = s.contracts.find(x => x.id === id);
    if (c && !seesAllDeals() && c.owner_id !== me().id) deny('Not yours to delete.');
    if (path && s._files) delete s._files[path];
    s.contracts = s.contracts.filter(x => x.id !== id);
  },
  async uploadReceipt(path, file) { const s = store(); s._files = s._files || {}; s._files[path] = file; return path; },
  async receiptUrl(path) { return db.contractUrl(path); },
  async removeReceipt(path) { const s = store(); if (s._files) delete s._files[path]; },

  /* ---- settings ---- */
  async getSettings() { return clone(store().settings || defaultSettings()); },
  async saveSettings(obj) {
    if (!isLeader()) deny('Only the team leader can change settings.');
    store().settings = mergeSettings(clone(obj));
  },
  async getHuddle() { return clone(store().huddle); },
  async saveHuddle(obj) { store().huddle = clone(obj); },
};
