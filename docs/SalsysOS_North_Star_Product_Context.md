# SalsysOS North Star Product Context

**Status:** Canonical product/context/progress source of truth  
**Last updated:** 2026-10-14  
**Repository:** `yogakulamacademy/salsys-os`

> Read this file first when SalsysOS context is incomplete or uncertain. Update it after every meaningful phase/checkpoint so product direction, progress, blockers, validation state, and next actions survive loss of chat/session context.

---

## 1. North Star

SalsysOS means **Sales + Analysis Operating System**. It is not a generic CRM. The North Star is a **Customer Journey Intelligence + Revenue Intelligence operating system** connecting marketing, visitor behavior, identity, CRM activity, sales execution, payments, attribution, content performance, privacy/compliance controls, and predictive recommendations into one closed loop.

The product should eventually answer:

> **What is this person likely to do next, why, and what should we do right now to increase the probability of conversion?**

The first vertical is **Yoga / Education / Wellness**, with Yogakulam Academy as tenant #1. The second planned vertical is **Real Estate**.

Core loop:

`marketing spend → traffic → source/campaign/content → anonymous behavior → identity resolution → lead → conversation → intent/objection/product affinity → salesperson → follow-up → payment/enrollment → revenue → attribution → conversion feedback → learning → recommendation`

The CRM is the **team interface**. The event/journey/intelligence system underneath is the **brain**.

---

## 2. Product principles

1. Raw events are separate from CRM operational rows.
2. Identity is deterministic where possible.
3. Observed facts and inferred intelligence remain distinguishable.
4. Customer 360 summarizes the event graph instead of duplicating raw events.
5. Revenue must connect back to acquisition and behavior.
6. Data quality precedes analytics trust.
7. Hard tenancy is mandatory; browser-supplied organization IDs are never authority.
8. Privacy and policy are first-class architecture.
9. AI operates workflows, with auditable and explainable important actions.
10. Prefer adoption/migration over destructive replacement.

Behavioral scoring direction remains:

`Frequency × Recency × Depth × Commercial Intent`

---

## 3. Workspace program — fixed meanings

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
| W8 Admin Workspace + Security / QA | 10% | Active, ~92% |

Planned cumulative checkpoints remain W1 10%, W2 25%, W3 40%, W4 55%, W5 67%, W6 79%, W7 90%, W8 100%.

Current execution exception:

`W8 tenant/security → W6 → W7 → remaining W8 closeout`

### W5

- W5A Manager authorization — COMPLETE
- W5B Lead + commercial authorization — COMPLETE
- W5C Sales workflow hardening — essentially complete at DB/security level; final app smoke remains

### W6 Marketing

Campaigns, Paid Media, Google Ads, Meta Ads, GA4, Search Console, SEO, Tracking, acquisition, attribution, plus:

- W6-OG1 Website Intelligence
- W6-OG2 Opportunity Engine
- W6-OG3 Keyword + SERP Intelligence
- W6-OG4 Content Intelligence
- W6-OG5 Revenue-Aware Organic Intelligence
- W6-OG6 AEO
- W6-OG7 GEO / AI Visibility
- W6-OG8 Experimentation + Learning
- W6-OG9 Human-Approved Autonomous Optimization

### W7 Finance + Reports

Revenue, payments, finance views, management/business reporting, authorization, tenant/role scoping, operational reports, and executive reporting.

---

## 4. W8 Admin + Security / QA

Fixed phases:

- W8A Tenant identity contract + current membership audit
- W8B Tenant-specific login entry
- W8C Authentication → tenant binding
- W8D Remove organization chooser / switching API / switching UI
- W8E Central trusted tenant resolver
- W8F DB / RLS / RPC tenant-isolation audit
- W8G Integrations + webhooks tenant binding
- W8H Tenant team-administration isolation
- W8I Cross-tenant adversarial regression
- W8J Controlled second-tenant staging test
- W8K Production cutover + security sign-off

### W8 current state

- tenant-specific login implemented
- organization switching removed from normal product flow
- trusted current-tenant resolver implemented
- session-binding DB foundation and slug binding implemented
- single-active-membership guard implemented for future normal users
- OAuth active-tenant guard implemented
- CRM settings and Team & Access are tenant-scoped
- cross-tenant viewer, organization-management, credential, and mutation regressions pass
- legacy multi-org session cannot be rebound to a second tenant
- `can_mutate_organization(...)` is the transition-safe write boundary for authenticated tenant mutations
- organization-scoped CRM/course/enrollment/payment/identity/touchpoint/web-session writes require tenant-bound mutation/admin gates
- mutation-policy audit found zero organization-scoped mutation policies outside approved gates
- latent accommodation/course RPC exposure removed where no authenticated app consumer exists
- internal settings/tenant and unused authorization helper exposure reduced
- GA4/GSC health routes resolve/filter to trusted active tenant
- WhatsApp Embedded Signup revalidates tenant before OAuth state consumption/mutation
- Meta Ads diagnostics require operator/service authorization
- tenant-bound password recovery merged; production reset origin fails closed unless explicitly configured
- independent GitHub Actions typecheck/build CI is available
- authenticated-executable SECURITY DEFINER advisor count reduced **67 → 53 → 48 → 44 → 41** without widening table privileges

### Current production rollout state

Last verified 2026-10-14:

- strict session-tenant enforcement: **OFF**
- persisted `tenant_session_bindings`: **0**
- active multi-organization sessions: **1**
- bound multi-organization sessions: **0**

Do **not** enable strict enforcement until a genuine tenant-specific production session binding is observed and validated.

### W8 remaining blockers

1. obtain/observe a genuine tenant-specific persisted production session binding
2. one legacy admin identity still has active memberships in all three organizations
3. continue W8F classification of the remaining 41 authenticated-executable SECURITY DEFINER functions; many are intentionally top-level app or policy helpers
4. finish W8G remaining direct service-client mutation review
5. complete W8I remaining adversarial matrix
6. configure production `SALSYSOS_APP_URL` and Supabase Auth redirect allow-list
7. perform real tenant-specific password-recovery E2E
8. W8J controlled second-tenant login test
9. W8K strict-enforcement cutover and security sign-off
10. Supabase leaked-password protection remains external/configuration work

The 20 `rls_enabled_no_policy` advisor INFO findings are known service/backend tables with direct anon/auth access intentionally absent; do not add dummy policies merely to silence the advisor.

---

## 5. Technical roadmap — fixed 11 phases

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

Current interpretation: Phases 1–3 have substantial foundations; 4–8 have strong/material foundations with operational depth still remaining; 9 is partial; 10 is mostly pending; 11 has early blocks only. Approximately **8/11 phases are materially built**, not fully complete.

---

## 6. Commercial / North-Star roadmap — fixed R0–R14

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

Current interpretation: R0 largely done; R1 nearing completion; R2 strong; R3 nearly complete; R4–R6 strong foundations; R7 in progress; R8 partial; R9 pending; R10 early/partial; R11–R14 pending.

---

## 7. Behavioral Intelligence workstream

This deepens Technical 4, 5, 7, 9, 11 and Commercial R4, R6, R8, R10.

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

## 8. Privacy & Compliance Control Plane

Product posture: **privacy-by-design infrastructure with configurable controls supporting applicable privacy frameworks**, not a claim of universal legal compliance.

Control plane:

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

Consent is purpose-specific, not one boolean. Behavioral/profile processing must become permission-aware.

**Current Privacy & Compliance estimate: ~15–20% foundation.**

---

## 9. Multi-tenant identity contract

- 1 organization = 1 tenant = isolated data boundary
- login session resolves to exactly one trusted tenant
- normal customers do not receive an organization selector/switcher
- tenant-specific login route: `/login/<organization-slug>`
- auth verifies active membership in requested tenant; no membership → deny
- browser/client organization IDs are never sufficient authority
- platform admin is separate from tenant admin
- changed URL IDs, payloads, RPC args, and API calls must not expose another tenant

Legacy exception: one admin identity still belongs to SalsysOS, Test Yoga School, and Yogakulam Academy. This is a migration blocker for W8J/W8K, not target architecture.

---

## 10. Important recent production security migrations

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
- `20261014105133_internal_authorization_helper_execute_hardening`
- `20261014105425_internal_authorization_helper_execute_hardening` — duplicate idempotent production retry; preserved in source history for parity

---

## 11. Current progress snapshot — 2026-10-14

These are planning estimates, not mathematically exact completion figures.

| Meter | Current estimate |
|---|---:|
| W1–W8 workspace program | ~79–80% |
| W5 Sales Workspace | ~98–99% |
| W8 Admin/Security/QA | ~92% |
| W8G Integrations/Webhooks | ~98% |
| Technical platform | ~79% |
| Behavioral Intelligence | ~35–40% |
| Privacy & Compliance Control Plane | ~15–20% |
| First commercial-ready multi-tenant product | ~68–69% |
| Full expanded SalsysOS platform scope | ~63–64% |
| Wider R0–R14 commercial roadmap | ~51–52% |

Adding approved scope can reduce expanded-roadmap percentages without undoing completed work.

---

## 12. Current milestone

### Milestone M-2026-10-14-G — Internal authorization helper surface reduction

Completed:

- production migrations `20261014105133_internal_authorization_helper_execute_hardening` and duplicate idempotent retry `20261014105425_internal_authorization_helper_execute_hardening` applied
- removed direct authenticated EXECUTE from `can_manage_sales_workspace(uuid)`, `workspace_role(uuid,text)`, and `session_is_bound_to_organization(uuid)` after repository/dependency review showed they are internal authorization helpers rather than required top-level app RPCs
- retained service-role execution and internal SECURITY DEFINER call chains
- post-change privilege checks: authenticated=false, anon=false, service_role=true for all three helpers
- security advisor authenticated-executable SECURITY DEFINER count reduced **44 → 41**
- rollback-only authenticated regression bound the fake legacy test session to SalsysOS, successfully exercised `create_crm_lead(...)` and `assign_lead_owner(...)` through the internal helper chain, then rolled back
- post-regression checks confirmed persisted tenant bindings=0, test leads=0, and sample ownership unchanged
- no production test data remained and strict tenant enforcement was not changed
- production migration history contains two identical versions because the idempotent migration application was retried; both are preserved in repository source history for exact parity rather than rewriting production history

### Prior milestone M-2026-10-14-F — Independent CI + analytics/auth tenant hardening

- independent GitHub Actions typecheck/build CI added and passing
- GA4/GSC health routes explicitly tenant-scoped
- tenant-bound password recovery merged and production origin made fail-closed

### Prior hardening milestones

- M-E integration callback + Meta diagnostics hardening and unused RPC reduction
- M-D settings/internal helper hardening
- M-C latent accommodation/course RPC reduction
- M-B session-bound tenant mutation boundary
- M-A tenant-bound administration hardening

---

## 13. Immediate next execution order

1. continue W8F on remaining 41 SECURITY DEFINER functions, beginning with nested helpers such as `has_lead_telephone_contact` and carefully separating policy helpers from top-level app RPCs
2. finish W8G direct service-client mutation review
3. expand W8I adversarial matrix across remaining Sales/settings/team/reporting surfaces
4. configure/verify production recovery origin + Supabase redirect allow-list when hosting/Auth configuration access is available
5. perform password-recovery E2E with a real tenant-specific user
6. obtain/observe genuine tenant-specific persisted production session binding
7. W8J controlled second-tenant validation
8. safely resolve the legacy multi-org admin identity
9. W8K strict tenant enforcement cutover + sign-off
10. resume W6 Marketing + Organic Growth Intelligence
11. begin Privacy Control Plane foundations alongside Behavioral Intelligence expansion
12. build W7 Finance + Reports
13. continue Technical 9–11 / R8–R10
14. productization/commercial R11–R14

---

## 14. Update protocol

Every meaningful checkpoint must update this document with date, milestone, completed work, migrations/PRs/commits, verification, warnings, checkpoint percentage, W1–W8, Technical 1–11, R0–R14, Behavioral Intelligence, Privacy/Compliance, commercial readiness, blockers, and exact next checkpoint.

Do not claim 99% or 100% without defining scope and verifying it. Separate warnings from failures.

---

## 15. Engineering operating rules

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

## 16. Related canonical roadmap

`docs/SalsysOS_Behavioral_Intelligence_Privacy_Control_Plane_Roadmap.md`

This file remains the top-level North Star and current progress source of truth.

---

## 17. Rule for future sessions

Before substantial SalsysOS work, read this file first when current context is incomplete or uncertain. When a milestone changes product, architecture, roadmap, scope, progress, blockers, or next action, update this file in the same development cycle.
