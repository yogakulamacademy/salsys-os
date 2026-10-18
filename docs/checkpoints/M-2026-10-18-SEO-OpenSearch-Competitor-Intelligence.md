# Checkpoint M-2026-10-18 — SEO, OpenSearch, Decision Intelligence, Competitor Intelligence

**Date:** 2026-10-18  
**Branch:** `feature/seo-competitor-ranking-v1`  
**HEAD at checkpoint:** `9e5b60d9d6001982bc57c84c0784d59297ad8ace`  
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
- Latest competitor/OpenSearch work adds competitor intelligence search mode, competitive opportunity engine, opportunity surfacing in SEO workspace and ranking-report exports.

## Production safety

- OpenSearch external indexing remains disabled.
- Semantic indexing remains disabled.
- Live ranking providers remain disabled.
- No recurring paid rank checks are active.
- No automatic website publishing is enabled.
- Claude is reasoning/strategy only; it is not the source of ranking truth.
- Search, SEO and competitor data remain tenant-scoped.

## Validation

Rollback-only database tests verified competitor, rank-target and analysis search documents are indexable for the correct tenant and rejected cross-tenant. Synthetic rows were removed; no test data remained.

## External blockers

- Real OpenSearch provider credentials are not configured.
- Real embedding provider configuration is not connected.
- `SEO_RANKING_API_URL` and `SEO_RANKING_API_KEY` are not configured.
- Therefore real OpenSearch E2E, vector/kNN E2E and live SEO/AEO/GEO provider E2E remain pending.

## Build state

Current branch HEAD status is Vercel **failure caused by deployment build-rate limiting** (`retry in 24 hours`). This is not a successful compile validation.

An earlier branch build reached TypeScript checking and exposed an issue in `lib/seo/rank-provider-control.ts` around `current.last_health_status` being inferred from `{}`. A fresh build is required once the Vercel quota clears; fix any remaining type/runtime issues before merge.

## Next checkpoint

1. Fresh Vercel build and TypeScript/runtime cleanup.
2. Verify competitor OpenSearch mappings/query/source allowlists end to end.
3. Connect a real OpenSearch provider and run a controlled single-tenant pilot.
4. Connect a real embedding provider and validate semantic/hybrid quality.
5. Select/connect a real live ranking provider and pass one-query SEO/AEO/GEO normalization tests.
6. Enable bounded recurring rank checks only after health/cost controls pass.
7. Accumulate real experiments to calibrate forecast and action-learning models.
8. Continue W8 tenant/security closeout independently.
