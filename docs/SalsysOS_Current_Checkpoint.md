# SalsysOS Current Checkpoint

**Date:** 2026-10-24  
**Canonical repository:** `yogakulamacademy/salsys-os`  
**Production branch:** `main`  
**Latest verified product-code production head before this documentation refresh:** `22c20a3d825014bcee4d692c535fc55a32cb8b06`  
**Latest verified production deployment for that product-code head:** `dpl_3dihGMTdsDxtJkZkm35jUUESfBAa` — `READY`

This file is the canonical operational checkpoint. Historical files under `docs/checkpoints/` remain immutable evidence records for what was known and verified at the time.

Latest detailed milestones:

- `docs/checkpoints/M-2026-10-24-Onboarding-Workspace-Activation-Motion-Interaction-v1.md` — latest onboarding, Home activation, motion and interaction-feedback state.
- `docs/checkpoints/M-2026-10-24-Onboarding-Optional-Step-Routing-Fix.md` — optional Website routing fix.
- `docs/checkpoints/M-2026-10-24-Onboarding-and-Customer-Provisioning-v1.md` — controlled new-customer provisioning and onboarding foundation.
- `docs/checkpoints/M-2026-10-23-Conversation-Flow-Builder-UX-v1.md` — Flow Builder production UX state.
- `docs/checkpoints/M-2026-10-23-Conversations-Shared-Inbox-Collaboration-v14.md` — Conversations/Inbox collaboration state.
- `docs/checkpoints/M-2026-10-22-Universal-Tracking-Server-Integration-v1.md` — Universal Tracking + server integration state.

## 0. Ordered product closeout status

The closeout rule remains unchanged: one major product area must reach production-integrity closeout before the active closeout target moves forward.

1. **Core CRM + lead/customer management — CLOSED V1**
2. **Customer Journey / Person 360 / Identity — CLOSED V1**
3. **Universal Tracking SDK + consent — ACTIVE**
4. Funnel + attribution + revenue — next after Tracking closeout
5. WhatsApp automation — remaining production proof
6. Instagram automation — provider-permission/live E2E proof
7. Smart Triggers/workflow engine — final closeout audit
8. SEO/AEO/search intelligence — final closeout audit
9. Event Intelligence/feature store — final closeout audit
10. Predictive-model infrastructure — readiness/promotion closeout
11. Proven predictive accuracy from real outcomes — data-dependent calibration proof
12. Advanced R11-R14 intelligence/autonomy — later North-Star work

Do not skip forward while the active area has an unresolved production-integrity blocker.

## 1. Core CRM and Customer 360

Core CRM remains CLOSED V1. PostgreSQL-backed lead/customer state, canonical stage mutation, ownership integrity and tenant boundaries remain authoritative.

Customer Journey / Person 360 / Identity remains CLOSED V1. Exact-session anonymous-to-known identity handoff remains tenant-bound and atomic. Missing evidence must remain unknown rather than inferred.

The later Inbox, Pipeline, Lead Inspector and motion work are UX/product enhancements inside already-established integrity boundaries; they do not reopen those closeouts.

## 2. Universal Tracking — active closeout area

Universal Tracking remains substantially implemented but not yet closed because the real production acquisition-to-revenue journey has not been fully proven and reconciled end-to-end.

Current platform capabilities include:

- universal browser + trusted server ingestion;
- canonical event contracts;
- tenant/source isolation;
- public Site ID + trusted-origin browser resolution;
- secret-authenticated server sources;
- canonical site/www alias consolidation;
- source counters, payload limits and per-source rate limits;
- server-source create/edit/pause/rotate/delete management;
- platform-first guided installation UX;
- idempotent source-event ingestion;
- privacy-aware browser tracking;
- browser/session/identity continuity foundations;
- direct first-party tracking direction rather than GTM as a core dependency.

Canonical authority model:

- browser = journey, behavior and attribution telemetry;
- trusted server = durable backend facts or explicitly server-observed requests;
- payment/enrollment/refund/revenue completion must come from authoritative backend confirmation;
- OpenSearch remains secondary/rebuildable rather than authoritative;
- unknown evidence stays unknown.

Live Yogakulam PHP/Hostinger proof remains the immediate blocker before Tracking can be called closed.

The acceptance journey still required is:

`campaign/click id -> visitor -> session -> page/CTA behavior -> consent -> enquiry/form -> CRM lead -> identity -> checkout -> payment -> enrollment -> revenue -> attribution -> features/prediction -> observed outcome`

That same journey must reconcile across Tracking, Person 360, Funnel, Attribution and Revenue.

## 3. Messaging and automation safety posture

Conversations remains a CRM-connected shared sales Inbox with canonical CRM ownership, private snooze/collaboration state, internal notes, mentions, presence and SLA visibility.

WhatsApp controlled E2E proof remains valid for the verified lifecycle/safety path. Customer messaging remains fail-closed unless explicitly armed.

Instagram Operations V1 remains aligned to Meta-compatible user-initiated messaging semantics. Do not invent a WhatsApp-style cold-broadcast primitive for Instagram.

Automation safety remains unchanged:

- human approval where required;
- no fake test/simulation state presented as real execution;
- no autonomous customer messaging by default;
- no automatic website publishing by default;
- no automatic ad-budget changes by default.

## 4. SaaS onboarding and customer provisioning

Controlled Customer Organization Provisioning V1 remains live.

Platform admins can provision a customer through `/settings/organizations`; the trusted server path creates the owner Auth identity and the service-role-only provisioning RPC atomically creates the tenant, owner membership, functional workspaces and onboarding row. Auth creation is rolled back if tenant provisioning fails.

Public/self-serve signup is **not** implemented by this milestone. Billing/subscription enforcement, plan entitlements, abuse controls and customer-controlled account lifecycle remain later SaaS-readiness work.

### First-login security

Provisioned customer owners must replace the temporary password before business onboarding.

The gate is driven by admin-owned Auth app metadata and remains enforced across authenticated page navigation. APIs retain their existing authorization behavior rather than being redirected by onboarding UX.

Existing users without the security flag remain unaffected.

### Current onboarding flow

`Security -> Business -> Goals -> Website -> Channels -> Team -> Finish`

Hard requirements:

- Business
- Goals / Priorities

Recommended / optional setup:

- Website tracking
- Connected channels
- Team access

Critical invariant:

**Skip != complete.**

Skipped optional steps advance onboarding but are not written to `completed_steps`.

Channels and Team no longer require Website completion. This behavior is protected by the onboarding regression contract.

Finish requires Business + Goals only. Website, Channels and Team can remain incomplete and be continued later from Home.

This replaces the earlier stale checkpoint assumption that healthy Website tracking was required for onboarding completion.

## 5. Home Workspace Activation

The post-onboarding setup experience is now the `Workspace Activation` step bar.

While setup is incomplete it shows all four activation checks together, live `X of 4 verified` progress, remaining count, the first unfinished item as `Start here`, and verified items as complete.

Activation checks are derived from live tenant evidence:

1. **Track where leads come from** — healthy website tracking evidence.
2. **Connect your conversations** — at least one connected integration.
3. **Give every lead an owner** — real active team/member evidence.
4. **Automate your first follow-up** — at least one non-archived automation workflow.

The component disappears when all four are genuinely verified.

Legacy tenants are not forced into this experience; the activation block is restricted to organizations that completed the new onboarding flow.

## 6. Motion System and interaction-feedback rollout

The product now has a reusable restrained motion language. Motion is intended to explain progress, state changes and interaction feedback—not to create decorative noise.

All motion supports `prefers-reduced-motion`.

### V1 — Home + Onboarding — PR #164

- Workspace Activation progress animation;
- staggered step reveals;
- active-step emphasis;
- verified/check feedback;
- onboarding route/progress transitions.

### V2 — Smart Triggers + Flow Builder — PR #165

- process/condition/result feedback;
- modal/inspector entrance;
- node settle/drag/select feedback;
- connector/focus transitions.

### V3 — CRM Pipeline + Analytics — PR #166

- pipeline KPI/stage/card reveals;
- drag-target and optimistic-save feedback;
- analytics KPI/chart/table/filter/detail transitions.

### V4 — Conversations + Leads + Lead Inspector — PR #167

- thread/activity/context transitions;
- lead table/filter/selection feedback;
- inspector drawer/backdrop/tab/action motion.

### V5 — Funnel + Attribution + Revenue — PR #168

- funnel-stage/evidence motion;
- attribution readiness/filter/investigation feedback;
- revenue KPI/progress/table transitions.

### V6 — Settings + Integrations + Tracking — PR #169

- operational card/form transitions;
- integration/setup feedback;
- tracking health/progress motion;
- dialogs, empty states and form focus feedback.

### V7 — Global micro-interactions — PR #170

- CRM skeleton shimmer;
- pending / `aria-busy` feedback;
- semantic status/alert animation;
- saved/completed state feedback;
- refreshed/optimistic row motion;
- selected tab/filter feedback;
- reusable copied-state hooks.

### V8 — Targeted real-state interaction feedback — PR #171

- interaction bridge annotates existing real pending actions;
- disabled actions with real pending labels such as Sending, Saving, Creating, Verifying, Connecting, Inviting, Publishing, Syncing, Processing, Loading, Updating or Generating receive busy/pending feedback;
- pending buttons show a restrained progress sweep;
- copy confirmation is derived from real rendered `Copied` state;
- tracking snippet copy state is marked only after clipboard write succeeds;
- no artificial timer or fake success state is introduced.

The V1-V8 rollout did **not** change CRM mutations, messaging authority, tracking ingestion, integration persistence, attribution calculations, revenue/payment truth, tenant isolation or database authority unless separately documented by an earlier product milestone.

## 7. Regression and release discipline

Meaningful product changes continue to use:

- focused feature branch;
- narrow PR;
- platform contracts;
- relevant onboarding/tracking/commercial-intelligence contracts;
- TypeScript;
- full Next.js build;
- Vercel preview;
- merge;
- exact production deployment verification.

The onboarding verifier protects, among other things:

- first-login password replacement ordering;
- page-navigation bypass prevention;
- explicit `enforce_on_sign_in` opt-in;
- Business + Goals as the only hard onboarding requirements;
- Website skip without false completion;
- Channels/Team remaining reachable after Website skip;
- evidence-based Home setup recommendations;
- tenant-safe behavior for legacy organizations.

## 8. Event Intelligence / predictive boundaries

PostgreSQL remains source of truth for raw events, identity, consent, CRM state, payments, enrollments, revenue, features, predictions and observed outcomes.

OpenSearch remains an optional rebuildable projection rather than source of truth.

Rules-generated scores must not be presented as calibrated probabilities. Current evidence is still insufficient to claim broadly proven predictive accuracy from real outcomes.

## 9. Safety defaults

Unless a later approved checkpoint explicitly changes them:

- autonomous customer messaging OFF;
- automatic website publishing OFF;
- automatic ad-budget changes OFF;
- broad/global OpenSearch indexing OFF;
- PostgreSQL remains source of truth;
- human approval remains required for sensitive/high-impact actions;
- server secrets remain backend-only;
- payment/enrollment/revenue truth remains backend-authoritative;
- no fake traffic, rankings, revenue, conversions or model-training evidence;
- no claim of tracking success without observed evidence.

## 10. Current verified production evidence

Latest verified product-code production head before this documentation refresh:

`22c20a3d825014bcee4d692c535fc55a32cb8b06`

Latest verified deployment for that head:

`dpl_3dihGMTdsDxtJkZkm35jUUESfBAa` — `READY`

This deployment contains the onboarding corrections, Workspace Activation redesign, Motion System V1-V7 and targeted Interaction Feedback V8.

## 11. Checkpoint maintenance rule

After every meaningful production milestone:

- update this file;
- update `docs/SalsysOS_North_Star_Product_Context.md` if roadmap/progress materially changes;
- update the relevant active checkpoint;
- add a historical milestone record when production proof materially changes system state;
- distinguish built, merged, deployed, tested and fully E2E-proven states;
- preserve historical evidence rather than rewriting old milestone files to match the latest plan.
