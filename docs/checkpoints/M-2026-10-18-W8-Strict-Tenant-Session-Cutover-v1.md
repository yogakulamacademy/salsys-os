# SalsysOS — W8 Strict Tenant Session Cutover v1

**Date:** 2026-10-18  
**Branch:** `feature/w8f-security-definer-hardening-v1`  
**Base:** `ac8d98b2f088183b1119dccac4588655a850bbab`

## Goal

Close the highest-value remaining W8 tenant-isolation gaps before production automation expands:

1. reduce direct browser/user execution surface on internal `SECURITY DEFINER` functions;
2. verify more than one real tenant with adversarial reads/mutations;
3. verify all active customer sessions are already tenant-bound;
4. switch tenant resolution from compatibility fallback to strict authenticated-session binding;
5. prove an unbound authenticated session fails closed.

## SECURITY DEFINER privilege audit

A production catalog audit found that several internal trigger/worker functions were effectively executable by the `authenticated` role. The first explicit `REVOKE ... FROM authenticated` test showed that PostgreSQL `PUBLIC` function EXECUTE inheritance still made those functions callable.

The corrected migration therefore revokes from `PUBLIC`, `anon`, and `authenticated`, then explicitly preserves `service_role` execution for trusted runtime paths.

### Internal functions closed to browser roles

Trigger/runtime functions:

- `automation_enrollment_whatsapp_send_approval_trigger_v1()`
- `enforce_automation_tenant_alignment_v1()`
- `ensure_seo_embedding_settings_v1()`
- `ensure_seo_learning_settings_for_organization_v1()`
- `reconcile_person_after_contact_change_v1()`
- `reconcile_person_after_session_link_v1()`
- `search_enqueue_row_trigger_v1()`
- `search_privacy_tombstone_trigger_v1()`
- `seo_embedding_enqueue_trigger_v1()`
- `sync_tracking_consent_to_privacy_v1()`
- `sync_tracking_processor_settings_for_org_v1()`
- `sync_tracking_source_from_organization_site_v1()`

Internal tracking workers:

- `consume_tracking_source_rate_limit_v1(uuid,uuid,timestamptz)`
- `ingest_external_lead_from_raw_event_v1(uuid,uuid)`
- `sweep_tracking_events_v1(integer)`

Identity resolver:

- `evaluate_identity_for_lead_v1(uuid,text)`

Post-migration verification for the selected internal functions showed:

- `anon` execute: **false**
- `authenticated` execute: **false**
- `service_role` execute: **true**

The identity evaluator was additionally removed from browser roles because, as a `SECURITY DEFINER` resolver accepting an arbitrary lead UUID, it can inspect identity-resolution evidence beyond ordinary RLS. It remains available to trusted runtime paths.

The remaining authenticated `SECURITY DEFINER` functions without explicit user/tenant predicates from the static audit are the two read-only tracking registry resolvers:

- `resolve_tracking_event_family_v1(text)`
- `resolve_tracking_source_by_origin_v1(text)`

These return tracking registry/configuration metadata and are part of the tracking intake contract rather than privileged mutation workers. They are retained for the tracking path and are not treated as tenant mutation authority.

## Session readiness audit

Before enabling strict session enforcement, production was checked directly.

Verified state:

- active users with more than one active organization membership: **0**
- persisted tenant session bindings: **79**
- bound users with multiple active organizations: **0**
- organizations represented by valid bound sessions: **3**
- users represented by valid bound sessions: **4**
- active authenticated sessions with an active organization membership: **17**
- active unbound customer sessions: **0**

The application login and password-recovery code was also verified to call `bind_current_tenant_session_for_current_user()` immediately after authentication and to sign the user out if canonical tenant binding fails. No organization ID or slug from the browser is trusted as tenant authority.

## Multi-tenant adversarial proof before cutover

Using transaction-scoped authenticated JWT claims and existing real session bindings, two distinct tenant contexts were tested without creating customer data.

Tenant test A:

- current tenant resolved: true
- own membership allowed: true
- foreign membership allowed: false
- foreign mutation allowed: false
- own leads visible: `7`
- foreign leads visible: `0`

Tenant test B:

- current tenant resolved: true
- own membership allowed: true
- foreign membership allowed: false
- foreign mutation allowed: false
- own leads visible: `31`
- foreign leads visible: `0`

This extends W8 validation beyond a single-tenant happy path.

## Strict tenant-session cutover

Migration `w8k_strict_tenant_session_cutover_v1` was applied to production with fail-closed guards.

The migration aborts if either condition exists:

1. an active user belongs to more than one active organization;
2. an active authenticated session with an active organization membership does not have the matching tenant binding.

After the guards passed, `current_tenant_organization_id()` was changed so that when strict enforcement is enabled an authenticated user resolves a tenant **only from the persisted session binding**. The previous sole-membership compatibility fallback remains available only while the rollout flag is disabled.

Production flag after migration:

- `tenant_security_config.enforce_session_tenant = true`

Post-cutover audit:

- strict enforcement enabled: **true**
- active multi-org users: **0**
- active unbound sessions: **0**

## Post-cutover adversarial proof

### Bound session

A real bound authenticated session continued to resolve its own tenant correctly while blocking foreign access:

- current tenant resolved: true
- own membership allowed: true
- foreign membership allowed: false
- foreign mutation allowed: false
- foreign leads visible: `0`

### Unbound authenticated session

A transaction-scoped authenticated identity with a synthetic unbound session ID was then tested after strict enforcement was enabled.

Result:

- current tenant resolved: **null**
- own organization membership authorization: denied/fail-closed
- own organization mutation authorization: denied/fail-closed
- own tenant leads visible: **0**

Therefore membership alone no longer establishes authenticated tenant authority under strict mode; the authenticated session must be canonically bound.

## Applied migrations

1. `20261018193000_w8f_security_definer_execute_hardening_v1.sql`
2. `20261018194000_w8f_security_definer_public_execute_hardening_v2.sql`
3. `20261018195500_w8k_strict_tenant_session_cutover_v1.sql`
4. `20261018200000_w8f_identity_evaluator_execute_hardening_v1.sql`

## Current W8 interpretation

W8 tenant isolation is now approximately **96–97% complete** rather than ~92%.

Closed in this checkpoint:

- real second-tenant DB/RLS adversarial checks
- direct-execute hardening for selected internal `SECURITY DEFINER` functions
- PostgreSQL `PUBLIC` execute inheritance gap
- active-session readiness audit
- strict authenticated tenant-session cutover
- fail-closed unbound-session proof

Still required before formal W8 = 100%:

1. final inventory of remaining authenticated business RPC intent and sensitive service-role routes;
2. integration/OAuth/runtime regression after strict cutover;
3. final Team & Access / admin surface regression;
4. production monitoring for tenant-binding failures after cutover;
5. branch consolidation and formal W8 sign-off.

Search-layer isolation, OpenSearch isolation, and this strict-session proof are strong evidence, but no single subsystem test should be treated as universal security proof.
