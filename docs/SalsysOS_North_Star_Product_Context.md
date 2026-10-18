# SalsysOS North Star Product Context

**Status:** Canonical product/context/progress source of truth  
**Last updated:** 2026-10-18  
**Repository:** `yogakulamacademy/salsys-os`

> Read this file first when SalsysOS context is incomplete. Update it after every meaningful checkpoint so product direction, verified progress, blockers, and next actions survive loss of chat/session context. The mutable implementation checkpoint is `docs/SalsysOS_Current_Checkpoint.md`.

---

## 1. North Star

SalsysOS = **Sales + Analysis Operating System**: a vertical **Customer Journey Intelligence + Revenue Intelligence operating system**, not a generic CRM.

Core question:

> **What is this person likely to do next, why, and what should we do right now to increase the probability of conversion?**

First vertical: Yoga / Education / Wellness, with Yogakulam Academy as the real production proving ground. Second planned vertical: Real Estate.

Core loop:

`marketing spend → traffic/source/content → behavior → identity → lead → conversation → intent/objection/product affinity → salesperson activity → follow-up → payment/enrollment → revenue → attribution → learning → next-best action`

Locked AI direction:

`Assist → Decide → Act with controls`

Human approval must remain available for sensitive/high-impact customer, financial, automation and website actions.

Principles: PostgreSQL/source systems remain truth; observed facts remain separate from inferred/modelled facts; deterministic identity first; revenue-linked analytics; data quality before intelligence; hard tenancy; privacy-by-design; auditable AI workflows; provider-neutral internal contracts where practical; no secret leakage; no fabricated metrics.

---

## 2. Workspace program — fixed meanings

| Workspace | Weight | Status |
|---|---:|---|
| W1 Architecture / Audit | 10% | COMPLETE |
| W2 RBAC | 15% | COMPLETE |
| W3 Shell / Header / Workspace Navigation | 15% | COMPLETE |
| W4 Employee Accounts | 15% | COMPLETE |
| W5 Sales Workspace | 12% | ~98–99% |
| W6 Marketing Workspace | 12% | Materially advanced; SEO/Organic Intelligence is now the strongest sub-area |
| W7 Finance + Reports | 11% | Pending formal build/closeout |
| W8 Admin + Security / QA | 10% | Active; strict tenant cutover/sign-off still separate |

Do not repurpose W1–W8.

W6 includes Campaigns, Paid Media, Google Ads, Meta Ads, GA4, Search Console, SEO, Tracking, attribution, Website Intelligence, Opportunity Engine, Keyword/SERP, Content Intelligence, Revenue-Aware Organic, AEO, GEO/AI Visibility, Experimentation/Learning, Human-Approved Optimization, OpenSearch retrieval and competitor/rank intelligence.

---

## 3. Tenancy / W8 security contract

Fixed phases: W8A tenant identity/audit; W8B tenant login; W8C auth→tenant binding; W8D remove org switching; W8E trusted tenant resolver; W8F DB/RLS/RPC isolation; W8G integrations/webhooks; W8H team admin isolation; W8I adversarial regression; W8J controlled second-tenant staging; W8K production cutover/sign-off.

Verified direction/state:

- one organization = one tenant = isolated data boundary
- server-derived tenant is authority; browser/client org IDs are never sufficient authority
- normal org switching is removed by default
- exactly one active membership per normal user is the target contract
- CRM settings, Team & Access, Sales and integration paths have been substantially tenant-hardened
- OAuth/integration service mutations revalidate tenant before mutation
- cross-tenant adversarial checks have blocked foreign CRM/settings/follow-up/contact/stage/owner/integration paths
- OpenSearch/SEO/competitor queries also enforce server tenant filters and post-validation

Strict global tenant-session enforcement remains a separate W8 cutover/sign-off item. Do not treat search-layer tenant filtering as W8 completion.

Remaining W8 work includes final authenticated SECURITY DEFINER intent review, residual service-client/runtime validation, remaining adversarial matrix, controlled second-tenant validation, legacy multi-org admin cleanup and strict cutover/sign-off.

---

## 4. Smart Triggers / Automation

Direction: WATI/AiSensy-style conversation automation adapted to SalsysOS with visual flows, wait states, branching, channel policies, AI decisions, human approval/handoff, dedupe, suppression, stop-on-reply and audit.

Implemented foundation includes tenant-scoped workflows, triggers, conditions, actions, events, runs, enrollments, suppressions, flow nodes/edges, wait states, scheduled jobs, variables and immutable published flow versions.

Controlled reply and no-reply runtime paths were validated without customer sends. Autonomous customer messaging remains gated until provider/channel-policy, suppression, audit, rate-limit and human-review controls are fully signed off.

---

## 5. Tracking Contract v1

**Status: READY / frozen.**

Production-verified foundations:

- dynamic `tracking_sources`
- event families/contracts
- immutable raw events
- generalized collect/consent/identify
- source provisioning
- rate limiting
- sanitization/redaction
- lead processing/dedupe
- retry/recovery crons
- attribution state machine
- browser/privacy gating
- release gate verifying tracked organizations ready for external ingestion and OpenSearch indexing

Tracking remains upstream evidence; external clients do not write directly to CRM lead truth.

---

## 6. Privacy & Compliance technical platform

Posture: privacy-by-design technical controls supporting applicable frameworks; do not claim universal legal compliance.

Implemented foundations include:

- retention executor + scheduled run
- verified access/export
- autonomous subject resolution
- erasure planner + scheduled run
- privacy-safe search telemetry

The unused draft erasure orchestrator migration remains intentionally unapplied and must not be run.

Directional privacy technical readiness: ~93–94% for the currently defined technical platform, not legal/compliance sign-off.

---

## 7. OpenSearch platform foundation

Implemented:

- reference-only search outbox
- per-organization settings
- revision/lease-safe claim + finalize
- JIT document rebuilding from PostgreSQL truth
- protected indexing worker
- strict server tenant resolver
- tenant-filtered query service
- tenant-bound global search API
- controlled pilot guard/cap
- health/bootstrap endpoints
- global command palette
- privacy-safe search observability
- admin search-health workspace

Production safety posture:

- external OpenSearch credentials are still not configured
- organization indexing remains disabled
- therefore no production external search indexing is active

PostgreSQL remains the source of truth; OpenSearch is a derived retrieval layer.

---

## 8. SEO Intelligence — current architecture

SEO OpenSearch entity types include:

- `seo_page`
- `seo_topic`
- `seo_entity`
- `seo_experiment`
- `seo_action`

Implemented SEO intelligence stack:

1. **Lexical retrieval** — JIT SEO documents, explicit `dynamic:false` mappings, refresh jobs, authenticated tenant-safe API and `/seo/intelligence` workspace.
2. **Semantic/hybrid foundation** — embedding outbox, content-hash dedupe, privacy-safe embedding subjects, separate kNN semantic index design, protected semantic worker/bootstrap, tenant-filtered kNN and Reciprocal Rank Fusion with lexical fallback.
3. **Decision Intelligence** — configurable multi-signal next-best-action scoring using demand, opportunity, business/revenue, technical, content, AEO/GEO and related evidence.
4. **Human-gated execution** — recommendations can stage draft experiments/actions, but automatic website publishing remains disabled.
5. **Learning Loop** — baseline/outcome comparison, positive/negative/mixed/inconclusive classification, confidence, hourly learning sweep and bounded learned ranking adjustments.
6. **Automatic outcome capture** — maturity detection, GSC lag, same-length final windows, audit trail and autonomous final measurement/finalization.
7. **Explainability + forecasting** — reason drivers, bounded low/base/high scenarios, extra clicks/leads and revenue only when real evidence exists; no fabricated conversion/revenue rates.
8. **Opportunity Portfolio** — capacity-aware top 3/5/8 planning with effort, risk, confidence and modeled upside.
9. **Forecast calibration** — forecast snapshots at experiment staging so predicted vs actual outcomes can be measured later.

Directional SEO Intelligence architecture readiness: ~97%. This is architecture readiness, not real-provider/semantic-production readiness.

---

## 9. Competitor Intelligence + SEO/AEO/GEO ranking

Implemented foundations:

- tenant-scoped competitor registry
- SEO/AEO/GEO rank targets
- historical rank snapshots
- Claude competitor strategist grounded in observed evidence
- explicit recommendation contract: surface, priority, action, why, competitor advantage, expected signal, confidence, evidence, target query and validated tenant-owned target URL
- recommendation → draft experiment bridge
- human approval guardrails
- lease-safe rank worker
- retry/backoff + failure categorization
- provider control plane with per-tenant surface enablement, min interval and hourly/daily budgets
- one-query normalization health test
- fail-closed activation
- PDF / CSV / DOC exports with tenant-scoped audit metadata

Latest branch work also adds:

- competitor/rank/analysis intelligence into the OpenSearch-oriented search layer
- competitor intelligence search mode
- competitive opportunity engine
- competitive opportunities surfaced in the SEO workspace
- competitive opportunities included in ranking-report exports

Rollback-only database testing verified competitor, rank-target and analysis documents build for the correct tenant and are rejected cross-tenant; synthetic validation data was removed.

Directional competitor/ranking architecture readiness: ~90%.

---

## 10. Claude / AI contract

Anthropic server-side configuration is present for production/preview.

Claude is used for reasoning, classification and grounded recommendations. It is **not** the source of ranking truth. Ranking/citation evidence must come from GSC and/or an actual external rank/visibility provider.

Claude must not invent ranking positions, traffic, AI citations, URLs, revenue, competitor capabilities or evidence.

---

## 11. External provider blockers

### OpenSearch

Still missing real provider configuration in Vercel, including endpoint/auth. Real indexing/search E2E remains blocked.

### Semantic embeddings

The adapter exists, but a real embedding provider/model/dimension configuration is still required. Real vector generation and kNN quality calibration remain pending.

### Live ranking provider

Still missing:

- `SEO_RANKING_API_URL`
- `SEO_RANKING_API_KEY`

Provider settings are initialized disabled; no recurring paid/live SEO/AEO/GEO polling is active.

---

## 12. Current branch / deployment state

Active SEO/competitor branch:

`feature/seo-competitor-ranking-v1`

Checkpoint HEAD before context-document commits:

`9e5b60d9d6001982bc57c84c0784d59297ad8ace` — `Export competitive opportunities with ranking reports`

Vercel status on that HEAD is **failure because the deployment was rate-limited** (`retry in 24 hours`), not a successful compile validation.

An earlier build on commit `9015fa4...` reached type checking and exposed a TypeScript issue in `lib/seo/rank-provider-control.ts` around `current.last_health_status` being inferred from `{}`. A fresh build is required once the Vercel quota clears, and any remaining type/runtime errors must be fixed before merge.

---

## 13. Directional progress snapshot — 2026-10-18

Planning estimates only:

| Meter | Current interpretation |
|---|---:|
| Tracking Contract v1 | ~100% READY |
| Privacy technical platform | ~93–94% |
| W5 Sales Workspace | ~98–99% |
| W8 Security / QA | highly advanced; strict cutover still pending |
| SEO Intelligence architecture | ~97% |
| Competitor / ranking architecture | ~90% |
| OpenSearch provider E2E | pending external provider |
| Semantic embeddings / kNN E2E | pending real embedding + OpenSearch provider |
| Forecast calibration from real experiment history | early |

Do not convert architecture percentages into production-provider readiness or legal/compliance claims.

---

## 14. Current milestone

### Milestone M-2026-10-18 — Organic Growth Decision Operating System

Materially implemented:

`GSC/GA4/CRM/revenue/AEO/GEO evidence → lexical/hybrid retrieval → decision ranking → explainability/forecast → opportunity portfolio → human-gated experiment → automatic observation/outcome capture → learning → improved future ranking`

Competitor extension:

`competitor registry + SEO/AEO/GEO rank evidence → Claude grounded gap analysis → competitive opportunity → draft experiment → human approval → measurement → learning`

Key safety principle: **recommendations can prepare work, but publishing/execution remains human-controlled.**

### Prior milestone highlights

- W8 organization read/write RLS closure and tenant hardening
- global password recovery + post-login shell fixes
- Instagram outbound messaging + shared AI Reply Co-Pilot
- tenant-safe Organization Knowledge V1
- Smart Triggers + conversation flow runtime foundation
- Tracking Contract v1 release gate
- privacy retention/access/subject-resolution/erasure planner
- OpenSearch foundation and pilot guard
- SEO semantic/hybrid, decision, learning, forecasting and portfolio layers

---

## 15. Immediate next execution order

1. Wait for Vercel rate limit to clear and run a fresh branch build; fix any remaining TypeScript/runtime errors before merge.
2. Verify competitor OpenSearch mappings/query/source allowlists and UI in a successful build.
3. Connect a real OpenSearch provider: protected health → core bootstrap → SEO/competitor mapping → controlled single-tenant pilot → worker → cross-tenant adversarial search.
4. Connect a real embedding provider and validate semantic bootstrap → vector worker → kNN → hybrid ranking quality.
5. Select/connect a real SEO/AEO/GEO ranking provider; run one-query normalization tests before enabling recurring checks.
6. Enable bounded rank polling only after provider health, normalization and cost controls pass.
7. Accumulate real experiments and calibrate forecasts/action learning against observed outcomes.
8. Continue W8 tenant/security closeout independently.

---

## 16. Engineering protocol

Verify before modifying; preserve unrelated work; validate build/typecheck before claiming runtime readiness; separate external blockers from code failures; never expose secrets; do not invent tests or evidence; never enable strict tenant enforcement, autonomous customer sends, external indexing, paid rank polling or website publishing without the corresponding control gate; prefer rollback-only production adversarial tests where possible; client-supplied tenant IDs are never authority.

Update both `docs/SalsysOS_Current_Checkpoint.md` and this document after every meaningful checkpoint.

---

## 17. Related context

- `docs/SalsysOS_Current_Checkpoint.md`
- `docs/checkpoints/M-2026-10-18-SEO-OpenSearch-Competitor-Intelligence.md`
- `docs/SalsysOS_Behavioral_Intelligence_Privacy_Control_Plane_Roadmap.md`
