# SalsysOS — W8 Post-Cutover Regression v1

**Date:** 2026-10-18  
**Branch:** `feature/w8f-security-definer-hardening-v1`  
**Base before this checkpoint:** `d85c2793c0a334b373685a2f8b9c55fcf7df2104`

## Goal

Continue W8 after strict authenticated tenant-session enforcement and verify that the main integration, public runtime and Team & Access paths remain tenant-safe under the stricter contract.

This checkpoint also closes post-cutover lifecycle/runtime gaps found during regression:

1. a persisted tenant binding must stop being authoritative immediately when the underlying organization membership is no longer active;
2. a historical global tracking-identify compatibility credential must not become a cross-tenant credential;
3. nonexistent routes must not remain pre-authorized in middleware for future accidental reuse.

## OAuth / integration regression

The current middleware and provider routes were re-read from the W8 branch.

Verified architecture:

- Google, Meta and Instagram connect routes resolve the organization only through `requireIntegrationAdminTenant(...)`.
- `requireIntegrationAdminTenant(...)` uses the authenticated workspace/session resolver; it does not accept a browser-supplied organization ID.
- OAuth states persist `created_by` plus the server-derived `organization_id`.
- middleware checks callback `state` with `oauth_state_matches_current_tenant(...)` before the callback route proceeds.
- callback routes independently re-check that the initiating user still has active `owner`/`admin` membership in the state row's organization.
- callback writes remain scoped by `stateRow.organization_id`.
- one-time OAuth states are consumed before provider mutation to prevent replay.

A transaction-scoped regression test created temporary same-tenant and foreign-tenant OAuth states and used a real bound authenticated tenant context.

Result:

- same-tenant OAuth state allowed: **true**
- foreign-tenant OAuth state allowed: **false**
- temporary rows rolled back; no verification data was persisted.

## Team & Access regression

`app/settings/team/actions.ts` was verified to:

- resolve the current organization through `requireCurrentOrganizationId(...)`;
- require the caller's active membership role to be `owner` or `admin`;
- ignore browser organization authority;
- verify the target employee belongs to the current organization before lifecycle mutation;
- call service-role-only tenant employee RPCs only after the tenant checks above.

Production RPC definitions were re-audited:

- `provision_tenant_employee(...)` requires `auth.role() = 'service_role'`;
- `set_tenant_employee_active(...)` requires `auth.role() = 'service_role'`;
- both remain unavailable to `anon` and `authenticated` direct execution.

Additional settings regression:

- core CRM settings mutations resolve the tenant with `requireCurrentOrganizationId(...)` before calling tenant-aware RPCs;
- Organization Knowledge mutations resolve the active tenant and then require `can_manage_organization(...)` before creating, approving or archiving knowledge;
- knowledge document/chunk/audit mutations include the resolved `organization_id` and target-document queries are tenant filtered.

## Post-cutover membership gap found

The original strict `current_tenant_organization_id()` trusted a matching persisted `tenant_session_bindings` row without re-checking whether the user's organization membership and organization were still active.

Most downstream authorization helpers still checked active membership, but the tenant resolver itself should fail closed at the earliest boundary.

A second lifecycle consistency issue was also found in `set_tenant_employee_active(...)`: disabling an Admissions employee changed `organization_members.active` and profile state but did not explicitly deactivate the Sales `workspace_memberships` row or delete tenant bindings for that organization.

## Membership/binding hardening applied

Migration:

`20261018201500_w8_post_cutover_membership_binding_hardening_v1.sql`

Production migration name:

`w8_post_cutover_membership_binding_hardening_v1`

Changes:

1. `current_tenant_organization_id()` now treats a persisted binding as valid only when:
   - session ID matches the authenticated JWT;
   - binding user matches `auth.uid()`;
   - the corresponding organization membership is active;
   - the organization itself is active.

2. `set_tenant_employee_active(...)` now:
   - activates Sales workspace membership when the employee is enabled;
   - deactivates Sales workspace membership when the employee is disabled;
   - deletes tenant session bindings for that user + organization on disable;
   - preserves its service-role-only execution boundary.

Pre-migration integrity audit found:

- stale active Sales workspace memberships for inactive Admissions users: **0**
- stale tenant bindings without active membership / active organization: **0**

So the hardening corrected future lifecycle behavior without repairing hidden production corruption.

## Transaction-scoped verification

### Bound session after membership removal

Using a real bound admin session inside a transaction, the corresponding organization membership was temporarily set inactive and `current_tenant_organization_id()` was called with that authenticated session context.

Result:

- tenant after membership deactivation: **null**

The transaction was rolled back and the real membership was confirmed active afterward.

### Employee enable path

Using the existing inactive Yogakulam Admissions membership inside a transaction:

- organization membership after enable: **true**
- Sales workspace membership after enable: **true**
- profile after enable: **true**

The transaction was rolled back.

### Employee disable path

Inside a transaction after enabling the same employee, the disable path produced:

- organization membership after disable: **false**
- Sales workspace membership after disable: **false**
- profile after disable: **false**
- tenant bindings for the disabled organization: **0**

The transaction was rolled back. No real employee lifecycle state was changed by the regression test.

## Public/service runtime route inventory

Middleware-public service routes were reviewed against their route-level authorization rather than being assumed safe merely because they bypass normal CRM authentication.

Verified controls include:

- GA4 sync → `GA4_SYNC_SECRET` or `CRON_SECRET`
- GSC sync → `GSC_SYNC_SECRET` or `CRON_SECRET`
- Google Ads sync → `GOOGLE_ADS_SYNC_SECRET` or `CRON_SECRET`
- Meta Ads sync → `META_ADS_SYNC_SECRET` or `CRON_SECRET`
- Admissions auto-task runtime → `CRON_SECRET`
- conversion-feedback runtime → `CONVERSION_FEEDBACK_RUN_SECRET` with constant-time comparison
- course/batch sync → `COURSE_CATALOG_SYNC_SECRET`; scheduled GET path also accepts `CRON_SECRET`
- OpenSearch worker/bootstrap/health/SEO bootstrap → `SEARCH_INDEX_WORKER_SECRET` or `CRON_SECRET`
- OpenSearch pilot → protected worker-secret path; its historical preview-only verifier exception is branch/environment/action constrained and does not apply to the W8 branch
- competitor rank worker → `SEO_RANKING_WORKER_SECRET` or `CRON_SECRET`
- WhatsApp webhook → Meta webhook verification token for GET and raw-body HMAC verification using `WA_APP_SECRET` for POST
- Instagram webhook → verification token for GET and raw-body HMAC verification using `INSTAGRAM_APP_SECRET` for POST
- website lead capture → canonical organization-bound integration credential or historical website secret path with server-side site-to-organization resolution
- tracking collect/consent → organization derived from registered tracking source/origin; client organization ID is not accepted as authority

## Legacy tracking-identify gap found and closed

`POST /api/tracking/identify` supported the modern tenant-bound tracking-source credential and an older `TRACKING_INGEST_SECRET` compatibility credential.

The canonical tracking-source path was already safe: the authenticated source carries an authoritative organization and the route rejects a lead whose organization differs.

The historical global secret path, however, accepted a `leadId`, resolved that lead's organization, and then looked up the exact visitor/session inside the resolved organization. A holder of the old global secret therefore had a wider tenant capability than intended if they also knew a valid lead/session tuple.

Commit:

`f0f929859fa787ce8f0194ac837810f00c29b7c4` — `Scope legacy tracking identify to Yogakulam tenant`

Hardening:

- legacy secret comparison now uses `timingSafeEqual`;
- the legacy credential is explicitly constrained to the active `yogakulam-academy` organization resolved server-side;
- a lead belonging to any other organization receives a 403;
- the canonical source-key + bearer path remains fully dynamic and multi-tenant;
- no organization ID supplied by the caller becomes authority.

Build verification for this commit:

- Vercel deployment: `dpl_BkcaaAuHqeyZNu3W7ydMAkx7LZPH`
- state: **READY**
- build completed successfully and outputs were deployed.

## Middleware public-surface cleanup

Two middleware public exemptions referred to routes that no longer exist:

- `/auth/recovery-confirm`
- `/api/search/index/pilot-verify`

They were removed in:

`f0c0b24267d690b5c48321456bffc30c06ed8694` — `Remove stale public middleware exemptions`

This is defense-in-depth: a future route accidentally created at either path will no longer inherit a public bypass merely because an obsolete pathname remained on the allowlist.

## Post-cutover monitoring

Vercel runtime logs were checked after strict tenant enforcement:

- preview query for `tenant`, last 2 hours: **no matching runtime logs**
- production query for `tenant`, last 2 hours: **no matching runtime logs**
- production query for `session`, last 2 hours: **no matching runtime logs**

The production error log over the last 24 hours contained one observed Meta Ads synchronization error (`No selected Meta ad-account assets were found`). It is an integration-configuration/data-readiness issue, not a tenant-binding or cross-tenant failure.

Absence of matching log entries is evidence that no obvious tenant-binding failure surfaced in the observed window; it is not proof that future runtime failures are impossible.

## Current W8 interpretation

W8 is now approximately **98–99% complete**.

Closed or materially strengthened:

- strict authenticated session tenant binding;
- fail-closed unbound session behavior;
- active-membership validation inside the tenant resolver;
- second-tenant DB/RLS adversarial proof;
- selected `SECURITY DEFINER` browser-execute hardening;
- OAuth state tenant mismatch rejection;
- connect-route server-derived organization authority;
- callback-time owner/admin reauthorization;
- Team & Access tenant derivation and target validation;
- employee disable propagation to workspace membership and tenant binding invalidation;
- public service-route authentication/secret inventory;
- legacy tracking-identify credential tenant scoping;
- stale middleware public exemptions removed;
- initial post-cutover runtime monitoring.

Still required before formal W8 = 100%:

1. verify the final W8 branch build after middleware cleanup;
2. branch consolidation / merge-readiness review;
3. create the formal W8 sign-off document.

## Safety posture

- no customer records were created for verification;
- OAuth verification rows were transaction-scoped and rolled back;
- employee lifecycle tests were transaction-scoped and rolled back;
- no customer messages were sent;
- no integration connection was created or changed;
- no browser role received new privileged RPC access;
- the historical tracking credential was narrowed rather than broadened.
