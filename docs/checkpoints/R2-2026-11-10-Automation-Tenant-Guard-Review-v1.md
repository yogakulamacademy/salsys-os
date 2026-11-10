# R2: seven-table automation tenant guard — independent REVIEW ONLY

**Release disposition: NO-GO / DRAFT.** This is engineering preparation, not authority to merge, install a migration, create an authenticated tenant, enable a collector/scheduler, send messages, or touch Production.

## Why the proposal is required

The installed temporary staging project `ndxpjqkthuzxlmbenxti` has a SECURITY DEFINER trigger function `public.enforce_automation_tenant_alignment_v1()`. It is attached to seven tables, all of which contain `organization_id` and `lead_id`: `automation_events`, `automation_runs`, `automation_enrollments`, `automation_suppressions`, `automation_scheduled_jobs`, `automation_variables` and `automation_wait_states`. All seven have RLS, and the `lead_id` FK references `leads(id)` **without** a composite `(lead_id,organization_id)` FK. The stage function only checks lead-to-organization consistency for the first four tables. The other three can therefore lack that *specific* trigger guard. This is a code/constraint gap **not a reproduced exploit**; other policies may also apply.

Production contains a more generic `to_jsonb(new)` guard checking every non-null `lead_id`, `conversation_id` and `message_id` against the new row's organization. The proposed stage correction follows that verified behavior with a stricter context whitelist. It does **not** clone Production's function body or any customer data.

## Checked-in artifacts

- `docs/sql/r2-staging-automation-tenant-guard-review-v1.sql`: REVIEW-ONLY, transactional, bounded lock/statement timeouts. An exact MD5-of-existing-stage-source preflight rejects unknown versions. Seven attached enabled BEFORE INSERT/UPDATE ROW trigger tables, tenant columns, RLS, and FKs must match. The preflight also demands that PR #682's **separately approved stage-only** privilege correction already denied `anon` and `authenticated` EXECUTE for this SECURITY DEFINER trigger while preserving `service_role`. A future independently reviewed migration may then replace only its body, preserving triggers, ownership and permissions. All non-null lead/conversation/message references must belong to `new.organization_id`. A postflight rechecks the source contract and EXECUTE roles.
- `docs/sql/r2-automation-tenant-guard-catalog-audit-v1.sql`: independent **SELECT-only** metadata audit, with no tenant IDs or business records returned.
- `tests/readiness/r2-automation-tenant-guard-review.test.cjs`: synthetic static regression tests for scope, schema, role, isolation, no-egress and fail-closed checks.

The independent audit was run on the two live *catalogs* only (no mutation) on **2026-11-09 UTC**:

| Metadata gate | Staging | Production |
| --- | --- | --- |
| Expected tables present | 7/7 | 7/7 |
| Structurally valid RLS/org/lead tables | 7/7 | 7/7 |
| Enabled alignment triggers | 7/7 | 7/7 |
| Tenant guard source + EXECUTE ACL contract | Not ready | Ready |
| Overall | `AUTOMATION_TENANT_GUARD_REVIEW_REQUIRED` | `AUTOMATION_TENANT_GUARD_METADATA_PASS_NOT_E2E` |

Production passing a catalog metadata gate **does not** mean user E2E, consent, legal approval or release are accepted.

## Mandatory independent decisions and staging operator workflow

1. **Keep PR #682 independently reviewed first**, then create its separately independently approved **versioned security migration** with the Supabase CLI. Apply only when the owner specifically authorizes work on isolated temporary staging; require its two read-only function audits and the separately reviewed #675 broader catalog gate to pass. Until then, this seven-table proposal deliberately fails its ACL preflight.
2. Independent security/DBA reviewer validates that the seven table names, precise trigger names and event-column semantics are correct. Review edge cases (NULL lead IDs, missing/inactive contacts, valid UUID casts, revoked user session, service role) and decide whether a dedicated cross-tenant composite constraint is appropriate. Preserve all existing RLS policies and foreign keys.
3. With a *separate explicit staging-only authorization*, operator captures a rollback snapshot, uses a distinct timestamped CLI-generated migration rather than executing `docs/sql` raw, installs after a provider-linked dry run and independently reviewed dependency/rollback plan.
4. Run the independent SELECT-only audit. It must return `AUTOMATION_TENANT_GUARD_METADATA_PASS_NOT_E2E` with 7/7 triggers and zero unintended function EXECUTE. Repeat Supabase security advisors and PR #675 gate. Record the pre/post catalog evidence without personal IDs.
5. With isolated synthetic tenants and two genuine authorized staging logins, manually witness denied `lead_id` cross-organization insert/update attempts on **each of seven tables**, plus the positive same-tenant paths and optional conversation/message edges. Do not use real customer identifiers, outbound provider credentials, active scheduler or optional analytics collector.
6. The production Sales Asset approval policy drift, the identity merge privacy tables, and the 16 R2 witnessed acceptance scenarios are **separate blockers**. This proposed trigger correction does not satisfy them, and the R2 release remains ON HOLD.

**Rollback:** revert only through the independently captured stage-specific original function definition, retain the prior ACL/security posture, and run the same catalog, RLS and tenant-negative checks afterward. A source hash is not a substitute for a tested restore.
