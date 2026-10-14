# SalsysOS North Star Product Context

**Status:** Canonical product/context/progress source of truth  
**Last updated:** 2026-10-14  
**Repository:** `yogakulamacademy/salsys-os`

> Read this file first when SalsysOS context is incomplete. Update it after every meaningful checkpoint so product direction, verified progress, blockers, and next actions survive loss of chat/session context.

---

## 1. North Star

SalsysOS = **Sales + Analysis Operating System**. It is a **Customer Journey Intelligence + Revenue Intelligence operating system**, not a generic CRM.

Core question:

> **What is this person likely to do next, why, and what should we do right now to increase the probability of conversion?**

First vertical: Yoga / Education / Wellness. Tenant #1: Yogakulam Academy. Second planned vertical: Real Estate.

Core loop:

`marketing spend → traffic → source/campaign/content → anonymous behavior → identity resolution → lead → conversation → intent/objection/product affinity → salesperson → follow-up → payment/enrollment → revenue → attribution → conversion feedback → learning → recommendation`

Principles: raw events separate from CRM rows; deterministic identity where possible; observed vs inferred separation; revenue-linked analytics; data quality before intelligence; hard tenancy; privacy-by-design; auditable AI workflows; safe migration over destructive replacement.

Behavioral scoring direction: `Frequency × Recency × Depth × Commercial Intent`.

---

## 2. Workspace program — fixed meanings

| Workspace | Weight | Status |
|---|---:|---|
| W1 Architecture / Audit | 10% | COMPLETE |
| W2 RBAC | 15% | COMPLETE |
| W3 Shell / Header / Workspace Navigation | 15% | COMPLETE |
| W4 Employee Accounts | 15% | COMPLETE |
| W5 Sales Workspace | 12% | ~98–99% |
| W6 Marketing Workspace | 12% | Foundation exists; formal expansion pending |
| W7 Finance + Reports | 11% | Pending formal build |
| W8 Admin + Security / QA | 10% | Active, ~96% |

Do not repurpose W1–W8. Current execution order:

`W8 tenant/security → W6 → W7 → remaining W8 closeout`

W5A Manager authorization COMPLETE. W5B Lead/commercial authorization COMPLETE. W5C effectively complete at DB/security level; final app smoke remains.

W6 includes Campaigns, Paid Media, Google Ads, Meta Ads, GA4, Search Console, SEO, Tracking, attribution, plus OG1 Website Intelligence, OG2 Opportunity Engine, OG3 Keyword/SERP, OG4 Content, OG5 Revenue-Aware Organic, OG6 AEO, OG7 GEO/AI Visibility, OG8 Experimentation/Learning, OG9 Human-Approved Autonomous Optimization.

W7 includes payments, revenue, finance, operational/executive reporting, and tenant/role-scoped business reporting.

---

## 3. W8 Admin + Security / QA

Fixed phases:

- W8A Tenant identity contract + current membership audit
- W8B Tenant-specific login entry
- W8C Authentication → tenant binding
- W8D Remove organization chooser / switching API / UI
- W8E Central trusted tenant resolver
- W8F DB / RLS / RPC tenant-isolation audit
- W8G Integrations + webhooks tenant binding
- W8H Tenant team-administration isolation
- W8I Cross-tenant adversarial regression
- W8J Controlled second-tenant staging test
- W8K Production cutover + security sign-off

### Verified W8 state

- tenant-specific login implemented; normal organization switching removed
- trusted current-tenant resolver, session binding and slug binding implemented
- single-active-membership guard protects future normal users
- CRM settings and Team & Access tenant-scoped
- `can_mutate_organization(...)` is the transitional authenticated write boundary
- organization-scoped CRM/course/enrollment/payment/identity/touchpoint/web-session writes require tenant-bound mutation/admin gates
- mutation-policy audit found zero organization-scoped mutations outside approved tenant-bound gates
- `is_organization_member(...)` now always requires the authenticated caller's trusted current tenant to equal the requested organization, independent of the global strict rollout flag; service-role remains explicitly trusted
- sole-active-membership users retain safe fallback behavior through `current_tenant_organization_id()` even without a persisted binding
- this membership change hardens the broad RLS read surface that depends on `is_organization_member`, including organizations, memberships, workspaces, courses/batches, analytics tables, persons/sessions, web sessions, settings, and other tenant-scoped reads
- pre-fix adversarial proof: legacy multi-org identity bound to SalsysOS could still read 16 Yogakulam courses because strict mode was off
- post-fix: the same bound session sees 0 Yogakulam courses, foreign membership=false, and 0 foreign organization-membership/workspace/web-session/person rows
- single-org Yogakulam viewer fallback still resolves Yogakulam and can read the expected 16 course rows, confirming compatibility
- cross-tenant viewer, organization-management, integration credential, course mutation, team/reporting, CRM settings, Sales RPC, OAuth-state, lead-contact, settings-mutation, messaging, and WhatsApp attachment regressions exercised
- Google/Meta/Instagram OAuth callback entry is guarded by current-tenant OAuth-state verification before route-level service-role access
- WhatsApp Embedded Signup revalidates the current tenant before state consumption/mutation
- `attach_whatsapp_outbound_message_id(...)` requires `can_mutate_organization(lead.organization_id)`
- analytics sync service paths remain operator/cron-secret protected and explicitly tenant-scoped
- password recovery is tenant-bound and fails closed until production origin configuration exists
- independent GitHub Actions validates typecheck/build

### Production rollout state — last verified 2026-10-14

- global strict session-tenant enforcement: **OFF**
- persisted `tenant_session_bindings`: **0**
- active Auth sessions: **0**
- active single-org sessions: **0**
- active multi-org sessions: **0**

The global strict flag remains OFF until one genuine tenant-specific production session binding is observed and validated. However, authenticated organization membership/read authorization is now independently session-bound, substantially reducing transitional exposure while rollout remains incomplete.

### Remaining W8 blockers

1. obtain/observe a genuine tenant-specific persisted production session binding through a real login
2. safely resolve the legacy admin identity that still has active memberships in three organizations
3. finish classification of remaining authenticated-executable SECURITY DEFINER functions; many are intentional top-level app/policy helpers
4. finish final W8G service-client/runtime validation
5. complete remaining W8I adversarial matrix
6. configure `SALSYSOS_APP_URL` + Supabase Auth redirect allow-list and run password-recovery E2E
7. W8J controlled second-tenant login test
8. W8K strict-enforcement cutover/sign-off
9. enable Supabase leaked-password protection when Auth configuration access is available

Known advisor posture: 20 `rls_enabled_no_policy` INFO findings are service/backend tables without direct anon/auth access; do not add dummy policies just to silence them. Authenticated SECURITY DEFINER findings require classification, not blanket revocation.

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

Phases 1–3 have substantial foundations; 4–8 have strong/material foundations with operational depth remaining; 9 partial; 10 mostly pending; 11 early. Approximately 8/11 are materially built, not fully complete.

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

Legacy exception: one admin identity still belongs to SalsysOS, Test Yoga School, and Yogakulam Academy. This remains a W8J/W8K migration blocker.

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
- `20261014114745_session_bound_whatsapp_outbound_attach`
- `20261014115501_session_bound_organization_membership_reads`

---

## 10. Current progress snapshot — 2026-10-14

| Meter | Current estimate |
|---|---:|
| W1–W8 workspace program | ~81–82% |
| W5 Sales Workspace | ~98–99% |
| W8 Admin/Security/QA | ~96% |
| W8G Integrations/Webhooks | ~99% |
| Technical platform | ~80–81% |
| Behavioral Intelligence | ~35–40% |
| Privacy & Compliance Control Plane | ~15–20% |
| First commercial-ready multi-tenant product | ~71–72% |
| Full expanded SalsysOS platform scope | ~65–66% |
| Wider R0–R14 commercial roadmap | ~52–53% |

Planning estimates only; new approved scope can change the denominator.

---

## 11. Current milestone

### Milestone M-2026-10-14-K — Session-bound organization membership/read isolation

Completed/verified in production database:

- PR #23 passed typecheck/build and merged to `main` as `2031d681ad6f79a3ed9ca3191231515bf6505656`, source-syncing the WhatsApp outbound attachment tenant-boundary fix
- expanded follow-up/stage regression: foreign complete-followup and set-stage calls were blocked; a completed-task snooze test was initially inconclusive because task state validation occurred first, then a rollback-only temporary open-state test confirmed foreign snooze is blocked by authorization
- audited SELECT policies using `is_organization_member(...)` and found a broad transitional read-isolation weakness: while the global strict flag was OFF, a legacy multi-org identity could satisfy membership for every historical tenant
- direct pre-fix proof: a fake session bound to SalsysOS could still read **16 Yogakulam course rows**, and `is_organization_member(Yogakulam)` returned true
- production migration `20261014115501_session_bound_organization_membership_reads` makes authenticated `is_organization_member(...)` require `session_is_bound_to_organization(...)` plus active membership, while preserving service-role access
- post-fix: the same SalsysOS-bound legacy session sees 0 Yogakulam courses and foreign membership=false
- additional post-fix checks show 0 foreign Yogakulam organization-membership, workspace, web-session, and person rows
- compatibility check: the genuine single-org Yogakulam viewer resolves Yogakulam via sole-active-membership fallback, `is_organization_member(Yogakulam)=true`, and still sees the expected 16 Yogakulam course rows
- all adversarial changes were rollback-only; no fake binding or test data persisted

This is a major W8F improvement because a large family of RLS SELECT policies now receives tenant-bound membership semantics even while global strict rollout remains OFF.

### Prior milestone M-J — Sales/WhatsApp cross-tenant adversarial expansion

- `20261014114745_session_bound_whatsapp_outbound_attach` replaces membership-only WhatsApp attachment authorization with `can_mutate_organization(...)`
- pre-fix foreign message lookup was reachable; post-fix foreign attachment is rejected at authorization
- secure lead contact, CRM settings mutation, follow-up creation, contact logging, lead updates, interaction logging, stage changes and owner assignment have been adversarially exercised against foreign tenant data

### Prior milestone M-I — OAuth callback current-tenant enforcement

- `20261014113720_oauth_state_current_tenant_guard`
- Google/Meta/Instagram callbacks are current-tenant guarded before service-role callback mutation
- PR #22 merged as `28439ab97534da3e2fc7c831a4034a85edfc5391`

Prior M-H through M-A remain recorded in repository history and merged PRs.

---

## 12. Immediate next execution order

1. CI + merge the session-bound organization membership/read migration source-sync
2. re-audit the remaining SELECT/RPC paths after the central membership change and classify remaining SECURITY DEFINER warnings
3. finish final W8G service-client/runtime validation
4. complete remaining W8I adversarial messaging/settings/reporting/integration cases
5. obtain a real tenant-specific login and observe a persisted session binding
6. configure recovery origin/redirect allow-list and run password-recovery E2E
7. W8J controlled second-tenant validation
8. resolve legacy multi-org admin identity safely
9. W8K strict tenant enforcement cutover/sign-off
10. resume W6 Marketing/Organic Growth Intelligence, Privacy foundations, W7 Finance/Reports, Technical 9–11, and R8–R14

---

## 13. Update + engineering protocol

Every meaningful checkpoint records date, milestone, actual changes, migrations/PRs/commits, verification, warnings/failures, progress meters, blockers, and exact next action. Do not claim 99%/100% without scope and verification.

Verify before modifying; preserve unrelated work; validate build/typecheck before merging runtime changes; separate external blockers from code failures; never expose secrets; do not invent tests; do not enable global strict tenant enforcement prematurely; use rollback-only production adversarial tests when possible; service-role mutations require trusted tenant binding; client-supplied tenant IDs are never authority.

---

## 14. Related roadmap

`docs/SalsysOS_Behavioral_Intelligence_Privacy_Control_Plane_Roadmap.md`

This file remains the top-level North Star/current progress source of truth and must be updated whenever product, architecture, roadmap, verified progress, blockers, or next actions materially change.
