/* ============================================================================
   views/Settings.jsx — the install's control panel (brief §12).

   "Everything a brokerage would change" lives here, and nowhere else. Every
   editor on this page reads from ctx.settings and writes the WHOLE merged
   settings object back through ctx.saveSettings — never a partial patch, because
   the settings row is one JSON document and a partial save would drop keys.

   Two rules that shape the whole file:

   1. Each card keeps its own local draft. Typing does not persist. A card writes
      once, when the leader presses Save, so a half-typed "1" in an offset field
      never becomes a real deadline on a real contract.
   2. No date arithmetic and no money arithmetic happens in this file. The
      critical-date card previews itself through computeDeadline() and the
      commission card through computeCommission(), so what the leader sees before
      saving is produced by the same engine the transaction will use afterwards.

   Team leader only. App already keeps the nav item away from agents; the refusal
   below is the second lock, not the first.
   ========================================================================== */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Palette, KanbanSquare, Building2, CalendarClock, Gauge, CalendarDays,
  ListChecks, CalendarCheck, Tags, Percent, Users, ShieldCheck, Waypoints,
  LayoutDashboard, Layers, BookText, FileText, BellRing, Target, Database,
  Plus, Trash2, ChevronDown, AlertTriangle, Save, RotateCcw, Download, Upload,
  Lock, UserPlus, X, Check, Copy, Mail, KeyRound, Eye,
} from 'lucide-react';

import { Card, Btn, Field, Inp, Sel, Txt, Toggle, Seg, Tag, Reorder, Empty, ErrorNote, LegalNote } from '../components/ui';
import {
  defaultSettings, mergeSettings, defaultPermissions,
  PERMISSION_KEYS, DASH_SECTIONS, SECTIONS, DEFAULT_AGENT_SECTIONS,
  DEFAULT_COORDINATOR_SECTIONS, ROLES,
  stagesOf, phasesOf, offsetsOf, holidaysOf,
} from '../lib/settings';
import { today, addDays, fmtShort, fmtLong, isDate, computeDeadline, usFederalHolidays, seedHolidays } from '../lib/dates';
import { agentPlan, computeCommission } from '../lib/commission';
/* no uid() here any more: a seat's id is the auth uid gotrue hands back when the
   login is created, never one this screen invents. A row keyed on anything else
   is a seat nobody can sign in to. */
import { usd, usdc, titleCase } from '../lib/format';
import { BRAND } from '../lib/brand';

/* the constants in settings.js are the ONLY fallback allowed in this file —
   nothing below hardcodes a stage, a source or a category of its own. */
const FALLBACK = defaultSettings();

/* ------------------------------------------------------------------ helpers */

const arr = v => (Array.isArray(v) ? v : []);
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : (d || 0); };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, num(v)));
const slugKey = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 28);
/** stable, never-reused key for a new list item */
const mkKey = (label, taken) => {
  const base = slugKey(label) || 'item';
  let k = base, i = 2;
  while (taken.indexOf(k) >= 0) k = `${base}_${i++}`;
  return k;
};
/** display-only sign handling so a negative waterfall line reads "−$45.00" */
const money = v => (num(v) < 0 ? '−' + usdc(-num(v)) : usdc(v));
/** holidays are tolerated as strings by dates.js; the editor works in {date,name} */
const normHolidays = list => arr(list)
  .map(h => {
    const iso = String((h && (h.date || h.iso)) || h || '');
    return isDate(iso) ? { date: iso.slice(0, 10), name: (h && h.name) || 'Holiday' } : null;
  })
  .filter(Boolean)
  .sort((a, b) => a.date.localeCompare(b.date));
const tzValid = z => { try { new Intl.DateTimeFormat('en-CA', { timeZone: String(z || '') }); return !!z; } catch { return false; } };

/**
 * A card-local draft. Nothing here touches the database until save() is called
 * by the card's own Save button.
 * `syncKey` is for drafts derived from ctx data that can arrive late (the user
 * list): when it changes and the leader has not started editing, re-seed.
 */
function useDraft(initial, syncKey) {
  const [d, setD] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const keyRef = useRef(syncKey);
  useEffect(() => {
    if (keyRef.current === syncKey) return;
    keyRef.current = syncKey;
    if (!dirty) setD(initial);
  });
  const set = next => { setDirty(true); setD(next); };
  const patch = p => { setDirty(true); setD(cur => ({ ...cur, ...p })); };
  const reset = () => { setD(initial); setDirty(false); };
  const clean = () => setDirty(false);
  return [d, set, { dirty, reset, clean, patch }];
}

/* --------------------------------------------------------------- primitives */

function Sec({ icon, title, sub, open, onToggle, children }) {
  return (
    <div className="card" style={{ marginBottom: 14, paddingTop: 4, paddingBottom: 4 }}>
      <div className={'msec' + (open ? ' open' : '')} style={{ borderBottom: 'none' }}>
        <div className="msec-h" onClick={onToggle}>
          <div className="msec-t">{icon}{title}</div>
          {sub && <div className="msec-s">{sub}</div>}
          <ChevronDown size={16} className="msec-ch" />
        </div>
        {open && <div className="msec-b">{children}</div>}
      </div>
    </div>
  );
}

function SaveBar({ dirty, onSave, onReset, blocked, children }) {
  return (
    <div className="tm-acts">
      <Btn kind="p" sm icon={<Save size={13} />} onClick={onSave} disabled={!dirty || !!blocked}>Save</Btn>
      <Btn kind="g" sm icon={<RotateCcw size={13} />} onClick={onReset} disabled={!dirty}>Reset</Btn>
      {dirty && !blocked && <span style={{ alignSelf: 'center', fontSize: 12, fontWeight: 600, color: '#A06A10' }}>Unsaved — nothing is stored until you press Save.</span>}
      {children}
    </div>
  );
}

const Note = ({ bad, children }) => <div className={'note' + (bad ? ' bad' : '')} style={{ marginBottom: 12 }}>{children}</div>;
const Sub = ({ children }) => <div className="tm-sub">{children}</div>;

const Swatch = ({ value, onChange, title }) => (
  <input type="color" className="swatch" title={title} value={/^#[0-9a-fA-F]{6}$/.test(value || '') ? value : '#000000'}
    onChange={e => onChange(e.target.value)} />
);

/** chip editor for a plain list of strings */
function ChipEdit({ items, onChange, placeholder }) {
  const [v, setV] = useState('');
  const list = arr(items);
  const add = () => {
    const s = v.trim();
    if (!s || list.some(x => String(x).toLowerCase() === s.toLowerCase())) { setV(''); return; }
    onChange([...list, s]); setV('');
  };
  return (
    <div>
      <div style={{ marginBottom: 6 }}>
        {list.length === 0 && <span style={{ fontSize: 12.5, color: '#928DAD' }}>Empty — the app falls back to the seed list in settings.js.</span>}
        {list.map((s, i) => (
          <span key={s + i} className="opt-chip">
            {s}
            <button title="Remove" onClick={() => onChange(list.filter((_, j) => j !== i))}><X size={13} /></button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={v} placeholder={placeholder || 'Add an option'} style={{ flex: 1, maxWidth: 280, padding: '8px 11px', border: '1px solid #DEDFEA', borderRadius: 9, fontSize: 13.5 }}
          onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <Btn kind="g" sm icon={<Plus size={13} />} onClick={add}>Add</Btn>
      </div>
    </div>
  );
}

/** small labelled number input that keeps its own text so "-" and "" are typable */
function NumInp({ value, onChange, min, max, step, width, suffix }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <input type="number" value={value} min={min} max={max} step={step || 1}
        onChange={e => onChange(e.target.value)}
        style={{ width: width || 74, padding: '7px 9px', border: '1px solid #DEDFEA', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }} />
      {suffix && <span style={{ fontSize: 12, color: '#8E89A8' }}>{suffix}</span>}
    </span>
  );
}

/* ========================================================================== */
/*                                  the view                                  */
/* ========================================================================== */

export default function Settings({ ctx }) {
  const [open, setOpen] = useState({ brand: true });
  const sec = k => ({ open: !!open[k], onToggle: () => setOpen(o => ({ ...o, [k]: !o[k] })) });

  if (!ctx.isLeader) {
    return (
      <Card title="Settings">
        <Empty>
          Only the team leader changes the install's settings. Your own view — which sections you
          see, your split and cap — is set for you; ask your team leader if something here needs to move.
        </Empty>
      </Card>
    );
  }

  const seats = ctx.seats || { used: 0, limit: 0 };
  const contactUrl = (ctx.account && ctx.account.contact_url) || '';

  return (
    <div>
      <Card>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <h3 style={{ margin: 0, fontSize: 15.5 }}>{(ctx.settings.brand && ctx.settings.brand.name) || (ctx.account && ctx.account.name) || 'This install'}</h3>
            <div className="ch-sub" style={{ marginBottom: 0 }}>
              Config over fork. Every list, label, offset and split below is data, not code — change it
              here and the whole app follows. Each card saves on its own.
            </div>
          </div>
          <div className="seat-note">
            <Users size={14} />
            <b>{seats.used} of {seats.limit} seats used</b>
            <span>— contact ProyTech to add more</span>
            {contactUrl && <a className="btn btn-g btn-sm" href={contactUrl} target="_blank" rel="noreferrer">Request a seat</a>}
          </div>
        </div>
      </Card>

      <div style={{ height: 14 }} />

      <BrandCard      ctx={ctx} {...sec('brand')} />
      <StagesCard     ctx={ctx} {...sec('stages')} />
      <PhasesCard     ctx={ctx} {...sec('phases')} />
      <OffsetsCard    ctx={ctx} {...sec('offsets')} />
      <RulesCard      ctx={ctx} {...sec('rules')} />
      <HolidaysCard   ctx={ctx} {...sec('holidays')} />
      <ChecklistsCard ctx={ctx} {...sec('checklists')} />
      <ApptTypesCard  ctx={ctx} {...sec('appts')} />
      <ListsCard      ctx={ctx} {...sec('lists')} />
      <CommissionCard ctx={ctx} {...sec('commission')} />
      <TeamCard       ctx={ctx} {...sec('team')} />
      <PermissionsCard ctx={ctx} {...sec('perms')} />
      <PoolsCard      ctx={ctx} {...sec('pools')} />
      <DashCard       ctx={ctx} {...sec('dash')} />
      <ModulesCard    ctx={ctx} {...sec('modules')} />
      <BooksCard      ctx={ctx} {...sec('books')} />
      <ContractsCard  ctx={ctx} {...sec('contracts')} />
      <RemindersCard  ctx={ctx} {...sec('reminders')} />
      <GoalsCard      ctx={ctx} {...sec('goals')} />
      <BackupCard     ctx={ctx} {...sec('backup')} />
    </div>
  );
}

/* ============================================================== 1. brand === */

function BrandCard({ ctx, open, onToggle }) {
  const src = ctx.settings.brand || FALLBACK.brand;
  const [d, set, ctl] = useDraft(src);
  const save = () => { ctx.saveSettings({ ...ctx.settings, brand: d }); ctl.clean(); };

  return (
    <Sec icon={<Palette size={13} />} title="Brand" open={open} onToggle={onToggle}
      sub={d.name || 'using the deployment default'}>
      <Note>
        The deployment's environment variables (<b>VITE_BRAND_NAME</b>, <b>VITE_LOGO_URL</b>,{' '}
        <b>VITE_COLOR_COBALT</b>, <b>VITE_COLOR_INK</b>) set the defaults for this Vercel project.
        Anything you type here <b>overrides them for this install</b>. Clear a field to fall back to
        the deployment default.
      </Note>
      <div className="fgrid">
        <Field label="Brokerage / team name" hint="Appears on sign-in and on client-facing output">
          <Inp value={d.name || ''} placeholder="e.g. Summit & Vine Realty" onChange={e => ctl.patch({ name: e.target.value })} />
        </Field>
        <Field label="Logo URL" hint="Left empty, the app draws the mark and short name instead">
          <Inp value={d.logo || ''} placeholder="https://…/logo.svg" onChange={e => ctl.patch({ logo: e.target.value })} />
        </Field>
        <Field label="Primary (cobalt)">
          <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
            <Swatch value={d.cobalt || FALLBACK.brand.cobalt || BRAND.colors.cobalt} onChange={v => ctl.patch({ cobalt: v })} title="Primary" />
            <Inp value={d.cobalt || ''} placeholder="${BRAND.colors.cobalt}" onChange={e => ctl.patch({ cobalt: e.target.value })} />
          </div>
        </Field>
        <Field label="Text (ink)">
          <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
            <Swatch value={d.ink || BRAND.colors.ink} onChange={v => ctl.patch({ ink: v })} title="Ink" />
            <Inp value={d.ink || ''} placeholder="${BRAND.colors.ink}" onChange={e => ctl.patch({ ink: e.target.value })} />
          </div>
        </Field>
      </div>
      {d.logo ? (
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11.5, color: '#8E89A8' }}>Preview</span>
          <img src={d.logo} alt="" style={{ maxHeight: 34, maxWidth: 180 }} />
        </div>
      ) : null}
      <SaveBar dirty={ctl.dirty} onSave={save} onReset={ctl.reset} />
    </Sec>
  );
}

/* ===================================================== 2. stages and labels = */

function StagesCard({ ctx, open, onToggle }) {
  const src = stagesOf(ctx.settings);
  const [d, set, ctl] = useDraft(src);
  const [label, setLabel] = useState('');
  const [remap, setRemap] = useState(null);   /* {key, to} */

  const countIn = k => (ctx.contacts || []).filter(c => c.stage === k).length;
  const won = d.filter(s => s.won).length;
  const lost = d.filter(s => s.lost).length;
  const blocked = won !== 1 ? 'Exactly one stage has to be the won stage — that is the stage that opens a transaction.'
    : lost !== 1 ? 'Exactly one stage has to be the lost stage — the funnel needs somewhere to put a dead lead.'
    : d.some(s => !String(s.sellerLabel || '').trim() && !String(s.buyerLabel || '').trim()) ? 'Every stage needs a label on at least one side.'
    : '';

  const patch = (i, p) => set(d.map((s, j) => (j === i ? { ...s, ...p } : s)));
  /* radio-like: one won stage and one lost stage, and never the same stage */
  const only = (i, flag) => {
    const other = flag === 'won' ? 'lost' : 'won';
    set(d.map((s, j) => (j === i ? { ...s, [flag]: true, [other]: false } : { ...s, [flag]: false })));
  };
  const add = () => {
    const t = label.trim();
    if (!t) return;
    set([...d, { key: mkKey(t, d.map(s => s.key)), sellerLabel: t, buyerLabel: t, color: '#6B73C9', prob: 0.1, open: true, won: false, lost: false }]);
    setLabel('');
  };
  const del = i => {
    const s = d[i];
    if (countIn(s.key) > 0) { setRemap({ key: s.key, to: (d.find(x => x.key !== s.key) || {}).key || '' }); return; }
    set(d.filter((_, j) => j !== i));
  };
  const doRemap = () => {
    const from = remap.key, to = remap.to;
    if (!to) return;
    const moving = (ctx.contacts || []).filter(c => c.stage === from);
    moving.forEach(c => ctx.upsertContact({ ...c, stage: to }));
    set(d.filter(s => s.key !== from));
    setRemap(null);
    ctx.flash(`${moving.length} contact${moving.length === 1 ? '' : 's'} moved. Press Save to remove the stage.`);
  };
  const save = () => { ctx.saveSettings({ ...ctx.settings, stages: d }); ctl.clean(); };

  return (
    <Sec icon={<KanbanSquare size={13} />} title="Stages and labels (per side)" open={open} onToggle={onToggle}
      sub={`${d.length} stages · ${d.filter(s => s.open).length} open`}>
      <Note>
        One pipeline, two sets of labels. A card shows the label for its own side, so a seller sees
        "Listing Appt Set" and a buyer sees "Buyer Consult Set" in the same column. <b>Probability</b> is
        what the weighted pipeline value is multiplied by. <b>Won</b> and <b>Lost</b> are single-choice:
        picking one clears the other stages, because the funnel and every conversion number depend on
        there being exactly one of each.
      </Note>

      <Reorder items={d} onChange={set} keyOf={s => s.key} render={(s, i) => {
        const n = countIn(s.key);
        return (
          <div>
            <div className="phase-row" style={{ flexWrap: 'wrap' }}>
              <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(s.color || '') ? s.color : '#6B73C9'} title="Colour"
                onChange={e => patch(i, { color: e.target.value })} />
              <input className="phase-label" value={s.sellerLabel || ''} placeholder="Seller label"
                onChange={e => patch(i, { sellerLabel: e.target.value })} />
              <input className="phase-label" value={s.buyerLabel || ''} placeholder="Buyer label"
                onChange={e => patch(i, { buyerLabel: e.target.value })} />
              <span className="phase-key">{s.key}</span>
            </div>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', padding: '2px 10px 8px' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#56527a' }}>
                Probability
                <NumInp value={Math.round(num(s.prob) * 100)} min={0} max={100} width={64} suffix="%"
                  onChange={v => patch(i, { prob: clamp(v, 0, 100) / 100 })} />
              </span>
              <label className="chip-toggle">
                <input type="checkbox" checked={!!s.open} onChange={e => patch(i, { open: e.target.checked })} /> Open
              </label>
              <label className="chip-toggle">
                <input type="radio" name="wonstage" checked={!!s.won} onChange={() => only(i, 'won')} /> Won
              </label>
              <label className="chip-toggle">
                <input type="radio" name="loststage" checked={!!s.lost} onChange={() => only(i, 'lost')} /> Lost
              </label>
              <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 9, alignItems: 'center' }}>
                {n > 0 && <Tag>{n} contact{n === 1 ? '' : 's'}</Tag>}
                <Btn kind="d" sm icon={<Trash2 size={12} />} onClick={() => del(i)} disabled={d.length <= 2}>Delete</Btn>
              </span>
            </div>
            {remap && remap.key === s.key && (
              <div className="note bad" style={{ margin: '0 10px 10px' }}>
                <b>{n} contact{n === 1 ? '' : 's'} {n === 1 ? 'is' : 'are'} sitting in "{s.sellerLabel || s.buyerLabel}".</b>{' '}
                Deleting the stage without moving them would leave them pointing at a stage that no longer
                exists. Move them first:
                <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select className="phase-sel" value={remap.to} onChange={e => setRemap({ ...remap, to: e.target.value })}>
                    {d.filter(x => x.key !== s.key).map(x => <option key={x.key} value={x.key}>{x.sellerLabel || x.buyerLabel}</option>)}
                  </select>
                  <Btn kind="p" sm onClick={doRemap}>Move {n} and remove the stage</Btn>
                  <Btn kind="g" sm onClick={() => setRemap(null)}>Cancel</Btn>
                </div>
              </div>
            )}
          </div>
        );
      }} />

      <div className="tm-add">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={label} placeholder="New stage label" style={{ flex: 1, minWidth: 180, padding: '9px 11px', border: '1px solid #DEDFEA', borderRadius: 9, fontSize: 13.5 }}
            onChange={e => setLabel(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
          <Btn kind="g" sm icon={<Plus size={13} />} onClick={add}>Add stage</Btn>
        </div>
        <div style={{ fontSize: 11.5, color: '#8E89A8', marginTop: 8 }}>
          Both side labels start the same — edit the buyer one after adding. The stage's key is generated
          once and never changes, so contact history keeps pointing at the right column.
        </div>
      </div>

      {blocked ? <ErrorNote>{blocked}</ErrorNote> : null}
      <SaveBar dirty={ctl.dirty} onSave={save} onReset={ctl.reset} blocked={blocked} />
    </Sec>
  );
}

/* ================================================== 3. transaction phases == */

function PhasesCard({ ctx, open, onToggle }) {
  const src = phasesOf(ctx.settings);
  const [d, set, ctl] = useDraft(src);
  const [label, setLabel] = useState('');
  const [remap, setRemap] = useState(null);

  const countIn = k => (ctx.transactions || []).filter(t => t.phase === k).length;
  const patch = (i, p) => set(d.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const add = () => {
    const t = label.trim();
    if (!t) return;
    set([...d, { key: mkKey(t, d.map(x => x.key)), label: t, color: '#6B73C9' }]);
    setLabel('');
  };
  const del = i => {
    const p = d[i];
    if (countIn(p.key) > 0) { setRemap({ key: p.key, to: (d.find(x => x.key !== p.key) || {}).key || '' }); return; }
    set(d.filter((_, j) => j !== i));
  };
  const doRemap = () => {
    const from = remap.key, to = remap.to;
    if (!to) return;
    const moving = (ctx.transactions || []).filter(t => t.phase === from);
    moving.forEach(t => ctx.upsertTransaction({ ...t, phase: to }));
    set(d.filter(x => x.key !== from));
    setRemap(null);
    ctx.flash(`${moving.length} transaction${moving.length === 1 ? '' : 's'} moved. Press Save to remove the phase.`);
  };
  const blocked = d.some(p => !String(p.label || '').trim()) ? 'Every phase needs a label.'
    : !d.some(p => p.terminal && !p.lost) ? 'One phase has to be the closed (terminal, not lost) phase.'
    : !d.some(p => p.lost) ? 'One phase has to be the fell-through phase — a dead deal is an outcome, not a delete.'
    : '';
  const save = () => { ctx.saveSettings({ ...ctx.settings, phases: d }); ctl.clean(); };

  return (
    <Sec icon={<Building2 size={13} />} title="Transaction phases" open={open} onToggle={onToggle}
      sub={`${d.length} phases`}>
      <Note>
        The closing pipeline. A contact that reaches the won stage lands in the first phase here.
        <b> Terminal</b> means the transaction stops moving (closed, or fell through);{' '}
        <b>Lost</b> marks the terminal phase that is a loss, which is what the fell-through reporting counts.
      </Note>

      <Reorder items={d} onChange={set} keyOf={p => p.key} render={(p, i) => {
        const n = countIn(p.key);
        return (
          <div>
            <div className="phase-row" style={{ flexWrap: 'wrap' }}>
              <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(p.color || '') ? p.color : '#6B73C9'} title="Colour"
                onChange={e => patch(i, { color: e.target.value })} />
              <input className="phase-label" value={p.label || ''} placeholder="Phase label"
                onChange={e => patch(i, { label: e.target.value })} />
              <span className="phase-key">{p.key}</span>
              <label className="chip-toggle">
                <input type="checkbox" checked={!!p.terminal} onChange={e => patch(i, { terminal: e.target.checked })} /> Terminal
              </label>
              <label className="chip-toggle">
                <input type="checkbox" checked={!!p.lost} onChange={e => patch(i, { lost: e.target.checked, terminal: e.target.checked ? true : p.terminal })} /> Lost
              </label>
              {n > 0 && <Tag>{n}</Tag>}
              <Btn kind="d" sm icon={<Trash2 size={12} />} onClick={() => del(i)} disabled={d.length <= 2}>Delete</Btn>
            </div>
            {remap && remap.key === p.key && (
              <div className="note bad" style={{ margin: '0 10px 10px' }}>
                <b>{n} transaction{n === 1 ? '' : 's'} {n === 1 ? 'is' : 'are'} in "{p.label}".</b> Move them to another
                phase first — their deadlines and history come with them.
                <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select className="phase-sel" value={remap.to} onChange={e => setRemap({ ...remap, to: e.target.value })}>
                    {d.filter(x => x.key !== p.key).map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
                  </select>
                  <Btn kind="p" sm onClick={doRemap}>Move {n} and remove the phase</Btn>
                  <Btn kind="g" sm onClick={() => setRemap(null)}>Cancel</Btn>
                </div>
              </div>
            )}
          </div>
        );
      }} />

      <div className="tm-add">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={label} placeholder="New phase label" style={{ flex: 1, minWidth: 180, padding: '9px 11px', border: '1px solid #DEDFEA', borderRadius: 9, fontSize: 13.5 }}
            onChange={e => setLabel(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
          <Btn kind="g" sm icon={<Plus size={13} />} onClick={add}>Add phase</Btn>
        </div>
      </div>

      {blocked ? <ErrorNote>{blocked}</ErrorNote> : null}
      <SaveBar dirty={ctl.dirty} onSave={save} onReset={ctl.reset} blocked={blocked} />
    </Sec>
  );
}

/* ================================================= 4. critical-date offsets = */

function OffsetsCard({ ctx, open, onToggle }) {
  const src = offsetsOf(ctx.settings);
  const [d, set, ctl] = useDraft(src);
  const [label, setLabel] = useState('');
  const rules = ctx.settings.dateRules || FALLBACK.dateRules;
  const [eff, setEff] = useState(ctx.todayIso || today(ctx.tz));
  const [close, setClose] = useState(addDays(ctx.todayIso || today(ctx.tz), 30));

  const patch = (i, p) => set(d.map((o, j) => (j === i ? { ...o, ...p } : o)));
  const add = () => {
    const t = label.trim();
    if (!t) return;
    set([...d, { key: mkKey(t, d.map(o => o.key)), label: t, offset: 0, count: 'calendar', inclusive: !!rules.inclusiveDefault, anchor: 'effective', reminders: null }]);
    setLabel('');
  };
  const blocked = d.some(o => !String(o.label || '').trim()) ? 'Every deadline needs a label — it is what the agent reads on the card.' : '';
  const save = () => { ctx.saveSettings({ ...ctx.settings, offsets: d }); ctl.clean(); };

  const previewOf = o => computeDeadline({
    anchorDate: o.anchor === 'close' ? close : eff,
    offset: num(o.offset),
    count: o.count,
    inclusive: !!o.inclusive,
    rollover: rules.rollover,
    holidays: rules.holidays,
    anchorLabel: o.anchor === 'close' ? 'closing date' : 'effective date',
  });

  return (
    <Sec icon={<CalendarClock size={13} />} title="Critical-date offsets" open={open} onToggle={onToggle}
      sub={`${d.length} deadlines · previewed from ${fmtShort(eff)}`}>
      <Note>
        <b>This is the card that costs money if it is wrong.</b> Each row is one deadline: how many days
        from the anchor, counted which way. <b>Business</b> skips weekends and the holiday list;{' '}
        <b>calendar</b> counts every day and then applies the rollover rule. <b>Inclusive start</b> means the
        anchor day itself is day one — leave it off and day one is the day <i>after</i>, which is how most
        contracts read. Counting is per deadline; there is no global mode.
      </Note>

      <div className="fgrid" style={{ marginBottom: 4 }}>
        <Field label="Sample effective date" hint="Preview only — nothing is saved from here">
          <Inp type="date" value={eff} onChange={e => setEff(e.target.value)} />
        </Field>
        <Field label="Sample closing date" hint="Used by the rows anchored to close">
          <Inp type="date" value={close} onChange={e => setClose(e.target.value)} />
        </Field>
      </div>
      <div style={{ fontSize: 11.5, color: '#8E89A8', margin: '2px 0 12px' }}>
        Rollover <b>{rules.rollover}</b> · {arr(rules.holidays).length} holidays on file · timezone {rules.tz} — all three
        are set in <b>Counting rules</b> below and are what the preview uses.
      </div>

      {/* a legend rather than a table header: each row needs its preview line
          underneath it, which a <table> layout does not give room for */}
      <div style={{ padding: '0 0 8px 24px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: '#8E89A8' }}>
        Label · days · anchor · business or calendar · inclusive start — then the date it produces
      </div>

      <Reorder items={d} onChange={set} keyOf={o => o.key} render={(o, i) => {
        const c = previewOf(o);
        return (
          <div>
            <div className="phase-row" style={{ flexWrap: 'wrap' }}>
              <input className="phase-label" value={o.label || ''} placeholder="Deadline label"
                onChange={e => patch(i, { label: e.target.value })} />
              <NumInp value={num(o.offset)} width={72} onChange={v => patch(i, { offset: Math.trunc(num(v)) })} />
              <select className="phase-sel" value={o.anchor === 'close' ? 'close' : 'effective'}
                onChange={e => patch(i, { anchor: e.target.value })}>
                <option value="effective">Effective</option>
                <option value="close">Close</option>
              </select>
              <select className="phase-sel" value={o.count === 'business' ? 'business' : 'calendar'}
                onChange={e => patch(i, { count: e.target.value })}>
                <option value="business">Business</option>
                <option value="calendar">Calendar</option>
              </select>
              <label className="chip-toggle" title={o.count === 'business' ? '' : 'Only affects business-day counting'}
                style={o.count === 'business' ? undefined : { opacity: .45 }}>
                <input type="checkbox" checked={!!o.inclusive} disabled={o.count !== 'business'}
                  onChange={e => patch(i, { inclusive: e.target.checked })} /> Inclusive
              </label>
              <span className="phase-key">{o.key}</span>
              <Btn kind="d" sm icon={<Trash2 size={12} />} onClick={() => set(d.filter((_, j) => j !== i))}>Delete</Btn>
            </div>
            <div style={{ padding: '0 10px 10px', display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
              {c ? (
                <>
                  <span className="cd-date" style={{ color: BRAND.colors.cobalt }}>{fmtLong(c.date)}</span>
                  <span className="cd-count">{c.count}</span>
                  <span className="cd-rule" style={{ marginTop: 0, flex: 1, minWidth: 220 }}>{c.explain}</span>
                </>
              ) : (
                <span className="cd-rule" style={{ marginTop: 0 }}>
                  No preview — {o.anchor === 'close' ? 'set a sample closing date above' : 'set a sample effective date above'}.
                </span>
              )}
            </div>
          </div>
        );
      }} />

      <div className="tm-add">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={label} placeholder="New deadline label, e.g. Loan application submitted"
            style={{ flex: 1, minWidth: 220, padding: '9px 11px', border: '1px solid #DEDFEA', borderRadius: 9, fontSize: 13.5 }}
            onChange={e => setLabel(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
          <Btn kind="g" sm icon={<Plus size={13} />} onClick={add}>Add deadline</Btn>
        </div>
        <div style={{ fontSize: 11.5, color: '#8E89A8', marginTop: 8 }}>
          New rows start at 0 calendar days from the effective date. Changing a row here does not move a
          deadline already on a transaction that has been met, waived, extended, typed by hand, or read as
          an absolute date off the contract — the re-cascade leaves all of those alone.
        </div>
      </div>

      {blocked ? <ErrorNote>{blocked}</ErrorNote> : null}
      <SaveBar dirty={ctl.dirty} onSave={save} onReset={ctl.reset} blocked={blocked} />
      <LegalNote />
    </Sec>
  );
}

/* ======================================================= 5. counting rules = */

const ROLLOVER_HELP = {
  forward: 'A date that lands on a weekend or a holiday moves to the next business day. This is the common contract reading and the default.',
  stand: 'The date stands where it lands, weekend or not. Some contracts say the date is the date.',
  back: 'A date that lands on a weekend or a holiday moves to the previous business day.',
};

function RulesCard({ ctx, open, onToggle }) {
  const src = ctx.settings.dateRules || FALLBACK.dateRules;
  /* deliberately drafts only the three scalar rules — the holiday list is its
     own card, so saving here can never revert a holiday edit made there. */
  const [d, set, ctl] = useDraft({ rollover: src.rollover, inclusiveDefault: !!src.inclusiveDefault, tz: src.tz });
  const badTz = !tzValid(d.tz);
  const save = () => {
    ctx.saveSettings({ ...ctx.settings, dateRules: { ...(ctx.settings.dateRules || FALLBACK.dateRules), rollover: d.rollover, inclusiveDefault: d.inclusiveDefault, tz: d.tz } });
    ctl.clean();
  };

  return (
    <Sec icon={<Gauge size={13} />} title="Counting rules" open={open} onToggle={onToggle}
      sub={`${d.rollover} · ${d.inclusiveDefault ? 'inclusive' : 'exclusive'} start · ${d.tz}`}>
      <Note>
        <b>Business versus calendar is per deadline</b> and lives in the offsets table above, not here.
        There is no global business-day mode, on purpose: one contract counts the inspection period in
        calendar days and the earnest money in business days, and both are right.
      </Note>

      <Sub>When a date lands on a weekend or holiday</Sub>
      <Seg value={d.rollover} onChange={v => ctl.patch({ rollover: v })}
        options={[{ value: 'forward', label: 'Roll forward' }, { value: 'stand', label: 'Stand' }, { value: 'back', label: 'Roll back' }]} />
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {['forward', 'stand', 'back'].map(k => (
          <div key={k} style={{ fontSize: 12.5, color: d.rollover === k ? '#3a3658' : '#928DAD', fontWeight: d.rollover === k ? 600 : 400 }}>
            <b style={{ textTransform: 'capitalize' }}>{k}</b> — {ROLLOVER_HELP[k]}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11.5, color: '#8E89A8', marginTop: 8 }}>
        Applies to calendar counts. A business-day count already lands on a business day, so the rule only
        touches it when the offset is 0.
      </div>

      <Sub>Default start for a new deadline</Sub>
      <Toggle on={!!d.inclusiveDefault} onChange={v => ctl.patch({ inclusiveDefault: v })}
        label={d.inclusiveDefault ? 'Inclusive — the anchor day counts as day one' : 'Exclusive — day one is the day after the anchor'} />
      <div style={{ fontSize: 11.5, color: '#8E89A8', marginTop: 6 }}>
        Exclusive is the usual reading of "5 days after the Effective Date" and is the shipped default.
        This only seeds new rows in the offsets table; each deadline carries its own setting.
      </div>

      <Sub>Timezone</Sub>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input value={d.tz || ''} placeholder="America/Chicago"
          style={{ width: 240, padding: '9px 11px', border: '1px solid #DEDFEA', borderRadius: 9, fontSize: 13.5 }}
          onChange={e => ctl.patch({ tz: e.target.value })} />
        {badTz ? <span style={{ fontSize: 12.5, color: '#B03030', fontWeight: 600 }}>Not an IANA timezone name.</span>
          : <span style={{ fontSize: 12.5, color: '#56527a' }}>Today here is <b>{fmtLong(today(d.tz))}</b>.</span>}
      </div>
      <div style={{ fontSize: 11.5, color: '#8E89A8', marginTop: 6 }}>
        A deadline is a date, never a timestamp — the timezone only decides which day the app calls
        "today", which is what drives overdue and the reminder windows.
      </div>

      {badTz ? <ErrorNote>Fix the timezone before saving, or every "today" in the app is wrong.</ErrorNote> : null}
      <SaveBar dirty={ctl.dirty} onSave={save} onReset={ctl.reset} blocked={badTz ? 'tz' : ''} />
    </Sec>
  );
}

/* ============================================================= 6. holidays = */

function HolidaysCard({ ctx, open, onToggle }) {
  const src = normHolidays(holidaysOf(ctx.settings));
  const [d, set, ctl] = useDraft(src);
  const [nd, setNd] = useState('');
  const [nn, setNn] = useState('');
  const thisYear = +String((ctx.todayIso || today(ctx.tz)).slice(0, 4));
  const [year, setYear] = useState(thisYear);

  const byYear = useMemo(() => {
    const g = {};
    arr(d).forEach(h => { (g[h.date.slice(0, 4)] = g[h.date.slice(0, 4)] || []).push(h); });
    return g;
  }, [d]);

  /* MERGE, never wipe: a date already on the list keeps the name the brokerage
     gave it, and a custom entry is never touched by a regenerate. */
  const merge = incoming => {
    const seen = {};
    arr(d).forEach(h => { seen[h.date] = true; });
    const added = normHolidays(incoming).filter(h => !seen[h.date]);
    if (!added.length) { ctx.flash('Nothing to add — every one of those dates is already on the list.'); return; }
    set(normHolidays([...arr(d), ...added]));
    ctx.flash(`${added.length} date${added.length === 1 ? '' : 's'} added. Custom entries left alone.`);
  };
  const add = () => {
    if (!isDate(nd)) return;
    merge([{ date: nd.slice(0, 10), name: nn.trim() || 'Holiday' }]);
    setNd(''); setNn('');
  };
  const del = iso => set(arr(d).filter(h => h.date !== iso));
  const save = () => {
    ctx.saveSettings({ ...ctx.settings, dateRules: { ...(ctx.settings.dateRules || FALLBACK.dateRules), holidays: d } });
    ctl.clean();
  };

  const years = Object.keys(byYear).sort();
  const short = years.length ? `${arr(d).length} dates · ${years[0]}–${years[years.length - 1]}` : 'none on file';

  return (
    <Sec icon={<CalendarDays size={13} />} title="Holidays" open={open} onToggle={onToggle} sub={short}>
      <Note>
        Business-day counting skips weekends <b>and</b> this list. A weekend-only rule would be wrong every
        November: Thanksgiving is a Thursday, the day after it is a Friday, and neither is a weekend — a
        three-business-day earnest money deadline over Thanksgiving week is off by two days if the list is
        empty. Keep it stocked a year ahead of the longest offset you use, and add your own closings
        (office holidays, local title-company closures) as custom rows.
      </Note>

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 6 }}>
        <Field label="Regenerate US federal holidays">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <NumInp value={year} width={92} onChange={v => setYear(Math.trunc(num(v, thisYear)))} />
            <Btn kind="g" sm icon={<Plus size={13} />} onClick={() => merge(usFederalHolidays(year))}>
              Add {year} federal holidays
            </Btn>
          </div>
        </Field>
        <Btn kind="g" sm icon={<Plus size={13} />} onClick={() => merge(seedHolidays(thisYear, 3))}>
          Top up {thisYear}–{thisYear + 2}
        </Btn>
      </div>
      <div style={{ fontSize: 11.5, color: '#8E89A8', marginBottom: 12 }}>
        Both buttons <b>merge</b>. A date already on the list is skipped, so nothing you typed by hand is
        overwritten and nothing is duplicated. Federal dates are the observed ones (a Saturday holiday
        observed on the Friday before).
      </div>

      {years.length === 0 && <Empty>No holidays on file — business-day counting would only skip weekends.</Empty>}
      {years.map(y => (
        <div key={y} style={{ marginBottom: 12 }}>
          <Sub>{y} · {byYear[y].length} dates</Sub>
          <div>
            {byYear[y].map(h => (
              <span key={h.date} className="opt-chip" title={h.date}>
                <b style={{ fontWeight: 700, marginRight: 4 }}>{fmtShort(h.date)}</b> {h.name}
                <button title="Remove" onClick={() => del(h.date)}><X size={13} /></button>
              </span>
            ))}
          </div>
        </div>
      ))}

      <div className="tm-add">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="date" value={nd} onChange={e => setNd(e.target.value)}
            style={{ padding: '9px 11px', border: '1px solid #DEDFEA', borderRadius: 9, fontSize: 13.5 }} />
          <input value={nn} placeholder="Name, e.g. Office closed" onChange={e => setNn(e.target.value)}
            style={{ flex: 1, minWidth: 180, padding: '9px 11px', border: '1px solid #DEDFEA', borderRadius: 9, fontSize: 13.5 }} />
          <Btn kind="g" sm icon={<Plus size={13} />} onClick={add} disabled={!isDate(nd)}>Add date</Btn>
        </div>
      </div>

      <SaveBar dirty={ctl.dirty} onSave={save} onReset={ctl.reset} />
    </Sec>
  );
}

/* =================================================== 7. checklist templates = */

function ChecklistsCard({ ctx, open, onToggle }) {
  const src = ctx.settings.checklists || FALLBACK.checklists;
  const [d, set, ctl] = useDraft({ listing: arr(src.listing), buyer: arr(src.buyer) });
  const [tab, setTab] = useState('listing');
  const [label, setLabel] = useState('');

  const list = arr(d[tab]);
  const setList = next => ctl.patch({ [tab]: next });
  const patch = (i, p) => setList(list.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const add = () => {
    const t = label.trim();
    if (!t) return;
    setList([...list, { key: mkKey(t, [...arr(d.listing), ...arr(d.buyer)].map(x => x.key)), label: t }]);
    setLabel('');
  };
  const blocked = [...arr(d.listing), ...arr(d.buyer)].some(x => !String(x.label || '').trim()) ? 'Every checklist item needs a label.' : '';
  const save = () => { ctx.saveSettings({ ...ctx.settings, checklists: d }); ctl.clean(); };

  return (
    <Sec icon={<ListChecks size={13} />} title="Checklist templates" open={open} onToggle={onToggle}
      sub={`${arr(d.listing).length} listing · ${arr(d.buyer).length} buyer`}>
      <Note>
        Two templates: the listing side and the buyer side. <b>Due offset</b> is optional — days after the
        contact reaches the stage that starts the checklist, used to put the item on the task list instead
        of leaving it to memory. Deleting an item <b>never destroys history</b>: a contact's checklist state
        is stored per item key on the contact, so removing the item here only stops it rendering. Put the
        item back with the same label and the ticks come back with it.
      </Note>

      <Seg value={tab} onChange={setTab} options={[
        { value: 'listing', label: 'Listing side', n: arr(d.listing).length },
        { value: 'buyer', label: 'Buyer side', n: arr(d.buyer).length },
      ]} />
      <div style={{ height: 10 }} />

      {list.length === 0 && <Empty>No items on this side yet.</Empty>}
      <Reorder items={list} onChange={setList} keyOf={x => x.key} render={(x, i) => (
        <div className="phase-row" style={{ flexWrap: 'wrap' }}>
          <input className="phase-label" value={x.label || ''} placeholder="Item label"
            onChange={e => patch(i, { label: e.target.value })} />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#56527a' }}>
            Due offset
            <NumInp value={x.dueOffset == null ? '' : x.dueOffset} width={72} suffix="days"
              onChange={v => patch(i, { dueOffset: String(v).trim() === '' ? undefined : Math.trunc(num(v)) })} />
          </span>
          <span className="phase-key">{x.key}</span>
          <Btn kind="d" sm icon={<Trash2 size={12} />} onClick={() => setList(list.filter((_, j) => j !== i))}>Delete</Btn>
        </div>
      )} />

      <div className="tm-add">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={label} placeholder={`New ${tab === 'buyer' ? 'buyer' : 'listing'} item`}
            style={{ flex: 1, minWidth: 200, padding: '9px 11px', border: '1px solid #DEDFEA', borderRadius: 9, fontSize: 13.5 }}
            onChange={e => setLabel(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
          <Btn kind="g" sm icon={<Plus size={13} />} onClick={add}>Add item</Btn>
        </div>
      </div>

      {blocked ? <ErrorNote>{blocked}</ErrorNote> : null}
      <SaveBar dirty={ctl.dirty} onSave={save} onReset={ctl.reset} blocked={blocked} />
    </Sec>
  );
}

/* ==================================================== 8. appointment types == */

function ApptTypesCard({ ctx, open, onToggle }) {
  const src = arr(ctx.settings.apptTypes).length ? arr(ctx.settings.apptTypes) : FALLBACK.apptTypes;
  const [d, set, ctl] = useDraft(src);
  const [label, setLabel] = useState('');
  const patch = (i, p) => set(d.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const add = () => {
    const t = label.trim();
    if (!t) return;
    set([...d, { key: mkKey(t, d.map(x => x.key)), label: t, counts: false }]);
    setLabel('');
  };
  const blocked = d.some(x => !String(x.label || '').trim()) ? 'Every appointment type needs a label.' : '';
  const save = () => { ctx.saveSettings({ ...ctx.settings, apptTypes: d }); ctl.clean(); };

  return (
    <Sec icon={<CalendarCheck size={13} />} title="Appointment types" open={open} onToggle={onToggle}
      sub={`${d.length} types · ${d.filter(x => x.counts).length} count as sales conversations`}>
      <Note>
        <b>Counts</b> decides whether the type is a real sales conversation, and it is the filter on both
        appointment numbers the app reports. The <b>appointment-to-close ratio</b> on the dashboard counts
        the ones marked <b>held</b> this calendar year, and credits a closing to them only when the
        appointment happened <i>before</i> the closing. The <b>appointments-per-week goal</b> counts the ones
        that were <b>set</b> in the last 30 days, held or not. A type with this off is invisible to both,
        which is why a showing or an open house normally sits off: they matter, but they are not the
        conversation where the agreement gets signed.
      </Note>
      <Reorder items={d} onChange={set} keyOf={x => x.key} render={(x, i) => (
        <div className="phase-row" style={{ flexWrap: 'wrap' }}>
          <input className="phase-label" value={x.label || ''} placeholder="Type label"
            onChange={e => patch(i, { label: e.target.value })} />
          <span className="phase-key">{x.key}</span>
          <Toggle sm on={!!x.counts} onChange={v => patch(i, { counts: v })}
            label={x.counts ? 'Counts as a sales conversation' : 'Does not count'} />
          <Btn kind="d" sm icon={<Trash2 size={12} />} onClick={() => set(d.filter((_, j) => j !== i))}>Delete</Btn>
        </div>
      )} />
      <div className="tm-add">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={label} placeholder="New appointment type"
            style={{ flex: 1, minWidth: 200, padding: '9px 11px', border: '1px solid #DEDFEA', borderRadius: 9, fontSize: 13.5 }}
            onChange={e => setLabel(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
          <Btn kind="g" sm icon={<Plus size={13} />} onClick={add}>Add type</Btn>
        </div>
      </div>
      {blocked ? <ErrorNote>{blocked}</ErrorNote> : null}
      <SaveBar dirty={ctl.dirty} onSave={save} onReset={ctl.reset} blocked={blocked} />
    </Sec>
  );
}

/* ======================================== 9. sources and the other picklists */

function ListsCard({ ctx, open, onToggle }) {
  const s = ctx.settings;
  const [d, set, ctl] = useDraft({
    sources: arr(s.sources).length ? arr(s.sources) : FALLBACK.sources,
    propertyTypes: arr(s.propertyTypes).length ? arr(s.propertyTypes) : FALLBACK.propertyTypes,
    timelines: arr(s.timelines).length ? arr(s.timelines) : FALLBACK.timelines,
    preapprovalStatuses: arr(s.preapprovalStatuses).length ? arr(s.preapprovalStatuses) : FALLBACK.preapprovalStatuses,
  });
  const save = () => {
    ctx.saveSettings({
      ...ctx.settings,
      sources: d.sources, propertyTypes: d.propertyTypes,
      timelines: d.timelines, preapprovalStatuses: d.preapprovalStatuses,
    });
    ctl.clean();
  };
  const used = v => (ctx.contacts || []).filter(c => c.source === v).length;

  return (
    <Sec icon={<Tags size={13} />} title="Lead sources and picklists" open={open} onToggle={onToggle}
      sub={`${d.sources.length} sources · ${d.propertyTypes.length} property types`}>
      <Note>
        Renaming an option does not rewrite the contacts already tagged with the old text, so the ROI
        report will show both until you retag them. Removing a source that contacts still carry leaves
        those contacts with a value that is no longer in the list — they keep working, they just fall
        outside the picker.
      </Note>

      <Sub>Lead sources — these drive the source ROI report</Sub>
      <ChipEdit items={d.sources} onChange={v => ctl.patch({ sources: v })} placeholder="Add a source" />
      <div style={{ fontSize: 11.5, color: '#8E89A8', marginTop: 8 }}>
        {d.sources.filter(x => used(x) > 0).length} of these are in use right now.
      </div>

      <Sub>Property types</Sub>
      <ChipEdit items={d.propertyTypes} onChange={v => ctl.patch({ propertyTypes: v })} placeholder="Add a property type" />

      <Sub>Timelines</Sub>
      <ChipEdit items={d.timelines} onChange={v => ctl.patch({ timelines: v })} placeholder="Add a timeline" />

      <Sub>Pre-approval statuses</Sub>
      <ChipEdit items={d.preapprovalStatuses} onChange={v => ctl.patch({ preapprovalStatuses: v })} placeholder="Add a status" />

      <SaveBar dirty={ctl.dirty} onSave={save} onReset={ctl.reset} />
    </Sec>
  );
}

/* ============================================ 10. commission — plan editor == */

function FeesEditor({ fees, onChange }) {
  const list = arr(fees);
  const patch = (i, p) => onChange(list.map((f, j) => (j === i ? { ...f, ...p } : f)));
  return (
    <div>
      {list.length === 0 && <div style={{ fontSize: 12.5, color: '#928DAD', marginBottom: 8 }}>No per-transaction fees.</div>}
      {list.map((f, i) => (
        <div key={i} className="phase-row" style={{ flexWrap: 'wrap' }}>
          <input className="phase-label" value={f.label || ''} placeholder="Fee label, e.g. E&O"
            onChange={e => patch(i, { label: e.target.value })} />
          <select className="phase-sel" value={f.type === 'pct' ? 'pct' : 'flat'} onChange={e => patch(i, { type: e.target.value })}>
            <option value="flat">Flat $</option>
            <option value="pct">% of gross</option>
          </select>
          <NumInp value={num(f.value)} width={92} step={f.type === 'pct' ? 0.25 : 1}
            suffix={f.type === 'pct' ? '%' : '$'} onChange={v => patch(i, { value: num(v) })} />
          <Btn kind="d" sm icon={<Trash2 size={12} />} onClick={() => onChange(list.filter((_, j) => j !== i))}>Remove</Btn>
        </div>
      ))}
      <Btn kind="g" sm icon={<Plus size={13} />} onClick={() => onChange([...list, { label: '', type: 'flat', value: 0 }])}>Add fee</Btn>
    </div>
  );
}

/** every field the split engine reads. Used for the install defaults and per agent. */
function PlanEditor({ plan, onChange, showCapStart }) {
  const p = plan || {};
  const patch = q => onChange({ ...p, ...q });
  return (
    <div>
      <div className="fgrid">
        <Field label="Agent keeps (pre-cap)" hint="The rest is the brokerage's share and goes against the cap">
          <div><NumInp value={num(p.keepPct, 85)} min={0} max={100} suffix="%" onChange={v => patch({ keepPct: clamp(v, 0, 100) })} /></div>
        </Field>
        <Field label="Cap" hint="0 = no cap: the split runs every deal and nothing accrues">
          <div><NumInp value={num(p.cap)} min={0} width={110} suffix="$" onChange={v => patch({ cap: Math.max(0, num(v)) })} /></div>
        </Field>
        <Field label="Post-cap split to the agent" hint="100% is the usual arrangement once the cap is met">
          <div><NumInp value={num(p.postCapPct, 100)} min={0} max={100} suffix="%" onChange={v => patch({ postCapPct: clamp(v, 0, 100) })} /></div>
        </Field>
        <Field label="Post-cap transaction fee" hint="Flat, charged once the agent is capped">
          <div><NumInp value={num(p.postCapFee)} min={0} width={110} suffix="$" onChange={v => patch({ postCapFee: Math.max(0, num(v)) })} /></div>
        </Field>
      </div>

      <Toggle on={!!p.postCapFeeOnStraddle} onChange={v => patch({ postCapFeeOnStraddle: v })}
        label="Charge the post-cap fee on the deal that caps (the straddle)" />
      <div style={{ fontSize: 11.5, color: '#8E89A8', marginTop: 4 }}>
        Off by default: on the transaction that finishes the cap, part of the money is still pre-cap, so
        most brokerages start the fee on the next one.
      </div>

      <div className="fgrid" style={{ marginTop: 12 }}>
        <Field label="Team split" hint="The team leader's cut of the agent's side">
          <div><NumInp value={num(p.teamPct)} min={0} max={100} suffix="%" onChange={v => patch({ teamPct: clamp(v, 0, 100) })} /></div>
        </Field>
        <Field label="Cap period">
          <Sel value={p.capCadence === 'calendar' ? 'calendar' : 'anniversary'} onChange={e => patch({ capCadence: e.target.value })}
            options={[{ value: 'anniversary', label: 'Anniversary of the start date' }, { value: 'calendar', label: 'Calendar year' }]} />
        </Field>
      </div>

      {showCapStart && (
        <Field label="Cap year starts" hint="Anniversary cadence only — the month and day are what matter">
          <Inp type="date" value={p.capStart || ''} onChange={e => patch({ capStart: e.target.value || null })} />
        </Field>
      )}

      <Sub>Order of operations</Sub>
      <Seg value={p.teamOrder === 'brokerage-first' ? 'brokerage-first' : 'team-first'}
        onChange={v => patch({ teamOrder: v })}
        options={[{ value: 'team-first', label: 'Team, then brokerage' }, { value: 'brokerage-first', label: 'Brokerage, then team' }]} />
      <div style={{ fontSize: 12, color: '#56527a', marginTop: 8, lineHeight: 1.5 }}>
        <b>Team, then brokerage</b> — the team takes its percentage off the post-referral gross, and the
        brokerage splits what is left. The agent's cap fills more slowly.<br />
        <b>Brokerage, then team</b> — the brokerage splits first against the cap, and the team takes its
        percentage of the agent's remainder.<br />
        Both exist in the wild and they produce different numbers on the same deal, so this is an explicit
        choice — the app will never pick one quietly for you.
      </div>

      <Sub>Per-transaction fees</Sub>
      <FeesEditor fees={p.fees} onChange={v => patch({ fees: v })} />
    </div>
  );
}

/** the worked example. Same engine the transaction uses, so what you see is what you get. */
function PlanPreview({ plan, capPaid, onCapPaid, salePrice, rate }) {
  const price = num(salePrice, 300000);
  const r = num(rate, 3);
  const calc = computeCommission(
    { salePrice: price, commissionRate: r, referralOutType: 'flat', referralOut: 0 },
    agentPlan(plan),
    { capPaidToDate: num(capPaid) },
  );
  return (
    <div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{ fontSize: 12.5, color: '#56527a' }}>
          A {usd(price)} sale at {r}% commission, no referral out,
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#56527a' }}>
          with
          <NumInp value={num(capPaid)} min={0} width={110} suffix="$" onChange={onCapPaid} />
          already paid to the cap.
        </span>
      </div>
      <div className="wf">
        {calc.lines.map((l, i) => (
          <div key={i} className={'wf-row' + (l.kind === 'total' ? ' tot' : '') + (l.value < 0 ? ' neg' : '')}>
            <span className="wl">
              {l.label}
              {l.note && <div style={{ fontSize: 11.5, color: '#8E89A8', marginTop: 2 }}>{l.note}</div>}
            </span>
            <span className="wv">{money(l.value)}</span>
          </div>
        ))}
      </div>
      <div className="wf-note">
        Cap {calc.plan.cap > 0 ? <>{usdc(calc.capBefore)} → {usdc(calc.capAfter)} of {usd(calc.plan.cap)}{calc.capRemainingAfter != null && <> · {usdc(calc.capRemainingAfter)} left</>}</> : 'not configured'}
        {calc.straddle && <> · <b>straddle:</b> {usdc(calc.capContribution)} finished the cap and {usdc(calc.brokerageFromExcess)} of the excess went to the brokerage at the post-cap {calc.plan.postCapPct}%.</>}
        {calc.fullyPostCap && <> · already capped, so this whole deal ran at the post-cap split.</>}
        {calc.capMetOnThis && <> · this is the deal that caps.</>}
        <br />Only the money that goes <i>to</i> the cap counts toward it. What the brokerage takes out of
        post-cap dollars is not cap credit.
      </div>
    </div>
  );
}

function CommissionCard({ ctx, open, onToggle }) {
  const src = ctx.settings.commissionDefaults || FALLBACK.commissionDefaults;
  const [d, set, ctl] = useDraft(src);
  const [capPaid, setCapPaid] = useState(10000);
  const save = () => { ctx.saveSettings({ ...ctx.settings, commissionDefaults: d }); ctl.clean(); };

  return (
    <Sec icon={<Percent size={13} />} title="Commission defaults" open={open} onToggle={onToggle}
      sub={`${num(d.keepPct, 85)}% / ${usd(num(d.cap))} cap · ${d.teamOrder === 'brokerage-first' ? 'brokerage first' : 'team first'}`}>
      <Note>
        These are the <b>seeds a new seat starts from</b>. Each agent's real plan lives on their own row, in
        Team and seats below — editing this card does not change an existing agent's split.
      </Note>

      <PlanEditor plan={d} onChange={set} />

      <Sub>Worked example, live</Sub>
      <PlanPreview plan={d} capPaid={capPaid} onCapPaid={v => setCapPaid(Math.max(0, num(v)))} salePrice={300000} rate={3} />

      <SaveBar dirty={ctl.dirty} onSave={save} onReset={ctl.reset} />
    </Sec>
  );
}

/* =============================================== 11. team, seats and plans ==
   This card is the one the team leader uses on day one and then twice a year.
   It has to answer three questions without anyone's help:
     "how do I add my people"   — name, email, role, and a login they can use;
     "how do I reset a password" — one button, per person;
     "what can each of them see" — sections and permissions, side by side, per
                                   person, with an honest note about what a
                                   toggle is and is not.                     */

const ROLE_KEYS = ROLES.map(r => r.key);
const roleKey = r => (ROLE_KEYS.indexOf(r) >= 0 ? r : 'agent');
const roleDef = r => ROLES.find(x => x.key === roleKey(r)) || ROLES[1];
const roleLabel = r => roleDef(r).label;
const isCoord = r => roleKey(r) === 'coordinator';
const roleSections = r => (isCoord(r) ? DEFAULT_COORDINATOR_SECTIONS : DEFAULT_AGENT_SECTIONS);
/* Money is not a toggle for a coordinator, it is the role. These three keys are
   forced off for them in App.jsx's can(), so the matrix must not offer them. */
const COORD_NEVER = ['seeTeamCommission', 'seeOtherCommission', 'books'];
/* …and these two are true for a coordinator by role, because the POLICY gives
   them the rows. Showing them as a switch would be pretending otherwise. */
const COORD_ALWAYS = ['seeTeamPipeline', 'seeOtherContacts'];

/** the one paragraph that stops a checkbox being mistaken for a security
    boundary. Rendered above every permission control on this page. */
const AffordanceNote = () => (
  <Note>
    <b>These control what the app offers. The database decides what the data layer will actually
    return.</b> The policies in <code>MIGRATION.sql</code> are the enforcement — turning "See other
    agents' contacts" on shows the owner column, it does not change the rows Postgres hands back, which
    for an agent stay <b>own contacts plus the pools they are on</b> no matter what is ticked here. If a
    brokerage genuinely wants an agent to see the whole book, that is a policy change, not a toggle.
    Two things are role, not toggle: a <b>transaction coordinator</b> reads every deal because the policy
    says so, and has no Commission and no Books at all — neither is switchable below.
  </Note>
);

/**
 * Everything one person can and cannot see, in one place: the nav sections they
 * get, and the permission toggles, side by side.
 * `sections` empty means "the default for their role", which is why the hint
 * spells the default out rather than leaving an empty list looking like a lockout.
 */
function VisibilityEditor({ ctx, role, sections, permissions, onSections, onPermissions }) {
  const modules = arr(ctx.settings.modules).length ? arr(ctx.settings.modules) : FALLBACK.modules;
  const leader = roleKey(role) === 'leader';
  const coord = isCoord(role);
  const available = SECTIONS
    .filter(s => !s.leaderOnly && modules.indexOf(s.key) >= 0)
    .filter(s => !(coord && (s.key === 'commission' || s.key === 'books')));
  const chosen = arr(sections);
  const effective = chosen.length ? chosen : roleSections(role);
  const perms = { ...defaultPermissions(), ...(permissions || {}) };

  const toggleSection = key => {
    const next = chosen.length ? chosen : effective.filter(k => available.some(s => s.key === k));
    onSections(next.indexOf(key) >= 0 ? next.filter(k => k !== key) : [...next, key]);
  };

  return (
    <div className="grid2" style={{ gap: 16, alignItems: 'start' }}>
      {/* ---------------------------------------------- what is in their nav */}
      <div>
        <Sub>Sections this person sees</Sub>
        {leader ? (
          <div className="seat-note"><Eye size={14} /> A team leader sees every installed section, including this one.</div>
        ) : (
          <>
            <div className="mod-grid">
              {available.map(s => {
                const on = effective.indexOf(s.key) >= 0;
                return (
                  <label key={s.key} className={'mod-row' + (on ? ' on' : '')}
                    onClick={e => { e.preventDefault(); toggleSection(s.key); }}>
                    <input type="checkbox" checked={on} readOnly />
                    <span>{s.label}</span>
                    {on ? <Check size={13} /> : null}
                  </label>
                );
              })}
            </div>
            <div style={{ fontSize: 11.5, color: '#8E89A8', marginTop: 8 }}>
              {chosen.length === 0
                ? <>Nothing set, so they get the <b>{roleLabel(role).toLowerCase()} default</b>: {roleSections(role).map(k => (SECTIONS.find(s => s.key === k) || {}).label || k).join(', ')} — narrowed by the install's module list.</>
                : <>This list can only <b>narrow</b> what the install ships. Ticking a section here cannot add a module the install does not have, and Settings is never in it.</>}
              {coord && <> <b>Commission and The Books are not on this list at all</b> — a transaction coordinator does not get them, and that is the role rather than a setting.</>}
            </div>
          </>
        )}
      </div>

      {/* ------------------------------------------------- what the app offers */}
      <div>
        <Sub>What the app offers them</Sub>
        {leader ? (
          <div className="seat-note"><Lock size={14} /> A team leader has everything. Nothing to set.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {PERMISSION_KEYS.map(p => {
              const never = p.locked || (coord && COORD_NEVER.indexOf(p.key) >= 0);
              const always = coord && COORD_ALWAYS.indexOf(p.key) >= 0;
              return (
                <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ flex: 1, minWidth: 170, fontSize: 12.5, fontWeight: 600, color: '#3a3658' }}>
                    {p.label}
                    {never && <Lock size={11} style={{ marginLeft: 6, verticalAlign: -1, color: '#B0606A' }} />}
                    {/* the note describes what the toggle does when it is ON, so
                        it would contradict the badge on a row that can never be on */}
                    {p.note && !never && <div style={{ fontSize: 11, fontWeight: 400, color: '#8E89A8' }}>{p.note}</div>}
                    {never && coord && !p.locked && <div style={{ fontSize: 11, fontWeight: 400, color: '#8E89A8' }}>not part of this role</div>}
                  </span>
                  {never ? (
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: '#B0606A', textTransform: 'uppercase' }}
                      title={p.locked ? 'Never — nobody edits their own split or cap' : 'Never — a transaction coordinator has no commission and no expenses'}>
                      never{coord && !p.locked ? ' · role' : ''}
                    </span>
                  ) : always ? (
                    <Tag>by role</Tag>
                  ) : (
                    <Toggle sm on={!!perms[p.key]} onChange={() => onPermissions({ ...perms, [p.key]: !perms[p.key], editOwnSplit: false })} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** copy-once credential strip. The password is never stored — close this and it
    is gone, which is the honest behaviour and is what the text says. */
function TempPassword({ email, password, onDone }) {
  const [copied, setCopied] = useState('');
  const [failed, setFailed] = useState(false);
  /* the clipboard API needs a secure context. On http it is simply absent, so
     say "select it yourself" rather than leaving a button that does nothing. */
  const copy = async text => {
    setFailed(false);
    try {
      if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        setCopied(text); setTimeout(() => setCopied(''), 1800);
        return;
      }
    } catch {}
    setCopied(''); setFailed(true);
  };
  return (
    <div className="note" style={{ marginTop: 12 }}>
      <div style={{ fontWeight: 700, color: '#3a3658', marginBottom: 8 }}>
        <KeyRound size={13} style={{ verticalAlign: -2, marginRight: 6 }} />
        Their sign-in — shown once, right now.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        <input readOnly value={email} onFocus={e => e.target.select()}
          style={{ flex: 1, minWidth: 200, padding: '9px 11px', border: '1px solid #DEDFEA', borderRadius: 9, fontSize: 13.5, background: '#fff' }} />
        <Btn kind="g" sm icon={<Copy size={13} />} onClick={() => copy(email)}>{copied === email ? 'Copied' : 'Copy email'}</Btn>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input readOnly value={password} onFocus={e => e.target.select()}
          style={{ flex: 1, minWidth: 200, padding: '9px 11px', border: '1px solid #DEDFEA', borderRadius: 9, fontSize: 14, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', background: '#fff' }} />
        <Btn kind="p" sm icon={<Copy size={13} />} onClick={() => copy(password)}>{copied === password ? 'Copied' : 'Copy password'}</Btn>
      </div>
      {failed && (
        <div style={{ fontSize: 12, color: '#B03030', fontWeight: 600, marginTop: 8 }}>
          This browser would not give the app the clipboard. Click into the box and select the text
          instead — <b>do not close this panel until you have it</b>.
        </div>
      )}
      <div style={{ fontSize: 12, color: '#56527a', marginTop: 10, lineHeight: 1.55 }}>
        Hand this to them yourself — say it on the phone, or type it into a message they already have.
        <b> Tell them to change it the first time they sign in</b> (their own device, Sign out is not
        needed — they can set a new password from the sign-in screen's reset link at any time).
        This app does not keep a copy: press Done and it is gone from this screen for good. If it gets
        lost, use <b>Send reset email</b> on their row instead of trying to remember it.
      </div>
      <div className="tm-acts">
        <Btn kind="g" sm icon={<Check size={13} />} onClick={onDone}>Done — I have handed it over</Btn>
      </div>
    </div>
  );
}

function AgentRow({ ctx, user, leaderCount }) {
  const [d, , ctl] = useDraft(user, user.id);
  const [openRow, setOpenRow] = useState(false);
  const [err, setErr] = useState('');
  const [capPaid, setCapPaid] = useState(0);

  const [pw, setPw] = useState('');            /* reset-email status, per row */
  const [confirmDel, setConfirmDel] = useState(false);
  const pools = arr(ctx.settings.pools).length ? arr(ctx.settings.pools) : FALLBACK.pools;
  const role = roleKey(d.role);
  const coord = isCoord(role);

  const demotingLastLeader = user.role === 'leader' && d.role !== 'leader' && leaderCount <= 1;
  const blocked = !String(d.name || '').trim() ? 'A seat needs a name.'
    : demotingLastLeader ? 'This is the only team leader. Promote someone else first, or nobody can reach this page.'
    : '';

  /* ctx has no saveUser — the contract stops at ctx.db for writers like this.
     App keeps its own copy of `users` and reloads it on the next navigation, so
     the list refreshes then; this row shows its own draft in the meantime. */
  const save = async () => {
    setErr('');
    try {
      await ctx.db.upsertUser({
        ...d,
        name: String(d.name || '').trim(),
        email: String(d.email || '').trim(),
        role,
        active: d.active !== false,
        sections: arr(d.sections),
        pools: arr(d.pools),
        permissions: { ...defaultPermissions(), ...(d.permissions || {}), editOwnSplit: false },
        /* a coordinator carries no split and no cap — writing the install
           defaults onto their row would put a plan on somebody who never earns
           a commission, and the Commission screen is not theirs anyway.
           What it does NOT do is wipe one: an agent moved to coordinator keeps
           whatever plan their row already had, untouched, so moving them back
           restores their real split instead of the install default. */
        plan: coord ? (d.plan || {}) : agentPlan(d.plan),
      });
      ctl.clean();
      ctx.flash('Saved.');
    } catch (e) {
      /* P0001 is the seat trigger on the account row. Show what it carries —
         never pretend the write happened. */
      /* the draft is left dirty on purpose: the leader can fix it and retry, or
         press Reset to go back to what the database actually holds. */
      setErr(e && e.code === 'P0001'
        ? `${e.message || 'The database refused that seat.'} Nothing was saved.`
        : (e && e.message) || 'That did not save.');
    }
  };

  const toggleIn = (list, key) => (arr(list).indexOf(key) >= 0 ? arr(list).filter(k => k !== key) : [...arr(list), key]);
  const plan = agentPlan(d.plan);

  /* changing a password later: one button, per person. It goes to the address
     on the row, so a typo in the email is a bounced link, not a lockout. */
  const sendReset = async () => {
    setErr('');
    const email = String(d.email || '').trim();
    if (!email) { setErr('This seat has no email address, so there is nowhere to send the link.'); return; }
    setPw('sending');
    try {
      await ctx.auth.sendReset(email);
      setPw(`Sent to ${email}. The link takes them straight to "set a new password" — it expires, so if they sit on it, send another.`);
    } catch (e) {
      setPw('');
      setErr((e && e.message) || 'That email did not go.');
    }
  };

  const removeSeat = async () => {
    setErr('');
    try {
      await ctx.db.deleteUser(d.id);
      ctx.flash('Seat removed. Their sign-in still exists in Supabase Auth — delete it there too if they are gone for good.');
    } catch (e) {
      setErr((e && e.message) || 'That did not delete.');
    }
  };

  return (
    <div className={'tm-row' + (d.active === false ? ' off' : '')}>
      <div className="tm-head" onClick={() => setOpenRow(o => !o)}>
        <div className="tm-name">
          <span>{d.name || 'Unnamed seat'}{ctx.me && ctx.me.id === d.id && <i>you</i>}</span>
          <span style={{ fontSize: 11.5, color: '#8E89A8', fontWeight: 400 }}>{d.email || 'no email'}</span>
        </div>
        <span className={'tm-role' + (role === 'leader' ? ' owner' : '')}>{roleLabel(role)}</span>
        <span className="tm-pct">
          {coord ? 'no split — works the closings' : `${num(plan.keepPct, 85)}% · ${plan.cap > 0 ? usd(plan.cap) : 'no cap'}`}
        </span>
        {d.active === false && <span className="tm-off">inactive</span>}
        {ctl.dirty && <span style={{ fontSize: 11, fontWeight: 700, color: '#A06A10' }}>unsaved</span>}
        <ChevronDown size={15} style={{ color: '#c0bdd0', transform: openRow ? 'rotate(180deg)' : 'none' }} />
      </div>

      {openRow && (
        <div className="tm-body">
          <div className="fgrid">
            <Field label="Name"><Inp value={d.name || ''} onChange={e => ctl.patch({ name: e.target.value })} /></Field>
            <Field label="Email" hint="The address they sign in with"><Inp value={d.email || ''} onChange={e => ctl.patch({ email: e.target.value })} /></Field>
            <Field label="Role" hint={roleDef(role).note}>
              <Sel value={role} onChange={e => ctl.patch({ role: e.target.value })}
                options={ROLES.map(r => ({ value: r.key, label: r.label }))} />
            </Field>
            <Field label="Seat">
              <Toggle on={d.active !== false} onChange={v => ctl.patch({ active: v })}
                label={d.active !== false ? 'Active — holds a seat' : 'Inactive — seat freed'} />
            </Field>
          </div>
          <div style={{ fontSize: 11.5, color: '#8E89A8', marginTop: 2 }}>
            Deactivating frees the seat and blocks sign-in. It <b>keeps everything</b>: their contacts,
            transactions, closed deals, cap history and commission record all stay exactly as they are, and
            reactivating them (if a seat is free) puts them back where they were. Deactivate rather than
            delete — a deleted seat takes its production history out of the team numbers.
          </div>

          {/* ------------------------------------------------------ sign-in */}
          <Sub>Their sign-in</Sub>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Btn kind="g" sm icon={<Mail size={13} />} onClick={sendReset} disabled={pw === 'sending'}>
              {pw === 'sending' ? 'Sending…' : 'Send reset email'}
            </Btn>
            <span style={{ fontSize: 11.5, color: '#8E89A8' }}>
              Goes to <b>{d.email || 'no address on this row'}</b>. This is how you change somebody's password
              later — you never need to know what it is.
            </span>
          </div>
          {pw && pw !== 'sending' && <div className="note" style={{ marginTop: 8 }}><Check size={13} /> {pw}</div>}

          {/* -------------------------------------------------- split and cap */}
          {coord ? (
            <>
              <Sub>Split and cap</Sub>
              <div className="seat-note">
                <Lock size={14} />
                <span>
                  <b>A transaction coordinator has no split and no cap.</b> They do not earn a commission on
                  the deals they work, so there is nothing to configure — and the Commission section and The
                  Books are not in their nav at all. Change their role to Agent if that is wrong.
                </span>
              </div>
            </>
          ) : (
            <>
              <Sub>Split and cap</Sub>
              <PlanEditor plan={d.plan || {}} onChange={v => ctl.patch({ plan: v })} showCapStart={plan.capCadence === 'anniversary'} />
              <div style={{ marginTop: 12 }}>
                <PlanPreview plan={d.plan || {}} capPaid={capPaid} onCapPaid={v => setCapPaid(Math.max(0, num(v)))} salePrice={300000} rate={3} />
              </div>
            </>
          )}

          {/* ------------------------------------ what this person can and cannot see */}
          <Sub>What {String(d.name || 'this person').split(' ')[0]} can and cannot see</Sub>
          <AffordanceNote />
          <VisibilityEditor
            ctx={ctx} role={role}
            sections={d.sections} permissions={d.permissions}
            onSections={v => ctl.patch({ sections: v })}
            onPermissions={v => ctl.patch({ permissions: v })}
          />

          <Sub>Lead pools</Sub>
          <div className="chips">
            {pools.map(p => {
              const on = arr(d.pools).indexOf(p.key) >= 0;
              return (
                <button key={p.key} className={'chip' + (on ? ' on' : '')} onClick={() => ctl.patch({ pools: toggleIn(d.pools, p.key) })}>
                  {on && <Check size={12} />}{p.name || p.key}
                </button>
              );
            })}
            {pools.length === 0 && <span style={{ fontSize: 12.5, color: '#928DAD' }}>No pools configured.</span>}
          </div>
          <div style={{ fontSize: 11.5, color: '#8E89A8', marginTop: 6 }}>
            A pool an agent is in shows them its unclaimed leads and lets them claim one. The pool card
            below is the same relationship from the other side.
            {coord && <> A coordinator already reads every contact, so a pool adds nothing for them.</>}
          </div>

          {err ? <ErrorNote>{err}</ErrorNote> : null}
          {blocked ? <ErrorNote>{blocked}</ErrorNote> : null}
          <SaveBar dirty={ctl.dirty} onSave={save} onReset={ctl.reset} blocked={blocked}>
            {ctx.me && ctx.me.id !== d.id && (
              confirmDel
                ? (
                  <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#B03030' }}>
                      Remove the seat and its history from the team numbers?
                    </span>
                    <Btn kind="d" sm icon={<Trash2 size={13} />} onClick={removeSeat}>Yes, remove</Btn>
                    <Btn kind="g" sm onClick={() => setConfirmDel(false)}>Cancel</Btn>
                  </span>
                )
                : <Btn kind="d" sm icon={<Trash2 size={13} />} onClick={() => setConfirmDel(true)}>Remove seat</Btn>
            )}
          </SaveBar>
          <div style={{ fontSize: 11.5, color: '#8E89A8', marginTop: 6 }}>
            <b>Deactivate</b> is almost always the right button. <b>Remove</b> deletes the row: their
            transactions and contacts lose their owner and drop out of every team total. It does not delete
            their sign-in — that lives in Supabase Auth.
          </div>
        </div>
      )}
    </div>
  );
}

function TeamCard({ ctx, open, onToggle }) {
  const users = arr(ctx.users);
  const seats = ctx.seats || { used: 0, limit: 0 };
  const contactUrl = (ctx.account && ctx.account.contact_url) || '';
  const leaderCount = users.filter(u => u.role === 'leader' && u.active !== false).length;

  const [nu, setNu] = useState({ name: '', email: '', role: 'agent' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [made, setMade] = useState(null);      /* { email, password } — shown once */

  /* ---------------------------------------------------------- add a person
     Two writes, in this order, and the order matters:

       1. the login, in Supabase Auth. auth.createLogin() posts to gotrue
          directly rather than calling signUp(), because signUp() would swap the
          leader's session for the new person's and sign the leader out of their
          own settings page mid-sentence.
       2. the crm_users row, keyed on the auth uid that step 1 returned.

     If step 1 gives back no id there is nothing to key the seat on, and the
     cause is almost always one setting — say which one. If step 2 is refused
     (the seat trigger), the login exists and the seat does not; say that too,
     because the leader has to know what to clean up. */
  const create = async mode => {
    setErr(''); setMade(null);
    const name = String(nu.name || '').trim();
    const email = String(nu.email || '').trim().toLowerCase();
    const role = roleKey(nu.role);
    if (!name) { setErr('Give the seat a name.'); return; }
    if (!/.+@.+\..+/.test(email)) { setErr('A person needs an email address — it is what they sign in with.'); return; }

    setBusy(mode);
    let password = '';
    try { password = ctx.auth.tempPassword(); }
    catch (e) { setErr((e && e.message) || 'Could not generate a password.'); setBusy(''); return; }

    let id = null;
    try {
      const r = await ctx.auth.createLogin(email, password);
      id = r && r.id;
      if (!id) {
        setErr(
          'Supabase created the login but did not return a user id, so there is nothing to attach the seat to. '
          + 'That happens for exactly one reason: "Confirm email" is ON. Turn it off in Supabase → '
          + 'Authentication → Providers → Email → Confirm email, then add this person again. '
          + 'Their unconfirmed login is already in Authentication → Users; delete it there first so the '
          + 'email address is free.');
        setBusy(''); return;
      }
    } catch (e) {
      const msg = (e && e.message) || 'Could not create that login.';
      setErr(/already|registered|exists/i.test(msg)
        ? `${msg} — that address already has a login. Use "Send reset email" on their existing row instead of making a second one. If they have a login but no seat, ask ProyTech to link the two; the app cannot read another account's uid.`
        : msg);
      setBusy(''); return;
    }

    try {
      await ctx.db.upsertUser({
        id, name, email, role, active: true,
        sections: [], pools: [], permissions: defaultPermissions(),
        plan: isCoord(role) ? {} : agentPlan(ctx.settings.commissionDefaults || FALLBACK.commissionDefaults),
      });
    } catch (e) {
      setErr(e && e.code === 'P0001'
        ? `${e.message || 'Seat limit reached.'} The database refused the seat, so nothing was added to the team — but the sign-in for ${email} WAS created. Free a seat and add them again, or delete that login in Supabase → Authentication → Users.`
        : `${(e && e.message) || 'That did not save.'} The sign-in for ${email} was created; the seat was not.`);
      setBusy(''); return;
    }

    if (mode === 'email') {
      try {
        await ctx.auth.sendReset(email);
        ctx.flash(`Seat added. ${email} has been sent a set-your-password link.`);
      } catch (e) {
        setErr(`The seat was created, but the email did not go: ${(e && e.message) || 'unknown error'}. Use "Send reset email" on their row to try again.`);
      }
    } else {
      setMade({ email, password });
      ctx.flash('Seat added. Hand them the password below.');
    }
    setNu({ name: '', email: '', role: 'agent' });
    setBusy('');
  };

  const full = seats.limit > 0 && seats.used >= seats.limit;

  return (
    <Sec icon={<Users size={13} />} title="Team — add people, set what each of them sees" open={open} onToggle={onToggle}
      sub={`${users.length} row${users.length === 1 ? '' : 's'} · ${seats.used} of ${seats.limit} seats used · ${ROLES
        .map(r => ({ n: users.filter(u => roleKey(u.role) === r.key).length, r }))
        .filter(x => x.n > 0)
        .map(x => `${x.n} ${x.r.label.toLowerCase()}${x.n === 1 ? '' : 's'}`).join(', ')}`}>
      <div className="seat-note" style={{ marginBottom: 12 }}>
        <Lock size={14} />
        <b>{seats.used} of {seats.limit} seats used — contact ProyTech to add more</b>
        {contactUrl
          ? <a className="btn btn-p btn-sm" href={contactUrl} target="_blank" rel="noreferrer">Request a seat</a>
          : <span style={{ color: '#8E89A8' }}>No contact link is configured on the account row.</span>}
        <span style={{ color: '#8E89A8' }}>The seat limit lives on the account row and is read-only here.</span>
      </div>
      <Note>
        A seat is an <b>active</b> row. Deactivating someone frees their seat and keeps their history, which
        is the right move when an agent leaves. Adding an active seat past the limit is rejected by the
        database, not by this screen — if that happens the error below is the database's own words.
        Open any row to set what that person can and cannot see.
      </Note>

      {users.length === 0 && <Empty>No seats loaded.</Empty>}
      <div className="tm-list">
        {users.map(u => <AgentRow key={u.id} ctx={ctx} user={u} leaderCount={leaderCount} />)}
      </div>

      {/* ------------------------------------------------------ add a person */}
      <div className="tm-add">
        <Sub>Add a person</Sub>
        <div className="fgrid">
          <Field label="Name">
            <Inp value={nu.name} placeholder="e.g. Robin Castellano" onChange={e => setNu({ ...nu, name: e.target.value })} />
          </Field>
          <Field label="Email" hint="This is what they sign in with">
            <Inp value={nu.email} type="email" placeholder="them@brokerage.com" onChange={e => setNu({ ...nu, email: e.target.value })} />
          </Field>
          <Field label="Role" hint={roleDef(nu.role).note}>
            <Sel value={roleKey(nu.role)} onChange={e => setNu({ ...nu, role: e.target.value })}
              options={ROLES.map(r => ({ value: r.key, label: r.label }))} />
          </Field>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
          <Btn kind="p" sm icon={<UserPlus size={13} />} onClick={() => create('password')} disabled={!!busy}>
            {busy === 'password' ? 'Creating…' : 'Create with a temporary password'}
          </Btn>
          <Btn kind="g" sm icon={<Mail size={13} />} onClick={() => create('email')} disabled={!!busy}>
            {busy === 'email' ? 'Creating…' : 'Create and email them a set-your-password link'}
          </Btn>
        </div>
        <div style={{ fontSize: 11.5, color: '#8E89A8', marginTop: 8, lineHeight: 1.6 }}>
          Both buttons do the same two things: create their sign-in, then create the seat. They differ only
          in how the person gets a password. <b>Temporary password</b> is shown to you once, here, to hand
          over — use it when they are standing next to you or on the phone. <b>Email them a link</b> sends
          them a set-your-password link and nothing is ever displayed — use it when they are not.
          The new row starts from the commission defaults above with every permission closed and the
          section list for their role.
          {full && <> <b>You are at the seat limit; the database will refuse the seat until one is freed or the limit is raised.</b></>}
        </div>
        <div style={{ fontSize: 11.5, color: '#8E89A8', marginTop: 6 }}>
          <b>One Supabase setting has to be off for this to work:</b> Authentication → Providers → Email →
          <b> Confirm email</b>. With it on, Supabase will not tell the app the new user's id, the seat
          cannot be linked to the login, and you get a half-made account. The message below says so if it
          happens.
        </div>
        {made ? <TempPassword email={made.email} password={made.password} onDone={() => setMade(null)} /> : null}
        {err ? <ErrorNote>{err}</ErrorNote> : null}
      </div>
    </Sec>
  );
}

/* ============================================== 12. the permission matrix === */

function PermissionsCard({ ctx, open, onToggle }) {
  const users = arr(ctx.users);
  const syncKey = users.map(u => u.id).join('|');
  const initial = useMemo(() => {
    const o = {};
    users.forEach(u => { o[u.id] = { ...defaultPermissions(), ...(u.permissions || {}) }; });
    return o;
  }, [syncKey]);
  const [d, set, ctl] = useDraft(initial, syncKey);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const toggle = (uid_, key) => set({ ...d, [uid_]: { ...(d[uid_] || {}), [key]: !(d[uid_] || {})[key] } });

  const save = async () => {
    setErr('');
    setBusy(true);
    const bad = [];
    for (const u of users) {
      const next = { ...defaultPermissions(), ...(d[u.id] || {}), editOwnSplit: false };
      const before = { ...defaultPermissions(), ...(u.permissions || {}) };
      const changed = PERMISSION_KEYS.some(p => !!before[p.key] !== !!next[p.key]);
      if (!changed) continue;
      try { await ctx.db.upsertUser({ ...u, permissions: next }); }
      catch (e) { bad.push(`${u.name}: ${(e && e.message) || 'refused'}`); }
    }
    setBusy(false);
    if (bad.length) { setErr(bad.join(' · ')); return; }
    ctl.clean();
    ctx.flash('Permissions saved.');
  };

  return (
    <Sec icon={<ShieldCheck size={13} />} title="Permission matrix — everyone at once" open={open} onToggle={onToggle}
      sub={`${PERMISSION_KEYS.length} permissions × ${users.length} seats`}>
      <AffordanceNote />
      <Note>
        This is the same set of switches that sits inside each person's row in <b>Team</b> above, laid out
        as a grid so you can compare the team at a glance. Edit it in either place. A team leader always
        has everything, so leaders are shown as granted and are not editable here; a transaction
        coordinator's money rows read <b>never</b>, because that is their role and not a setting.
      </Note>

      <div className="tbl-wrap" style={{ borderRadius: 12 }}>
        <table className="perm-tbl">
          <thead>
            <tr>
              <th style={{ minWidth: 220 }}>Permission</th>
              {users.map(u => (
                <th key={u.id} className="c" style={{ textAlign: 'center' }}>
                  {u.name ? u.name.split(' ')[0] : u.id.slice(0, 6)}
                  <div style={{ fontSize: 9.5, fontWeight: 600, color: '#8E89A8', textTransform: 'none', letterSpacing: 0 }}>
                    {roleLabel(u.role)}
                  </div>
                  {u.active === false && <div style={{ fontSize: 9.5, color: '#B0606A' }}>inactive</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_KEYS.map(p => (
              <tr key={p.key}>
                <td>
                  <div style={{ fontWeight: 600, color: '#3a3658' }}>
                    {p.label}{p.locked && <Lock size={11} style={{ marginLeft: 6, verticalAlign: -1, color: '#B0606A' }} />}
                  </div>
                  {p.note && <div style={{ fontSize: 11, color: '#8E89A8' }}>{p.note}</div>}
                </td>
                {users.map(u => {
                  const isLeaderRow = roleKey(u.role) === 'leader';
                  const coordRow = isCoord(u.role);
                  if (p.locked) {
                    return (
                      <td key={u.id} className="c" title="Never — nobody edits their own split or cap">
                        <span style={{ fontSize: 10.5, fontWeight: 800, color: '#B0606A', textTransform: 'uppercase' }}>never</span>
                      </td>
                    );
                  }
                  if (isLeaderRow) return <td key={u.id} className="c"><Tag>all</Tag></td>;
                  /* the coordinator's row is decided by the role, so it renders
                     as a fact rather than as a switch somebody could flip */
                  if (coordRow && COORD_NEVER.indexOf(p.key) >= 0) {
                    return (
                      <td key={u.id} className="c" title="Never — a transaction coordinator has no commission and no expenses">
                        <span style={{ fontSize: 10.5, fontWeight: 800, color: '#B0606A', textTransform: 'uppercase' }}>never</span>
                      </td>
                    );
                  }
                  if (coordRow && COORD_ALWAYS.indexOf(p.key) >= 0) {
                    return <td key={u.id} className="c" title="By role — the policy hands them every deal and every contact"><Tag>by role</Tag></td>;
                  }
                  const on = !!(d[u.id] || {})[p.key];
                  return (
                    <td key={u.id} className="c">
                      <span style={{ display: 'inline-flex' }}>
                        <Toggle sm on={on} onChange={() => toggle(u.id, p.key)} />
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 11.5, color: '#8E89A8', marginTop: 10 }}>
        <b>Edit their own split/cap settings</b> is locked off for everyone, permanently. An agent editing
        their own cap is a commission dispute waiting to happen, so the answer is <b>never</b> — not a
        default, not a toggle. The database agrees: <code>crm_users</code>'s update policy refuses a write
        to anybody's own <b>role</b>, <b>plan</b>, <b>permissions</b> or <b>section list</b>, whatever a
        screen asks for.
      </div>

      {err ? <ErrorNote>{err}</ErrorNote> : null}
      <SaveBar dirty={ctl.dirty} onSave={save} onReset={ctl.reset} blocked={busy ? 'busy' : ''} />
    </Sec>
  );
}

/* ============================================================ 13. lead pools */

function PoolsCard({ ctx, open, onToggle }) {
  const src = arr(ctx.settings.pools).length ? arr(ctx.settings.pools) : FALLBACK.pools;
  const [d, set, ctl] = useDraft(src);
  const [name, setName] = useState('');
  const users = arr(ctx.users).filter(u => u.role !== 'leader');
  const countIn = k => (ctx.contacts || []).filter(c => c.pool === k && !c.owner_id).length;

  const patch = (i, p) => set(d.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const toggleAgent = (i, id) => {
    const cur = arr(d[i].agents);
    patch(i, { agents: cur.indexOf(id) >= 0 ? cur.filter(x => x !== id) : [...cur, id] });
  };
  const add = () => {
    const t = name.trim();
    if (!t) return;
    set([...d, { key: mkKey(t, d.map(x => x.key)), name: t, agents: [] }]);
    setName('');
  };
  const blocked = d.some(p => !String(p.name || '').trim()) ? 'Every pool needs a name.' : '';
  const save = () => { ctx.saveSettings({ ...ctx.settings, pools: d }); ctl.clean(); };

  return (
    <Sec icon={<Waypoints size={13} />} title="Lead pools" open={open} onToggle={onToggle}
      sub={`${d.length} pool${d.length === 1 ? '' : 's'}`}>
      <Note>
        An unclaimed lead sits in a pool until an agent claims it. The visibility list is who can see and
        claim from that pool — an agent who is not on it never sees those leads at all. Renaming a pool is
        safe: contacts point at the pool's key, not its name.
      </Note>

      {d.map((p, i) => {
        const n = countIn(p.key);
        return (
          <div key={p.key} style={{ border: '1px solid #EDEEF5', borderRadius: 12, padding: '12px 13px', marginBottom: 10, background: '#FAFAFE' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input className="phase-label" value={p.name || ''} placeholder="Pool name"
                onChange={e => patch(i, { name: e.target.value })} />
              <span className="phase-key">{p.key}</span>
              {n > 0 && <Tag>{n} unclaimed</Tag>}
              <Btn kind="d" sm icon={<Trash2 size={12} />} disabled={d.length <= 1}
                onClick={() => { if (n > 0) { ctx.flash(`${n} unclaimed lead${n === 1 ? '' : 's'} would be orphaned — reassign or claim them first.`); return; } set(d.filter((_, j) => j !== i)); }}>
                Delete
              </Btn>
            </div>
            <div className="chips" style={{ marginTop: 10 }}>
              {users.length === 0 && <span style={{ fontSize: 12.5, color: '#928DAD' }}>No agents to add.</span>}
              {users.map(u => {
                const on = arr(p.agents).indexOf(u.id) >= 0;
                return (
                  <button key={u.id} className={'chip' + (on ? ' on' : '')} onClick={() => toggleAgent(i, u.id)}>
                    {on && <Check size={12} />}{u.name}{u.active === false ? ' (inactive)' : ''}
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: 11.5, color: '#8E89A8', marginTop: 6 }}>
              {arr(p.agents).length === 0 ? 'Nobody can see this pool — its leads are invisible until you add an agent.' : `${arr(p.agents).length} agent${arr(p.agents).length === 1 ? '' : 's'} can see and claim from this pool.`}
            </div>
          </div>
        );
      })}

      <div className="tm-add">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={name} placeholder="New pool name, e.g. Zillow Leads"
            style={{ flex: 1, minWidth: 200, padding: '9px 11px', border: '1px solid #DEDFEA', borderRadius: 9, fontSize: 13.5 }}
            onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
          <Btn kind="g" sm icon={<Plus size={13} />} onClick={add}>Add pool</Btn>
        </div>
      </div>

      {blocked ? <ErrorNote>{blocked}</ErrorNote> : null}
      <SaveBar dirty={ctl.dirty} onSave={save} onReset={ctl.reset} blocked={blocked} />
    </Sec>
  );
}

/* ====================================================== 14. dashboard layout */

function DashCard({ ctx, open, onToggle }) {
  const order = arr(ctx.settings.dashOrder).length ? arr(ctx.settings.dashOrder) : FALLBACK.dashOrder;
  const hidden = arr(ctx.settings.dashHidden);
  const ordered = useMemo(() => {
    const known = DASH_SECTIONS.slice();
    const out = [];
    order.forEach(k => { const s = known.find(x => x.key === k); if (s && out.indexOf(s) < 0) out.push(s); });
    known.forEach(s => { if (out.indexOf(s) < 0) out.push(s); });
    return out;
  }, [order.join('|')]);

  const [d, set, ctl] = useDraft({ order: ordered.map(s => s.key), hidden });
  const label = k => (DASH_SECTIONS.find(s => s.key === k) || {}).label || k;
  const isHidden = k => arr(d.hidden).indexOf(k) >= 0;
  const toggleHide = k => ctl.patch({ hidden: isHidden(k) ? d.hidden.filter(x => x !== k) : [...arr(d.hidden), k] });
  const save = () => { ctx.saveSettings({ ...ctx.settings, dashOrder: d.order, dashHidden: d.hidden }); ctl.clean(); };

  return (
    <Sec icon={<LayoutDashboard size={13} />} title="Dashboard layout" open={open} onToggle={onToggle}
      sub={`${d.order.length - arr(d.hidden).length} of ${d.order.length} sections shown`}>
      <Note>
        The order the dashboard renders in, top to bottom, and which sections it skips. The Dashboard has
        its own Rearrange button — it writes the same two keys, so whichever screen you use last wins.
        Hiding a section hides the panel, not the data.
      </Note>
      <Reorder items={d.order.map(k => ({ key: k }))} onChange={next => ctl.patch({ order: next.map(x => x.key) })}
        render={x => {
          const s = DASH_SECTIONS.find(y => y.key === x.key) || {};
          return (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ flex: 1, minWidth: 140, fontSize: 13.5, fontWeight: 600, color: isHidden(x.key) ? '#928DAD' : '#3a3658', textDecoration: isHidden(x.key) ? 'line-through' : 'none' }}>
                {label(x.key)}
              </span>
              {s.leaderOnly && <Tag>leader only</Tag>}
              <Toggle sm on={!isHidden(x.key)} onChange={() => toggleHide(x.key)} label={isHidden(x.key) ? 'Hidden' : 'Shown'} />
            </div>
          );
        }} />
      <SaveBar dirty={ctl.dirty} onSave={save} onReset={ctl.reset} />
    </Sec>
  );
}

/* ============================================================== 15. modules = */

function ModulesCard({ ctx, open, onToggle }) {
  const src = arr(ctx.settings.modules).length ? arr(ctx.settings.modules) : FALLBACK.modules;
  const [d, set, ctl] = useDraft(src);
  const on = k => d.indexOf(k) >= 0;
  const toggle = k => {
    if (k === 'settings') return;                     /* never lock yourself out */
    set(on(k) ? d.filter(x => x !== k) : [...d, k]);
  };
  const save = () => {
    const next = d.indexOf('settings') >= 0 ? d : [...d, 'settings'];
    ctx.saveSettings({ ...ctx.settings, modules: next });
    ctl.clean();
  };

  return (
    <Sec icon={<Layers size={13} />} title="Modules" open={open} onToggle={onToggle}
      sub={`${d.length} of ${SECTIONS.length} sections installed`}>
      <Note>
        Which sections this install ships with at all. A <b>per-agent</b> section list can only ever narrow
        this — turning a module off here removes it for everyone, including you. The deployment can narrow
        it further still with <b>VITE_MODULES</b>, which this screen cannot override.
      </Note>
      <div className="mod-grid">
        {SECTIONS.map(s => (
          <label key={s.key} className={'mod-row' + (on(s.key) ? ' on' : '')}
            onClick={e => { e.preventDefault(); toggle(s.key); }}>
            <input type="checkbox" checked={on(s.key)} readOnly />
            <span>{s.label}</span>
            {s.key === 'settings'
              ? <Lock size={12} title="Always on — this page" />
              : on(s.key) ? <Check size={13} /> : null}
          </label>
        ))}
      </div>
      <div style={{ fontSize: 11.5, color: '#8E89A8', marginTop: 10 }}>
        Settings stays on permanently. Turning it off would leave nobody able to turn it back on.
      </div>
      <SaveBar dirty={ctl.dirty} onSave={save} onReset={ctl.reset} />
    </Sec>
  );
}

/* ============================================================ 16. the books = */

function BooksCard({ ctx, open, onToggle }) {
  const src = ctx.settings.books || FALLBACK.books;
  const [d, set, ctl] = useDraft({ mileageRate: num(src.mileageRate, 0.7), categories: arr(src.categories) });
  const save = () => {
    ctx.saveSettings({ ...ctx.settings, books: { ...(ctx.settings.books || FALLBACK.books), mileageRate: num(d.mileageRate), categories: d.categories } });
    ctl.clean();
  };

  return (
    <Sec icon={<BookText size={13} />} title="The Books" open={open} onToggle={onToggle}
      sub={`${usdc(d.mileageRate)}/mile · ${d.categories.length} categories`}>
      <Field label="Mileage rate" hint="Dollars per mile">
        <div><NumInp value={d.mileageRate} min={0} step={0.005} width={110} suffix="$ / mile" onChange={v => ctl.patch({ mileageRate: num(v) })} /></div>
      </Field>
      <Note>
        This is the <b>IRS standard mileage rate</b>, and it is a setting rather than a constant because it
        changes most years. Keeping it current is the team leader's job — the app will not update it for
        you, and a stale rate quietly understates every mileage entry logged after the change.
      </Note>

      <Sub>Expense categories</Sub>
      <ChipEdit items={d.categories} onChange={v => ctl.patch({ categories: v })} placeholder="Add a category" />
      <div style={{ fontSize: 11.5, color: '#8E89A8', marginTop: 8 }}>
        Removing a category leaves existing expenses tagged with it — they still total correctly, they just
        drop out of the picker.
      </div>

      <Sub>Expense privacy</Sub>
      <div className="seat-note">
        <Lock size={14} />
        <span>
          <b>Agents' individual expenses are private to them.</b> You do not see them here, in the Books, in
          any report, or in an export — the database refuses the read, not the interface. This is
          deliberate (§7): an agent's spending is their own business, and a CRM that shows the team leader
          every lunch receipt does not get used honestly. Your own brokerage-level expenses are the only
          ones on your Books.
        </span>
      </div>

      <SaveBar dirty={ctl.dirty} onSave={save} onReset={ctl.reset} />
    </Sec>
  );
}

/* =========================================================== 17. contracts == */

function ContractsCard({ ctx, open, onToggle }) {
  const src = ctx.settings.contracts || FALLBACK.contracts;
  const [d, set, ctl] = useDraft(src);
  const months = num(d.retentionMonths, 84);
  const years = Math.round((months / 12) * 10) / 10;
  const save = () => { ctx.saveSettings({ ...ctx.settings, contracts: d }); ctl.clean(); };

  return (
    <Sec icon={<FileText size={13} />} title="Contracts" open={open} onToggle={onToggle}
      sub={`${months} months retention · ${d.hardDelete ? 'hard delete' : 'record only'}`}>
      <div className="fgrid">
        <Field label="Retention" hint="Months from upload">
          <div><NumInp value={months} min={1} width={100} suffix={`months ≈ ${years} years`} onChange={v => ctl.patch({ retentionMonths: Math.max(1, Math.trunc(num(v, 84))) })} /></div>
        </Field>
        <Field label="Extraction model" hint="Which Anthropic model reads an uploaded contract">
          <Inp value={d.model || ''} placeholder="claude-sonnet-4-5" onChange={e => ctl.patch({ model: e.target.value })} />
        </Field>
      </div>
      <Note>
        Each uploaded contract gets a delete-after date this far ahead of its upload — {months} months is
        about {years} years, and 84 is the shipped default because seven years is the common broker
        record-keeping expectation. <b>When that date passes the file goes.</b> What does not go: the
        deadlines already computed onto the transaction, the dates, the notes and the history. You lose the
        source PDF and the extraction record, not the transaction. Check the number against what your
        broker and your state require — this app does not know your rules and cannot advise you on them.
      </Note>

      <Toggle on={d.hardDelete !== false} onChange={v => ctl.patch({ hardDelete: v })}
        label="Hard delete — remove the stored file, not just the row" />
      <div style={{ fontSize: 11.5, color: '#8E89A8', marginTop: 4 }}>
        {d.hardDelete !== false
          ? 'On: deleting a contract removes the object from storage. It is gone; there is no undo and no copy.'
          : 'Off: deleting a contract removes the database row only. The file stays in the storage bucket where an administrator can still reach it — which may be exactly what you want, and may be exactly what your retention policy forbids.'}
      </div>

      <Sub>Sending contract text to a third party</Sub>
      <Toggle on={!!d.allowExternalSend} onChange={v => ctl.patch({ allowExternalSend: v })}
        label={d.allowExternalSend ? 'Allowed — contract text may go to services other than the Anthropic API' : 'Off — contract text only ever goes to the Anthropic API'} />
      <div className={'note' + (d.allowExternalSend ? ' bad' : '')} style={{ marginTop: 10 }}>
        {d.allowExternalSend ? <AlertTriangle size={13} /> : null}{' '}
        This is <b>off</b> and should stay off. A purchase contract carries your client's name, address,
        finances and signature. One destination, named in the settings, is auditable: you can say who saw
        it. The moment contract text can be posted to any other service, that answer becomes "we are not
        sure", which is not an answer you want to give a client or a broker. Turn it on only with a written
        reason and your broker's agreement.
      </div>
      <LegalNote />
      <SaveBar dirty={ctl.dirty} onSave={save} onReset={ctl.reset} />
    </Sec>
  );
}

/* =========================================================== 18. reminders == */

function RemindersCard({ ctx, open, onToggle }) {
  const src = ctx.settings.reminders || FALLBACK.reminders;
  const [d, set, ctl] = useDraft({
    escalation: arr(src.escalation),
    dailyWhenOverdue: src.dailyWhenOverdue !== false,
    recipients: { ...(FALLBACK.reminders.recipients), ...(src.recipients || {}) },
    coordinatorEmail: src.coordinatorEmail || '',
    hardFlagHours: num(src.hardFlagHours, 48),
  });
  const [nv, setNv] = useState('');
  const addDay = () => {
    const n = Math.trunc(num(nv, -1));
    if (!Number.isFinite(n) || n < 0 || arr(d.escalation).indexOf(n) >= 0) { setNv(''); return; }
    ctl.patch({ escalation: [...arr(d.escalation), n].sort((a, b) => b - a) });
    setNv('');
  };
  const badEmail = d.recipients.coordinator && !/.+@.+\..+/.test(String(d.coordinatorEmail || ''));
  const save = () => { ctx.saveSettings({ ...ctx.settings, reminders: d }); ctl.clean(); };

  return (
    <Sec icon={<BellRing size={13} />} title="Reminders" open={open} onToggle={onToggle}
      sub={`${arr(d.escalation).join(', ')} days · ${d.hardFlagHours}h hard flag`}>
      <Sub>Escalation — days before a deadline</Sub>
      <div style={{ marginBottom: 6 }}>
        {arr(d.escalation).map(n => (
          <span key={n} className="opt-chip">
            {n === 0 ? 'morning of' : `${n} day${n === 1 ? '' : 's'} before`}
            <button title="Remove" onClick={() => ctl.patch({ escalation: d.escalation.filter(x => x !== n) })}><X size={13} /></button>
          </span>
        ))}
        {arr(d.escalation).length === 0 && <span style={{ fontSize: 12.5, color: '#B03030', fontWeight: 600 }}>No reminders at all — a deadline would arrive unannounced.</span>}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <NumInp value={nv} min={0} width={82} suffix="days before" onChange={setNv} />
        <Btn kind="g" sm icon={<Plus size={13} />} onClick={addDay}>Add</Btn>
      </div>
      <div style={{ fontSize: 11.5, color: '#8E89A8', marginTop: 6 }}>
        <b>0 means the morning of</b> the deadline. The shipped set is 7, 1 and 0: one week out to plan, the
        day before to act, and the morning of as the last catch.
      </div>

      <Sub>Once it is overdue</Sub>
      <Toggle on={!!d.dailyWhenOverdue} onChange={v => ctl.patch({ dailyWhenOverdue: v })}
        label={d.dailyWhenOverdue ? 'Remind daily until it is met, waived or extended' : 'Do not repeat after the deadline passes'} />
      <div style={{ fontSize: 11.5, color: '#8E89A8', marginTop: 4 }}>
        A missed deadline that stops nagging is a missed deadline nobody deals with.
      </div>

      <Sub>Recipients</Sub>
      <Toggle on={d.recipients.assignedAgent !== false} onChange={v => ctl.patch({ recipients: { ...d.recipients, assignedAgent: v } })}
        label="The assigned agent" />
      <Toggle on={!!d.recipients.coordinator} onChange={v => ctl.patch({ recipients: { ...d.recipients, coordinator: v } })}
        label="Transaction coordinator" />
      <Toggle on={!!d.recipients.client} onChange={v => ctl.patch({ recipients: { ...d.recipients, client: v } })}
        label="The client" />
      <div className="note" style={{ marginTop: 10 }}>
        The assigned agent is on by default and is the one recipient who should always be on. The
        <b> coordinator</b> and the <b>client</b> are <b>opt-in per transaction</b>: what you set here is only
        the default for a new transaction, and each transaction can turn either off. Nothing goes to a
        client because a switch on a settings page was left on — somebody decides that deal by deal.
      </div>
      <Field label="Coordinator email" hint="Where the coordinator's copy goes">
        <Inp value={d.coordinatorEmail || ''} placeholder="coordinator@brokerage.com"
          onChange={e => ctl.patch({ coordinatorEmail: e.target.value })} />
      </Field>
      {badEmail ? <ErrorNote>The coordinator is a recipient but the address does not look like an email.</ErrorNote> : null}

      <Sub>Hard flag</Sub>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <NumInp value={num(d.hardFlagHours, 48)} min={1} width={90} suffix="hours" onChange={v => ctl.patch({ hardFlagHours: Math.max(1, Math.trunc(num(v, 48))) })} />
      </div>
      <div style={{ fontSize: 11.5, color: '#8E89A8', marginTop: 6 }}>
        Anything inside this window is flagged loudly in the header and at the top of the dashboard.
        48 hours is the default because it is the last point at which most obligations can still be met.
      </div>

      <SaveBar dirty={ctl.dirty} onSave={save} onReset={ctl.reset} blocked={badEmail ? 'email' : ''} />
    </Sec>
  );
}

/* =============================================================== 19. goals == */

function GoalsCard({ ctx, open, onToggle }) {
  const src = ctx.settings.goals || FALLBACK.goals;
  const [d, set, ctl] = useDraft(src);
  const keys = Object.keys({ ...FALLBACK.goals, ...(src || {}) });
  const nice = k => titleCase(String(k).replace(/([A-Z])/g, ' $1').replace(/_/g, ' ')).replace(/\bPer\b/g, 'per');
  const save = () => { ctx.saveSettings({ ...ctx.settings, goals: d }); ctl.clean(); };

  return (
    <Sec icon={<Target size={13} />} title="Goals" open={open} onToggle={onToggle}
      sub={keys.map(k => `${nice(k)} ${num(d[k])}`).join(' · ')}>
      <Note>
        The targets the dashboard and the Monday huddle measure against. Set them where the team can
        actually reach them — a goal nobody hits stops being read.
      </Note>
      <div className="fgrid">
        {keys.map(k => (
          <Field key={k} label={nice(k)}>
            <div><NumInp value={num(d[k])} min={0} width={100} onChange={v => ctl.patch({ [k]: Math.max(0, num(v)) })} /></div>
          </Field>
        ))}
      </div>
      <SaveBar dirty={ctl.dirty} onSave={save} onReset={ctl.reset} />
    </Sec>
  );
}

/* ==================================================== 20. backup / restore == */

function BackupCard({ ctx, open, onToggle }) {
  const [text, setText] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef(null);

  const parsed = useMemo(() => {
    const t = text.trim();
    if (!t) return null;
    try { const o = JSON.parse(t); return (o && typeof o === 'object' && !Array.isArray(o)) ? o : null; }
    catch { return null; }
  }, [text]);

  const download = () => {
    try {
      const blob = new Blob([JSON.stringify(ctx.settings, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `settings-${(ctx.settings.brand && ctx.settings.brand.name ? slugKey(ctx.settings.brand.name) : 'install')}-${ctx.todayIso}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { setErr((e && e.message) || 'Could not build the file.'); }
  };

  const pick = e => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => { setText(String(r.result || '')); setConfirm(false); setErr(''); };
    r.onerror = () => setErr('Could not read that file.');
    r.readAsText(f);
  };

  const restore = () => {
    if (!parsed || !confirm) return;
    /* mergeSettings fills in anything the file predates, so an older backup can
       never drop a key this build needs. Arrays replace wholesale — an edited
       stage list in the file is authoritative. */
    const merged = mergeSettings(parsed);
    ctx.saveSettings(merged);
    setText(''); setConfirm(false); setErr('');
    ctx.flash('Settings restored from the file.');
  };

  const keys = parsed ? Object.keys(parsed) : [];
  const missing = parsed ? Object.keys(FALLBACK).filter(k => keys.indexOf(k) < 0) : [];

  return (
    <Sec icon={<Database size={13} />} title="Backup and restore" open={open} onToggle={onToggle}
      sub="download this install's settings, or restore from a file">
      <Note>
        Take a backup before a big edit — stages, offsets and splits especially. The file is the whole
        settings object as JSON: no contacts, no transactions, no money. It is the install's shape, which
        is also how you copy a configuration to a second install.
      </Note>
      <Btn kind="g" icon={<Download size={14} />} onClick={download}>Download settings JSON</Btn>

      <Sub>Restore</Sub>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <input ref={fileRef} type="file" accept="application/json,.json" onChange={pick} style={{ display: 'none' }} />
        <Btn kind="g" sm icon={<Upload size={13} />} onClick={() => fileRef.current && fileRef.current.click()}>Choose a file</Btn>
        {text && <Btn kind="g" sm icon={<X size={13} />} onClick={() => { setText(''); setConfirm(false); }}>Clear</Btn>}
      </div>
      <Txt rows={6} value={text} placeholder="…or paste the JSON here"
        onChange={e => { setText(e.target.value); setConfirm(false); }}
        style={{ width: '100%', padding: '10px 12px', border: '1px solid #DEDFEA', borderRadius: 10, fontSize: 12.5, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }} />

      {text.trim() && !parsed && <ErrorNote>That is not a settings object — the JSON did not parse, or it is not an object.</ErrorNote>}

      {parsed && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12.5, color: '#56527a' }}>
            {keys.length} top-level keys, including{' '}
            {['stages', 'phases', 'offsets', 'commissionDefaults'].filter(k => keys.indexOf(k) >= 0).join(', ') || 'none of the big four'}.
            {arr(parsed.stages).length ? ` ${arr(parsed.stages).length} stages,` : ''}
            {arr(parsed.offsets).length ? ` ${arr(parsed.offsets).length} deadlines,` : ''}
            {arr(parsed.phases).length ? ` ${arr(parsed.phases).length} phases.` : ''}
          </div>
          {missing.length > 0 && (
            <div style={{ fontSize: 12, color: '#8E89A8', marginTop: 6 }}>
              {missing.length} key{missing.length === 1 ? '' : 's'} this build expects are not in the file
              ({missing.slice(0, 6).join(', ')}{missing.length > 6 ? '…' : ''}). They will be filled from the
              defaults, so an older backup cannot drop them.
            </div>
          )}
          <div className="note bad" style={{ marginTop: 10 }}>
            <AlertTriangle size={13} /> Restoring <b>replaces every setting on this install</b> — stages,
            offsets, splits, permissions defaults, the lot. Per-agent plans and permissions live on the user
            rows and are <b>not</b> in this file, so they survive. Deadlines already on a transaction do not
            move until a re-cascade runs.
          </div>
          <Toggle on={confirm} onChange={setConfirm} label="I have a backup of the current settings and I want to replace them" />
          <div className="tm-acts">
            <Btn kind="d" sm icon={<Upload size={13} />} onClick={restore} disabled={!confirm}>Restore these settings</Btn>
          </div>
        </div>
      )}
      {err ? <ErrorNote>{err}</ErrorNote> : null}
    </Sec>
  );
}
