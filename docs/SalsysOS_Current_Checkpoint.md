# SalsysOS — Current Checkpoint

**Updated:** 2026-10-18
**Canonical repository:** `yogakulamacademy/salsys-os`
**Production Supabase project:** `doaozrkrtgeslddwhclj`
**Production domain:** `https://salsysos.com`
**Active SEO/competitor branch:** `feature/seo-competitor-ranking-v1`
**Branch HEAD at checkpoint:** `9e5b60d9d6001982bc57c84c0784d59297ad8ace` — `Export competitive opportunities with ranking reports`

> This is the mutable implementation checkpoint. `SalsysOS_Master_Context.md` remains the long-lived strategic source of truth.

---

## 1. Product direction

SalsysOS remains a **Sales + Analysis Operating System**, not a generic CRM. The product loop is:

`marketing spend → traffic/source/content → behavior → identity → lead → conversation → intent/objection → salesperson activity → follow-up → payment/enrollment → revenue → attribution → learning → next-best action`

Primary proving ground: **Yogakulam Academy**. Second planned vertical: **Real Estate**.

AI direction remains:

`Assist → Decide → Act with controls`

Human approval remains mandatory for sensitive/high-impact customer or website actions.

---

## 2. Major checkpoint status

### A. Tenancy / W8 security

- Server-derived tenant binding remains the authority.
- Exactly one active membership per normal user is the target contract.
- Tenant-specific reads/writes/RPCs/integrations have been substantially hardened.
- Cross-tenant adversarial testing has blocked foreign CRM/settings/follow-up/contact/stage/owner/integration paths.
- Strict global tenant-session enforcement remains a separate W8 sign-off item and should not be conflated with OpenSearch/SEO tenant filtering.
- Outstanding W8 work includes final second-tenant validation, remaining SECURITY DEFINER intent review, residual integration/service checks, legacy multi-org admin cleanup, and strict cutover/sign-off.

### B. Smart Triggers / automation

- Smart Trigger foundation exists with tenant-scoped workflows, triggers, conditions, actions, events, runs, enrollments and suppressions.
- Visual flow/runtime architecture includes nodes, edges, wait states, scheduled jobs, variables and immutable flow versions.
- Reply and no-reply paths were validated without sending customer messages.
- Human approval, suppression, stop-on-reply and channel-policy direction remains locked.
- Autonomous customer messaging remains gated until all provider/channel-policy and safety controls are signed off.

### C. Tracking Contract v1

**Status: READY / frozen.**

Implemented and production-verified:

- dynamic tracking sources
- event families/contracts
- immutable raw events
- generalized collect / consent / identify
- source provisioning
- rate limiting
- sanitization/redaction
- lead processing/dedupe
- retry/recovery crons
- attribution state machine
- privacy gating
- release gate verifying all tracked organizations ready for external ingestion and OpenSearch indexing

### D. Privacy & compliance technical platform

Implemented foundations include:

- retention executor + cron
- verified access/export flow
- subject resolution
- erasure planner + cron
- privacy-safe search telemetry

The unused draft erasure orchestrator migration remains intentionally unapplied and must not be run.

### E. OpenSearch core foundation

Implemented:

- reference-only `search_index_outbox`
- per-organization search settings
- lease/revision-safe claim/finalize RPCs
- JIT document rebuilding from PostgreSQL truth
- protected indexing worker
- strict server tenant resolver
- tenant-filtered OpenSearch query service
- tenant-bound global search API
- controlled pilot guard + cap
- health/bootstrap routes
- global command palette
- privacy-safe observability telemetry
- admin OpenSearch health page

Production remains safe because real OpenSearch provider credentials are still not configured and organization indexing remains disabled.

### F. SEO → OpenSearch lexical intelligence

SEO search entities now include:

- `seo_page`
- `seo_topic`
- `seo_entity`
- `seo_experiment`
- `seo_action`

Implemented:

- SEO JIT search-document builder
- page/topic/entity/experiment/action enqueue triggers
- 30-minute derived SEO refresh
- SEO-only pilot seed path
- tenant-filtered SEO query layer
- explicit dynamic:false SEO mappings
- authenticated `/api/seo/search/v1`
- interactive `/seo/intelligence` workspace

### G. Semantic / hybrid SEO retrieval

Implemented provider-independent semantic architecture:

- tenant-specific semantic settings
- embedding outbox with content-hash dedupe
- privacy-safe embedding subjects
- autonomous semantic refresh
- separate kNN semantic index design
- protected semantic bootstrap + worker
- tenant-filtered semantic query
- lexical + vector Reciprocal Rank Fusion
- lexical fail-open fallback

Real embeddings and kNN E2E remain blocked until a real OpenSearch + embedding provider configuration is connected.

### H. SEO Decision Intelligence

Implemented:

- configurable multi-signal decision scoring
- next-best-action ranking
- business/revenue-aware weighting
- draft experiment staging
- human-approved optimization-action gates
- idempotent staging
- tenant-safe decision API
- interactive `/seo/decisions` workspace

No automatic website publishing is permitted from recommendations.

### I. SEO Learning Loop

Implemented:

- learning settings
- experiment learning ledger
- baseline vs outcome comparison
- positive/negative/mixed/inconclusive classification
- confidence levels
- automatic finalization
- hourly learning sweep
- learned ranking adjustment with bounded influence

No fabricated historical learning is seeded. The model starts neutral and learns from real completed experiments.

### J. Automatic outcome capture

Implemented:

- experiment maturity detection
- configurable GSC lag
- same-length baseline/final windows
- automatic final measurement
- outcome audit trail
- tenant-specific sweep caps
- hourly outcome-capture job

This closes the observe → measure → learn loop without requiring manual analysis after an approved experiment begins.

### K. Explainability + forecasting

Implemented:

- why-this-ranks explanations
- low/base/high bounded scenarios
- estimated incremental clicks
- estimated leads only where observed click→lead data exists
- revenue upside only where real attributed revenue evidence exists
- confidence/caveat reporting
- forecast learning from real experiment history when sufficient samples exist

The system does not fabricate conversion/revenue rates.

### L. Opportunity Portfolio

Implemented:

- capacity-aware top 3/5/8 SEO priorities
- effort heuristics
- upside/confidence/risk portfolio score
- modeled incremental clicks/leads/revenue where evidence exists
- forecast snapshots at experiment staging
- prediction-vs-actual calibration metrics
- tenant-safe portfolio API

### M. Competitor Intelligence + SEO/AEO/GEO Ranking

Implemented:

- tenant-scoped competitor registry
- cross-surface rank targets for SEO, AEO and GEO
- historical ranking snapshots
- Claude competitor strategist grounded in observed evidence
- recommendation contract containing action, why, competitor advantage, expected signal, confidence, target query and validated target URL
- competitor recommendation → draft SEO experiment bridge
- human approval remains mandatory
- lease-safe ranking worker
- retry/backoff and failure categorization
- provider control plane with per-tenant enablement, surface controls, min interval and hourly/daily budgets
- one-query provider normalization test
- fail-closed provider activation
- PDF / CSV / DOC export with tenant-scoped audit metadata

External live ranking provider credentials are not configured yet, so paid/live SEO/AEO/GEO checks remain disabled.

### N. Competitor Intelligence → OpenSearch / opportunity layer

Latest branch work now includes:

- competitor/rank/analysis intelligence prepared for OpenSearch search mode
- competitor intelligence search mode added to the SEO intelligence experience
- competitive opportunity engine
- competitive opportunities fed into competitor intelligence
- competitive opportunities displayed in the SEO workspace
- competitive opportunities included in ranking-report exports

A rollback-only database self-test verified competitor, rank-target and analysis documents can be built for the correct tenant and cross-tenant building is rejected. Test rows were removed and no synthetic data remained.

---

## 3. Claude / AI state

Server-side Anthropic configuration is present in Vercel for production/preview.

Claude is used for grounded reasoning and recommendations, not as the source of ranking truth. Real ranking evidence should come from GSC and/or the external ranking provider. AI recommendations must not invent ranking positions, traffic, citations, competitor capabilities or URLs.

---

## 4. External provider state

### OpenSearch

Still missing in Vercel:

- `OPENSEARCH_URL`
- OpenSearch auth credentials
- optional index prefix
- dedicated search worker secret

Therefore real external indexing/search E2E is still blocked.

### Semantic embeddings

Provider adapter exists, but a real embedding provider/model/dimension configuration is still required for real vector generation.

### Live rank provider

Still missing:

- `SEO_RANKING_API_URL`
- `SEO_RANKING_API_KEY`

Provider settings are initialized disabled; no paid rank polling is active.

---

## 5. Current branch/build state

Branch HEAD at this checkpoint:

`9e5b60d9d6001982bc57c84c0784d59297ad8ace` — `Export competitive opportunities with ranking reports`

Vercel status on this HEAD is **failure due deployment build-rate limiting** (`retry in 24 hours`), not a confirmed code failure.

An earlier commit in the same branch (`9015fa4...`) did reach the build and exposed a TypeScript issue in `lib/seo/rank-provider-control.ts` where Supabase returned `{}` typing for `current.last_health_status`. Later branch commits may include further work, but the latest HEAD has not received a fresh compile because Vercel rate-limited it. Do not claim the current HEAD is build-verified until a new build succeeds.

---

## 6. Production safety state

- OpenSearch organization indexing: disabled
- Semantic SEO indexing: disabled
- Live ranking providers: disabled
- No fake competitor/ranking data should be seeded
- No automatic website publishing
- Human approval required for high-impact SEO actions
- Search/SEO/competitor operations remain tenant-bound
- Sensitive credentials remain server-side

---

## 7. Directional readiness

Planning estimates only:

- Tracking Contract v1: ~100% READY
- Privacy technical platform: ~93–94%
- SEO Intelligence architecture: ~97%
- Competitor / ranking architecture: ~90%
- OpenSearch foundation: strong, but real provider E2E still incomplete
- Semantic retrieval architecture: strong, real embeddings/kNN still incomplete
- Real historical forecast calibration: early because real completed experiment volume is still low/zero

Do not convert architecture readiness into production-provider readiness.

---

## 8. Immediate next execution order

1. Re-run a fresh Vercel build when rate limit clears; fix any remaining TypeScript/runtime errors before merge.
2. Finish/verify competitor entities in OpenSearch mapping/query/source allowlists and UI on a successful build.
3. Connect an actual OpenSearch provider and run protected health → bootstrap → SEO mapping → controlled tenant pilot → worker → adversarial cross-tenant query.
4. Connect an embedding provider and run semantic bootstrap → vector worker → kNN → hybrid quality calibration.
5. Select/connect a live SEO/AEO/GEO ranking provider; run one-query normalization tests before enabling any recurring checks.
6. Enable controlled rank worker only after provider health, budgets and normalization pass.
7. Accumulate real SEO experiments and calibrate forecast/decision learning from actual outcomes.
8. Continue W8 tenant/security closeout separately; do not treat search tenant filtering as global W8 completion.

---

## 9. Engineering guardrails

- PostgreSQL remains the source of truth; OpenSearch is a derived retrieval layer.
- Client-supplied organization IDs are never authority.
- Cross-tenant checks are mandatory before external indexing/search.
- Arbitrary metadata/proposal payloads are not indexed unless explicitly allowlisted.
- Ranking truth must come from observed evidence, not Claude.
- Customer messaging and website publishing remain human-controlled until explicitly signed off.
- No secrets in logs, UI, exports or checkpoint files.
- Every meaningful phase should update this checkpoint and the GitHub canonical context.
