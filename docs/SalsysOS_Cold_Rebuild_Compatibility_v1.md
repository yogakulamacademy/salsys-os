# SalsysOS Cold-Rebuild Compatibility v1

**Checkpoint:** PH-5.2B.1f  
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

## PH-5.2B.1d — enrollment tenant baseline

Production migration history contains references to `enrollments.organization_id` starting at migration `016`, but no earlier recorded migration creates that column. A scan of the migration ledger also found no recorded `ADD COLUMN organization_id` for `public.enrollments` anywhere in the chain.

Current production shape is:

- `enrollments.organization_id uuid NOT NULL`
- no column default
- foreign key `enrollments_organization_id_fkey` -> `organizations(id) ON DELETE RESTRICT`

The current production table has no enrollment rows, so there is no live row set from which to empirically prove a historical backfill. The schema relationship is nevertheless explicit: `enrollments.lead_id` is NOT NULL, and modern tenant policies require each enrollment's `organization_id` to match its lead's `organization_id`.

For isolated cold recovery, `supabase/recovery/016_enrollments_tenant_baseline.sql` therefore reconstructs the missing historical state immediately after migration `015` and before `016`:

1. add nullable `organization_id uuid` if absent;
2. backfill it from `leads.organization_id` through mandatory `lead_id`;
3. abort if any enrollment remains tenantless;
4. set `organization_id` NOT NULL;
5. add the current production organization FK if absent.

Later performance indexes and later RLS policy revisions are deliberately not pulled backward into this bootstrap. They remain owned by their recorded migrations or a later final schema-parity check.

## PH-5.2B.1d replay evidence

A fresh disposable Supabase branch was created on 2026-10-30 at the quoted branch rate of `$0.01344/hour`. Production data was excluded.

The branch initially exposed only migrations `001` through `006`, which is the intended cold-rebuild boundary. Because Supabase branch replay uses the production migration ledger rather than the corrected Git copy of migration `007`, the harness pre-seeded the same seven proven `007` prerequisites used in PH-5.2B.1c. The branch then replayed migrations `007` through `015` successfully and stopped at migration `016`.

After applying `supabase/recovery/016_enrollments_tenant_baseline.sql`, migration `016` advanced past the original missing `enrollments.organization_id` reference but failed later in the same view definition with PostgreSQL `42P01`:

`relation "public.lead_contact_logs" does not exist`

The failing statement is `create or replace view public.v_contact_intelligence_touch_journey`, whose FROM clause reads `public.lead_contact_logs lcl`.

This proves the enrollment tenant bootstrap repairs the first `016` prerequisite, but migration `016` has at least one additional historical dependency that is also absent from migrations `001` through `015`.

The disposable branch was deleted immediately after the error evidence was captured, stopping the hourly branch charge.

## PH-5.2B.1e — lead contact log baseline

Production audit shows that `public.lead_contact_logs` exists today and is not created or altered by any recorded migration before `016`. Migration `016` itself only replaces journey views; it does not create this base table.

Current production evidence for `lead_contact_logs`:

- 14 columns, headed by `id uuid primary key default gen_random_uuid()` and mandatory `lead_id uuid`;
- `lead_id` FK -> `leads(id) ON DELETE CASCADE`;
- nullable `employee_user_id` FK -> `profiles(id) ON DELETE SET NULL`;
- method/direction/outcome/source/comment/call-duration checks;
- four ordinary time-oriented indexes plus one partial unique `(source, external_reference)` index;
- RLS enabled;
- one authenticated SELECT policy: `can_access_lead(lead_id)`;
- authenticated has SELECT only;
- service_role has table write/read privileges;
- no custom triggers;
- 37 current production rows.

No recorded migration contains `ALTER TABLE public.lead_contact_logs`, which means the current base-table shape is the strongest available evidence for the historical object that existed before `016`.

`supabase/recovery/016_lead_contact_logs_baseline.sql` therefore version-captures that missing object only for isolated cold recovery. It does not add `organization_id`, modern workspace tables, application data, or triggers.

## PH-5.2B.1e replay evidence

A fresh disposable branch replay with the proven `007` prerequisites plus both `016` baselines progressed beyond the missing enrollment tenant column and beyond `lead_contact_logs`.

The next PostgreSQL `42P01` failure was:

`relation "public.v_lead_journey_intelligence" does not exist`

The failing statement was migration `016` creating `v_source_journey_summary` from `public.v_lead_journey_intelligence`.

The branch was deleted immediately after evidence capture, stopping the hourly branch charge.

## PH-5.2B.1f — journey-view recovery baseline

Repository history and the production migration ledger show that `public.v_lead_journey_intelligence` was already consumed before migration `016` but was never created by any recorded migration. Its upstream `public.v_lead_session_journey` was also unversioned at the `015 -> 016` boundary; a later October 28 optimization migration finally captured a deterministic definition for the session-journey view.

Production dependency inspection shows the two views ultimately depend only on:

- `public.leads`
- `public.web_sessions`
- `public.touchpoints`
- `public.v_lead_session_journey` as the direct upstream view for lead-level journey intelligence

The exact base columns consumed by those views are present by migrations `001`, `003`, and `007`, including tenant `organization_id` on all three base tables. Both production views currently use `security_invoker=true`.

`supabase/recovery/016_journey_views_baseline.sql` therefore version-captures the missing historical read-model prerequisites immediately after migration `015` and before migration `016`:

1. create `public.v_lead_session_journey` first;
2. create `public.v_lead_journey_intelligence` second;
3. preserve tenant-aware joins through `organization_id`;
4. preserve `security_invoker=true`;
5. add no grants, data, triggers, or base-table DDL.

The baseline uses the later version-captured session-journey definition and the verified current production lead-journey column contract because no earlier SQL definition exists in the migration ledger. This is a recovery compatibility artifact, not a claim that these SQL texts were the exact original manually-applied definitions.

## Cold-rebuild sequence

For a schema-only cold rebuild from zero:

1. Apply migrations `001` through `006`.
2. Apply `supabase/recovery/007_legacy_authorization_baseline.sql`.
3. Apply the corrected `007_tenant_schema_foundation.sql` (or, when using Supabase branch rebase against the production ledger, pre-seed the four website-sync columns before replay).
4. Continue migrations `008` through `015`.
5. Apply `supabase/recovery/016_enrollments_tenant_baseline.sql`.
6. Apply `supabase/recovery/016_lead_contact_logs_baseline.sql`.
7. Apply `supabase/recovery/016_journey_views_baseline.sql`.
8. Continue with migration `016` and the remaining recorded migration chain.
9. Verify that the later Sales authorization migration replaces `can_access_lead()` with the workspace-aware implementation.
10. Run the normal security/RLS regression contracts and final schema-parity checks before treating the rebuilt environment as valid.

## Safety boundary

Files under `supabase/recovery/` are **cold-recovery bootstraps**, not normal production migrations.

Do not run them on current production to replace modern schema or authorization. Their purpose is only to reconstruct missing historical state during an isolated rebuild at the documented migration boundaries.

This compatibility layer does not prove production-data restore, PITR, backup integrity, or RPO/RTO. It only repairs the historical schema/auth replay path.
