/* ============================================================================
   views/Contacts.jsx — the database of people (§2) and the lead pools (§6).

   Two exports:
     default      the Contacts view — toolbar, lead pools, sortable table
     ContactModal the one contact record editor, also opened from Pipeline

   Nothing here filters for privacy. `ctx.contacts` is already scoped by the
   database (or by demo.js, which mimics the same policies). `ctx.can(...)` only
   ever decides whether a CONTROL is worth rendering.

   Every label that differs by side (buyer / seller / both) comes from
   settings.js, and every date comes from dates.js.
   ========================================================================== */

import React, { useState, useMemo, useEffect } from 'react';
import {
  Search, Plus, Download, Phone, Mail, MessageSquare, StickyNote, CalendarPlus,
  Trash2, UserPlus, Check, CheckCircle2, Circle, Clock, ExternalLink,
  Building2, ListChecks, MapPin, X,
} from 'lucide-react';

import {
  Card, Btn, Pill, Tag, Field, Inp, Sel, Txt, SideChip, ModalShell,
  Empty, SecTitle, ErrorNote,
} from '../components/ui';
import {
  stagesOf, stageOf, stageLabel, checklistFor, phasesOf,
} from '../lib/settings';
import { addDays, daysUntil, fmtShort, fmtLong } from '../lib/dates';
import { usd, uid, phoneFmt } from '../lib/format';
import { expectedPrice } from '../lib/txn';
import { BRAND } from '../lib/brand';

/* ------------------------------------------------------------------ helpers */

const SIDES = [
  { value: 'buyer', label: 'Buyer' },
  { value: 'seller', label: 'Seller' },
  { value: 'both', label: 'Both — buying and selling' },
];
const APPT_STATUS = [
  { key: 'booked', label: 'Booked' },
  { key: 'held', label: 'Held' },
  { key: 'noshow', label: 'No-show' },
  { key: 'cancelled', label: 'Cancelled' },
];
const ACT_KINDS = [
  { key: 'call', label: 'Call', Icon: Phone },
  { key: 'text', label: 'Text', Icon: MessageSquare },
  { key: 'email', label: 'Email', Icon: Mail },
  { key: 'note', label: 'Note', Icon: StickyNote },
];
const KIND_ICON = { call: Phone, text: MessageSquare, email: Mail, note: StickyNote, appointment: CalendarPlus };

/* a lead nobody claims is a lead going cold: past this many days it goes red */
const COLD_POOL_DAYS = 7;
/* no contact in this long and the row is cold too */
const COLD_TOUCH_DAYS = 14;

/** whole days since an iso date, in the install timezone. null when unset. */
const daysSince = (iso, tz) => {
  const n = daysUntil(iso, tz);
  return n == null ? null : -n;
};
const agoText = d => (d == null ? 'never' : d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d}d ago`);
const dueClass = n => (n == null ? 'far' : n < 0 ? 'over' : n === 0 ? 'today' : n <= 7 ? 'soon' : 'far');

/** what a contact is worth on the board: the seller's target, or the midpoint */

/** the price a row or card shows */
const priceText = c => {
  if (!c) return '—';
  if (Number(c.targetPrice) > 0) return usd(c.targetPrice);
  const lo = Number(c.priceMin) || 0, hi = Number(c.priceMax) || 0;
  if (lo && hi && lo !== hi) return `${usd(lo)}–${usd(hi)}`;
  return lo || hi ? usd(lo || hi) : '—';
};

const ownerName = (ctx, id) => (id ? ((ctx.users_by_id[id] && ctx.users_by_id[id].name) || 'Another agent') : 'Unclaimed');

/* the pools this seat can actually see. A leader sees all of them; an agent
   sees the ones they were added to. Nothing else is implied to exist. */
export function visiblePools(ctx) {
  const pools = (ctx.settings && ctx.settings.pools) || [];
  const mine = (ctx.me && ctx.me.pools) || [];
  return pools.filter(p => ctx.isLeader || mine.includes(p.key));
}

/* ============================================================== the view */

export default function Contacts({ ctx }) {
  const { settings, contacts, transactions, isLeader, tz } = ctx;
  const stages = stagesOf(settings);
  const showOwner = isLeader || ctx.can('seeOtherContacts');

  const [q, setQ] = useState('');
  const [side, setSide] = useState('all');
  const [stage, setStage] = useState('all');
  const [source, setSource] = useState('all');
  const [owner, setOwner] = useState('all');
  const [sort, setSort] = useState({ key: 'lastTouch', dir: 'asc' });
  const [openId, setOpenId] = useState(null);
  const [draftNew, setDraftNew] = useState(null);

  /* another view can hand us a contact to open: go('contacts', { open: id }) */
  useEffect(() => {
    if (ctx.params && ctx.params.open) setOpenId(ctx.params.open);
  }, [ctx.params]);

  /* MLS numbers live on transactions, so searching one has to reach through */
  const txnText = useMemo(() => {
    const m = {};
    (transactions || []).forEach(t => {
      const bits = [t.mls, t.address].filter(Boolean).join(' ').toLowerCase();
      m[t.contact_id] = (m[t.contact_id] ? m[t.contact_id] + ' ' : '') + bits;
    });
    return m;
  }, [transactions]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = (contacts || []).filter(c => {
      if (side !== 'all' && c.side !== side) return false;
      if (stage !== 'all' && c.stage !== stage) return false;
      if (source !== 'all' && (c.source || '') !== source) return false;
      if (owner !== 'all') {
        if (owner === 'pool' ? c.owner_id != null : c.owner_id !== owner) return false;
      }
      if (!needle) return true;
      const hay = [c.name, c.email, c.phone, phoneFmt(c.phone), c.address, (c.areas || []).join(' '), txnText[c.id] || '']
        .join(' ').toLowerCase();
      return hay.includes(needle);
    });

    const acc = {
      name: c => String(c.name || '').toLowerCase(),
      stage: c => stages.findIndex(s => s.key === c.stage),
      price: c => expectedPrice(c),
      timeline: c => (settings.timelines || []).indexOf(c.timeline),
      preapproval: c => String(c.preapproval || '').toLowerCase(),
      source: c => String(c.source || '').toLowerCase(),
      owner: c => ownerName(ctx, c.owner_id).toLowerCase(),
      lastTouch: c => String(c.lastTouch || ''),
      nextAction: c => String(c.nextActionDue || '9999-99-99'),
    };
    const f = acc[sort.key] || acc.name;
    list = list.slice().sort((a, b) => {
      const x = f(a), y = f(b);
      const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      return sort.dir === 'asc' ? r : -r;
    });
    return list;
  }, [contacts, q, side, stage, source, owner, sort, stages, settings.timelines, txnText, ctx]);

  const th = (key, label) => (
    <th className={sort.key === key ? 'sorted' : ''}
      onClick={() => setSort(s => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }))}>
      {label}<span className="ar">{sort.key === key ? (sort.dir === 'asc' ? '▲' : '▼') : '▾'}</span>
    </th>
  );

  const exportCsv = () => {
    const cols = [
      ['Name', c => c.name], ['Side', c => c.side],
      ['Stage', c => stageLabel(c.stage, c.side, settings)],
      ['Email', c => c.email], ['Phone', c => phoneFmt(c.phone)],
      ['Price', c => priceText(c)], ['Timeline', c => c.timeline],
      ['Pre-approval', c => c.preapproval], ['Lender', c => c.lender],
      ['Source', c => c.source], ['Owner', c => ownerName(ctx, c.owner_id)],
      ['Property type', c => c.propertyType], ['Areas', c => (c.areas || []).join('; ')],
      ['Address', c => c.address], ['Last touch', c => c.lastTouch],
      ['Next action', c => c.nextAction], ['Next action due', c => c.nextActionDue],
    ];
    const esc = v => {
      const s = v == null ? '' : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const body = [cols.map(c => esc(c[0])).join(',')]
      .concat(rows.map(r => cols.map(c => esc(c[1](r))).join(',')))
      .join('\r\n');
    const url = URL.createObjectURL(new Blob([body], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `contacts-${ctx.todayIso}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    ctx.flash(`${rows.length} row${rows.length === 1 ? '' : 's'} exported.`);
  };

  const newContact = () => {
    const first = stages[0] ? stages[0].key : 'new';
    setDraftNew({
      id: uid(), name: '', email: '', phone: '', side: 'buyer', stage: first,
      source: (settings.sources || [])[0] || '', owner_id: isLeader ? null : ctx.me.id,
      pool: null, pooled_at: null, created_at: ctx.todayIso, lastTouch: ctx.todayIso,
      priceMin: '', priceMax: '', targetPrice: '', preapproval: (settings.preapprovalStatuses || [])[0] || '',
      lender: '', timeline: (settings.timelines || [])[0] || '',
      propertyType: (settings.propertyTypes || [])[0] || '', areas: [], address: '',
      beds: '', baths: '', nextAction: 'First call', nextActionDue: ctx.todayIso, notes: '',
      closedWithUsOn: null, appointments: [], checklist: {}, activity: [],
    });
  };

  const open = (contacts || []).find(c => c.id === openId) || null;
  const agents = (ctx.users || []).filter(u => u.active !== false);

  return (
    <>
      <div className="toolbar">
        <div className="searchbox">
          <Search size={16} style={{ color: '#928DAD', flex: 'none' }} />
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder="Name, email, phone, address or MLS number" />
          {q && <button className="kcoll-x" onClick={() => setQ('')} aria-label="Clear"><X size={13} /></button>}
        </div>
        <select className="selctl" value={side} onChange={e => setSide(e.target.value)}>
          <option value="all">All sides</option>
          <option value="buyer">Buyers</option>
          <option value="seller">Sellers</option>
          <option value="both">Both</option>
        </select>
        <select className="selctl" value={stage} onChange={e => setStage(e.target.value)}>
          <option value="all">All stages</option>
          {stages.map(s => (
            <option key={s.key} value={s.key}>
              {s.sellerLabel === s.buyerLabel ? s.sellerLabel : `${s.sellerLabel} / ${s.buyerLabel}`}
            </option>
          ))}
        </select>
        <select className="selctl" value={source} onChange={e => setSource(e.target.value)}>
          <option value="all">All sources</option>
          {(settings.sources || []).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {showOwner && (
          <select className="selctl" value={owner} onChange={e => setOwner(e.target.value)}>
            <option value="all">All agents</option>
            {agents.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            <option value="pool">Unclaimed pool</option>
          </select>
        )}
        {ctx.can('exportData') && (
          <Btn kind="g" sm icon={<Download size={14} />} onClick={exportCsv}>Export CSV</Btn>
        )}
        <Btn kind="p" sm icon={<Plus size={15} />} onClick={newContact}>New contact</Btn>
      </div>

      <Pools ctx={ctx} onOpen={setOpenId} />

      <SecTitle right={`${rows.length} of ${(contacts || []).length}`}>Contacts</SecTitle>

      {rows.length === 0 ? (
        <Card>
          <Empty>
            {(contacts || []).length === 0
              ? 'No contacts yet. Add the person you spoke to this morning — the pipeline builds itself from here.'
              : 'Nothing matches those filters. Clear the search or widen the side and stage.'}
          </Empty>
        </Card>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                {th('name', 'Name')}
                {th('stage', 'Stage')}
                {th('price', 'Price')}
                {th('timeline', 'Timeline')}
                {th('preapproval', 'Pre-approval')}
                {th('source', 'Source')}
                {showOwner && th('owner', 'Owner')}
                {th('lastTouch', 'Last touch')}
                {th('nextAction', 'Next action')}
              </tr>
            </thead>
            <tbody>
              {rows.map(c => {
                const st = stageOf(c.stage, settings);
                const since = daysSince(c.lastTouch, tz);
                const dn = daysUntil(c.nextActionDue, tz);
                return (
                  <tr key={c.id} onClick={() => setOpenId(c.id)}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="namecell">{c.name}</span><SideChip side={c.side} />
                      </div>
                      <div className="subcell">{c.email || phoneFmt(c.phone) || '—'}</div>
                    </td>
                    <td><Pill color={st.color}>{stageLabel(c.stage, c.side, settings)}</Pill></td>
                    <td>{priceText(c)}</td>
                    <td>{c.timeline || '—'}</td>
                    <td>{c.side === 'seller' ? <span className="kwtd">n/a</span> : (c.preapproval || '—')}</td>
                    <td><Tag>{c.source || 'Unknown'}</Tag></td>
                    {showOwner && (
                      <td>{c.owner_id ? ownerName(ctx, c.owner_id) : <span className="pool-chip">Unclaimed</span>}</td>
                    )}
                    <td>
                      <span className={'tag' + (since != null && since > COLD_TOUCH_DAYS ? ' cold' : '')}>
                        {agoText(since)}
                      </span>
                    </td>
                    <td>
                      <div>{c.nextAction || '—'}</div>
                      {c.nextActionDue && (
                        <div className={'subcell due ' + dueClass(dn)}>
                          {dn < 0 ? `${Math.abs(dn)}d overdue` : dn === 0 ? 'due today' : `due ${fmtShort(c.nextActionDue)}`}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {open && <ContactModal key={open.id} contact={open} ctx={ctx} onClose={() => setOpenId(null)} />}
      {draftNew && (
        <ContactModal key={draftNew.id} contact={draftNew} ctx={ctx} isNew
          onClose={() => setDraftNew(null)} />
      )}
    </>
  );
}

/* ======================================================== lead pools (§6)
   A lead nobody claims is a lead going cold, so time-in-pool is the loudest
   thing on the row. Past a week it goes red. */

function Pools({ ctx, onOpen }) {
  const pools = visiblePools(ctx);
  if (!pools.length) return null;
  const cold = COLD_POOL_DAYS;

  return (
    <div style={{ marginBottom: 18 }}>
      <SecTitle right={ctx.isLeader ? 'Every pool on this install' : 'The pools you were added to'}>
        Lead pools
      </SecTitle>
      <div className="grid2">
        {pools.map(p => {
          const list = (ctx.contacts || [])
            .filter(c => c.owner_id === null && c.pool === p.key)
            .map(c => ({ c, d: daysSince(c.pooled_at || c.created_at, ctx.tz) }))
            .sort((a, b) => (b.d || 0) - (a.d || 0));
          const stale = list.filter(x => x.d != null && x.d > cold).length;
          return (
            <Card key={p.key} title={p.name || p.key}
              sub={list.length
                ? `${list.length} waiting${stale ? ` · ${stale} past ${cold} days` : ''}`
                : 'Nothing waiting — every lead here has an owner.'}
              right={<span className={'pool-chip' + (stale ? ' cold' : '')}>{list.length}</span>}>
              {list.length === 0 ? (
                <Empty>Claimed out. New leads routed to this pool land here.</Empty>
              ) : (
                <div className="hlist">
                  {list.map(({ c, d }) => (
                    <div key={c.id} className={'hli' + (d != null && d > cold ? ' bad' : '')}>
                      <button className="linkbtn" onClick={() => onOpen(c.id)}
                        style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                        <b>{c.name}</b>
                      </button>
                      <SideChip side={c.side} />
                      <Tag>{c.source || 'Unknown'}</Tag>
                      <span style={{ fontSize: 12, color: '#8E89A8' }}>{priceText(c)}</span>
                      <span className={'pool-chip' + (d != null && d > cold ? ' cold' : '')}
                        title={c.pooled_at ? `In the pool since ${fmtLong(c.pooled_at)}` : 'No pooled date recorded'}>
                        {d == null ? 'new' : `${d}d in pool`}
                      </span>
                      <Btn kind="p" sm icon={<UserPlus size={13} />} onClick={() => ctx.claimContact(c)}>Claim</Btn>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================ the modal */

export function ContactModal({ contact, ctx, onClose, isNew }) {
  const { settings, tz } = ctx;
  const stages = stagesOf(settings);
  const [d, setD] = useState(contact);
  const [tab, setTab] = useState('call');
  const [note, setNote] = useState('');
  const [areaDraft, setAreaDraft] = useState('');
  const [apptType, setApptType] = useState(((settings.apptTypes || [])[0] || {}).key || 'listing');
  const [apptAt, setApptAt] = useState(ctx.todayIso);
  const [confirmDel, setConfirmDel] = useState(false);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);

  const set = (k, v) => { setD(x => ({ ...x, [k]: v })); setSaved(false); };
  /* actions (activity, appointments, checklist) persist as they happen — they
     are events, not edits. Text fields wait for Save. A brand-new contact keeps
     everything local until it is saved once. */
  const commit = next => {
    setD(next);
    if (!isNew) ctx.upsertContact(next);
  };

  const st = stageOf(d.stage, settings);
  const items = checklistFor(d.side, settings);
  const cl = d.checklist || {};
  const done = items.filter(i => cl[i.key] && cl[i.key].done).length;
  const txns = (ctx.transactions || []).filter(t => t.contact_id === d.id);
  const appts = (d.appointments || []).slice().sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  const feed = (d.activity || []).slice().sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  const apptTypeLabel = k => {
    const t = (settings.apptTypes || []).find(x => x.key === k);
    return t ? t.label : k;
  };

  const save = () => {
    if (!String(d.name || '').trim()) { setErr('A contact needs a name before it can be saved.'); return; }
    setErr('');
    ctx.upsertContact({ ...d, name: String(d.name).trim() });
    setSaved(true);
    ctx.flash(isNew ? `${String(d.name).trim()} added.` : 'Saved.');
    if (isNew) onClose();
  };

  const logActivity = kind => {
    const text = note.trim();
    if (!text) { setErr('Write a line about what happened first.'); return; }
    setErr('');
    commit({
      ...d,
      lastTouch: ctx.todayIso,
      activity: [{ id: uid(), at: new Date().toISOString(), kind, note: text, by: ctx.me.id }, ...(d.activity || [])],
    });
    setNote('');
  };

  const setItem = (key, patch) => {
    const cur = cl[key] || { done: null, due: null };
    commit({ ...d, checklist: { ...cl, [key]: { ...cur, ...patch } } });
  };

  const addAppt = () => {
    if (!apptAt) { setErr('Pick a date for the appointment.'); return; }
    setErr('');
    commit({
      ...d,
      appointments: [...(d.appointments || []), { id: uid(), type: apptType, at: apptAt, status: 'booked' }],
      activity: [{
        id: uid(), at: new Date().toISOString(), kind: 'appointment',
        note: `${apptTypeLabel(apptType)} booked for ${fmtLong(apptAt)}.`, by: ctx.me.id,
      }, ...(d.activity || [])],
    });
  };

  const setApptStatus = (id, status) => {
    commit({ ...d, appointments: (d.appointments || []).map(a => (a.id === id ? { ...a, status } : a)) });
  };

  const removeAppt = id => commit({ ...d, appointments: (d.appointments || []).filter(a => a.id !== id) });

  const addArea = () => {
    const v = areaDraft.trim();
    if (!v) return;
    if (!(d.areas || []).includes(v)) set('areas', [...(d.areas || []), v]);
    setAreaDraft('');
  };

  const del = () => { ctx.deleteContact(d.id); onClose(); };

  const since = daysSince(d.lastTouch, tz);
  const dueN = daysUntil(d.nextActionDue, tz);
  const showBuyerMoney = d.side !== 'seller';
  const showSellerMoney = d.side !== 'buyer';

  return (
    <ModalShell
      onClose={onClose}
      title={String(d.name || '').trim() || 'New contact'}
      sub={[
        ownerName(ctx, d.owner_id),
        d.source || 'No source',
        d.created_at ? `added ${fmtShort(d.created_at)}` : null,
        `last touch ${agoText(since)}`,
      ].filter(Boolean).join(' · ')}
      badges={(
        <>
          <SideChip side={d.side} />
          <Pill color={st.color}>{stageLabel(d.stage, d.side, settings)}</Pill>
          <select className="selctl" style={{ padding: '5px 9px', fontSize: 12 }}
            value={d.stage} onChange={e => commit({ ...d, stage: e.target.value })}>
            {stages.map(s => <option key={s.key} value={s.key}>{stageLabel(s.key, d.side, settings)}</option>)}
          </select>
          <button className="qbtn" onClick={() => {
            setTab('call');
            const el = document.getElementById('c-activity-note');
            if (el) { el.focus(); el.scrollIntoView({ block: 'center' }); }
          }}><Phone size={13} /> Log an activity</button>
          <button className="qbtn" onClick={() => {
            const el = document.getElementById('c-appt-date');
            if (el) { el.focus(); el.scrollIntoView({ block: 'center' }); }
          }}><CalendarPlus size={13} /> Book an appointment</button>
          {d.owner_id === null && (
            <button className="qbtn" onClick={() => { ctx.claimContact(d); onClose(); }}>
              <UserPlus size={13} /> Claim this lead
            </button>
          )}
        </>
      )}
      foot={(
        <>
          <Btn kind="p" onClick={save}>{isNew ? 'Add contact' : 'Save'}</Btn>
          <Btn kind="g" onClick={onClose}>Close</Btn>
          {!isNew && (confirmDel
            ? <Btn kind="d" icon={<Trash2 size={14} />} onClick={del}>Really delete — this cannot be undone</Btn>
            : <Btn kind="d" icon={<Trash2 size={14} />} onClick={() => setConfirmDel(true)}>Delete</Btn>)}
          <span className="m-foot-n">
            {saved ? 'Saved.' : isNew
              ? 'Nothing is written until you add the contact.'
              : 'Fields need Save. Activity, appointments and checklist ticks save as you go.'}
          </span>
        </>
      )}
    >
      <div className="m-grid">
        {/* ------------------------------------------------------------ left */}
        <div className="m-left">
          <div className="dh">Who they are</div>
          <div className="fgrid">
            <Field label="Name" full>
              <Inp value={d.name || ''} onChange={e => set('name', e.target.value)} placeholder="First and last" />
            </Field>
            <Field label="Email">
              <Inp type="email" value={d.email || ''} onChange={e => set('email', e.target.value)} placeholder="them@example.com" />
            </Field>
            <Field label="Phone" hint={d.phone ? phoneFmt(d.phone) : null}>
              <Inp value={d.phone || ''} onChange={e => set('phone', e.target.value)} placeholder="(316) 555-0100" />
            </Field>
            <Field label="Side" hint="Drives every stage label on this record">
              <Sel options={SIDES} value={d.side || 'buyer'} onChange={e => set('side', e.target.value)} />
            </Field>
            <Field label="Stage">
              <Sel value={d.stage} onChange={e => set('stage', e.target.value)}
                options={stages.map(s => ({ value: s.key, label: stageLabel(s.key, d.side, settings) }))} />
            </Field>
            <Field label="Source">
              <Sel options={settings.sources || []} value={d.source || ''} onChange={e => set('source', e.target.value)}>
                <option value="">Unknown</option>
              </Sel>
            </Field>
            {ctx.isLeader && (
              <Field label="Owner" hint={d.owner_id === null ? 'Unclaimed leads sit in a pool' : null}>
                <select value={d.owner_id || ''} onChange={e => set('owner_id', e.target.value || null)}>
                  <option value="">Unclaimed</option>
                  {(ctx.users || []).filter(u => u.active !== false).map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </Field>
            )}
          </div>

          <div className="dh mt">Money and timing</div>
          <div className="fgrid">
            {showBuyerMoney && (
              <>
                <Field label="Price range — min">
                  <Inp type="number" value={d.priceMin == null ? '' : d.priceMin}
                    onChange={e => set('priceMin', e.target.value === '' ? '' : Number(e.target.value))} placeholder="180000" />
                </Field>
                <Field label="Price range — max">
                  <Inp type="number" value={d.priceMax == null ? '' : d.priceMax}
                    onChange={e => set('priceMax', e.target.value === '' ? '' : Number(e.target.value))} placeholder="215000" />
                </Field>
              </>
            )}
            {showSellerMoney && (
              <Field label="Target list price" hint="What they want for the house">
                <Inp type="number" value={d.targetPrice == null ? '' : d.targetPrice}
                  onChange={e => set('targetPrice', e.target.value === '' ? '' : Number(e.target.value))} placeholder="329000" />
              </Field>
            )}
            <Field label="Timeline">
              <Sel options={settings.timelines || []} value={d.timeline || ''} onChange={e => set('timeline', e.target.value)}>
                <option value="">Not asked yet</option>
              </Sel>
            </Field>
            <Field label="Pre-approval"
              hint={d.side === 'seller' ? 'Only matters when they buy on the other side' : null}>
              <Sel options={settings.preapprovalStatuses || []} value={d.preapproval || ''} onChange={e => set('preapproval', e.target.value)}>
                <option value="">—</option>
              </Sel>
            </Field>
            <Field label="Lender">
              <Inp value={d.lender || ''} onChange={e => set('lender', e.target.value)} placeholder="Who is doing the loan" />
            </Field>
          </div>

          <div className="dh mt">Property</div>
          <div className="fgrid">
            <Field label="Property type">
              <Sel options={settings.propertyTypes || []} value={d.propertyType || ''} onChange={e => set('propertyType', e.target.value)}>
                <option value="">—</option>
              </Sel>
            </Field>
            <Field label="Beds">
              <Inp type="number" value={d.beds == null ? '' : d.beds}
                onChange={e => set('beds', e.target.value === '' ? '' : Number(e.target.value))} />
            </Field>
            <Field label="Baths">
              <Inp type="number" step="0.5" value={d.baths == null ? '' : d.baths}
                onChange={e => set('baths', e.target.value === '' ? '' : Number(e.target.value))} />
            </Field>
            <Field label={d.side === 'seller' ? 'Property address' : 'Current address'} full>
              <Inp value={d.address || ''} onChange={e => set('address', e.target.value)}
                placeholder="4412 N Bluff Ridge Ct, Wichita, KS 67206" />
            </Field>
            <Field label="Areas of interest" full hint="Type an area and press Enter">
              <div className="chips">
                {(d.areas || []).map(a => (
                  <button key={a} className="chip on" onClick={() => set('areas', (d.areas || []).filter(x => x !== a))}>
                    <MapPin size={11} /> {a} <X size={11} />
                  </button>
                ))}
                <input value={areaDraft} onChange={e => setAreaDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addArea(); } }}
                  placeholder="College Hill" style={{ width: 150 }} />
                <button className="chip add" onClick={addArea}><Plus size={11} /> Add</button>
              </div>
            </Field>
          </div>

          <div className="dh mt">Next step</div>
          <div className="fgrid">
            <Field label="Next action">
              <Inp value={d.nextAction || ''} onChange={e => set('nextAction', e.target.value)} placeholder="Call about Saturday showings" />
            </Field>
            <Field label="Due"
              hint={d.nextActionDue
                ? (dueN < 0 ? `${Math.abs(dueN)} days overdue` : dueN === 0 ? 'Due today' : `${dueN} days out — ${fmtLong(d.nextActionDue)}`)
                : null}>
              <Inp type="date" value={d.nextActionDue || ''} onChange={e => set('nextActionDue', e.target.value || null)} />
            </Field>
            <Field label="Notes" full>
              <Txt rows={4} value={d.notes || ''} onChange={e => set('notes', e.target.value)}
                placeholder="Anything the next conversation should start from." />
            </Field>
          </div>

          <div className="dh mt">Transactions</div>
          {txns.length === 0 ? (
            <Empty>No transactions yet. One gets started when they go under contract.</Empty>
          ) : (
            <>
              <div className="hlist">
                {txns.slice()
                  .sort((a, b) => String(b.effectiveDate || '').localeCompare(String(a.effectiveDate || '')))
                  .map(t => {
                    const ph = phasesOf(settings).find(p => p.key === t.phase);
                    return (
                      <div key={t.id} className={'hli' + (t.status === 'closed' ? ' win' : t.status === 'fell' ? ' bad' : '')}>
                        <Building2 size={13} />
                        <span style={{ flex: 1, minWidth: 0 }}>{t.address || 'No address yet'}</span>
                        <SideChip side={t.side} />
                        {ph && <Pill color={ph.color}>{ph.label}</Pill>}
                        <span style={{ fontSize: 12, color: '#8E89A8', whiteSpace: 'nowrap' }}>
                          {t.closedActual ? `closed ${fmtShort(t.closedActual)}`
                            : t.closeDate ? `closes ${fmtShort(t.closeDate)}` : 'no close date'}
                        </span>
                        <button className="qbtn" onClick={() => { onClose(); ctx.go('transactions', { open: t.id }); }}>
                          <ExternalLink size={12} /> Open
                        </button>
                      </div>
                    );
                  })}
              </div>
              <div className="fn-hint">
                <Clock size={12} /> {txns.length === 1
                  ? 'One deal so far. A contact can have several over their life — every one of them stays on this record.'
                  : `${txns.length} deals with this contact. All of them stay here.`}
              </div>
            </>
          )}
          <ErrorNote>{err}</ErrorNote>
        </div>

        {/* ----------------------------------------------------------- right */}
        <div className="m-right">
          <div className="dh"><StickyNote size={13} /> Activity</div>
          <div className="act-types">
            {ACT_KINDS.map(k => (
              <button key={k.key} className={'act-t' + (tab === k.key ? ' on' : '')} onClick={() => setTab(k.key)}>
                <k.Icon size={12} /> {k.label}
              </button>
            ))}
          </div>
          <textarea id="c-activity-note" className="act-input" value={note} onChange={e => setNote(e.target.value)}
            placeholder={tab === 'call' ? 'What did they say on the call?'
              : tab === 'note' ? 'What should the next conversation know?'
              : `What was in the ${tab}?`} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <Btn kind="p" sm onClick={() => logActivity(tab)}>Log {tab}</Btn>
            <span className="fu-next-note">Logging sets last touch to today.</span>
          </div>
          <div className="feed">
            {feed.length === 0 ? (
              <Empty>No history yet. The first call you log starts it.</Empty>
            ) : feed.map(a => {
              const Icon = KIND_ICON[a.kind] || StickyNote;
              const by = a.by === ctx.me.id ? 'you' : ownerName(ctx, a.by);
              return (
                <div key={a.id} className={'fitem' + (a.kind === 'note' ? ' note' : '')}>
                  <div className="fic"><Icon size={14} /></div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="ftxt">{a.note}</div>
                    <div className="fmeta">{a.kind} · {fmtShort(a.at)} · {by}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="dh mt">
            <ListChecks size={13} /> {d.side === 'buyer' ? 'Buyer checklist' : 'Listing checklist'}
            <span className="onb-gc" style={{ marginLeft: 'auto' }}>{done}/{items.length}</span>
          </div>
          {items.length === 0 ? (
            <Empty>No checklist items configured. A team leader sets these in Settings.</Empty>
          ) : (
            <div className="onb-group">
              {items.map(it => {
                const s = cl[it.key] || { done: null, due: null };
                const over = !s.done && s.due && daysUntil(s.due, tz) < 0;
                const toggle = () => setItem(it.key, { done: s.done ? null : ctx.todayIso });
                return (
                  <div key={it.key} className={'onb-item' + (s.done ? ' done' : '') + (over ? ' over' : '')}>
                    <span className="onb-check" onClick={toggle}>
                      {s.done
                        ? <CheckCircle2 size={17} style={{ color: BRAND.colors.green }} />
                        : <Circle size={17} style={{ color: '#C9C6DC' }} />}
                    </span>
                    <span className="onb-label" onClick={toggle}>{it.label}</span>
                    {s.done ? (
                      <span className="onb-date">{fmtShort(s.done)}</span>
                    ) : (
                      <span className="onb-due">
                        <input type="date" className={over ? 'over' : ''} value={s.due || ''}
                          onChange={e => setItem(it.key, { due: e.target.value || null })} />
                        {!s.due && it.dueOffset != null && (
                          <button className="chip add" style={{ padding: '3px 8px', fontSize: 11 }}
                            title={`Set the due date ${it.dueOffset} days out from today`}
                            onClick={() => setItem(it.key, { due: addDays(ctx.todayIso, it.dueOffset) })}>
                            +{it.dueOffset}d
                          </button>
                        )}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="dh mt"><CalendarPlus size={13} /> Appointments</div>
          <div className="mtg-list">
            {appts.length === 0 ? (
              <div className="mtg-empty">Nothing booked. An appointment held is the number the team actually tracks.</div>
            ) : appts.map(a => (
              <div key={a.id} className={'mtg-row ' + (a.status === 'held' ? 'held' : a.status === 'noshow' ? 'noshow' : '')}>
                <span className="mtg-when"><CalendarPlus size={12} /> {fmtShort(a.at)}</span>
                <div className="mtg-mid">
                  <div className="mtg-title">{apptTypeLabel(a.type)}</div>
                  <div className="mtg-badges">
                    {APPT_STATUS.map(s => (
                      <button key={s.key} className={'act-t' + (a.status === s.key ? ' on' : '')}
                        style={{ padding: '3px 8px', fontSize: 11 }}
                        onClick={() => setApptStatus(a.id, s.key)}>{s.label}</button>
                    ))}
                  </div>
                </div>
                <button className="ex-del" title="Remove" onClick={() => removeAppt(a.id)}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
          <div className="mtg-fix sm" style={{ marginBottom: 6 }}>
            <select value={apptType} onChange={e => setApptType(e.target.value)}>
              {(settings.apptTypes || []).map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            <input id="c-appt-date" type="date" value={apptAt} onChange={e => setApptAt(e.target.value)} />
            <Btn kind="g" sm icon={<Plus size={13} />} onClick={addAppt}>Book</Btn>
          </div>
          <div className="fn-hint"><Check size={12} /> Marking one held is what feeds the appointment-to-close ratio.</div>
        </div>
      </div>
    </ModalShell>
  );
}
