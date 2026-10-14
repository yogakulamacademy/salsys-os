# SalsysOS North Star Product Context

**Status:** Canonical product/context/progress source of truth  
**Last updated:** 2026-10-14  
**Repository:** `yogakulamacademy/salsys-os`

> Read this file first when SalsysOS context is incomplete. Update it after every meaningful checkpoint so product direction, verified progress, blockers, and next actions survive loss of chat/session context.

---

## 1. North Star

SalsysOS means **Sales + Analysis Operating System**. It is a **Customer Journey Intelligence + Revenue Intelligence operating system**, not a generic CRM.

Core question:

> **What is this person likely to do next, why, and what should we do right now to increase the probability of conversion?**

First vertical: **Yoga / Education / Wellness**, with Yogakulam Academy as tenant #1. Second planned vertical: **Real Estate**.

Core loop:

`marketing spend → traffic → source/campaign/content → anonymous behavior → identity resolution → lead → conversation → intent/objection/product affinity → salesperson → follow-up → payment/enrollment → revenue → attribution → conversion feedback → learning → recommendation`

The CRM is the team interface; the event/journey/intelligence system is the brain.

Principles: raw events separate from CRM rows; deterministic identity where possible; observed vs inferred data kept distinct; revenue connected to acquisition/behavior; data quality before analytics trust; hard tenancy; privacy-by-design; auditable AI workflows; adoption/migration over destructive replacement.

Behavioral scoring direction: `Frequency × Recency × Depth × Commercial Intent`.

---

## 2. Workspace program — fixed meanings

| Workspace Phase | Weight | Status |
|---|---:|---|
| W1 Architecture / Audit | 10% | COMPLETE |
| W2 RBAC | 15% | COMPLETE |
| W3 Shell / Header / Workspace Navigation | 15% | COMPLETE |
| W4 Employee Accounts | 15% | COMPLETE |
| W5 Sales Workspace | 12% | ~98–99% |
| W6 Marketing Workspace | 12% | Foundation exists; formal expansion pending |
| W7 Finance + Reports Workspaces | 11% | Pending formal build |
| W8 Admin Workspace + Security / QA | 10% | Active, ~92–93% |

Do not repurpose these labels. Current execution order is:

`W8 tenant/security → W6 → W7 → remaining W8 closeout`

W5A Manager authorization and W5B Lead/commercial authorization are complete. W5C Sales workflow hardening is effectively complete at DB/security level; final app smoke remains.

W6 includes Campaigns, Paid Media, Google Ads, Meta Ads, GA4, Search Console, SEO, Tracking, attribution, plus W6-OG1 Website Intelligence, OG2 Opportunity Engine, OG3 Keyword/SERP, OG4 Content, OG5 Revenue-Aware Organic Intelligence, OG6 AEO, OG7 GEO/AI Visibility, OG8 Experimentation/Learning, OG9 Human-Approved Autonomous Optimization.

W7 includes revenue, payments, finance views, operational/executive reporting, and tenant/role-scoped management reporting.

---

## 3. W8 Admin + Security / QA — fixed phases

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

### Verified W8 state

- tenant-specific login implemented; normal organization switching removed
- trusted current-tenant resolver, session binding, slug binding, and future single-active-membership guard implemented
- CRM settings and Team & Access tenant-scoped
- organization-scoped CRM/course/enrollment/payment/identity/touchpoint/web-session writes require tenant-bound mutation/admin gates
- `can_mutate_organization(...)` is the transitional write boundary
- mutation-policy audit found zero organization-scoped mutation policies outside approved gates
- cross-tenant viewer, organization-management, integration credential, course mutation, team/reporting, and settings regressions have been exercised
- legacy multi-org authenticated session cannot rebind to a second tenant
- latent accommodation/course RPC exposure and unused/internal helper exposure reduced
- authenticated-executable SECURITY DEFINER advisor count reduced **67 → 53 → 48 → 44 → 41** without widening table privileges
- GA4/GSC health routes tenant-scoped; WhatsApp Embedded Signup revalidates tenant; Meta Ads diagnostics operator/service protected
- tenant-bound password recovery merged and fails closed for production origin until explicitly configured
- GitHub Actions independently validates typecheck/build

### Current production rollout state — last verified 2026-10-14

- strict session-tenant enforcement: **OFF**
- persisted `tenant_session_bindings`: **0**
- active multi-organization sessions: **1**
- bound multi-organization sessions: **0**

Do **not** enable strict enforcement until a genuine tenant-specific production session binding is observed and validated.

### W8 remaining blockers

1. observe a genuine tenant-specific persisted production session binding
2. safely resolve one legacy admin identity with active memberships in three organizations
3. continue W8F classification of the remaining 41 authenticated-executable SECURITY DEFINER functions; many are intentionally top-level app or policy helpers
4. finish W8G remaining direct service-client mutation review
5. complete W8I remaining adversarial matrix
6. configure production `SALSYSOS_APP_URL` + Supabase Auth redirect allow-list and perform real password-recovery E2E
7. W8J controlled second-tenant login test
8. W8K strict-enforcement cutover and sign-off
9. Supabase leaked-password protection remains external/configuration work

The 20 `rls_enabled_no_policy` advisor INFO findings are known service/backend tables without direct anon/auth access; do not add dummy policies merely to silence the advisor.

---

## 4. Technical roadmap — fixed 11 phases

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

Phases 1–3 have substantial foundations; 4–8 have strong/material foundations with operational depth remaining; 9 is partial; 10 mostly pending; 11 early. Approximately **8/11 phases are materially built**, not fully complete.

---

## 5. Commercial roadmap — fixed R0–R14

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

R0 largely done; R1 nearing completion; R2 strong; R3 nearly complete; R4–R6 strong foundations; R7 in progress; R8 partial; R9 pending; R10 early/partial; R11–R14 pending.

---

## 6. Behavioral Intelligence workstream

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

**Current estimate: ~35–40% foundation.**

---

## 7. Privacy & Compliance Control Plane

Product posture: **privacy-by-design infrastructure with configurable controls supporting applicable privacy frameworks**, not a claim of universal legal compliance.

- PC-1 Consent Ledger v2
- PC-2 Purpose Registry
- PC-3 Jurisdiction/policy decision layer
- PC-4 Event policy metadata
- PC-5 Identity-stitching policy
- PC-6 Identity Vault / PII separation
- PC-7 Retention Engine
- PC-8 Rights Orchestrator
- PC-9 Vendor / Processor Registry
- PC-10 Data Lineage
- PC-11 Profiling / automated-decision controls
- PC-12 Compliance audit/reporting

Consent is purpose-specific, not one boolean. Behavioral/profile processing must be permission-aware.

**Current estimate: ~15–20% foundation.**

---

## 8. Multi-tenant identity contract

- 1 organization = 1 tenant = isolated data boundary
- login session resolves to exactly one trusted tenant
- no normal organization selector/switcher
- tenant-specific login route `/login/<organization-slug>`
- auth verifies active membership in requested tenant; no membership → deny
- browser/client organization IDs are never sufficient authority
- platform admin is separate from tenant admin
- changing URL IDs, payloads, RPC args, or API calls must not expose another tenant

Legacy exception: one admin identity belongs to SalsysOS, Test Yoga School, and Yogakulam Academy. This is a W8J/W8K migration blocker, not target architecture.

---

## 9. Important recent production security migrations

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
- `20261014105425_internal_authorization_helper_execute_hardening` — duplicate idempotent production retry, preserved for exact source parity
- `20261014110215_session_bound_crm_settings_reads`

---

## 10. Current progress snapshot — 2026-10-14

| Meter | Current estimate |
|---|---:|
| W1–W8 workspace program | ~79–80% |
| W5 Sales Workspace | ~98–99% |
| W8 Admin/Security/QA | ~92–93% |
| W8G Integrations/Webhooks | ~98% |
| Technical platform | ~79% |
| Behavioral Intelligence | ~35–40% |
| Privacy & Compliance Control Plane | ~15–20% |
| First commercial-ready multi-tenant product | ~68–70% |
| Full expanded SalsysOS platform scope | ~63–65% |
| Wider R0–R14 commercial roadmap | ~51–52% |

These are planning estimates. Adding approved scope may change the denominator without undoing completed work.

---

## 11. Current milestone

### Milestone M-2026-10-14-G — Internal helper + CRM settings read isolation

Completed:

- production migrations `20261014105133_internal_authorization_helper_execute_hardening` and duplicate idempotent retry `20261014105425_internal_authorization_helper_execute_hardening`
- direct authenticated EXECUTE removed from internal helpers `can_manage_sales_workspace(uuid)`, `workspace_role(uuid,text)`, and `session_is_bound_to_organization(uuid)`; service/internal call chains preserved
- advisor SECURITY DEFINER count reduced **44 → 41**
- rollback-only authenticated regression proved `create_crm_lead(...)` and `assign_lead_owner(...)` still work through internal helper chains; rollback left persisted bindings=0, test leads=0, sample owner unchanged
- `has_lead_telephone_contact` and `current_tenant_organization_id` were classified as still required by active invoker/wrapper call chains and were **not** revoked blindly
- adversarial bound-session tests confirmed foreign `get_team_performance_snapshot` and `get_team_assignment_fairness_snapshot` calls are blocked
- adversarial testing found a real transitional isolation gap: while strict mode is OFF, `get_crm_stage_settings_v2(foreign_org)` could return settings to the legacy multi-org identity because it checked membership but not the bound tenant session
- production migration `20261014110215_session_bound_crm_settings_reads` fixed both `get_crm_stage_settings_v2` and `get_crm_settings_audit_v2` so authenticated reads require the requested organization to match the active tenant session plus active membership
- post-fix regression: bound-tenant stage settings allowed, foreign stage settings blocked with `Not authorized for organization`, foreign settings audit returns zero rows
- strict tenant enforcement remains OFF; no production test rows or persistent fake bindings were left behind

Prior milestones: M-F independent CI + analytics/auth hardening; M-E integration callback/diagnostics + unused RPC reduction; M-D settings/helper hardening; M-C latent RPC reduction; M-B tenant mutation boundary; M-A tenant-bound administration.

---

## 12. Immediate next execution order

1. finish PR/source merge for milestone G and validate with GitHub CI
2. continue W8F classification of the remaining 41 SECURITY DEFINER functions without revoking active policy/top-level RPCs
3. finish W8G direct service-client mutation review
4. expand W8I adversarial matrix across remaining Sales/settings/reporting/integration surfaces
5. configure production recovery origin + Supabase redirect allow-list when hosting/Auth configuration access is available
6. perform real password-recovery E2E
7. obtain/observe genuine persisted tenant-specific production session binding
8. W8J controlled second-tenant validation
9. safely resolve legacy multi-org admin identity
10. W8K strict tenant enforcement cutover + sign-off
11. resume W6 Marketing + Organic Growth Intelligence
12. begin Privacy Control Plane foundations alongside Behavioral Intelligence expansion
13. build W7 Finance + Reports
14. continue Technical 9–11 / R8–R10 and commercial R11–R14

---

## 13. Update protocol

Every meaningful checkpoint must record date, milestone, completed work, migrations/PRs/commits, verification, warnings/failures, W1–W8, Technical 1–11, R0–R14, Behavioral Intelligence, Privacy/Compliance, commercial readiness, blockers, and exact next checkpoint. Do not claim 99% or 100% without defining scope and verifying it.

---

## 14. Engineering rules

- one checkpoint at a time
- verify before modifying
- preserve unrelated work
- validate build/typecheck/deployment before merging runtime code when applicable
- distinguish external blockers from code failures
- no secrets in logs, commits, chat, or docs
- prefer adoption/migration over destructive replacement
- no second customer tenant before isolation validation
- do not invent successful tests
- do not enable strict session enforcement prematurely
- use rollback-only SQL for adversarial production regressions where possible
- service-role paths require explicit trusted tenant binding before tenant-scoped mutation
- tenant IDs supplied by browser/client are never sufficient authority

---

## 15. Related canonical roadmap

`docs/SalsysOS_Behavioral_Intelligence_Privacy_Control_Plane_Roadmap.md`

This file remains the top-level North Star and current progress source of truth.

---

## 16. Future-session rule

Before substantial SalsysOS work, read this file first when context is incomplete. Update it in the same development cycle whenever product, architecture, roadmap, verified progress, blockers, or next actions materially change.
