/* ============================================================================
   txn.js — facts read off a contact or a transaction that more than one
   screen needs to agree on.

   These are not money maths; commission.js owns that and stays pure. These are
   the questions every screen asks before it can show a number: what did this
   transaction gross, when did it close, and what price should a forecast use.

   THEY LIVED IN THREE AND TWO PLACES RESPECTIVELY.

   txGross was defined identically in Dashboard, Huddle and Transactions —
   verified identical, not assumed: the three bodies hashed the same. One of
   them was even exported and the other two ignored it. The comment on the
   Transactions copy records a bug that was already found and fixed:

     "Dragging a card into the Closed column closes the deal WITHOUT writing a
      snapshot, and reading the snapshot alone reported those as $0 of GCI."

   That fix had to be made in three files. It was. Nothing guaranteed it, and
   the next one might land in two — which is the Dashboard and the Huddle
   quietly disagreeing about GCI, with nothing failing.

   closedOn is subtler and worth reading carefully. Dashboard exported one;
   Huddle had a LOCAL VARIABLE of the same name doing the same job WITHOUT the
   normalisation:

     Dashboard   String((t.closedActual || t.closeDate) || '').slice(0, 10)
     Huddle      t.closedActual || t.closeDate

   They agree today because every writer stores a plain YYYY-MM-DD date. They
   agree by data convention, not by code — the moment one of those fields holds
   a full timestamp, one screen truncates it and the other compares it whole.
   ========================================================================== */

import { agentPlan, computeCommission } from './commission';

/* Gross is the whole commission cheque before anyone's split. Asking the engine
   for it with a do-nothing plan means ONE definition of gross exists. */
export const FLAT_PLAN = agentPlan({ keepPct: 100, cap: 0, teamPct: 0, fees: [] });

/** Gross commission on a transaction: the snapshot if there is one, else the
 *  engine. A deal closed by dragging a card has no snapshot, and reading the
 *  snapshot alone reports those as $0. */
export function txGross(t) {
  const snap = t && t.commissionSnapshot && Number(t.commissionSnapshot.gross);
  if (Number.isFinite(snap) && snap > 0) return snap;
  return computeCommission(t || {}, FLAT_PLAN, { capPaidToDate: 0 }).gross;
}

/** The date a deal closed: the actual one if there is one, else the scheduled
 *  one. Normalised to YYYY-MM-DD so a caller can compare it to a date bound
 *  without caring what shape the field was stored in. */
export const closedOn = t => String((t && (t.closedActual || t.closeDate)) || '').slice(0, 10);

/** A copy of the transaction whose closeDate IS the date it actually closed —
 *  for the readers that key off closeDate and should not care which field the
 *  truth landed in. */
export const onClosedDate = t => ({ ...t, closeDate: closedOn(t) || t.closeDate || null });

/* ---------------------------------------------------------------------------
   MOVED HERE UNCHANGED from Contacts.jsx, where Pipeline.jsx was importing it
   — a view had quietly become a library. The body is byte-identical; no number
   moves because of this.

   NOTE, and it is written up rather than fixed here: Dashboard.jsx has its own
   forecastPrice() computing the same fact under a different name, and the two
   do NOT agree — this one rounds the midpoint, that one does not. See
   FORECAST-PRICE-FINDING.md. */
export const expectedPrice = c => {
  if (!c) return 0;
  const t = Number(c.targetPrice) || 0;
  if (t > 0) return t;
  const lo = Number(c.priceMin) || 0, hi = Number(c.priceMax) || 0;
  if (lo && hi) return Math.round((lo + hi) / 2);
  return lo || hi || 0;
};
