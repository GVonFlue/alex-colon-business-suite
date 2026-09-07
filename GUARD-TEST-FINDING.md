# The test that watches for open endpoints has never been able to fail

> **RESOLVED in this PR.** Two routes were open and are now guarded; a third
> failed open when unconfigured and now fails closed; the test that was supposed
> to notice can now notice, and every one of its assertions has been watched
> fail. What is recorded below is not the fix — it is why the fix was needed for
> eleven days without anybody knowing.

**Status:** found 1 Sep 2026 while writing an unrelated test, by trying to make
that test fail and discovering it would not.

---

## What was actually open

Read from source, comments stripped. Not probed against production, on purpose.

| route | protection | what it did |
|---|---|---|
| `api/google-disconnect.js` | **none** | `POST` ran `clearGoogle()`. Anyone with the URL could sever the brokerage's calendar for everybody. An unauthenticated destructive endpoint. |
| `api/google-status.js` | **none** | Returned `{connected, email}` — the connected Google account's address, to anyone who asked. |
| `api/notify.js` ad-hoc | **none** | Took `to`, `subject` and `text` from the request body. A stranger chose the recipients AND the content, and it left from a domain verified in Resend. An open relay on a client's own domain reputation. |
| `api/notify.js` cron | conditional | `if (secret) { check }` — an install that never set `CRON_SECRET` had no check at all. |

All four are shapes `proytech-crm` had already found and closed. The fixes
shipped there and never reached this repo.

---

## Why nothing noticed

`tests/guards.test.mjs` was created on **21 Aug 2026**, in commit `760f51b`,
titled **"Five endpoints were open to the internet."** It exists for exactly
this. It has two independent defects, and they compound.

### 1. It only looked at half the routes

It selected handlers containing `api.anthropic.com` — the five that spend money.
The other five were never read. **Three of the four holes above are in routes it
never examined**, so no amount of fixing its matching would have found them.

### 2. What it did look at, a comment could satisfy

It read source as text and asserted patterns were PRESENT, without stripping
comments. Reproduced on 1 Sep 2026:

1. In `api/extract-contract.js`, `requireAuth: true` → `requireAuth: false`.
   The route is now open.
2. Added one line: `// requireAuth: true`
3. The suite reported: **`extract-contract.js requires a signed-in session`**

It has never stripped comments — not in any of its four revisions
(`760f51b`, `197e2cc`, `23d7821`, `c8eb4d0`).

**The direction is what makes this dangerous.** A positive assertion satisfied by
prose is a false PASS: the protection is gone and nothing says so. A negative
assertion tripped by prose is a false FAILURE — noisy, self-announcing, fixed in
a minute. Only one of those costs anything.

And this estate comments heavily and deliberately, which makes it worse rather
than better: a comment explaining why a guard exists necessarily names the
guard. **The better the comment, the more reliably it satisfies the test meant to
check the code.**

---

## The eleven days

- **21 Aug** — `guards.test.mjs` created, in a commit about five open endpoints
- **21 Aug – 1 Sep** — green on every run, incapable of failing on the condition
  it names, reading half the routes
- **31 Aug** — `triplejmtg` PR #1: *"Fifteen routes were open to the internet,
  six of them spending on the key"*
- **1 Sep** — this

**One correction worth stating plainly, because the obvious inference is wrong.**
TripleJ's fifteen were not missed by this test. TripleJ had **no tests at all**
before 31 Aug — `c00ecb0` is the first commit adding `tests/`. Nothing was
watching there. This repo is the worse story: something *was* watching, was built
for this, and could not do it.

The pattern across both repos is the same one either way: **the mechanism trusted
to prevent open endpoints had never once been watched fail.**

---

## What the fix has to include, and why the regex is the easy half

Stripping comments would have found **none of the four holes.** All the value is
in the coverage. If this had been triaged as "fix the regex", it would have been
closed as done, and `google-disconnect` would still be open.

So:

1. **Every route is checked**, not a subset. Anything not guarded must be named
   in `KNOWN_OPEN` with a written reason, so a hole is a decision somebody wrote
   down rather than an absence nobody saw. The reverse is checked too, so the
   list cannot go stale.
2. **Comments are stripped** before any source match.
3. **Rules are executed where they can be.** `pickRecipients` is called with a
   hostile address rather than grepped for — a regex would pass on a comment
   describing the rule.
4. **The cron secret is asserted as a REFUSAL**, not by the presence of the
   string `CRON_SECRET`. The fail-open version contained that string too.
5. **Every assertion has been watched fail.** Six protections were deleted one at
   a time and the suite went red for each: the comment bug, both Google routes,
   the cron secret reverting to fail-open, the allowlist admitting an outside
   address, and `apiPost` dropping the token.

---

## The rule this leaves behind

**A source-reading assertion is not written until it has been seen to fail.**

Reading the regex is not enough. The `PRODUCT_BAR` test in PR #17 shipped green
with the guard it protected deleted, and was only caught by deleting it. Add it
to the definition of done.

`_PARKED.md` §6 carries the sweep list for the same class elsewhere: fifteen
files in `proytech-crm` that strip nothing, and two in this repo that strip `//`
but not `/* */`.
