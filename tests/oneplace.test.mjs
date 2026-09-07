/* ============================================================================
   A fact has one definition.

   txGross was defined identically in three views. closedOn existed twice, once
   as an exported function and once as a local variable that skipped the
   normalisation. They agreed — the three txGross bodies hashed the same — but
   nothing made them agree, and the comment on one copy records a bug that had
   to be fixed in three files at once:

     "Dragging a card into the Closed column closes the deal WITHOUT writing a
      snapshot, and reading the snapshot alone reported those as $0 of GCI."

   Fix that in two of three and the Dashboard and the Huddle disagree about GCI
   with nothing failing. This is the check that stops the third copy coming back.

   It reads what lib/txn.js exports and asserts no screen defines the same name
   itself — so the list maintains itself: add an export there and it is guarded
   from that moment, with nothing to remember.

   Pure node — reads source, mounts nothing.
   ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';

const read = p => fs.readFileSync(p, 'utf8');

/* comments stripped before scanning: prose that mentions a name is not a
   definition of it, and a check that trips on its own explanation is a check
   people delete. Learned this the hard way on the other install. */
function code(src) {
  let out = '', block = false;
  for (const line of src.split('\n')) {
    let l = line;
    if (block) { const e = l.indexOf('*/'); if (e === -1) { out += '\n'; continue; } block = false; l = l.slice(e + 2); }
    for (;;) {
      const b = l.indexOf('/*'); if (b === -1) break;
      const e = l.indexOf('*/', b + 2);
      if (e === -1) { l = l.slice(0, b); block = true; break; }
      l = l.slice(0, b) + ' ' + l.slice(e + 2);
    }
    out += (/^\s*\/\//.test(l) ? '' : l) + '\n';
  }
  return out;
}

export default async function run(t) {
  const shared = code(read('src/lib/txn.js'));
  const owned = [...shared.matchAll(/export\s+(?:const|function)\s+([A-Za-z_$][\w$]*)/g)].map(m => m[1]);
  t.ok(owned.length > 0, `lib/txn.js owns some facts (${owned.join(', ')})`);

  const screens = ['src/views', 'src/components']
    .flatMap(d => fs.readdirSync(d).filter(f => /\.jsx?$/.test(f)).map(f => path.join(d, f)));

  const dupes = [];
  for (const p of screens) {
    const s = code(read(p));
    for (const name of owned) {
      /* a local definition — not an import, not a call */
      const re = new RegExp(`^\\s*(?:export\\s+)?(?:const|function|let)\\s+${name}\\b`, 'm');
      if (re.test(s)) dupes.push(`${path.basename(p)} defines its own ${name}`);
    }
  }
  t.ok(dupes.length === 0,
    dupes.length ? `no screen redefines a shared fact — found ${dupes.join('; ')}` : 'no screen redefines a shared fact');

  /* And no screen imports a FACT from another screen. Transactions and
     Commission used to import closedOn from Dashboard, and Pipeline imported
     expectedPrice from Contacts — which is how a view quietly becomes a library
     without anyone deciding it should be one.

     COMPONENTS ARE FINE and are not flagged: PCS renders Transactions'
     DeadlineRow, Pipeline renders Contacts' ContactModal. That is composition,
     not a duplicated fact. The two are told apart by the codebase's own
     convention — PascalCase renders, camelCase computes — which is worth
     stating because it is the whole basis of this check. */
  const fromView = [];
  for (const p of screens) {
    const s = code(read(p));
    for (const m of s.matchAll(/import\s*\{([^}]*)\}\s*from\s*'\.\/([A-Z][A-Za-z]*)'/g)) {
      const facts = m[1].split(',').map(x => x.trim().split(/\s+as\s+/)[0]).filter(Boolean)
        .filter(n => /^[a-z]/.test(n));
      for (const f of facts) fromView.push(`${path.basename(p)} imports ${f}() from the ${m[2]} view`);
    }
  }
  t.ok(fromView.length === 0,
    fromView.length ? `no screen imports a fact from another screen — found ${fromView.join('; ')}` : 'no screen imports a fact from another screen');
}
