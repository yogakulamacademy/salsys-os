# SalsysOS — Current Checkpoint

**Updated:** 2026-10-18
**Canonical repository:** `yogakulamacademy/salsys-os`
**Production Supabase project:** `doaozrkrtgeslddwhclj`
**Production domain:** `https://salsysos.com`
**Active OpenSearch integration branch:** `feature/opensearch-aws-sigv4-v1`
**Branch HEAD before this checkpoint update:** `5ccedaaa57b2b22acf584e6c540ddcc9e4ababf3` — `Sign SEO OpenSearch requests through shared adapter`

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

Implemented in SalsysOS:

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

**Provider status has advanced from “not connected” to “provider provisioned/configured; live E2E pending.”**

A real Amazon OpenSearch Serverless collection now exists:

- collection: `salsys-search`
- region: `ap-southeast-2`
- type: `SEARCH`
- status observed during setup: `ACTIVE`
- endpoint: `https://ka4nj04bskgw51vo0w2h.ap-southeast-2.aoss.amazonaws.com`
- ARN: `arn:aws:aoss:ap-southeast-2:354245663449:collection/ka4nj04bskgw51vo0w2h`
- encryption: AWS-owned key
- deletion protection: enabled
- network endpoint: public, but authenticated access is required

Production-wide organization indexing remains disabled. This is still a controlled preview-only pilot until health/bootstrap/indexing/search and cross-tenant tests pass.

### F. AWS SigV4 OpenSearch adapter

A dedicated integration branch now carries AWS OpenSearch Serverless signing support while preserving the existing provider modes.

Supported request authentication paths:

- existing Basic authentication
- existing Bearer authentication
- AWS SigV4 signing for OpenSearch Serverless (`aoss`)

The shared signed-request path is used for the OpenSearch operations needed by the pilot, including:

- health request
- index bootstrap
- bulk indexing worker
- normal tenant search
- SEO lexical search
- competitor lexical search
- SEO mapping/bootstrap requests
- tenant result verification path

A dedicated AWS principal was prepared for the Vercel pilot rather than reusing broad account credentials. Preferred Vercel↔AWS OIDC could not be completed in this AWS account because organization-level policy blocked the required IAM/OIDC operation, so the controlled preview currently uses dedicated branch-scoped AWS credentials instead. No credential values belong in this checkpoint.

### G. SEO → OpenSearch lexical intelligence

SEO search entities include:

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
- explicit `dynamic:false` SEO mappings
- authenticated `/api/seo/search/v1`
- interactive `/seo/intelligence` workspace

### H. Semantic / hybrid SEO retrieval

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

A real OpenSearch provider now exists, but real embeddings/vector generation still require a separate embedding provider/model/dimension configuration. Semantic/kNN E2E is therefore still pending after lexical OpenSearch E2E.

### I. SEO Decision Intelligence

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

### J. SEO Learning Loop

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

### K. Automatic outcome capture

Implemented:

- experiment maturity detection
- configurable GSC lag
- same-length baseline/final windows
- automatic final measurement
- outcome audit trail
- tenant-specific sweep caps
- hourly outcome-capture job

This closes the observe → measure → learn loop without requiring manual analysis after an approved experiment begins.

### L. Explainability + forecasting

Implemented:

- why-this-ranks explanations
- low/base/high bounded scenarios
- estimated incremental clicks
- estimated leads only where observed click→lead data exists
- revenue upside only where real attributed revenue evidence exists
- confidence/caveat reporting
- forecast learning from real experiment history when sufficient samples exist

The system does not fabricate conversion/revenue rates.

### M. Opportunity Portfolio

Implemented:

- capacity-aware top 3/5/8 SEO priorities
- effort heuristics
- upside/confidence/risk portfolio score
- modeled incremental clicks/leads/revenue where evidence exists
- forecast snapshots at experiment staging
- prediction-vs-actual calibration metrics
- tenant-safe portfolio API

### N. Competitor Intelligence + SEO/AEO/GEO Ranking

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

### O. Competitor Intelligence → OpenSearch / opportunity layer

Implemented branch work includes:

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

**Current state: provisioned/configured for a controlled preview pilot; real application E2E not yet verified.**

AWS side:

- Amazon OpenSearch Serverless collection `salsys-search` created and observed `ACTIVE`
- collection endpoint and ARN recorded above
- authenticated access policy prepared
- dedicated Vercel pilot AWS principal prepared
- deletion protection enabled

Vercel side on `feature/opensearch-aws-sigv4-v1` / Preview only:

- `OPENSEARCH_URL` configured
- `OPENSEARCH_INDEX_PREFIX` configured
- `OPENSEARCH_AWS_REGION` configured
- `OPENSEARCH_AWS_SERVICE` configured
- `AWS_ACCESS_KEY_ID` configured as Sensitive
- `AWS_SECRET_ACCESS_KEY` configured as Sensitive
- `AWS_REGION=ap-southeast-2`
- `AWS_DEFAULT_REGION=ap-southeast-2`

The credential values are intentionally not recorded here.

Production environment is untouched by this pilot configuration.

### Semantic embeddings

Provider adapter exists, but a real embedding provider/model/dimension configuration is still required for real vector generation.

### Live rank provider

Still missing:

- `SEO_RANKING_API_URL`
- `SEO_RANKING_API_KEY`

Provider settings remain initialized disabled; no paid rank polling is active.

---

## 5. Current branch/build state

Active integration branch before this checkpoint update:

`5ccedaaa57b2b22acf584e6c540ddcc9e4ababf3` — `Sign SEO OpenSearch requests through shared adapter`

A prior SigV4 branch commit received a successful Vercel build, but the latest branch state has **not** received a fresh preview deployment/compile after the final configuration changes because the Vercel Hobby project hit its daily API deployment limit:

`Resource is limited — try again in 24 hours (more than 100, code: api-deployments-free-per-day)`

This is a platform quota blocker, not evidence of an OpenSearch or application code failure. Do not claim the latest branch is fully build/runtime verified until a fresh preview deployment succeeds after the quota resets.

The earlier SEO competitor checkpoint build blocker is therefore superseded: the project has now reached the provider-connection phase, but final AWS SigV4 runtime proof is waiting on a new preview deployment.

---

## 6. Production safety state

- OpenSearch production-wide organization indexing: disabled
- OpenSearch AWS pilot configuration: Preview + `feature/opensearch-aws-sigv4-v1` only
- Semantic SEO indexing: disabled
- Live ranking providers: disabled
- No fake competitor/ranking data should be seeded
- No automatic website publishing
- Human approval required for high-impact SEO actions
- Search/SEO/competitor operations remain tenant-bound
- Sensitive credentials remain server-side and are not written to docs/logs/UI/exports
- Do not promote the OpenSearch pilot to Production until health/bootstrap/indexing/search and cross-tenant validation pass

---

## 7. Directional readiness

Planning estimates only:

- Tracking Contract v1: ~100% READY
- Privacy technical platform: ~93–94%
- SEO Intelligence architecture: ~97%
- Competitor / ranking architecture: ~90%
- OpenSearch foundation: strong
- OpenSearch provider provisioning/configuration: completed for controlled preview pilot
- OpenSearch real application E2E: pending fresh preview deployment and runtime tests
- Semantic retrieval architecture: strong, real embeddings/kNN still incomplete
- Real historical forecast calibration: early because real completed experiment volume is still low/zero

Do not convert architecture readiness into production-provider readiness.

---

## 8. OpenSearch provider checklist

### Completed

- [x] Verify competitor OpenSearch entities/mappings/query/source allowlists/UI exist on the current code line
- [x] Create real Amazon OpenSearch Serverless provider resource
- [x] Create `salsys-search` SEARCH collection in `ap-southeast-2`
- [x] Confirm collection reaches `ACTIVE`
- [x] Keep AWS-owned encryption and deletion protection enabled
- [x] Prepare authenticated data access for the controlled pilot
- [x] Add AWS SigV4 support while preserving Basic/Bearer modes
- [x] Route core OpenSearch/SEO lexical requests through the shared signed-request adapter
- [x] Add branch-scoped Preview `OPENSEARCH_URL`
- [x] Add branch-scoped Preview index prefix / AWS service / AWS region configuration
- [x] Add dedicated branch-scoped Sensitive AWS access key variables
- [x] Add standard `AWS_REGION` and `AWS_DEFAULT_REGION` to resolve AWS SDK/Vercel region detection
- [x] Keep Production environment untouched
- [x] Keep production-wide organization indexing disabled

### Waiting on Vercel quota reset / runtime proof

- [ ] Fresh Preview deployment of `feature/opensearch-aws-sigv4-v1`
- [ ] Verify SigV4 OpenSearch health request succeeds from Vercel
- [ ] Bootstrap the controlled OpenSearch index
- [ ] Apply SEO + competitor mappings successfully
- [ ] Enable exactly one controlled Yogakulam tenant in the OpenSearch pilot guard
- [ ] Process a bounded indexing outbox batch
- [ ] Verify indexed documents are searchable for the authorized tenant
- [ ] Verify SEO lexical search against real indexed data
- [ ] Verify competitor lexical search against real indexed data
- [ ] Run adversarial cross-tenant query
- [ ] Confirm foreign-tenant results = `0`
- [ ] Review logs/telemetry for secrets, tenant leakage and retry failures
- [ ] Only after all checks pass, decide whether the provider can be promoted beyond the preview pilot

### Subsequent provider work

- [ ] Connect real embedding provider/model/dimension
- [ ] Run semantic bootstrap → vector worker → kNN → hybrid/RRF quality calibration
- [ ] Connect live SEO/AEO/GEO ranking provider
- [ ] Run one-query provider normalization before recurring checks
- [ ] Enable bounded recurring rank worker only after health/budget/normalization checks pass

---

## 9. Immediate next execution order

1. Wait for the Vercel Hobby API deployment quota to reset; do not redeploy Production.
2. Fresh Preview deployment of `feature/opensearch-aws-sigv4-v1`.
3. Call protected OpenSearch health and prove AWS SigV4 authentication from the Vercel runtime.
4. Bootstrap the base index and apply SEO + competitor mappings.
5. Enable only one controlled Yogakulam tenant, run a bounded outbox worker batch and verify lexical search.
6. Run adversarial cross-tenant search and require foreign results to equal zero before any broader enablement.
7. Connect an embedding provider and run semantic bootstrap → vector worker → kNN → hybrid quality calibration.
8. Select/connect a live SEO/AEO/GEO ranking provider; run one-query normalization tests before enabling recurring checks.
9. Enable controlled rank worker only after provider health, budgets and normalization pass.
10. Accumulate real SEO experiments and calibrate forecast/decision learning from actual outcomes.
11. Continue W8 tenant/security closeout separately; do not treat search tenant filtering as global W8 completion.

---

## 10. Engineering guardrails

- PostgreSQL remains the source of truth; OpenSearch is a derived retrieval layer.
- Client-supplied organization IDs are never authority.
- Cross-tenant checks are mandatory before external indexing/search.
- Arbitrary metadata/proposal payloads are not indexed unless explicitly allowlisted.
- Ranking truth must come from observed evidence, not Claude.
- Customer messaging and website publishing remain human-controlled until explicitly signed off.
- No secrets in logs, UI, exports or checkpoint files.
- Do not copy the branch-scoped AWS credentials into Production until the controlled preview E2E and tenant-isolation checks pass.
- Every meaningful phase should update this checkpoint and the GitHub canonical context.
