# Constraining who a calendar invitation can reach

**Status:** proposed, not built. The endpoint is guarded (a session is now
required); this is the second half — a signed-in agent can still name any
attendee, and every send goes out from the install's connected Google account.

Not building it tonight is the point: this ships on a client install, and a
half-thought recipient rule is how a real estate agent's calendar starts
emailing strangers.

---

## What the endpoint does today

`api/calendar-event.js` takes `attendees: [email]` straight from the request
body, maps it to Google's shape, and posts with `sendUpdates=all`:

```js
if (Array.isArray(b.attendees) && b.attendees.length) {
  event.attendees = b.attendees.filter(Boolean).map((email) => ({ email }));
}
let url = CAL + '?sendUpdates=all';
```

No cap on the array, no validation of the addresses, no check that the caller
has anything to do with the people named. `sendUpdates=all` is unconditional,
so Google emails every attendee on create, on update, and on delete.

The only current caller — the contract-deadline sync in `Contracts.jsx` — sends
**no attendees at all**. So today the array is exercised by nothing in the app,
which is exactly when a parameter is easiest to get wrong and hardest to notice.

## The rule

Agreed: **the contact on the transaction, plus anyone typed in.** Which means
the constraint is not a fixed allowlist — a typed address is legitimate by
definition — so the protection has to come from shape and volume rather than
from identity.

That mirrors ProyTech, where the same problem produced the same answer: the
recipient set could not be enumerated in advance, so the rule became *cap it,
validate it, and only send when there is somebody to send to*.

## Proposed

**1. Cap the list.** A real estate closing has a handful of parties. `10` is
generous and still refuses a list of five hundred. Over the cap is a 400, not a
silent truncation — truncating means somebody does not get the invitation and
nothing says so.

**2. Validate every address, and reject the request if any one fails.** Not
filter-and-continue, for the same reason: dropping a bad address silently is how
a party quietly misses a closing. Validation is shape-only (`x@y.z`, length
bounded, no control characters or commas that could smuggle a second recipient
into one field).

**3. `sendUpdates` becomes conditional.** `all` when there are attendees,
`none` when there are not. Today a contract-deadline event with no attendees
still asks Google to notify everybody — which is nobody, so it is invisible, and
it stays invisible right up until the day the caller starts passing attendees.

**4. Delete uses the same rule.** The `action === 'delete'` branch also hardcodes
`sendUpdates=all`, so removing an event mails everyone on it. That is usually
right, and it should be a decision rather than a default inherited from the
create path.

**5. Log what was sent, not who.** The count and the outcome, never the
addresses — the same posture as the AI routes, which log nothing.

## What this does NOT do, deliberately

It does not verify that a named attendee is the contact on the transaction. It
could — the transaction id is available and the contact's email is on the
record — but the rule you gave says "plus anyone Jeff types", and a check that
allows arbitrary typed addresses while pretending to verify identity is worse
than no check: it reads as a guarantee it does not make.

If you want the stronger version, it needs a different rule: typed addresses go
through a confirmation step, and only the transaction's own contact sends
silently. That is a UI change, not an endpoint change, and it is a different
conversation.

## Cost

Small — the whole change is inside one handler, plus a test in the existing
`guards.test.mjs` shape asserting the cap, the rejection of a malformed address,
and that `sendUpdates` follows the attendee list. No schema, no migration, no
client change; the current caller passes no attendees and is unaffected.
