# ROLES

Three roles. Everything else is per-person configuration.

| | Team leader | Agent | Transaction coordinator |
|---|---|---|---|
| `role` | `leader` | `agent` | `coordinator` |
| Contacts | all | own + their pools | **all** (read only — cannot reassign) |
| Transactions | all | own | **all**, read and write |
| Tasks / deadlines | all | own | **all**, read and write |
| Contracts | all | own | **all**, read and write |
| Expenses | **own only** | **own only** | **own only** |
| Commission | team-wide | their own | **none — no section at all** |
| The Books | own expenses | own expenses | **none — no section at all** |
| Settings | yes | no | no |
| Costs a seat | yes | yes | yes |

Read that table next to `MIGRATION.sql`. The policies there are the enforcement;
this file only describes them.

## Team leader (`role: 'leader'`)

The owner of the install. Sees every contact, every transaction and team-wide
commission. Sets everything: stages, phases, critical-date offsets, holidays,
checklists, splits and caps per agent, the permission matrix, lead pools, the
dashboard layout, who is on the team, and what each of them can see.

One thing a team leader **cannot** do: see an agent's individual expenses. That is
enforced by the `expenses` policy, which has no leader override, and by the
receipts storage policy. The leader's own Books screen shows only the
brokerage-level expenses they entered themselves. This is deliberate — agents on a
real estate team are typically 1099 and their spending is their own business. If a
brokerage wants it otherwise, that is a change to `MIGRATION.sql`, made knowingly,
and it should be a conversation with the agents first.

## Agent (`role: 'agent'`, one per seat)

Sees their own contacts, the lead pools they are listed on, their own
transactions, their own commission and their own expenses. Never another agent's
numbers.

An agent may:

- work their own book, claim from pools they can see, run the AI tools;
- edit their own name and email;
- read their split and cap plan, and check the maths against their own deals.

An agent may not:

- see or write another agent's rows — the query does not return them;
- assign a contact to somebody else;
- change their own role, split, cap, permissions or section list. `editOwnSplit`
  is marked locked in the permission matrix and renders as "never", and the
  database refuses the write regardless of what a screen asks for;
- change install settings.

## Transaction coordinator (`role: 'coordinator'`)

The person who works the closing pipeline for the whole team. Usually one seat,
often the office admin.

They see **every transaction, every deadline, every contract file and every
contact** — they need the parties on a deal, not just the agent's name — plus the
dashboard and the PCS board. They work deadlines (met / waived / extended), move
a transaction through the phases, upload contracts, and run the AI tools.

They see **no commission and no expenses**. Commission and The Books are not in
their nav, are not offered by the permission matrix, and cannot be handed to them
by ticking a box: `App.jsx` removes both for a coordinator after the per-person
section list has been applied, because it is what the role means rather than a
narrowing a leader chose.

Their read breadth is not a permission bundle, it is `is_coordinator()` in
`MIGRATION.sql`. In Settings the two permissions that follow from it — *see
team-wide pipeline* and *see other agents' contacts* — read **by role**, and the
three that cannot follow from it — *team commission totals*, *other agents'
commission*, *The Books* — read **never**.

A coordinator may not:

- read another person's `crm_users` row. `users_read` is "my own row or the
  leader", and a coordinator is not the leader, so they cannot enumerate the team
  any more than an agent can;
- change anyone's role, plan, permissions or section list — including their own.
  Same restriction an agent has, same policy line;
- assign a contact to somebody else. Read breadth on contacts is not write
  breadth: `contacts_update`'s with-check is unchanged;
- see anyone's expenses but their own. `expenses_all` has no role override of any
  kind. If the brokerage wants the coordinator reconciling agents' spending, that
  is a policy change made knowingly, with the agents in the room.

### The honest caveat — read this before you sell the role

**Commission columns live on the `transactions` row.** `salePrice`,
`commissionRate` and `commissionSnapshot` are stored there, and a coordinator's
policy grants them that row. So:

- a coordinator **cannot reach commission through the UI** — there is no
  Commission section, no Books, no per-agent split anywhere in their app;
- a determined coordinator **could** open the browser console and read
  `data.commissionSnapshot` off a transaction they already have. Nothing in the
  database stops them, because nothing in the database can: Postgres RLS is
  row-level, and hiding a column from one role while another role needs it would
  mean a second table and a join on every deal.
- the **dashboard's production panels are aggregate money and they do render for
  a coordinator**: closed GCI for the year, volume in play, gross commission in
  flight, the weighted pipeline forecast. Those are team totals computed from
  rows the policy hands them. There is no per-agent commission and no cap bar for
  anyone but themselves, but "the coordinator sees no dollar figure at all" would
  be untrue and this file will not say it.

So: **do not put someone in this role if they must not be able to learn the
numbers.** For that person the answer is an agent seat with no transactions, or
no seat at all. What this role does honestly deliver is that the coordinator is
never *shown* commission, never has it in a report or an export, and cannot see
anybody's expenses at all — and that the audit trail says who did what.

## The permission matrix

Per person, in Settings — inside their own row in **Team**, and as a grid across
everybody in **Permission matrix**. Both edit the same field. Every toggle
defaults **off**.

| Permission | Default | What it actually does | Coordinator |
|---|---|---|---|
| See team-wide pipeline | off | shows the owner filter and other agents' cards on the board | by role |
| See other agents' contacts | off | shows the owner column and lets the table span the team | by role |
| See team commission totals | off | shows the team roll-up, without naming individuals | never |
| See other agents' commission | off | shows the per-agent commission table | never |
| Access The Books | **on** | their own expenses only, always | never |
| Edit their own split/cap settings | off, **locked** | nothing. It cannot be switched on | never |
| Create lead pools | off | pool management in Settings | off |
| Export data | off | the CSV export button on Contacts | off |

**These toggles are UI affordances, not row access.** The policies in
`MIGRATION.sql` are the enforcement. Turning "See other agents' contacts" on for
an agent shows them the owner column; it does not change what the database
returns, which for contacts is own-plus-pools regardless. If a brokerage genuinely
wants an agent to see the whole book, that is a policy change, not a toggle — and
it is worth asking why before making it.

The Settings screen says this above the matrix, and again above the same toggles
inside each person's row, in those words, so nobody mistakes a checkbox for a
security boundary.

## Per-person section visibility

`crm_users.sections` narrows which nav sections a person sees. It can only ever
*narrow* the install's module list (`settings.modules`) — never widen it. Settings
is leader-only and cannot be offered to anybody else. Empty means "the default
for their role":

- agent — `DEFAULT_AGENT_SECTIONS`
- coordinator — `DEFAULT_COORDINATOR_SECTIONS` (no commission, no books)

Nobody can widen their own list, including a coordinator: `users_update`'s
with-check refuses a write that changes `sections` on your own row, the same way
it refuses `role`, `plan` and `permissions`.

## Adding people — Settings → Team

The team leader adds every seat themselves. Name, email, role, one button.

Two writes happen, in this order, and the order is the whole point:

1. **the login**, via `auth.createLogin(email, password)`, which posts to gotrue
   directly rather than calling `signUp()` — `signUp()` would swap the leader's
   session for the new person's and sign the leader out of their own settings
   page mid-sentence;
2. **the seat**, `crm_users`, keyed on the auth uid step 1 returned. Never on an
   id the app invented: a row keyed on anything else is a seat nobody can sign
   in to.

Then the password reaches the person one of two ways, and the leader picks:

- **a temporary password**, generated with `crypto.getRandomValues` (20
  characters, no look-alikes, never stored by the app), shown **once** with a copy
  button and the instruction to hand it over and have them change it at first
  sign-in. Close the panel and it is gone;
- **a set-your-password email**, `auth.sendReset(email)` — nothing is ever
  displayed. The same button lives on every person's row afterwards, which is how
  you change somebody's password later without ever knowing what it is.

**"Confirm email" in Supabase must be OFF.** Authentication → Providers → Email →
Confirm email. With it on, gotrue will not return the new user's id to an
anonymous caller, there is nothing to key the seat on, and you end up with a login
and no seat. Settings detects exactly that case and names the setting.

If the seat write is refused (the seat trigger, `P0001`), the login already
exists and the seat does not — Settings says so in the database's own words and
tells the leader what to clean up.

## Seats

`accounts.seat_limit` lives on the account row, not in client-editable settings,
because seats are billed. A coordinator costs a seat like anyone else. A trigger
rejects an active user past the limit with `P0001`; Settings shows "N of M seats
used — contact ProyTech to add more" with a request link, and surfaces the
trigger's message verbatim when a write is refused. No self-serve billing in v1.

Deactivating a person frees the seat and keeps everything: their contacts,
transactions, closed-deal commission snapshots and expense history. A deactivated
account that signs in gets the "Seat deactivated" screen, and every policy is
gated on `crm_active()`, so it can read nothing. Removing a seat deletes the row
and takes its production out of the team numbers — deactivate unless you mean it.
Neither one deletes the login; that lives in Supabase Auth.

## Bootstrap

With `crm_users` empty, the policies let the first signed-in account insert its
own row as the leader — that is the only self-promotion the database permits, and
it closes the moment the first row exists. To do it by hand:

```sql
insert into crm_users (id, name, email, role)
values ('<auth uid>', 'Their Name', 'them@brokerage.com', 'leader')
on conflict (id) do update set role = 'leader', active = true;
```

To make somebody the coordinator by hand:

```sql
update crm_users set role = 'coordinator' where email = 'them@brokerage.com';
```
