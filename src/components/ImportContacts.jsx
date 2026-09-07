/* ============================================================================
   ImportContacts.jsx — bring a book of business in from whatever CRM it is
   sitting in today.

   The client going live next week has contacts in something, and nobody knows
   what. So this screen assumes NOTHING about the file: it sniffs the delimiter,
   parses RFC-4180 properly (quoted commas, embedded newlines, doubled quotes,
   BOM, CRLF), guesses the column mapping and lets every guess be overridden,
   then maps THEIR stage and source words onto THIS install's settings.

   Five steps, and nothing is written until the last one:

     1. file     the file, dropped or picked
     2. columns  which column is which field
     3. values   which of their stages / sources is which of ours
     4. preview  the rows exactly as they will be created, plus duplicates
     5. import   one upsertContact at a time, with a summary and a bad-rows CSV

   All the parsing and mapping logic lives in ./importcsv.js — no React in it,
   so tests/import.test.mjs runs it in plain node. This file is the screen.
   ========================================================================== */

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Upload, FileSpreadsheet, ArrowRight, ArrowLeft, Check, AlertTriangle,
  Download, X, RefreshCw, Users, CheckCircle2,
} from 'lucide-react';

import { ModalShell, Btn, Field, Sel, Seg, Empty, SideChip, ErrorNote } from './ui';
import { stagesOf, stageLabel, DEFAULT_SOURCES } from '../lib/settings';
import { usd, phoneFmt } from '../lib/format';
import { fmtShort } from '../lib/dates';
import {
import { BRAND } from '../lib/brand';
  parseDelimited, autoMap, columnsByField, sampleFor, distinctValues,
  guessValueMap, buildPlan, dateOrderHint, fallbackStage, failuresCsv,
  FIELDS, NEW_SOURCE_KEY,
} from './importcsv';

const STEPS = [
  { key: 'file', label: '1. File' },
  { key: 'columns', label: '2. Columns' },
  { key: 'values', label: '3. Values' },
  { key: 'preview', label: '4. Preview' },
];

const DELIMS = [
  { value: '', label: 'Detected automatically' },
  { value: ',', label: 'Comma' },
  { value: '\t', label: 'Tab' },
  { value: ';', label: 'Semicolon' },
];
const delimName = d => (d === '\t' ? 'tab' : d === ';' ? 'semicolon' : 'comma');

const PREVIEW_ROWS = 25;

const priceText = c => {
  const lo = Number(c.priceMin) || 0, hi = Number(c.priceMax) || 0, t = Number(c.targetPrice) || 0;
  if (t > 0) return usd(t);
  if (lo && hi && lo !== hi) return `${usd(lo)}–${usd(hi)}`;
  return lo || hi ? usd(lo || hi) : '—';
};

export default function ImportContacts({ ctx, onClose }) {
  const { settings } = ctx;
  const stages = stagesOf(settings);
  const sources = useMemo(
    () => ((settings.sources && settings.sources.length) ? settings.sources : DEFAULT_SOURCES),
    [settings.sources],
  );

  const [step, setStep] = useState('file');
  const [fileName, setFileName] = useState('');
  const [raw, setRaw] = useState('');
  const [delim, setDelim] = useState('');
  const [mapping, setMapping] = useState([]);
  const [stageEdits, setStageEdits] = useState({});
  const [sourceEdits, setSourceEdits] = useState({});
  const [dateOrder, setDateOrder] = useState('mdy');
  const [dupAction, setDupAction] = useState('skip');
  const [dupOverrides, setDupOverrides] = useState({});
  const [ownerMode, setOwnerMode] = useState('me');
  const [ownerId, setOwnerId] = useState(ctx.me.id);
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState('');
  const [prog, setProg] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState(null);
  const pick = useRef(null);

  /* ------------------------------------------------------------- the file */

  const parsed = useMemo(() => (raw ? parseDelimited(raw, delim || undefined) : null), [raw, delim]);
  const header = parsed ? parsed.header : [];
  const rows = parsed ? parsed.rows : [];
  const headerSig = header.join('');

  /* a new file (or a hand-picked delimiter) re-guesses every column */
  useEffect(() => {
    if (!parsed) return;
    setMapping(autoMap(parsed.header));
    setStageEdits({});
    setSourceEdits({});
    setDupOverrides({});
  }, [headerSig]); // eslint-disable-line react-hooks/exhaustive-deps

  const readFile = useCallback(async f => {
    if (!f) return;
    const name = f.name || 'contacts.csv';
    if (!/\.(csv|tsv|txt)$/i.test(name)) {
      setErr(`"${name}" is not a .csv or .tsv file. Export from the old CRM as CSV and try again.`);
      return;
    }
    try {
      const text = f.text
        ? await f.text()
        : await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(String(r.result || ''));
          r.onerror = () => rej(new Error('the file could not be read'));
          r.readAsText(f);
        });
      if (!String(text).trim()) { setErr(`"${name}" is empty.`); return; }
      setErr('');
      setFileName(name);
      setDelim('');
      setRaw(String(text));
      setResult(null);
      setStep('columns');
    } catch (e) {
      setErr((e && e.message) || 'That file could not be read.');
    }
  }, []);

  /* ------------------------------------------------------- the mapping */

  const byField = useMemo(() => columnsByField(mapping), [mapping]);
  const setCol = (i, key) => setMapping(m => m.map((x, j) => (j === i ? key : x)));

  const hasIdentity = byField.name != null || byField.firstName != null
    || byField.lastName != null || byField.email != null || byField.phone != null;

  /* ----------------------------------------------- their values -> ours */

  const stageVals = useMemo(() => distinctValues(rows, byField.stage), [rows, byField.stage]);
  const sourceVals = useMemo(() => distinctValues(rows, byField.source), [rows, byField.source]);
  const stageGuess = useMemo(() => guessValueMap(stageVals, 'stage', stages), [stageVals, stages]);
  const sourceGuess = useMemo(() => guessValueMap(sourceVals, 'source', sources), [sourceVals, sources]);
  const stageMap = useMemo(() => ({ ...stageGuess, ...stageEdits }), [stageGuess, stageEdits]);
  const sourceMap = useMemo(() => ({ ...sourceGuess, ...sourceEdits }), [sourceGuess, sourceEdits]);

  const newSources = useMemo(
    () => sourceVals.filter(v => sourceMap[v.value] === NEW_SOURCE_KEY).map(v => v.value),
    [sourceVals, sourceMap],
  );

  const fbStage = fallbackStage(stages);
  const fbStageLabel = stageLabel(fbStage, 'both', settings);

  /* ------------------------------------------------------------- dates */

  const dateSamples = useMemo(() => {
    const cols = [byField.created, byField.lastTouch].filter(i => i != null);
    const out = [];
    cols.forEach(i => rows.forEach(r => { const v = String(r[i] || '').trim(); if (v) out.push(v); }));
    return out;
  }, [rows, byField.created, byField.lastTouch]);
  const dateHint = useMemo(() => dateOrderHint(dateSamples), [dateSamples]);

  /* ------------------------------------------------------------ the plan */

  const plan = useMemo(() => buildPlan({
    rows, mapping, existing: ctx.contacts, stages, sources,
    stageMap, sourceMap, dateOrder, dupAction, dupOverrides,
    ownerMode, ownerId, users: ctx.users, meId: ctx.me.id,
    todayIso: ctx.todayIso, fileName,
  }), [rows, mapping, ctx.contacts, stages, sources, stageMap, sourceMap, dateOrder,
    dupAction, dupOverrides, ownerMode, ownerId, ctx.users, ctx.me.id, ctx.todayIso, fileName]);

  const c = plan.counts;
  const dupRows = plan.rows.filter(r => r.dupOn);
  const warnRows = plan.rows.filter(r => r.warnings && r.warnings.length);
  const skipRows = plan.rows.filter(r => r.action === 'skip');

  /* ---------------------------------------------------------- the import */

  const run = async () => {
    const work = plan.rows.filter(r => r.action === 'create' || r.action === 'update');
    if (!work.length) { setErr('Nothing in this file would be written. Check the column mapping.'); return; }
    setErr('');
    setStep('running');
    setProg({ done: 0, total: work.length });

    /* a source the user chose to add has to exist in settings or it will never
       appear in the Source dropdown again — leader only, the database refuses
       otherwise, so an agent's rows keep the value without the setting */
    if (ctx.isLeader && newSources.length) {
      try { await ctx.saveSettings({ ...settings, sources: [...sources, ...newSources] }); } catch { /* toast already fired */ }
    }

    let created = 0, updated = 0;
    const failed = [];
    for (let i = 0; i < work.length; i++) {
      const r = work[i];
      try {
        await ctx.upsertContact(r.contact);
        if (r.action === 'create') created++; else updated++;
      } catch (e) {
        failed.push({ n: r.n, cells: r.cells, error: (e && e.message) || 'the write was refused' });
      }
      setProg({ done: i + 1, total: work.length });
      await new Promise(res => setTimeout(res, 0));   // let the progress bar paint
    }
    setResult({
      created, updated, failed,
      skippedNoId: c.skipNoId,
      dupSkipped: c.dupSkip,
      bad: [...failed, ...skipRows.map(r => ({ n: r.n, cells: r.cells, error: r.reason }))],
    });
    setStep('done');
    ctx.flash(`${created} created, ${updated} updated from ${fileName}.`);
  };

  const downloadBad = () => {
    const bad = (result && result.bad) || [];
    if (!bad.length) return;
    const body = failuresCsv(header, bad);
    const url = URL.createObjectURL(new Blob([body], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `import-problems-${ctx.todayIso}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const restart = () => {
    setRaw(''); setFileName(''); setMapping([]); setResult(null);
    setStageEdits({}); setSourceEdits({}); setDupOverrides({});
    setErr(''); setStep('file');
  };

  /* ------------------------------------------------------------- the foot */

  const goNext = () => {
    if (step === 'columns') {
      if (!hasIdentity) { setErr('Map at least one of Full name, First name, Email or Phone — without one of those there is no contact to create.'); return; }
      setErr(''); setStep('values'); return;
    }
    if (step === 'values') { setErr(''); setStep('preview'); return; }
  };
  const goBack = () => {
    setErr('');
    if (step === 'columns') setStep('file');
    else if (step === 'values') setStep('columns');
    else if (step === 'preview') setStep('values');
  };

  const foot = step === 'running' ? (
    <span className="m-foot-n">Writing {prog.done} of {prog.total} — leave this open until it finishes.</span>
  ) : step === 'done' ? (
    <>
      <Btn kind="p" onClick={onClose}>Done</Btn>
      <Btn kind="g" icon={<RefreshCw size={14} />} onClick={restart}>Import another file</Btn>
      {result && result.bad.length > 0 && (
        <Btn kind="g" icon={<Download size={14} />} onClick={downloadBad}>
          Download the {result.bad.length} row{result.bad.length === 1 ? '' : 's'} that did not import
        </Btn>
      )}
    </>
  ) : (
    <>
      {step !== 'file' && <Btn kind="g" icon={<ArrowLeft size={14} />} onClick={goBack}>Back</Btn>}
      {step === 'preview' ? (
        <Btn kind="p" icon={<Check size={15} />} onClick={run}>
          Import {c.create + c.update} contact{c.create + c.update === 1 ? '' : 's'}
        </Btn>
      ) : step !== 'file' ? (
        <Btn kind="p" icon={<ArrowRight size={15} />} onClick={goNext}>Next</Btn>
      ) : null}
      <Btn kind="g" onClick={onClose}>Cancel</Btn>
      <span className="m-foot-n">
        {step === 'preview'
          ? 'Nothing has been written yet. This is exactly what will be created.'
          : 'Nothing is written until you confirm the preview.'}
      </span>
    </>
  );

  return (
    <ModalShell
      onClose={onClose}
      width="min(1140px, 96vw)"
      title="Import contacts"
      sub={fileName
        ? `${fileName} · ${rows.length} row${rows.length === 1 ? '' : 's'} · ${header.length} column${header.length === 1 ? '' : 's'} · ${delimName(parsed.delimiter)}-separated`
        : 'A CSV or TSV out of whatever CRM they are leaving'}
      badges={step === 'running' || step === 'done' ? null : (
        <div className="imp-steps">
          {STEPS.map(s => (
            <span key={s.key} className={'imp-step' + (s.key === step ? ' on' : '')}>{s.label}</span>
          ))}
        </div>
      )}
      foot={foot}
    >
      <style>{IMP_CSS}</style>
      <div className="imp-body">
        {step === 'file' && (
          <FileStep drag={drag} setDrag={setDrag} pick={pick} readFile={readFile} />
        )}

        {step === 'columns' && parsed && (
          <ColumnStep
            parsed={parsed} mapping={mapping} setCol={setCol} delim={delim} setDelim={setDelim}
            onReguess={() => setMapping(autoMap(header))}
          />
        )}

        {step === 'values' && parsed && (
          <ValueStep
            ctx={ctx} settings={settings} stages={stages} sources={sources}
            stageVals={stageVals} sourceVals={sourceVals}
            stageMap={stageMap} sourceMap={sourceMap}
            setStageEdits={setStageEdits} setSourceEdits={setSourceEdits}
            hasStageCol={byField.stage != null} hasSourceCol={byField.source != null}
            fbStageLabel={fbStageLabel} newSources={newSources}
            dateHint={dateHint} dateOrder={dateOrder} setDateOrder={setDateOrder}
            hasDateCol={byField.created != null || byField.lastTouch != null}
            ownerMode={ownerMode} setOwnerMode={setOwnerMode}
            ownerId={ownerId} setOwnerId={setOwnerId}
            hasAgentCol={byField.agent != null} unmatched={c.unmatchedAgents}
          />
        )}

        {step === 'preview' && parsed && (
          <PreviewStep
            ctx={ctx} settings={settings} plan={plan} counts={c} header={header}
            dupRows={dupRows} skipRows={skipRows} warnRows={warnRows}
            dupAction={dupAction} setDupAction={setDupAction}
            dupOverrides={dupOverrides} setDupOverrides={setDupOverrides}
            ragged={parsed.ragged} blank={parsed.blank}
          />
        )}

        {step === 'running' && (
          <div className="imp-run">
            <div className="imp-run-t">Importing {fileName}</div>
            <div className="imp-bar"><i style={{ width: `${prog.total ? Math.round((prog.done / prog.total) * 100) : 0}%` }} /></div>
            <div className="imp-run-s">{prog.done} of {prog.total} written. Each one is saved on its own, so a single bad row cannot take the rest down.</div>
          </div>
        )}

        {step === 'done' && result && (
          <DoneStep result={result} fileName={fileName} header={header} />
        )}

        <ErrorNote>{err}</ErrorNote>
      </div>
    </ModalShell>
  );
}

/* ================================================================ step 1 */

function FileStep({ drag, setDrag, pick, readFile }) {
  return (
    <>
      <div
        className={'imp-drop' + (drag ? ' on' : '')}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => {
          e.preventDefault(); setDrag(false);
          const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
          readFile(f);
        }}
        onClick={() => pick.current && pick.current.click()}
      >
        <Upload size={26} />
        <div className="imp-drop-t">Drop the export here, or click to pick a file</div>
        <div className="imp-drop-s">.csv or .tsv — comma, tab or semicolon separated, any column order</div>
        <input
          ref={pick} type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
          style={{ display: 'none' }}
          onChange={e => { readFile(e.target.files && e.target.files[0]); e.target.value = ''; }}
        />
      </div>
      <div className="imp-note">
        <b>What this handles.</b> Quoted fields with commas in them ("Smith, John", every street address),
        line breaks inside a quoted note, doubled quotes as an escape, a byte-order mark in front of the header,
        Windows line endings, and rows that are short a column. The delimiter is worked out by counting
        candidates in the header line, and you can override it on the next screen.
      </div>
      <div className="imp-note">
        <b>Nothing is written until the end.</b> You will see the columns it guessed, the stages and sources it
        matched, and a preview of the first {PREVIEW_ROWS} contacts exactly as they would be created — with
        duplicates against your existing contacts already flagged — before anything touches the database.
      </div>
    </>
  );
}

/* ================================================================ step 2 */

function ColumnStep({ parsed, mapping, setCol, delim, setDelim, onReguess }) {
  const { header, rows, ragged } = parsed;
  const guessed = mapping.filter(Boolean).length;
  return (
    <>
      <div className="imp-head">
        <div className="imp-head-l">
          <b>{guessed} of {header.length}</b> columns matched to a field. Change any of them — the guesses are
          only guesses, and <i>Ignore this column</i> is always available.
        </div>
        <div className="imp-head-r">
          <Field label="Delimiter">
            <Sel options={DELIMS} value={delim} onChange={e => setDelim(e.target.value)} />
          </Field>
          <Btn kind="g" sm icon={<RefreshCw size={13} />} onClick={onReguess}>Guess again</Btn>
        </div>
      </div>

      {ragged.length > 0 && (
        <div className="imp-warn">
          <AlertTriangle size={13} /> {ragged.length} row{ragged.length === 1 ? ' has' : 's have'} a different
          number of columns than the header (first one is row {ragged[0].n}: {ragged[0].had} instead of {ragged[0].want}).
          Short rows are padded with blanks — nothing shifts into the wrong field — and extra columns past the header are dropped.
        </div>
      )}

      <div className="tbl-wrap">
        <table className="tbl imp-tbl">
          <thead>
            <tr><th>Column in the file</th><th>First value in it</th><th>Becomes</th></tr>
          </thead>
          <tbody>
            {header.map((h, i) => {
              const sample = sampleFor(rows, i);
              return (
                <tr key={i} className={mapping[i] ? '' : 'imp-off'}>
                  <td><b>{h || <span className="imp-dim">(no header — column {i + 1})</span>}</b></td>
                  <td className="imp-sample">{sample || <span className="imp-dim">empty in every row</span>}</td>
                  <td style={{ width: 260 }}>
                    <select value={mapping[i] || ''} onChange={e => setCol(i, e.target.value)}>
                      <option value="">Ignore this column</option>
                      {FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="imp-note">
        <b>Names and prices can arrive either way.</b> A single <i>Full name</i> column is used as-is; a
        <i> First name</i> and <i>Last name</i> pair is joined into one name. A single price column reading
        "250000-300000" or "$250k to $300k" is split into a range; separate min and max columns are used
        directly. Street, city, state and ZIP are recombined into one address line.
      </div>
    </>
  );
}

/* ================================================================ step 3 */

function ValueStep(props) {
  const {
    ctx, settings, stages, sources, stageVals, sourceVals, stageMap, sourceMap,
    setStageEdits, setSourceEdits, hasStageCol, hasSourceCol, fbStageLabel, newSources,
    dateHint, dateOrder, setDateOrder, hasDateCol, ownerMode, setOwnerMode,
    ownerId, setOwnerId, hasAgentCol, unmatched,
  } = props;

  const users = (ctx.users || []).filter(u => u.active !== false);

  return (
    <>
      <div className="imp-h2">Their stages, your stages</div>
      {!hasStageCol ? (
        <Empty>No column is mapped to Stage, so every contact lands in <b>{fbStageLabel}</b> — the first open stage on this install.</Empty>
      ) : stageVals.length === 0 ? (
        <Empty>The stage column is empty in every row. Everything lands in <b>{fbStageLabel}</b>.</Empty>
      ) : (
        <>
          <div className="imp-vgrid">
            {stageVals.map(v => (
              <div key={v.value} className="imp-vrow">
                <span className="imp-vfrom" title={v.value}>{v.value}</span>
                <span className="imp-vn">{v.n}</span>
                <ArrowRight size={13} className="imp-varr" />
                <select
                  value={stageMap[v.value] || ''}
                  onChange={e => setStageEdits(m => ({ ...m, [v.value]: e.target.value }))}
                >
                  <option value="">Leave unmapped — falls back to {fbStageLabel}</option>
                  {stages.map(s => (
                    <option key={s.key} value={s.key}>{stageLabel(s.key, 'both', settings)}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="imp-note">
            Anything left unmapped falls back to <b>{fbStageLabel}</b>, the first open stage in your settings.
            Nothing is guessed twice: what you set here is what the preview shows.
          </div>
        </>
      )}

      <div className="imp-h2">Their sources, your sources</div>
      {!hasSourceCol ? (
        <Empty>No column is mapped to Lead source, so every contact comes in with no source.</Empty>
      ) : sourceVals.length === 0 ? (
        <Empty>The source column is empty in every row.</Empty>
      ) : (
        <>
          <div className="imp-vgrid">
            {sourceVals.map(v => (
              <div key={v.value} className="imp-vrow">
                <span className="imp-vfrom" title={v.value}>{v.value}</span>
                <span className="imp-vn">{v.n}</span>
                <ArrowRight size={13} className="imp-varr" />
                <select
                  value={sourceMap[v.value] || ''}
                  onChange={e => setSourceEdits(m => ({ ...m, [v.value]: e.target.value }))}
                >
                  <option value="">No source</option>
                  {sources.map(s => <option key={s} value={s}>{s}</option>)}
                  <option value={NEW_SOURCE_KEY}>Add "{v.value}" as a new source</option>
                </select>
              </div>
            ))}
          </div>
          {newSources.length > 0 && (
            <div className={'imp-note' + (ctx.isLeader ? '' : ' warn')}>
              {ctx.isLeader
                ? <>Importing will add {newSources.length} new source{newSources.length === 1 ? '' : 's'} to Settings: <b>{newSources.join(', ')}</b>.</>
                : <>Only a team leader can add to the source list. <b>{newSources.join(', ')}</b> will still be written on each contact, but the source filter will not offer it until a leader adds it in Settings.</>}
            </div>
          )}
        </>
      )}

      {hasDateCol && dateHint.ask && (
        <>
          <div className="imp-h2">Which way round are the dates?</div>
          <div className="imp-daterow">
            <label className={'imp-radio' + (dateOrder === 'mdy' ? ' on' : '')}>
              <input type="radio" name="imp-dateorder" checked={dateOrder === 'mdy'} onChange={() => setDateOrder('mdy')} />
              MM/DD/YYYY (US)
            </label>
            <label className={'imp-radio' + (dateOrder === 'dmy' ? ' on' : '')}>
              <input type="radio" name="imp-dateorder" checked={dateOrder === 'dmy'} onChange={() => setDateOrder('dmy')} />
              DD/MM/YYYY
            </label>
            {dateHint.example && (
              <span className="imp-dim">
                Their file has <b>{dateHint.example}</b> — that reads as{' '}
                {readExample(dateHint.example, dateOrder)} the way you have it set.
              </span>
            )}
          </div>
          <div className="imp-note">
            No date is guessed. Anything that still will not parse is left empty rather than filled in with the wrong day.
          </div>
        </>
      )}
      {hasDateCol && !dateHint.ask && (
        <div className="imp-note">
          <b>Dates.</b> {dateHint.evidence
            ? <>The file settles its own format — <b>{dateHint.evidence}</b> can only be read one way, so it is being read as {dateHint.guess === 'dmy' ? 'DD/MM/YYYY' : 'MM/DD/YYYY'}.</>
            : 'The dates in this file are unambiguous (ISO or written-out months).'} Anything that will not parse is left empty rather than guessed.
        </div>
      )}

      <div className="imp-h2">Who owns these contacts</div>
      {!ctx.isLeader ? (
        <div className="imp-note">
          Everything imported is assigned to you — <b>{ctx.me.name}</b>. Only a team leader can import onto another seat.
        </div>
      ) : (
        <>
          <div className="imp-daterow">
            <Seg
              value={ownerMode}
              onChange={setOwnerMode}
              options={[
                { value: 'me', label: `Me — ${ctx.me.name}` },
                { value: 'user', label: 'One other agent' },
                ...(hasAgentCol ? [{ value: 'file', label: "The file's agent column" }] : []),
              ]}
            />
            {ownerMode === 'user' && (
              <Field label="Assign every row to">
                <select value={ownerId || ''} onChange={e => setOwnerId(e.target.value)}>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </Field>
            )}
          </div>
          {ownerMode === 'file' && (
            <div className={'imp-note' + (unmatched ? ' warn' : '')}>
              <Users size={13} /> The agent column is matched to a seat by name.
              {unmatched
                ? ` ${unmatched} row${unmatched === 1 ? '' : 's'} name someone who is not a seat here — those go to ${ctx.me.name}.`
                : ' Every name in the file matches a seat.'}
            </div>
          )}
        </>
      )}
    </>
  );
}

const readExample = (s, order) => {
  const m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(String(s || ''));
  if (!m) return 'that date';
  const a = +m[1], b = +m[2];
  return order === 'dmy' ? `day ${a} of month ${b}` : `month ${a}, day ${b}`;
};

/* ================================================================ step 4 */

function PreviewStep(props) {
  const {
    ctx, settings, plan, counts, dupRows, skipRows, warnRows,
    dupAction, setDupAction, dupOverrides, setDupOverrides, ragged, blank,
  } = props;
  const shown = plan.rows.slice(0, PREVIEW_ROWS);

  return (
    <>
      <div className="imp-kpis">
        <div className="imp-kpi"><div className="imp-kl">Rows in the file</div><div className="imp-kv">{counts.total}</div></div>
        <div className="imp-kpi good"><div className="imp-kl">Will be created</div><div className="imp-kv">{counts.create}</div></div>
        <div className="imp-kpi"><div className="imp-kl">Will update an existing contact</div><div className="imp-kv">{counts.update}</div></div>
        <div className={'imp-kpi' + (counts.skipNoId + counts.dupSkip ? ' warn' : '')}>
          <div className="imp-kl">Will be skipped</div>
          <div className="imp-kv">{counts.skipNoId + counts.dupSkip}</div>
        </div>
      </div>

      <div className="imp-note">
        {counts.skipNoId > 0 && <> <b>{counts.skipNoId}</b> row{counts.skipNoId === 1 ? '' : 's'} skipped with no name, email or phone — there is nothing to identify that person by. </>}
        {counts.dupSkip > 0 && <> <b>{counts.dupSkip}</b> skipped as duplicates of contacts you already have. </>}
        {blank > 0 && <> {blank} blank line{blank === 1 ? '' : 's'} ignored. </>}
        {ragged.length > 0 && <> {ragged.length} short row{ragged.length === 1 ? '' : 's'} padded with blanks. </>}
        {counts.skipNoId + counts.dupSkip + blank + ragged.length === 0 && 'Every row in this file will be written.'}
      </div>

      {/* ------------------------------------------------------- duplicates */}
      <div className="imp-h2">
        Duplicates — {counts.dups} of {counts.total} row{counts.total === 1 ? '' : 's'} match a contact you already have
      </div>
      {counts.dups === 0 ? (
        <Empty>Nothing in this file matches an existing contact by email, phone or name.</Empty>
      ) : (
        <>
          <div className="imp-duphead">
            <span>Matched on email first, then phone (digits only, so formatting does not matter), then exact name.</span>
            <Seg
              value={dupAction}
              onChange={v => { setDupAction(v); setDupOverrides({}); }}
              options={[
                { value: 'skip', label: 'Skip them all', n: counts.dupSkip },
                { value: 'update', label: 'Update them all', n: counts.update },
              ]}
            />
          </div>
          <div className="tbl-wrap imp-scroll">
            <table className="tbl imp-tbl">
              <thead>
                <tr><th>Row</th><th>In the file</th><th>Matched</th><th>Already here</th><th>What happens</th></tr>
              </thead>
              <tbody>
                {dupRows.map(r => (
                  <tr key={r.n}>
                    <td className="imp-dim">{r.n}</td>
                    <td><b>{r.contact.name}</b><div className="imp-sub">{r.contact.email || phoneFmt(r.contact.phone) || '—'}</div></td>
                    <td><span className="tag">{r.dupOn}</span></td>
                    <td><b>{r.existing.name}</b><div className="imp-sub">{r.existing.email || phoneFmt(r.existing.phone) || '—'}</div></td>
                    <td style={{ width: 190 }}>
                      <select
                        value={dupOverrides[r.n] || dupAction}
                        onChange={e => setDupOverrides(m => ({ ...m, [r.n]: e.target.value }))}
                      >
                        <option value="skip">Skip — leave it alone</option>
                        <option value="update">Update the existing one</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="imp-note">
            <b>Updating never blanks anything out.</b> A non-empty value in the file overwrites the field; an
            empty one leaves what is already there untouched. Notes are added to, not replaced. The existing
            contact keeps its id, its appointments, its checklist and its history, and an owned contact keeps
            its agent — an unclaimed one picks up the owner this import is assigning.
          </div>
        </>
      )}

      {/* -------------------------------------------------------- the rows */}
      <div className="imp-h2">
        The first {Math.min(PREVIEW_ROWS, plan.rows.length)} row{plan.rows.length === 1 ? '' : 's'}, exactly as they will be created
      </div>
      {plan.rows.length === 0 ? (
        <Empty>This file has a header and no data rows.</Empty>
      ) : (
        <div className="tbl-wrap imp-scroll">
          <table className="tbl imp-tbl">
            <thead>
              <tr>
                <th>Row</th><th>Name</th><th>Stage</th><th>Source</th><th>Email</th>
                <th>Phone</th><th>Price</th><th>Created</th><th>Action</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(r => {
                if (!r.contact) {
                  return (
                    <tr key={r.n} className="imp-skip">
                      <td className="imp-dim">{r.n}</td>
                      <td colSpan={7} className="imp-dim">{r.reason}</td>
                      <td><span className="tag">skipped</span></td>
                    </tr>
                  );
                }
                const k = r.contact;
                return (
                  <tr key={r.n} className={r.action === 'dup' ? 'imp-skip' : ''}>
                    <td className="imp-dim">{r.n}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <b>{k.name}</b><SideChip side={k.side} />
                      </div>
                      {r.warnings.length > 0 && <div className="imp-sub warn">{r.warnings[0]}</div>}
                    </td>
                    <td>{stageLabel(k.stage, k.side, settings)}</td>
                    <td>{k.source || <span className="imp-dim">none</span>}</td>
                    <td>{k.email || '—'}</td>
                    <td>{k.phone ? phoneFmt(k.phone) : '—'}</td>
                    <td>{priceText(k)}</td>
                    <td>{k.created_at ? fmtShort(k.created_at) : '—'}</td>
                    <td>
                      <span className={'tag ' + (r.action === 'create' ? 'imp-t-new' : r.action === 'update' ? 'imp-t-upd' : '')}>
                        {r.action === 'create' ? 'create' : r.action === 'update' ? 'update' : 'skip (duplicate)'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {warnRows.length > 0 && (
        <div className="imp-warn">
          <AlertTriangle size={13} /> {warnRows.length} row{warnRows.length === 1 ? ' has' : 's have'} something
          worth a look — an unreadable date, a stage that did not map, or no name to use. They still import; the
          field in question is left empty rather than guessed.
        </div>
      )}
      {skipRows.length > 0 && (
        <div className="imp-note">
          <b>Skipped for having nothing to identify them:</b> row{skipRows.length === 1 ? '' : 's'}{' '}
          {skipRows.slice(0, 12).map(r => r.n).join(', ')}{skipRows.length > 12 ? `, and ${skipRows.length - 12} more` : ''}.
          You can download all of them at the end and fix them in a spreadsheet.
        </div>
      )}
      <div className="imp-note">
        Every contact created carries an activity entry saying which file it came from and on what date, so a
        number that looks wrong six months from now can be traced back to the export it arrived in.
      </div>
    </>
  );
}

/* ================================================================ step 5 */

function DoneStep({ result, fileName }) {
  const { created, updated, skippedNoId, dupSkipped, failed } = result;
  return (
    <>
      <div className="imp-done">
        <CheckCircle2 size={22} />
        <div>
          <div className="imp-done-t">{fileName} imported.</div>
          <div className="imp-done-s">
            <b>{created}</b> created · <b>{updated}</b> updated · <b>{skippedNoId + dupSkipped}</b> skipped
            {failed.length > 0 && <> · <b className="bad">{failed.length}</b> failed</>}
          </div>
        </div>
      </div>

      <div className="imp-kpis">
        <div className="imp-kpi good"><div className="imp-kl">Created</div><div className="imp-kv">{created}</div></div>
        <div className="imp-kpi"><div className="imp-kl">Updated</div><div className="imp-kv">{updated}</div></div>
        <div className="imp-kpi"><div className="imp-kl">Skipped — duplicates</div><div className="imp-kv">{dupSkipped}</div></div>
        <div className={'imp-kpi' + (skippedNoId ? ' warn' : '')}><div className="imp-kl">Skipped — nothing to identify them</div><div className="imp-kv">{skippedNoId}</div></div>
        <div className={'imp-kpi' + (failed.length ? ' bad' : '')}><div className="imp-kl">Failed to write</div><div className="imp-kv">{failed.length}</div></div>
      </div>

      {failed.length > 0 ? (
        <>
          <div className="imp-h2">What failed</div>
          <div className="tbl-wrap imp-scroll">
            <table className="tbl imp-tbl">
              <thead><tr><th>Row</th><th>Why</th><th>First few values</th></tr></thead>
              <tbody>
                {failed.map(f => (
                  <tr key={f.n}>
                    <td className="imp-dim">{f.n}</td>
                    <td className="warn">{f.error}</td>
                    <td className="imp-dim">{(f.cells || []).slice(0, 4).filter(Boolean).join(' · ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="imp-note">Every row that was meant to be written was written.</div>
      )}

      {result.bad.length > 0 && (
        <div className="imp-note">
          <b>{result.bad.length} row{result.bad.length === 1 ? '' : 's'}</b> did not make it in — the failures above
          plus anything skipped for having no name, email or phone. Download them as a CSV, fix them in a
          spreadsheet and import that file again; the duplicate check will stop anything landing twice.
        </div>
      )}
    </>
  );
}

/* ==================================================================== css
   Every class prefixed imp-, in this file, so src/styles.js stays untouched. */

const IMP_CSS = `
.imp-body{padding:16px 20px 4px;overflow:auto;max-height:calc(88vh - 190px)}
.imp-steps{display:flex;gap:6px;flex-wrap:wrap}
.imp-step{font-size:11.5px;font-weight:700;letter-spacing:.02em;color:#8E89A8;background:#F1F2FA;
  border:1px solid #E4E7F5;border-radius:999px;padding:4px 11px}
.imp-step.on{background:${BRAND.colors.cobalt};border-color:${BRAND.colors.cobalt};color:#fff}

.imp-drop{border:2px dashed #C9CEEA;border-radius:18px;background:#F8F9FE;padding:38px 20px;text-align:center;
  cursor:pointer;color:#5A5680;transition:border-color .12s,background .12s}
.imp-drop:hover,.imp-drop.on{border-color:${BRAND.colors.cobalt};background:#F1F4FF}
.imp-drop svg{color:${BRAND.colors.cobalt}}
.imp-drop-t{font-size:15px;font-weight:700;color:${BRAND.colors.ink};margin-top:10px}
.imp-drop-s{font-size:12.5px;color:#8E89A8;margin-top:4px}

.imp-note{font-size:12.5px;line-height:1.55;color:#5A5680;background:#F6F7FD;border:1px solid #E9EBF7;
  border-radius:12px;padding:10px 13px;margin-top:12px}
.imp-note b{color:${BRAND.colors.ink}}
.imp-note.warn{background:#FFF8EC;border-color:#F2E2C2;color:#7A5A20}
.imp-warn{display:flex;align-items:flex-start;gap:8px;font-size:12.5px;line-height:1.5;color:#7A5A20;
  background:#FFF8EC;border:1px solid #F2E2C2;border-radius:12px;padding:10px 13px;margin-top:12px}
.imp-warn svg{flex:none;margin-top:2px}

.imp-h2{font-family:'Space Grotesk',sans-serif;font-size:14px;font-weight:600;color:${BRAND.colors.ink};
  margin:20px 0 9px;padding-bottom:6px;border-bottom:1px solid #EEF0FA}
.imp-head{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:10px}
.imp-head-l{font-size:12.5px;color:#5A5680;line-height:1.5;max-width:640px}
.imp-head-l b{color:${BRAND.colors.ink}}
.imp-head-r{display:flex;align-items:flex-end;gap:10px}
.imp-head-r .field{margin:0;min-width:190px}

.imp-tbl td,.imp-tbl th{font-size:12.5px;vertical-align:top}
.imp-tbl select{width:100%;font-size:12.5px;padding:5px 7px}
.imp-tbl tr.imp-off td{opacity:.55}
.imp-tbl tr.imp-skip td{background:#FAFAFD;color:#8E89A8}
.imp-sample{color:#5A5680;max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.imp-sub{font-size:11.5px;color:#8E89A8;margin-top:2px}
.imp-sub.warn,.imp-tbl td.warn{color:#B0741F}
.imp-dim{color:#928DAD}
.imp-scroll{max-height:330px;overflow:auto}
.imp-t-new{background:#E7F5EC;color:#1F7A45}
.imp-t-upd{background:#EAF0FF;color:${BRAND.colors.cobalt}}

.imp-vgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(430px,1fr));gap:8px}
.imp-vrow{display:flex;align-items:center;gap:8px;background:#F8F9FE;border:1px solid #E9EBF7;
  border-radius:11px;padding:7px 10px}
.imp-vfrom{font-size:12.5px;font-weight:700;color:${BRAND.colors.ink};max-width:170px;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap}
.imp-vn{font-size:11px;font-weight:700;color:#8E89A8;background:#EEF0FA;border-radius:999px;padding:2px 7px}
.imp-varr{color:#C9C6DC;flex:none}
.imp-vrow select{flex:1;min-width:0;font-size:12.5px;padding:5px 7px}

.imp-daterow{display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:12.5px;color:#5A5680}
.imp-daterow .field{margin:0;min-width:200px}
.imp-radio{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:600;color:#5A5680;
  background:#F8F9FE;border:1px solid #E9EBF7;border-radius:10px;padding:7px 12px;cursor:pointer}
.imp-radio.on{border-color:${BRAND.colors.cobalt};color:${BRAND.colors.cobalt};background:#F1F4FF}

.imp-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-bottom:4px}
.imp-kpi{background:#F8F9FE;border:1px solid #E9EBF7;border-radius:14px;padding:11px 13px}
.imp-kpi.good{background:#F1FAF4;border-color:#D5EEDF}
.imp-kpi.warn{background:#FFF8EC;border-color:#F2E2C2}
.imp-kpi.bad{background:#FDF1F1;border-color:#F2D2D2}
.imp-kl{font-size:11px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:#8E89A8;line-height:1.35}
.imp-kv{font-family:'Space Grotesk',sans-serif;font-size:23px;font-weight:600;color:${BRAND.colors.ink};margin-top:3px}

.imp-duphead{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;
  font-size:12.5px;color:#5A5680;margin-bottom:9px}

.imp-run{padding:44px 10px;text-align:center}
.imp-run-t{font-family:'Space Grotesk',sans-serif;font-size:16px;font-weight:600;color:${BRAND.colors.ink}}
.imp-run-s{font-size:12.5px;color:#8E89A8;margin-top:10px}
.imp-bar{height:9px;border-radius:999px;background:#EEF0FA;overflow:hidden;margin:16px auto 0;max-width:520px}
.imp-bar i{display:block;height:100%;background:${BRAND.colors.cobalt};border-radius:999px;transition:width .15s linear}

.imp-done{display:flex;align-items:center;gap:12px;background:#F1FAF4;border:1px solid #D5EEDF;
  border-radius:14px;padding:13px 15px;margin-bottom:12px}
.imp-done svg{color:${BRAND.colors.green};flex:none}
.imp-done-t{font-family:'Space Grotesk',sans-serif;font-size:15.5px;font-weight:600;color:${BRAND.colors.ink}}
.imp-done-s{font-size:12.5px;color:#5A5680;margin-top:2px}
.imp-done-s b{color:${BRAND.colors.ink}}
.imp-done-s b.bad{color:${BRAND.colors.red}}

@media (max-width:720px){
  .imp-vgrid{grid-template-columns:1fr}
  .imp-vfrom{max-width:110px}
}
`;
