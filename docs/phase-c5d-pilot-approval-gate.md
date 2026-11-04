# Phase C5d — Explicit AI pilot release approvals (default deny)

## Purpose

Phase C already has tenant opt-in, per-user and per-tenant request quotas,
private provider token ledgers, evidence validation, and staff review.
A tenant policy and feature flag alone do **not** establish that privacy,
retention, provider spending, and quality checks have been approved.

C5d adds one additional **database-enforced prerequisite**, checked in the
same transaction that reserves model quota. The server cannot begin a Claude
insight request unless the approval record is complete and current.

## Database enforcement

`ai_lead_insight_pilot_approvals` is private, tenant-keyed and protected
by enforced RLS. Only the trusted service role may read or write it.
No public or authenticated browser privilege/policy is granted.

The existing `reserve_ai_lead_insight_generation_v1` checks:

- A matching active tenant and staff lead authorization
- An enabled tenant quota policy
- A current approval row with `policy_version=lead_insight_pilot_v1`
- Nonfuture, nonnull signoffs for privacy, retention, provider budget
  verification, and human quality review
- An attributable user ID and meaningful internal approval reference
- An unexpired approval and no revocation
- Atomic daily-tenant/hourly-user quota availability

If any check fails, the reservation returns false **before** incrementing
usage counters or contacting Claude. Existing quota semantics are retained.

**This migration creates no approval row and does not activate AI.**

## Owner/admin readout

`/settings/ai-insights` displays only whether the active tenant's
approval is missing, incomplete, revoked, expired or current. It returns
neither the reviewer ID nor the evidence reference or approval documents
to the browser. The page remains read-only, owner/admin only, and requires
a fresh active membership.

A completed record is a **recorded signoff**, not mathematical proof that
legal or model-quality requirements were truly satisfied. The approver must
independently verify the evidence and have legitimate authority.

## Human release procedure (not automated by this PR)

1. **Privacy:** Approve lawful data-processing purpose and provider
   disclosures/consent, country-handling, sensitive-data exclusions, and
   confidentiality requirements for customer conversation analysis.
2. **Retention:** Approve documented retention/deletion windows for AI
   metadata, reviews, usage events and source-data handling. The current
   dashboard's 90-day figure is a proposal, not an approved policy or
   an automatic cleanup action.
3. **Budget:** Verify Anthropic workspace spending limits/alerts, alert
   recipients, monitoring owner, provider model pricing and rollback.
   CRM token counts are not monetary invoices or hard billing caps.
4. **Quality:** Review a consent-compatible pilot evaluation dataset
   with actual citation relevance, false commercial claims, privacy,
   recovery on errors, user access, and staff-review behavior.
5. Record separate dated signoffs with attributable approver and evidence
   reference, after approval in an audited admin workflow. Set a bounded
   expiration date and keep revocation available. This repository does
   not yet expose an approval-editing form or automatically grant it.
6. Only after all existing flags/tenant limits AND these signoffs are
   confirmed should a separately authorized operator activate a pilot.
7. Revoke the record or disable the tenant policy to halt new requests;
   disabling `AI_LEAD_INSIGHTS_ENABLED` is an immediate global stop.

## Synthetic QA and release

- SQL migration replay (including function and permission checks)
- TypeScript, readiness suite, build/browser tests, CodeQL
- Missing approval -> no quota, no model request
- Partial/expired/revoked/wrong-version approvals -> denied
- Positive, current signed record -> still subject to tenant/user quotas
- Owner/admin readout never exposes source/private documents or offers a
  client-side approval shortcut
- Production flags stay OFF, and no consent or policy decision is fabricated

OpenSearch remains out of scope.
