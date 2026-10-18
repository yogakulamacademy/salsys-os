# SalsysOS — W8 Admin + Security / Tenant Isolation Final Sign-off

**Date:** 2026-10-18  
**Branch:** `feature/w8f-security-definer-hardening-v1`  
**Branch base:** `ac8d98b2f088183b1119dccac4588655a850bbab`  
**Implementation status:** **COMPLETE for the planned W8 tenant-security scope**

## Sign-off meaning

This document closes the planned W8 tenant-isolation and security-hardening implementation scope for SalsysOS v1.

It means the defined W8 controls were implemented and directly verified at the database, application-route and preview-build layers. It does **not** mean the system can never contain a future security defect, and it is not a legal/compliance certification. Security regression testing and monitoring remain ongoing engineering responsibilities.

## Tenant authority contract

The final W8 contract is:

> One organization is one tenant. Authenticated tenant authority comes from the server-maintained session binding, not from organization identifiers supplied by the browser or request payload.

Verified controls:

- strict authenticated session binding is enabled in production;
- normal authenticated requests resolve their tenant through the persisted session binding;
- the binding is valid only while the matching organization membership remains active and the organization remains active;
- an authenticated session without a canonical binding fails closed;
- a stale binding cannot remain authoritative after membership deactivation;
- active multi-organization memberships were absent at cutover;
- active authenticated customer sessions were bound before strict enforcement was enabled.

## Cross-tenant adversarial verification

Two distinct real tenant contexts were tested transactionally.

Verified outcomes included:

- own organization membership allowed;
- foreign organization membership denied;
- foreign organization mutation denied;
- own-tenant leads visible;
- foreign-tenant leads returned `0`.

After strict enforcement, a synthetic authenticated session without a persisted binding resolved no tenant and returned no tenant leads.

Additional subsystem isolation already verified elsewhere in the project includes:

- OpenSearch lead lexical foreign-tenant results = `0`;
- OpenSearch SEO lexical foreign-tenant results = `0`;
- Claude SEO recommendation → draft experiment foreign-tenant staging rejected.

These subsystem checks supplement, but do not replace, the database/session boundary.

## SECURITY DEFINER hardening

A production function privilege audit identified internal trigger/worker functions that inherited executable access through PostgreSQL `PUBLIC`.

The final hardening pattern revokes execution from:

- `PUBLIC`
- `anon`
- `authenticated`

for internal privileged runtime functions, while explicitly retaining trusted `service_role` execution where required.

Selected hardened areas include:

- automation tenant-alignment / approval triggers;
- tracking ingestion workers and rate-limit worker;
- search and privacy indexing triggers;
- SEO embedding/learning triggers;
- identity reconciliation helpers;
- `evaluate_identity_for_lead_v1(uuid,text)`.

The remaining intentionally browser-callable `SECURITY DEFINER` tracking registry resolvers are read-only intake-contract helpers and are not tenant mutation authority.

## Team & Access lifecycle controls

Team administration was re-verified after strict tenant cutover.

Verified:

- current organization is resolved server-side;
- caller must be active owner/admin for Team & Access mutation;
- target employee membership is checked inside the current organization;
- employee provisioning/lifecycle RPCs are service-role-only;
- enabling an Admissions employee activates their Sales workspace membership;
- disabling an Admissions employee deactivates their organization membership and Sales workspace membership;
- disabling the employee invalidates tenant session bindings for that user + organization;
- profile active state reflects remaining active memberships rather than blindly disabling a user globally.

Transaction-scoped enable/disable tests were rolled back after verification.

## OAuth / integration tenant controls

Google, Meta and Instagram integration flows were re-audited.

Verified:

- connect routes derive organization from the authenticated tenant context;
- OAuth state persists the server-derived organization and initiating user;
- middleware checks OAuth state against the currently bound tenant;
- callback routes independently re-check active owner/admin membership;
- provider writes remain scoped to the state-row organization;
- one-time state is consumed before mutation to reduce replay risk.

Transaction verification proved:

- same-tenant OAuth state → allowed;
- foreign-tenant OAuth state → rejected.

No test integration connection was persisted.

## Public/service runtime route controls

The middleware public-route inventory was reviewed route-by-route. Public middleware exemption does not imply unauthenticated business authority; service routes must independently authenticate their runtime caller.

Verified examples:

- analytics synchronization routes use dedicated sync secrets and/or `CRON_SECRET`;
- Admissions automation runtime uses `CRON_SECRET`;
- conversion feedback uses a dedicated secret with constant-time comparison;
- course catalog sync uses its dedicated secret / scheduled cron secret;
- search worker/bootstrap/health routes use search-worker secret and/or cron secret;
- competitor ranking worker uses ranking-worker secret and/or cron secret;
- WhatsApp and Instagram webhook POSTs validate raw-body HMAC signatures;
- website lead capture uses organization-bound integration credentials or the historical site-resolved legacy intake path;
- tracking collect/consent derive organization from registered source/origin rather than browser organization input.

## Legacy tracking-identify hardening

A regression audit identified that the historical `TRACKING_INGEST_SECRET` compatibility path in `/api/tracking/identify` was globally valid even though it predated the current multi-tenant tracking-source model.

It was narrowed so that:

- secret comparison is constant-time;
- the legacy credential is valid only for the server-resolved active `yogakulam-academy` tenant;
- foreign-tenant lead IDs are rejected;
- the modern source-key + bearer path remains dynamic and organization-bound.

Code commit:

`f0f929859fa787ce8f0194ac837810f00c29b7c4` — `Scope legacy tracking identify to Yogakulam tenant`

Verified preview deployment for that commit:

`dpl_BkcaaAuHqeyZNu3W7ydMAkx7LZPH` — **READY**

## Middleware allowlist cleanup

Two obsolete middleware public exemptions referred to routes that no longer exist:

- `/auth/recovery-confirm`
- `/api/search/index/pilot-verify`

They were removed to prevent a future route created at either pathname from accidentally inheriting stale public treatment.

Commit:

`f0c0b24267d690b5c48321456bffc30c06ed8694` — `Remove stale public middleware exemptions`

Verified Vercel deployment:

- deployment: `dpl_7aBYdBkxs24mGMEPJpM6hdFb1QLE`
- state: **READY**

## Settings/admin regression

Additional settings mutations were reviewed under strict tenant enforcement.

Verified:

- core CRM Settings resolves the current organization before tenant-aware RPC mutation;
- Organization Knowledge resolves the current organization and requires organization-management authority;
- knowledge mutations are tenant filtered and write the resolved organization ID;
- Team & Access uses the server-derived current organization before service-role employee lifecycle operations.

## Post-cutover monitoring snapshot

Observed Vercel runtime logs after strict cutover:

- preview `tenant` query, 2-hour window → no matching logs;
- production `tenant` query, 2-hour window → no matching logs;
- production `session` query, 2-hour window → no matching logs.

The 24-hour production error sample contained one Meta Ads synchronization error caused by no selected Meta ad-account assets. This is an integration configuration/data-readiness issue and not evidence of tenant-binding failure.

The absence of tenant-related errors in this observed window is a monitoring datapoint, not a perpetual guarantee.

## Database migrations applied

1. `20261018193000_w8f_security_definer_execute_hardening_v1.sql`
2. `20261018194000_w8f_security_definer_public_execute_hardening_v2.sql`
3. `20261018195500_w8k_strict_tenant_session_cutover_v1.sql`
4. `20261018200000_w8f_identity_evaluator_execute_hardening_v1.sql`
5. `20261018201500_w8_post_cutover_membership_binding_hardening_v1.sql`

All were applied intentionally to the production Supabase project during their controlled checkpoints.

## Merge-readiness review

Compared with branch base `ac8d98b2f088183b1119dccac4588655a850bbab`, the W8 branch before this sign-off was:

- ahead by `10` commits;
- behind by `0` commits;
- limited to W8-related route/middleware hardening, W8 migrations and checkpoint documentation.

No unrelated product feature rewrite was introduced by the W8 branch.

## Final W8 status

**W8 Admin + Security / Tenant Isolation: COMPLETE for the planned SalsysOS v1 implementation scope.**

Operational security work continues through:

- monitoring;
- regression tests for new routes/RPCs;
- least-privilege review when new service-role paths are introduced;
- cross-tenant adversarial testing for new external retrieval/indexing systems;
- future credential modernization such as Vercel OIDC where organizational policy permits it.

## Production safety posture retained

W8 completion does not change these controls:

- autonomous customer messaging remains OFF;
- automatic website publishing remains OFF;
- production-wide OpenSearch indexing remains OFF after the bounded pilot unless separately approved;
- semantic/vector indexing remains OFF pending its own E2E checkpoint;
- PostgreSQL remains the source of truth;
- client-supplied organization IDs remain non-authoritative;
- sensitive/high-impact actions retain approval/control requirements.

## Next major phase

With W8 implementation scope closed, the recommended next checkpoint is **System Intelligence v3**: deepen behavioral acceleration, trend/decay, objection intelligence, team-capacity signals and cross-domain correlation while preserving the evidence-first / bounded-learning architecture.
