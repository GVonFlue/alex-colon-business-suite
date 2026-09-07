# VERIFY-RLS — do this before you let an agent in

The automated tests cannot cover Row Level Security. It is Postgres, not jsdom.
`tests/scoping.test.mjs` proves the *demo adapter* enforces the same rules, which
is what makes the demo honest — it says nothing about your client's database.

This takes about twenty minutes and it is not optional. If a policy is wrong, an
agent sees another agent's clients and expenses, and you will find out from them.

Three roles to check, not two: leader, agent and transaction coordinator. The
coordinator is the one people assume is safe because "they only do paperwork" —
section 1a is the part of this document that exists for them.

---

## 0a. Run `RLS-AUDIT.sql` first — it takes a minute and needs no logins

Paste `RLS-AUDIT.sql` into the Supabase SQL Editor and run it. It changes
nothing. It reads every policy on every table and raises if any table has RLS
off, or carries a permissive policy whose expression is literally `true`.

**Do this before the twenty minutes below, because this document cannot catch
what that file catches.** Everything from section 0 on is behavioural — sign in,
try to read, confirm you cannot. That is the right check and it is not
sufficient. On 23 Aug 2026 a sibling install passed exactly that kind of review
twice in one day while its `leads` table carried five correct policies plus one
leftover `using (true)`. Permissive policies OR together, so the leftover won and
every authenticated session could read and write every row. Counting the policies
returned six. Reading the five sensibly-named ones returned five correct answers.
The table was wide open the whole time.

The two are not alternatives. `RLS-AUDIT.sql` reads what the policies **say**;
everything below observes what they **do**. A policy can be non-`true` and still
wrong — checking the wrong column, or the wrong role — and only the sections
below will find that.

---

## 0. Setup

Browser profiles (normal, incognito, a second browser), signed in as:

- **L** — the team leader
- **A** — an agent, with **every permission toggle OFF** (the default)
- **C** — the transaction coordinator (`role = 'coordinator'`)

Have a third seat, **B**, with its own contacts and expenses, so there is
something for A and C to fail to see. Give **C** at least one expense of their
own, so section 1a can tell "the policy scoped it" apart from "there was nothing
there anyway".

---

## 1. The query-level check — do this one first

This is the only test that matters, because it bypasses the UI entirely.

Open the deployment as **A**, open the browser console, and run:

```js
const { supabase } = await import('/src/lib/supabase.js');   // dev build
// or, on a production build, use the Supabase JS client from the network tab's
// session and paste the anon key + URL by hand.

// 1. Can I read anyone else's contacts?
(await supabase.from('contacts').select('id,owner_id')).data
   .filter(r => r.owner_id && r.owner_id !== (await supabase.auth.getUser()).data.user.id)
// MUST be []  (rows with owner_id null are pool leads and are allowed)

// 2. Can I read anyone else's expenses?
(await supabase.from('expenses').select('id,user_id,amount')).data
// MUST contain ONLY my own user_id — including if I am the team leader

// 3. Can I enumerate the team?
(await supabase.from('crm_users').select('id,name,role')).data
// MUST be exactly one row: mine

// 4. Can I read anyone else's transactions?
(await supabase.from('transactions').select('id,owner_id')).data
// MUST be only mine
```

If any of these returns more than it should, **stop** and fix the policy. Do not
proceed to the UI checks; a UI that looks right on top of a leaky policy is the
exact failure mode this document exists to prevent.

Then the writes that must be refused:

```js
const me = (await supabase.auth.getUser()).data.user.id;

// 5. Hand a contact to another agent
await supabase.from('contacts').update({ owner_id: '<B uid>' }).eq('id', '<one of my contact ids>')
// MUST error (RLS with-check)

// 6. Promote myself
await supabase.from('crm_users').update({ role: 'leader' }).eq('id', me)
// MUST error

// 7. Set my own split
await supabase.from('crm_users').update({ plan: { keepPct: 100, cap: 0 } }).eq('id', me)
// MUST error

// 8. Write an expense onto another agent
await supabase.from('expenses').insert({ id: crypto.randomUUID(), user_id: '<B uid>', amount: 1 })
// MUST error

// 9. Change the install settings
await supabase.from('app_settings').update({ data: {} }).eq('id', 'main')
// MUST error

// 10. Read the reminder log
(await supabase.from('reminder_log').select('*'))
// MUST return no rows / an error — there is no client policy on it at all
```

## 1a. The transaction coordinator — the third role

Skip this only if the install has no coordinator seat. Everything below runs in
**C**'s console, and the point of it is that the coordinator's breadth stops
exactly at deals: they get every transaction and every contact, and they get
nothing extra anywhere near money or seats.

```js
const me = (await supabase.auth.getUser()).data.user.id;

// 1. The whole closing pipeline — this one SHOULD be wide
(await supabase.from('transactions').select('id,owner_id')).data.length
// SHOULD equal the team's total. Compare it against L's count.
(await supabase.from('contacts').select('id,owner_id')).data.length
// SHOULD equal L's count too — a coordinator needs the parties on a deal
(await supabase.from('contracts').select('id,owner_id')).data
// SHOULD include contracts owned by agents

// 2. EXPENSES — the one that must NOT be wide
(await supabase.from('expenses').select('id,user_id,amount')).data
   .filter(r => r.user_id !== me)
// MUST be []  — a coordinator sees ONLY the expense rows they entered
// themselves. There is no is_coordinator() anywhere in expenses_all, and if
// this returns anything at all, somebody added one. Stop and remove it.

(await supabase.from('expenses').select('id,user_id')).data.length
// SHOULD equal the number of expenses C entered. Not zero, if C entered any —
// zero here means the policy is refusing their OWN rows, which is a different
// bug and also wrong.

// 3. Can C enumerate the team?
(await supabase.from('crm_users').select('id,name,role')).data
// MUST be exactly one row: theirs. `users_read` is "my own row or the leader",
// and a coordinator is not the leader.
```

Then the writes that must be refused. Every one of these MUST error:

```js
// 4. Promote themselves
await supabase.from('crm_users').update({ role: 'leader' }).eq('id', me)
// MUST error — nobody writes their own role

// 5. Give themselves a plan
await supabase.from('crm_users').update({ plan: { keepPct: 100, cap: 0 } }).eq('id', me)
// MUST error — nobody writes their own plan, and a coordinator has none

// 6. Set an AGENT's plan
await supabase.from('crm_users').update({ plan: { keepPct: 100 } }).eq('id', '<A uid>')
// MUST error — read breadth on deals is not authority over seats

// 7. Grant themselves a permission, or a nav section
await supabase.from('crm_users').update({ permissions: { seeOtherCommission: true } }).eq('id', me)
await supabase.from('crm_users').update({ sections: ['commission','books'] }).eq('id', me)
// BOTH MUST error — role, plan, permissions and sections are all pinned on
// your own row by users_update's with-check

// 8. Write an expense onto an agent
await supabase.from('expenses').insert({ id: crypto.randomUUID(), user_id: '<A uid>', amount: 1 })
// MUST error

// 9. Hand a contact to an agent
await supabase.from('contacts').update({ owner_id: '<A uid>' }).eq('id', '<any contact id>')
// MUST error — contacts_update's with-check is unchanged for a coordinator

// 10. Change the install settings
await supabase.from('app_settings').update({ data: {} }).eq('id', 'main')
// MUST error

// 11. Read another person's receipt
await supabase.storage.from('receipts').download('<A uid>/<file>')
// MUST error — receipts follow the expenses rule, coordinator included
```

And the writes they SHOULD have, because the job is unworkable without them:

```js
// SHOULD succeed: move an agent's transaction through the pipeline
await supabase.from('transactions').update({ phase: 'ctc' }).eq('id', '<A transaction id>')
// SHOULD succeed: open an agent's contract file
await supabase.storage.from('contracts').createSignedUrl('<A uid>/<txn>/<file>', 60)
```

**Known and deliberate, do not report it as a pass or a fail:** step 1 returns
the transaction rows, and `salePrice` / `commissionSnapshot` are columns on those
rows. A coordinator's console can read them. The app never shows them — there is
no Commission section and no Books for this role — but the database does not
prevent it and this document will not pretend otherwise. See the honest caveat in
`ROLES.md`. If the client's requirement is "this person must never be able to
learn the numbers", the answer is not this role.

## 2. Storage

As **A**:

```js
// The other agent's contract, by path
await supabase.storage.from('contracts').download('<B uid>/<txn id>/<file>')
// MUST error

// A signed URL for it
await supabase.storage.from('contracts').createSignedUrl('<B uid>/<txn>/<file>', 60)
// MUST error

// The other agent's receipt
await supabase.storage.from('receipts').download('<B uid>/<file>')
// MUST error
```

And confirm both buckets are **not public**: Supabase → Storage → each bucket →
Configuration → Public bucket is off. A public bucket makes every policy above
irrelevant.

As **L** (the team leader):

```js
// The leader MAY read an agent's contract — that is intended
await supabase.storage.from('contracts').createSignedUrl('<A uid>/<txn>/<file>', 60)
// SHOULD succeed

// The leader may NOT read an agent's receipt — that is also intended (§7)
await supabase.storage.from('receipts').download('<A uid>/<file>')
// MUST error
```

## 3. Seat enforcement, at the database

As **L**, in the SQL editor:

```sql
select seat_limit from accounts where id = 'main';
select count(*) from crm_users where active;
```

Then, in the app, add active seats until you exceed the limit. The insert must
fail with `P0001` and the message *"Seat limit is N. Contact ProyTech to add
more."*, and Settings → Team must show you that sentence, in those words, rather
than a generic failure. If it succeeds, the trigger did not install — re-run
`MIGRATION.sql` and check for errors.

A coordinator is a seat like any other. Add one past the limit and it must be
refused identically — the trigger counts `active` rows and does not look at
`role`.

Then confirm the reverse: deactivate a seat, add a new one, and check the
deactivated person's contacts, transactions and commission records are all still
there.

## 4. Deactivation blocks access

Deactivate **A** while they are signed in. On their next action they must land on
the "Seat deactivated" screen. Then, in their console:

```js
(await supabase.from('contacts').select('id')).data      // MUST be []
```

Every policy is gated on `crm_active()`, so a deactivated account gets nothing
even if a screen were to ask for it.

## 5. The UI checks — only after the above passes

As **A**:

- No Settings section in the nav.
- The Books shows only their own expenses and states the privacy rule.
- Commission shows only their own numbers, and the plan is read-only.
- No other agent's name appears anywhere. (The jsdom harness asserts this against
  the demo; check it once against the real thing.)
- Pool leads appear, and claiming one works.

As **C** (the coordinator):

- The nav has Dashboard, PCS, Pipeline, Contacts, Transactions, Contracts and AI
  Tools. **No Commission. No The Books. No Settings.**
- The transactions board shows every agent's deals, and marking a deadline met
  on somebody else's transaction works and sticks after a reload.
- Settings → Team, as **L**, shows their row as "Transaction coordinator", with
  the money permissions reading **never** and the pipeline/contacts ones reading
  **by role** — not as switches somebody could flip.
- Tick "Commission" for them in their section list: it is not offered. If it ever
  appears in their nav, `App.jsx` has lost the role filter.

As **L**:

- The whole team's pipeline, transactions and commission.
- The Books shows **only the leader's own** expenses — if you can see an agent's
  grocery receipt here, the `expenses` policy has picked up an `is_leader()`
  override it must not have.
- Team → add a person creates the login and the seat together, and the temporary
  password appears exactly once. Sign in as that person in another profile with
  it, before you hand it to anybody.

## 6. Record it

Write the date and who ran it in the client's build notes. When someone asks in
six months whether the privacy rules were ever actually tested, "yes, on the 12th,
by name" is the answer you want to have.
