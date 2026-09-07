import React, { useState, useRef, useEffect, useMemo, useReducer } from 'react';
import {
  Send, Loader2, Cpu, Zap, X, Paperclip, Check, AlertTriangle,
  StickyNote, ListTodo, CalendarClock, AtSign, Trash2,
} from 'lucide-react';
import { BRAND, AI_NAME } from '../lib/brand';
import {
  buildPayload, parseReply, validateActions, describeAction,
  visibleContacts, visibleTxns, JARVIS_MAX_TURNS,
} from '../lib/jarvis';
import { apiPost } from '../lib/data';
import { alpha } from '../lib/color';

/* ============================================================================
   JARVIS — ask the CRM anything.
   ----------------------------------------------------------------------------
   The chat surface. All of the security-critical logic lives in
   src/lib/jarvis.js so it can be unit-tested without a browser; this file is
   presentation, plus the one thing that must be here: running a confirmed
   action through the app's OWN mutators.

   That last part matters. This component never writes to Supabase and never
   builds a row itself. It calls ctx.upsertContact and ctx.upsertTask — the same
   writers every other screen calls — so a confirmed action goes through exactly
   the path a human click would, and cannot race with one.

   Styling is a self-contained <style> block scoped under .jv. Nothing here
   leaks into the rest of the CRM and nothing in the CRM restyles it.
   ========================================================================== */

const CSS = `
/* JARVIS — the CRM's own hardware, not a chat widget bolted on.
   Same vocabulary as the sidebar: the deep navy plate, the 26px circuit grid,
   right-angle traces in cobalt-to-cyan, and an active state that is a LIT EDGE
   rather than a solid slab. The Iron Man part is the arc reactor, the HUD
   brackets, and hot-rod red + gold carrying anything that needs a human. */
.jv{--arc:#38BDF8;--arc2:#7FD8FF;--arc3:#EAFBFF;--cob:#2B4DE0;
  --gold:#E0A22B;--gold2:#F2C55C;--hot:#C1352B;
  --plate:#0F1433;--plate2:#0A0E27;--plate3:#05071A;
  display:flex;flex-direction:column;height:calc(100vh - 168px);min-height:440px;
  border-radius:18px;overflow:hidden;position:relative;color:#DCF3FB;
  background:radial-gradient(1200px 460px at 50% -14%,rgba(56,189,248,.17),transparent 64%),
             linear-gradient(180deg,var(--plate) 0%,var(--plate2) 55%,var(--plate3) 100%);
  border:1px solid rgba(56,189,248,.22);
  box-shadow:0 26px 70px -34px rgba(0,0,0,.9),inset 0 1px 0 rgba(127,216,255,.12)}
.jv *{box-sizing:border-box}

/* backdrop layers: circuit traces, then scanlines, then HUD brackets */
.jv-art{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;opacity:.85}
.jv-scan{position:absolute;inset:0;pointer-events:none;z-index:0;opacity:.2;
  background:repeating-linear-gradient(0deg,rgba(56,189,248,.06) 0 1px,transparent 1px 3px)}
.jv-hud{position:absolute;inset:0;pointer-events:none;z-index:3}
.jv-hud i{position:absolute;width:15px;height:15px;border:1px solid rgba(127,216,255,.45)}
.jv-hud i:nth-child(1){top:9px;left:9px;border-right:0;border-bottom:0}
.jv-hud i:nth-child(2){top:9px;right:9px;border-left:0;border-bottom:0}
.jv-hud i:nth-child(3){bottom:9px;left:9px;border-right:0;border-top:0}
.jv-hud i:nth-child(4){bottom:9px;right:9px;border-left:0;border-top:0}
.jv>*:not(.jv-art):not(.jv-scan):not(.jv-hud){position:relative;z-index:1}

/* ---------------------------------------------------------------- the head */
.jv-top{display:flex;align-items:center;gap:14px;padding:15px 20px;
  border-bottom:1px solid rgba(56,189,248,.16);background:linear-gradient(180deg,rgba(5,7,26,.62),rgba(5,7,26,.3))}
/* the arc reactor: white-hot core, cobalt bloom, two rings */
.jv-arc{width:36px;height:36px;flex:none;border-radius:50%;position:relative;
  background:radial-gradient(circle,var(--arc3) 0%,var(--arc2) 20%,var(--arc) 40%,${alpha(BRAND.colors.cobalt,.34)} 62%,transparent 75%);
  box-shadow:0 0 20px rgba(56,189,248,.8),0 0 48px rgba(56,189,248,.28),inset 0 0 9px rgba(234,251,255,.55)}
.jv-arc:before,.jv-arc:after{content:'';position:absolute;border-radius:50%;border:1px solid rgba(127,216,255,.6)}
.jv-arc:before{inset:5px}
.jv-arc:after{inset:11px;border-color:rgba(234,251,255,.95);box-shadow:0 0 11px rgba(127,216,255,.85)}
.jv[data-busy="1"] .jv-arc{animation:jvspin 1.15s linear infinite}
@keyframes jvspin{to{transform:rotate(360deg)}}
.jv-name{font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:16.5px;color:#F2FCFF;
  letter-spacing:.2em;text-transform:uppercase;line-height:1.12;text-shadow:0 0 16px rgba(56,189,248,.5)}
.jv-sub{font-family:'Space Mono',ui-monospace,monospace;font-size:9.5px;color:rgba(127,216,255,.6);
  letter-spacing:.22em;text-transform:uppercase;margin-top:3px}
.jv-meter{margin-left:auto;text-align:right;font-family:'Space Mono',ui-monospace,monospace;
  font-size:9.5px;color:rgba(127,216,255,.62);letter-spacing:.12em;text-transform:uppercase}
.jv-bar{width:104px;height:3px;border-radius:2px;background:rgba(56,189,248,.15);margin-top:6px;overflow:hidden;
  box-shadow:inset 0 0 0 1px rgba(56,189,248,.12)}
.jv-bar i{display:block;height:100%;background:linear-gradient(90deg,var(--cob),var(--arc),var(--arc2));
  box-shadow:0 0 10px rgba(56,189,248,.85)}
.jv-bar.warn i{background:linear-gradient(90deg,var(--gold),var(--gold2));box-shadow:0 0 10px rgba(224,162,43,.85)}
.jv-bar.over i{background:linear-gradient(90deg,var(--hot),#E4695E);box-shadow:0 0 10px rgba(193,53,43,.9)}

/* ---------------------------------------------------------------- the feed */
.jv-feed{flex:1;overflow-y:auto;padding:22px 20px 10px;display:flex;flex-direction:column;gap:16px;
  scrollbar-width:thin;scrollbar-color:rgba(56,189,248,.22) transparent}
.jv-feed::-webkit-scrollbar{width:6px}
.jv-feed::-webkit-scrollbar-thumb{background:rgba(56,189,248,.22);border-radius:3px}
.jv-feed::-webkit-scrollbar-thumb:hover{background:rgba(56,189,248,.36)}

.jv-hello{margin:auto 0;text-align:center;padding:16px 8px}
.jv-hello h3{font-family:'Space Grotesk',sans-serif;color:#F2FCFF;font-size:20px;margin:0 0 7px;font-weight:600;
  letter-spacing:.02em;text-shadow:0 0 22px rgba(56,189,248,.4)}
.jv-hello p{color:rgba(200,229,242,.6);font-size:13px;margin:0 0 20px;line-height:1.65}
.jv-seeds{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;max-width:560px;margin:0 auto}
/* seeds echo .nav-i: quiet plate, lit edge on hover */
.jv-seed{background:rgba(56,189,248,.06);border:1px solid rgba(56,189,248,.22);color:#B9E9FA;
  border-radius:9px;padding:9px 15px;font-size:12.5px;cursor:pointer;font-family:inherit;
  transition:.16s;text-align:left;position:relative}
.jv-seed:hover{background:linear-gradient(90deg,${alpha(BRAND.colors.cobalt,.4)},${alpha(BRAND.colors.cobalt,.13)});color:#fff;
  border-color:rgba(56,189,248,.45);box-shadow:inset 2px 0 0 var(--arc),0 0 22px -8px rgba(56,189,248,.6)}

.jv-msg{display:flex;flex-direction:column;gap:5px;max-width:88%}
.jv-msg.me{align-self:flex-end;align-items:flex-end}
.jv-tag{font-family:'Space Mono',ui-monospace,monospace;font-size:9px;letter-spacing:.22em;
  text-transform:uppercase;color:rgba(127,216,255,.5)}
.jv-msg.me .jv-tag{color:rgba(224,162,43,.7)}
.jv-body{padding:12px 15px;border-radius:11px;font-size:14px;line-height:1.68;white-space:pre-wrap;word-break:break-word}
/* the assistant speaks from the machine: cobalt plate, lit cyan edge */
.jv-msg.them .jv-body{background:linear-gradient(90deg,${alpha(BRAND.colors.cobalt,.2)},${alpha(BRAND.colors.cobalt,.06)});
  border:1px solid rgba(56,189,248,.2);color:#DCF3FB;
  box-shadow:inset 2px 0 0 var(--arc),0 0 26px -12px rgba(56,189,248,.6)}
/* the human speaks in gold */
.jv-msg.me .jv-body{background:linear-gradient(270deg,rgba(224,162,43,.16),rgba(224,162,43,.05));
  border:1px solid rgba(224,162,43,.3);color:#F6E7C8;box-shadow:inset -2px 0 0 var(--gold)}
.jv-err .jv-body{background:linear-gradient(90deg,rgba(193,53,43,.2),rgba(193,53,43,.06));
  border-color:rgba(193,53,43,.45);color:#FFC9C2;box-shadow:inset 2px 0 0 var(--hot)}

/* ------------------------------------------------------------- the actions */
.jv-acts{display:flex;flex-direction:column;gap:7px;margin-top:10px;width:100%}
.jv-alab{font-family:'Space Mono',ui-monospace,monospace;font-size:9px;letter-spacing:.2em;
  text-transform:uppercase;color:rgba(224,162,43,.8)}
.jv-act{display:flex;align-items:center;gap:10px;
  background:linear-gradient(90deg,rgba(224,162,43,.11),rgba(224,162,43,.03));
  border:1px solid rgba(224,162,43,.3);border-radius:10px;padding:10px 12px;
  box-shadow:inset 2px 0 0 var(--gold)}
.jv-act svg{flex:none;color:var(--gold)}
.jv-act span{flex:1;font-size:12.5px;color:#F1DFBB;line-height:1.45;word-break:break-word}
.jv-act button{border:0;border-radius:7px;padding:6px 12px;font-size:11.5px;font-weight:600;
  cursor:pointer;font-family:inherit;flex:none;letter-spacing:.02em}
.jv-run{background:linear-gradient(180deg,var(--gold2),var(--gold));color:#241B06;
  box-shadow:0 0 16px -4px rgba(224,162,43,.8)}
.jv-run:hover{background:var(--gold2)}
.jv-skip{background:transparent;color:rgba(241,223,187,.5)}
.jv-skip:hover{color:#F1DFBB}
.jv-act.done{border-color:rgba(63,185,120,.42);background:linear-gradient(90deg,rgba(63,185,120,.13),rgba(63,185,120,.03));
  box-shadow:inset 2px 0 0 #3FB978}
.jv-act.done svg,.jv-act.done span{color:#A8E9C4}

/* ---------------------------------------------------------------- the foot */
.jv-foot{border-top:1px solid rgba(56,189,248,.16);background:linear-gradient(0deg,rgba(5,7,26,.7),rgba(5,7,26,.34));padding:12px 16px}
.jv-pins{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:9px}
.jv-pin{display:inline-flex;align-items:center;gap:6px;background:rgba(56,189,248,.11);
  border:1px solid rgba(56,189,248,.3);border-radius:7px;padding:4px 6px 4px 11px;font-size:11.5px;color:#BDEAFA;
  box-shadow:inset 2px 0 0 rgba(56,189,248,.7)}
.jv-pin button{background:none;border:0;color:rgba(189,234,250,.55);cursor:pointer;display:flex;padding:1px}
.jv-pin button:hover{color:#fff}
.jv-row{display:flex;align-items:flex-end;gap:8px}
.jv-in{flex:1;background:rgba(56,189,248,.05);border:1px solid rgba(56,189,248,.24);border-radius:10px;
  padding:11px 13px;color:#F2FCFF;font-size:14px;font-family:inherit;resize:none;max-height:132px;line-height:1.5}
.jv-in:focus{outline:none;border-color:rgba(56,189,248,.6);box-shadow:0 0 0 3px rgba(56,189,248,.12),0 0 26px -10px rgba(56,189,248,.8)}
.jv-in::placeholder{color:rgba(127,216,255,.34)}
.jv-ico{width:40px;height:40px;flex:none;border-radius:10px;border:1px solid rgba(56,189,248,.24);
  background:rgba(56,189,248,.05);color:var(--arc2);display:flex;align-items:center;justify-content:center;
  cursor:pointer;transition:.16s}
.jv-ico:hover{background:rgba(56,189,248,.14);border-color:rgba(56,189,248,.45)}
.jv-ico.on{background:linear-gradient(180deg,rgba(224,162,43,.24),rgba(224,162,43,.1));
  border-color:rgba(224,162,43,.5);color:var(--gold);box-shadow:0 0 18px -6px rgba(224,162,43,.9)}
.jv-send{width:40px;height:40px;flex:none;border-radius:10px;border:0;cursor:pointer;
  background:linear-gradient(150deg,var(--arc2),var(--arc) 55%,var(--cob));color:#04121A;
  display:flex;align-items:center;justify-content:center;box-shadow:0 0 20px -6px rgba(56,189,248,.95)}
.jv-send:disabled{opacity:.3;cursor:default;box-shadow:none}
.jv-hint{font-family:'Space Mono',ui-monospace,monospace;font-size:9px;color:rgba(127,216,255,.38);
  letter-spacing:.12em;margin-top:9px;display:flex;gap:14px;flex-wrap:wrap;text-transform:uppercase}

/* -------------------------------------------------------------- the picker */
.jv-picker{position:absolute;left:16px;right:16px;bottom:74px;max-height:260px;overflow-y:auto;z-index:5;
  background:linear-gradient(180deg,#0F1433,#080B20);border:1px solid rgba(56,189,248,.32);border-radius:12px;
  padding:9px;box-shadow:0 20px 50px -18px rgba(0,0,0,.95),inset 0 1px 0 rgba(127,216,255,.1)}
.jv-psearch{width:100%;background:rgba(56,189,248,.06);border:1px solid rgba(56,189,248,.22);border-radius:8px;
  padding:8px 11px;color:#F2FCFF;font-size:13px;font-family:inherit;margin-bottom:7px}
.jv-psearch:focus{outline:none;border-color:rgba(56,189,248,.55)}
.jv-prow{display:block;width:100%;text-align:left;background:none;border:0;color:#CDEBF8;padding:8px 10px;
  border-radius:8px;cursor:pointer;font-size:13px;font-family:inherit;transition:.14s}
.jv-prow:hover{background:linear-gradient(90deg,${alpha(BRAND.colors.cobalt,.42)},${alpha(BRAND.colors.cobalt,.12)});color:#fff;
  box-shadow:inset 2px 0 0 var(--arc)}
.jv-prow i{display:block;font-style:normal;font-size:11px;color:rgba(127,216,255,.48);margin-top:1px}
.jv-pempty{padding:12px;text-align:center;color:rgba(127,216,255,.42);font-size:12.5px}

@media(prefers-reduced-motion:reduce){.jv[data-busy="1"] .jv-arc{animation:none}}
@media(max-width:720px){.jv{height:calc(100vh - 210px)}.jv-msg{max-width:96%}.jv-meter{display:none}
  .jv-hud i{width:11px;height:11px}}
`;

/* The circuit backdrop. Same grammar as SidebarArt in App.jsx — a faint 26px
   grid, traces that turn at right angles the way real ones do, and nodes where
   they terminate — so the assistant reads as part of the same machine. */
const JarvisArt = () => (
  <svg className="jv-art" viewBox="0 0 900 600" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="jvtr" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#38BDF8" stopOpacity=".5"/>
        <stop offset="55%" stopColor="#2B4DE0" stopOpacity=".28"/>
        <stop offset="100%" stopColor="#2B4DE0" stopOpacity=".07"/>
      </linearGradient>
      <radialGradient id="jvnd"><stop offset="0%" stopColor="#7FD8FF"/><stop offset="100%" stopColor="#38BDF8" stopOpacity="0"/></radialGradient>
      <pattern id="jvgr" width="26" height="26" patternUnits="userSpaceOnUse">
        <path d="M26 0H0V26" fill="none" stroke="#5B8DEF" strokeOpacity=".05" strokeWidth="1"/>
      </pattern>
    </defs>
    <rect width="900" height="600" fill="url(#jvgr)"/>
    <g fill="none" stroke="url(#jvtr)" strokeWidth="1" strokeLinecap="square">
      <path d="M40 70 L40 180 L64 204 L64 360 L44 380 L44 540"/>
      <path d="M64 240 L120 240 L136 256 L136 330"/>
      <path d="M860 50 L860 170 L832 198 L832 330 L852 350 L852 546"/>
      <path d="M832 230 L770 230 L752 248 L752 320"/>
      <path d="M136 470 L136 512 L158 534 L240 534"/>
      <path d="M752 430 L752 486 L730 508 L648 508"/>
    </g>
    <g fill="url(#jvnd)">
      <circle cx="64" cy="204" r="7"/><circle cx="136" cy="330" r="6"/>
      <circle cx="832" cy="198" r="7"/><circle cx="752" cy="320" r="6"/>
      <circle cx="240" cy="534" r="5"/><circle cx="648" cy="508" r="5"/>
    </g>
  </svg>
);

const ICONS = { note: StickyNote, task: ListTodo, followup: CalendarClock, tag: AtSign };

/* Openers, per role. The coordinator's are deliberately about dates and files
   rather than production: those are the questions they can actually get an
   answer to, and offering "how did we do on GCI" to somebody the payload has
   no money for would be an invitation to a dead end. */
const SEEDS = {
  leader: [
    'Who has gone quiet that I should call this week?',
    'Which deals are closing this month?',
    'Where does the team stand against cap?',
    'Which lead sources actually produced closings this year?',
  ],
  agent: [
    'Which of my contacts has gone quiet?',
    'What should I work on first today?',
    'Where does my pipeline stand?',
    'What is outstanding on my under-contract files?',
  ],
  coordinator: [
    'Which files have a deadline in the next seven days?',
    'What is missing on the files closing this month?',
    'Which transactions have gone quiet?',
    'Show me every file still in the inspection phase',
  ],
};

/* ---------------------------------------------------------------------------
   THE CONVERSATION OUTLIVES THE COMPONENT.

   Jarvis is mounted by a view ternary in App, so opening a lead unmounts it and
   useState throws the thread away. The thread lives out here instead: module
   scope, so it survives an unmount and dies on reload. A refresh starting fresh
   is deliberate, and module scope gets exactly that for free — no clearing code
   to write, and nothing persisted anywhere it would have to be cleaned up.

   It is a small store rather than a plain object because a request can outlive
   the mount: ask a question, click into a lead, and the answer lands while
   nothing is rendering. Writes go to the store first and notify whoever is
   listening, so that answer is waiting when you come back — and arrives on its
   own if you are already back.

   Keyed by uid. Two people sharing a browser must not inherit each other's
   thread: it quotes contacts by name, and one agent's contacts are not another's.
   -------------------------------------------------------------------------- */
const BLANK = { uid: null, msgs: [], pins: [], deep: false, q: '', busy: false };
let S = { ...BLANK };
const subs = new Set();
const put = patch => { S = { ...S, ...patch }; for (const f of [...subs]) f(); };
/* exported for sign-out, and so a test can start from a known thread */
export const resetJarvis = () => put({ ...BLANK });

/* PORTED FROM GVonFlue/proytech-crm/src/Jarvis.jsx. The conversation store,
   the action buttons, the budget meter and the pinning are that file's.
   Adapted to Dwell's conventions: a view takes { ctx } rather than fifteen
   props, and it writes through ctx.upsertContact / ctx.upsertTask. */
export default function Assistant({ ctx }) {
  const me = (ctx.me && ctx.me.name) || '';
  const myUid = (ctx.me && ctx.me.id) || '';
  const role = (ctx.me && ctx.me.role) || 'agent';
  const permissions = ctx.perms || {};
  const stages = (ctx.settings && ctx.settings.stages) || [];
  const teamNames = (ctx.users || []).filter(u => u && u.active !== false).map(u => u.name);
  const myPools = (ctx.me && ctx.me.pools) || [];
  /* A different person is signed in now — the thread does not carry over.
     Assigned rather than put(): this is render, so nobody else may be told. */
  if (S.uid !== (myUid ?? null)) S = { ...BLANK, uid: myUid ?? null };

  const [, force] = useReducer(x => x + 1, 0);
  useEffect(() => { subs.add(force); return () => { subs.delete(force); }; }, []);

  /* Same names and the same shapes as the useState pair they replace, so every
     call site below reads unchanged — including the functional updaters, which
     a late answer depends on resolving against the store and not a closure. */
  const { msgs, q, busy, deep, pins } = S;
  const setMsgs = v => put({ msgs: typeof v === 'function' ? v(S.msgs) : v });
  const setQ    = v => put({ q:    typeof v === 'function' ? v(S.q)    : v });
  const setBusy = v => put({ busy: typeof v === 'function' ? v(S.busy) : v });
  const setDeep = v => put({ deep: typeof v === 'function' ? v(S.deep) : v });
  const setPins = v => put({ pins: typeof v === 'function' ? v(S.pins) : v });

  /* Transient: a half-open lead picker or a spend readout is not conversation,
     and restoring it on the way back in would be noise, not continuity. */
  const [picker, setPicker] = useState(false);
  const [pq, setPq] = useState('');
  const [spend, setSpend] = useState(null);
  const feed = useRef(null);
  const box = useRef(null);

  /* The rows this person may have in play, computed the same way RLS computes
     them. Everything downstream — the index, the detail, and the id whitelist
     actions are validated against — reads from THESE, so a coordinator can
     never end up with money in play and an agent can never end up with
     somebody else's contact. */
  const mine = useMemo(
    () => visibleContacts(ctx.contacts, { role, myUid, pools: myPools }),
    [ctx.contacts, role, myUid, myPools]
  );
  const myTxns = useMemo(
    () => visibleTxns(ctx.transactions, { role, myUid }),
    [ctx.transactions, role, myUid]
  );
  const visibleIds = useMemo(() => mine.map(c => String(c.id)), [mine]);
  const byId = useMemo(() => {
    const m = {};
    for (const c of mine) m[String(c.id)] = c;
    return m;
  }, [mine]);

  useEffect(() => {
    if (feed.current) feed.current.scrollTop = feed.current.scrollHeight;
  }, [msgs, busy]);

  const grow = e => {
    setQ(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(132, el.scrollHeight) + 'px';
  };

  const ask = async text => {
    const question = String(text == null ? q : text).trim();
    if (!question || busy) return;
    setQ('');
    if (box.current) box.current.style.height = 'auto';
    setPicker(false);

    /* Only the plain text of earlier turns is replayed — never the data blocks.
       Resending 12k tokens of index per historical turn is how a chat feature
       quietly costs ten times what it should. */
    const history = msgs
      .filter(m => !m.error)
      .slice(-JARVIS_MAX_TURNS * 2)
      .map(m => ({ role: m.who === 'me' ? 'user' : 'assistant', content: m.text }));

    const next = [...msgs, { who: 'me', text: question, pins: [...pins] }];
    setMsgs(next);
    setBusy(true);

    try {
      const { payload, stats } = buildPayload({
        contacts: mine, txns: myTxns, question, pinned: pins.map(p => p.id), history,
        role, permissions, myUid, me, stages, teamNames,
        tasks: ctx.tasks, money: ctx.jarvisMoney || null,
      });

      /* apiPost is the only thing that attaches the session token, and
         tests/guards.test.mjs fails the build if any screen reaches /api/*
         without it. */
      const r = await apiPost('/api/jarvis', { payload, deep });
      const j = await r.json();

      if (!j.ok) {
        setMsgs(m => [...m, { who: 'them', text: j.error || 'Something went wrong.', error: true }]);
      } else {
        const parsed = parseReply(j.text);
        const { actions } = validateActions(parsed.actions, { visibleIds, teamNames });
        setMsgs(m => [...m, {
          who: 'them',
          text: parsed.answer || 'I could not put an answer together for that one.',
          actions: actions.map(a => ({ ...a, state: 'open' })),
          stats,
        }]);
        if (j.spent !== null && j.spent !== undefined) setSpend({ spent: j.spent, budget: j.budget });
      }
    } catch {
      setMsgs(m => [...m, { who: 'them', text: 'Could not reach the assistant. Check your connection and try again.', error: true }]);
    }
    setBusy(false);
    setPins([]);
  };

  /* Confirmed actions run through the app's own mutators — never a direct
     write. If a mutator is missing (a client install without tasks, say) the
     action is refused rather than silently doing nothing. */
  const run = (mi, ai) => {
    const msg = msgs[mi];
    const a = msg && msg.actions && msg.actions[ai];
    if (!a || a.state !== 'open') return;
    const contact = byId[String(a.leadId)];
    try {
      if (a.kind === 'note') {
        /* Appends to the contact's activity through the app's own writer, and
           deliberately does NOT stamp lastTouch: the assistant recording what
           you told it is not the same as you having contacted somebody.
           saveToContact() takes that decision explicitly, for the same reason. */
        if (!contact) throw new Error('no');
        const entry = {
          id: 'jv_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          at: new Date().toISOString(), kind: 'note', note: a.text, by: myUid || null,
        };
        ctx.upsertContact({ ...contact, activity: [entry, ...(contact.activity || [])] });
      } else if (a.kind === 'task') {
        ctx.upsertTask({
          id: 'jv_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          user_id: myUid, contact_id: contact ? contact.id : null, transaction_id: null,
          title: a.title, due: a.due || null, done: false,
          created_at: new Date().toISOString(),
        });
      }
      setMsgs(m => m.map((x, i) => i !== mi ? x
        : { ...x, actions: x.actions.map((y, k) => k === ai ? { ...y, state: 'done' } : y) }));
    } catch {
      setMsgs(m => m.map((x, i) => i !== mi ? x
        : { ...x, actions: x.actions.map((y, k) => k === ai ? { ...y, state: 'failed' } : y) }));
    }
  };

  const skip = (mi, ai) => setMsgs(m => m.map((x, i) => i !== mi ? x
    : { ...x, actions: x.actions.map((y, k) => k === ai ? { ...y, state: 'skipped' } : y) }));

  const pick = l => {
    if (!pins.some(p => p.id === l.id)) {
      setPins([...pins, { id: l.id, name: l.name || l.company || 'Unnamed' }]);
    }
    setPicker(false);
    setPq('');
  };

  const results = useMemo(() => {
    const s = pq.trim().toLowerCase();
    const pool = s
      ? mine.filter(l => `${l.name || ''} ${l.company || ''}`.toLowerCase().includes(s))
      : mine.slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    return pool.slice(0, 40);
  }, [mine, pq]);

  const pct = spend && spend.budget ? Math.min(100, (spend.spent / spend.budget) * 100) : 0;
  const barClass = pct >= 100 ? 'jv-bar over' : pct >= 75 ? 'jv-bar warn' : 'jv-bar';
  const seeds = SEEDS[role] || SEEDS.agent;

  return (
    <>
      <style>{CSS}</style>
      <div className="jv" data-busy={busy ? '1' : '0'}>
        <JarvisArt />
        <div className="jv-scan" />
        <div className="jv-hud"><i /><i /><i /><i /></div>

        <div className="jv-top">
          <div className="jv-arc" />
          <div>
            <div className="jv-name">{AI_NAME}</div>
            <div className="jv-sub">{busy ? 'Processing' : `${BRAND.name} · ${mine.length} records online`}</div>
          </div>
          {spend && (
            <div className="jv-meter">
              ${spend.spent.toFixed(2)} / ${spend.budget}
              <div className={barClass}><i style={{ width: pct + '%' }} /></div>
            </div>
          )}
        </div>

        <div className="jv-feed" ref={feed}>
          {!msgs.length && (
            <div className="jv-hello">
              <h3>At your service.</h3>
              <p>
                Ask me anything about {role === 'coordinator'
                  ? 'the files, the phases and the dates'
                  : 'your contacts, your transactions, or where things stand'}.
                I can see every record you can — pin one with the clip if you want the full history.
              </p>
              <div className="jv-seeds">
                {seeds.map(s => (
                  <button key={s} className="jv-seed" onClick={() => ask(s)}>{s}</button>
                ))}
              </div>
            </div>
          )}

          {msgs.map((m, mi) => (
            <div key={mi} className={'jv-msg ' + (m.who === 'me' ? 'me' : 'them') + (m.error ? ' jv-err' : '')}>
              <div className="jv-tag">
                {m.who === 'me' ? (me || 'You') : AI_NAME}
                {m.stats && m.stats.hydrated > 0 ? ` · read ${m.stats.hydrated} in full` : ''}
              </div>
              <div className="jv-body">{m.text}</div>

              {!!(m.actions && m.actions.length) && (
                <div className="jv-acts">
                  <div className="jv-alab">Suggested — nothing happens until you say so</div>
                  {m.actions.map((a, ai) => {
                    const Ico = ICONS[a.kind] || StickyNote;
                    const lead = byId[String(a.leadId)];
                    const label = describeAction(a, lead && (lead.name || lead.company));
                    if (a.state === 'skipped') return null;
                    return (
                      <div key={ai} className={'jv-act' + (a.state === 'done' ? ' done' : '')}>
                        {a.state === 'done' ? <Check size={15} /> : a.state === 'failed' ? <AlertTriangle size={15} /> : <Ico size={15} />}
                        <span>
                          {label}
                          {a.kind === 'note' || a.kind === 'tag' ? <><br />“{a.text}”</> : null}
                          {a.kind === 'followup' && a.why ? <><br />{a.why}</> : null}
                        </span>
                        {a.state === 'open' && (
                          <>
                            <button className="jv-run" onClick={() => run(mi, ai)}>Do it</button>
                            <button className="jv-skip" onClick={() => skip(mi, ai)}>Skip</button>
                          </>
                        )}
                        {a.state === 'done' && <span style={{ flex: 'none', fontSize: 11.5 }}>Done</span>}
                        {a.state === 'failed' && <span style={{ flex: 'none', fontSize: 11.5 }}>Couldn't</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}

          {busy && (
            <div className="jv-msg them">
              <div className="jv-tag">{AI_NAME}</div>
              <div className="jv-body" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <Loader2 size={14} className="spin" style={{ animation: 'jvspin 1s linear infinite' }} />
                Reading the CRM…
              </div>
            </div>
          )}
        </div>

        {picker && (
          <div className="jv-picker">
            <input
              className="jv-psearch" autoFocus placeholder="Search leads and relationships…"
              value={pq} onChange={e => setPq(e.target.value)}
            />
            {results.length ? results.map(l => (
              <button key={l.id} className="jv-prow" onClick={() => pick(l)}>
                {l.name || l.company || 'Unnamed'}
                <i>{[l.company, l.stage].filter(Boolean).join(' · ')}</i>
              </button>
            )) : <div className="jv-pempty">Nothing matches that.</div>}
          </div>
        )}

        <div className="jv-foot">
          {!!pins.length && (
            <div className="jv-pins">
              {pins.map(p => (
                <span className="jv-pin" key={p.id}>
                  {p.name}
                  <button onClick={() => setPins(pins.filter(x => x.id !== p.id))}><X size={12} /></button>
                </span>
              ))}
            </div>
          )}
          <div className="jv-row">
            <button
              className={'jv-ico' + (picker ? ' on' : '')} title="Pin a lead to this question"
              onClick={() => setPicker(!picker)}
            ><Paperclip size={17} /></button>
            <button
              className={'jv-ico' + (deep ? ' on' : '')} title={deep ? 'Deep reasoning on — slower, costs more' : 'Deep reasoning off — fast and cheap'}
              onClick={() => setDeep(!deep)}
            >{deep ? <Zap size={17} /> : <Cpu size={17} />}</button>
            <textarea
              ref={box} className="jv-in" rows={1} value={q} onChange={grow}
              placeholder={`Ask ${AI_NAME} anything…`}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }}
            />
            <button className="jv-send" disabled={busy || !q.trim()} onClick={() => ask()}>
              {busy ? <Loader2 size={17} style={{ animation: 'jvspin 1s linear infinite' }} /> : <Send size={17} />}
            </button>
          </div>
          <div className="jv-hint">
            <span>Enter to send · Shift+Enter for a new line</span>
            <span>{deep ? 'Deep reasoning' : 'Fast mode'}</span>
            {!!msgs.length && (
              <span style={{ marginLeft: 'auto', cursor: 'pointer' }} onClick={() => { setMsgs([]); setPins([]); }}>
                <Trash2 size={10} style={{ verticalAlign: -1 }} /> Clear
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
