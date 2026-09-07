# View contract

Every file in `src/views/` is a default-exported React component taking exactly
one prop: `{ ctx }`. No view imports the data layer, calls `fetch` on Supabase,
or filters for privacy — the data in `ctx` has already been scoped by the
database (or, in demo mode, by `src/lib/demo.js`, which mimics the same
policies). If a view needs to hide something it is for *layout* reasons, never
for permission reasons.

```jsx
export default function Thing({ ctx }) { ... }
```

## ctx

| key | what |
|---|---|
| `me` | `{ id, name, email, role:'leader'\|'agent', active, sections, permissions, plan, pools, seatLimit }` |
| `isLeader` | boolean |
| `can(key)` | permission check; leader is always true. Keys in `PERMISSION_KEYS` (settings.js) |
| `perms` | resolved permission object |
| `users` | visible users. An agent only ever sees their own row |
| `users_by_id` | map |
| `account` | `{ id, name, seat_limit, contact_url }` or null |
| `seats` | `{ limit, used }` |
| `settings` | merged settings (see `src/lib/settings.js`) |
| `saveSettings(next)` | persists; leader only (DB refuses otherwise) |
| `contacts` | array of contact records |
| `upsertContact(c)` / `deleteContact(id)` / `claimContact(c)` | writers |
| `transactions` | array of transaction records |
| `upsertTransaction(t)` / `deleteTransaction(id)` | writers |
| `tasks` / `upsertTask(t)` / `deleteTask(id)` | |
| `expenses` / `upsertExpense(e)` / `deleteExpense(id)` | own rows only, always |
| `contracts` / `saveContract(c)` / `removeContract(id, path)` | |
| `huddle` / `saveHuddle(h)` | |
| `tz` | `'America/Chicago'` unless the install changed it |
| `todayIso` | `'YYYY-MM-DD'` in `tz` |
| `holidays` | `[{date,name}]` from settings |
| `rollover` | `'forward' \| 'stand' \| 'back'` |
| `go(view, params)` | navigate. views: dashboard, pipeline, contacts, transactions, contracts, commission, books, tools, huddle, settings |
| `params` | params from the last `go()` |
| `flash(msg)` | toast |
| `loading` | boolean |
| `isDemo` | boolean |
| `db` | escape hatch for storage calls (`uploadContract`, `contractUrl`, `uploadReceipt`) — do not use it for reads that belong in ctx |

## Records

**contact**

```
id, name, email, phone, side:'buyer'|'seller'|'both', stage (settings.stages key),
source, owner_id (null = unclaimed), pool, pooled_at, created_at, lastTouch,
priceMin, priceMax, targetPrice, preapproval, lender, timeline, propertyType,
areas:[], address, beds, baths, nextAction, nextActionDue, notes,
closedWithUsOn, appointments:[{id,type,at,status:'booked'|'held'|'noshow'|'cancelled'}],
checklist:{ [itemKey]: {done:isoOrNull, due:isoOrNull} },
activity:[{id,at,kind,note,by}]
```

**transaction**

```
id, owner_id, contact_id, side, phase (settings.phases key),
status:'active'|'closed'|'fell',
address, mls, salePrice, commissionRate, flatCommission, grossOverride,
referralOutType:'pct'|'flat', referralOut,
effectiveDate, closeDate, closedActual, earnestAmount,
coopAgent, coopBrokerage, titleCompany, lender,
fellReason, fellPhase, fellAt,
capContribution, commissionSnapshot:{gross,agentNet,toBrokerage,teamCut,at},
checklist:{...}, notes, contractId,
deadlines:[ deadline ]
```

**deadline** (built by `src/lib/dates.js`)

```
key, label, date, offset, count:'business'|'calendar', inclusive, anchor:'effective'|'close',
rule, explain, skipped:[{date,reason}], rolled:{from,to,reason,direction}|null,
status:'open'|'met'|'waived'|'extended', statusBy, statusAt, extendedTo, extendedReason,
source:'contract'|'default'|'manual', quote, confidence, absolute,
assignee, eventId, remindersSent:{}, notes
```

**expense**: `id, user_id, spentOn, amount, category, note, miles, receiptPath, source`

## Libraries to use, not reimplement

- `src/lib/dates.js` — `computeDeadline`, `cascade`, `addBusinessDays`, `urgency`,
  `daysUntil`, `fmtShort`, `fmtLong`, `today`, `addDays`, `effectiveDateOf`
- `src/lib/commission.js` — `computeCommission`, `agentPlan`, `capProgress`,
  `capPeriod`, `replayYear`, `usd`
- `src/lib/settings.js` — `stagesOf`, `phasesOf`, `stageLabel`, `columnLabel`,
  `checklistFor`, `apptCounts`, `PERMISSION_KEYS`, `DASH_SECTIONS`
- `src/lib/format.js` — `usd`, `usdc`, `uid`, `initials`, `phoneFmt`, `sum`
- `src/components/ui.jsx` — `Card, Kpi, Btn, Pill, Tag, Field, Inp, Sel, Txt,
  Toggle, Seg, SideChip, Conf, NeedsEyes, ModalShell, Drill, Board, Reorder,
  Empty, SecTitle, ErrorNote, LegalNote, Spinner, IconBtn`

## Style

Use the existing classes from `src/styles.js`. The useful ones:
`card`, `kpi` (+ `.accent .gold .green .clickable`), `btn btn-p|btn-s|btn-g|btn-d`
(+`btn-sm`), `pill`, `dot`, `tag`, `badge`, `tbl-wrap`, `tbl`, `toolbar`,
`searchbox`, `selctl`, `seg`/`seg-b`, `chips`/`chip`, `field`/`fgrid`,
`kanban`/`kcol`/`kcard`, `empty`, `sec-title`, `note`/`note bad`, `grid2`,
`grid3`, `hlist`/`hli`, `set-row`, `wf`/`wf-row`, `cap-bar`/`cap-fill`,
`cd`/`cd-*` (critical dates), `ex-tbl` (extraction review), `perm-tbl`,
`seat-note`, `ai-out`, `legal-note`, `pool-chip`, `side-b|side-s|side-x`,
`tx-phase`, `m-grid`/`m-left`, `drill`.

Do not add a stylesheet. If a new class is genuinely needed, add it to the
"realtor build additions" block at the bottom of `src/styles.js`.

## Non-negotiables that apply inside views

1. Never state or imply legal advice. Anything summarising a contract carries
   `<LegalNote />`.
2. No AI output auto-sends or auto-saves. It renders as a draft the agent edits.
3. Never generate a home valuation and present it as an appraisal or CMA.
4. Money maths comes from `commission.js`. No inline arithmetic in a view.
5. Date maths comes from `dates.js`. No `new Date()` arithmetic in a view.
6. Every board card gets `‹ ›` arrows (use `Board`), because drag does not work
   on a touchscreen.
