# SalsysOS North Star Product Context

**Status:** Canonical product/context/progress source of truth  
**Last updated:** 2026-10-14  
**Repository:** `yogakulamacademy/salsys-os`

> Read this file first when SalsysOS context is incomplete. Update it after every meaningful checkpoint so product direction, verified progress, blockers, and next actions survive loss of chat/session context.

---

## 1. North Star

SalsysOS = **Sales + Analysis Operating System**: a **Customer Journey Intelligence + Revenue Intelligence operating system**, not a generic CRM.

Core question:

> **What is this person likely to do next, why, and what should we do right now to increase the probability of conversion?**

First vertical: Yoga / Education / Wellness, with Yogakulam Academy as tenant #1. Second planned vertical: Real Estate.

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
| W8 Admin + Security / QA | 10% | Active, ~97% |

Do not repurpose W1–W8. Current execution order:

`W8 tenant/security → W6 → W7 → remaining W8 closeout`

W5A Manager authorization COMPLETE. W5B Lead/commercial authorization COMPLETE. W5C effectively complete at DB/security level; final app smoke remains.

W6 includes Campaigns, Paid Media, Google Ads, Meta Ads, GA4, Search Console, SEO, Tracking, attribution, plus OG1 Website Intelligence, OG2 Opportunity Engine, OG3 Keyword/SERP, OG4 Content, OG5 Revenue-Aware Organic, OG6 AEO, OG7 GEO/AI Visibility, OG8 Experimentation/Learning, OG9 Human-Approved Autonomous Optimization.

W7 includes payments, revenue, finance, operational/executive reporting, and tenant/role-scoped business reporting.

---

## 3. W8 Admin + Security / QA

Fixed phases: W8A tenant identity/audit; W8B tenant login; W8C auth→tenant binding; W8D remove org switching; W8E trusted tenant resolver; W8F DB/RLS/RPC isolation; W8G integrations/webhooks; W8H team admin isolation; W8I adversarial regression; W8J controlled second-tenant staging; W8K production cutover/sign-off.

### Verified W8 state

- tenant-specific login implemented; normal org switching removed
- trusted current-tenant resolver, session binding and slug binding implemented
- single-active-membership guard protects future normal users
- CRM settings and Team & Access tenant-scoped
- `can_mutate_organization(...)` is the transitional authenticated write boundary
- organization-scoped CRM/course/enrollment/payment/identity/touchpoint/web-session mutations require tenant-bound mutation/admin gates
- mutation-policy audit found zero organization-scoped mutations outside approved tenant-bound gates
- authenticated `is_organization_member(...)` now always requires trusted current-tenant match + active membership, independent of global strict rollout; service-role remains trusted
- sole-active-membership users retain safe fallback through `current_tenant_organization_id()` even without a persisted binding
- broad RLS reads using `is_organization_member(...)` are now tenant-bound while strict rollout remains OFF
- four remaining org-scoped SELECT policies that only used `is_crm_user()` were found and fixed: accommodation properties, accommodation rooms, batch accommodation types, course catalog sync runs
- post-fix audit finds no organization-id SELECT policy outside approved tenant/read authorization gates
- `has_workspace_access(...)` is now also explicitly session-bound for authenticated internal callers, rather than relying on the global strict rollout flag; direct authenticated EXECUTE remains revoked
- post-workspace hardening regression: bound `create_crm_lead(...)` and bound team snapshot still work; no rollback-only test lead persisted
- pre-fix read proof: SalsysOS-bound legacy multi-org session could read 16 Yogakulam courses; post-fix sees 0 and foreign membership=false
- additional post-fix counts: 0 foreign membership/workspace/web-session/person rows
- single-org Yogakulam viewer compatibility preserved; expected 16 Yogakulam courses remain visible via sole-membership fallback
- Google/Meta/Instagram OAuth callbacks current-tenant guarded before service-role mutation
- WhatsApp Embedded Signup revalidates current tenant before state consumption/mutation
- `attach_whatsapp_outbound_message_id(...)` requires `can_mutate_organization(lead.organization_id)`
- foreign settings/follow-up/contact/lead update/interaction/stage/owner assignment/WhatsApp attach regressions are blocked
- analytics sync service paths remain operator/cron-secret protected and explicitly tenant-scoped
- password recovery is tenant-bound and fails closed until production origin configuration exists
- GitHub Actions independently validates typecheck/build

### Current production rollout state — last verified 2026-10-14

- global strict session-tenant enforcement: **OFF**
- persisted `tenant_session_bindings`: **0**
- active Auth sessions: **0**
- active single-org sessions: **0**
- active multi-org sessions: **0**

Global strict enforcement remains OFF until one genuine tenant-specific production session binding is observed and validated. Authenticated membership, reads, workspace access, CRM administration, organization management, and key mutations are now independently tenant-bound, substantially reducing transitional risk.

### Remaining W8 blockers

1. observe a genuine tenant-specific persisted production session binding through a real login
2. safely resolve the legacy admin identity that still has active memberships in three organizations
3. finish final classification/validation of authenticated SECURITY DEFINER functions; remaining set is currently 14 RLS authorization helpers + 16 authenticated workflow mutation RPCs + 11 authenticated read/auth/application RPCs
4. finish final W8G service-client/runtime validation
5. complete remaining W8I adversarial matrix
6. configure `SALSYSOS_APP_URL` + Supabase Auth redirect allow-list and run password-recovery E2E
7. W8J controlled second-tenant login test
8. W8K strict-enforcement cutover/sign-off
9. enable Supabase leaked-password protection when Auth configuration access is available

Known advisor posture: 20 `rls_enabled_no_policy` INFO findings are service/backend tables without direct anon/auth access; do not add dummy policies merely to silence them. Current SECURITY DEFINER exposure: anon executable **0**, authenticated executable **41**, service-role executable **122**. The 41 authenticated functions are classified above and require intent review rather than blanket revocation.

---

## 4. Technical roadmap — fixed 11 phases

1 Identity Resolution; 2 Raw Event Platform; 3 Session & Touchpoint Processing; 4 Customer Journey / 360; 5 CRM Journey Experience; 6 Attribution & Revenue; 7 Intent + Product Affinity + Sales Intelligence; 8 Conversion Feedback; 9 Content + SEO Intelligence; 10 AEO/GEO/AI Visibility; 11 Predictive Intelligence.

Phases 1–3 have substantial foundations; 4–8 have strong/material foundations with depth remaining; 9 partial; 10 mostly pending; 11 early. Approximately 8/11 are materially built, not fully complete.

---

## 5. Commercial roadmap — fixed R0–R14

R0 Platform Rebrand; R1 Foundation/Tenancy/Security; R2 Lead Capture/Identity/Raw Events/Data Quality; R3 CRM Sales Execution; R4 Customer Journey/360; R5 Attribution/Funnel/Revenue; R6 Intent/Product Affinity/Sales Intelligence; R7 Integrations/Conversion Feedback; R8 Content+SEO; R9 AEO/GEO/AI Visibility; R10 Predictive Intelligence + Owner Command Center; R11 Wellness/Education Productization; R12 Realty; R13 Commercial SaaS Readiness; R14 Marketing + First 100 Customers.

Current interpretation: R0 largely done; R1 nearing completion; R2 strong; R3 nearly complete; R4–R6 strong foundations; R7 in progress; R8 partial; R9 pending; R10 early; R11–R14 pending.

---

## 6. Behavioral Intelligence

BI-1 taxonomy; BI-2 pre-lead; BI-3 post-lead; BI-4 Intent Score v1; BI-5 trend/reactivation; BI-6 segments; BI-7 content/revenue influence; BI-8 sales influence; BI-9 predictive scoring; BI-10 next-best-action.

**Current estimate: ~35–40% foundation.**

---

## 7. Privacy & Compliance Control Plane

Posture: **privacy-by-design infrastructure with configurable controls supporting applicable privacy frameworks**, not universal compliance claims.

PC-1 Consent Ledger v2; PC-2 Purpose Registry; PC-3 jurisdiction/policy; PC-4 event policy metadata; PC-5 identity-stitching policy; PC-6 identity vault/PII separation; PC-7 retention; PC-8 rights orchestration; PC-9 vendor/processor registry; PC-10 lineage; PC-11 profiling controls; PC-12 compliance audit/reporting.

Consent is purpose-specific, not one boolean. Behavioral/profile processing must be permission-aware.

**Current estimate: ~15–20% foundation.**

---

## 8. Multi-tenant identity contract

- 1 organization = 1 tenant = isolated data boundary
- session resolves exactly one trusted tenant
- no normal org selector/switcher
- login route `/login/<organization-slug>`
- active membership in requested tenant required
- client/browser org IDs never sufficient authority
- platform admin separate from tenant admin
- changed URLs/payloads/RPC args/APIs must not expose another tenant

Legacy exception: one admin identity still belongs to SalsysOS, Test Yoga School, and Yogakulam Academy. This remains a W8J/W8K migration blocker.

---

## 9. Recent production security migrations

Current tail:

- `20261014091441_session_bound_tenant_mutation_policies`
- `20261014091745_session_bound_organization_admin_authorization`
- `20261014092325_latent_accommodation_rpc_execute_hardening`
- `20261014092425_latent_course_rpc_execute_hardening`
- `20261014093616_legacy_settings_and_internal_tenant_helper_hardening`
- `20261014100145_unused_authorization_rpc_execute_hardening`
- `20261014105133_internal_authorization_helper_execute_hardening`
- `20261014105425_internal_authorization_helper_execute_hardening` — duplicate idempotent retry preserved for parity
- `20261014110215_session_bound_crm_settings_reads`
- `20261014110702_internal_workspace_access_helper_execute_hardening`
- `20261014113720_oauth_state_current_tenant_guard`
- `20261014114745_session_bound_whatsapp_outbound_attach`
- `20261014115501_session_bound_organization_membership_reads`
- `20261014115949_tenant_scope_remaining_organization_read_policies`
- `20261014120314_session_bound_workspace_access`

Earlier migration history remains in repository source and Supabase production history.

---

## 10. Current progress snapshot — 2026-10-14

| Meter | Current estimate |
|---|---:|
| W1–W8 workspace program | ~82% |
| W5 Sales Workspace | ~98–99% |
| W8 Admin/Security/QA | ~97% |
| W8G Integrations/Webhooks | ~99% |
| Technical platform | ~81% |
| Behavioral Intelligence | ~35–40% |
| Privacy & Compliance Control Plane | ~15–20% |
| First commercial-ready multi-tenant product | ~72–73% |
| Full expanded SalsysOS platform scope | ~66% |
| Wider R0–R14 commercial roadmap | ~53% |

Planning estimates only; new approved scope can change the denominator.

---

## 11. Current milestone

### Milestone M-2026-10-14-M — Tenant-bound membership, read-policy, and workspace access layer

Completed/verified in production:

- PR #23 passed CI and merged to main as `2031d681ad6f79a3ed9ca3191231515bf6505656`
- `20261014115501_session_bound_organization_membership_reads`: authenticated membership requires current tenant + active membership
- pre-fix SalsysOS-bound legacy session could read 16 foreign Yogakulam courses; post-fix 0
- single-org viewer fallback compatibility verified
- systematic organization-id SELECT audit found four remaining `is_crm_user()`-only policies
- `20261014115949_tenant_scope_remaining_organization_read_policies` adds tenant membership to those four policies; pre-fix foreign property/catalog rows were visible, post-fix all four foreign counts are 0
- repeated policy audit now finds **zero** organization-id SELECT policies outside approved tenant/read authorization gates
- `20261014120314_session_bound_workspace_access` makes authenticated internal workspace access require session-bound current tenant regardless of strict rollout flag
- post-workspace regression: bound CRM lead creation and bound team snapshot remain authorized; rollback cleanup confirms no test lead persisted
- remaining 41 authenticated SECURITY DEFINER functions classified into 14 RLS helpers, 16 workflow mutation RPCs, and 11 read/auth/application RPCs; anon SECURITY DEFINER exposure is 0
- global strict rollout remains OFF pending a real persisted tenant session

### Prior M-J / M-I highlights

- WhatsApp outbound attach now tenant-bound via `can_mutate_organization(...)`
- foreign Sales/settings/follow-up/contact/stage/owner-assignment paths tested and blocked
- Google/Meta/Instagram OAuth callbacks current-tenant guarded before service-role mutation

Prior milestones remain in repository history.

---

## 12. Immediate next execution order

1. CI + merge the combined membership/read/workspace hardening PR
2. finish W8F intent review of the 41 classified authenticated SECURITY DEFINER functions; revoke only if proven unnecessary
3. finish final W8G service-client/runtime validation
4. complete remaining W8I adversarial cases
5. obtain real tenant-specific login and observe persisted session binding
6. configure recovery origin/redirect allow-list and run password-recovery E2E
7. W8J controlled second-tenant validation
8. resolve legacy multi-org admin identity safely
9. W8K strict tenant enforcement cutover/sign-off
10. resume W6 Marketing/Organic Growth Intelligence, Privacy foundations, W7 Finance/Reports, Technical 9–11, and R8–R14

---

## 13. Engineering protocol

Verify before modifying; preserve unrelated work; validate build/typecheck before merging runtime changes; separate external blockers from code failures; never expose secrets; do not invent tests; do not enable global strict tenant enforcement prematurely; use rollback-only production adversarial tests where possible; service-role mutations require trusted tenant binding; client-supplied tenant IDs are never authority. Update this document after every meaningful checkpoint.

---

## 14. Related roadmap

`docs/SalsysOS_Behavioral_Intelligence_Privacy_Control_Plane_Roadmap.md`
