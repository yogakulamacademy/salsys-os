# SalsysOS North Star Product Context

**Status:** Canonical product/context/progress source of truth  
**Last updated:** 2026-10-14  
**Repository:** `yogakulamacademy/salsys-os`

> Update this file after every meaningful phase/checkpoint. It exists so a future contributor or AI session can understand what SalsysOS is, why it exists, what has been completed, what remains, what is blocked, and what must happen next without reconstructing the project from chat history.

---

## 1. North Star

SalsysOS means **Sales + Analysis Operating System**.

It is not intended to become a generic CRM with many disconnected features. The North Star is a **Customer Journey Intelligence + Revenue Intelligence operating system** that connects marketing, visitor behavior, identity, CRM activity, sales execution, payments, attribution, content performance, privacy/compliance controls, and predictive recommendations into one closed loop.

The core business question SalsysOS should eventually answer is:

> **What is this person likely to do next, why, and what should we do right now to increase the probability of conversion?**

The first product vertical is **Yoga / Education / Wellness**, with Yogakulam Academy as tenant #1. The second planned vertical is **Real Estate**. The architecture must therefore be deep enough for vertical workflows but reusable enough for future productization.

---

## 2. Core closed loop

SalsysOS should connect:

`marketing spend → traffic → source/campaign/content → anonymous behavior → identity resolution → lead → conversation → intent/objection/product affinity → salesperson → follow-up → payment/enrollment → revenue → attribution → conversion feedback → learning → recommendation`

This must work across website, organic search, paid media, WhatsApp, Instagram, email, phone, CRM, payments, and future channels.

The CRM is the **team interface**. The event/journey/intelligence system underneath is the **brain**.

---

## 3. Behavioral journey model

Every person should eventually have one continuous behavioral timeline:

`anonymous visitor → repeat visitor → content engagement → lead → sales engagement → customer / lost lead → post-lead engagement`

SalsysOS must understand both **pre-lead** and **post-lead** activity.

Important capabilities:

- pre-lead website/session history
- post-lead return behavior
- course/product interest
- content engagement
- pricing/payment/accommodation/testimonial/teacher/curriculum activity
- recency, frequency, depth, and commercial-intent signals
- intent trend over time
- lead reactivation detection
- behavioral segments
- conversion-assisting pages/content
- revenue influence by content
- sales influence on subsequent digital behavior
- next-best-action recommendations

The system must avoid treating page-view volume alone as intent. The intended scoring direction is:

`Frequency × Recency × Depth × Commercial Intent`

Initial rules may be deterministic. Later models should learn from actual conversions and revenue.

---

## 4. Data architecture principles

1. **Raw events are not CRM rows.** Keep high-volume event storage separate from CRM operational tables.
2. **Identity is deterministic where possible.** Resolve anonymous visitors, leads, customers, channels, and source identities through a controlled identity layer.
3. **Observed vs inferred data must stay distinguishable.** A page visit is observed; an intent score is inferred.
4. **Customer 360 should summarize the event graph**, not duplicate millions of raw events.
5. **Revenue must connect back to acquisition and behavior.** Traffic/rankings/leads alone are not the goal.
6. **Data quality precedes analytics trust.** Broken identities, attribution, timestamps, tenancy, or source mappings invalidate downstream intelligence.
7. **Hard tenancy is mandatory.** Browser-supplied organization IDs are never authority.
8. **Privacy and policy are first-class architecture**, not a later banner/configuration exercise.

---

## 5. Privacy & Compliance Control Plane

SalsysOS must be privacy-by-design and support configurable controls for frameworks such as GDPR/ePrivacy, India DPDP, CCPA/CPRA, and future jurisdictions without claiming universal legal compliance.

The product promise should be closer to:

> **Privacy-by-design infrastructure with configurable controls supporting applicable privacy frameworks.**

The Compliance Control Plane should contain:

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

Consent is not one boolean. At minimum the architecture should support purpose-specific states such as analytics, personalization, marketing, ad sharing, profiling, and email marketing, plus notice version, timestamp, source, jurisdiction, withdrawal and proof metadata.

A future event-policy decision must be able to answer questions such as:

- may this event be stored?
- may anonymous history be stitched to a known identity?
- may the event influence intent scoring?
- may the data be activated to Meta/Google?
- may it be used for personalization?
- how long may it be retained?
- may it be used for model training?

PII should progressively move toward a protected identity-vault pattern, with behavioral systems using internal person IDs rather than repeatedly carrying names/emails/phones.

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
| W8 Admin Workspace + Security / QA | 10% | Active, ~84–85% |

Planned cumulative checkpoints remain:

- W1 → 10%
- W2 → 25%
- W3 → 40%
- W4 → 55%
- W5 → 67%
- W6 → 79%
- W7 → 90%
- W8 → 100%

Execution exception currently in force: W8 tenant/security hardening was pulled forward before W6/W7. Current sequence is:

`W8 tenant/security → W6 → W7 → remaining W8 closeout`

---

## 7. W5 current status

W5A Manager authorization — COMPLETE  
W5B Lead + commercial authorization — COMPLETE  
W5C Sales workflow hardening — essentially complete at DB/security level; final app smoke remains

Completed W5C items include:

- WhatsApp contact capability
- workflow mutation hardening
- canonical Sales RPC protections
- privilege audit
- rollback-only production regression for `create_followup_task`

---

## 8. W6 Marketing Workspace scope

Existing scope includes Campaigns, Paid Media, Google Ads, Meta Ads, GA4, Search Console, SEO, Tracking, acquisition and attribution.

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

Behavioral Intelligence extends W6 by connecting organic/paid/content behavior to lead quality, intent, conversions and revenue.

---

## 9. W7 Finance + Reports scope

W7 covers revenue, payments, finance views, management/business reporting, authorization, tenant/role scoping, operational reports and executive reporting.

Revenue and payment truth from W7 must feed attribution, content intelligence, sales intelligence and recommendation models.

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
- multiple table/function/grant hardening migrations applied
- CRM settings tenant-scoped
- Team & Access tenant-scoped
- cross-tenant viewer adversarial tests passed
- legacy multi-org session cannot rebind one authenticated session to a second tenant
- integration credential cross-tenant list/create/revoke/rotate blocked for a bound tenant session
- `can_manage_organization` now requires current session tenant for authenticated callers
- cross-tenant organization-workspace mutation regression now returns 0
- `can_mutate_organization(...)` added as the transition-safe write boundary for authenticated tenant mutations
- organization-scoped INSERT/UPDATE/DELETE policies across CRM, course, enrollment, payment, identity, touchpoint and web-session surfaces now require a tenant-bound mutation/admin gate
- `is_organization_admin(...)` now uses the tenant-bound mutation gate
- latest mutation-policy audit found zero organization-scoped mutation policies outside the approved tenant-bound mutation/admin gates

### W8 remaining critical blockers

1. strict tenant-session enforcement flag is still intentionally OFF
2. one legacy admin identity still has active memberships in all three organizations
3. real production tenant-specific sessions must be observed/bound before strict cutover
4. W8F remaining SECURITY DEFINER classification/hardening; current advisor count is 67 authenticated-executable SECURITY DEFINER functions, many intentionally user-facing and requiring classification rather than blanket revocation
5. W8G remaining direct service-mutation audit
6. W8I remaining adversarial matrix
7. W8J controlled second-tenant login test
8. W8K strict-enforcement cutover and sign-off
9. Supabase leaked-password protection remains external/configuration work

Do **not** enable strict enforcement until a genuine tenant-specific binding path is verified safely.

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

### Current technical interpretation

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

This is not a replacement roadmap. It deepens Technical Phases 4, 5, 7, 9 and 11 and Commercial phases R4, R6, R8 and R10.

### BI-1 Behavioral event taxonomy
Define commercially meaningful event types and page/content classifications.

### BI-2 Pre-lead timeline
Aggregate anonymous history before lead creation where policy allows.

### BI-3 Post-lead timeline
Continue website/content/product behavior after lead capture.

### BI-4 Intent Score v1
Deterministic Recency × Frequency × Depth × Commercial Intent model.

### BI-5 Intent trend + reactivation
Detect score acceleration and cold-to-hot reactivation.

### BI-6 Behavioral segments
High-intent, returning, price-sensitive, accommodation researcher, testimonial-heavy, curriculum researcher, inactive-reactivated, multi-product researcher, etc.

### BI-7 Content/revenue influence
Conversion-assisting pages, content influence, lead quality and revenue by content.

### BI-8 Sales influence
Measure behavior changes after calls, WhatsApp, email and follow-ups.

### BI-9 Predictive scoring
Learn conversion probability from real outcomes.

### BI-10 Recommendation / next-best-action
Human-readable recommended action and reason.

**Current Behavioral Intelligence completion estimate: ~35–40% foundation.**

---

## 14. Privacy & Compliance workstream

This is a cross-cutting control plane. It should begin before deeper behavioral tracking is expanded.

### PC-1 Consent Ledger v2
Granular purposes + proof + versioning + withdrawal.

### PC-2 Purpose Registry
Explicit purposes, allowed data, retention, outputs and destinations.

### PC-3 Jurisdiction / policy decision layer
Configurable EU/UK/India/California/etc behavior.

### PC-4 Event policy metadata
Purpose, identity state, jurisdiction, consent state, retention class.

### PC-5 Identity-stitching policy
Control when anonymous history can be linked to known identity.

### PC-6 Identity Vault / PII separation
Progressive separation of direct identity from behavioral analytics.

### PC-7 Retention Engine
Automated retention/anonymization/deletion schedules.

### PC-8 Rights Orchestrator
Access, correction, deletion, withdrawal, restriction, opt-out.

### PC-9 Vendor / Processor Registry
Destinations, subprocessors, scopes, transfer/residency metadata.

### PC-10 Data Lineage
Track source → derived score/segment → activation destination.

### PC-11 Profiling / automated-decision controls
Human-in-the-loop defaults and explainable recommendations.

### PC-12 Compliance audit/reporting
Evidence, configuration and request-history reporting.

**Current Privacy & Compliance completion estimate: ~15–20% foundation.**

Existing foundations include tracking consent ledger, tenant/security hardening, raw event infrastructure, audit patterns, service isolation and identity architecture.

---

## 15. Multi-tenant identity contract

Required product behavior:

- 1 organization = 1 tenant = isolated data boundary
- login session resolves to exactly one trusted tenant
- normal customers do not receive an organization selector/switcher
- tenant-specific route format: `/login/<organization-slug>`
- auth verifies active membership in requested tenant
- no membership → deny
- browser-supplied organization IDs are never authority
- platform admin is separate from tenant admin
- changing URL IDs, payloads, RPC args or API calls must not expose another tenant

Legacy state: one admin identity still belongs to SalsysOS, Test Yoga School and Yogakulam Academy. This is a migration exception and a W8J/W8K blocker, not the target architecture.

---

## 16. Important production security migrations already completed

Key recent production migrations include:

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

---

## 17. Current progress snapshot — 2026-10-14

These are planning estimates, not mathematically exact completion figures.

| Meter | Current estimate |
|---|---:|
| W1–W8 workspace program | ~76% |
| W5 Sales Workspace | ~98–99% |
| W8 Admin/Security/QA | ~84–85% |
| Technical platform | ~77% |
| Behavioral Intelligence | ~35–40% |
| Privacy & Compliance Control Plane | ~15–20% |
| First commercial-ready multi-tenant product | ~62–65% |
| Full expanded SalsysOS platform scope | ~59–62% |
| Wider R0–R14 commercial roadmap | ~50% |

Adding new approved scope may reduce the percentage of the **expanded total roadmap** without undoing completed work. Always state when the denominator changed.

---

## 18. Current milestone

### Milestone M-2026-10-14-B — Session-bound tenant mutation boundary

Completed:

- canonical North Star file merged to `main`
- production migration `20261014091441_session_bound_tenant_mutation_policies` applied
- production migration `20261014091745_session_bound_organization_admin_authorization` applied
- new `can_mutate_organization(...)` helper requires authenticated requests to resolve to the target tenant and hold active membership; service-role behavior is preserved
- critical organization-scoped write policies now require session-bound tenant authorization even while the global strict rollout flag remains OFF
- bound SalsysOS session test returned `can_mutate_bound=true` and `can_mutate_other=false`
- rollback-only cross-tenant course UPDATE regression returned 0 rows
- mutation-policy audit found zero remaining organization-scoped INSERT/UPDATE/DELETE policies outside the approved tenant-bound mutation/admin gates
- direct authenticated lead UPDATE remains blocked by table privilege; no new table privilege was granted
- source migrations synchronized to GitHub branch `w8-session-bound-mutation-policies`
- security advisor rerun: 20 known no-policy/service-only tables remain informational; authenticated SECURITY DEFINER warning count is 67 after adding `can_mutate_organization`; leaked-password protection remains an external Auth configuration warning

### Prior milestone M-2026-10-14-A — Tenant-bound administration hardening

Completed:

- W8H Team & Access tenant isolation merged to `main`
- tenant employee provisioning/activation made tenant-scoped
- inactive organization membership now deactivates workspace membership
- one authenticated session cannot be rebound to a different tenant
- bound legacy admin cannot administer another tenant through CRM-admin authorization
- cross-tenant integration credential list/create/revoke/rotate blocked
- bound legacy admin cannot manage another tenant through `can_manage_organization`
- cross-tenant organization-workspace mutation regression reduced from 4 writable rows to 0
- all adversarial production verification used rollback-only transactions
- source migrations synchronized to GitHub

### Roadmap milestone

Behavioral Intelligence + Privacy/Compliance scope accepted and added as approved product direction.

---

## 19. Immediate next execution order

1. continue W8F SECURITY DEFINER classification, starting with accommodation/admin RPCs and course resolver APIs; revoke or narrow only where usage and authorization prove it safe
2. finish W8G integration/service mutation tenant audit
3. expand W8I adversarial matrix across remaining RPC and service-client mutation surfaces
4. verify password-reset flow preserves tenant context
5. obtain/observe real tenant-specific session binding in production
6. perform W8J controlled second-tenant validation
7. resolve legacy multi-org admin identity safely
8. perform W8K strict tenant enforcement cutover + sign-off
9. resume W6 Marketing + Organic Growth Intelligence
10. begin Privacy Control Plane foundations alongside Behavioral Intelligence expansion
11. build W7 Finance + Reports
12. continue Technical 9–11 / R8–R10
13. productization/commercial phases R11–R14

---

## 20. Update protocol after every major phase/checkpoint

Every major checkpoint must update this document with:

- date
- milestone ID/name
- what was actually completed
- migrations/PRs/commits when relevant
- verification performed
- regressions or known warnings
- phase percentage
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
- production changes must be validated
- build/typecheck/deployment status before merge when applicable
- no secrets in logs, commits, chat or docs
- prefer adoption/migration over destructive replacement
- no second tenant onboarding before isolation is sufficiently validated
- external blockers must be labeled external
- do not invent successful tests
- do not enable strict session enforcement prematurely
- use rollback-only SQL for destructive/adversarial production regressions when possible

---

## 22. Related canonical roadmap document

See also:

`docs/SalsysOS_Behavioral_Intelligence_Privacy_Control_Plane_Roadmap.md`

That document contains the deeper Behavioral Intelligence + Privacy Control Plane extension. This file remains the top-level North Star and current progress source of truth.

---

## 23. Rule for future sessions

Before substantial SalsysOS work, read this file first when current context is incomplete or uncertain.

When a milestone changes the product, architecture, roadmap, scope, progress, blockers, or next action, update this file in the same development cycle.

This document is deliberately durable so loss of chat/session context does not mean loss of project direction.
