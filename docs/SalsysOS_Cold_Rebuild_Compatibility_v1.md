# SalsysOS Cold-Rebuild Compatibility v1

**Checkpoint:** PH-5.2B.1c  
**Scope:** historical schema/auth prerequisites required to reconstruct SalsysOS from migrations without changing live production authorization

## Why this exists

The production database evolved before every prerequisite was captured in the checked-in migration chain.

A clean Supabase branch replay proved that migrations `001` through `006` apply successfully, but migration `007_tenant_schema_foundation.sql` cannot run from that state without compatibility prerequisites that already existed in production when `007` was originally captured.

The first proven schema drift was the missing website-sync columns used by `007` indexes:

- `courses.source_system text`
- `courses.external_course_id text`
- `course_batches.source_system text`
- `course_batches.external_batch_id text`

Those are now idempotently declared inside migration `007`, matching current production definitions: nullable `text`, no default.

The next proven drift was authorization helpers. Production's migration ledger shows that migrations `001`-`006` did **not** create:

- `is_crm_admin()`
- `can_view_lead_pii()`
- `can_access_lead(uuid)`

Yet migration `007` already references all three.

## Evidence-based legacy authorization baseline

Migration `001` granted SELECT access on the core CRM tables to every active CRM user through `is_crm_user()`. Writes were gated by `can_write_crm()`.

Migration `007` then introduced organization membership checks around every use of `can_access_lead()` in touchpoint, conversation and message policies.

Migration `008_identity_resolution.sql` has only two pre-RBAC uses of `can_access_lead()`, and both are also wrapped by `is_organization_member(organization_id)`.

A later recorded Sales authorization migration replaces `can_access_lead()` with workspace/ownership-aware RBAC. It explicitly describes itself as aligning lead access with Sales workspace roles while preserving the existing PII visibility policy.

Therefore the recovery compatibility implementation intentionally reproduces the old broad CRM read gate only for the historical pre-workspace window:

- `is_crm_admin()` = service role OR active profile with role `admin`.
- `can_view_lead_pii()` = service role OR `is_crm_admin()`.
- `can_access_lead(uuid)` = service role OR active CRM user, with non-null lead id.

Tenant isolation during this historical window is enforced by the surrounding organization-membership predicates in migrations `007` and `008`. Later migrations replace the compatibility `can_access_lead()` implementation with the canonical Sales workspace authorization model.

## Cold-rebuild sequence

For a schema-only cold rebuild from zero:

1. Apply migrations `001` through `006`.
2. Apply `supabase/recovery/007_legacy_authorization_baseline.sql`.
3. Apply the corrected `007_tenant_schema_foundation.sql`.
4. Continue with migration `008` and the remaining recorded migration chain.
5. Verify that the later Sales authorization migration replaces `can_access_lead()` with the workspace-aware implementation.
6. Run the normal security/RLS regression contracts before treating the rebuilt environment as valid.

## PH-5.2B.1c replay evidence

A disposable Supabase branch was created on 2026-10-30 for the isolated cold-rebuild rehearsal. The branch started from migrations `001` through `006`, with production data excluded.

The rehearsal pre-seeded only the seven proven historical prerequisites: the four website-sync columns above plus the three legacy authorization helpers. Supabase then replayed the production migration chain itself.

Observed result:

- migrations `007` through `015` applied successfully;
- migration `016_journey_workspace_hardening` failed while creating `v_contact_intelligence_touch_journey`;
- PostgreSQL error: `42703 column e.organization_id does not exist`;
- the failing statement references `public.enrollments e` with `e.organization_id = l_1.organization_id`;
- current production defines `public.enrollments.organization_id` as `uuid NOT NULL` with no default;
- therefore `016` exposes the next independent historical schema-drift boundary after the repaired `007` path.

This result proves that the PH-5.2B.1b/1c compatibility work is sufficient to cross the original `006 -> 007` boundary and continue through the raw-event foundation up to migration `015`. It does **not** yet prove a complete zero-to-current migration replay.

The disposable branch was deleted immediately after evidence capture.

## Safety boundary

`supabase/recovery/007_legacy_authorization_baseline.sql` is a **cold-recovery bootstrap**, not a normal production migration.

Do not run it on current production to replace modern authorization functions. Its purpose is only to reconstruct the missing historical state needed to cross the `006 -> 007` boundary during an isolated rebuild.

This compatibility layer does not prove production-data restore, PITR, backup integrity, or RPO/RTO. It only repairs the historical schema/auth replay path.
