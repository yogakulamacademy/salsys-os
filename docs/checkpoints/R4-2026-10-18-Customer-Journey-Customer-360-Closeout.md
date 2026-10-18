# R4 — Customer Journey / Customer 360 Closeout

**Date:** 2026-10-18  
**Repository:** `yogakulamacademy/salsys-os`  
**Branch:** `feature/system-intelligence-v2`  
**Production Supabase:** `doaozrkrtgeslddwhclj`

## Status

**R4 baseline: COMPLETE.**

This closeout covers the tenant-safe customer graph and ordered Customer 360 journey:

`anonymous visitor → session → identity resolution → Person → Lead(s) → behavior/touchpoints → CRM/workflow → conversations/messages → payments/enrollment → Person 360 → complete journey`

It does not claim completion of attribution/revenue measurement, predictive modeling, provider automation, or autonomous decisioning.

## Verified production capabilities

- Durable tenant-scoped `persons` identity records.
- Tenant-safe Person links to identifiers, Leads and web sessions.
- Canonical `v_person_360` read model across identity, CRM, website behavior, communications, enrollment and per-currency paid revenue.
- Canonical `v_person_journey` ordered event stream across digital touchpoints, Lead creation, stage history, contacts, conversations, messages, payments and enrollment.
- Operational extensions add follow-up/task workload and workflow lifecycle events without replacing the stable base models.
- Customer 360 is rendered directly in Lead detail through server-side active-organization resolution and Lead authorization.
- R4 read models use `security_invoker=true` and therefore preserve underlying RLS behavior.

## Integrity audit

Production checks after R4 cleanup returned **zero** for:

- Person ↔ Lead tenant mismatch
- Person ↔ Session tenant mismatch
- visitor identity-link tenant mismatch
- web session ↔ Lead tenant mismatch
- touchpoint ↔ Lead tenant mismatch
- touchpoint ↔ Session tenant mismatch
- Lead without Person
- duplicate Person–Lead links
- duplicate Person–Session links
- orphan active Person rows
- duplicate journey event keys
- journey events missing Person
- Lead journey rows missing Lead
- Person 360 linked Persons missing latest Lead

Two isolated synthetic identity-self-test Person rows were removed only after proving that they had no identifiers, no Lead links and no Session links.

## R4 implementation checkpoints

Cleanup migration:

`supabase/migrations/20261018195500_customer360_identity_self_test_cleanup_v1.sql`

Commit:

`ebb86b6fdcd4583ee50d1db17797e8890e70114e` — **Clean isolated Customer 360 identity self-test residue**

Operational completeness migration:

- adds `v_person_360_operational`
- adds `v_person_journey_complete`
- includes follow-up/task workload and owner/follow-up workflow events

Commit:

`0540de0bc85e6660e87d96bea4d2f7c620548810` — **Add Customer 360 operational completeness views**

Application integration commits:

- `c4e5512f29964bdbe0e269ae149c3b941cbf86ee` — **Use complete Customer 360 read models**
- `37ed95a1a8d7a38842a6f8ed07789b0481858718` — **Show follow-up workload in Person 360**
- `3405d0e0e39380a32272e5d6a6b928aed98474d8` — **Show workflow events in customer journey**

The final R4 application checkpoint is green on Vercel.

## Boundaries intentionally left for later phases

- acquisition/revenue attribution and funnel measurement → R5
- intent/product-affinity and sales intelligence → R6
- provider conversion feedback → R7
- predictive next-best-action and forecasting calibration → R10
- generic vertical productization → R11+

## Exit criteria

R4 is considered closed because customer identity, behavioral evidence, CRM activity, operational workflow, communications and commercial events can be read as one tenant-safe Customer 360 and ordered customer journey in production.

## Next phase

Proceed to **R5 — Attribution, Funnel & Revenue Intelligence** and verify:

`traffic/source → Lead attribution → funnel conversion → payment/enrollment → per-currency revenue → campaign/source performance → data-quality reconciliation`
