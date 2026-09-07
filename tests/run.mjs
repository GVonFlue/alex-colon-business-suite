#!/usr/bin/env node
/* ============================================================================
   node tests/run.mjs

   Three suites, one runner:

     1. dates      — the critical-date engine, in plain node
     2. commission — the split / cap engine, in plain node
     3. scoping    — the data layer's own scoping, called at the query level
     4. app        — the REAL app bundled with esbuild and mounted in jsdom,
                     signed in, clicked through every section as the team leader
                     AND as an agent

   jsdom WAS kept out of package.json on purpose — the app itself does not need
   it — and suite 4 skipped with a note when it was absent. That was defensible
   while `npm test` was something a person chose to run. It stopped being
   defensible the moment CI started gating pull requests on this command:
   the suite that mounts the real application is 125 of the 419 checks, and a
   run without it printed one dim line and said "All green".

   So jsdom is a devDependency now and a MISSING one is a failure, not a note.
   esbuild is declared for the same reason: it arrived transitively through
   Vite, which worked until the day Vite changed what it depends on.
   ========================================================================== */

import { readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

/* ---------------------------------------------------------------- reporter */
let pass = 0, fail = 0, suite = '';
const failures = [];
const GREEN = '\x1b[32m', RED = '\x1b[31m', DIM = '\x1b[2m', BOLD = '\x1b[1m', OFF = '\x1b[0m';

const t = {
  ok(cond, msg) {
    if (cond) { pass++; console.log(`  ${GREEN}✓${OFF} ${msg}`); }
    else { fail++; failures.push(`${suite}: ${msg}`); console.log(`  ${RED}✗ ${msg}${OFF}`); }
  },
  eq(actual, expected, msg) {
    const a = JSON.stringify(actual), b = JSON.stringify(expected);
    if (a === b) { pass++; console.log(`  ${GREEN}✓${OFF} ${msg}`); }
    else {
      fail++; failures.push(`${suite}: ${msg}\n      expected ${b}\n      got      ${a}`);
      console.log(`  ${RED}✗ ${msg}${OFF}\n      ${DIM}expected ${b}, got ${a}${OFF}`);
    }
  },
  async throws(fn, msg) {
    try { await fn(); fail++; failures.push(`${suite}: ${msg} (it did NOT throw)`); console.log(`  ${RED}✗ ${msg} — it did not throw${OFF}`); }
    catch { pass++; console.log(`  ${GREEN}✓${OFF} ${msg}`); }
  },
  note(msg) { console.log(`  ${DIM}· ${msg}${OFF}`); },
};

const header = name => { suite = name; console.log(`\n${BOLD}${name}${OFF}`); };

/* ------------------------------------------------------------ pure suites */
const only = process.argv[2] || '';

if (!only || only === 'dates') {
  header('dates — the critical-date engine');
  const mod = await import('./dates.test.mjs');
  await mod.default(t);
}

if (!only || only === 'commission') {
  header('commission — the split / cap engine');
  const mod = await import('./commission.test.mjs');
  await mod.default(t);
}

if (!only || only === 'import') {
  header('import — the CSV does not invent a contact you never made');
  const mod = await import('./import.test.mjs');
  await mod.default(t);
}

if (!only || only === 'activity') {
  header('activity — what happened, what a person did, and the scan that keeps them apart');
  const mod = await import('./activity.test.mjs');
  await mod.default(t);
}

if (!only || only === 'tasks') {
  header('tasks — the buckets a day gets worked in');
  const mod = await import('./tasks.test.mjs');
  await mod.default(t);
}

if (!only || only === 'jarvis') {
  header('jarvis — the payload, and who may see money in it');
  const mod = await import('./jarvis.test.mjs');
  await mod.default(t);
}

if (!only || only === 'oneplace') {
  header('one place — a fact has a single definition');
  const mod = await import('./oneplace.test.mjs');
  await mod.default(t);
}

if (!only || only === 'guards') {
  header('guards — every route that spends money is behind auth');
  const mod = await import('./guards.test.mjs');
  await mod.default(t);
}

if (!only || only === 'kpi') {
  header('kpi — the numbers on the dashboard, huddle, pipeline and board');
  const mod = await import('./kpi.test.mjs');
  await mod.default(t);
}

if (!only || only === 'scoping') {
  header('scoping — the data layer, at the query level');
  /* bundle src/lib/demo.js first: the app's imports are extensionless (Vite
     resolves them; node's ESM resolver does not), and this way the test is
     exercising the same module the browser gets. */
  const esbuild = await import('esbuild');
  const outDir = path.join(root, '.test-build');
  mkdirSync(outDir, { recursive: true });
  const demoFile = path.join(outDir, 'demo.mjs');
  await esbuild.build({
    entryPoints: [path.join(root, 'src', 'lib', 'demo.js')],
    bundle: true, outfile: demoFile, platform: 'neutral', format: 'esm',
    mainFields: ['module', 'main'], logLevel: 'silent',
  });
  const demoMod = await import(demoFile + '?t=' + pass);
  const mod = await import('./scoping.test.mjs');
  await mod.default(t, demoMod);
  try { rmSync(demoFile, { force: true }); } catch {}
}

/* ------------------------------------------------------------- jsdom suite */
if (!only || only === 'app') {
  header('app — the real thing, mounted in jsdom');
  let JSDOM = null;
  try { ({ JSDOM } = await import('jsdom')); }
  catch {
    /* Loud, not quiet. This suite carries the role-scoping assertions; skipping
       it silently is how a red build looks green. */
    fail++;
    failures.push('app: jsdom is not installed — it is a devDependency, so `npm ci` should have provided it');
    console.log(`  ${RED}✗ jsdom is missing — this suite could not run${OFF}`);
  }

  if (JSDOM) {
    const esbuild = await import('esbuild');
    const outDir = path.join(root, '.test-build');
    try { rmSync(outDir, { recursive: true, force: true }); } catch {}
    mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, 'app.cjs');

    /* Bundle the real entry point in demo mode. import.meta.env is replaced at
       build time exactly as Vite would, so the app under test is the shipped
       app, not a variant. */
    await esbuild.build({
      entryPoints: [path.join(root, 'tests', 'entry.jsx')],
      bundle: true, outfile: outFile, platform: 'browser', format: 'cjs',
      jsx: 'transform', loader: { '.js': 'jsx', '.jsx': 'jsx' },
      define: {
        'import.meta.env': JSON.stringify({ VITE_DEMO: '1', MODE: 'test', DEV: false, PROD: true }),
        'process.env.NODE_ENV': '"production"',
      },
      logLevel: 'silent',
    });
    t.ok(existsSync(outFile), 'the app bundles for the harness');

    const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      url: 'https://localhost/', pretendToBeVisual: true, runScripts: 'outside-only',
    });
    const { window } = dom;
    /* jsdom lacks a few browser APIs recharts and the app reach for */
    window.matchMedia = window.matchMedia || (q => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
    window.ResizeObserver = window.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
    window.scrollTo = () => {};
    if (!window.URL.createObjectURL) window.URL.createObjectURL = () => 'blob:test';
    window.print = () => {};

    const g = globalThis;
    const saved = {};
    for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent',
      'CustomEvent', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'ResizeObserver',
      'matchMedia', 'localStorage', 'sessionStorage', 'FileReader', 'Blob', 'File', 'DOMParser', 'SVGElement']) {
      saved[k] = g[k];
      if (window[k] === undefined) continue;
      /* node 22 defines some of these as getter-only on globalThis */
      try { g[k] = window[k]; }
      catch { try { Object.defineProperty(g, k, { value: window[k], configurable: true, writable: true }); } catch {} }
    }
    g.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0);
    g.cancelAnimationFrame = id => clearTimeout(id);
    /* deliberately NOT setting IS_REACT_ACT_ENVIRONMENT: without act() wrappers
       it makes React defer the updates this harness is waiting on. */

    const errors = [];
    const origError = console.error;
    console.error = (...a) => {
      const s = a.map(x => (x && x.message) || String(x)).join(' ');
      /* React's own act() advice is noise here; real exceptions are not */
      if (!/not wrapped in act|Warning:/.test(s)) errors.push(s);
    };
    window.addEventListener('error', e => errors.push(String(e.message || e)));

    const { createRequire } = await import('node:module');
    const require = createRequire(path.join(root, 'tests', 'noop.cjs'));

    let bundle = null;
    const mount = async () => {
      bundle = require(outFile);
      bundle.mount(window.document.getElementById('root'));
    };
    const tick = ms => new Promise(r => setTimeout(r, ms || 30));

    try {
      const mod = await import('./app.test.mjs');
      await mod.default(t, { mount, tick, dom });
      t.eq(errors.filter(e => /Cannot read|is not a function|is not defined|Objects are not valid/.test(e)), [],
        'no exceptions were logged while clicking through the whole app');
    } catch (e) {
      fail++;
      failures.push(`app: harness threw — ${e && e.stack ? e.stack.split('\n').slice(0, 6).join('\n') : e}`);
      console.log(`  ${RED}✗ the harness threw: ${e && e.message}${OFF}`);
      if (e && e.stack) console.log(DIM + e.stack.split('\n').slice(1, 6).join('\n') + OFF);
    } finally {
      console.error = origError;
      for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete g[k]; else g[k] = saved[k]; }
      try { rmSync(outDir, { recursive: true, force: true }); } catch {}
    }
  }
}

/* ------------------------------------------------------------------ result */
console.log(`\n${BOLD}${pass + fail} checks — ${GREEN}${pass} passed${OFF}${fail ? `, ${RED}${fail} failed${OFF}` : ''}${OFF}`);
if (fail) {
  console.log(`\n${RED}${BOLD}Failures${OFF}`);
  failures.forEach(f => console.log(`  ${RED}·${OFF} ${f}`));
  process.exit(1);
}
console.log(`${GREEN}All green.${OFF}\n`);
/* jsdom leaves timers running, which would keep node alive after a green run */
process.exit(0);
