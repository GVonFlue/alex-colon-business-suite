/* ============================================================================
   Contracts.jsx — §4a, the headline feature.

   Flow: upload the executed contract → the model extracts clauses → the APP
   computes every relative date with src/lib/dates.js → the agent reviews a table
   showing the computed date, the rule used and the quoted clause → the agent
   confirms → tasks, calendar events and reminders are created.

   The seven non-negotiables from the brief, and where each one lives:

   1. Source text beside every date            → ReviewTable, the `quote` column
   2. Nothing is created until a human confirms → nothing writes until `confirm()`
   3. The arithmetic is shown inline            → `explain` under each date
   4. Low confidence is flagged, not guessed    → NeedsEyes + the unresolved list
   5. Contact matching is proposed, never automatic → MatchPanel
   6. Re-uploading re-cascades UNMET only, with a before/after → AddendumDiff
   7. Never characterised as legal advice       → LegalNote, and the route's prompt

   Storage: private bucket, RLS-scoped to the owning agent and the team leader,
   short-lived signed URLs only, retention with a real default, and a delete that
   removes the object rather than just the row.
   ========================================================================== */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  FileText, Upload, CheckCircle2, AlertTriangle, Trash2, Loader2, ShieldCheck,
  Link2, Plus, CalendarPlus, Eye, RefreshCw, Lock,
} from 'lucide-react';

import {
  Card, Btn, Pill, Tag, Field, Inp, Sel, Toggle, Seg, SideChip, Conf, NeedsEyes,
  Empty, SecTitle, LegalNote, ErrorNote, ModalShell,
} from '../components/ui';
import { offsetsOf, holidaysOf, rolloverOf, phasesOf } from '../lib/settings';
import {
  computeDeadline, cascade, fmtShort, fmtLong, isDate, addDays, today, daysUntil,
} from '../lib/dates';
import { usd } from '../lib/commission';
import { uid } from '../lib/format';
import { apiPost } from '../lib/data';

/* -------------------------------------------------------------------------- */

export default function Contracts({ ctx }) {
  const { params } = ctx;
  const [stage, setStage] = useState('idle');      // idle | reading | review | done
  const [file, setFile] = useState(null);
  const [txnId, setTxnId] = useState(params.txn || '');
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('upload');

  useEffect(() => { if (params.txn) { setTxnId(params.txn); setTab('upload'); } }, [params.txn]);

  const txn = ctx.transactions.find(t => t.id === txnId) || null;
  const isAddendum = !!(txn && (txn.deadlines || []).length);

  const read = async () => {
    if (!file) return;
    setErr(''); setStage('reading');
    try {
      const b64 = await toBase64(file);
      const r = await apiPost('/api/extract-contract',
        { pdf: b64, isAddendum, knownAddress: txn ? txn.address : '', model: ctx.settings.contracts?.model })
        .then(x => x.json()).catch(() => ({ ok: false, reason: 'network' }));

      if (!r.ok) { setErr(reasonText(r)); setStage('idle'); return; }
      setResult(r.data);
      setStage('review');
    } catch (e) {
      setErr(String(e.message || e)); setStage('idle');
    }
  };

  return (
    <>
      <div className="toolbar">
        <Seg value={tab} onChange={setTab} options={[
          { value: 'upload', label: 'Read a contract' },
          { value: 'files', label: 'On file', n: ctx.contracts.length },
        ]} />
      </div>

      {tab === 'files' && <OnFile ctx={ctx} />}

      {tab === 'upload' && (
        <>
          <div className="grid2">
            <Card title="1. Which transaction" sub="A contract always belongs to a deal. Pick one, or start a new one from the pipeline.">
              <Field label="Transaction">
                <Sel value={txnId} onChange={e => setTxnId(e.target.value)}>
                  <option value="">— pick a transaction —</option>
                  {ctx.transactions.filter(t => t.status === 'active').map(t => (
                    <option key={t.id} value={t.id}>{String(t.address).split(',')[0]}{t.mls ? ` · ${t.mls}` : ''}</option>
                  ))}
                </Sel>
              </Field>
              {txn && (
                <div className="note" style={{ marginTop: 10 }}>
                  {isAddendum ? (
                    <>This transaction already has {(txn.deadlines || []).length} dates.{' '}
                      <b>Uploading again re-reads the document and re-cascades every unmet deadline</b>, leaves the met
                      ones alone, and shows you a before/after. Contracts get amended more often than not.</>
                  ) : <>No dates on this transaction yet. Reading the contract will propose the full set.</>}
                </div>
              )}
            </Card>

            <Card title="2. The document" sub="PDF of the executed contract or addendum.">
              <FilePick file={file} onFile={setFile} />
              <div className="legal-note" style={{ marginTop: 10 }}>
                <Lock size={11} style={{ verticalAlign: -1 }} /> Contracts hold full names, addresses and financing
                details — the most sensitive data in this app. The file goes to a private bucket readable only by you
                and your team leader, is retained for{' '}
                {Math.round(((ctx.settings.contracts && ctx.settings.contracts.retentionMonths) || 84) / 12)} years, and is
                sent to nothing except the Anthropic API for extraction
                {ctx.settings.contracts && ctx.settings.contracts.allowExternalSend ? '' : ' — no other service, by setting'}.
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                <Btn kind="p" icon={stage === 'reading' ? <Loader2 size={14} className="spin" /> : <FileText size={14} />}
                  disabled={!file || !txnId || stage === 'reading'} onClick={read}>
                  {stage === 'reading' ? 'Reading the contract…' : 'Read the dates off it'}
                </Btn>
                {!txnId && <span style={{ fontSize: 12, color: '#8E89A8' }}>Pick a transaction first.</span>}
              </div>
              <ErrorNote>{err}</ErrorNote>
            </Card>
          </div>

          {stage === 'review' && result && txn && (
            <Review ctx={ctx} txn={txn} data={result} file={file} isAddendum={isAddendum}
              onCancel={() => { setStage('idle'); setResult(null); }}
              onDone={() => { setStage('done'); setResult(null); setFile(null); ctx.go('transactions', { open: txn.id }); }} />
          )}

          <LegalNote>
            This reads dates off the page and counts days. It does not interpret the contract, does not tell you what a
            term means, and is not legal advice. Anything about obligations or remedies is a conversation with your
            broker or an attorney.
          </LegalNote>
        </>
      )}
    </>
  );
}

const reasonText = r => ({
  not_configured: 'AI extraction is not configured on this deployment — set ANTHROPIC_API_KEY in Vercel. You can still enter the dates by hand on the transaction.',
  no_file: 'No file arrived. Try again.',
  too_large: 'That PDF is too large. Split it or upload the contract without the exhibits.',
  bad_json: 'The extraction came back malformed, so nothing was created. Try again, or enter the dates by hand — that is safer than a half-read contract.',
  api_error: `The model call failed${r.detail ? `: ${r.detail}` : ''}. Nothing was created.`,
  network: 'Could not reach the extraction service. Nothing was created.',
}[r.reason] || 'Extraction failed. Enter the dates by hand rather than trusting a partial read.');

function FilePick({ file, onFile }) {
  const ref = useRef(null);
  return (
    <>
      <div className="logo-drop" onClick={() => ref.current && ref.current.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) onFile(f); }}>
        <Upload size={18} />
        <div style={{ marginTop: 6 }}>{file ? file.name : 'Drop the PDF here, or click to choose'}</div>
        {file && <div style={{ fontSize: 11.5, color: '#8E89A8', marginTop: 4 }}>{Math.round(file.size / 1024)} KB</div>}
      </div>
      <input ref={ref} type="file" accept="application/pdf" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files && e.target.files[0]; if (f) onFile(f); }} />
    </>
  );
}

const toBase64 = file => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result || '').split(',')[1] || '');
  r.onerror = () => reject(new Error('Could not read that file.'));
  r.readAsDataURL(file);
});

/* ============================================================ the review */

function Review({ ctx, txn, data, file, isAddendum, onCancel, onDone }) {
  /* the effective date drives everything, so it is the first thing confirmed */
  const [effective, setEffective] = useState(data.effective.date || txn.effectiveDate || '');
  const [closeDate, setCloseDate] = useState(data.closing.date || txn.closeDate || '');
  const [matchId, setMatchId] = useState(txn.contact_id || '');
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [makeEvents, setMakeEvents] = useState(true);
  const [makeTasks, setMakeTasks] = useState(true);
  const [err, setErr] = useState('');

  const holidays = holidaysOf(ctx.settings);
  const rollover = rolloverOf(ctx.settings);

  /* build the review rows: for every extracted clause, WE compute the date */
  useEffect(() => {
    const built = data.deadlines.map(d => {
      const anchorDate = d.anchor === 'close' ? closeDate : effective;
      let date = d.date, rule = 'stated in the contract', explain = d.date ? `Contract states ${fmtShort(d.date)}` : '', skipped = [], rolled = null;
      if (d.kind === 'relative' && isDate(anchorDate)) {
        const c = computeDeadline({
          anchorDate, offset: d.offset, count: d.count, inclusive: d.inclusive,
          rollover, holidays, anchorLabel: d.anchor === 'close' ? 'closing' : 'effective date',
        });
        if (c) { date = c.date; rule = c.rule; explain = c.explain; skipped = c.skipped; rolled = c.rolled; }
      }
      const existing = (txn.deadlines || []).find(x => x.key === d.key || sameLabel(x.label, d.label));
      return {
        ...d, date, rule, explain, skipped, rolled,
        include: true,
        wasDate: existing ? existing.date : null,
        existingStatus: existing ? existing.status : null,
        existingKey: existing ? existing.key : null,
      };
    });
    setRows(built);
  }, [data, effective, closeDate, rollover]);

  /* contact matching: proposed with a reason, never applied automatically */
  const candidates = useMemo(() => proposeContacts(ctx, data, txn), [ctx.contacts, data, txn]);
  const best = candidates[0] || null;

  const lowCount = rows.filter(r => r.include && (r.confidence == null || r.confidence < 0.6)).length;
  const unmetChanges = rows.filter(r => r.include && r.wasDate && r.wasDate !== r.date && r.existingStatus === 'open');
  const lockedOut = (txn.deadlines || []).filter(d => d.status && d.status !== 'open');

  const setRow = (key, patch) => setRows(list => list.map(r => (r.key === key ? { ...r, ...patch } : r)));

  const confirm = async () => {
    if (!isDate(effective)) { setErr('Confirm the effective date first — every relative deadline counts from it.'); return; }
    setBusy(true); setErr('');
    try {
      /* 1. the file: private bucket, path scoped to the owning agent */
      const path = `${txn.owner_id || ctx.me.id}/${txn.id}/${Date.now()}-${(file && file.name) || 'contract.pdf'}`;
      let stored = null;
      if (file) {
        try { stored = await ctx.db.uploadContract(path, file); } catch (e) { /* storage refusal must not lose the dates */ }
      }
      const retention = (ctx.settings.contracts && ctx.settings.contracts.retentionMonths) || 84;
      const contractId = uid();
      if (stored) {
        await ctx.saveContract({
          id: contractId, owner_id: txn.owner_id || ctx.me.id, transaction_id: txn.id,
          filename: (file && file.name) || 'contract.pdf', path: stored,
          uploaded_at: new Date().toISOString(),
          extracted: { fields: rows.length, lowConfidence: lowCount, confirmedBy: ctx.me.id, confirmedAt: ctx.todayIso, documentType: data.documentType },
          deleteAfter: addDays(ctx.todayIso, Math.round(retention * 30.44)),
        });
      }

      /* 2. merge the confirmed rows onto the transaction.
         Met / waived / extended deadlines are never touched. */
      const existing = (txn.deadlines || []).slice();
      const out = existing.filter(d => d.status && d.status !== 'open');   // untouchable
      const openOnes = existing.filter(d => !d.status || d.status === 'open');

      rows.filter(r => r.include).forEach(r => {
        const keyMatch = openOnes.find(d => d.key === r.key || sameLabel(d.label, r.label));
        if (keyMatch && lockedOut.some(l => l.key === keyMatch.key)) return;
        const merged = {
          key: keyMatch ? keyMatch.key : r.key,
          label: r.label,
          date: r.date,
          offset: r.kind === 'relative' ? r.offset : null,
          count: r.count, inclusive: r.inclusive, anchor: r.anchor,
          absolute: r.kind === 'absolute',
          rule: r.rule, explain: r.explain, skipped: r.skipped || [], rolled: r.rolled || null,
          status: 'open',
          source: 'contract',
          quote: r.quote, confidence: r.confidence,
          assignee: txn.owner_id || ctx.me.id,
          eventId: keyMatch ? keyMatch.eventId : null,
          remindersSent: keyMatch ? (keyMatch.remindersSent || {}) : {},
          notes: r.note || '',
          contractId,
        };
        out.push(merged);
      });

      /* anything the contract did not mention keeps its default-derived date,
         re-cascaded against the confirmed effective date */
      openOnes.forEach(d => {
        if (out.some(x => x.key === d.key || sameLabel(x.label, d.label))) return;
        out.push(d);
      });

      const r = cascade(out, {
        effective, closeDate: closeDate || null, holidays, rollover,
        offsets: null, assignee: txn.owner_id || ctx.me.id,
      });

      const nextTxn = {
        ...txn,
        contact_id: matchId || txn.contact_id || null,
        effectiveDate: effective,
        closeDate: closeDate || txn.closeDate || null,
        salePrice: data.money.purchasePrice || txn.salePrice,
        earnestAmount: data.money.earnestAmount || txn.earnestAmount,
        address: data.property.address || txn.address,
        mls: data.property.mls || txn.mls,
        contractId,
        deadlines: r.deadlines,
      };
      await ctx.upsertTransaction(nextTxn);

      /* 3. tasks for the assigned agent */
      if (makeTasks) {
        for (const d of r.deadlines) {
          if (d.status !== 'open') continue;
          await ctx.upsertTask({
            id: uid(), user_id: txn.owner_id || ctx.me.id, transaction_id: txn.id,
            due: d.date, done: false, kind: 'deadline',
            title: `${d.label} — ${String(nextTxn.address).split(',')[0]}`,
            note: d.quote ? `Contract: “${d.quote}”` : d.rule,
          });
        }
      }

      /* 4. calendar events, one per deadline, updated rather than duplicated */
      if (makeEvents) await syncCalendar(nextTxn, ctx);

      ctx.flash(`${r.deadlines.filter(d => d.status === 'open').length} dates confirmed.`);
      onDone();
    } catch (e) {
      setErr(String(e.message || e));
    }
    setBusy(false);
  };

  return (
    <Card title={isAddendum ? '3. Review — what this document changes' : '3. Review before anything is created'}
      sub="Nothing has been written yet. Edit anything that is wrong, untick anything you do not want, then confirm."
      style={{ marginTop: 16 }}>

      <div className="note" style={{ marginBottom: 14 }}>
        <b>{docLabel(data.documentType)}.</b> {data.documentNote}
        {data.deadlines.length ? ` ${data.deadlines.length} dated clauses found.` : ' No dated clauses found.'}
        {lowCount ? ` ${lowCount} need your eyes.` : ''}
      </div>

      <div className="fgrid" style={{ marginBottom: 16 }}>
        <Field label="Effective / binding date" hint={data.effective.note || 'Every relative deadline counts from this.'}>
          <Inp type="date" value={effective} onChange={e => setEffective(e.target.value)} />
          {data.effective.quote && <div className="cd-quote" style={{ marginTop: 6 }}>“{data.effective.quote}” <Conf v={data.effective.confidence} /></div>}
          {!data.effective.date && <div style={{ marginTop: 6 }}><NeedsEyes /> <span style={{ fontSize: 12, color: '#8E89A8' }}>not stated clearly — fill it in</span></div>}
        </Field>
        <Field label="Closing date" hint="Anchors the walkthrough and closing rows.">
          <Inp type="date" value={closeDate} onChange={e => setCloseDate(e.target.value)} />
          {data.closing.quote && <div className="cd-quote" style={{ marginTop: 6 }}>“{data.closing.quote}” <Conf v={data.closing.confidence} /></div>}
          {data.closing.possessionDate && (
            <div style={{ fontSize: 12, color: '#56527a', marginTop: 6 }}>
              Possession {fmtShort(data.closing.possessionDate)}{data.closing.possessionTime ? ` at ${data.closing.possessionTime}` : ''}
            </div>
          )}
        </Field>
      </div>

      <MatchPanel ctx={ctx} data={data} candidates={candidates} value={matchId} onChange={setMatchId} txn={txn} />

      <FactsPanel data={data} />

      {isAddendum && <AddendumDiff rows={rows} locked={lockedOut} changed={unmetChanges} />}

      <SecTitle>Dated clauses <span className="kc">{rows.filter(r => r.include).length} of {rows.length} selected</span></SecTitle>
      {rows.length === 0 ? (
        <Empty>No dated clauses came back. Enter the dates by hand on the transaction — a blank you fill in beats a confident wrong date.</Empty>
      ) : (
        <div className="tbl-wrap">
          <table className="ex-tbl">
            <thead><tr>
              <th style={{ width: 34 }}></th>
              <th>Deadline</th><th style={{ width: 150 }}>Computed date</th><th>Rule used</th>
              <th>Source clause</th><th style={{ width: 90 }}>Confidence</th>
            </tr></thead>
            <tbody>
              {rows.map(r => {
                const low = r.confidence == null || r.confidence < 0.6;
                return (
                  <tr key={r.key} className={low ? 'low' : ''}>
                    <td><input type="checkbox" checked={r.include} onChange={e => setRow(r.key, { include: e.target.checked })} /></td>
                    <td>
                      <Inp value={r.label} onChange={e => setRow(r.key, { label: e.target.value })} style={{ fontWeight: 600 }} />
                      <div style={{ marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <span className="cd-count">{r.count === 'business' ? 'business' : 'calendar'}</span>
                        {r.kind === 'relative' && <span className="cd-count">{r.inclusive ? 'inclusive start' : 'exclusive start'}</span>}
                        <span className="cd-count">from {r.anchor === 'close' ? 'close' : 'effective'}</span>
                        {r.kind === 'absolute' && <span className="cd-flag">absolute</span>}
                      </div>
                    </td>
                    <td>
                      <Inp type="date" value={r.date || ''} onChange={e => setRow(r.key, { date: e.target.value, rule: 'edited by hand', explain: `Set to ${fmtShort(e.target.value)} by ${ctx.me.name}`, kind: 'absolute' })} />
                      {r.wasDate && r.wasDate !== r.date && (
                        <div style={{ fontSize: 11, color: '#A85B10', marginTop: 4 }}>was {fmtShort(r.wasDate)}</div>
                      )}
                    </td>
                    <td>
                      <div style={{ fontSize: 12.5 }}>{r.rule}</div>
                      {r.explain && <div className="cd-rule" style={{ marginTop: 4 }}>{r.explain}</div>}
                      {r.note && <div style={{ fontSize: 11.5, color: '#8E89A8', marginTop: 4 }}>{r.note}</div>}
                    </td>
                    <td>{r.quote ? <div className="cd-quote" style={{ margin: 0 }}>“{r.quote}”</div>
                      : <span style={{ fontSize: 12, color: '#B03030' }}>no quote returned — verify this one</span>}</td>
                    <td>{low ? <NeedsEyes /> : <Conf v={r.confidence} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {data.unresolved.length > 0 && (
        <>
          <SecTitle>Needs your eyes <span className="kc">{data.unresolved.length}</span></SecTitle>
          <div className="hlist">
            {data.unresolved.map((u, i) => (
              <div key={i} className="hli warn">
                <b>{u.label}</b> <span className="cd-count">{u.why}</span>
                {u.quote && <div className="cd-quote">“{u.quote}”</div>}
                <div style={{ fontSize: 12, color: '#8E89A8', marginTop: 4 }}>
                  Nothing was created for this. Add it by hand on the transaction if it matters.
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ marginTop: 16, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <Toggle on={makeTasks} onChange={setMakeTasks} label="Create a task per deadline for the assigned agent" />
        <Toggle on={makeEvents} onChange={setMakeEvents} label="Put them on the agent's calendar" />
      </div>

      <ErrorNote>{err}</ErrorNote>

      <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Btn kind="p" onClick={confirm} disabled={busy || !isDate(effective)}
          icon={busy ? <Loader2 size={14} className="spin" /> : <CheckCircle2 size={14} />}>
          {busy ? 'Creating…' : `Confirm ${rows.filter(r => r.include).length} dates`}
        </Btn>
        <Btn kind="g" onClick={onCancel}>Discard this read</Btn>
        <span style={{ fontSize: 11.5, color: '#8E89A8' }}>
          Confirming is the only thing that writes. Until then this is a proposal.
        </span>
      </div>
    </Card>
  );
}

const docLabel = t => ({
  purchase_contract: 'Purchase contract', addendum: 'Addendum', amendment: 'Amendment',
  unreadable: 'Unreadable document', other: 'Document',
}[t] || 'Document');

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const sameLabel = (a, b) => norm(a) === norm(b);

/* ---------------------------------------------------- contact matching (§4a.5)
   Match on property address first, then party names. Show WHY it matched, let
   the agent confirm, pick a different contact, or create a new one. Never
   automatic — a wrong link quietly attaches someone else's deal to a client. */
function proposeContacts(ctx, data, txn) {
  const addr = norm(data.property.address || txn.address);
  const names = [...data.parties.buyers, ...data.parties.sellers].map(norm).filter(Boolean);
  const scored = ctx.contacts.map(c => {
    let score = 0; const why = [];
    if (addr && norm(c.address) && (norm(c.address) === addr || addr.includes(norm(c.address).split(' ')[0]))) {
      if (norm(c.address) === addr) { score += 60; why.push('property address matches exactly'); }
      else { score += 20; why.push('street number matches'); }
    }
    names.forEach(n => {
      const cn = norm(c.name);
      if (!cn || !n) return;
      if (cn === n) { score += 50; why.push(`named on the contract as “${n}”`); }
      else if (n.includes(cn) || cn.includes(n)) { score += 25; why.push(`name looks like a party (“${n}”)`); }
      else {
        const last = cn.split(' ').slice(-1)[0];
        if (last && last.length > 2 && n.includes(last)) { score += 12; why.push(`surname “${last}” appears on the contract`); }
      }
    });
    if (txn.contact_id === c.id) { score += 15; why.push('already linked to this transaction'); }
    return { c, score, why };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);
  return scored;
}

function MatchPanel({ ctx, data, candidates, value, onChange, txn }) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState((data.parties.buyers[0] || data.parties.sellers[0] || ''));
  const chosen = ctx.contacts.find(c => c.id === value);

  const create = async () => {
    const id = uid();
    await ctx.upsertContact({
      id, name: newName || 'New contact', side: txn.side || 'buyer', stage: 'contract',
      owner_id: txn.owner_id || ctx.me.id, pool: null,
      source: 'Other', address: data.property.address || txn.address,
      created_at: ctx.todayIso, lastTouch: ctx.todayIso,
      email: '', phone: '', areas: [], checklist: {}, appointments: [],
      activity: [{ id: uid(), at: new Date().toISOString(), kind: 'note', note: 'Created from a contract upload.', by: ctx.me.id }],
    });
    onChange(id); setCreating(false);
  };

  return (
    <Card title="Contact" sub="Proposed, not applied. Confirm it, pick someone else, or create a new contact.">
      {candidates.length === 0 && !chosen && (
        <div className="note">No contact looked like a match on address or party names. Create one below.</div>
      )}
      {candidates.length > 0 && (
        <div className="hlist">
          {candidates.map(({ c, score, why }) => (
            <label key={c.id} className={'hli' + (value === c.id ? ' win' : '')} style={{ cursor: 'pointer', display: 'block' }}>
              <input type="radio" name="match" checked={value === c.id} onChange={() => onChange(c.id)} style={{ marginRight: 8 }} />
              <b>{c.name}</b> <SideChip side={c.side} />
              <span className="cd-count" style={{ marginLeft: 8 }}>{score >= 60 ? 'strong match' : score >= 30 ? 'likely' : 'weak'}</span>
              <div style={{ fontSize: 12, color: '#56527a', marginTop: 4 }}>{why.join(' · ')}</div>
              {c.address && <div style={{ fontSize: 11.5, color: '#8E89A8' }}>{c.address}</div>}
            </label>
          ))}
        </div>
      )}
      <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {!creating
          ? <Btn sm kind="g" icon={<Plus size={13} />} onClick={() => setCreating(true)}>Create a new contact instead</Btn>
          : <>
            <Inp value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name from the contract" style={{ maxWidth: 260 }} />
            <Btn sm kind="p" onClick={create}>Create and link</Btn>
            <Btn sm kind="g" onClick={() => setCreating(false)}>Cancel</Btn>
          </>}
        {value && <Btn sm kind="g" onClick={() => onChange('')}>Link nothing for now</Btn>}
      </div>
      {(data.parties.buyers.length || data.parties.sellers.length) && (
        <div style={{ fontSize: 12, color: '#56527a', marginTop: 10 }}>
          Parties on the document: {data.parties.buyers.join(', ') || '—'} (buyer) · {data.parties.sellers.join(', ') || '—'} (seller)
          {data.parties.quote && <div className="cd-quote">“{data.parties.quote}”</div>}
        </div>
      )}
    </Card>
  );
}

function FactsPanel({ data }) {
  const rows = [
    ['Property', data.property.address, data.property.quote, data.property.confidence],
    ['MLS', data.property.mls, '', null],
    ['Purchase price', data.money.purchasePrice ? usd(data.money.purchasePrice) : '', data.money.purchasePriceQuote, data.money.purchasePriceConfidence],
    ['Earnest money', data.money.earnestAmount ? usd(data.money.earnestAmount) : '', data.money.earnestQuote, data.money.earnestConfidence],
    ['Seller concessions', data.money.concessions ? usd(data.money.concessions) : '', data.money.concessionsQuote, null],
  ].filter(r => r[1]);
  if (!rows.length) return null;
  return (
    <Card title="What it says" style={{ marginTop: 4, marginBottom: 14 }}>
      <div className="m-facts">
        {rows.map(([label, value, q, c]) => (
          <div key={label} className="mf">
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: '#928DAD' }}>{label}</div>
            <div style={{ fontWeight: 600 }}>{value} {c != null && <Conf v={c} />}</div>
            {q && <div className="cd-quote" style={{ marginTop: 4 }}>“{q}”</div>}
          </div>
        ))}
      </div>
    </Card>
  );
}

function AddendumDiff({ rows, locked, changed }) {
  return (
    <Card title="Before and after" sub="Re-uploading re-cascades unmet deadlines and leaves met ones alone."
      style={{ marginBottom: 14 }}>
      {changed.length === 0 && <div className="note">Nothing that is still open moves.</div>}
      {changed.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
          {changed.map(r => (
            <li key={r.key} style={{ marginBottom: 4 }}>
              <b>{r.label}</b>: {fmtShort(r.wasDate)} → <b>{fmtShort(r.date)}</b>
            </li>
          ))}
        </ul>
      )}
      {locked.length > 0 && (
        <>
          <div className="sec-title" style={{ marginTop: 14 }}>Left alone</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#56527a' }}>
            {locked.map(d => (
              <li key={d.key}>{d.label} — already {d.status} on {fmtShort(d.date)}</li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

/* one event per deadline; editing a date updates the existing event rather than
   creating a duplicate — the eventId is stored on the deadline. */
async function syncCalendar(txn, ctx) {
  const list = (txn.deadlines || []).filter(d => d.status === 'open');
  const next = (txn.deadlines || []).slice();
  for (const d of list) {
    try {
      const r = await apiPost('/api/calendar-event', {
        eventId: d.eventId || undefined,
        summary: `${d.label} — ${String(txn.address).split(',')[0]}`,
        description: [d.rule, d.quote ? `Contract: “${d.quote}”` : '', d.explain].filter(Boolean).join('\n'),
        date: d.date, allDay: true,
      }).then(x => x.json()).catch(() => null);
      if (r && r.id) {
        const i = next.findIndex(x => x.key === d.key);
        if (i >= 0) next[i] = { ...next[i], eventId: r.id };
      }
    } catch { /* calendar is a convenience; never block a confirmed deadline on it */ }
  }
  if (next.some((d, i) => d.eventId !== (txn.deadlines || [])[i]?.eventId)) {
    await ctx.upsertTransaction({ ...txn, deadlines: next });
  }
}

/* ============================================================ files on file */

function OnFile({ ctx }) {
  const [busy, setBusy] = useState('');
  const [confirmDel, setConfirmDel] = useState(null);

  const view = async c => {
    setBusy(c.id);
    try {
      const url = await ctx.db.contractUrl(c.path);
      if (url) window.open(url, '_blank', 'noopener');
      else ctx.flash('No file behind that record in this demo.');
    } catch { ctx.flash('Could not open that file.'); }
    setBusy('');
  };

  if (!ctx.contracts.length) return <Empty>No contracts on file yet.</Empty>;

  return (
    <>
      <div className="legal-note" style={{ marginBottom: 14 }}>
        <ShieldCheck size={12} style={{ verticalAlign: -1 }} /> These files are readable only by the owning agent and
        the team leader, enforced by storage policies rather than by this screen. Links are minted on demand and expire
        in five minutes — there is no public URL and no long-lived signed URL anywhere in this app.
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>File</th><th>Transaction</th><th>Uploaded</th><th>Extracted</th><th>Delete after</th><th></th></tr></thead>
          <tbody>
            {ctx.contracts.map(c => {
              const t = ctx.transactions.find(x => x.id === c.transaction_id);
              const ex = c.extracted || {};
              return (
                <tr key={c.id}>
                  <td className="namecell"><FileText size={13} style={{ verticalAlign: -2, marginRight: 6 }} />{c.filename}</td>
                  <td>{t ? String(t.address).split(',')[0] : '—'}</td>
                  <td>{fmtShort(String(c.uploaded_at || '').slice(0, 10))}</td>
                  <td>
                    {ex.fields ? <>{ex.fields} fields{ex.lowConfidence ? ` · ${ex.lowConfidence} flagged` : ''}</> : '—'}
                    {ex.confirmedAt && <div style={{ fontSize: 11, color: '#8E89A8' }}>confirmed {fmtShort(ex.confirmedAt)} by {ctx.users_by_id[ex.confirmedBy]?.name || 'agent'}</div>}
                  </td>
                  <td>{c.delete_after ? fmtShort(String(c.delete_after).slice(0, 10)) : '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <Btn sm kind="g" icon={busy === c.id ? <Loader2 size={12} className="spin" /> : <Eye size={12} />} onClick={() => view(c)}>View</Btn>{' '}
                    {confirmDel === c.id
                      ? <>
                        <Btn sm kind="d" onClick={() => { ctx.removeContract(c.id, c.path); setConfirmDel(null); }}>Delete file and record</Btn>{' '}
                        <Btn sm kind="g" onClick={() => setConfirmDel(null)}>Keep</Btn>
                      </>
                      : <Btn sm kind="d" icon={<Trash2 size={12} />} onClick={() => setConfirmDel(c.id)}>Delete</Btn>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="cd-stamp" style={{ marginTop: 10 }}>
        Retention is {Math.round(((ctx.settings.contracts && ctx.settings.contracts.retentionMonths) || 84) / 12)} years
        by setting, and delete
        {ctx.settings.contracts && ctx.settings.contracts.hardDelete === false
          ? ' currently removes the record but keeps the file — the team leader can change that in Settings.'
          : ' removes the stored object, not just the row.'}
      </div>
    </>
  );
}
