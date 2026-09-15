/* ============================================================================
   tests/contactopen.test.mjs — every contact record opens.

   THE BUG THIS EXISTS FOR. The drawer did `(d.areas || []).map(...)`, which
   guards null and nothing else. A contact whose areas arrived as a STRING —
   "Maize, Goddard", which is what the demo SQL wrote and what any CSV import
   would write — hits .map on a string, throws, and React unmounts the whole
   tree. A blank white page, on some contacts and not others, with a green
   build and 661 passing checks.

   The tab walker could never have caught it: it clicks tabs, and this only
   happens when a RECORD opens. Hence this file.
   ============================================================================ */

import { areaList } from '../src/lib/areas.js';

export default async function run(t, { mount, tick, dom }) {
  /* Shape first. The demo seed holds well-formed contacts, so mounting alone
     cannot reproduce the crash — it took a contact carrying a string where the
     UI writes an array. */
  areaShapes(t);

  const { window } = dom, document = window.document;
  const errs = [];
  window.addEventListener('error', e => errs.push(String(e.message || e)));
  const oldErr = console.error;
  console.error = (...a) => { errs.push(a.map(String).join(' ')); };

  await mount();
  for (let w = 0; w < 9000; w += 50) { if (document.querySelector('.sb .nav-i')) break; await tick(50); }
  await tick(400);

  const tabs = [...document.querySelectorAll('.sb .nav-i')];
  const contacts = tabs.find(b => /contact/i.test(b.textContent));
  if (!contacts) { t.ok(false, 'Contacts tab exists'); console.error = oldErr; return; }
  contacts.click();
  await tick(600);

  const rows = [...document.querySelectorAll('.tbl tbody tr, .tbl .row, [data-contact-row]')];
  console.log('CONTACT ROWS FOUND:', rows.length);

  let opened = 0, crashed = 0;
  for (const r of rows.slice(0, 25)) {
    const before = errs.length;
    r.click();
    await tick(350);
    const body = document.querySelector('.body');
    const txt = body ? (body.textContent || '') : '';
    if (txt.length < 120) { crashed++; console.log('  BLANK after clicking:', (r.textContent||'').trim().slice(0,40)); }
    else opened++;
    if (errs.length > before) console.log('  ERROR on:', (r.textContent||'').trim().slice(0,32), '->', errs[before].slice(0,160));
    const close = document.querySelector('.drw-x, .m-x, [aria-label="Close"]');
    if (close) { close.click(); await tick(200); }
  }
  console.error = oldErr;
  console.log(`opened ${opened}, blank ${crashed}`);
  t.eq(crashed, 0, 'no contact renders a blank page');
  t.eq(errs.filter(e => /Cannot read|is not a function|is not defined|undefined/.test(e)), [], 'no render errors opening contacts');
}

/* ---------------------------------------------------------------------------
   The shape check, run directly rather than through the DOM.

   The demo seed holds well-formed contacts, so mounting alone cannot reproduce
   the crash — it took a contact carrying a string where the UI writes an
   array. These assert the normaliser handles every shape that has actually
   turned up in this product.
   --------------------------------------------------------------------------- */
function areaShapes(t) {
  t.eq(areaList(['Maize', 'Goddard']), ['Maize', 'Goddard'], 'an array passes through');
  t.eq(areaList('Maize, Goddard'), ['Maize', 'Goddard'], 'a comma string becomes an array — this is the crash');
  t.eq(areaList('Maize'), ['Maize'], 'a single value with no comma still becomes an array');
  t.eq(areaList(''), [], 'an empty string is no areas, not one blank chip');
  t.eq(areaList(null), [], 'null is no areas');
  t.eq(areaList(undefined), [], 'undefined is no areas');
  t.eq(areaList(['Maize', '', null]), ['Maize'], 'blanks inside an array are dropped');
  t.eq(areaList('Maize,  , Goddard'), ['Maize', 'Goddard'], 'and blanks between commas too');
}
