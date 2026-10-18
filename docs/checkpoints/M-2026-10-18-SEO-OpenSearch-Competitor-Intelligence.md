# Checkpoint M-2026-10-18 — SEO, OpenSearch, Decision Intelligence, Competitor Intelligence

**Date:** 2026-10-18  
**Original integration branch:** `feature/opensearch-aws-sigv4-v1`  
**Current documentation branch:** `feature/system-intelligence-core-v1`  
**Production Supabase:** `doaozrkrtgeslddwhclj`

## Status summary

The main lexical OpenSearch milestone that was previously waiting on Vercel quota/runtime proof is now **verified for the controlled Yogakulam pilot**.

The remaining external-provider work is now primarily:

- semantic/vector embeddings
- real competitor/ranking evidence provider
- production rollout hardening

The lexical OpenSearch connection itself is no longer the blocker.

---

## Completed / materially implemented

- Tracking Contract v1 release gate is READY and frozen.
- Privacy technical platform includes retention, access/export, subject resolution, erasure planning and privacy-safe search telemetry.
- OpenSearch foundation includes reference-only outbox, lease/revision-safe workers, server-derived tenant filtering, pilot controls, health/bootstrap and command palette.
- SEO lexical indexing covers pages, topics, entities, experiments and optimization actions.
- SEO semantic foundation includes embedding outbox, hash dedupe, privacy-safe embedding subjects, kNN architecture and hybrid RRF design with lexical fallback.
- SEO Decision Intelligence ranks next-best actions using traffic, opportunity, business/revenue, technical, content, AEO and GEO evidence.
- Decision recommendations can stage draft experiments/actions while preserving human approval and blocking automatic website publishing.
- SEO Learning Loop classifies outcomes and feeds bounded historical learning into future rankings.
- Automatic outcome capture waits for experiment maturity/GSC lag, captures same-length final windows, finalizes experiments and records audit evidence.
- Explainability/forecasting provides bounded low/base/high scenarios and refuses to fabricate lead/revenue rates without observed evidence.
- Opportunity Portfolio ranks top 3/5/8 priorities using upside, confidence, effort and risk; forecast snapshots enable prediction-vs-actual calibration.
- Competitor Intelligence supports tenant-scoped competitors, SEO/AEO/GEO rank targets, grounded Claude strategy, recommendation→draft-experiment bridge, lease-safe worker, retry/backoff, cost controls and exports.
- Competitor/OpenSearch architecture includes competitor intelligence search mode, competitive opportunity engine, opportunity surfacing and ranking-report exports.
- Claude SEO recommendation→draft-experiment E2E has also been verified separately, including idempotency and foreign-tenant rejection.

---

## AWS OpenSearch provider

Verified provider:

- [x] Amazon OpenSearch Serverless collection `salsys-search`
- [x] Region `ap-southeast-2`
- [x] Collection type `SEARCH`
- [x] Collection observed `ACTIVE`
- [x] Endpoint `https://ka4nj04bskgw51vo0w2h.ap-southeast-2.aoss.amazonaws.com`
- [x] ARN `arn:aws:aoss:ap-southeast-2:354245663449:collection/ka4nj04bskgw51vo0w2h`
- [x] AWS-owned encryption
- [x] deletion protection enabled
- [x] authenticated public network endpoint
- [x] dedicated AWS principal for Vercel pilot

Preferred Vercel↔AWS OIDC remains blocked by an AWS Organizations SCP. The controlled preview therefore used a dedicated AWS runtime IAM credential path. Credential values are not recorded in GitHub and should never be exposed.

---

## SigV4 adapter

Verified implementation:

- [x] AWS SigV4 signing for OpenSearch Serverless (`aoss`)
- [x] Basic auth preserved
- [x] Bearer auth preserved
- [x] shared signed adapter covers core health/bootstrap/indexing/search paths
- [x] normal tenant lexical search uses signed adapter
- [x] SEO lexical requests use signed adapter
- [x] SEO mapping/bootstrap requests use signed adapter
- [x] tenant filter and post-validation retained

Semantic/vector code still requires final signed-provider alignment before semantic production enablement.

---

## Vercel provider configuration

The controlled pilot used branch-scoped Preview configuration for:

- [x] `OPENSEARCH_URL`
- [x] `OPENSEARCH_INDEX_PREFIX`
- [x] `OPENSEARCH_AWS_REGION`
- [x] `OPENSEARCH_AWS_SERVICE`
- [x] `AWS_ACCESS_KEY_ID` as Sensitive
- [x] `AWS_SECRET_ACCESS_KEY` as Sensitive
- [x] `AWS_REGION=ap-southeast-2`
- [x] `AWS_DEFAULT_REGION=ap-southeast-2`

The Vercel account was upgraded to Pro, so the previous Hobby deployment-quota blocker is obsolete.

---

## Real lexical E2E verification

### Base lead search

Controlled Yogakulam pilot:

- [x] exactly 25 Yogakulam lead documents staged for the bounded indexing test
- [x] worker claimed `25`
- [x] worker succeeded `25`
- [x] worker failed `0`
- [x] all bounded outbox rows finalized `done`
- [x] real Yogakulam lexical retrieval returned matches
- [x] observed Yogakulam verification query returned `11` matches
- [x] foreign `test-yoga-school` verification returned `0`
- [x] tenant post-validation passed

### SEO lexical search

- [x] SEO mappings applied successfully
- [x] mapping verification observed `119` mapped fields
- [x] bounded SEO pilot claimed `10`
- [x] bounded SEO pilot succeeded `10`
- [x] bounded SEO pilot failed `0`
- [x] real SEO lexical retrieval returned `7` results in the verification query
- [x] foreign-tenant SEO retrieval returned `0`

### Cleanup / safety

- [x] tenant indexing switched back OFF after the controlled verification
- [x] other tenants remained disabled
- [x] production-wide indexing remains OFF
- [x] temporary verification endpoint was removed after use
- [x] no synthetic competitor/ranking evidence was left behind

This closes the controlled lexical OpenSearch E2E milestone.

---

## Cross-tenant security result

The critical adversarial proof is complete for the lexical pilot:

`authorized Yogakulam search > 0 results`

while:

`foreign test-yoga-school search = 0 results`

The query layer also preserves organization filtering and post-validates returned tenant IDs. This search-layer proof is important, but it does **not** replace the separate W8 global tenant/security sign-off.

---

## Production safety

Current safety posture:

- production-wide OpenSearch indexing: OFF
- controlled pilot indexing: OFF after test
- semantic/vector indexing: OFF
- live ranking provider: OFF
- recurring paid rank checks: OFF
- automatic website publishing: OFF
- autonomous customer messaging: OFF
- Claude remains reasoning/strategy, not ranking truth
- search/SEO data remains tenant-bound
- sensitive AWS credentials remain server-side

Do not broaden indexing until monitoring/recovery and rollout controls are reviewed.

---

## Competitor Intelligence current limitation

The competitor/rank/analysis search architecture is substantially implemented, but a truthful live competitor lexical E2E test still requires actual competitor/ranking records.

At the time of verification Yogakulam had no real records suitable for proving:

- `seo_competitors`
- `seo_rank_targets`
- `seo_rank_snapshots`
- real competitor analysis evidence

A DataForSEO adapter branch was started later, but the product decision is to **defer the live ranking provider** for now.

Therefore:

- do not seed fake rankings
- do not claim live competitor positions
- do not claim Google AI citations without observed provider evidence
- Claude may reason over first-party/GSC evidence only until a ranking provider is connected

---

## Remaining external provider work

### Semantic embeddings

Still required:

- [ ] select/connect embedding provider
- [ ] configure model/vector dimension
- [ ] migrate/verify remaining semantic signed requests
- [ ] bootstrap real vector index
- [ ] run embedding worker
- [ ] verify kNN retrieval
- [ ] verify tenant isolation for semantic search
- [ ] calibrate lexical + vector RRF/hybrid relevance
- [ ] validate cost controls

### Live SEO/AEO/GEO ranking provider — deferred

Internal ranking architecture is ready enough to accept a provider later.

When resumed:

- [ ] connect DataForSEO or chosen provider
- [ ] create truthful competitor/rank targets
- [ ] run one-query normalization test
- [ ] verify provider health/budgets
- [ ] save real rank snapshots
- [ ] index competitor/rank/analysis documents
- [ ] verify competitor lexical search
- [ ] run cross-tenant competitor query
- [ ] enable bounded recurring checks only after all controls pass

---

## Closed checklist

- [x] Fresh Preview deployment after Vercel quota blocker was removed
- [x] Verify latest OpenSearch branch builds successfully
- [x] Prove Vercel→AWS SigV4 path
- [x] Bootstrap controlled index/mappings
- [x] Enable exactly one controlled Yogakulam tenant
- [x] Process bounded lead indexing batch
- [x] Verify authorized tenant retrieval
- [x] Verify SEO mappings
- [x] Process bounded SEO indexing batch
- [x] Verify SEO lexical retrieval
- [x] Run adversarial cross-tenant lead search
- [x] Require foreign lead results `0`
- [x] Run adversarial cross-tenant SEO search
- [x] Require foreign SEO results `0`
- [x] Return pilot indexing to OFF after test
- [x] Remove temporary verification route/data

---

## Next checkpoint from this milestone

1. Treat lexical OpenSearch as verified infrastructure rather than the active blocker.
2. Continue System Intelligence Core and Claude unified reasoning work.
3. Finish W8 tenant/security closeout independently.
4. Connect a real embedding provider and run semantic/vector E2E.
5. Revisit a live ranking provider later when competitor evidence becomes product priority.
6. Keep production-wide OpenSearch indexing OFF until rollout/monitoring controls are explicitly approved.
