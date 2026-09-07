/* ============================================================================
   Books.jsx — build brief §7.

   PER-AGENT EXPENSE PRIVACY IS THE WHOLE POINT OF THIS SCREEN.

   ctx.expenses only ever contains the signed-in seat's own rows. That includes
   the team leader, who deliberately cannot see an agent's individual expenses —
   it is enforced by the row-level policies in the database, not by this file
   (docs/VIEW-CONTRACT.md). So nothing here filters by user_id: there is nothing
   to filter. The screen says so out loud, because an agent will not log a real
   expense until they believe it.

   Everything a different brokerage would change is a setting:
   `settings.books.categories` and `settings.books.mileageRate` (the IRS rate is
   a SETTING, not a constant — the team leader keeps it current in Settings).

   AI receipt scanning renders a DRAFT the agent edits and saves. It never
   auto-saves, and a failed or malformed response degrades to typing it in.
   ========================================================================== */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart, Bar, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  AlertTriangle, Car, Download, Eye, FileText, Loader2, Lock, Paperclip,
  Pencil, Plus, Printer, Receipt, ScanLine, Trash2, X,
} from 'lucide-react';

import { fmtLong, fmtShort, isDate } from '../lib/dates';
import { sum, uid, uniq, usd, usdc } from '../lib/format';
import {
  Btn, Card, Empty, ErrorNote, Field, Inp, Kpi, ModalShell, Pill, SecTitle,
  Sel, Tag, Txt,
} from '../components/ui';
import { apiPost } from '../lib/data';
import { BRAND } from '../lib/brand';

/* ------------------------------------------------------------- constants --- */

const MILEAGE = 'Mileage';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PALETTE = [BRAND.colors.cobalt, BRAND.colors.indigo, BRAND.colors.gold, BRAND.colors.green, '#2BA7A0', '#7A5CC8',
  '#D98A3D', '#6B73C9', '#B0606A', '#5C76EE', '#928DAD', BRAND.colors.red];

/* the one bit of arithmetic this screen owns, and it is the brief's own formula:
   miles x the rate held in settings. Rounded to cents. */
const mileageAmount = (miles, rate) => Math.round((Number(miles) || 0) * (Number(rate) || 0) * 100) / 100;

const slug = s => String(s || 'agent').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'agent';
const yearOf = e => String(e && e.spentOn || '').slice(0, 4);
const monthOf = e => String(e && e.spentOn || '').slice(5, 7);

/* ------------------------------------------------------------------ view --- */

export default function Books({ ctx }) {
  const { expenses, settings, me, isLeader, todayIso, flash } = ctx;
  const books = (settings && settings.books) || {};
  const cats = useMemo(() => (books.categories && books.categories.length ? books.categories : [MILEAGE, 'Other']), [books.categories]);
  const rate = Number(books.mileageRate) || 0;

  const rows = useMemo(
    () => (expenses || []).slice().sort((a, b) => String(b.spentOn || '').localeCompare(String(a.spentOn || ''))),
    [expenses],
  );

  const curYear = String(todayIso || '').slice(0, 4);
  const years = useMemo(
    () => uniq([curYear, ...rows.map(yearOf).filter(y => /^\d{4}$/.test(y))]).sort().reverse(),
    [rows, curYear],
  );
  const [year, setYear] = useState(curYear);
  const [cat, setCat] = useState('all');
  const [month, setMonth] = useState('all');
  const [editing, setEditing] = useState(null);
  const [showPrint, setShowPrint] = useState(false);

  const inYear = useMemo(() => rows.filter(e => yearOf(e) === year), [rows, year]);
  const inMonth = useMemo(() => (month === 'all' ? inYear : inYear.filter(e => monthOf(e) === month)), [inYear, month]);
  const shown = useMemo(() => (cat === 'all' ? inMonth : inMonth.filter(e => e.category === cat)), [inMonth, cat]);

  /* totals by category for the chart + the summary, on the year+month window */
  const byCat = useMemo(() => {
    const map = {};
    inMonth.forEach(e => {
      const k = e.category || 'Other';
      if (!map[k]) map[k] = { name: k, total: 0, count: 0, miles: 0 };
      map[k].total += Number(e.amount) || 0;
      map[k].count += 1;
      map[k].miles += Number(e.miles) || 0;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [inMonth]);

  /* the accountant's view is always the whole tax year, never the screen filters */
  const byCatYear = useMemo(() => {
    const map = {};
    inYear.forEach(e => {
      const k = e.category || 'Other';
      if (!map[k]) map[k] = { name: k, total: 0, count: 0, miles: 0 };
      map[k].total += Number(e.amount) || 0;
      map[k].count += 1;
      map[k].miles += Number(e.miles) || 0;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [inYear]);

  const yearTotal = sum(inYear, e => e.amount);
  const windowTotal = sum(inMonth, e => e.amount);
  const mileageRows = inYear.filter(e => e.category === MILEAGE);
  const yearMiles = sum(mileageRows, e => e.miles);
  const withReceipts = inYear.filter(e => e.receiptPath).length;
  const monthsPresent = useMemo(() => uniq(inYear.map(monthOf).filter(m => /^\d{2}$/.test(m))).sort(), [inYear]);

  /* ---- printing: render the clean block first, then hand it to the browser */
  useEffect(() => {
    if (!showPrint) return undefined;
    const t = setTimeout(() => { try { window.print(); } catch { /* no print in this environment */ } }, 120);
    return () => clearTimeout(t);
  }, [showPrint]);

  /* ---- year-end CSV, built here so no server sees an expense line --------- */
  function exportCsv() {
    const esc = v => {
      const s = String(v == null ? '' : v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const line = arr => arr.map(esc).join(',');
    const out = [
      line(['Expense summary for tax preparation']),
      line(['Agent', (me && me.name) || '']),
      line(['Tax year', year]),
      line(['Prepared', todayIso]),
      line(['Rows', inYear.length]),
      '',
      line(['Category', 'Count', 'Total']),
      ...byCatYear.map(c => line([c.name, c.count, c.total.toFixed(2)])),
      line(['TOTAL', inYear.length, Number(yearTotal).toFixed(2)]),
      '',
      line(['Mileage detail']),
      line(['Total miles', yearMiles]),
      line(['Rate per mile used', rate]),
      line(['Mileage claimed', Number(sum(mileageRows, e => e.amount)).toFixed(2)]),
      '',
      line(['Line items']),
      line(['Date', 'Category', 'Amount', 'Miles', 'Note', 'Receipt on file']),
      ...inYear.slice().sort((a, b) => String(a.spentOn).localeCompare(String(b.spentOn))).map(e => line([
        e.spentOn, e.category || '', (Number(e.amount) || 0).toFixed(2),
        e.miles || '', e.note || '', e.receiptPath ? 'yes' : 'no',
      ])),
      '',
      line(['This is a categorised summary of expenses entered by the agent. It is not tax advice.']),
    ].join('\n');

    try {
      const url = URL.createObjectURL(new Blob([out], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `expenses-${year}-${slug(me && me.name)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => { try { URL.revokeObjectURL(url); } catch { /* already gone */ } }, 2000);
      flash(`${inYear.length} row${inYear.length === 1 ? '' : 's'} exported for ${year}.`);
    } catch (e) {
      flash('That download did not start. Try again, or use the printable summary.');
    }
  }

  async function openReceipt(e) {
    if (!e.receiptPath) return;
    try {
      const url = await ctx.db.receiptUrl(e.receiptPath);
      if (!url) { flash('No file behind that receipt in the demo — upload one and it will open.'); return; }
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      flash('That receipt would not open: ' + (err && err.message ? err.message : 'unknown error'));
    }
  }

  async function removeExpense(e) {
    const ok = typeof window !== 'undefined' && window.confirm
      ? window.confirm(`Delete ${e.category || 'this expense'} for ${usdc(e.amount)} on ${e.spentOn}?${e.receiptPath ? ' The receipt file goes with it.' : ''}`)
      : true;
    if (!ok) return;
    if (e.receiptPath) {
      try { await ctx.db.removeReceipt(e.receiptPath); }
      catch { flash('The receipt file would not delete — removing the row anyway.'); }
    }
    await ctx.deleteExpense(e.id);
    flash('Expense deleted.');
  }

  /* a fresh row defaults to a spending category, not Mileage — Mileage happens
     to be first in the settings list and has its own button */
  const blank = () => ({
    id: uid(), user_id: me && me.id, spentOn: todayIso, amount: '',
    category: cats.find(c => c !== MILEAGE) || cats[0],
    note: '', miles: '', receiptPath: null, source: 'manual',
  });

  return (
    <>
      {/* ------------------------------------------------- the privacy note --- */}
      <div className="seat-note" style={{ marginBottom: 16 }}>
        <Lock size={15} />
        <span>
          {isLeader
            ? <><b>These are your own brokerage and team-level expenses only.</b> Your agents’ individual expense rows
                are not here and never will be — the database refuses to hand them over, deliberately. Each agent keeps
                their own books and exports their own year-end summary.</>
            : <><b>Your expenses are yours.</b> Nobody else on the team can see these rows, including the team leader —
                this is enforced by the database, not by this screen.</>}
        </span>
      </div>

      {/* -------------------------------------------------------- filters ---
          Categories are a dropdown rather than a row of chips: a brokerage that
          adds its own categories would otherwise wrap the filter bar onto three
          lines before you got to the year picker. Defaults to every category.
          The count beside each name is that category's rows in the current
          year+month window, so picking one is an informed choice. */}
      <div className="bk-filters">
        <div className="bk-catpick">
          <label htmlFor="bk-cat">Category</label>
          <Sel id="bk-cat" value={cat} onChange={ev => setCat(ev.target.value)}
            options={[
              { value: 'all', label: `All categories (${inMonth.length})` },
              ...cats.map(c => {
                const n = inMonth.filter(e => (e.category || 'Other') === c).length;
                return { value: c, label: n ? `${c} (${n})` : c };
              }),
            ]} />
        </div>
        {cat !== 'all' && (
          <button className="bk-chip on" onClick={() => setCat('all')} title="Back to every category">
            {cat === MILEAGE ? <Car size={12} style={{ verticalAlign: -2, marginRight: 4 }} /> : null}{cat} ✕
          </button>
        )}
        <div className="bk-yr">
          <Sel value={month} onChange={ev => setMonth(ev.target.value)}
            options={[{ value: 'all', label: 'All months' },
              ...monthsPresent.map(m => ({ value: m, label: MONTHS[+m - 1] || m }))]} />
          <Sel value={year} onChange={ev => setYear(ev.target.value)} options={years} />
        </div>
      </div>

      {/* ---------------------------------------------------------- kpis --- */}
      <div className="grid3" style={{ marginBottom: 18 }}>
        <Kpi label={`Spent in ${year}`} value={usd(yearTotal)} variant="accent"
          d={`${inYear.length} row${inYear.length === 1 ? '' : 's'} on your books`} icon={<Receipt size={13} />} />
        <Kpi label="Mileage claimed" value={usd(sum(mileageRows, e => e.amount))}
          d={`${yearMiles.toLocaleString()} miles at ${usdc(rate)}/mile`} icon={<Car size={13} />} />
        <Kpi label="Receipts on file" value={`${withReceipts} of ${inYear.length}`}
          d={withReceipts < inYear.length ? 'the rest are unsupported if you are audited' : 'every row has a file'} />
        <Kpi label={month === 'all' ? 'Biggest category' : `${MONTHS[+month - 1] || month} ${year}`}
          value={month === 'all' ? (byCat[0] ? usd(byCat[0].total) : usd(0)) : usd(windowTotal)}
          d={month === 'all' ? (byCat[0] ? byCat[0].name : 'nothing logged yet') : `${inMonth.length} rows`} />
      </div>

      {/* --------------------------------------------------------- actions --- */}
      <div className="bk-actions" style={{ marginBottom: 16 }}>
        <Btn kind="p" icon={<Plus size={14} />} onClick={() => setEditing(blank())}>Add an expense</Btn>
        <Btn kind="s" icon={<Car size={14} />} onClick={() => setEditing({ ...blank(), category: MILEAGE })}>Log mileage</Btn>
        <Btn kind="s" icon={<ScanLine size={14} />} onClick={() => setEditing({ ...blank(), scanHint: true })}>Scan a receipt</Btn>
        <span style={{ flex: 1 }} />
        <Btn kind="g" icon={<Download size={14} />} onClick={exportCsv}>Export {year} for my accountant</Btn>
        <Btn kind="g" icon={<Printer size={14} />} onClick={() => setShowPrint(s => !s)}>
          {showPrint ? 'Hide printable summary' : 'Printable summary'}
        </Btn>
      </div>

      {/* ------------------------------------------------- printable block ---
          #invprint is the design system's print target: the existing @media
          print rule in styles.js hides everything else on the page, so only
          this block reaches the paper. Nothing new needed in the stylesheet. */}
      {showPrint && (
        <div style={{ marginBottom: 18 }}>
          <div className="bk-actions" style={{ marginBottom: 8 }}>
            <Btn kind="s" sm icon={<Printer size={13} />} onClick={() => { try { window.print(); } catch { flash('Your browser would not open the print dialog.'); } }}>
              Print this
            </Btn>
            <Btn kind="g" sm icon={<X size={13} />} onClick={() => setShowPrint(false)}>Close</Btn>
            <span style={{ fontSize: 12.5, color: '#8E89A8' }}>
              Only the block below prints — the whole tax year, whatever the filters say.
            </span>
          </div>
          <div id="invprint">
            <Card
              title={`Expense summary — ${(me && me.name) || 'agent'} — ${year}`}
              sub={`Prepared ${fmtLong(todayIso)}. A categorised summary of what this agent entered, for their accountant. It is a record of expenses, not tax advice.`}
              className="bookc">
              <table className="ex-tbl">
                <thead><tr><th>Category</th><th>Rows</th><th>Total</th></tr></thead>
                <tbody>
                  {byCatYear.length === 0 && <tr><td colSpan={3}>Nothing logged for {year}.</td></tr>}
                  {byCatYear.map(c => (
                    <tr key={c.name}>
                      <td>{c.name}{c.name === MILEAGE && c.miles ? ` — ${c.miles.toLocaleString()} miles at ${usdc(rate)} per mile` : ''}</td>
                      <td>{c.count}</td>
                      <td>{usdc(c.total)}</td>
                    </tr>
                  ))}
                  <tr><td><b>Total {year}</b></td><td><b>{inYear.length}</b></td><td><b>{usdc(yearTotal)}</b></td></tr>
                </tbody>
              </table>

              <div className="sec-title" style={{ marginTop: 20 }}>Line items</div>
              <table className="ex-tbl">
                <thead><tr><th>Date</th><th>Category</th><th>Amount</th><th>Miles</th><th>Note</th><th>Receipt</th></tr></thead>
                <tbody>
                  {inYear.length === 0 && <tr><td colSpan={6}>No rows for {year}.</td></tr>}
                  {inYear.slice().sort((a, b) => String(a.spentOn).localeCompare(String(b.spentOn))).map(e => (
                    <tr key={e.id}>
                      <td>{e.spentOn}</td>
                      <td>{e.category || 'Other'}</td>
                      <td>{usdc(e.amount)}</td>
                      <td>{e.miles ? Number(e.miles).toLocaleString() : ''}</td>
                      <td style={{ whiteSpace: 'normal' }}>{e.note || ''}</td>
                      <td>{e.receiptPath ? 'on file' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="legal-note">
                Mileage is claimed at {usdc(rate)} per mile, the rate held in this install's settings for {year}.
                Confirm the rate and the treatment of every line with your accountant.
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------- chart --- */}
      <div className="grid2" style={{ marginBottom: 18 }}>
        <Card title="Where the money went"
          sub={month === 'all' ? `Totals by category, ${year}.` : `Totals by category, ${MONTHS[+month - 1] || month} ${year}.`}>
          {byCat.length === 0 ? (
            <Empty>Nothing logged for this window yet. Add an expense and the categories build themselves.</Empty>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(180, byCat.length * 34)}>
              <BarChart data={byCat} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 4 }}>
                <XAxis type="number" tickFormatter={usd} tick={{ fontSize: 11, fill: '#8E89A8' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={132} tick={{ fontSize: 11.5, fill: '#56527a' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={v => usdc(v)} labelStyle={{ fontWeight: 700 }} />
                <Bar dataKey="total" radius={[0, 6, 6, 0]} barSize={16}>
                  {byCat.map((c, i) => <Cell key={c.name} fill={PALETTE[i % PALETTE.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title="Mileage" sub="Usually the largest single deduction a realtor has, and the easiest one to lose by not writing it down."
          right={<Tag>{usdc(rate)} / mile</Tag>}>
          <div className="cmsn-box">
            <div className="cmsn-row"><span>Miles logged in {year}</span><b>{yearMiles.toLocaleString()}</b></div>
            <div className="cmsn-row"><span>Rate in Settings</span><b>{usdc(rate)} per mile</b></div>
            <div className="cmsn-row"><span>Trips logged</span><b>{mileageRows.length}</b></div>
            <div className="cmsn-row big"><span>Claimed</span><b>{usdc(sum(mileageRows, e => e.amount))}</b></div>
          </div>
          <div className="wf-note">
            The rate is a setting, not a number baked into this app.{' '}
            {isLeader ? 'You keep it current in Settings when the IRS publishes a new one.'
              : 'Your team leader keeps it current in Settings when the IRS publishes a new one.'}{' '}
            Each entry stores the miles you drove, so a rate change never rewrites what you already claimed.
          </div>
          <div className="bk-actions" style={{ marginTop: 12 }}>
            <Btn kind="s" sm icon={<Car size={13} />} onClick={() => setEditing({ ...blank(), category: MILEAGE })}>
              Log a trip
            </Btn>
          </div>
        </Card>
      </div>

      {/* ------------------------------------------------------------ rows --- */}
      <SecTitle right={<span style={{ fontSize: 12, color: '#8E89A8', textTransform: 'none', letterSpacing: 0 }}>
        {shown.length} row{shown.length === 1 ? '' : 's'} · {usdc(sum(shown, e => e.amount))}</span>}>
        {cat === 'all' ? 'Expenses' : cat}{month === 'all' ? '' : ` · ${MONTHS[+month - 1] || month}`} · {year}
      </SecTitle>

      {shown.length === 0 ? (
        <Card>
          <Empty>
            Nothing here yet{cat === 'all' ? '' : ` in ${cat}`}. Add an expense, log a trip, or scan a receipt — every
            row you keep is a dollar your accountant can actually use.
          </Empty>
        </Card>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Date</th><th>Category</th><th>Amount</th><th>Miles</th><th>Note</th><th>Receipt</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map(e => (
                <tr key={e.id}>
                  <td>{fmtShort(e.spentOn)} <span style={{ color: '#A6A2BC' }}>{String(e.spentOn || '').slice(0, 4)}</span></td>
                  <td>
                    {e.category === MILEAGE ? <Car size={12} style={{ verticalAlign: -2, marginRight: 5, color: '#8E89A8' }} /> : null}
                    {e.category || 'Other'}
                    {e.source === 'ai-receipt' ? <> <Tag>scanned</Tag></> : null}
                  </td>
                  <td><b>{usdc(e.amount)}</b></td>
                  <td>{e.miles ? `${Number(e.miles).toLocaleString()} mi` : '—'}</td>
                  <td style={{ whiteSpace: 'normal', maxWidth: 320 }}>{e.note || '—'}</td>
                  <td>
                    {e.receiptPath
                      ? <Btn kind="g" sm icon={<Eye size={12} />} onClick={() => openReceipt(e)}>View</Btn>
                      : <span style={{ color: '#C9C6DC' }}>none</span>}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button className="ex-del" title="Edit" onClick={() => setEditing({ ...e, amount: e.amount, miles: e.miles || '' })}>
                        <Pencil size={14} />
                      </button>
                      <button className="ex-del" title="Delete" onClick={() => removeExpense(e)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <ExpenseModal ctx={ctx} initial={editing} cats={cats} rate={rate} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

/* ------------------------------------------------------- add / edit form --- */

function ExpenseModal({ ctx, initial, cats, rate, onClose }) {
  const [e, setE] = useState(initial);
  const [file, setFile] = useState(null);
  const [dataUrl, setDataUrl] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanErr, setScanErr] = useState('');
  const [scanned, setScanned] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const pick = useRef(null);
  const isNew = !(ctx.expenses || []).some(x => x.id === initial.id);
  const isMileage = e.category === MILEAGE;
  const amount = isMileage ? mileageAmount(e.miles, rate) : Number(e.amount) || 0;

  const set = (k, v) => setE(p => ({ ...p, [k]: v }));

  function onFile(f) {
    setScanErr('');
    setFile(f || null);
    setDataUrl('');
    if (f && String(f.type || '').startsWith('image/')) {
      const rd = new FileReader();
      rd.onload = () => setDataUrl(String(rd.result || ''));
      rd.onerror = () => setScanErr('That image could not be read off your device.');
      rd.readAsDataURL(f);
    }
  }

  /* ---- AI receipt scan: a DRAFT, never a save --------------------------- */
  async function scan() {
    if (!dataUrl) { setScanErr('Choose a photo or screenshot of the receipt first — a PDF cannot be scanned here.'); return; }
    setScanning(true);
    setScanErr('');
    try {
      const res = await apiPost('/api/parse-receipt', { image: dataUrl });
      if (!res.ok) throw new Error(`the scanner answered ${res.status}`);
      let json = null;
      try { json = await res.json(); }
      catch { throw new Error('the scanner sent something this screen could not read'); }
      const d = (json && (json.expense || json.result || json.data || json)) || {};

      const amt = Number(d.amount != null ? d.amount : d.total);
      const rawDate = [d.date, d.spentOn, d.transactionDate].map(x => String(x || '').slice(0, 10)).find(isDate);
      const vendor = String(d.vendor || d.merchant || d.payee || '').trim();
      const guess = String(d.category || d.suggestedCategory || '').trim().toLowerCase();
      const matched = cats.find(c => c.toLowerCase() === guess)
        || cats.find(c => guess && c.toLowerCase().includes(guess));

      let filled = 0;
      setE(p => {
        const next = { ...p, source: 'ai-receipt' };
        if (Number.isFinite(amt) && amt > 0) { next.amount = String(amt); filled++; }
        if (rawDate) { next.spentOn = rawDate; filled++; }
        if (matched && matched !== MILEAGE) { next.category = matched; filled++; }
        if (vendor) { next.note = p.note ? `${vendor} — ${p.note}` : vendor; filled++; }
        return next;
      });
      if (!filled) throw new Error('nothing usable came back');
      setScanned(true);
    } catch (ex) {
      setScanErr(`Extraction failed — ${ex && ex.message ? ex.message : 'unknown error'}. Type the amount, date and category in yourself; the receipt still attaches.`);
    }
    setScanning(false);
  }

  async function save() {
    setErr('');
    if (!isDate(e.spentOn)) { setErr('Pick the date you spent it.'); return; }
    if (isMileage && !(Number(e.miles) > 0)) { setErr('Enter the miles you drove.'); return; }
    if (!isMileage && !(amount > 0)) { setErr('Enter an amount greater than zero.'); return; }
    setSaving(true);

    let receiptPath = e.receiptPath || null;
    if (file) {
      try {
        const path = `${ctx.me.id}/${uid()}-${file.name}`;
        const stored = await ctx.db.uploadReceipt(path, file);
        if (initial.receiptPath && initial.receiptPath !== stored) {
          try { await ctx.db.removeReceipt(initial.receiptPath); } catch { /* orphan, not fatal */ }
        }
        receiptPath = stored || path;
      } catch (ex) {
        setSaving(false);
        setErr(`The receipt would not upload (${ex && ex.message ? ex.message : 'unknown error'}). Nothing was saved — try again, or clear the file and save the row without it.`);
        return;
      }
    }

    await ctx.upsertExpense({
      id: e.id,
      user_id: ctx.me.id,
      spentOn: e.spentOn,
      amount,
      category: e.category || cats[0],
      note: e.note || '',
      miles: isMileage ? Number(e.miles) || 0 : null,
      receiptPath,
      source: e.source || 'manual',
    });
    setSaving(false);
    ctx.flash(isNew ? 'Expense saved to your books.' : 'Expense updated.');
    onClose();
  }

  return (
    <ModalShell
      title={isNew ? (isMileage ? 'Log mileage' : 'Add an expense') : 'Edit expense'}
      sub={isMileage
        ? `${usdc(rate)} per mile, from Settings. The miles are stored, so a future rate change never rewrites this row.`
        : 'Yours only. Nobody else on the team sees this row.'}
      onClose={onClose}
      width={620}
      foot={
        <>
          <span style={{ fontSize: 12.5, color: '#8E89A8', marginRight: 'auto' }}>
            {isMileage ? `${Number(e.miles) || 0} miles × ${usdc(rate)} = ` : 'Amount '}
            <b>{usdc(amount)}</b>
          </span>
          <Btn kind="g" onClick={onClose} disabled={saving}>Cancel</Btn>
          <Btn kind="p" onClick={save} disabled={saving} icon={saving ? <Loader2 size={14} className="spin" /> : null}>
            {saving ? 'Saving' : isNew ? 'Save expense' : 'Save changes'}
          </Btn>
        </>
      }>
      {/* .m-left gives the modal body its own scroll — .modal itself clips */}
      <div className="m-left bookc" style={{ flex: 1, minHeight: 0 }}>
        {/* ----------------------------------------------- receipt + scan --- */}
        <Card title="Receipt" sub="Optional, and worth it: a row with a file behind it survives an audit."
          right={<Tag>image or PDF</Tag>}>
          <div className="bk-actions">
            <input ref={pick} type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
              onChange={ev => onFile(ev.target.files && ev.target.files[0])} />
            <Btn kind="s" sm icon={<Paperclip size={13} />} onClick={() => pick.current && pick.current.click()}>
              {file ? 'Choose a different file' : e.receiptPath ? 'Replace the file on record' : 'Attach a receipt'}
            </Btn>
            <Btn kind="p" sm disabled={!dataUrl || scanning} onClick={scan}
              icon={scanning ? <Loader2 size={13} className="spin" /> : <ScanLine size={13} />}>
              {scanning ? 'Reading it' : 'Scan it and pre-fill'}
            </Btn>
            {file && <Pill color="${BRAND.colors.cobalt}"><FileText size={11} /> {file.name}</Pill>}
            {!file && e.receiptPath && <Pill color="${BRAND.colors.green}"><FileText size={11} /> file on record</Pill>}
            {file && (
              <button className="ex-del" title="Clear the file" onClick={() => { setFile(null); setDataUrl(''); setScanErr(''); }}>
                <X size={14} />
              </button>
            )}
          </div>
          {initial.scanHint && !file && !scanned && (
            <div className="wf-note">
              Attach the photo of the receipt first, then press <b>Scan it and pre-fill</b>. What comes back is a draft
              you check and save — nothing is written to your books until you press Save.
            </div>
          )}
          {file && !dataUrl && !scanErr && (
            <div className="wf-note">A PDF attaches fine but cannot be scanned — type the fields in below.</div>
          )}
          {scanErr && <ErrorNote>{scanErr}</ErrorNote>}
          {scanned && (
            <div className="note" style={{ marginTop: 10 }}>
              <b>This is a draft off the receipt.</b> Check every field before you save — nothing has been written to
              your books yet, and it will not be until you press Save.
            </div>
          )}
        </Card>

        {/* ------------------------------------------------------- fields --- */}
        <div className="fgrid" style={{ marginTop: 14 }}>
          <Field label="Date spent">
            <Inp type="date" value={String(e.spentOn || '').slice(0, 10)} onChange={ev => set('spentOn', ev.target.value)} />
          </Field>
          <Field label="Category">
            <Sel value={e.category || cats[0]} onChange={ev => set('category', ev.target.value)} options={cats} />
          </Field>

          {isMileage ? (
            <>
              <Field label="Miles driven" hint={`× ${usdc(rate)} per mile, from Settings`}>
                <Inp type="number" min="0" step="1" inputMode="decimal" value={e.miles == null ? '' : e.miles}
                  onChange={ev => set('miles', ev.target.value)} placeholder="e.g. 48" />
              </Field>
              <Field label="Deduction">
                <div className="ex-amt-w" style={{ width: '100%' }}>
                  <span>$</span>
                  <input className="ex-amt" readOnly value={amount.toFixed(2)} aria-label="Computed deduction" />
                </div>
              </Field>
            </>
          ) : (
            <Field label="Amount">
              <div className="ex-amt-w" style={{ width: '100%' }}>
                <span>$</span>
                <input className="ex-amt" type="number" min="0" step="0.01" inputMode="decimal"
                  value={e.amount == null ? '' : e.amount} placeholder="0.00"
                  onChange={ev => set('amount', ev.target.value)} aria-label="Amount" />
              </div>
            </Field>
          )}

          <Field label="Note" full hint="What it was for. Your future self and your accountant both need this.">
            <Txt rows={2} value={e.note || ''} onChange={ev => set('note', ev.target.value)}
              placeholder={isMileage ? 'e.g. Showings loop, east side' : 'e.g. Facebook ads — Bluff Ridge listing'} />
          </Field>
        </div>

        {err && <ErrorNote>{err}</ErrorNote>}
        {!isNew && initial.receiptPath && (
          <div className="wf-note">
            <AlertTriangle size={11} style={{ verticalAlign: -1 }} /> Attaching a new file replaces the one on record and
            deletes it from storage.
          </div>
        )}
      </div>
    </ModalShell>
  );
}
