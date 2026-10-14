# SalsysOS North Star Product Context

**Status:** Canonical product/context/progress source of truth  
**Last updated:** 2026-10-14  
**Repository:** `yogakulamacademy/salsys-os`

> Read this file first when SalsysOS context is incomplete or uncertain. Update it after every meaningful phase/checkpoint so project direction, progress, blockers, validation state, and next actions survive loss of chat/session context.

---

## 1. North Star

SalsysOS means **Sales + Analysis Operating System**.

It is not intended to become a generic CRM with disconnected features. The North Star is a **Customer Journey Intelligence + Revenue Intelligence operating system** connecting marketing, visitor behavior, identity, CRM activity, sales execution, payments, attribution, content performance, privacy/compliance controls, and predictive recommendations into one closed loop.

The product should eventually answer:

> **What is this person likely to do next, why, and what should we do right now to increase the probability of conversion?**

The first product vertical is **Yoga / Education / Wellness**, with Yogakulam Academy as tenant #1. The second planned vertical is **Real Estate**. The architecture must support vertical depth while remaining reusable for future productization.

---

## 2. Core closed loop

`marketing spend → traffic → source/campaign/content → anonymous behavior → identity resolution → lead → conversation → intent/objection/product affinity → salesperson → follow-up → payment/enrollment → revenue → attribution → conversion feedback → learning → recommendation`

This must work across website, organic search, paid media, WhatsApp, Instagram, email, phone, CRM, payments, and future channels.

The CRM is the **team interface**. The event/journey/intelligence system underneath is the **brain**.

---

## 3. Behavioral journey model

Every person should eventually have one continuous behavioral timeline:

`anonymous visitor → repeat visitor → content engagement → lead → sales engagement → customer / lost lead → post-lead engagement`

SalsysOS must understand both **pre-lead** and **post-lead** activity, including:

- pre-lead website/session history
- post-lead return behavior
- course/product interest
- pricing/payment/accommodation/testimonial/teacher/curriculum activity
- recency, frequency, depth, and commercial-intent signals
- intent trend and acceleration
- reactivation detection
- behavioral segments
- conversion-assisting pages/content
- revenue influence by content
- sales influence on later digital behavior
- next-best-action recommendations

Page-view volume alone is not intent. Initial scoring direction:

`Frequency × Recency × Depth × Commercial Intent`

Rules may begin deterministic and later be calibrated from actual conversion and revenue outcomes.

---

## 4. Data architecture principles

1. **Raw events are not CRM rows.** High-volume events stay separate from CRM operational tables.
2. **Identity is deterministic where possible.** Resolve anonymous visitors, leads, customers, channels, and source identities through a controlled identity layer.
3. **Observed vs inferred data stay distinguishable.** A page visit is observed; an intent score is inferred.
4. **Customer 360 summarizes the event graph** instead of duplicating raw events.
5. **Revenue connects back to acquisition and behavior.** Traffic/rankings/leads alone are not the goal.
6. **Data quality precedes analytics trust.** Broken identities, attribution, timestamps, tenancy, or source mappings invalidate downstream intelligence.
7. **Hard tenancy is mandatory.** Browser-supplied organization IDs are never authority.
8. **Privacy and policy are first-class architecture**, not a later banner/configuration exercise.
9. **AI operates workflows**, but important changes remain auditable and explainable.
10. **Adopt/migrate instead of destructive replacement** where safe continuity matters.

---

## 5. Privacy & Compliance Control Plane

SalsysOS must be privacy-by-design and support configurable controls for frameworks such as GDPR/ePrivacy, India DPDP, CCPA/CPRA, and future jurisdictions without claiming universal legal compliance.

Preferred product wording:

> **Privacy-by-design infrastructure with configurable controls supporting applicable privacy frameworks.**

The control plane should contain:

1. Jurisdiction Engine
2. Consent Management / Consent Ledger
3. Purpose Registry
4. Data Classification
5. Legal-Basis Registry
6. Identity Resolution / Identity Stitching Controls
7. Tracking Policy Engine
8. Retention Engine
9. Data Subject Rights Engine
10. Vendor / Processor Registry
11. Data Residency / Transfer Controls
12. Audit Trail
13. Security Policy
14. Age / Child Protection
15. Profiling & Automated Decision Controls
16. Policy-aware Data Lineage

Consent is not one boolean. The architecture should support purpose-specific states such as analytics, personalization, marketing, ad sharing, profiling, and email marketing, plus notice version, timestamp, source, jurisdiction, withdrawal, and proof metadata.

A future event-policy decision must be able to answer:

- may this event be stored?
- may anonymous history be stitched to a known identity?
- may the event influence intent scoring?
- may the data be activated to Meta/Google?
- may it be used for personalization?
- how long may it be retained?
- may it be used for model training?

PII should progressively move toward a protected identity-vault pattern, with behavioral systems using internal person IDs instead of repeatedly carrying names/emails/phones.

Deletion, access, correction, consent withdrawal, restriction, and marketing opt-out should become orchestrated workflows rather than manual work across many systems.

---

## 6. Workspace program — fixed meanings

Do **not** repurpose these labels.

| Workspace Phase | Weight | Status |
|---|---:|---|
| W1 Architecture / Audit | 10% | COMPLETE |
| W2 RBAC | 15% | COMPLETE |
| W3 Shell / Header / Workspace Navigation | 15% | COMPLETE |
| W4 Employee Accounts | 15% | COMPLETE |
| W5 Sales Workspace | 12% | ~98–99% |
| W6 Marketing Workspace | 12% | Foundation exists; formal expansion pending |
| W7 Finance + Reports Workspaces | 11% | Pending formal build |
| W8 Admin Workspace + Security / QA | 10% | Active, ~91% |

Planned cumulative checkpoints remain W1 10%, W2 25%, W3 40%, W4 55%, W5 67%, W6 79%, W7 90%, W8 100%.

Execution exception currently in force:

`W8 tenant/security → W6 → W7 → remaining W8 closeout`

W8 was pulled forward before onboarding another tenant because hard tenant isolation is a prerequisite for commercial multi-tenancy.

---

## 7. W5 current status

W5A Manager authorization — COMPLETE  
W5B Lead + commercial authorization — COMPLETE  
W5C Sales workflow hardening — essentially complete at DB/security level; final app smoke remains

Completed W5C work includes:

- WhatsApp contact capability
- workflow mutation hardening
- canonical Sales RPC protections
- privilege audit
- rollback-only production regression for `create_followup_task`

---

## 8. W6 Marketing Workspace scope

Existing scope includes Campaigns, Paid Media, Google Ads, Meta Ads, GA4, Search Console, SEO, Tracking, acquisition, and attribution.

Organic Growth Intelligence is part of W6:

- W6-OG1 Website Intelligence
- W6-OG2 Opportunity Engine
- W6-OG3 Keyword + SERP Intelligence
- W6-OG4 Content Intelligence
- W6-OG5 Revenue-Aware Organic Intelligence
- W6-OG6 AEO
- W6-OG7 GEO / AI Visibility
- W6-OG8 Experimentation + Learning
- W6-OG9 Human-Approved Autonomous Optimization

Behavioral Intelligence extends W6 by connecting organic/paid/content behavior to lead quality, intent, conversions, and revenue.

---

## 9. W7 Finance + Reports scope

W7 covers revenue, payments, finance views, management/business reporting, authorization, tenant/role scoping, operational reports, and executive reporting.

Revenue and payment truth must feed attribution, content intelligence, sales intelligence, and recommendation models.

---

## 10. W8 Admin + Security / QA roadmap

W8A Tenant identity contract + current membership audit  
W8B Tenant-specific login entry  
W8C Authentication → tenant binding  
W8D Remove organization chooser / switching API / switching UI  
W8E Central trusted tenant resolver  
W8F DB / RLS / RPC tenant-isolation audit  
W8G Integrations + webhooks tenant binding  
W8H Tenant team-administration isolation  
W8I Cross-tenant adversarial regression  
W8J Controlled second-tenant staging test  
W8K Production cutover + security sign-off

### W8 current state

- tenant-specific login implemented
- organization switching removed from normal product flow
- trusted current-tenant resolver implemented
- session-binding DB foundation implemented
- session slug binding implemented
- single-active-membership guard implemented for future normal users
- OAuth active-tenant guard implemented
- CRM settings tenant-scoped
- Team & Access tenant-scoped
- cross-tenant viewer adversarial tests passed
- legacy multi-org session cannot rebind one authenticated session to a second tenant
- integration credential cross-tenant list/create/revoke/rotate blocked for a bound tenant session
- `can_manage_organization` and CRM admin helpers require current session tenant for authenticated callers
- `can_mutate_organization(...)` is the transition-safe write boundary for authenticated tenant mutations
- organization-scoped INSERT/UPDATE/DELETE policies across CRM, course, enrollment, payment, identity, touchpoint, and web-session surfaces require a tenant-bound mutation/admin gate
- `is_organization_admin(...)` uses the tenant-bound mutation gate
- mutation-policy audit found zero organization-scoped mutation policies outside approved tenant-bound mutation/admin gates
- nine latent accommodation mutation SECURITY DEFINER RPCs have authenticated execution removed and remain service-role callable
- five latent course resolver/admin SECURITY DEFINER RPCs have authenticated execution removed and remain service-role callable
- legacy global CRM settings reads resolve through tenant-aware compatibility wrappers
- unnecessary authenticated execution removed from internal settings/tenant helpers and four unused authorization/helper RPCs
- Supabase authenticated-executable SECURITY DEFINER warning count reduced from 67 → 53 → 48 → **44** without widening table privileges
- WhatsApp Embedded Signup completion revalidates the authenticated/bound tenant before consuming OAuth state or mutating integration data
- Meta Ads debug diagnostics require operator/service authorization rather than being public
- production OAuth-state audit found zero unused/unexpired Google, Meta, Instagram, or WhatsApp states
- GA4 and GSC health/history/count routes now explicitly resolve and filter to the trusted active tenant
- tenant-bound password recovery code is merged, uses tenant slug binding, rejects cross-tenant recovery mismatches, forces fresh login after rotation, and never trusts forwarded Host headers for production reset URLs
- password-recovery entry is hidden in production until `SALSYSOS_APP_URL` is configured, preventing a visibly broken recovery path
- GitHub Actions CI now independently runs `npm ci`, `npm run typecheck`, and `npm run build`, reducing reliance on Vercel preview capacity

### W8 production rollout state — last verified 2026-10-14

- strict session-tenant enforcement: **OFF**
- persisted `tenant_session_bindings`: **0**
- active multi-organization sessions: **1**
- bound multi-organization sessions: **0**

Do **not** enable strict enforcement until a genuine tenant-specific production session binding is observed and validated.

### W8 remaining critical blockers

1. obtain/observe a real tenant-specific persisted production session binding
2. one legacy admin identity still has active memberships in all three organizations
3. W8F remaining SECURITY DEFINER classification; current advisor count is 44, many intentionally user-facing/policy helpers
4. finish W8G remaining service-client mutation review
5. complete W8I adversarial matrix
6. configure production `SALSYSOS_APP_URL` and Supabase Auth redirect allow-list for password recovery
7. perform real tenant-specific password recovery E2E before W8K sign-off
8. W8J controlled second-tenant login test
9. W8K strict-enforcement cutover and sign-off
10. Supabase leaked-password protection remains external/configuration work

---

## 11. Technical roadmap — fixed 11 phases

1. Identity Resolution
2. Raw Event Platform
3. Session & Touchpoint Processing
4. Customer Journey / Customer 360
5. CRM Journey Experience
6. Attribution & Revenue
7. Intent + Product Affinity + Sales Intelligence
8. Conversion Feedback
9. Content + SEO Intelligence
10. AEO / GEO / AI Visibility
11. Predictive Intelligence

Current interpretation:

- 1 Identity Resolution — substantially complete foundation
- 2 Raw Event Platform — substantially complete foundation
- 3 Sessions/Touchpoints — substantially complete foundation
- 4 Customer 360/Journey — strong foundation; deeper behavioral timeline remains
- 5 CRM Journey Experience — strong foundation; behavior-first lead profile remains
- 6 Attribution & Revenue — strong foundation
- 7 Intent/Product Affinity/Sales Intelligence — strong foundation; richer behavioral scoring/reactivation remains
- 8 Conversion Feedback — strong foundation; operational completion remains
- 9 Content + SEO — foundation exists; large extension remains
- 10 AEO/GEO — mostly pending
- 11 Predictive — early blocks exist; full predictive/recommendation phase pending

Approximately **8/11 phases are materially built**, not 8/11 fully complete.

---

## 12. Commercial / North-Star roadmap — fixed R0–R14

- R0 Platform Rebrand
- R1 Foundation, Tenancy, Security & Production Baseline
- R2 Lead Capture, Identity, Raw Events & Data Quality
- R3 CRM Sales Execution
- R4 Customer Journey / Customer 360
- R5 Attribution, Funnel & Revenue Intelligence
- R6 Intent, Product Affinity & Sales Intelligence
- R7 Integrations & Conversion Feedback
- R8 Content + SEO Intelligence
- R9 AEO / GEO / AI Visibility
- R10 Predictive Intelligence + Owner Command Center
- R11 Wellness/Education Productization
- R12 SalsysOS Realty
- R13 Commercial SaaS Readiness
- R14 Marketing + First 100 Customers

Current interpretation:

- R0 largely done
- R1 nearing completion
- R2 strong
- R3 nearly complete
- R4 strong foundation
- R5 strong foundation
- R6 strong foundation
- R7 in progress
- R8 partial
- R9 pending
- R10 partial/early
- R11–R14 pending

Roughly **7 of 14 are built or materially underway**.

---

## 13. Behavioral Intelligence workstream

This deepens Technical Phases 4, 5, 7, 9, and 11 plus Commercial R4, R6, R8, and R10.

- BI-1 Behavioral event taxonomy
- BI-2 Pre-lead timeline
- BI-3 Post-lead timeline
- BI-4 Intent Score v1
- BI-5 Intent trend + reactivation
- BI-6 Behavioral segments
- BI-7 Content/revenue influence
- BI-8 Sales influence
- BI-9 Predictive scoring
- BI-10 Recommendation / next-best-action

**Current Behavioral Intelligence estimate: ~35–40% foundation.**

---

## 14. Privacy & Compliance workstream

This is a cross-cutting control plane and should begin before significant behavioral tracking expansion.

- PC-1 Consent Ledger v2
- PC-2 Purpose Registry
- PC-3 Jurisdiction / policy decision layer
- PC-4 Event policy metadata
- PC-5 Identity-stitching policy
- PC-6 Identity Vault / PII separation
- PC-7 Retention Engine
- PC-8 Rights Orchestrator
- PC-9 Vendor / Processor Registry
- PC-10 Data Lineage
- PC-11 Profiling / automated-decision controls
- PC-12 Compliance audit/reporting

**Current Privacy & Compliance estimate: ~15–20% foundation.**

Existing foundations include the tracking consent ledger, tenant/security hardening, raw event infrastructure, audit patterns, service isolation, and identity architecture.

---

## 15. Multi-tenant identity contract

Required behavior:

- 1 organization = 1 tenant = isolated data boundary
- login session resolves to exactly one trusted tenant
- normal customers do not receive an organization selector/switcher
- tenant-specific login route: `/login/<organization-slug>`
- auth verifies active membership in requested tenant
- no membership → deny
- browser-supplied organization IDs are never authority
- platform admin is separate from tenant admin
- changing URL IDs, payloads, RPC args, or API calls must not expose another tenant

Legacy state: one admin identity still belongs to SalsysOS, Test Yoga School, and Yogakulam Academy. This is a migration exception and W8J/W8K blocker, not the target architecture.

---

## 16. Important recent production security migrations

- `20261014050034_single_active_tenant_membership_guard`
- `20261014051818_integration_oauth_active_tenant_guard`
- `20261014052718_function_search_path_hardening`
- `20261014053539_trigger_function_execute_hardening`
- `20261014053906_service_only_table_grant_hardening`
- `20261014054340_deprecated_course_batch_rpc_hardening`
- `20261014054613_course_catalog_finalize_rpc_hardening`
- `20261014055555_tenant_scoped_crm_settings_foundation`
- `20261014055627_tenant_scoped_crm_settings_rpcs`
- `20261014055802_tenant_scoped_crm_settings_views`
- `20261014060357_tenant_session_binding_foundation`
- `20261014060514_tenant_session_slug_binding`
- `20261014060716_tenant_aware_settings_compatibility_reads`
- `20261014061001_session_bound_tenant_authorization`
- `20261014065212_tenant_identity_anon_grant_hardening`
- `20261014065437_tenant_identity_mutation_grant_hardening`
- `20261014065535_legacy_global_crm_settings_mutator_hardening`
- `20261014074859_tenant_team_membership_consistency`
- `20261014084439_session_bound_crm_admin_authorization`
- `20261014084720_session_bound_organization_management`
- `20261014091441_session_bound_tenant_mutation_policies`
- `20261014091745_session_bound_organization_admin_authorization`
- `20261014092325_latent_accommodation_rpc_execute_hardening`
- `20261014092425_latent_course_rpc_execute_hardening`
- `20261014093616_legacy_settings_and_internal_tenant_helper_hardening`
- `20261014100145_unused_authorization_rpc_execute_hardening`

---

## 17. Current progress snapshot — 2026-10-14

These are planning estimates, not mathematically exact completion figures.

| Meter | Current estimate |
|---|---:|
| W1–W8 workspace program | ~79% |
| W5 Sales Workspace | ~98–99% |
| W8 Admin/Security/QA | ~91% |
| W8G Integrations/Webhooks | ~98% |
| Technical platform | ~78–79% |
| Behavioral Intelligence | ~35–40% |
| Privacy & Compliance Control Plane | ~15–20% |
| First commercial-ready multi-tenant product | ~67–69% |
| Full expanded SalsysOS platform scope | ~62–64% |
| Wider R0–R14 commercial roadmap | ~50–52% |

Adding new approved scope may reduce the percentage of the **expanded total roadmap** without undoing completed work. Always state when the denominator changed.

---

## 18. Current milestone

### Milestone M-2026-10-14-F — Independent CI + analytics/auth tenant hardening

Completed:

- diagnosed the first independent CI build failure as a build-analysis environment issue: Next.js reached `/funnel` before Supabase public configuration was present; application TypeScript itself passed
- added GitHub Actions CI with `npm ci`, `npm run typecheck`, and `npm run build`
- CI uses non-secret placeholder Supabase public values solely so Next.js can reach `cookies()` and correctly identify authenticated routes as dynamic during build analysis; it does not connect to production
- independent CI typecheck and production build both pass
- PR #18 merged: durable GitHub CI is now available even when Vercel preview capacity is rate-limited
- PR #14 independently validated and merged: GA4/GSC health routes are explicitly tenant-scoped
- PR #15 independently validated and merged: tenant-bound password recovery code is now on main
- password recovery was hardened before merge so production reset URLs require `SALSYSOS_APP_URL`, forwarded Host headers are not trusted in production, and the login recovery entry remains hidden until production recovery is configured
- strict tenant rollout state remains intentionally unchanged: strict=false, persisted bindings=0, active multi-org sessions=1, bound multi-org sessions=0

Remaining activation/sign-off:

- configure `SALSYSOS_APP_URL` in the production hosting environment
- allow `<SALSYSOS_APP_URL>/auth/callback` in Supabase Auth redirect configuration
- perform a real password-reset E2E test
- observe a genuine persisted tenant session binding before strict tenant enforcement

### Milestone M-2026-10-14-E — W8 integration/auth continuation and RPC surface reduction

Completed:

- PR #13 merged: WhatsApp Embedded Signup callback tenant revalidation + Meta Ads debug authorization
- production migration `20261014100145_unused_authorization_rpc_execute_hardening`
- PR #16 source-sync merged
- SECURITY DEFINER advisor count reduced to 44
- canonical rollout state rechecked

### Milestone M-2026-10-14-D — Settings/helper hardening

Completed:

- legacy tenant-aware settings compatibility reads hardened
- unnecessary authenticated execution removed from internal tenant/settings helpers
- advisor count reduced from 53 to 48

### Milestone M-2026-10-14-C — Latent privileged RPC surface reduction

Completed:

- production migrations `20261014092325` and `20261014092425`
- nine accommodation and five course resolver/admin latent SECURITY DEFINER RPCs removed from authenticated execution
- advisor count reduced from 67 to 53

### Milestone M-2026-10-14-B — Session-bound tenant mutation boundary

Completed:

- `can_mutate_organization(...)` transition-safe write gate
- organization-scoped mutation policies hardened
- bound-session cross-tenant mutation regression returned 0
- mutation-policy audit found zero organization-scoped mutation policies outside approved tenant-bound gates

### Milestone M-2026-10-14-A — Tenant-bound administration hardening

Completed:

- tenant Team & Access isolation
- tenant employee provisioning/activation
- inactive membership/workspace consistency
- cross-tenant CRM admin and integration credential blocking
- organization management bound to current tenant session

---

## 19. Immediate next execution order

1. configure/verify password-recovery production origin + Supabase redirect allow-list when hosting/Auth configuration access is available
2. perform password recovery E2E with a real tenant-specific user
3. continue W8F classification of remaining 44 authenticated-executable SECURITY DEFINER functions; preserve intentional user-facing/policy helpers and revoke only exposure proven unnecessary
4. finish W8G direct service-client mutation review
5. expand W8I adversarial matrix across remaining RPC, analytics, settings, and service-client surfaces
6. obtain/observe a genuine tenant-specific persisted session binding in production
7. perform W8J controlled second-tenant validation
8. resolve legacy multi-org admin identity safely
9. perform W8K strict tenant enforcement cutover + sign-off
10. resume W6 Marketing + Organic Growth Intelligence
11. begin Privacy Control Plane foundations alongside Behavioral Intelligence expansion
12. build W7 Finance + Reports
13. continue Technical 9–11 / R8–R10
14. productization/commercial phases R11–R14

---

## 20. Update protocol after every major phase/checkpoint

Every meaningful checkpoint must update this document with:

- date
- milestone ID/name
- what was actually completed
- migrations/PRs/commits when relevant
- verification performed
- regressions or known warnings
- checkpoint percentage
- W1–W8 percentage
- Technical 1–11 status
- R0–R14 status
- Behavioral Intelligence percentage
- Privacy/Compliance percentage
- commercial-readiness percentage
- remaining work
- blockers
- exact next checkpoint

Do not claim 99% or 100% without defining scope and verifying completion.

Separate these meters:

1. workspace/RBAC program
2. technical platform
3. Behavioral Intelligence
4. Privacy & Compliance
5. first commercial-ready product
6. full R0–R14 commercialization

Warnings must be separated from hard failures.

---

## 21. Engineering operating rules

- one checkpoint at a time
- verify before modifying
- preserve unrelated work
- validate build/typecheck/deployment before merging runtime code when applicable
- distinguish external CI/deployment blockers from code failures
- no secrets in logs, commits, chat, or docs
- prefer adoption/migration over destructive replacement
- no second customer tenant onboarding before isolation is sufficiently validated
- do not invent successful tests
- do not enable strict session enforcement prematurely
- use rollback-only SQL for destructive/adversarial production regressions when possible
- service-role paths require explicit trusted tenant binding before tenant-scoped mutation
- tenant IDs supplied by browser/client are never sufficient authority

---

## 22. Related canonical roadmap document

`docs/SalsysOS_Behavioral_Intelligence_Privacy_Control_Plane_Roadmap.md`

That document contains the deeper Behavioral Intelligence + Privacy Control Plane extension. This file remains the top-level North Star and current progress source of truth.

---

## 23. Rule for future sessions

Before substantial SalsysOS work, read this file first when current context is incomplete or uncertain.

When a milestone changes the product, architecture, roadmap, scope, progress, blockers, or next action, update this file in the same development cycle.

This document is deliberately durable so loss of chat/session context does not mean loss of project direction.
