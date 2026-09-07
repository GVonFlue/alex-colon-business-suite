/* ============================================================================
   Tools.jsx — the AI tools index.

   Six panels, in the order an agent actually reaches for them. Every one of
   them follows the same contract, which is stated once at the top of the screen
   and enforced here rather than trusted:

     nothing auto-sends, and nothing touches a record until the agent presses
     Save. Generate produces a draft in an editable box. Copy, Download and Save
     are three separate deliberate acts.

   Two things are load-bearing:

   * MONEY IS COMPUTED HERE, NOT BY THE MODEL. The net sheet and the offer
     comparison do their arithmetic in this file, line by line, with every line
     rendered on screen. /api/ai is handed the finished totals and only ever
     writes the words around them. Both panels therefore work with no API key
     at all — the table computes, the commentary column just stays empty.
   * The commission line goes through commission.js (computeCommission with a
     pass-through plan gives the gross the seller pays), so there is exactly one
     place in the codebase that turns a price and a rate into a commission.

   No key on the deployment? The Generate buttons are replaced by one honest
   note and every manual input stays live.
   ========================================================================== */

import React, { useState, useMemo, useEffect } from 'react';
import {
  Sparkles, Copy, Download, Save, Pencil, Home, Calculator, Scale, Mail,
  PhoneCall, MessageSquare, Plus, X, ChevronRight, ChevronLeft, ShieldOff,
  ShieldCheck, Loader2, Info,
} from 'lucide-react';

import { Card, Btn, Field, Inp, Sel, Txt, Seg, Toggle, Empty, SecTitle, LegalNote, ErrorNote, Pill, SideChip } from '../components/ui';
import { uid, usd, phoneFmt } from '../lib/format';
import { fmtLong, fmtShort, diffDays, daysUntil, urgency, effectiveDateOf, isDate } from '../lib/dates';
import { checklistFor, stageLabel, phasesOf } from '../lib/settings';
import { computeCommission } from '../lib/commission';
import { BRAND } from '../lib/brand';
import { TOOLS_CSS } from './tools.css.js';
import { apiPost } from '../lib/data';

/* ============================================================================
   plumbing
   ========================================================================== */

const AI_OFF = 'AI features are not configured on this deployment — set ANTHROPIC_API_KEY in Vercel. Everything below still works by hand, and the net sheet and offer comparison still do all of their arithmetic.';

const REASONS = {
  not_configured: AI_OFF,
  bad_json: 'That came back malformed. Press Generate again — nothing was saved.',
  api_error: 'The AI service refused that request.',
  network: 'Could not reach the AI service.',
  timeout: 'The AI service did not answer in time. Try again.',
  bad_response: 'The server sent back something this screen could not read.',
  unknown_job: 'This build asked for a tool the server does not have.',
  bad_payload: 'Some of those inputs could not be read.',
};
const reasonText = j => (j && (REASONS[j.reason] || j.detail)) || 'That did not work.';

async function callAi(job, payload) {
  try {
    const r = await apiPost('/api/ai', { job, payload });
    const j = await r.json();
    return j && typeof j === 'object' ? j : { ok: false, reason: 'bad_response' };
  } catch (e) {
    /* no route at all (plain vite dev) reads the same as no key: the screen
       degrades, it does not break */
    return { ok: false, reason: 'not_configured', detail: String((e && e.message) || e) };
  }
}

/* ---------------------------------------------------------------- numbers
   Plain JS, module level, every line of it rendered on screen. */

const n = v => { const x = Number(String(v == null ? '' : v).replace(/[$,\s]/g, '')); return Number.isFinite(x) ? x : 0; };
const r2 = v => Math.round(n(v) * 100) / 100;

/** the commission the SELLER pays — price x rate, or a flat fee. Routed through
    commission.js with a pass-through plan so the rule lives in one place. */
const PASS_THROUGH = { keepPct: 100, cap: 0, postCapPct: 100, postCapFee: 0, teamPct: 0, fees: [] };
const grossCommission = (price, rate, flat) => computeCommission(
  { salePrice: n(price), commissionRate: n(rate), flatCommission: n(flat) },
  PASS_THROUGH, { capPaidToDate: 0 },
).gross;

/** seller net sheet. Returns the rows exactly as they render. */
function netSheetRows(f) {
  const price = r2(f.salePrice);
  const commission = grossCommission(price, f.commissionRate, f.commissionFlat);
  const rows = [{ key: 'price', label: 'Sale price', amount: price }];
  const add = (key, label, amount) => { const a = r2(amount); if (a !== 0) rows.push({ key, label, amount: -Math.abs(a) }); };
  add('payoff', 'Loan payoff', f.payoff);
  add('commission', 'Real estate commission', commission);
  add('closing', 'Seller closing costs', f.closingCosts);
  add('taxes', 'Property tax proration', f.taxes);
  add('concessions', 'Buyer concessions / credits', f.concessions);
  add('other', String(f.otherNote || '').trim() ? `Other — ${String(f.otherNote).trim()}` : 'Other', f.other);
  const deductions = r2(rows.filter(r => r.key !== 'price').reduce((s, r) => s + r.amount, 0));
  return { rows, deductions, net: r2(price + deductions), commission };
}

/** one offer's seller-side net proceeds, same waterfall, run per offer */
function offerRows(shared, offers) {
  const fixed = r2(n(shared.payoff) + n(shared.closingCosts) + n(shared.taxes) + n(shared.other));
  return offers.map((o, i) => {
    const price = r2(o.price);
    const commission = grossCommission(price, shared.commissionRate, o.commissionFlat);
    const credits = r2(n(o.concessions) + n(o.repairCredits));
    const deductions = r2(commission + fixed + credits);
    return {
      id: o.id, index: i, offer: String(o.label || '').trim() || `Offer ${i + 1}`,
      price, commission, credits, fixed, deductions, netProceeds: r2(price - deductions),
      financing: o.financing || '', earnest: r2(o.earnest), closeDate: o.closeDate || '',
      contingencies: Array.isArray(o.contingencies) ? o.contingencies : [],
      possession: o.possession || '', appraisalGap: r2(o.appraisalGap), notes: o.notes || '',
    };
  });
}

/* ------------------------------------------------------------------ clipboard */

function copyText(text, flash) {
  const ok = () => flash('Copied to your clipboard.');
  const manual = () => {
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      ok();
    } catch { flash('Could not copy — select the text and copy it by hand.'); }
  };
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(ok, manual); return; }
  } catch { /* falls through */ }
  manual();
}

const slug = s => (String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'draft');

function downloadText(name, text) {
  try {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch {} }, 1500);
  } catch { /* a failed download is not worth breaking the screen over */ }
}

/* --------------------------------------------------------------- saving
   The only two ways anything from this screen reaches a record. Both are
   called from a button labelled Save, never from a Generate handler. */

function saveToContact(ctx, contact, kind, text, touch) {
  if (!contact || !String(text || '').trim()) { ctx.flash('Nothing to save yet.'); return; }
  const entry = { id: uid(), at: ctx.todayIso, kind: kind || 'note', note: String(text).trim(), by: ctx.me ? ctx.me.id : null };
  const next = { ...contact, activity: [entry, ...(contact.activity || [])] };
  if (touch) next.lastTouch = ctx.todayIso;
  ctx.upsertContact(next);
  ctx.flash(`Saved to ${contact.name}'s activity${touch ? ' and counted as a touch' : ''}.`);
}

function saveToTransaction(ctx, txn, title, text) {
  if (!txn || !String(text || '').trim()) { ctx.flash('Nothing to save yet.'); return; }
  const stamp = `[${fmtLong(ctx.todayIso)}] ${title}`;
  ctx.upsertTransaction({ ...txn, notes: [txn.notes, `${stamp}\n${String(text).trim()}`].filter(Boolean).join('\n\n') });
  ctx.flash('Saved to the transaction notes.');
}

/* ============================================================================
   shared UI
   ========================================================================== */

/** the output block. Same three states as before — preview, edit, counter —
    but dressed as a document: a header bar carrying the label and every action,
    a soft inner surface, a comfortable measure, and a visible Preview/Editing
    badge so nobody wonders which one they are looking at. */
function Draft({ label, value, onChange, limit, hint, extra, filename, ctx, rows }) {
  const [edit, setEdit] = useState(false);
  const text = String(value || '');
  const len = text.length;
  const over = !!limit && len > limit;
  const pct = limit ? Math.max(0, Math.min(100, Math.round((len / limit) * 100))) : 0;
  return (
    <div className={'tl-draft' + (edit ? ' tl-editing' : '')}>
      <div className="tl-draft-bar">
        <span className="tl-draft-label">{label}</span>
        <span className={'tl-state' + (edit ? ' on' : '')}>{edit ? 'Editing' : 'Preview'}</span>
        <span className="tl-draft-acts">
          <Btn sm kind={edit ? 's' : 'g'} onClick={() => setEdit(e => !e)} icon={<Pencil size={13} />}>{edit ? 'Done editing' : 'Edit'}</Btn>
          <Btn sm onClick={() => copyText(text, ctx.flash)} icon={<Copy size={13} />}>Copy</Btn>
          <Btn sm onClick={() => downloadText(`${slug(filename || label)}.txt`, text)} icon={<Download size={13} />}>Download</Btn>
          {extra}
        </span>
      </div>
      <div className="tl-draft-body">
        {edit
          ? <textarea className="tl-draft-edit" rows={rows || 9} value={value || ''} onChange={e => onChange(e.target.value)} />
          : <div className={'tl-doc' + (text.trim() ? '' : ' tl-doc-none')}>{text.trim() || 'Nothing drafted yet.'}</div>}
      </div>
      {(limit || hint) && (
        <div className={'tl-draft-foot' + (over ? ' tl-over' : '')}>
          {limit ? (
            <>
              <span className="tl-meter"><i style={{ width: `${pct}%` }} /></span>
              <span>{len} / {limit} characters{over ? ` — ${len - limit} over the MLS limit, trim before you paste` : ''}</span>
            </>
          ) : null}
          {hint ? <span className="tl-foot-hint">{hint}</span> : null}
        </div>
      )}
    </div>
  );
}

/* What the button says it is doing while it waits. Rotated on an interval that
   is cleared the moment the panel stops being busy or unmounts. */
const GEN_STATUS = [
  'Reading what you entered…',
  'Checking the record…',
  'Drafting…',
  'Tidying it up…',
  'Nearly there…',
];

/** Generate button, or the honest note in its place. This is the primary
    moment of every panel, so it is the one button on the screen that is
    bigger than the rest and the only one that animates. */
function GenerateRow({ aiOn, busy, disabled, onClick, label, note, err }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!busy) { setStep(0); return undefined; }
    const id = setInterval(() => setStep(s => s + 1), 2100);
    return () => clearInterval(id);
  }, [busy]);

  if (aiOn === false) {
    return (
      <div className="tl-gen">
        <div className="ai-banner ai-off"><ShieldOff size={14} /> {AI_OFF}</div>
        <ErrorNote>{err}</ErrorNote>
      </div>
    );
  }

  return (
    <div className="tl-gen">
      <div className="tl-gen-row">
        <button type="button" className={'tl-gen-btn' + (busy ? ' tl-busy' : '')}
          onClick={onClick} disabled={!!busy || !!disabled}>
          {busy ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
          {busy ? 'Working…' : (label || 'Generate draft')}
          {busy && <><span className="tl-shine" /><span className="tl-strip"><i /></span></>}
        </button>
        {busy
          ? (
            <span className="tl-status">
              <span className="tl-dots"><b /><b /><b /></span>
              <span className="tl-status-t" key={step}>{GEN_STATUS[step % GEN_STATUS.length]}</span>
            </span>
          )
          : (note ? <span className="tl-gen-note">{note}</span> : null)}
      </div>
      <ErrorNote>{err}</ErrorNote>
    </div>
  );
}

/** deductions render in parentheses, the way a closing statement does */
const signed = v => (n(v) < 0 ? `(${usd(Math.abs(n(v)))})` : usd(v));

/* ============================================================================
   1. listing description writer
   ========================================================================== */

function ListingPanel({ ctx, aiOn, setAiOn }) {
  const sellers = useMemo(() => (ctx.contacts || []).filter(c => c.side === 'seller' || c.side === 'both'), [ctx.contacts]);
  const listings = useMemo(() => (ctx.transactions || []).filter(t => t.side === 'seller'), [ctx.transactions]);

  const [src, setSrc] = useState('');
  const [f, setF] = useState({
    address: '', propertyType: '', beds: '', baths: '', sqft: '', lot: '', yearBuilt: '',
    garage: '', areas: '', price: '', features: '', updates: '', tone: '',
  });
  const limitDefault = Math.round(Number(ctx.settings && ctx.settings.mlsLimit) || 1000);
  const [limit, setLimit] = useState(limitDefault);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [out, setOut] = useState(null);

  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));

  const contact = src.startsWith('c:') ? sellers.find(c => c.id === src.slice(2)) : null;
  const txn = src.startsWith('t:') ? listings.find(t => t.id === src.slice(2)) : null;
  const txnContact = txn ? (ctx.contacts || []).find(c => c.id === txn.contact_id) : null;
  const record = contact || txn;

  const pick = v => {
    setSrc(v);
    if (v.startsWith('c:')) {
      const c = sellers.find(x => x.id === v.slice(2));
      if (!c) return;
      setF(prev => ({
        ...prev,
        address: c.address || '', propertyType: c.propertyType || '',
        beds: c.beds == null ? '' : String(c.beds), baths: c.baths == null ? '' : String(c.baths),
        areas: (c.areas || []).join(', '),
        price: c.targetPrice || c.priceMax || '',
        features: prev.features || (c.notes || ''),
      }));
    } else if (v.startsWith('t:')) {
      const t = listings.find(x => x.id === v.slice(2));
      if (!t) return;
      const c = (ctx.contacts || []).find(x => x.id === t.contact_id);
      setF(prev => ({
        ...prev,
        address: t.address || '', price: t.salePrice || '',
        propertyType: (c && c.propertyType) || prev.propertyType,
        beds: c && c.beds != null ? String(c.beds) : prev.beds,
        baths: c && c.baths != null ? String(c.baths) : prev.baths,
        areas: c && c.areas ? c.areas.join(', ') : prev.areas,
      }));
    }
  };

  const gen = async () => {
    setBusy(true); setErr('');
    const j = await callAi('listing-description', {
      address: f.address, propertyType: f.propertyType, beds: f.beds, baths: f.baths,
      sqft: f.sqft, lot: f.lot, yearBuilt: f.yearBuilt, garage: f.garage,
      areas: f.areas, price: f.price, features: f.features, updates: f.updates,
      tone: f.tone, mlsLimit: limit,
    });
    setBusy(false);
    if (!j.ok) { setErr(reasonText(j)); if (j.reason === 'not_configured') setAiOn(false); return; }
    setOut({
      mls: j.mls || '',
      social: (j.social || []).join('\n\n'),
      email: j.email || '',
      limit: j.mlsLimit || limit,
    });
    if (j.mlsTruncated) ctx.flash('The MLS description came back over the limit and was trimmed at a sentence break — read it before you paste.');
  };

  const saveAll = () => {
    if (!out) return;
    const text = [`MLS description:\n${out.mls}`, `Social:\n${out.social}`, `Email blast:\n${out.email}`].join('\n\n');
    if (contact) saveToContact(ctx, contact, 'note', `Listing copy draft — ${f.address || 'property'}\n\n${text}`, false);
    else if (txn) saveToTransaction(ctx, txn, `Listing copy draft — ${f.address || txn.address || 'property'}`, text);
    else ctx.flash('Pick a contact or a transaction first so there is somewhere to save it.');
  };

  if (!sellers.length && !listings.length) {
    return (
      <Card sub="MLS description, social captions and an email blast from the property details.">
        <Empty>No seller-side contacts or listings yet. Add a seller in Contacts and the details prefill here.</Empty>
      </Card>
    );
  }

  return (
    <Card
      sub="Pick the seller or the listing, check the details, set your MLS character limit. Output is a draft you edit."
      right={record ? <Pill color="${BRAND.colors.cobalt}">{contact ? contact.name : txn.address}</Pill> : null}>

      <div className="fgrid">
        <Field label="Prefill from" full>
          <Sel value={src} onChange={e => pick(e.target.value)}>
            <option value="">— type the details by hand —</option>
            {listings.length > 0 && (
              <optgroup label="Seller transactions">
                {listings.map(t => <option key={t.id} value={`t:${t.id}`}>{t.address || t.id}{t.mls ? ` · ${t.mls}` : ''}</option>)}
              </optgroup>
            )}
            {sellers.length > 0 && (
              <optgroup label="Seller contacts">
                {sellers.map(c => <option key={c.id} value={`c:${c.id}`}>{c.name} · {stageLabel(c.stage, c.side, ctx.settings)}</option>)}
              </optgroup>
            )}
          </Sel>
        </Field>

        <Field label="Address" full><Inp value={f.address} onChange={e => set('address', e.target.value)} placeholder="4412 N Bluff Ridge Ct, Wichita, KS" /></Field>
        <Field label="Property type">
          <Sel value={f.propertyType} onChange={e => set('propertyType', e.target.value)}
            options={(ctx.settings.propertyTypes || []).map(p => ({ value: p, label: p }))}>
            <option value="">—</option>
          </Sel>
        </Field>
        <Field label="Area / neighbourhood"><Inp value={f.areas} onChange={e => set('areas', e.target.value)} placeholder="College Hill, Riverside" /></Field>
        <Field label="Beds"><Inp value={f.beds} onChange={e => set('beds', e.target.value)} inputMode="numeric" /></Field>
        <Field label="Baths"><Inp value={f.baths} onChange={e => set('baths', e.target.value)} inputMode="decimal" /></Field>
        <Field label="Square feet"><Inp value={f.sqft} onChange={e => set('sqft', e.target.value)} inputMode="numeric" /></Field>
        <Field label="Lot"><Inp value={f.lot} onChange={e => set('lot', e.target.value)} placeholder="0.28 acre" /></Field>
        <Field label="Year built"><Inp value={f.yearBuilt} onChange={e => set('yearBuilt', e.target.value)} inputMode="numeric" /></Field>
        <Field label="Garage / parking"><Inp value={f.garage} onChange={e => set('garage', e.target.value)} placeholder="2-car attached" /></Field>
        <Field label="List price"><Inp value={f.price} onChange={e => set('price', e.target.value)} inputMode="numeric" placeholder="415000" /></Field>
        <Field label="Tone"><Inp value={f.tone} onChange={e => set('tone', e.target.value)} placeholder="warm, concrete, no hype" /></Field>
        <Field label="Features — the ones that actually sell it" full
          hint="Only what is here gets written. Nothing is inferred about schools, commutes or the neighbourhood.">
          <Txt rows={3} value={f.features} onChange={e => set('features', e.target.value)}
            placeholder="Quartz counters, walk-in pantry, screened porch, mature oaks, primary on main…" />
        </Field>
        <Field label="Recent updates" full>
          <Txt rows={2} value={f.updates} onChange={e => set('updates', e.target.value)} placeholder="Roof 2023, HVAC 2021, refinished floors…" />
        </Field>
        <Field label="MLS character limit" hint={`Default ${limitDefault}. Your MLS sets this.`}>
          <Inp value={limit} onChange={e => setLimit(Math.max(200, Math.min(4000, Math.round(n(e.target.value)) || limitDefault)))} inputMode="numeric" />
        </Field>
      </div>

      <GenerateRow aiOn={aiOn} busy={busy} disabled={!String(f.address).trim() && !String(f.features).trim()}
        onClick={gen} err={err}
        label="Write the listing copy"
        note={!String(f.address).trim() && !String(f.features).trim() ? 'Add an address or some features first.' : ''} />

      {out && (
        <>
          <Draft ctx={ctx} label="MLS description" value={out.mls} limit={out.limit}
            onChange={v => setOut(o => ({ ...o, mls: v }))} filename={`mls-${slug(f.address)}`}
            hint="Paste into the MLS yourself — nothing here publishes anything." />
          <Draft ctx={ctx} label="Social captions" value={out.social} rows={7}
            onChange={v => setOut(o => ({ ...o, social: v }))} filename={`social-${slug(f.address)}`} />
          <Draft ctx={ctx} label="Email blast" value={out.email} rows={10}
            onChange={v => setOut(o => ({ ...o, email: v }))} filename={`email-${slug(f.address)}`}
            extra={record ? <Btn sm kind="s" onClick={saveAll} icon={<Save size={13} />}>Save all three to the record</Btn> : null} />
          <div className="ai-note">Check every fact against the property before this goes anywhere. Fair-housing language is your responsibility, not the model's.</div>
        </>
      )}
    </Card>
  );
}

/* ============================================================================
   2. seller net sheet
   ========================================================================== */

function netSheetText(f, calc, notes, summary, brandName) {
  const w = 34;
  const line = r => `${r.label.padEnd(w, ' ').slice(0, w)}  ${signed(r.amount).padStart(14, ' ')}`;
  const out = [
    'ESTIMATED SELLER NET SHEET',
    f.address ? f.address : '',
    f.sellerName ? `Prepared for ${f.sellerName}` : '',
    f.closeDate && isDate(f.closeDate) ? `Estimated closing ${fmtLong(f.closeDate)}` : '',
    brandName ? `Prepared by ${brandName}` : '',
    '',
    ...calc.rows.map(r => [line(r), notes[r.key] ? `  ${notes[r.key]}` : ''].filter(Boolean).join('\n')),
    '',
    `${'ESTIMATED NET TO SELLER'.padEnd(w, ' ')}  ${usd(calc.net).padStart(14, ' ')}`,
    '',
    summary ? summary : '',
    '',
    'Every figure is an estimate. The title company issues the settlement statement that governs, and your lender sets the exact payoff. This is not legal or tax advice.',
  ];
  return out.filter(x => x !== '').join('\n');
}

function NetSheetPanel({ ctx, aiOn, setAiOn }) {
  const listings = useMemo(
    () => (ctx.transactions || []).filter(t => t.side === 'seller' && t.status !== 'fell'),
    [ctx.transactions],
  );
  const [txnId, setTxnId] = useState('');
  const [f, setF] = useState({
    address: '', sellerName: '', closeDate: '', salePrice: '', commissionRate: 6, commissionFlat: '',
    payoff: '', closingCosts: '', taxes: '', concessions: '', other: '', otherNote: '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [notes, setNotes] = useState({});
  const [summary, setSummary] = useState('');

  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));
  const txn = listings.find(t => t.id === txnId) || null;

  const pick = id => {
    setTxnId(id);
    const t = listings.find(x => x.id === id);
    if (!t) return;
    const c = (ctx.contacts || []).find(x => x.id === t.contact_id);
    setF(prev => ({
      ...prev,
      address: t.address || '', sellerName: (c && c.name) || '',
      closeDate: t.closeDate || '', salePrice: t.salePrice || '',
      commissionRate: t.commissionRate == null ? prev.commissionRate : t.commissionRate,
      commissionFlat: t.flatCommission || '',
    }));
  };

  const calc = useMemo(() => netSheetRows(f), [f]);

  const gen = async () => {
    setBusy(true); setErr('');
    const j = await callAi('net-sheet', {
      address: f.address, sellerName: f.sellerName, closeDate: f.closeDate,
      salePrice: f.salePrice, commissionRate: f.commissionRate, commissionFlat: f.commissionFlat,
      payoff: f.payoff, closingCosts: f.closingCosts, taxes: f.taxes,
      concessions: f.concessions, other: f.other, otherNote: f.otherNote,
    });
    setBusy(false);
    if (!j.ok) { setErr(reasonText(j)); if (j.reason === 'not_configured') setAiOn(false); return; }
    setNotes(j.notes || {});
    setSummary(j.summary || '');
  };

  const text = netSheetText(f, calc, notes, summary, BRAND.biz.name);

  return (
    <Card
      sub="Every figure below is arithmetic done on this screen. The model only writes the plain-language notes — it never touches a number."
      right={<Pill color="${BRAND.colors.green}">{usd(calc.net)} net</Pill>}>

      <div className="fgrid">
        <Field label="Prefill from a listing" full>
          <Sel value={txnId} onChange={e => pick(e.target.value)}
            options={listings.map(t => ({ value: t.id, label: `${t.address || t.id}${t.salePrice ? ` · ${usd(t.salePrice)}` : ''}` }))}>
            <option value="">— type a price instead —</option>
          </Sel>
        </Field>
        <Field label="Property" full><Inp value={f.address} onChange={e => set('address', e.target.value)} placeholder="4412 N Bluff Ridge Ct" /></Field>
        <Field label="Seller name"><Inp value={f.sellerName} onChange={e => set('sellerName', e.target.value)} /></Field>
        <Field label="Estimated closing"><Inp type="date" value={f.closeDate || ''} onChange={e => set('closeDate', e.target.value)} /></Field>
        <Field label="Sale price"><Inp value={f.salePrice} onChange={e => set('salePrice', e.target.value)} inputMode="numeric" placeholder="415000" /></Field>
        <Field label="Commission rate %" hint={txn ? `Prefilled from the transaction (${txn.commissionRate}%).` : 'Total commission the seller pays.'}>
          <Inp value={f.commissionRate} onChange={e => set('commissionRate', e.target.value)} inputMode="decimal" />
        </Field>
        <Field label="Flat commission instead" hint="Any amount here overrides the rate.">
          <Inp value={f.commissionFlat} onChange={e => set('commissionFlat', e.target.value)} inputMode="numeric" />
        </Field>
        <Field label="Loan payoff"><Inp value={f.payoff} onChange={e => set('payoff', e.target.value)} inputMode="numeric" /></Field>
        <Field label="Seller closing costs" hint="Title, escrow, recording, settlement.">
          <Inp value={f.closingCosts} onChange={e => set('closingCosts', e.target.value)} inputMode="numeric" />
        </Field>
        <Field label="Property tax proration"><Inp value={f.taxes} onChange={e => set('taxes', e.target.value)} inputMode="numeric" /></Field>
        <Field label="Buyer concessions / credits"><Inp value={f.concessions} onChange={e => set('concessions', e.target.value)} inputMode="numeric" /></Field>
        <Field label="Other"><Inp value={f.other} onChange={e => set('other', e.target.value)} inputMode="numeric" /></Field>
        <Field label="What is the other line?"><Inp value={f.otherNote} onChange={e => set('otherNote', e.target.value)} placeholder="HOA transfer + home warranty" /></Field>
      </div>

      <SecTitle right={<span style={{ fontSize: 11.5, color: '#8E89A8' }}>computed on this screen, not by the model</span>}>Estimated net sheet</SecTitle>
      <div className="tbl-wrap">
        <table className="tbl sc">
          <thead><tr><th>Line</th><th>What it is</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
          <tbody>
            {calc.rows.map(r => (
              <tr key={r.key}>
                <td style={{ fontWeight: 600 }}>{r.label}</td>
                <td style={{ whiteSpace: 'normal', color: '#7B76A0', fontSize: 12.5, maxWidth: 380 }}>{notes[r.key] || '—'}</td>
                <td style={{ textAlign: 'right', fontFamily: "'Space Grotesk'", fontWeight: 600, color: r.amount < 0 ? '#B03030' : BRAND.colors.ink }}>{signed(r.amount)}</td>
              </tr>
            ))}
            <tr>
              <td style={{ fontWeight: 800, borderTop: '2px solid ${BRAND.colors.ink}' }}>Estimated net to seller</td>
              <td style={{ borderTop: '2px solid ${BRAND.colors.ink}' }} />
              <td style={{ textAlign: 'right', fontWeight: 800, fontSize: 16, fontFamily: "'Space Grotesk'", borderTop: '2px solid ${BRAND.colors.ink}' }}>{usd(calc.net)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="ai-note">
        Total deductions {usd(Math.abs(calc.deductions))} against a sale price of {usd(n(f.salePrice))}.
        Estimates only — the title company issues the settlement statement that governs, and your lender sets the exact payoff figure.
      </div>

      <GenerateRow aiOn={aiOn} busy={busy} onClick={gen} err={err}
        label="Write the notes for the seller"
        note="Adds the plain-language column and a short summary. The numbers do not change." />

      {(summary || Object.keys(notes).length > 0) && (
        <Draft ctx={ctx} label="Summary for the seller" value={summary} rows={6}
          onChange={setSummary} filename={`net-sheet-summary-${slug(f.address)}`} />
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
        <Btn sm onClick={() => copyText(text, ctx.flash)} icon={<Copy size={13} />}>Copy the whole sheet</Btn>
        <Btn sm onClick={() => downloadText(`net-sheet-${slug(f.address || f.sellerName)}.txt`, text)} icon={<Download size={13} />}>Download</Btn>
        {txn && <Btn sm kind="s" onClick={() => saveToTransaction(ctx, txn, `Estimated net sheet — net ${usd(calc.net)}`, text)} icon={<Save size={13} />}>Save to the transaction</Btn>}
      </div>

      <LegalNote>
        Estimates only, and not legal, tax or accounting advice. Figures must be confirmed by the title company on the
        settlement statement; payoff, prorations and fees change up to the day of closing.
      </LegalNote>
    </Card>
  );
}

/* ============================================================================
   3. offer comparison
   ========================================================================== */

const FINANCING = ['Conventional', 'FHA', 'VA', 'USDA', 'Cash', 'Other'];
const CONTINGENCIES = ['Inspection', 'Appraisal', 'Financing', 'Sale of buyer\'s home', 'HOA review', 'Survey', 'None'];

const blankOffer = i => ({
  id: uid(), label: `Offer ${i}`, price: '', financing: 'Conventional', earnest: '',
  concessions: '', repairCredits: '', contingencies: [], closeDate: '', possession: '', appraisalGap: '', notes: '',
});

function offerText(shared, rows, summary, address) {
  const parts = [
    'OFFER COMPARISON',
    address || '',
    '',
    ...rows.map(r => [
      `${r.offer} — ${usd(r.price)}`,
      `  Net proceeds to seller: ${usd(r.netProceeds)}`,
      `  Financing: ${r.financing || '—'} · Earnest: ${usd(r.earnest)}${r.closeDate && isDate(r.closeDate) ? ` · Closes ${fmtLong(r.closeDate)}` : ''}`,
      `  Contingencies: ${r.contingencies.length ? r.contingencies.join(', ') : 'none listed'}`,
      r.credits ? `  Concessions and credits: ${usd(r.credits)}` : '',
      r.terms ? `  Terms: ${r.terms}` : '',
      r.risks ? `  Watch: ${r.risks}` : '',
    ].filter(Boolean).join('\n')),
    '',
    `Shared seller costs applied to every offer: payoff ${usd(shared.payoff)}, closing costs ${usd(shared.closingCosts)}, tax proration ${usd(shared.taxes)}, other ${usd(shared.other)}, commission ${n(shared.commissionRate)}%.`,
    '',
    summary || '',
    '',
    'Net proceeds are estimates computed from the figures entered above, not a settlement statement. Nothing here is legal advice or a property valuation.',
  ];
  return parts.filter(x => x !== '').join('\n');
}

function OfferPanel({ ctx, aiOn, setAiOn }) {
  const listings = useMemo(() => (ctx.transactions || []).filter(t => t.side === 'seller'), [ctx.transactions]);
  const sellers = useMemo(() => (ctx.contacts || []).filter(c => c.side === 'seller' || c.side === 'both'), [ctx.contacts]);

  const [src, setSrc] = useState('');
  const [shared, setShared] = useState({ address: '', commissionRate: 6, payoff: '', closingCosts: '', taxes: '', other: '', priorities: '' });
  const [offers, setOffers] = useState([blankOffer(1), blankOffer(2)]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [summary, setSummary] = useState('');
  const [commentary, setCommentary] = useState({});

  const setS = (k, v) => setShared(prev => ({ ...prev, [k]: v }));
  const setOffer = (id, k, v) => setOffers(list => list.map(o => (o.id === id ? { ...o, [k]: v } : o)));
  const toggleCont = (id, c) => setOffers(list => list.map(o => (o.id === id
    ? { ...o, contingencies: o.contingencies.includes(c) ? o.contingencies.filter(x => x !== c) : [...o.contingencies, c] }
    : o)));

  const txn = src.startsWith('t:') ? listings.find(t => t.id === src.slice(2)) : null;
  const contact = src.startsWith('c:') ? sellers.find(c => c.id === src.slice(2)) : null;

  const pick = v => {
    setSrc(v);
    if (v.startsWith('t:')) {
      const t = listings.find(x => x.id === v.slice(2));
      if (t) setShared(prev => ({ ...prev, address: t.address || '', commissionRate: t.commissionRate == null ? prev.commissionRate : t.commissionRate }));
    } else if (v.startsWith('c:')) {
      const c = sellers.find(x => x.id === v.slice(2));
      if (c) setShared(prev => ({ ...prev, address: c.address || '' }));
    }
  };

  const rowsBase = useMemo(() => offerRows(shared, offers), [shared, offers]);
  const rows = rowsBase.map(r => ({ ...r, terms: (commentary[r.index] && commentary[r.index].terms) || '', risks: (commentary[r.index] && commentary[r.index].risks) || '' }));
  const best = rows.reduce((b, r) => (b == null || r.netProceeds > b ? r.netProceeds : b), null);
  const priced = rows.filter(r => r.price > 0);

  const gen = async () => {
    setBusy(true); setErr('');
    const j = await callAi('offer-comparison', {
      address: shared.address, commissionRate: shared.commissionRate, payoff: shared.payoff,
      closingCosts: shared.closingCosts, taxes: shared.taxes, other: shared.other,
      priorities: shared.priorities,
      offers: offers.map(o => ({
        label: o.label, price: o.price, financing: o.financing, earnest: o.earnest,
        concessions: o.concessions, repairCredits: o.repairCredits, contingencies: o.contingencies,
        closeDate: o.closeDate, possession: o.possession, appraisalGap: o.appraisalGap, notes: o.notes,
      })),
    });
    setBusy(false);
    if (!j.ok) { setErr(reasonText(j)); if (j.reason === 'not_configured') setAiOn(false); return; }
    const map = {};
    (j.commentary || []).forEach(c => { map[c.index] = { terms: c.terms || '', risks: c.risks || '' }; });
    setCommentary(map);
    setSummary(j.summary || '');
  };

  const text = offerText(shared, rows, summary, shared.address);

  return (
    <Card
      sub="Two to four offers on one listing, side by side on what the seller actually nets. Net proceeds are computed here; the model writes the terms and risk columns."
      right={priced.length ? <Pill color="${BRAND.colors.cobalt}">{priced.length} priced</Pill> : null}>

      <div className="fgrid">
        <Field label="Listing" full>
          <Sel value={src} onChange={e => pick(e.target.value)}>
            <option value="">— type the address —</option>
            {listings.length > 0 && <optgroup label="Seller transactions">{listings.map(t => <option key={t.id} value={`t:${t.id}`}>{t.address || t.id}</option>)}</optgroup>}
            {sellers.length > 0 && <optgroup label="Seller contacts">{sellers.map(c => <option key={c.id} value={`c:${c.id}`}>{c.name}</option>)}</optgroup>}
          </Sel>
        </Field>
        <Field label="Property" full><Inp value={shared.address} onChange={e => setS('address', e.target.value)} /></Field>
        <Field label="Commission rate %"><Inp value={shared.commissionRate} onChange={e => setS('commissionRate', e.target.value)} inputMode="decimal" /></Field>
        <Field label="Loan payoff"><Inp value={shared.payoff} onChange={e => setS('payoff', e.target.value)} inputMode="numeric" /></Field>
        <Field label="Seller closing costs"><Inp value={shared.closingCosts} onChange={e => setS('closingCosts', e.target.value)} inputMode="numeric" /></Field>
        <Field label="Tax proration"><Inp value={shared.taxes} onChange={e => setS('taxes', e.target.value)} inputMode="numeric" /></Field>
        <Field label="Other seller costs"><Inp value={shared.other} onChange={e => setS('other', e.target.value)} inputMode="numeric" /></Field>
        <Field label="What matters most to this seller" full hint="Speed, certainty, a rent-back, the highest number — it changes how the offers read.">
          <Inp value={shared.priorities} onChange={e => setS('priorities', e.target.value)} placeholder="Needs to close by the 30th and cannot carry two payments" />
        </Field>
      </div>

      {offers.map((o, i) => (
        <div key={o.id} style={{ border: '1px solid #E8E9F2', borderRadius: 14, padding: 14, marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <b style={{ fontSize: 13.5 }}>{o.label || `Offer ${i + 1}`}</b>
            <Pill color="${BRAND.colors.green}">{usd(rowsBase[i].netProceeds)} net</Pill>
            {offers.length > 2 && (
              <Btn sm kind="d" style={{ marginLeft: 'auto' }} onClick={() => setOffers(list => list.filter(x => x.id !== o.id))} icon={<X size={13} />}>Remove</Btn>
            )}
          </div>
          <div className="fgrid">
            <Field label="Label"><Inp value={o.label} onChange={e => setOffer(o.id, 'label', e.target.value)} placeholder="Ortiz offer" /></Field>
            <Field label="Price"><Inp value={o.price} onChange={e => setOffer(o.id, 'price', e.target.value)} inputMode="numeric" /></Field>
            <Field label="Financing"><Sel value={o.financing} onChange={e => setOffer(o.id, 'financing', e.target.value)} options={FINANCING.map(x => ({ value: x, label: x }))} /></Field>
            <Field label="Earnest money"><Inp value={o.earnest} onChange={e => setOffer(o.id, 'earnest', e.target.value)} inputMode="numeric" /></Field>
            <Field label="Concessions asked"><Inp value={o.concessions} onChange={e => setOffer(o.id, 'concessions', e.target.value)} inputMode="numeric" /></Field>
            <Field label="Repair credits"><Inp value={o.repairCredits} onChange={e => setOffer(o.id, 'repairCredits', e.target.value)} inputMode="numeric" /></Field>
            <Field label="Close date"><Inp type="date" value={o.closeDate} onChange={e => setOffer(o.id, 'closeDate', e.target.value)} /></Field>
            <Field label="Appraisal gap covered"><Inp value={o.appraisalGap} onChange={e => setOffer(o.id, 'appraisalGap', e.target.value)} inputMode="numeric" /></Field>
            <Field label="Possession"><Inp value={o.possession} onChange={e => setOffer(o.id, 'possession', e.target.value)} placeholder="At closing / 3-day rent-back" /></Field>
            <Field label="Anything else worth knowing"><Inp value={o.notes} onChange={e => setOffer(o.id, 'notes', e.target.value)} placeholder="Buyer wrote a letter, agent is out of town Friday" /></Field>
            <Field label="Contingencies" full>
              <div className="chips">
                {CONTINGENCIES.map(c => (
                  <button key={c} type="button" className={'chip' + (o.contingencies.includes(c) ? ' on' : '')} onClick={() => toggleCont(o.id, c)}>{c}</button>
                ))}
              </div>
            </Field>
          </div>
        </div>
      ))}

      <div style={{ marginTop: 12 }}>
        <Btn sm onClick={() => setOffers(list => (list.length >= 4 ? list : [...list, blankOffer(list.length + 1)]))}
          disabled={offers.length >= 4} icon={<Plus size={13} />}>
          {offers.length >= 4 ? 'Four offers is the limit here' : 'Add an offer'}
        </Btn>
      </div>

      <SecTitle right={<span style={{ fontSize: 11.5, color: '#8E89A8' }}>net proceeds computed on this screen</span>}>Side by side</SecTitle>
      {priced.length === 0
        ? <Empty>Put a price on at least one offer and the comparison fills in.</Empty>
        : (
          <div className="tbl-wrap">
            <table className="tbl sc">
              <thead>
                <tr>
                  <th>Offer</th><th style={{ textAlign: 'right' }}>Price</th><th style={{ textAlign: 'right' }}>Net proceeds</th>
                  <th>Terms</th><th>Risks</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td>
                      <b>{r.offer}</b>
                      <div style={{ fontSize: 11.5, color: '#8E89A8' }}>
                        {r.financing || '—'}{r.earnest ? ` · ${usd(r.earnest)} earnest` : ''}{r.closeDate && isDate(r.closeDate) ? ` · ${fmtShort(r.closeDate)}` : ''}
                      </div>
                      {r.contingencies.length > 0 && <div style={{ fontSize: 11.5, color: '#8E89A8' }}>{r.contingencies.join(', ')}</div>}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: "'Space Grotesk'", fontWeight: 600 }}>{usd(r.price)}</td>
                    <td style={{ textAlign: 'right', fontFamily: "'Space Grotesk'", fontWeight: 700, color: r.netProceeds === best && r.price > 0 ? BRAND.colors.green : BRAND.colors.ink }}>
                      {usd(r.netProceeds)}
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#8E89A8' }}>less {usd(Math.abs(r.deductions))}</div>
                    </td>
                    <td style={{ whiteSpace: 'normal', maxWidth: 300, fontSize: 12.5, color: '#56527a' }}>{r.terms || '—'}</td>
                    <td style={{ whiteSpace: 'normal', maxWidth: 300, fontSize: 12.5, color: '#56527a' }}>{r.risks || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      <div className="ai-note">
        Each offer nets price less commission, less the shared seller costs above, less that offer's concessions and credits.
        The highest net proceeds is marked green — it is not advice about which offer to take.
      </div>

      <GenerateRow aiOn={aiOn} busy={busy} disabled={priced.length < 2} onClick={gen} err={err}
        label="Write the terms and risks"
        note={priced.length < 2 ? 'Price at least two offers first.' : 'Plain language for the seller. The numbers do not change.'} />

      {summary && (
        <Draft ctx={ctx} label="Summary for the seller" value={summary} rows={7} onChange={setSummary}
          filename={`offers-${slug(shared.address)}`}
          extra={txn ? <Btn sm kind="s" onClick={() => saveToTransaction(ctx, txn, 'Offer comparison', text)} icon={<Save size={13} />}>Save to the transaction</Btn>
            : contact ? <Btn sm kind="s" onClick={() => saveToContact(ctx, contact, 'note', text, false)} icon={<Save size={13} />}>Save to the contact</Btn> : null} />
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
        <Btn sm onClick={() => copyText(text, ctx.flash)} icon={<Copy size={13} />}>Copy the comparison</Btn>
        <Btn sm onClick={() => downloadText(`offers-${slug(shared.address)}.txt`, text)} icon={<Download size={13} />}>Download</Btn>
      </div>

      <LegalNote>
        Numbers and plain-language descriptions only. Nothing here interprets what a contract requires or permits, and
        nothing here is a valuation — take terms questions to your broker or an attorney.
      </LegalNote>
    </Card>
  );
}

/* ============================================================================
   4. weekly client update
   ========================================================================== */

function WeeklyUpdatePanel({ ctx, aiOn, setAiOn }) {
  const active = useMemo(() => (ctx.transactions || []).filter(t => t.status === 'active'), [ctx.transactions]);
  const [txnId, setTxnId] = useState(active.length === 1 ? active[0].id : '');
  const [side, setSide] = useState('');
  const [extra, setExtra] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [out, setOut] = useState(null);

  const txn = active.find(t => t.id === txnId) || null;
  const contact = txn ? (ctx.contacts || []).find(c => c.id === txn.contact_id) : null;
  const theSide = side || (txn ? txn.side : 'seller');
  const phase = txn ? (phasesOf(ctx.settings).find(p => p.key === txn.phase) || null) : null;

  const items = useMemo(() => (txn ? checklistFor(theSide, ctx.settings) : []), [txn, theSide, ctx.settings]);
  const state = (txn && txn.checklist) || {};
  const done = items.filter(i => state[i.key] && state[i.key].done);
  const open = items.filter(i => !(state[i.key] && state[i.key].done));

  /* the dates it will use, on screen before it is asked to write anything */
  const dates = useMemo(() => {
    if (!txn) return [];
    return (txn.deadlines || [])
      .filter(d => d && d.date)
      .map(d => ({
        key: d.key, label: d.label, date: effectiveDateOf(d), status: d.status || 'open',
        daysAway: daysUntil(effectiveDateOf(d), ctx.tz), u: urgency(d, ctx.tz),
      }))
      .filter(d => d.status !== 'waived')
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [txn, ctx.tz]);

  const upcoming = dates.filter(d => d.status !== 'met');

  const gen = async () => {
    if (!txn) return;
    setBusy(true); setErr('');
    const j = await callAi('weekly-update', {
      clientName: (contact && contact.name) || '', agentName: (ctx.me && ctx.me.name) || '',
      brokerage: BRAND.biz.name, address: txn.address || '', side: theSide,
      audience: theSide === 'buyer' ? 'the buyer' : 'the seller',
      phase: phase ? phase.label : txn.phase, closeDate: txn.closeDate || '',
      effectiveDate: txn.effectiveDate || '', titleCompany: txn.titleCompany || '', lender: txn.lender || '',
      done: done.map(i => i.label), open: open.map(i => i.label),
      dates: dates.map(d => ({ label: d.label, date: fmtLong(d.date), status: d.status, daysAway: d.daysAway })),
      notes: [txn.notes, extra].filter(Boolean).join('\n'),
    });
    setBusy(false);
    if (!j.ok) { setErr(reasonText(j)); if (j.reason === 'not_configured') setAiOn(false); return; }
    setOut({ subject: j.subject || '', body: j.body || '' });
  };

  const full = out ? `Subject: ${out.subject}\n\n${out.body}` : '';

  if (!active.length) {
    return (
      <Card sub="The &ldquo;here is where we are&rdquo; email, drafted from the checklist and the critical dates.">
        <Empty>No active transactions. Once a deal is under contract this drafts the weekly update from its own dates.</Empty>
      </Card>
    );
  }

  return (
    <Card
      sub="Drafted from the checklist state and the critical dates on the transaction — the dates it used are listed below, so you can check them before you send."
      right={txn ? <SideChip side={theSide} /> : null}>

      <div className="fgrid">
        <Field label="Transaction" full>
          <Sel value={txnId} onChange={e => { setTxnId(e.target.value); setSide(''); setOut(null); }}
            options={active.map(t => {
              const c = (ctx.contacts || []).find(x => x.id === t.contact_id);
              return { value: t.id, label: `${t.address || t.id}${c ? ` · ${c.name}` : ''}` };
            })}>
            <option value="">— pick one —</option>
          </Sel>
        </Field>
        {txn && (
          <Field label="Writing to" full>
            <Seg value={theSide} onChange={setSide} options={[{ value: 'seller', label: 'The seller' }, { value: 'buyer', label: 'The buyer' }]} />
          </Field>
        )}
        {txn && (
          <Field label="Anything to add this week" full hint="Goes in as context. It is still a draft you edit.">
            <Txt rows={2} value={extra} onChange={e => setExtra(e.target.value)} placeholder="Appraiser is scheduled Thursday, seller asked about the survey" />
          </Field>
        )}
      </div>

      {txn && (
        <div className="grid2" style={{ marginTop: 6 }}>
          <div>
            <SecTitle>Checklist it read</SecTitle>
            {items.length === 0 ? <Empty>No checklist items configured for this side.</Empty> : (
              <div className="hlist">
                {done.map(i => <div key={i.key} className="hli done"><ChevronRight size={13} /> {i.label} — done</div>)}
                {open.map(i => <div key={i.key} className="hli"><ChevronRight size={13} /> {i.label} — open</div>)}
              </div>
            )}
          </div>
          <div>
            <SecTitle right={<span style={{ fontSize: 11.5, color: '#8E89A8', textTransform: 'none' }}>{upcoming.length} still open</span>}>Dates it used</SecTitle>
            {dates.length === 0 ? <Empty>No critical dates on this transaction yet.</Empty> : (
              <div className="hlist">
                {dates.map(d => (
                  <div key={d.key} className={'hli' + (d.u === 'overdue' ? ' bad' : d.u === 'urgent' ? ' warn' : d.status === 'met' ? ' done' : '')}>
                    <ChevronRight size={13} />
                    <span style={{ flex: 1 }}>{d.label}</span>
                    <b>{fmtLong(d.date)}</b>
                    <span style={{ fontSize: 11 }}>{d.status === 'met' ? 'met' : d.daysAway == null ? '' : d.daysAway < 0 ? `${Math.abs(d.daysAway)}d late` : `${d.daysAway}d`}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <GenerateRow aiOn={aiOn} busy={busy} disabled={!txn} onClick={gen} err={err}
        label="Draft the update"
        note={!txn ? 'Pick a transaction first.' : 'Nothing sends. You edit it and send it yourself.'} />

      {out && (
        <>
          <Draft ctx={ctx} label="Subject" value={out.subject} rows={2} onChange={v => setOut(o => ({ ...o, subject: v }))} filename={`update-subject-${slug(txn.address)}`} />
          <Draft ctx={ctx} label="Body" value={out.body} rows={12} onChange={v => setOut(o => ({ ...o, body: v }))} filename={`update-${slug(txn.address)}`}
            extra={(
              <>
                <Btn sm onClick={() => copyText(full, ctx.flash)} icon={<Copy size={13} />}>Copy with subject</Btn>
                {contact && <Btn sm kind="s" onClick={() => saveToContact(ctx, contact, 'email', `Weekly update draft — ${txn.address || ''}\n${full}`, false)} icon={<Save size={13} />}>Save to {contact.name}</Btn>}
                <Btn sm kind="s" onClick={() => saveToTransaction(ctx, txn, 'Weekly client update draft', full)} icon={<Save size={13} />}>Save to the transaction</Btn>
              </>
            )} />
        </>
      )}

      <LegalNote>
        A status update, not a legal one. It reports dates and checklist state as recorded in the CRM; anything about
        obligations, remedies or what happens if a date is missed goes to your broker or an attorney.
      </LegalNote>
    </Card>
  );
}

/* ============================================================================
   5. database reactivation
   ========================================================================== */

/* a real conversation, not "added to a drip" */
const REAL_KINDS = ['call', 'meeting', 'text', 'email', 'showing', 'appointment', 'feedback', 'visit'];

function lastRealActivity(c) {
  const list = (c.activity || []).filter(a => a && String(a.note || '').trim());
  const sorted = list.slice().sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  return sorted.find(a => REAL_KINDS.includes(String(a.kind || '').toLowerCase())) || sorted[0] || null;
}

function ReactivationPanel({ ctx, aiOn, setAiOn }) {
  const [days, setDays] = useState(90);
  const [pickId, setPickId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [out, setOut] = useState(null);
  const [touch, setTouch] = useState(false);

  const stale = useMemo(() => (ctx.contacts || [])
    .map(c => ({ c, since: c.lastTouch && isDate(c.lastTouch) ? diffDays(c.lastTouch, ctx.todayIso) : null }))
    .filter(x => x.since != null && x.since >= n(days))
    .sort((a, b) => b.since - a.since), [ctx.contacts, ctx.todayIso, days]);

  const chosen = stale.find(x => x.c.id === pickId) || null;
  const last = chosen ? lastRealActivity(chosen.c) : null;

  const gen = async () => {
    if (!chosen) return;
    const c = chosen.c;
    setBusy(true); setErr(''); setOut(null);
    const history = (c.activity || []).filter(a => a && a.note).slice(0, 6).map(a => `${a.at || ''} ${a.kind || 'note'}: ${a.note}`);
    const j = await callAi('reactivation', {
      name: c.name, agentName: (ctx.me && ctx.me.name) || '', side: c.side,
      daysSinceTouch: chosen.since,
      lastAt: last ? last.at : '', lastKind: last ? last.kind : '', lastNote: last ? last.note : '',
      history,
      looking: [c.propertyType, (c.areas || []).join(', '),
        c.priceMin || c.priceMax ? `${usd(c.priceMin)}–${usd(c.priceMax)}` : ''].filter(Boolean).join(' · '),
      timeline: c.timeline || '', closedWithUsOn: c.closedWithUsOn || '', notes: c.notes || '',
    });
    setBusy(false);
    if (!j.ok) { setErr(reasonText(j)); if (j.reason === 'not_configured') setAiOn(false); return; }
    setOut({ subject: j.subject || '', body: j.body || '' });
  };

  const full = out ? `Subject: ${out.subject}\n\n${out.body}` : '';

  return (
    <Card
      sub="Contacts nobody has spoken to in a while, one at a time, each draft written off the last real conversation on the record."
      right={<Pill color={stale.length ? '#D98A3D' : BRAND.colors.green}>{stale.length} over {n(days)} days</Pill>}>

      <div className="fgrid">
        <Field label="Older than (days)" hint="90 by default. Move it to match how you work.">
          <Inp value={days} onChange={e => setDays(Math.max(1, Math.min(3650, Math.round(n(e.target.value)) || 1)))} inputMode="numeric" />
        </Field>
        <Field label="Contact" hint={stale.length ? 'Sorted by the longest silence first.' : ''}>
          <Sel value={pickId} onChange={e => { setPickId(e.target.value); setOut(null); setErr(''); }}
            options={stale.map(x => ({ value: x.c.id, label: `${x.c.name} — ${x.since} days` }))}>
            <option value="">— pick one —</option>
          </Sel>
        </Field>
      </div>

      {stale.length === 0
        ? <Empty>Nothing has gone {n(days)} days without contact. Lower the threshold to look further back.</Empty>
        : (
          <div className="hlist" style={{ marginTop: 10 }}>
            {stale.slice(0, 12).map(x => (
              <div key={x.c.id} className={'hli' + (x.since >= 180 ? ' bad' : x.since >= 120 ? ' warn' : '')}
                style={{ cursor: 'pointer' }} onClick={() => { setPickId(x.c.id); setOut(null); setErr(''); }}>
                <PhoneCall size={13} />
                <span style={{ flex: 1, fontWeight: pickId === x.c.id ? 800 : 600 }}>{x.c.name}</span>
                <SideChip side={x.c.side} />
                <span>{x.since} days</span>
              </div>
            ))}
            {stale.length > 12 && <div className="ai-note">{stale.length - 12} more in the dropdown above.</div>}
          </div>
        )}

      {chosen && (
        <div style={{ marginTop: 14 }}>
          <SecTitle>What it is writing off</SecTitle>
          {last
            ? (
              <div className="cd">
                <div className="cd-top">
                  <span className="cd-name">{String(last.kind || 'note').toUpperCase()} · {chosen.c.name}</span>
                  <span className="cd-date">{isDate(last.at) ? fmtLong(last.at) : (last.at || '—')}</span>
                </div>
                <div className="cd-quote">{last.note}</div>
                <div className="cd-stamp">
                  {chosen.since} days since the last touch
                  {chosen.c.timeline ? ` · timeline was ${chosen.c.timeline}` : ''}
                  {chosen.c.closedWithUsOn && isDate(chosen.c.closedWithUsOn) ? ` · closed with us ${fmtLong(chosen.c.closedWithUsOn)}` : ''}
                </div>
              </div>
            )
            : <Empty>There is no written activity on {chosen.c.name} to reference. Add what you last talked about to their timeline first — a draft with nothing specific in it is a generic touch, which is the thing this panel exists to avoid.</Empty>}
          {chosen.c.email || chosen.c.phone ? (
            <div className="ai-note">{chosen.c.email || ''}{chosen.c.email && chosen.c.phone ? ' · ' : ''}{chosen.c.phone ? phoneFmt(chosen.c.phone) : ''}</div>
          ) : null}
        </div>
      )}

      <GenerateRow aiOn={aiOn} busy={busy} disabled={!chosen || !last} onClick={gen} err={err}
        label="Draft the check-in"
        note={!chosen ? 'Pick a contact first.' : !last ? 'No conversation on file to reference.' : 'One contact at a time, on purpose.'} />

      {out && chosen && (
        <>
          <Draft ctx={ctx} label="Subject" value={out.subject} rows={2} onChange={v => setOut(o => ({ ...o, subject: v }))} filename={`checkin-subject-${slug(chosen.c.name)}`} />
          <Draft ctx={ctx} label="Check-in draft" value={out.body} rows={8} onChange={v => setOut(o => ({ ...o, body: v }))} filename={`checkin-${slug(chosen.c.name)}`}
            extra={(
              <>
                <Btn sm onClick={() => copyText(full, ctx.flash)} icon={<Copy size={13} />}>Copy with subject</Btn>
                <Btn sm kind="s" onClick={() => { saveToContact(ctx, chosen.c, 'email', `Reactivation draft\n${full}`, touch); setOut(null); setPickId(''); }} icon={<Save size={13} />}>
                  Save to {chosen.c.name}
                </Btn>
              </>
            )} />
          <div style={{ marginTop: 10 }}>
            <Toggle on={touch} onChange={setTouch} label="Also count this as a touch today (only tick it if you are sending it now)" />
          </div>
          <div className="ai-note">Saving writes the draft to their timeline. It does not send anything, and it does not move their stage.</div>
        </>
      )}
    </Card>
  );
}

/* ============================================================================
   6. showing feedback digest
   ========================================================================== */

function digestText(contact, address, entries, out) {
  return [
    'SHOWING FEEDBACK — WEEKLY REPORT',
    address || (contact ? contact.address : '') || '',
    `${entries.length} piece${entries.length === 1 ? '' : 's'} of feedback`,
    '',
    out.summary || '',
    '',
    out.themes && out.themes.length ? 'What came up more than once:' : '',
    ...(out.themes || []).map(t => `  · ${t}`),
    '',
    out.recommendation ? `Talking point: ${out.recommendation}` : '',
    '',
    'Feedback as logged:',
    ...entries.map(e => `  ${isDate(e.at) ? fmtShort(e.at) : e.at || '—'}${e.from ? ` · ${e.from}` : ''}: ${e.note}`),
    '',
    'This report repeats what visiting agents and buyers said. It is not a valuation, an appraisal or a CMA.',
  ].filter(x => x !== '').join('\n');
}

function FeedbackPanel({ ctx, aiOn, setAiOn }) {
  const sellers = useMemo(() => (ctx.contacts || []).filter(c => c.side === 'seller' || c.side === 'both'), [ctx.contacts]);
  const [cid, setCid] = useState('');
  const [add, setAdd] = useState({ at: ctx.todayIso, from: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [out, setOut] = useState(null);

  const contact = sellers.find(c => c.id === cid) || null;
  const txn = contact ? (ctx.transactions || []).find(t => t.contact_id === contact.id && t.side === 'seller') : null;
  const entries = useMemo(() => (contact ? (contact.activity || [])
    .filter(a => a && String(a.kind || '').toLowerCase() === 'feedback' && String(a.note || '').trim())
    .map(a => ({ id: a.id, at: a.at, note: a.note }))
    .sort((a, b) => String(b.at || '').localeCompare(String(a.at || ''))) : []), [contact]);

  const counts = useMemo(() => {
    const byContact = {};
    sellers.forEach(c => {
      byContact[c.id] = (c.activity || []).filter(a => a && String(a.kind || '').toLowerCase() === 'feedback').length;
    });
    return byContact;
  }, [sellers]);

  const logFeedback = () => {
    if (!contact) { ctx.flash('Pick the listing first.'); return; }
    const note = [add.from ? `${add.from}:` : '', add.note].filter(Boolean).join(' ').trim();
    if (!note) { ctx.flash('Type the feedback first.'); return; }
    const entry = { id: uid(), at: isDate(add.at) ? add.at : ctx.todayIso, kind: 'feedback', note, by: ctx.me ? ctx.me.id : null };
    ctx.upsertContact({ ...contact, activity: [entry, ...(contact.activity || [])] });
    setAdd({ at: ctx.todayIso, from: '', note: '' });
    ctx.flash('Feedback logged.');
  };

  const gen = async () => {
    if (!contact) return;
    setBusy(true); setErr('');
    const j = await callAi('showing-digest', {
      address: (txn && txn.address) || contact.address || '',
      price: (txn && txn.salePrice) || contact.targetPrice || '',
      weekOf: ctx.todayIso,
      entries: entries.map(e => ({ at: e.at, text: e.note })),
    });
    setBusy(false);
    if (!j.ok) { setErr(reasonText(j)); if (j.reason === 'not_configured') setAiOn(false); return; }
    setOut({ summary: j.summary || '', themes: j.themes || [], recommendation: j.recommendation || '' });
  };

  const report = out ? digestText(contact, (txn && txn.address) || (contact && contact.address), entries, out) : '';

  if (!sellers.length) {
    return (
      <Card sub="Compile the week's showing feedback into a report for the seller.">
        <Empty>No seller contacts yet. Feedback is logged on the seller's timeline, so add the listing's seller first.</Empty>
      </Card>
    );
  }

  return (
    <Card
      sub="Feedback lives on the seller's timeline as feedback entries. Log it as it comes in, compile it once a week."
      right={contact ? <Pill color="${BRAND.colors.cobalt}">{entries.length} logged</Pill> : null}>

      <div className="fgrid">
        <Field label="Listing / seller" full>
          <Sel value={cid} onChange={e => { setCid(e.target.value); setOut(null); setErr(''); }}
            options={sellers.map(c => ({ value: c.id, label: `${c.name}${c.address ? ` · ${c.address.split(',')[0]}` : ''}${counts[c.id] ? ` · ${counts[c.id]} feedback` : ''}` }))}>
            <option value="">— pick one —</option>
          </Sel>
        </Field>
      </div>

      {contact && (
        <>
          <SecTitle>Log a showing</SecTitle>
          <div className="fgrid">
            <Field label="Date"><Inp type="date" value={add.at} onChange={e => setAdd(a => ({ ...a, at: e.target.value }))} /></Field>
            <Field label="Showing agent / source"><Inp value={add.from} onChange={e => setAdd(a => ({ ...a, from: e.target.value }))} placeholder="Renée Colton, Prairie Gate" /></Field>
            <Field label="What they said" full>
              <Txt rows={2} value={add.note} onChange={e => setAdd(a => ({ ...a, note: e.target.value }))}
                placeholder="Buyers loved the yard, thought the kitchen dated for the price. Not writing." />
            </Field>
          </div>
          <div style={{ marginTop: 10 }}>
            <Btn sm kind="s" onClick={logFeedback} icon={<Plus size={13} />}>Log this feedback</Btn>
            <span style={{ fontSize: 12, color: '#8E89A8', marginLeft: 10 }}>Writes one entry to {contact.name}'s timeline.</span>
          </div>

          <SecTitle right={<span style={{ fontSize: 11.5, color: '#8E89A8', textTransform: 'none' }}>most recent first</span>}>Feedback on file</SecTitle>
          {entries.length === 0
            ? <Empty>No feedback logged on this listing yet. Add the first one above — the digest needs at least a couple of showings to find a pattern.</Empty>
            : (
              <div className="hlist">
                {entries.map(e => (
                  <div key={e.id} className="hli">
                    <MessageSquare size={13} />
                    <b style={{ flex: 'none' }}>{isDate(e.at) ? fmtShort(e.at) : (e.at || '—')}</b>
                    <span style={{ flex: 1, whiteSpace: 'normal' }}>{e.note}</span>
                  </div>
                ))}
              </div>
            )}
        </>
      )}

      <GenerateRow aiOn={aiOn} busy={busy} disabled={!contact || entries.length < 2} onClick={gen} err={err}
        label="Compile the weekly report"
        note={!contact ? 'Pick a listing first.' : entries.length < 2 ? 'Two pieces of feedback minimum — one showing is not a pattern.' : 'A recommendation only appears when the feedback actually supports one.'} />

      {out && (
        <>
          <Draft ctx={ctx} label="Summary for the seller" value={out.summary} rows={6}
            onChange={v => setOut(o => ({ ...o, summary: v }))} filename={`feedback-${slug(contact.name)}`} />
          {out.themes.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <SecTitle>Themes</SecTitle>
              <div className="hlist">
                {out.themes.map((t, i) => <div key={i} className="hli"><ChevronRight size={13} /> {t}</div>)}
              </div>
            </div>
          )}
          {out.recommendation
            ? (
              <>
                <Draft ctx={ctx} label="Talking point" value={out.recommendation} rows={4}
                  onChange={v => setOut(o => ({ ...o, recommendation: v }))} filename={`feedback-talking-point-${slug(contact.name)}`}
                  hint="A conversation to have off the feedback. Not a price recommendation, not a CMA, not a valuation." />
              </>
            )
            : <div className="ai-note" style={{ marginTop: 12 }}>No talking point — the feedback does not point the same direction often enough to raise one with the seller yet.</div>}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
            <Btn sm onClick={() => copyText(report, ctx.flash)} icon={<Copy size={13} />}>Copy the report</Btn>
            <Btn sm onClick={() => downloadText(`feedback-${slug(contact.name)}.txt`, report)} icon={<Download size={13} />}>Download</Btn>
            <Btn sm kind="s" onClick={() => saveToContact(ctx, contact, 'note', report, false)} icon={<Save size={13} />}>Save to {contact.name}</Btn>
            {txn && <Btn sm kind="s" onClick={() => saveToTransaction(ctx, txn, 'Showing feedback report', report)} icon={<Save size={13} />}>Save to the transaction</Btn>}
          </div>

          <LegalNote>
            This report repeats what visiting agents and buyers said, and nothing more. It is not an appraisal, a CMA or
            an opinion of value, and it must not be presented to a seller as one.
          </LegalNote>
        </>
      )}
    </Card>
  );
}

/* ============================================================================
   the view
   ========================================================================== */

/* ---------------------------------------------------------------- readiness
   Whether a tool has anything to work on is read off ctx, not guessed. Each
   entry answers two questions on the card: what it needs before it can run,
   and what is actually on the board right now. A tool with nothing to work on
   is muted but never hidden — the panel is where you learn what to do next. */

const plural = (count, one, many) => `${count} ${count === 1 ? one : (many || `${one}s`)}`;
const FEEDBACK_KIND = a => a && String(a.kind || '').toLowerCase() === 'feedback' && String(a.note || '').trim();

function boardState(ctx) {
  const contacts = ctx.contacts || [];
  const txns = ctx.transactions || [];
  const sellers = contacts.filter(c => c.side === 'seller' || c.side === 'both');
  const listings = txns.filter(t => t.side === 'seller' && t.status !== 'fell');
  const pricedListings = listings.filter(t => n(t.salePrice) > 0);
  const active = txns.filter(t => t.status === 'active');
  const quiet = contacts.filter(c => c.lastTouch && isDate(c.lastTouch) && diffDays(c.lastTouch, ctx.todayIso) >= 90);
  const feedback = sellers.reduce((s, c) => s + (c.activity || []).filter(FEEDBACK_KIND).length, 0);
  const feedbackReady = sellers.filter(c => (c.activity || []).filter(FEEDBACK_KIND).length >= 2).length;
  return { sellers, listings, pricedListings, active, quiet, feedback, feedbackReady };
}

const TOOLS = [
  {
    key: 'listing',
    label: 'Listing description',
    icon: Home,
    accent: BRAND.colors.cobalt,
    what: 'Writes the MLS description, three social captions and an email blast from the property details you enter.',
    needs: 'Needs a listing contact',
    state: b => (b.sellers.length + b.listings.length > 0
      ? { ok: true, line: `${plural(b.sellers.length, 'seller')} and ${plural(b.listings.length, 'listing')} to prefill from` }
      : { ok: false, line: 'nothing seller-side on your board yet' }),
    Panel: ListingPanel,
  },
  {
    key: 'netsheet',
    label: 'Seller net sheet',
    icon: Calculator,
    accent: BRAND.colors.green,
    what: 'Shows the seller what they walk away with — price less payoff, commission, closing costs and credits, line by line.',
    needs: 'Needs a sale price',
    state: b => (b.pricedListings.length > 0
      ? { ok: true, line: `${plural(b.pricedListings.length, 'listing')} with a price to pull in` }
      : b.listings.length > 0
        ? { ok: false, line: `${plural(b.listings.length, 'listing')} on file, none priced yet` }
        : { ok: false, line: 'no listings on your board yet' }),
    Panel: NetSheetPanel,
  },
  {
    key: 'offers',
    label: 'Offer comparison',
    icon: Scale,
    accent: BRAND.colors.gold,
    what: 'Puts two to four offers side by side on what the seller actually nets, with the terms and the risks spelled out.',
    needs: 'Needs at least 2 offers on one listing',
    state: b => (b.listings.length > 0
      ? { ok: true, line: `${plural(b.listings.length, 'listing')} you can run offers against` }
      : { ok: false, line: 'no listings on your board yet' }),
    Panel: OfferPanel,
  },
  {
    key: 'update',
    label: 'Weekly client update',
    icon: Mail,
    accent: '#6D4AC9',
    what: 'Drafts the "here is where we are" email off the checklist and the critical dates already on the transaction.',
    needs: 'Needs a transaction under contract',
    state: b => (b.active.length > 0
      ? { ok: true, line: `${plural(b.active.length, 'transaction')} under contract` }
      : { ok: false, line: 'nothing under contract right now' }),
    Panel: WeeklyUpdatePanel,
  },
  {
    key: 'reactivation',
    label: 'Database reactivation',
    icon: PhoneCall,
    accent: '#D98A3D',
    what: 'Writes one check-in to one quiet contact, built off the last real conversation on their timeline.',
    needs: 'Needs a contact who has gone quiet',
    state: b => (b.quiet.length > 0
      ? { ok: true, line: `${plural(b.quiet.length, 'contact')} past 90 days` }
      : { ok: false, line: 'everyone has been touched inside 90 days' }),
    Panel: ReactivationPanel,
  },
  {
    key: 'feedback',
    label: 'Showing feedback digest',
    icon: MessageSquare,
    accent: '#0E8F9E',
    what: 'Collects the week of showing feedback into one report for the seller, with the themes that came up twice.',
    needs: 'Needs feedback logged on a listing',
    state: b => (b.feedback > 0
      ? { ok: true, line: `${plural(b.feedback, 'piece', 'pieces')} logged across ${plural(b.feedbackReady, 'listing')} ready to compile` }
      : { ok: false, line: 'no showing feedback logged yet' }),
    Panel: FeedbackPanel,
  },
];

export default function Tools({ ctx }) {
  /* null = not asked yet, true = key present, false = no key. The probe costs
     nothing: /api/ai answers job:'probe' without calling a model. */
  const [aiOn, setAiOn] = useState(null);

  /* '' = the launcher. Deep links (ctx.go('tools',{tool:'netsheet'})) open one. */
  const [open, setOpen] = useState(() => {
    const k = ctx && ctx.params && ctx.params.tool;
    return TOOLS.some(t => t.key === k) ? k : '';
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      const j = await callAi('probe', {});
      if (alive) setAiOn(!!(j && j.ok));
    })();
    return () => { alive = false; };
  }, []);

  const board = useMemo(() => boardState(ctx), [ctx.contacts, ctx.transactions, ctx.todayIso]);

  const show = key => {
    setOpen(key);
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch { /* scrolling is a courtesy */ }
  };

  const tool = TOOLS.find(t => t.key === open) || null;

  return (
    <div>
      <style>{TOOLS_CSS}</style>

      <div className="tl-pledge">
        <span className="tl-pl"><Sparkles size={14} /><span><b>Everything here is a draft.</b> You edit it.</span></span>
        <span className="tl-pl"><ShieldCheck size={14} /><span>Nothing sends, and nothing reaches a record until you press Save.</span></span>
        <span className="tl-pl"><Calculator size={14} /><span>Money is computed on this screen, not by the model.</span></span>
      </div>

      {aiOn === false && <div className="ai-banner ai-off"><ShieldOff size={14} /> {AI_OFF}</div>}
      {aiOn === null && <div className="ai-banner ai-reading"><Loader2 size={14} className="spin" /> Checking whether AI is configured on this deployment…</div>}

      {!tool ? (
        <>
          <div className="tl-lead">
            <h2>Six tools</h2>
            <span>Pick one. It opens on its own, with the records it needs already to hand.</span>
          </div>

          <div className="tl-grid">
            {TOOLS.map(t => {
              const I = t.icon;
              const s = t.state(board);
              return (
                <button key={t.key} type="button" className={'tl-card' + (s.ok ? '' : ' tl-dim')}
                  style={{ '--tl-a': t.accent }} onClick={() => show(t.key)}>
                  <ChevronRight size={17} className="tl-go" />
                  <span className="tl-ic"><I size={21} /></span>
                  <span className="tl-name">{t.label}</span>
                  <span className="tl-what">{t.what}</span>
                  <span className="tl-need"><i /><span><em>{t.needs}</em> — {s.line}</span></span>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <div className="tl-ws-top">
            <button type="button" className="tl-back" onClick={() => show('')}><ChevronLeft size={15} /> All tools</button>
            <div className="tl-switch">
              {TOOLS.filter(t => t.key !== tool.key).map(t => {
                const I = t.icon;
                return (
                  <button key={t.key} type="button" className="tl-sw" style={{ '--tl-a': t.accent }}
                    onClick={() => show(t.key)} title={t.what}><I size={13} /> {t.label}</button>
                );
              })}
            </div>
          </div>

          <div className="tl-head" style={{ '--tl-a': tool.accent }}>
            <span className="tl-head-ic">{React.createElement(tool.icon, { size: 22 })}</span>
            <div className="tl-head-t">
              <h2>{tool.label}</h2>
              <p>{tool.what}</p>
            </div>
            <div className="tl-head-r">
              {(() => { const s = tool.state(board); return <Pill color={s.ok ? tool.accent : undefined}>{s.line}</Pill>; })()}
            </div>
          </div>

          {React.createElement(tool.Panel, { ctx, aiOn, setAiOn })}
        </>
      )}

      <div className="tl-model">
        <Info size={13} />
        <span>
          Client-facing drafts run on Claude Sonnet; the feedback digest and the reactivation drafts run on Claude Haiku.
          The API key lives only in the serverless route — no browser on this deployment can see it.
        </span>
      </div>
    </div>
  );
}
