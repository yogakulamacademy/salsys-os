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

The CRM is the team interface; the event/journey/intelligence system is the brain. Key principles: separate raw events from CRM rows, deterministic identity where possible, observed vs inferred separation, revenue-linked analytics, data quality before intelligence, hard tenancy, privacy-by-design, auditable AI workflows, and safe migration over destructive replacement.

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
| W8 Admin Workspace + Security / QA | 10% | Active, ~94% |

Do not repurpose these labels. Current execution order:

`W8 tenant/security → W6 → W7 → remaining W8 closeout`

W5A Manager authorization and W5B Lead/commercial authorization are complete. W5C is effectively complete at DB/security level; final app smoke remains.

W6 covers Campaigns, Paid Media, Google Ads, Meta Ads, GA4, Search Console, SEO, Tracking, attribution, plus OG1 Website Intelligence, OG2 Opportunity Engine, OG3 Keyword/SERP, OG4 Content, OG5 Revenue-Aware Organic, OG6 AEO, OG7 GEO/AI Visibility, OG8 Experimentation/Learning, OG9 Human-Approved Autonomous Optimization.

W7 covers payments, revenue, finance, operational/executive reporting, and tenant/role-scoped business reporting.

---

## 3. W8 Admin + Security / QA

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

### Verified W8 state

- tenant-specific login implemented; normal organization switching removed
- trusted current-tenant resolver, session binding, slug binding, and future single-active-membership guard implemented
- CRM settings and Team & Access tenant-scoped
- organization-scoped CRM/course/enrollment/payment/identity/touchpoint/web-session writes require tenant-bound mutation/admin gates
- `can_mutate_organization(...)` is the transitional write boundary
- mutation-policy audit found zero organization-scoped mutation policies outside approved gates
- cross-tenant viewer, organization-management, integration credential, course mutation, team/reporting, CRM settings, Sales RPC, and OAuth-state regressions exercised
- legacy multi-org session cannot rebind one authenticated session to another tenant
- latent accommodation/course RPC exposure and unused/internal helper exposure reduced
- authenticated-executable SECURITY DEFINER advisor count reduced **67 → 53 → 48 → 44 → 41 → 40**, then intentionally returned to **41** because the new tenant-bound OAuth-state validator is an authenticated SECURITY DEFINER policy endpoint required by middleware
- `has_workspace_access(uuid,text)` is internal/service-only after dependency + repository audit showed no direct app or policy consumer; all DB callers are SECURITY DEFINER
- rollback-only regression after that revoke confirmed bound team snapshot and bound `create_crm_lead` still work while foreign team snapshot remains blocked
- Google, Meta, and Instagram integration connect flows derive tenant only from trusted session context
- Google/Meta/Instagram OAuth callback entry is now guarded in middleware by current-tenant OAuth-state verification before route-level service-role access
- WhatsApp Embedded Signup already re-resolves current tenant and requires it to equal OAuth-state tenant before state consumption/mutation
- GA4/GSC health tenant-scoped; Meta diagnostics operator/service protected
- analytics sync service paths remain operator/cron-secret protected and carry explicit organization IDs into tenant-scoped writes
- tenant-bound password recovery merged and production origin fails closed until configured
- independent GitHub Actions validates typecheck/build

### Current production rollout state — last verified 2026-10-14

- strict session-tenant enforcement: **OFF**
- persisted `tenant_session_bindings`: **0**
- active Auth sessions: **0**
- active single-org sessions: **0**
- active multi-org sessions: **0**

There is therefore no genuine live tenant-specific session available yet to validate persisted binding. Do **not** enable strict enforcement until one is observed and tested.

### W8 remaining blockers

1. obtain/observe a genuine tenant-specific persisted production session binding through a real login
2. safely resolve the legacy admin identity that still has three active organization memberships
3. continue W8F classification of the remaining 41 authenticated-executable SECURITY DEFINER functions; the new OAuth-state guard is intentional and many others are top-level app or direct policy helpers
4. finish the final W8G service-client/runtime validation pass
5. complete W8I remaining adversarial matrix
6. configure `SALSYSOS_APP_URL` + Supabase Auth redirect allow-list and perform real password-recovery E2E
7. W8J controlled second-tenant login test
8. W8K strict-enforcement cutover/sign-off
9. enable Supabase leaked-password protection when Auth configuration access is available

The 20 `rls_enabled_no_policy` advisor INFO findings are known service/backend tables without direct anon/auth access; do not add dummy policies only to silence the advisor.

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

Phases 1–3 have substantial foundations; 4–8 have strong/material foundations with operational depth remaining; 9 partial; 10 mostly pending; 11 early. Approximately **8/11 are materially built**, not fully complete.

---

## 5. Commercial roadmap — fixed R0–R14

R0 Platform Rebrand; R1 Foundation/Tenancy/Security; R2 Lead Capture/Identity/Raw Events/Data Quality; R3 CRM Sales Execution; R4 Customer Journey/360; R5 Attribution/Funnel/Revenue; R6 Intent/Product Affinity/Sales Intelligence; R7 Integrations/Conversion Feedback; R8 Content+SEO; R9 AEO/GEO/AI Visibility; R10 Predictive Intelligence + Owner Command Center; R11 Wellness/Education Productization; R12 Realty; R13 Commercial SaaS Readiness; R14 Marketing + First 100 Customers.

Current interpretation: R0 largely done; R1 nearing completion; R2 strong; R3 nearly complete; R4–R6 strong foundations; R7 in progress; R8 partial; R9 pending; R10 early; R11–R14 pending.

---

## 6. Behavioral Intelligence

BI-1 taxonomy; BI-2 pre-lead timeline; BI-3 post-lead timeline; BI-4 Intent Score v1; BI-5 trend/reactivation; BI-6 segments; BI-7 content/revenue influence; BI-8 sales influence; BI-9 predictive scoring; BI-10 next-best-action.

**Current estimate: ~35–40% foundation.**

---

## 7. Privacy & Compliance Control Plane

Product posture: **privacy-by-design infrastructure with configurable controls supporting applicable privacy frameworks**, not universal legal-compliance claims.

PC-1 Consent Ledger v2; PC-2 Purpose Registry; PC-3 jurisdiction/policy; PC-4 event policy metadata; PC-5 identity-stitching policy; PC-6 identity vault/PII separation; PC-7 retention; PC-8 rights orchestration; PC-9 vendor/processor registry; PC-10 lineage; PC-11 profiling controls; PC-12 compliance audit/reporting.

Consent is purpose-specific, not one boolean. Behavioral/profile processing must be permission-aware.

**Current estimate: ~15–20% foundation.**

---

## 8. Multi-tenant identity contract

- 1 organization = 1 tenant = isolated data boundary
- login session resolves to exactly one trusted tenant
- no normal organization selector/switcher
- tenant login route `/login/<organization-slug>`
- active membership in requested tenant required
- browser/client organization IDs are never sufficient authority
- platform admin separate from tenant admin
- changed URL IDs/payloads/RPC args/API calls must not expose another tenant

Legacy exception: one admin identity belongs to SalsysOS, Test Yoga School, and Yogakulam Academy. This remains a W8J/W8K migration blocker.

---

## 9. Recent production security migrations

Key current sequence:

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
- `20261014105425_internal_authorization_helper_execute_hardening` — duplicate idempotent retry preserved for source parity
- `20261014110215_session_bound_crm_settings_reads`
- `20261014110702_internal_workspace_access_helper_execute_hardening`
- `20261014113720_oauth_state_current_tenant_guard`

---

## 10. Current progress snapshot — 2026-10-14

| Meter | Current estimate |
|---|---:|
| W1–W8 workspace program | ~80–81% |
| W5 Sales Workspace | ~98–99% |
| W8 Admin/Security/QA | ~94% |
| W8G Integrations/Webhooks | ~99% |
| Technical platform | ~80% |
| Behavioral Intelligence | ~35–40% |
| Privacy & Compliance Control Plane | ~15–20% |
| First commercial-ready multi-tenant product | ~70% |
| Full expanded SalsysOS platform scope | ~65% |
| Wider R0–R14 commercial roadmap | ~52% |

Planning estimates only; new approved scope can change the denominator.

---

## 11. Current milestone

### Milestone M-2026-10-14-I — OAuth callback current-tenant enforcement

Completed/verified in production database:

- audited service-role integration mutation surfaces across Account Integrations plus GA4, GSC, Google Ads, Meta Ads, Google OAuth, Meta OAuth, Instagram OAuth, and WhatsApp Embedded Signup
- confirmed interactive integration setup derives tenant from trusted authenticated workspace context and service-role mutations are scoped back to the resolved organization
- identified a transition-only gap in Google/Meta/Instagram callback flows: a legacy identity with multiple memberships could possess an OAuth state for a non-current organization while global strict enforcement is OFF
- production migration `20261014113720_oauth_state_current_tenant_guard` adds `oauth_state_matches_current_tenant(provider,state)`, requiring the state to belong to the current trusted tenant, current user, provider, be unused, and unexpired
- middleware now checks that guard for Google, Meta, and Instagram OAuth callbacks before callback routes can reach their service-role clients
- WhatsApp Embedded Signup already had equivalent route-level revalidation and is unchanged
- rollback-only adversarial regression bound the legacy test session to SalsysOS: SalsysOS OAuth state returned true, Yogakulam OAuth state returned false
- rollback cleanup verified zero fake OAuth states and zero fake tenant-session bindings persisted
- security advisor recheck shows **41** authenticated-executable SECURITY DEFINER functions: the increase from 40 is intentional because `oauth_state_matches_current_tenant` is a signed-in policy endpoint used by middleware; the remaining set continues to require classification rather than blanket revocation
- 20 `rls_enabled_no_policy` INFO findings remain unchanged and are known service/backend tables; leaked-password protection remains an external Auth configuration warning

Pending before this milestone is fully merged:

- GitHub CI typecheck/build for the middleware change
- PR merge into `main`

### Prior milestone M-H — Workspace access helper surface reduction

- `has_workspace_access(uuid,text)` direct authenticated exposure removed after repository/database dependency review
- bound team snapshot and `create_crm_lead` continued working; foreign team snapshot remained blocked
- advisor count reduced 41 → 40 before the intentional OAuth-policy endpoint was introduced

### Prior milestone M-G — Internal helper + CRM settings read isolation

- internal authorization helper exposure reduced 44 → 41
- adversarial testing discovered and fixed foreign CRM settings reads for a bound legacy multi-org identity while strict mode is OFF
- `20261014110215_session_bound_crm_settings_reads` requires bound tenant + membership for settings reads
- foreign stage settings blocked; foreign audit hidden; bound settings allowed

Prior M-F through M-A remain recorded in repository history and merged PRs.

---

## 12. Immediate next execution order

1. run GitHub CI and merge OAuth callback current-tenant guard
2. finish final W8G service-client/runtime validation pass
3. continue W8F remaining 41 SECURITY DEFINER classifications without revoking required top-level or policy helpers
4. expand W8I remaining Sales/settings/reporting/integration adversarial tests
5. obtain a real tenant-specific login and observe persisted session binding
6. configure recovery origin/redirect allow-list and run password-recovery E2E
7. W8J controlled second-tenant validation
8. resolve legacy multi-org admin identity safely
9. W8K strict tenant enforcement cutover/sign-off
10. resume W6 Marketing/Organic Growth Intelligence, Privacy foundations, W7 Finance/Reports, Technical 9–11, and R8–R14

---

## 13. Update + engineering protocol

Every meaningful checkpoint records date, milestone, actual changes, migrations/PRs/commits, verification, warnings/failures, progress meters, blockers, and exact next action. Do not claim 99%/100% without scope and verification.

Verify before modifying; preserve unrelated work; validate build/typecheck before merging runtime changes; separate external blockers from code failures; never expose secrets; do not invent tests; do not enable strict tenant enforcement prematurely; use rollback-only production adversarial tests when possible; service-role mutations require trusted tenant binding; client-supplied tenant IDs are never authority.

---

## 14. Related roadmap

`docs/SalsysOS_Behavioral_Intelligence_Privacy_Control_Plane_Roadmap.md`

This file remains the top-level North Star/current progress source of truth and must be updated whenever product, architecture, roadmap, verified progress, blockers, or next actions materially change.
