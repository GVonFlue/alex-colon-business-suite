/* ============================================================================
   jsdom harness — mounts the REAL app, signed in, and clicks through it.

   Carried over in spirit from the source repo's harness and extended. It does
   not stub the app: it bundles src/main.jsx with esbuild in demo mode, mounts it
   in jsdom, and asserts against the DOM that reaches the screen.

   "A green build is not evidence" — several bugs in the source repo passed both
   a build and a manual click-through. What this catches is the class of failure
   that matters most in a demo: a blank screen on one tab for one role.

   Run through tests/run.mjs, which builds the bundle first.
   ========================================================================== */

export default async function run(t, { mount, tick, dom }) {
  const { window } = dom;
  const document = window.document;

  /* ------------------------------------------------------------------ boot */
  await mount();

  /* Wait for readiness rather than sleeping a fixed number of milliseconds.
     The first paint is behind an async session plus a Promise.all data load, and
     a fixed sleep silently turns into a flaky assertion the moment the bundle
     grows — which is exactly what happened once. */
  const waitFor = async (fn, label, ms = 8000) => {
    const step = 50;
    for (let waited = 0; waited < ms; waited += step) {
      let hit = false;
      try { hit = !!fn(); } catch { hit = false; }
      if (hit) return true;
      await tick(step);
    }
    t.ok(false, `timed out waiting for ${label}`);
    return false;
  };

  await waitFor(() => document.querySelectorAll('.sb .nav-i').length > 0 && document.querySelector('.body'),
    'the app to finish booting');
  /* the nav is computed from whoami, so wait for the seat to resolve too */
  await waitFor(() => (document.querySelector('.sb-foot') || {}).textContent, 'the signed-in seat to resolve');
  await tick(120);

  const text = () => document.body.textContent || '';
  const q = sel => Array.from(document.querySelectorAll(sel));
  const byText = (sel, s) => q(sel).find(e => (e.textContent || '').toLowerCase().includes(String(s).toLowerCase()));
  const click = async el => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); await tick(60); };

  t.ok(document.querySelector('.pt'), 'the app shell mounted');
  t.ok(document.querySelector('.demo-bar'), 'the demo banner is present');
  t.ok(/data resets on refresh/i.test(text()), 'and says the data resets on refresh');
  t.ok(document.querySelector('.viewas'), 'the View-as switcher is present — the only way to show per-seat behaviour without accounts');
  /* The demo boots as the leader. Read the name off the screen rather than
     hardcoding it: the demo leader is rebranded per install (Jeff Schnell on
     the Dwell build, Dana Whitfield on the template) and a literal here turns
     a branding change into a red test for no reason. src/lib/seed.js cannot be
     imported directly — it uses extensionless bundler imports and this file
     runs in raw Node ESM. */
  const leaderName = ((document.querySelector('.sb-me b') || {}).textContent || '').trim();
  const LEADER_FIRST = leaderName.split(/\s+/)[0] || '';
  t.ok(LEADER_FIRST.length > 1, `signed in as the seeded team leader (${leaderName || 'nobody'})`);
  t.ok(/leader/i.test((document.querySelector('.sb-me > div > span') || {}).textContent || ''),
    'and labelled as the leader, not an agent');

  /* the account block is pinned to the bottom of the sidebar and always present,
     so it can never be pushed off-screen by a long nav list */
  t.ok(document.querySelector('.sb-foot'), 'the sidebar has a pinned footer');
  t.ok(document.querySelector('.sb-out'), 'with a sign-out control in it');
  t.ok(document.querySelector('.sb-av'), 'and the signed-in seat');
  t.ok(document.querySelector('.sb-nav'), 'the nav list is its own scroll area');

  /* ------------------------------------------------------- hard-coded brand
     These four are the whole point of the Dwell skin, and every one of them is
     the kind of thing that breaks silently: an image path typo renders a broken
     icon, not an error, and nobody notices until the client does. */
  /* the circuit backdrop is markup, not a background-image, so it is testable */
  const art = document.querySelector('.sb .sb-art');
  t.ok(art, 'the sidebar carries the inline circuit art');
  t.ok(art && art.querySelectorAll('path').length > 10, 'with its traces, arcs and hexes drawn');
  t.ok(art && art.querySelector('.sb-pulse'), 'and the pulsing nodes');
  t.ok(art === document.querySelector('.sb').firstElementChild,
    'as the first child, so everything else stacks above it');

  const sbLogo = document.querySelector('.sb-brand .sb-logo');
  t.ok(sbLogo, "the client's mark is in the sidebar");
  /* Either a bundled per-install asset or a hosted URL from VITE_LOGO_URL.
     Asserting the FILENAME could only ever pass for one install, which is why
     every fork of this template failed its own suite here. */
  const sbSrc = (sbLogo && sbLogo.getAttribute('src')) || '';
  t.ok(/^\/brand\/.+\.(png|jpg|jpeg|svg|webp)$/i.test(sbSrc) || /^https?:\/\//i.test(sbSrc),
    'and it points at a per-install asset or a configured URL');
  t.ok(/business suite/i.test((document.querySelector('.sb-suite') || {}).textContent || ''),
    'with the product line stacked underneath it');

  const suiteLogo = document.querySelector('.suite-bar .suite-logo img');
  t.ok(suiteLogo, 'our own mark is in the bar across the top');
  t.ok(suiteLogo && /\/brand\/proytech-logo\.png$/.test(suiteLogo.getAttribute('src') || ''),
    'and it points at the hard-coded asset');
  t.ok(/business suite/i.test((document.querySelector('.suite-name') || {}).textContent || ''),
    'with "Business Suite" beside it');

  /* the leader seat carries a real headshot; see src/lib/people.js */
  const leaderAv = document.querySelector('.sb-av');
  t.ok(leaderAv && leaderAv.classList.contains('has-photo'),
    'the leader seat renders a headshot rather than initials');
  t.ok(leaderAv && leaderAv.querySelector('img'), 'as an <img> inside the circle');

  /* ------------------------------------------------- every tab, as the leader */
  const navLabels = q('.sb .nav-i').map(b => (b.textContent || '').trim()).filter(Boolean);
  t.ok(navLabels.length >= 9, `the leader gets the full nav (${navLabels.length} sections)`);
  t.ok(navLabels.some(l => /Settings/i.test(l)), 'including Settings');

  const seen = [];
  for (const label of navLabels) {
    const btn = q('.sb .nav-i').find(b => (b.textContent || '').trim() === label);
    if (!btn) continue;
    await click(btn);
    const body = document.querySelector('.body');
    const len = (body && body.textContent ? body.textContent.trim().length : 0);
    t.ok(len > 120, `${label}: renders something substantial (${len} chars), not a blank screen`);
    t.ok(!/Cannot read|undefined is not|NaN%|\$NaN|Objects are not valid/.test(body.textContent || ''),
      `${label}: no rendering wreckage in the DOM`);
    seen.push(label);
  }
  t.eq(seen.length, navLabels.length, 'every section in the nav was visited');

  /* --------------------------------------------------- the daily driver ---- */
  await click(q('.sb .nav-i').find(b => /Dashboard/i.test(b.textContent || '')));
  t.ok(/Critical dates/i.test(text()), 'the dashboard leads with critical dates');
  t.ok(document.querySelector('.cd'), 'and renders at least one deadline card');

  /* it shows the next two and hides the rest behind one box, so a busy week
     cannot turn the dashboard into nothing but this card */
  const dashCards = q('.body .cd').length;
  t.ok(dashCards <= 2, `only the next two deadlines are inline (${dashCards})`);
  const moreBox = document.querySelector('.cd-more');
  t.ok(moreBox, 'the rest sit behind a "more deadlines" box');
  if (moreBox) {
    await click(moreBox);
    t.ok(document.querySelector('.drill'), 'clicking it opens the full list');
    t.ok(document.querySelectorAll('.drill .cd').length > 2, 'which holds every deadline, not just two');
    const x = document.querySelector('.drill .m-x') || document.querySelector('.m-x');
    if (x) await click(x);
  }
  const cdText = q('.cd').map(e => e.textContent || '').join(' ');
  t.ok(/business days|calendar days/.test(cdText), 'each deadline says how it was counted');
  t.ok(/effective date|Effective/.test(cdText), 'and shows the rule that produced it');

  /* the seed guarantees something inside 48 hours, so the flag must be visible */
  t.ok(/inside 48h|today|tomorrow|overdue/i.test(cdText), 'urgency is on screen, not buried');

  /* ------------------------------------------------ transactions + a deadline */
  await click(q('.sb .nav-i').find(b => /Transactions/i.test(b.textContent || '')));
  t.ok(document.querySelector('.kanban'), 'the transactions board renders');
  const arrows = q('.kmv');
  t.ok(arrows.length > 0, 'every card carries ‹ › arrows — the only thing that works on a touchscreen');

  /* Open the transaction that HAS a contract on file (the seed gives Bluff Ridge
     quoted clauses), because the point being tested is that the clause text
     reaches the screen. */
  const card = q('.kcard').find(e => /Bluff Ridge/.test(e.textContent || '')) || document.querySelector('.kcard');
  t.ok(card, 'there is a card to open');
  await click(card);
  await tick(60);
  t.ok(document.querySelector('.modal'), 'the transaction modal opened');
  const modal = document.querySelector('.modal');
  t.ok(/Critical dates/i.test(modal.textContent || ''), 'with the critical dates tab');
  t.ok(modal.querySelector('.cd'), 'and the deadline list');
  const quoted = modal.querySelector('.cd-quote');
  t.ok(quoted, 'the seeded contract-sourced deadlines show the quoted clause');
  t.ok(/business days|calendar days/.test(modal.textContent || ''), 'and the count method');
  t.ok(/Mark met|Waive|Extend/.test(modal.textContent || ''), 'met / waive / extend are all offered');

  /* mark one met and confirm it takes effect in the DOM */
  const metBtn = Array.from(modal.querySelectorAll('button')).find(b => /Mark met/i.test(b.textContent || ''));
  const beforeMet = modal.querySelectorAll('.cd.met').length;
  await click(metBtn);
  await tick(120);
  const afterMet = document.querySelectorAll('.cd.met').length;
  t.ok(afterMet > beforeMet, 'marking a deadline met updates the record and the screen');

  const closeBtn = document.querySelector('.m-x');
  if (closeBtn) await click(closeBtn);

  /* ------------------------------------------------------- pipeline is ONE board */
  await click(q('.sb .nav-i').find(b => /Pipeline/i.test(b.textContent || '')));
  t.ok(document.querySelector('.kanban'), 'the pipeline is a board');
  t.eq(q('.kanban').length, 1, 'ONE board — buyer and seller stages map one-to-one, so there is no second board');
  t.ok(/Buyers/.test(text()) && /Sellers/.test(text()), 'with an All / Buyers / Sellers filter');
  t.ok(document.querySelector('.side-b') || document.querySelector('.side-s'), 'cards carry a side chip');

  /* side-aware labels: switching to Sellers must change a column heading */
  const colsAll = q('.kcol-h .kt').map(e => e.textContent || '').join('|');
  const sellersBtn = byText('.seg-b', 'Sellers');
  if (sellersBtn) {
    await click(sellersBtn);
    const colsSellers = q('.kcol-h .kt').map(e => e.textContent || '').join('|');
    t.ok(colsSellers !== colsAll, 'filtering to Sellers renders the seller-side labels');
    t.ok(/Listing Appt|Live on Market/i.test(colsSellers), 'which are the listing-side words');
    const buyersBtn = byText('.seg-b', 'Buyers');
    if (buyersBtn) {
      await click(buyersBtn);
      const colsBuyers = q('.kcol-h .kt').map(e => e.textContent || '').join('|');
      t.ok(/Buyer Consult|Actively Showing/i.test(colsBuyers), 'and Buyers renders the buyer-side words');
    }
  }

  /* -------------------------------------------------------------- no MRR ---- */
  /* §1: MRR, retainers and invoicing are gone — not hidden, gone. Check every
     section's rendered text, including Settings. */
  const banned = /\bMRR\b|monthly recurring|retainer|invoice|invoicing/i;
  for (const label of navLabels) {
    const btn = q('.sb .nav-i').find(b => (b.textContent || '').trim() === label);
    if (!btn) continue;
    await click(btn);
    const body = document.querySelector('.body');
    const hit = banned.exec(body ? body.textContent || '' : '');
    t.ok(!hit, `${label}: no MRR / retainer / invoicing language anywhere${hit ? ` (found “${hit[0]}”)` : ''}`);
  }

  /* ========================================================================
     VIEW AS AN AGENT — the per-seat behaviour a prospect needs to see
     ====================================================================== */
  const marcusBtn = q('.viewas button').find(b => /Marcus/i.test(b.textContent || ''));
  t.ok(marcusBtn, 'the switcher offers agent A');
  await click(marcusBtn);
  await waitFor(() => /Marcus/.test((document.querySelector('.sb-foot') || {}).textContent || ''), 'the switch to agent A');
  await tick(150);

  t.ok(/Marcus/.test(document.querySelector('.sb-foot').textContent || ''), 'the app is now that agent');
  t.ok(/Agent/.test(document.querySelector('.sb-foot').textContent || ''), 'labelled as an agent, not a leader');

  /* The whole reason the headshot is a lookup and not a hardcoded <img>: an
     agent's seat must show their OWN initials, never the owner's face. */
  const agentAv = document.querySelector('.sb-av');
  t.ok(agentAv && !agentAv.classList.contains('has-photo'),
    "an agent's seat falls back to initials — the owner's headshot does not follow the sidebar");
  t.ok(agentAv && !agentAv.querySelector('img'), 'and renders no image at all');
  t.ok(/MB/.test((agentAv || {}).textContent || ''), 'their own initials, specifically');

  const agentNav = q('.sb .nav-i').map(b => (b.textContent || '').trim());
  t.ok(!agentNav.some(l => /Settings/i.test(l)), 'an agent gets no Settings section');
  t.ok(agentNav.length < navLabels.length, 'and a narrower nav than the leader');

  /* click every tab as the agent too — a blank screen for one role is the
     classic failure this harness exists to catch */
  for (const label of agentNav) {
    const btn = q('.sb .nav-i').find(b => (b.textContent || '').trim() === label);
    if (!btn) continue;
    await click(btn);
    const body = document.querySelector('.body');
    const len = (body && body.textContent ? body.textContent.trim().length : 0);
    t.ok(len > 80, `agent · ${label}: renders (${len} chars)`);
    t.ok(!/Cannot read|undefined is not|\$NaN/.test(body.textContent || ''), `agent · ${label}: no wreckage`);
  }

  /* the other agent's name must not appear anywhere in this agent's app */
  const otherAgent = 'Priya';
  let leakedOn = [];
  for (const label of agentNav) {
    const btn = q('.sb .nav-i').find(b => (b.textContent || '').trim() === label);
    if (!btn) continue;
    await click(btn);
    const body = document.querySelector('.body');
    if (new RegExp(otherAgent).test(body ? body.textContent || '' : '')) leakedOn.push(label);
  }
  t.eq(leakedOn.length, 0, `no other agent's name appears in an agent's app${leakedOn.length ? ` (leaked on ${leakedOn.join(', ')})` : ''}`);

  /* The Books: the agent sees their own expenses and the privacy statement */
  const booksBtn = q('.sb .nav-i').find(b => /Books/i.test(b.textContent || ''));
  if (booksBtn) {
    await click(booksBtn);
    const body = document.querySelector('.body').textContent || '';
    t.ok(/expense/i.test(body), 'The Books renders for an agent');
    t.ok(/team leader|nobody else|private/i.test(body), 'and states the privacy rule in plain language');
    /* the seeded leader-level expense figures must not be here */
    t.ok(!/billboard/i.test(body), "and none of the team leader's own expense rows are visible");
  }

  /* Commission: their own numbers, and the plan is read-only */
  const commBtn = q('.sb .nav-i').find(b => /Commission/i.test(b.textContent || ''));
  if (commBtn) {
    await click(commBtn);
    const body = document.querySelector('.body').textContent || '';
    t.ok(/cap/i.test(body), 'the commission screen shows cap progress');
    t.ok(/team leader sets|read-only|cannot edit|set by your team leader/i.test(body),
      'and says the split/cap plan is not theirs to edit');
  }

  /* ---------------------------------------------- and back as the leader --- */
  const leaderBtn = q('.viewas button').find(b => (b.textContent || '').toLowerCase().includes(LEADER_FIRST.toLowerCase()));
  t.ok(!!leaderBtn, 'the leader is offered in the View-as switcher');
  await click(leaderBtn);
  await waitFor(() => q('.sb .nav-i').some(b => /Settings/i.test(b.textContent || '')), 'the switch back to the leader');
  await tick(150);
  t.ok(q('.sb .nav-i').some(b => /Settings/i.test(b.textContent || '')), 'switching back restores the leader nav');

  /* Settings renders the seat line and the permission matrix */
  await click(q('.sb .nav-i').find(b => /Settings/i.test(b.textContent || '')));
  await tick(120);
  const setBody = document.querySelector('.body').textContent || '';
  t.ok(/of 4 seats used|seats used/i.test(setBody), 'Settings shows the seat count');
  t.ok(/contact ProyTech/i.test(setBody), 'with the "contact ProyTech to add more" route — no self-serve billing in v1');
  t.ok(/Permission/i.test(setBody), 'and the permission matrix');

  /* Settings cards are collapsed by default, so open the permissions one before
     asserting on its contents */
  const permCard = q('.msec-h, .card h3, .msec-t').find(e => /permission/i.test(e.textContent || ''));
  if (permCard) {
    await click(permCard);
    await tick(120);
    const permText = document.querySelector('.body').textContent || '';
    t.ok(/never/i.test(permText), 'where editing your own split reads "never"');
    t.ok(/database|polic/i.test(permText), 'and it says these mirror the database policies rather than being the enforcement');
  } else {
    t.ok(false, 'could not find the permissions card to open');
  }
}
