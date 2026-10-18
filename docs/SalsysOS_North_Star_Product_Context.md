# SalsysOS North Star Product Context

**Status:** Canonical product/context/progress source of truth  
**Last updated:** 2026-10-18  
**Repository:** `yogakulamacademy/salsys-os`

> Read this file first when SalsysOS context is incomplete. Update it after every meaningful checkpoint so product direction, verified progress, blockers and next actions survive loss of chat/session context. The mutable implementation checkpoint is `docs/SalsysOS_Current_Checkpoint.md`.

---

## 1. North Star

SalsysOS = **Sales + Analysis Operating System**: a vertical **Customer Journey Intelligence + Revenue Intelligence operating system**, not a generic CRM.

Core question:

> **What is this person likely to do next, why, and what should we do right now to increase the probability of conversion?**

First vertical: Yoga / Education / Wellness, with Yogakulam Academy as the real production proving ground.  
Second planned vertical: Real Estate.

Core business loop:

`marketing spend → traffic/source/content → behavior → identity → lead → conversation → intent/objection/product affinity → salesperson activity → follow-up → payment/enrollment → revenue → attribution → learning → next-best action`

Locked AI direction:

`Assist → Decide → Act with controls`

The system should evolve from static dashboards into an adaptive operating system that continuously answers:

> **What changed, what matters now, why does it matter, and what should the team do next?**

Human approval must remain available for sensitive/high-impact customer, financial, automation and website actions.

Principles:

- PostgreSQL/source systems remain truth
- observed facts stay separate from inferred/modelled facts
- deterministic identity first
- revenue-linked analytics
- data quality before intelligence
- hard tenancy
- privacy-by-design
- auditable AI workflows
- provider-neutral internal contracts where practical
- no secret leakage
- no fabricated metrics/evidence
- AI may explain evidence but cannot invent evidence

---

## 2. Workspace program — fixed meanings

| Workspace | Weight | Current status |
|---|---:|---|
| W1 Architecture / Audit | 10% | COMPLETE |
| W2 RBAC | 15% | COMPLETE |
| W3 Shell / Header / Workspace Navigation | 15% | COMPLETE |
| W4 Employee Accounts | 15% | COMPLETE |
| W5 Sales Workspace | 12% | ~97–99% |
| W6 Marketing Workspace | 12% | Materially advanced; SEO/Organic Intelligence strongest sub-area |
| W7 Finance + Reports | 11% | Partial; formal closeout still pending |
| W8 Admin + Security / QA | 10% | Active; strict tenant cutover/sign-off still separate |

Do not repurpose W1–W8.

---

## 3. Current whole-system interpretation

Planning estimate only:

- overall defined SalsysOS scope: **~82–85% complete**
- foundation/architecture: ~98%
- CRM/sales: ~97%
- conversations/admissions: ~94%
- tracking: ~100%
- attribution/marketing intelligence: ~91%
- SEO Intelligence: ~93–97% architecture
- OpenSearch lexical platform: ~94%, with real controlled E2E verified
- semantic/hybrid retrieval: ~65%
- privacy technical platform: ~94%
- W8 tenant/security: ~92%
- Smart Triggers: ~80%
- finance/reports: ~63–73% depending sub-area
- System Intelligence Core: ~45% of the final intelligent-system vision
- Claude unified reasoning layer: ~50%
- controlled autonomous actions: ~30%

Remaining work is increasingly about **orchestration, intelligence, learning, security sign-off and production control**, not conventional CRUD screens.

---

## 4. Tenancy / W8 security contract

Fixed phases: W8A tenant identity/audit; W8B tenant login; W8C auth→tenant binding; W8D remove org switching; W8E trusted tenant resolver; W8F DB/RLS/RPC isolation; W8G integrations/webhooks; W8H team admin isolation; W8I adversarial regression; W8J controlled second-tenant staging; W8K production cutover/sign-off.

Verified direction/state:

- one organization = one tenant = isolated data boundary
- server-derived tenant is authority
- browser/client organization IDs are never sufficient authority
- normal org switching is removed by default
- exactly one active membership per normal user is the target contract
- CRM/settings/Team & Access/Sales/integration paths are substantially tenant-hardened
- OAuth/integration service mutations revalidate tenant before mutation
- cross-tenant adversarial checks have blocked foreign CRM/settings/follow-up/contact/stage/owner/integration paths
- OpenSearch/SEO queries enforce tenant filters and post-validation
- real OpenSearch cross-tenant verification returned zero foreign results
- Claude SEO recommendation→experiment staging rejected foreign-tenant access

Strict global tenant-session enforcement remains a separate W8 cutover/sign-off item.

Remaining W8 work:

- final controlled second-tenant matrix
- remaining `SECURITY DEFINER` intent review
- residual service-client/runtime validation
- legacy multi-org admin cleanup
- strict tenant-session cutover
- formal W8 sign-off

---

## 5. Sales / Admissions / Conversations

Materially implemented:

- lead management
- stage/intent/ownership
- employee-scoped access
- secure contacts
- pipeline
- tasks/follow-ups
- admissions dashboard
- needs-reply/unread attention state
- first-touch queue
- high-intent/payment-pending work
- source/campaign attribution fields
- enrollment/payment fields
- WhatsApp integration foundation
- Instagram messaging foundation
- shared AI Reply Co-Pilot
- organization knowledge grounding
- human approval before send

The next growth in this area should come from intelligence, not more static UI: objection detection, lead acceleration/decay, predicted next action, team capacity and why-this-lead-now explanations.

Autonomous customer sends remain gated.

---

## 6. Tracking Contract v1

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
- retry/recovery jobs
- attribution state machine
- browser/privacy gating
- release gate

Tracking remains upstream evidence; external clients do not write CRM lead truth directly.

---

## 7. Privacy & Compliance technical platform

Implemented foundations:

- retention executor + schedule
- verified access/export
- subject resolution
- erasure planner + schedule
- privacy-safe search telemetry

The unused draft erasure orchestrator migration remains intentionally unapplied.

Directional technical readiness: ~94%, not universal legal-compliance sign-off.

---

## 8. OpenSearch platform — controlled lexical E2E verified

Implemented platform foundation:

- reference-only search outbox
- per-organization settings
- revision/lease-safe claim/finalize
- JIT document rebuilding from PostgreSQL truth
- protected indexing worker
- strict tenant resolver
- tenant-filtered query service
- tenant-bound global search API
- controlled pilot guard/cap
- health/bootstrap endpoints
- global command palette
- privacy-safe observability
- admin search-health workspace
- AWS SigV4 shared adapter while preserving Basic/Bearer modes

Real AWS provider:

- Amazon OpenSearch Serverless collection `salsys-search`
- region `ap-southeast-2`
- authenticated access
- AWS-owned encryption
- deletion protection

Controlled Yogakulam verification completed:

- bounded lead indexing batch: 25 claimed / 25 succeeded / 0 failed
- real authorized Yogakulam retrieval returned matches
- foreign tenant retrieval returned `0`
- SEO mappings applied
- bounded SEO indexing succeeded
- real SEO lexical retrieval returned results
- foreign tenant SEO retrieval returned `0`
- indexing switched back OFF after the pilot

Production-wide external indexing remains intentionally OFF pending rollout decision/hardening.

PostgreSQL remains source of truth; OpenSearch remains derived retrieval.

---

## 9. SEO Intelligence

Materially implemented stack:

1. **Lexical retrieval** — tenant-safe SEO OpenSearch documents, mappings, refresh and `/seo/intelligence`.
2. **Decision Intelligence** — configurable multi-signal next-best-action scoring.
3. **Human-gated execution** — recommendation → draft experiment/action; no auto website publishing.
4. **Learning Loop** — baseline/outcome comparison and bounded learned ranking adjustments.
5. **Automatic outcome capture** — maturity detection, GSC lag and autonomous final measurement.
6. **Explainability + forecasting** — bounded scenarios, clicks/leads/revenue only when evidence exists.
7. **Opportunity Portfolio** — capacity-aware top priorities with effort/upside/confidence/risk.
8. **Forecast calibration** — prediction snapshots at experiment staging.
9. **Claude SEO Intelligence** — grounded first-party/GSC reasoning with explicit no-fabrication rules.
10. **Claude recommendation → draft experiment** — real E2E verified, idempotent, tenant-safe and human-controlled.

Recent staging verification proved:

- real draft creation
- repeat call returned same experiment
- draft remained unapproved/unstarted
- correct provenance and page binding
- recommendation linkage
- foreign-tenant rejection
- no publishing/execution
- synthetic verification data removed afterward

---

## 10. Competitor Intelligence + SEO/AEO/GEO ranking

Architecture implemented:

- competitor registry
- SEO/AEO/GEO rank targets
- snapshot schema
- grounded Claude competitor strategist
- explicit recommendation contract
- recommendation → draft experiment bridge
- human approval
- lease-safe rank worker
- retry/backoff/failure categorization
- provider controls and budgets
- one-query normalization health path
- reporting/export
- competitor/rank/analysis OpenSearch model
- competitive opportunity engine

Live ranking evidence is intentionally deferred.

A DataForSEO integration branch was started, but the product decision is to keep the live ranking provider for later while Claude works only from already observed first-party/GSC evidence.

Do not fabricate ranking positions, SERP features or AI citations.

---

## 11. Semantic / hybrid retrieval

Provider-independent architecture exists for:

- embedding outbox
- content-hash dedupe
- privacy-safe embedding subjects
- semantic settings
- kNN index design
- semantic bootstrap/worker
- tenant-filtered semantic query
- lexical + vector RRF
- lexical fail-open fallback

Still required:

- embedding provider/model/dimension
- remaining signed semantic request path where needed
- real vector bootstrap
- embedding generation
- kNN E2E
- hybrid relevance calibration
- cost controls

---

## 12. Smart Triggers / Automation

Implemented foundation:

- tenant-scoped workflows/triggers/conditions/actions/events/runs
- action runs/enrollments/suppressions
- flow nodes/edges/waits
- scheduled jobs/variables
- immutable published versions
- reply/no-reply runtime paths
- lease-safe scheduler foundation
- retry/backoff/terminal failure handling
- protected scheduler route

Remaining:

- final scheduler secret/config proof
- controlled production scheduler activation
- real-channel send pilot
- suppression/stop-on-reply in real provider conditions
- rate/send caps
- escalation/handoff
- provider failure recovery
- workflow analytics/observability

Autonomous messaging remains OFF until these controls pass.

---

## 13. System Intelligence Core — new operating-system layer

A new shared intelligence contract now exists on:

`feature/system-intelligence-core-v1`

Core loop:

`live tenant evidence → deterministic signals → priority score → ranked operating brief → recommended next move → human action`

Implemented v1 evidence categories:

- reply pressure
- response-time pressure
- first-touch backlog
- due follow-ups
- high-intent pipeline
- payment-pending pipeline
- outstanding revenue
- batch/capacity pressure
- acquisition quality
- opportunity-value data quality

Each signal includes a stable ID, category, severity, 0–100 score, explanation, recommended next move, key metric, deep link and evidence.

New surfaces:

- `lib/intelligence/system-intelligence.ts`
- `components/system-intelligence-brief.tsx`
- `/intelligence`
- `GET /api/intelligence/v1`

The API derives tenant context server-side and accepts no client organization ID.

Real Yogakulam snapshot used during verification contained changing business evidence including 25 reply-needed conversations, 25 conversations over one hour, 3 high-intent leads, 1 first-touch-due lead and 26 unvalued open leads.

Verified Vercel preview:

- deployment `dpl_GRGpQz5jYTgjDaT4ZoLKhN5kWwbn`
- commit `f31dce4107de6ef02d4cab09c9634b4c5ecbcdc7`
- Next.js 15.5.26
- compiled successfully in 21.6s
- static generation 38/38
- deployment READY
- unauthenticated `/intelligence` correctly redirected to login

This is the first cross-module operating-intelligence layer, not the final intelligence system.

---

## 14. Intelligence roadmap from here

### v2 — correlation / freshness / role awareness

- correlate overlapping signals
- freshness and signal decay
- trend/velocity/acceleration
- baseline comparison
- owner/manager/admissions/marketing priority views

### v3 — behavioral / cross-system intelligence

- reactivation
- page revisits/product affinity
- objection/sentiment changes
- movement/drop-off risk
- team capacity/ownership pressure
- SEO + sales + marketing + system-health signals in one brain

### v4 — Claude unified synthesis

Claude receives bounded verified signals and produces:

- morning brief
- live operating brief
- owner brief
- admissions brief
- marketing brief
- risk/opportunity summary
- why-now explanation
- recommended sequence of work

Claude may synthesize evidence but cannot create the underlying facts.

### v5 — learning + controlled action

`recommendation → human action → outcome → measurement → calibration → better future ranking`

Only low-risk actions should move toward controlled automation, with approval, budgets, send caps, audit, dry-run and rollback controls.

---

## 15. Finance / Reports

Existing foundations include pipeline/weighted/collected/outstanding revenue views and revenue-aware attribution/forecast logic.

Formal W7 remains incomplete. Major remaining work:

- finance workspace
- payment transaction intelligence
- reconciliation
- course/batch revenue
- source/campaign ROI
- employee revenue contribution
- refund/credit handling
- standardized reports/exports
- permissions

---

## 16. Current major remaining phases

1. **System Intelligence Core v2** — correlation, freshness, trends, roles.
2. **Claude unified reasoning layer** — bounded cross-system operating briefs.
3. **W8 final security sign-off** — second tenant, remaining RPC/service validation and cutover.
4. **Smart Triggers production pilot** — scheduler/channel policy/suppression/recovery.
5. **Semantic/hybrid search** — embeddings → vector → kNN → RRF calibration.
6. **Finance + Reports / W7** — formal revenue-operations closeout.
7. **Cross-system learning** — extend SEO-style learning to sales/marketing/messaging/automation.
8. **Controlled action layer** — gradual low-risk execution under explicit controls.
9. **Live ranking provider later** — DataForSEO or alternative only when competitor evidence becomes priority.

---

## 17. Production safety posture

- production-wide OpenSearch indexing OFF after controlled pilot
- semantic/vector indexing OFF
- live rank provider OFF
- DataForSEO deferred
- autonomous messaging OFF
- automatic website publishing OFF
- sensitive actions human-controlled
- no fake competitor/ranking data
- credentials server-side only
- PostgreSQL remains truth
- branch consolidation and final production hardening remain before declaring the whole platform production-complete

---

## 18. Engineering protocol

Verify before modifying; preserve unrelated work; build/typecheck before claiming readiness; separate external blockers from code failures; never expose secrets; do not invent tests/evidence; client-supplied tenant IDs are never authority; cross-tenant validation is mandatory before external indexing/search changes; do not enable strict tenant enforcement, autonomous customer sends, paid rank polling or website publishing without the corresponding control gate.

Update both this file and `docs/SalsysOS_Current_Checkpoint.md` after every meaningful checkpoint.

---

## 19. Related context

- `docs/SalsysOS_Current_Checkpoint.md`
- `docs/SalsysOS_System_Intelligence_Core_V1.md`
- `docs/SalsysOS_Feature_Completion_Matrix_2026-10-18.md`
- `docs/checkpoints/M-2026-10-18-SEO-OpenSearch-Competitor-Intelligence.md`
- `docs/SalsysOS_Behavioral_Intelligence_Privacy_Control_Plane_Roadmap.md`
