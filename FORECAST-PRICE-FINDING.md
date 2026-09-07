# Two screens forecast a different price for the same contact

> **RESOLVED.** `forecastPrice` is deleted; Dashboard uses `expectedPrice`.
> Measured first, and the measurement changed the story: on the seeded dataset
> — 47 contacts, 33 with a price range and no target — the two functions
> disagreed **zero** times, because every price range sums even. They differ
> only when `priceMin + priceMax` is odd, which round price brackets never are.
> `FORECAST-PRICE-MEASURE.sql` says the same for production data.
>
> So the defect was that two definitions existed, not that anyone saw a wrong
> number. Still worth removing: the next edit to one of them would not have
> been a rounding artefact.

**Status:** found while consolidating `txGross` and `closedOn`, by a check
written to stop those coming back.

**This is the first live disagreement found in Dwell.** Everything else in the
audit was duplication that happened to agree. These two do not.

---

## The two

Same fact — the price a forecast should use for a contact — under two names, in
two files:

```js
// lib/txn.js (was Contacts.jsx), read by Pipeline
export const expectedPrice = c => {
  ...
  if (lo && hi) return Math.round((lo + hi) / 2);   // ROUNDS
  ...
};

// Dashboard.jsx, private
function forecastPrice(c) {
  ...
  if (lo > 0 && hi > 0) return (lo + hi) / 2;       // DOES NOT ROUND
  ...
}
```

They also differ in how they read `targetPrice` — `Number(c.targetPrice) || 0`
then `> 0`, versus `Number.isFinite(target) && target > 0` — which agree for
every value either can actually hold, but were arrived at separately.

## What it costs

The midpoint only differs when `priceMin + priceMax` is odd, so the gap is
exactly **half a dollar** on the price. That price is then multiplied by a
commission rate, so the Pipeline's forecast gross and the Dashboard's forecast
gross can differ by a fraction of a cent per contact, compounding across a
pipeline.

Small. It is on this list anyway for two reasons:

1. **It is a real disagreement between two screens about one fact**, which is
   the thing ENGINEERING §2 exists to prevent. The size is an accident of the
   rounding; the defect is that there are two answers.
2. **Nobody would ever notice.** A half-dollar does not look wrong. It looks
   like a rounding artefact, because it is one — which is exactly why it can sit
   there for years.

## Which is right

`Math.round` is, and not because rounding is tidier: a forecast price feeds a
commission calculation that produces a dollar figure people read. Carrying a
half-dollar through a percentage multiply produces a gross with fractional cents
in it, and `commission.js` is careful about this — it has an `r2()` helper and
uses it deliberately. The rounding one is consistent with the engine's own
posture; the unrounded one is an oversight rather than a decision.

## The fix, when it is its own PR

Delete `forecastPrice` from Dashboard, import `expectedPrice`. One import, one
deletion — the change is trivial. The measurement is the part that matters:

- how many contacts have both a `priceMin` and a `priceMax`
- of those, how many have an odd sum, which is the only case that differs
- what the Dashboard's forecast total moves by

Same treatment as the ProyTech corrections: measure, state the size, then change.
