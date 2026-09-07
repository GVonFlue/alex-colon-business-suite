# Lead intake — the website's leads landing here

`api/lead-intake.js` receives leads from **alexcolonhomes.com**. It implements
the receiving half of that site's contract, documented at `docs/lead-payload.md`
in the website repo, **contract version 1.1**.

If that file's version line moves, this one has to be read again.

---

## Wiring, both ends

| Where | Variable | Value |
|---|---|---|
| CRM | `LEAD_INTAKE_TOKEN` | `openssl rand -hex 32` |
| CRM | `LEAD_INTAKE_OWNER_ID` | Alex's `crm_users.id` |
| Website | `CRM_LEAD_ENDPOINT` | `https://<crm-domain>/api/lead-intake` |
| Website | `CRM_API_KEY` | the same value as `LEAD_INTAKE_TOKEN` |

Both projects need a redeploy after setting them. Environment variables only
apply to builds that run afterwards.

---

## Test it before you trust it

One command. Run it after both projects have redeployed.

```bash
curl -s -X POST https://<crm-domain>/api/lead-intake \
  -H "authorization: Bearer $LEAD_INTAKE_TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "full_name": "Intake Test",
    "email": "intake-test@example.test",
    "phone": "(316) 555-0100",
    "notes": "Delete me.",
    "source": "Colon - Buyer Guide Request [local]",
    "landing_route": "/buy",
    "external_ref": null,
    "received_at": "2026-09-06T18:00:00.000Z",
    "deployment": "local"
  }'
```

Expected: `{"ok":true,"id":"..."}`, and a new contact at the top of the pipeline
in stage New Lead, source **Colon - Buyer Guide Request** with the `[local]`
marker stripped.

Then do the real one: submit the buyer's guide form on the live website and
watch it appear. That is the only test that proves both ends.

Delete both test contacts afterwards.

---

## Four behaviours worth knowing before you debug it

**The website does not retry.** Ever. If this endpoint is down, slow past eight
seconds, or returns non-2xx, the lead does not arrive here and nothing will try
again. It still reaches the Google Sheet, which is the site's source of truth,
and the site logs the whole payload in one line tagged `[lead][RECOVERABLE]`
so it can be replayed by hand. Design nothing here that assumes a second chance.

**A failure here is invisible to the visitor**, by design on the website's side.
That is correct behaviour and it is also why a broken intake looks exactly like
a quiet week. Check the health line below on any week that feels slow.

**IDs are strings.** `external_ref` arrives as a string and is stored as one.
`Number("9007199254740993")` is `9007199254740992`, a different record. The
handler rejects a numeric `external_ref` outright, because the website throws
rather than send one, so a number arriving means something other than the
website is posting here.

**Source is never rewritten.** Whatever arrives is stored, even if it is not in
`SOURCES` in `alexcolon.config.js`. Most CRMs default unattributed API leads to
"Other" and that quietly destroys source reporting. An unfamiliar source in a
report is a question worth asking; a lead relabelled "Other" is a question
nobody can ask. The only thing stripped is the environment marker, so a preview
test does not create a duplicate source row.

---

## Health check

Two minutes, worth doing monthly and any week the pipeline looks thin.

1. Vercel → the CRM project → **Logs**, filter `lead-intake`.
2. Lines beginning `[lead-intake] stored` are successes.
3. Lines containing `[RECOVERABLE]` carry the full payload of a lead that did
   not make it. Those can be re-entered by hand.
4. `rejected a request with a bad or missing token` means the two token values
   have drifted apart. Usually one project got redeployed and the other did not.

---

## What is captured now for reporting that does not exist yet

The handler writes three things nothing currently reads. They are cheap to
capture and impossible to backfill, which is the whole reason they are there.

`data.attribution` keeps the full source tag with its environment marker, the
landing route, the external ref and the deployment. That is the raw material for
the campaign-level attribution and the cost-per-lead reporting Alex asked for.

`data.firstContactAt` is `null` on arrival and `data.lastTouch` stays `null`
until somebody actually makes contact. The gap between `created_at` and the
first real activity entry **is** the speed-to-lead number he asked for by name.
Nothing computes it yet. When something does, the history will already be there.
