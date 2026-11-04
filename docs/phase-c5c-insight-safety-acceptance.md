# Phase C5c — Staff insight safety and synthetic acceptance matrix

## Why this exists

C1–C5b established authorized evidence retrieval, structured model output,
tenant quotas, review feedback and provider usage recording. Those safeguards
do **not** guarantee that every model-produced statement is accurate or
private. C5c adds a deterministic final text gate for staff-only AI insights.

This change is deliberately **model-offline**: it makes no Claude requests,
reads no customer records, and creates no CRM/database migration.

## Enforced at the output boundary

All model-authored visible text fields (summary, intent rationale, interests,
objections, suggested next action, and uncertainty) now reject:

- Direct email-address or phone-number echoes in model results.
- Unsupported assertions that a payment, deposit, balance or refund has been
  received, paid, confirmed, settled or processed.
- Unsupported enrollment/admission/registration/booking confirmations.
- Promises of a confirmed/reserved/guaranteed seat, place, room, or
  accommodation availability, or issuance of a certificate.
- Echoed instructions to override system/developer rules or reveal internal
  prompts/secrets.

A failed guard invalidates the *entire* model response. It never silently
relabels a problematic claim as a verified fact, adds a CRM activity, sends a
message, or performs an automatic follow-up.

## Synthetic acceptance tests

`tests/readiness/lead-insight-safety-matrix-v1.test.cjs` exercises invented
lead data only, including permitted enquiries, email/phone echo attempts,
reversed payment/refund claims, enrollment/room promises, adversarial
instructions, and missing/foreign/outbound evidence references.

Test command:

`npm run test:readiness`

Existing C2/C3/C4/C5 tests must continue passing as well.

## What this does not prove

- The fact that a citation points to an authorized inbound message does not
  establish that the message semantically supports a claim.
- A text-pattern filter is not a complete PII/data-classification solution.
  Names, addresses, unusual international phone formats and indirect
  identifiers may still require review.
- A generated *negative* claim (for example "payment not received") can also
  be factually incorrect. The parser's acceptance of such wording is NOT
  a verified payment status.
- These fixtures are synthetic *policy regression tests*, not evidence
  that the live Claude model has a measured intent accuracy, conversion
  uplift or financial-claim recall.
- The model might return a valid cited answer with mistaken dates, prices,
  policy explanations, preferences or intent. Staff must check these.

## Pilot reviewer rubric (separate human approval)

Use a consent-compatible, pre-approved evaluation set. For every candidate
insight, a trained reviewer should label:

1. Evidence alignment — each citation actually supports its specific claim.
2. Factual accuracy — dates, prices, payments, policy, and availability
   strictly match trusted records; unknown remains unknown.
3. Privacy handling — no contact details, private notes or sensitive data
   unnecessarily disclosed to staff or third-party AI.
4. Intent/objection judgment — customer-originating messages support the
   classification, with uncertainty stated where appropriate.
5. Next action — safe, human-reviewable, not represented as already done.
6. Failure handling — access revocation, stale context, provider timeout,
   incomplete response and usage logging failures fail closed.

**Release acceptance:** zero critical privacy/commercial assertion failures
in the reviewed pilot sample. Any critical failure must halt activation
pending investigation and retesting. Noncritical accuracy thresholds and
sample sizes require explicit owner agreement before a pilot.

## Release and rollout

1. Complete TypeScript, readiness tests, build/browser tests, CodeQL review.
2. Merge the guarded validation only after required checks pass.
3. Keep production `AI_LEAD_INSIGHTS_*` activation flags OFF.
4. Obtain approval for consent/purpose, data retention and deletion, provider
   spending limits and alert ownership.
5. Only after those gates, run a small permissioned pilot and manually
   verify every source reference and operational action.

OpenSearch remains deferred. No live activation is authorized by this PR.
