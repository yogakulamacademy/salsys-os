# Checkpoint M-2026-10-18 — SEO, OpenSearch, Decision Intelligence, Competitor Intelligence

**Date:** 2026-10-18  
**Active integration branch:** `feature/opensearch-aws-sigv4-v1`  
**HEAD before checklist update:** `5ccedaaa57b2b22acf584e6c540ddcc9e4ababf3`  
**Production Supabase:** `doaozrkrtgeslddwhclj`

## Completed / materially implemented

- Tracking Contract v1 release gate is READY and frozen.
- Privacy technical platform includes retention, access/export, subject resolution, erasure planning and privacy-safe search telemetry.
- OpenSearch foundation includes reference-only outbox, lease/revision-safe workers, server-derived tenant filtering, pilot controls, health/bootstrap and command palette.
- SEO lexical indexing covers pages, topics, entities, experiments and optimization actions.
- SEO semantic foundation includes embedding outbox, hash dedupe, privacy-safe embedding subjects, kNN index architecture and hybrid RRF retrieval with lexical fallback.
- SEO Decision Intelligence ranks next-best actions using traffic, opportunity, business/revenue, technical, content, AEO and GEO evidence.
- Decision recommendations can stage draft experiments/actions while preserving human approval and blocking automatic website publishing.
- SEO Learning Loop classifies outcomes and feeds bounded historical learning into future rankings.
- Automatic outcome capture waits for experiment maturity/GSC lag, captures same-length final windows, finalizes experiments and records audit evidence.
- Explainability/forecasting provides bounded low/base/high scenarios and refuses to fabricate lead/revenue rates without observed evidence.
- Opportunity Portfolio ranks the top 3/5/8 priorities using upside, confidence, effort and risk; forecast snapshots enable prediction-vs-actual calibration.
- Competitor Intelligence supports tenant-scoped competitors, SEO/AEO/GEO rank targets, historical snapshots, grounded Claude strategy, recommendation→draft-experiment bridge, lease-safe worker, retry/backoff, cost controls and exports.
- Live ranking provider control plane supports one-query normalization testing, surface enablement, interval/budget controls and fail-closed activation.
- Competitor/OpenSearch work includes competitor intelligence search mode, competitive opportunity engine, opportunity surfacing in SEO workspace and ranking-report exports.
- Competitor/rank/analysis OpenSearch entities, query/source allowlists and UI path were verified on the current development line.

## OpenSearch provider connection — new progress

The OpenSearch state has advanced from **provider not connected** to **real provider provisioned/configured for a controlled Preview pilot; application E2E pending**.

### AWS provider

- [x] Created Amazon OpenSearch Serverless collection `salsys-search`
- [x] Region: `ap-southeast-2`
- [x] Collection type: `SEARCH`
- [x] Collection observed `ACTIVE`
- [x] Endpoint: `https://ka4nj04bskgw51vo0w2h.ap-southeast-2.aoss.amazonaws.com`
- [x] ARN: `arn:aws:aoss:ap-southeast-2:354245663449:collection/ka4nj04bskgw51vo0w2h`
- [x] AWS-owned encryption key retained
- [x] Deletion protection enabled
- [x] Public network endpoint with authenticated access requirement
- [x] Dedicated AWS principal prepared for the Vercel pilot

Preferred Vercel↔AWS OIDC could not be completed because an AWS Organizations policy blocked the required IAM/OIDC operation. The controlled Preview pilot therefore uses a dedicated AWS access-key path. Credential values are not recorded in GitHub.

### SalsysOS SigV4 adapter

- [x] Added AWS SigV4 signing support for OpenSearch Serverless (`aoss`)
- [x] Preserved existing Basic auth support
- [x] Preserved existing Bearer auth support
- [x] Shared signed request adapter covers health/bootstrap/indexing/search paths needed by the pilot
- [x] SEO lexical requests use the shared signed request path
- [x] Competitor lexical requests use the shared signed request path
- [x] Tenant verification remains in the query/result flow

### Vercel controlled configuration

The following are configured for **Preview only** and branch `feature/opensearch-aws-sigv4-v1`:

- [x] `OPENSEARCH_URL`
- [x] `OPENSEARCH_INDEX_PREFIX`
- [x] `OPENSEARCH_AWS_REGION`
- [x] `OPENSEARCH_AWS_SERVICE`
- [x] `AWS_ACCESS_KEY_ID` as Sensitive
- [x] `AWS_SECRET_ACCESS_KEY` as Sensitive
- [x] `AWS_REGION=ap-southeast-2`
- [x] `AWS_DEFAULT_REGION=ap-southeast-2`

Production remains untouched by this OpenSearch provider pilot.

## Production safety

- OpenSearch production-wide indexing remains disabled.
- The AWS provider configuration is branch-scoped Preview only.
- Semantic indexing remains disabled.
- Live ranking providers remain disabled.
- No recurring paid rank checks are active.
- No automatic website publishing is enabled.
- Claude is reasoning/strategy only; it is not the source of ranking truth.
- Search, SEO and competitor data remain tenant-scoped.
- Sensitive AWS credentials are server-side and must not be written into docs/logs/UI/exports.
- Do not promote the OpenSearch pilot to Production before runtime health, indexing/search and cross-tenant tests pass.

## Validation already completed

Rollback-only database tests verified competitor, rank-target and analysis search documents are indexable for the correct tenant and rejected cross-tenant. Synthetic rows were removed; no test data remained.

An earlier SigV4 branch revision received a successful Vercel build. The latest branch/configuration state still requires a fresh Preview deployment before it can be called runtime-verified.

## Current blocker

Vercel Hobby has hit the daily API deployment limit:

`Resource is limited — try again in 24 hours (more than 100, code: api-deployments-free-per-day)`

This is a Vercel quota blocker, not evidence of an OpenSearch or application code failure.

## OpenSearch E2E checklist — next after quota reset

- [ ] Fresh Preview deployment of `feature/opensearch-aws-sigv4-v1`
- [ ] Confirm latest branch compiles/deploys successfully
- [ ] Run protected OpenSearch health check from Vercel
- [ ] Prove AWS SigV4 authentication succeeds against the real Serverless endpoint
- [ ] Bootstrap the controlled base index
- [ ] Apply SEO + competitor mappings
- [ ] Enable exactly one controlled Yogakulam tenant
- [ ] Process a bounded indexing outbox batch
- [ ] Verify authorized tenant documents are indexed
- [ ] Verify normal tenant search
- [ ] Verify SEO lexical search against real indexed data
- [ ] Verify competitor lexical search against real indexed data
- [ ] Run adversarial cross-tenant query
- [ ] Require foreign-tenant result count = `0`
- [ ] Inspect runtime logs/telemetry for secret leakage, tenant leakage and retry/failure behavior
- [ ] Only after all checks pass, decide whether to expand the provider beyond the Preview pilot

## Remaining external provider work

### Semantic embeddings

- [ ] Select/connect real embedding provider
- [ ] Configure model and vector dimension
- [ ] Run semantic bootstrap
- [ ] Run vector worker
- [ ] Verify kNN retrieval
- [ ] Calibrate lexical + vector RRF/hybrid quality

### Live SEO/AEO/GEO rank provider

Still missing:

- `SEO_RANKING_API_URL`
- `SEO_RANKING_API_KEY`

Next work:

- [ ] Select/connect a real ranking provider
- [ ] Pass one-query normalization test before recurring checks
- [ ] Verify provider health and cost/budget controls
- [ ] Enable bounded recurring rank checks only after normalization passes

## Build state

Current integration branch before this documentation update:

`5ccedaaa57b2b22acf584e6c540ddcc9e4ababf3` — `Sign SEO OpenSearch requests through shared adapter`

Do not claim the latest branch/configuration is fully build/runtime verified until a fresh Preview deployment succeeds after Vercel's quota resets.

## Next checkpoint

1. Fresh Preview deployment when Vercel quota clears.
2. Real SigV4 health check against `salsys-search`.
3. Bootstrap base index and apply SEO/competitor mappings.
4. Enable one Yogakulam tenant only and process a bounded indexing batch.
5. Validate normal/SEO/competitor lexical search.
6. Run adversarial cross-tenant search and require zero foreign results.
7. Connect real embeddings and validate semantic/hybrid retrieval.
8. Connect a real live ranking provider and pass SEO/AEO/GEO normalization tests.
9. Enable bounded recurring rank checks only after provider health/cost controls pass.
10. Accumulate real experiments to calibrate forecast and action-learning models.
11. Continue W8 tenant/security closeout independently.
