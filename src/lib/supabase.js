/* ============================================================================
   supabase.js — the REAL data layer.

   Read this next to MIGRATION.sql. Every table here has Row Level Security and
   the policies are the permission system; the queries below are written on the
   assumption that the database will refuse anything the signed-in agent may not
   see. There is no .filter() standing in for a policy anywhere in this file.

   What that means in practice:
     - db.getContacts() sends no owner filter. An agent's session gets their own
       contacts plus their pools because that is all the policy returns.
     - db.getExpenses() sends no user filter, and a team leader calling it gets
       only their OWN expenses — §7, deliberate.
     - Contract files live in a private Storage bucket; the only way to read one
       is a short-lived signed URL minted for someone the policy allows.

   The publishable key is safe in client code. NEVER put the service key here;
   the only place it belongs is api/notify.js, server-side.
   ========================================================================== */

import { createClient } from '@supabase/supabase-js';
import { BRAND, SUPABASE_URL, SUPABASE_KEY, SUPABASE_OK } from './brand';

export const supabase = createClient(
  SUPABASE_OK ? SUPABASE_URL : 'https://missing.supabase.co',
  SUPABASE_OK ? SUPABASE_KEY : 'missing'
);
export const configured = SUPABASE_OK;
export const isDemo = false;

/* ------------------------------------------------------------------ auth */
const emailFor = u => { const s = (u || '').trim().toLowerCase(); return s.includes('@') ? s : `${s}@${BRAND.authDomain}`; };

export const auth = {
  login(identifier, password) { return supabase.auth.signInWithPassword({ email: emailFor(identifier), password }); },
  logout() { return supabase.auth.signOut(); },
  async session() { const { data } = await supabase.auth.getSession(); return data.session; },
  onChange(cb) { return supabase.auth.onAuthStateChange((e, s) => cb(s, e)); },
  isRecoveryUrl() {
    try { return /type=recovery/.test((window.location.hash || '') + (window.location.search || '')); }
    catch { return false; }
  },
  async setPassword(password) {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw new Error(error.message || 'Could not set that password.');
    return true;
  },
  username(session) { return (session?.user?.email || '').split('@')[0]; },
  uid(session) { return session?.user?.id || null; },
  email(session) { return session?.user?.email || ''; },
  /* Create a login for a new seat WITHOUT swapping the leader's own session.
     supabase.auth.signUp() would sign the leader out, so hit gotrue directly.

     Returns { id, needsConfirm }. `id` is the auth uid the crm_users row has to
     be keyed on — without it there is no seat, only an unusable login. gotrue
     withholds the id when "Confirm email" is ON, because at that point the user
     is unconfirmed and it will not tell an anonymous caller who it just created.
     That is the one setting this flow requires off; Settings says so by name. */
  async createLogin(email, password) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      body: JSON.stringify({ email: (email || '').trim().toLowerCase(), password }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.msg || j.error_description || j.error || 'Could not create that login.');
    const id = j.id || j.user?.id || null;
    return { id, needsConfirm: !id };
  },
  /** a temporary password worth typing once: 20 chars, crypto-random, no
      look-alike characters, and never stored anywhere by this app. */
  tempPassword() { return makeTempPassword(); },
  async sendReset(email) {
    let redirectTo; try { redirectTo = window.location.origin; } catch { redirectTo = undefined; }
    const { error } = await supabase.auth.resetPasswordForEmail(
      (email || '').trim().toLowerCase(), redirectTo ? { redirectTo } : undefined);
    if (error) throw new Error(error.message || 'Could not send that email.');
    return true;
  },
};

/* Deliberately not `Math.random()`: this string is a real credential for the
   minute or two before the person changes it. 0/O and 1/l/I are left out
   because the leader is going to read it down a phone line. */
const PW_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
export function makeTempPassword(len = 20) {
  const n = PW_ALPHABET.length;
  const out = [];
  try {
    const buf = new Uint32Array(len);
    crypto.getRandomValues(buf);
    for (let i = 0; i < len; i++) out.push(PW_ALPHABET[buf[i] % n]);
  } catch {
    /* no WebCrypto (an ancient browser, or a test harness): refuse rather than
       silently hand back something guessable. */
    throw new Error('This browser has no secure random source — use "send a set-your-password email" instead.');
  }
  /* guarantee the shape a password policy expects, without weakening the rest */
  out[0] = 'ABCDEFGHJKLMNPQRSTUVWXYZ'[out[0].charCodeAt(0) % 24];
  out[1] = 'abcdefghijkmnopqrstuvwxyz'[out[1].charCodeAt(0) % 25];
  out[2] = '23456789'[out[2].charCodeAt(0) % 8];
  return out.join('');
}

const rows = (data) => data || [];
const throwIf = (error, allow) => {
  if (!error) return false;
  if (allow && allow.includes(error.code)) return true;   // 42P01 = table missing (pre-migration)
  throw error;
};

/* ------------------------------------------------------------------ data */
export const db = {
  /* ---- who am I ----
     An agent can only SELECT their own crm_users row, so from the browser
     "no leader exists" and "I'm not allowed to see the leader" look identical.
     crm_whoami() (security definer) answers definitively. */
  async whoami() {
    const { data, error } = await supabase.rpc('crm_whoami');
    if (error) { if (error.code === '42883' || error.code === 'PGRST202') return null; throw error; }
    const r = Array.isArray(data) ? data[0] : data;
    if (!r) return null;
    return {
      id: r.id, name: r.name || '', email: r.email || '',
      role: r.role || 'agent', active: r.active !== false, setup: !!r.setup,
      sections: r.sections || [], permissions: r.permissions || {},
      plan: r.plan || {}, pools: r.pools || [],
      seatLimit: Number(r.seat_limit) || 0, seatsUsed: Number(r.seats_used) || 0,
    };
  },
  async getUsers() {
    const { data, error } = await supabase.from('crm_users')
      .select('id,name,email,role,active,sections,permissions,plan,pools,created_at');
    if (throwIf(error, ['42P01'])) return [];
    return rows(data).map(u => ({ ...u, sections: u.sections || [], pools: u.pools || [], permissions: u.permissions || {}, plan: u.plan || {} }));
  },
  async upsertUser(u) {
    const row = {
      id: u.id, name: u.name, email: u.email || null, role: u.role || 'agent',
      active: u.active !== false, sections: u.sections || [], permissions: u.permissions || {},
      plan: u.plan || {}, pools: u.pools || [],
    };
    const { error } = await supabase.from('crm_users').upsert(row);
    if (error) throw error;
  },
  async deleteUser(id) {
    const { error } = await supabase.from('crm_users').delete().eq('id', id);
    if (error) throw error;
  },
  async getAccount() {
    const { data, error } = await supabase.from('accounts').select('id,name,seat_limit,contact_url').eq('id', 'main').maybeSingle();
    if (throwIf(error, ['42P01'])) return null;
    return data || null;
  },

  /* ---- contacts (no owner filter: the policy is the filter) ---- */
  async getContacts() {
    const { data, error } = await supabase.from('contacts')
      .select('id,owner_id,pool,side,stage,pooled_at,created_at,data');
    if (throwIf(error, ['42P01'])) return [];
    return rows(data).map(r => ({ ...r.data, id: r.id, owner_id: r.owner_id, pool: r.pool, side: r.side, stage: r.stage, pooled_at: r.pooled_at, created_at: r.created_at }));
  },
  async upsertContact(c) {
    const { error } = await supabase.from('contacts').upsert(contactRow(c));
    if (error) throw error;
  },
  async upsertContacts(list) {
    if (!list || !list.length) return;
    const { error } = await supabase.from('contacts').upsert(list.map(contactRow));
    if (error) throw error;
  },
  async deleteContact(id) {
    const { error } = await supabase.from('contacts').delete().eq('id', id);
    if (error) throw error;
  },

  /* ---- transactions ---- */
  async getTransactions() {
    const { data, error } = await supabase.from('transactions')
      .select('id,owner_id,contact_id,side,phase,status,effective_date,close_date,data,created_at');
    if (throwIf(error, ['42P01'])) return [];
    return rows(data).map(r => ({ ...r.data, id: r.id, owner_id: r.owner_id, contact_id: r.contact_id, side: r.side, phase: r.phase, status: r.status, effectiveDate: r.effective_date, closeDate: r.close_date, created_at: r.created_at }));
  },
  async upsertTransaction(t) {
    const { error } = await supabase.from('transactions').upsert(txnRow(t));
    if (error) throw error;
  },
  async deleteTransaction(id) {
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    if (error) throw error;
  },

  /* ---- tasks ---- */
  async getTasks() {
    const { data, error } = await supabase.from('tasks').select('id,user_id,transaction_id,contact_id,due,done,data');
    if (throwIf(error, ['42P01'])) return [];
    return rows(data).map(r => ({ ...r.data, id: r.id, user_id: r.user_id, transaction_id: r.transaction_id, contact_id: r.contact_id, due: r.due, done: r.done }));
  },
  async upsertTask(t) {
    const { error } = await supabase.from('tasks').upsert({
      id: t.id, user_id: t.user_id, transaction_id: t.transaction_id || null,
      contact_id: t.contact_id || null, due: t.due || null, done: !!t.done, data: strip(t),
    });
    if (error) throw error;
  },
  async deleteTask(id) {
    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (error) throw error;
  },

  /* ---- expenses: §7. No user filter here on purpose — the policy returns
     the caller's own rows and nothing else, including for the team leader. */
  async getExpenses() {
    const { data, error } = await supabase.from('expenses').select('id,user_id,spent_on,amount,category,data');
    if (throwIf(error, ['42P01'])) return [];
    return rows(data).map(r => ({ ...r.data, id: r.id, user_id: r.user_id, spentOn: r.spent_on, amount: r.amount, category: r.category }));
  },
  async upsertExpense(e) {
    const { error } = await supabase.from('expenses').upsert({
      id: e.id, user_id: e.user_id, spent_on: e.spentOn || null,
      amount: Number(e.amount) || 0, category: e.category || null, data: strip(e),
    });
    if (error) throw error;
  },
  async deleteExpense(id) {
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (error) throw error;
  },

  /* ---- contracts: metadata row + a private Storage object ---- */
  async getContracts() {
    const { data, error } = await supabase.from('contracts')
      .select('id,owner_id,transaction_id,filename,path,uploaded_at,extracted,delete_after');
    if (throwIf(error, ['42P01'])) return [];
    return rows(data);
  },
  async uploadContract(path, file) {
    const { error } = await supabase.storage.from('contracts')
      .upload(path, file, { contentType: file.type || 'application/pdf', upsert: true });
    if (error) throw error;
    return path;
  },
  async saveContract(c) {
    const { error } = await supabase.from('contracts').upsert({
      id: c.id, owner_id: c.owner_id, transaction_id: c.transaction_id || null,
      filename: c.filename, path: c.path, uploaded_at: c.uploaded_at || new Date().toISOString(),
      extracted: c.extracted || null, delete_after: c.deleteAfter || null,
    });
    if (error) throw error;
  },
  /* short-lived on purpose: never a public URL, never a long-lived signed one */
  async contractUrl(path) {
    const { data, error } = await supabase.storage.from('contracts').createSignedUrl(path, 300);
    if (error) throw error;
    return data?.signedUrl || null;
  },
  async downloadContract(path) {
    const { data, error } = await supabase.storage.from('contracts').download(path);
    if (error) throw error;
    return data;
  },
  /* hard delete: the object goes, not just the row */
  async removeContract(id, path) {
    if (path) { const { error } = await supabase.storage.from('contracts').remove([path]); if (error) throw error; }
    const { error } = await supabase.from('contracts').delete().eq('id', id);
    if (error) throw error;
  },

  /* ---- receipts (The Books) ---- */
  async uploadReceipt(path, file) {
    const { error } = await supabase.storage.from('receipts').upload(path, file, { contentType: file.type || 'application/pdf', upsert: true });
    if (error) throw error;
    return path;
  },
  async receiptUrl(path) {
    const { data, error } = await supabase.storage.from('receipts').createSignedUrl(path, 300);
    if (error) throw error;
    return data?.signedUrl || null;
  },
  async removeReceipt(path) {
    const { error } = await supabase.storage.from('receipts').remove([path]);
    if (error) throw error;
  },

  /* ---- settings + huddle: one shared row each, leader-write ---- */
  async getSettings() {
    const { data, error } = await supabase.from('app_settings').select('data').eq('id', 'main').maybeSingle();
    if (throwIf(error, ['42P01'])) return null;
    return data?.data || null;
  },
  async saveSettings(obj) {
    const { error } = await supabase.from('app_settings').upsert({ id: 'main', data: obj });
    if (error) throw error;
  },
  async getHuddle() {
    const { data, error } = await supabase.from('app_settings').select('data').eq('id', 'huddle').maybeSingle();
    if (throwIf(error, ['42P01'])) return null;
    return data?.data || null;
  },
  async saveHuddle(obj) {
    const { error } = await supabase.from('app_settings').upsert({ id: 'huddle', data: obj });
    if (error) throw error;
  },
};

/* jsonb payload = the record minus the columns we mirror, so a value can never
   disagree with itself between the column and the blob. */
const OMIT = ['owner_id', 'pool', 'side', 'stage', 'pooled_at', 'created_at', 'user_id',
  'transaction_id', 'contact_id', 'due', 'done', 'spentOn', 'amount', 'category', 'phase', 'status'];
function strip(o) {
  const out = { ...o };
  OMIT.forEach(k => { delete out[k]; });
  return out;
}
const contactRow = c => ({
  id: c.id, owner_id: c.owner_id || null, pool: c.pool || null,
  side: c.side || 'buyer', stage: c.stage || 'new',
  pooled_at: c.pooled_at || null, data: { ...strip(c), id: c.id },
});
const txnRow = t => ({
  id: t.id, owner_id: t.owner_id || null, contact_id: t.contact_id || null,
  side: t.side || 'buyer', phase: t.phase || 'uc', status: t.status || 'active',
  effective_date: t.effectiveDate || null, close_date: t.closeDate || null,
  data: { ...strip(t), id: t.id },
});
