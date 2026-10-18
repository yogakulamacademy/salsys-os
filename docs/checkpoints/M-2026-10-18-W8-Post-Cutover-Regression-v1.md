# SalsysOS — W8 Post-Cutover Regression v1

**Date:** 2026-10-18  
**Branch:** `feature/w8f-security-definer-hardening-v1`  
**Base before this checkpoint:** `d85c2793c0a334b373685a2f8b9c55fcf7df2104`

## Goal

Continue W8 after strict authenticated tenant-session enforcement and verify that the main integration and Team & Access paths remain tenant-safe under the stricter contract.

This checkpoint also closes a post-cutover lifecycle gap found during regression: a persisted tenant binding must stop being authoritative immediately when the underlying organization membership is no longer active.

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

## Post-cutover gap found

The original strict `current_tenant_organization_id()` trusted a matching persisted `tenant_session_bindings` row without re-checking whether the user's organization membership and organization were still active.

Most downstream authorization helpers still checked active membership, but the tenant resolver itself should fail closed at the earliest boundary.

A second lifecycle consistency issue was also found in `set_tenant_employee_active(...)`: disabling an Admissions employee changed `organization_members.active` and profile state but did not explicitly deactivate the Sales `workspace_memberships` row or delete tenant bindings for that organization.

## Hardening applied

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

## Current W8 interpretation

W8 is now approximately **97–98% complete**.

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
- employee disable propagation to workspace membership and tenant binding invalidation.

Still required before formal W8 = 100%:

1. final inventory of sensitive service-role/public internal routes and their secret/auth controls;
2. production monitoring for tenant-binding failures after strict cutover;
3. final admin/settings regression sweep;
4. branch consolidation / merge readiness;
5. formal W8 sign-off document.

## Safety posture

- no customer records were created for verification;
- OAuth verification rows were transaction-scoped and rolled back;
- employee lifecycle tests were transaction-scoped and rolled back;
- no customer messages were sent;
- no integration connection was created or changed;
- no browser role received new privileged RPC access.
