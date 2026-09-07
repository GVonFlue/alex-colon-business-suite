/* ============================================================================
   App.jsx — the shell.

   Deliberately thin. It owns: the session, the loaded data, the mutation
   helpers, the nav, and one `ctx` object handed to every view (see
   docs/VIEW-CONTRACT.md). All the domain logic lives in src/lib/* so it can be
   unit tested without a browser, and every view is a file under src/views/.

   The source repo was one 5,500-line App.jsx. That was fine for one product and
   miserable as a template, which is what this repo is for.
   ========================================================================== */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Activity, Bot, ListTodo, LayoutDashboard, KanbanSquare, Contact2, Building2, FileText, DollarSign,
  BookText, Sparkles, CalendarCheck, Settings as SettingsIcon, Menu, LogOut,
  Loader2, AlertTriangle, ShieldCheck, RotateCcw, Plane,
} from 'lucide-react';

import { AI_NAME, BRAND, DEMO, PRODUCT_SHORT } from './lib/brand';
import { ASSETS } from './lib/assets';
import { photoOf } from './lib/people';
import SidebarArt from './components/SidebarArt';
import { CSS } from './styles';
import { auth, db, configured, isDemo, demoApi } from './lib/data';
import { mergeSettings, defaultSettings, SECTIONS, DEFAULT_AGENT_SECTIONS, DEFAULT_COORDINATOR_SECTIONS, ROLES, defaultPermissions, holidaysOf, rolloverOf, tzOf } from './lib/settings';
import { today, urgency, effectiveDateOf, daysUntil } from './lib/dates';
import { uid, initials } from './lib/format';
import { Card, Btn, Field, Inp } from './components/ui';

import Assistant from './views/Assistant';
import ActivityView from './views/ActivityView';
import Tasks from './views/Tasks';
import Dashboard from './views/Dashboard';
import PCS from './views/PCS';
import Pipeline from './views/Pipeline';
import Contacts from './views/Contacts';
import Transactions from './views/Transactions';
import Contracts from './views/Contracts';
import Commission from './views/Commission';
import Books from './views/Books';
import Tools from './views/Tools';
import Huddle from './views/Huddle';
import SettingsView from './views/Settings';

const ICONS = {
  assistant: Bot, tasks: ListTodo, activity: Activity,
  dashboard: LayoutDashboard, pcs: Plane, pipeline: KanbanSquare, contacts: Contact2,
  transactions: Building2, contracts: FileText, commission: DollarSign,
  books: BookText, tools: Sparkles, huddle: CalendarCheck, settings: SettingsIcon,
};
const VIEWS = {
  assistant: Assistant, tasks: Tasks, activity: ActivityView,
  dashboard: Dashboard, pcs: PCS, pipeline: Pipeline, contacts: Contacts,
  transactions: Transactions, contracts: Contracts, commission: Commission,
  books: Books, tools: Tools, huddle: Huddle, settings: SettingsView,
};

/** the words a person sees for their own seat. ROLES is the single list. */
const roleLabelOf = u => {
  const r = (ROLES.find(x => x.key === ((u && u.role) || 'agent')) || {});
  return r.label || 'Agent';
};

export default function App() {
  const [session, setSession] = useState(null);
  const [booted, setBooted] = useState(false);
  const [me, setMe] = useState(null);
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');

  const [settings, setSettings] = useState(defaultSettings());
  const [users, setUsers] = useState([]);
  const [account, setAccount] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [huddle, setHuddle] = useState(null);

  const [view, setView] = useState('dashboard');
  const [params, setParams] = useState({});
  const [navOpen, setNavOpen] = useState(false);
  /* measured height of the demo bar, so the sticky sidebar can be exactly the
     remaining viewport rather than 100vh minus nothing */
  const [barH, setBarH] = useState(0);
  const [loading, setLoading] = useState(true);

  /* ---------------------------------------------------------------- session */
  useEffect(() => {
    let off;
    (async () => {
      try {
        const s = await auth.session();
        setSession(s);
      } catch (e) { setErr(String(e.message || e)); }
      setBooted(true);
      const sub = auth.onChange(s => setSession(s));
      off = sub?.data?.subscription?.unsubscribe;
    })();
    return () => { try { off && off(); } catch {} };
  }, []);

  /* demo: re-load everything when the View-as switcher changes, because the
     data layer answers differently for a different seat — exactly like RLS */
  useEffect(() => {
    if (!isDemo || !demoApi) return;
    return demoApi.onChange(() => { load(); });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [who, s, us, acct, cs, ts, tk, ex, ct, hd] = await Promise.all([
        db.whoami().catch(() => null),
        db.getSettings().catch(() => null),
        db.getUsers().catch(() => []),
        db.getAccount().catch(() => null),
        db.getContacts().catch(() => []),
        db.getTransactions().catch(() => []),
        db.getTasks().catch(() => []),
        db.getExpenses().catch(() => []),
        db.getContracts().catch(() => []),
        db.getHuddle().catch(() => null),
      ]);
      setMe(who);
      setSettings(mergeSettings(s));
      setUsers(us || []);
      setAccount(acct);
      setContacts(cs || []);
      setTransactions(ts || []);
      setTasks(tk || []);
      setExpenses(ex || []);
      setContracts(ct || []);
      setHuddle(hd);
      setErr('');
    } catch (e) {
      setErr(String(e.message || e));
    }
    setLoading(false);
  }, []);

  useEffect(() => { if (session) load(); }, [session, load]);

  const flash = useCallback(msg => { setToast(msg); setTimeout(() => setToast(t => (t === msg ? '' : t)), 3200); }, []);

  /* ------------------------------------------------------------ permissions
     Three roles (ROLES in settings.js, is_leader()/is_coordinator() in
     MIGRATION.sql). isLeader stays strictly the leader — a coordinator is NOT a
     junior leader, and every view that reads ctx.isLeader means "the owner of
     the install", so widening it would hand a coordinator the money screens. */
  const isLeader = !!me && me.role === 'leader';
  const isCoordinator = !!me && me.role === 'coordinator';
  const perms = useMemo(() => ({ ...defaultPermissions(), ...((me && me.permissions) || {}) }), [me]);

  /* A coordinator's affordances follow their ROLE, not a per-person toggle,
     because the policies follow their role too. They read every transaction and
     every contact, so the owner column and the team board are simply correct for
     them; they have no commission and no Books, so those three are hard off and
     no checkbox in Settings can turn them on. */
  const COORD_PERMS = useMemo(() => ({
    seeTeamPipeline: true, seeOtherContacts: true,
    seeTeamCommission: false, seeOtherCommission: false,
    books: false, editOwnSplit: false,
    createPools: false, exportData: !!perms.exportData,
  }), [perms.exportData]);

  const can = useCallback(k => {
    if (isLeader) return true;
    if (isCoordinator && k in COORD_PERMS) return COORD_PERMS[k];
    return !!perms[k];
  }, [isLeader, isCoordinator, COORD_PERMS, perms]);

  /* the sections this seat may see: install modules ∩ (role default or the
     leader's per-person list). A per-person list can only ever narrow it. */
  const nav = useMemo(() => {
    const installed = (settings.modules && settings.modules.length) ? settings.modules : SECTIONS.map(s => s.key);
    const brandLimited = BRAND.modules.length ? BRAND.modules : null;
    let allowed = SECTIONS.filter(s => installed.includes(s.key))
      .filter(s => !brandLimited || brandLimited.includes(s.key));
    if (!isLeader) {
      const roleDefault = isCoordinator ? DEFAULT_COORDINATOR_SECTIONS : DEFAULT_AGENT_SECTIONS;
      const own = (me && me.sections && me.sections.length) ? me.sections : roleDefault;
      allowed = allowed.filter(s => !s.leaderOnly && own.includes(s.key));
      /* Commission and The Books do not exist for a coordinator. This is not a
         narrowing the leader chose and can undo by ticking a box — it is what
         the role means, so it is applied after the per-person list. */
      if (isCoordinator) allowed = allowed.filter(s => s.key !== 'commission' && s.key !== 'books');
      if (!can('books')) allowed = allowed.filter(s => s.key !== 'books');
    }
    return allowed;
  }, [settings.modules, isLeader, isCoordinator, me, can]);

  useEffect(() => {
    if (nav.length && !nav.some(n => n.key === view)) setView(nav[0].key);
  }, [nav, view]);

  /* --------------------------------------------------------------- mutations
     Every writer updates local state optimistically and then persists. A
     rejection (RLS, seat trigger) surfaces as a toast and a reload, so the UI
     can never claim a write happened that the database refused. */
  const guard = useCallback(async (fn, okMsg) => {
    try { await fn(); if (okMsg) flash(okMsg); return true; }
    catch (e) {
      flash(e && e.code === '42501' ? 'The database refused that — you do not have access.' : (e.message || 'That did not save.'));
      load();
      return false;
    }
  }, [flash, load]);

  const upsertContact = useCallback(async c => {
    setContacts(list => (list.some(x => x.id === c.id) ? list.map(x => (x.id === c.id ? c : x)) : [...list, c]));
    await guard(() => db.upsertContact(c));
  }, [guard]);

  const deleteContact = useCallback(async id => {
    setContacts(list => list.filter(x => x.id !== id));
    await guard(() => db.deleteContact(id), 'Contact deleted.');
  }, [guard]);

  const upsertTransaction = useCallback(async t => {
    setTransactions(list => (list.some(x => x.id === t.id) ? list.map(x => (x.id === t.id ? t : x)) : [...list, t]));
    await guard(() => db.upsertTransaction(t));
  }, [guard]);

  const deleteTransaction = useCallback(async id => {
    setTransactions(list => list.filter(x => x.id !== id));
    await guard(() => db.deleteTransaction(id), 'Transaction deleted.');
  }, [guard]);

  const upsertTask = useCallback(async t => {
    setTasks(list => (list.some(x => x.id === t.id) ? list.map(x => (x.id === t.id ? t : x)) : [...list, t]));
    await guard(() => db.upsertTask(t));
  }, [guard]);

  const deleteTask = useCallback(async id => {
    setTasks(list => list.filter(x => x.id !== id));
    await guard(() => db.deleteTask(id));
  }, [guard]);

  const upsertExpense = useCallback(async e => {
    setExpenses(list => (list.some(x => x.id === e.id) ? list.map(x => (x.id === e.id ? e : x)) : [...list, e]));
    await guard(() => db.upsertExpense(e));
  }, [guard]);

  const deleteExpense = useCallback(async id => {
    setExpenses(list => list.filter(x => x.id !== id));
    await guard(() => db.deleteExpense(id));
  }, [guard]);

  const saveSettings = useCallback(async next => {
    setSettings(next);
    await guard(() => db.saveSettings(next), 'Settings saved.');
  }, [guard]);

  const saveUser = useCallback(async u => {
    setUsers(list => (list.some(x => x.id === u.id) ? list.map(x => (x.id === u.id ? u : x)) : [...list, u]));
    const ok = await guard(() => db.upsertUser(u), 'Saved.');
    if (ok && me && u.id === me.id) setMe({ ...me, ...u });
    return ok;
  }, [guard, me]);

  const removeUser = useCallback(async id => {
    setUsers(list => list.filter(x => x.id !== id));
    await guard(() => db.deleteUser(id), 'Seat removed.');
  }, [guard]);

  const saveHuddle = useCallback(async h => {
    setHuddle(h);
    await guard(() => db.saveHuddle(h));
  }, [guard]);

  const saveContract = useCallback(async c => {
    setContracts(list => (list.some(x => x.id === c.id) ? list.map(x => (x.id === c.id ? c : x)) : [...list, c]));
    await guard(() => db.saveContract(c));
  }, [guard]);

  const removeContract = useCallback(async (id, path) => {
    setContracts(list => list.filter(x => x.id !== id));
    await guard(() => db.removeContract(id, path), 'Contract deleted — file and record.');
  }, [guard]);

  /* claiming a pool lead: assigns ownership and takes it out of the pool */
  const claimContact = useCallback(async c => {
    const next = { ...c, owner_id: me.id, pool: null, pooled_at: null,
      activity: [{ id: uid(), at: new Date().toISOString(), kind: 'note', note: `Claimed from the pool by ${me.name}.`, by: me.id }, ...(c.activity || [])] };
    await upsertContact(next);
    flash(`${c.name} is yours.`);
  }, [me, upsertContact, flash]);

  const go = useCallback((v, p) => { setView(v); setParams(p || {}); setNavOpen(false); window.scrollTo?.(0, 0); }, []);

  /* --------------------------------------------------------------- the ctx */
  const tz = tzOf(settings);
  const ctx = useMemo(() => ({
    me, users, account, isLeader, isCoordinator, roleLabel: roleLabelOf(me), can, perms,
    settings, saveSettings,
    contacts, upsertContact, deleteContact, claimContact,
    transactions, upsertTransaction, deleteTransaction,
    tasks, upsertTask, deleteTask,
    expenses, upsertExpense, deleteExpense,
    contracts, saveContract, removeContract,
    huddle, saveHuddle,
    users_by_id: Object.fromEntries((users || []).map(u => [u.id, u])),
    tz, todayIso: today(tz), holidays: holidaysOf(settings), rollover: rolloverOf(settings),
    go, params, flash, loading, isDemo,
    seats: { limit: (account && account.seat_limit) || (me && me.seatLimit) || 0, used: (users || []).filter(u => u.active !== false).length },
    /* db is the escape hatch for storage and for the writers the contract does
       not carry (seats). auth is here for exactly one screen: Settings -> Team,
       which creates a login for a new seat. No other view may touch it. */
    db, auth,
  }), [me, users, account, isLeader, isCoordinator, can, perms, settings, saveSettings, contacts, upsertContact,
    deleteContact, claimContact, transactions, upsertTransaction, deleteTransaction, tasks, upsertTask,
    deleteTask, expenses, upsertExpense, deleteExpense, contracts, saveContract, removeContract,
    huddle, saveHuddle, tz, go, params, flash, loading]);

  /* ---------------------------------------------------------------- render */
  if (!booted) return <Boot />;

  if (!isDemo && !configured) return <SetupScreen />;
  if (!isDemo && !session) return <Login onErr={setErr} err={err} />;
  if (!isDemo && session && me && me.active === false) return <Deactivated onOut={() => auth.logout()} />;

  const View = VIEWS[view] || Dashboard;
  const current = SECTIONS.find(s => s.key === view);

  return (
    <>
      <style>{CSS}</style>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        {isDemo && <DemoBar onHeight={setBarH} />}
        <div className="pt" style={{ flex: 1, '--topbar': `${barH}px` }}>
          {/* The sidebar is a three-part column: brand, a nav list that scrolls
              on its own, and a footer pinned to the bottom. The footer holds the
              account and Sign out, so neither can ever be pushed off-screen by a
              long nav list or by the demo bar taking height off the top. */}
          <aside className={'sb' + (navOpen ? ' open' : '')}>
            {/* The circuit backdrop. First child, and the only one the CSS
                lets sit at z-index 0 — everything after it stacks above. */}
            <SidebarArt />

            {/* The client's mark, hard-coded (src/lib/assets.js). No box behind
                it: the .sb-glow bloom lights it instead, same as the CRM. */}
            <div className="sb-brand">
              <div className="sb-glow" aria-hidden="true" />
              <img className="sb-logo" src={ASSETS.clientLogo} alt={ASSETS.clientLogoAlt} />
              <span className="sb-suite">{isDemo ? `${PRODUCT_SHORT} · demo` : PRODUCT_SHORT}</span>
            </div>

            <nav className="sb-nav">
              {nav.map(s => {
                const I = ICONS[s.key] || LayoutDashboard;
                /* the assistant carries the tenant's own name */
                const label = s.key === 'assistant' ? AI_NAME : s.label;
                return (
                  <button key={s.key} className={'nav-i' + (view === s.key ? ' on' : '')} onClick={() => go(s.key)}>
                    <I size={16} /> <span className="nav-l">{label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="sb-foot">
              <div className="sb-me">
                {/* photoOf() resolves by email, then by name, then by the leader
                    seat — so an agent or the demo's "View as" switcher still
                    gets their own initials rather than the owner's face. */}
                <span className={'sb-av' + (photoOf(me) ? ' has-photo' : '')}>
                  {photoOf(me)
                    ? <img src={photoOf(me)} alt={me ? me.name : ''} loading="lazy" />
                    : initials(me ? me.name : '')}
                </span>
                <div style={{ minWidth: 0 }}>
                  <b>{me ? me.name : ''}</b>
                  <span>{roleLabelOf(me)}</span>
                </div>
              </div>
              {isDemo ? (
                <button className="sb-out" onClick={() => demoApi && demoApi.reset()} title="Put the seeded data back">
                  <RotateCcw size={15} /> <span>Reset demo</span>
                </button>
              ) : (
                <button className="sb-out" onClick={() => auth.logout()}>
                  <LogOut size={15} /> <span>Sign out</span>
                </button>
              )}
              {(BRAND.tagline || BRAND.taglineSub) && (
                <div className="sb-tag">
                  {BRAND.tagline && <b>{BRAND.tagline}</b>}
                  {BRAND.taglineSub && <span>{BRAND.taglineSub}</span>}
                </div>
              )}
            </div>
          </aside>
          {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}

          <div className="main">
            {/* Our wordmark, then the product line. The chip behind the image is
                #000110 — the same colour as the artwork's own background — so
                the logo reads as a mark and not as a pasted-in rectangle. */}
            <div className="suite-bar">
              <span className="suite-logo">
                <img src={ASSETS.productLogo} alt={ASSETS.productLogoAlt} />
              </span>
              <span className="suite-name">{PRODUCT_SHORT}</span>
              <span className="suite-for">built for {BRAND.name}</span>
            </div>
            <div className="top">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <button className="hamb" onClick={() => setNavOpen(o => !o)}><Menu size={22} /></button>
                <h1>{current ? (current.key === 'assistant' ? AI_NAME : current.label) : 'Dashboard'}</h1>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {loading && <Loader2 size={16} className="spin" style={{ color: '#928DAD' }} />}
                <DueBadge ctx={ctx} onClick={() => go('transactions', { focus: 'dates' })} />
              </div>
            </div>
            <div className="body">
              {err && <div className="note bad" style={{ marginBottom: 14 }}><AlertTriangle size={14} /> {err}</div>}
              {me ? <View ctx={ctx} />
                : loading ? <div className="empty">Loading your seat…</div>
                : <NoSeat session={session} onDone={load} />}
            </div>
          </div>
        </div>
      </div>
      {toast && <div className="cel still"><div className="cel-ic"><ShieldCheck size={16} /></div>{toast}</div>}
    </>
  );
}

/* -------------------------------------------------------------------- bits */

function Boot() {
  return (
    <>
      <style>{CSS}</style>
      <div className="gate"><div className="gate-card"><Loader2 size={24} className="spin" /><h2>Loading</h2></div></div>
    </>
  );
}

function DemoBar({ onHeight }) {
  const [who, setWho] = useState(demoApi ? demoApi.viewAs : '');
  const ref = useRef(null);
  useEffect(() => demoApi && demoApi.onChange(setWho), []);
  /* the bar wraps on a narrow screen, so measure rather than assume */
  useEffect(() => {
    const el = ref.current;
    if (!el || !onHeight) return;
    const read = () => onHeight(el.offsetHeight || 0);
    read();
    let ro;
    try { ro = new ResizeObserver(read); ro.observe(el); } catch { window.addEventListener('resize', read); }
    return () => { try { ro && ro.disconnect(); } catch {} window.removeEventListener('resize', read); };
  }, [onHeight]);
  if (!demoApi) return null;
  return (
    <div className="demo-bar" ref={ref}>
      <span className="dbdot" />
      <span>Demo — data resets on refresh.</span>
      <span className="dbsp" />
      <div className="viewas">
        <span>View as</span>
        {demoApi.users().map(u => (
          <button key={u.id} className={who === u.id ? 'on' : ''} onClick={() => demoApi.setViewAs(u.id)}>
            {u.role === 'agent' ? u.name.split(' ')[0] : `${u.name.split(' ')[0]} (${roleLabelOf(u).toLowerCase()})`}
          </button>
        ))}
      </div>
    </div>
  );
}

/** the daily driver: how many deadlines are due, with anything inside 48h loud */
function DueBadge({ ctx, onClick }) {
  const { transactions, tz, settings } = ctx;
  const flagHours = (settings.reminders && settings.reminders.hardFlagHours) || 48;
  let soon = 0, over = 0;
  (transactions || []).filter(t => t.status === 'active').forEach(t => {
    (t.deadlines || []).forEach(d => {
      const u = urgency(d, tz);
      if (u === 'overdue') over++;
      else if (u === 'urgent' || (u === 'soon' && daysUntil(effectiveDateOf(d), tz) * 24 <= flagHours)) soon++;
    });
  });
  if (!soon && !over) return null;
  return (
    <button className="btn btn-g btn-sm" onClick={onClick} style={over ? { background: '#FDECEC', color: '#B03030' } : undefined}>
      <AlertTriangle size={13} />
      {over ? `${over} overdue` : ''}{over && soon ? ' · ' : ''}{soon ? `${soon} inside ${flagHours}h` : ''}
    </button>
  );
}

/* ---------------------------------------------------------------- no seat
   The signed-in account has no crm_users row, so whoami() returned nothing.
   Two ways to get here and they need different answers:

     - FIRST RUN. crm_users is empty and the policies let this account insert
       itself as the leader. That is the only self-promotion the database ever
       allows and it closes the moment the first row exists.
     - EVERY OTHER TIME. The team already exists and this account is not on it.
       No button can fix that; the leader has to add them.

   We do not know which, and cannot: an account with no row cannot read the
   table to find out. So we let the DATABASE decide — try the insert, and if the
   policy refuses, that is the answer. Before this screen existed the app just
   said "Loading your seat…" forever, which is how the first real install went. */
function NoSeat({ session, onDone }) {
  const email = auth.email(session) || '';
  const [name, setName] = useState(email ? email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '');
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState('');

  const claim = async () => {
    setBusy(true); setRefused('');
    try {
      await db.upsertUser({
        id: auth.uid(session), name: name.trim() || email, email,
        role: 'leader', active: true, sections: [], permissions: {}, plan: {}, pools: [],
      });
      await onDone();
    } catch (e) {
      setRefused(e && e.message ? e.message : 'The database refused that.');
    }
    setBusy(false);
  };

  return (
    <div style={{ maxWidth: 620 }}>
      <Card title="This account has no seat yet"
        sub={`Signed in as ${email}. There is no team member record attached to it.`}>
        {!refused ? (
          <>
            <p style={{ fontSize: 14.5, color: '#56527a', marginTop: 0 }}>
              If this is the first sign-in on a new install, claim it as the team leader — you will then add everyone
              else from Settings. If the team already exists, this will be refused and the team leader needs to add you.
            </p>
            <div className="fgrid">
              <Field label="Your name" full>
                <Inp value={name} onChange={e => setName(e.target.value)} placeholder="Jeff Schnell" />
              </Field>
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Btn kind="p" onClick={claim} disabled={busy || !name.trim()}
                icon={busy ? <Loader2 size={14} className="spin" /> : <ShieldCheck size={14} />}>
                {busy ? 'Setting up…' : 'Claim this as the team leader'}
              </Btn>
              <Btn kind="g" onClick={() => auth.logout()}>Sign out</Btn>
            </div>
          </>
        ) : (
          <>
            <div className="note bad"><AlertTriangle size={14} /> {refused}</div>
            <p style={{ fontSize: 14.5, color: '#56527a' }}>
              The database refused it, which almost always means the team already exists — the leader seat can only be
              claimed while the team is empty. Ask your team leader to add <b>{email}</b> in Settings → Team. They can
              send you a set-your-password email from the same screen.
            </p>
            <Btn kind="g" onClick={() => auth.logout()}>Sign out</Btn>
          </>
        )}
      </Card>
    </div>
  );
}

function SetupScreen() {
  return (
    <>
      <style>{CSS}</style>
      <div className="gate">
        <div className="gate-card" style={{ width: 420 }}>
          <h2>Not configured</h2>
          <p style={{ textAlign: 'left' }}>
            This deployment has no database credentials. Set <code>VITE_SUPABASE_URL</code> and{' '}
            <code>VITE_SUPABASE_KEY</code> in Vercel, or run the demo with <code>VITE_DEMO=1</code>.
            See DEPLOY.md.
          </p>
        </div>
      </div>
    </>
  );
}

function Deactivated({ onOut }) {
  return (
    <>
      <style>{CSS}</style>
      <div className="gate"><div className="gate-card">
        <h2>Seat deactivated</h2>
        <p>Your access has been turned off. Your history and commission record are intact — ask your team leader to reactivate you.</p>
        <button className="btn btn-p" onClick={onOut}>Sign out</button>
      </div></div>
    </>
  );
}

function Login({ err }) {
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [busy, setBusy] = useState(false);
  const [e, setE] = useState('');
  const submit = async ev => {
    ev.preventDefault();
    setBusy(true); setE('');
    const { error } = await auth.login(u, p);
    if (error) setE(error.message || 'That did not work.');
    setBusy(false);
  };
  return (
    <>
      <style>{CSS}</style>
      <div className="gate">
        <form className="gate-card" onSubmit={submit}>
          <span className="nucleus" style={{ margin: '0 auto' }} />
          <h2>{BRAND.name}</h2>
          <p>Sign in with your email</p>
          <input value={u} onChange={ev => setU(ev.target.value)} placeholder="you@brokerage.com" autoComplete="username" />
          <input value={p} onChange={ev => setP(ev.target.value)} type="password" placeholder="Password" autoComplete="current-password" />
          <button className="btn btn-p" style={{ width: '100%' }} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          {(e || err) && <div className="gate-err">{e || err}</div>}
        </form>
      </div>
    </>
  );
}
