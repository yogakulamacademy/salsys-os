# PH-5.2B.1h / 1i — Cold-Rebuild Replay Evidence

**Date:** 2026-10-30  
**Scope:** isolated schema-only cold-rebuild rehearsal; production unchanged

## Rehearsal environment

A disposable Supabase development branch was created from SalsysOS Production with production data excluded. The quoted branch rate was `$0.01344/hour`.

The branch replayed the recorded production migration chain with only versioned cold-recovery compatibility prerequisites preloaded at their proven historical boundaries.

The disposable branch was deleted immediately after the next independent boundary was captured.

## PH-5.2B.1h — attribution recovery

Migration `020_attribution_workspace_tenant_scope` historically expected both of these read models to already exist:

- `public.v_attribution_lead_facts`
- `public.v_attribution_model_rows`

No migration before `020` records either view.

Production inspection proved that `020` appends `organization_id` as the final column to both views using `CREATE OR REPLACE VIEW`, while preserving their prior column order/types. Production also confirms both views use `security_invoker=true`.

A second unversioned prerequisite was identified on `public.leads`:

- `last_touch_source text`
- `last_touch_medium text`
- `last_touch_campaign text`

All three are nullable with no default in production and are consumed by the attribution view contract.

Recovery artifacts:

- `supabase/recovery/018_person_journey_source_baseline.sql` — extended with the three `last_touch_*` fields
- `supabase/recovery/020_attribution_views_baseline.sql` — reconstructs the pre-020 attribution views without prematurely adding `organization_id`

Replay result:

- `020_attribution_workspace_tenant_scope` ✅
- `021_canonical_attribution_facts` ✅
- `022_normalize_attribution_enrollment_boolean` ✅

No additional compatibility repair was required for migrations `021` or `022`.

## PH-5.2B.1i — integration connection foundation

The next failure occurred in migration `023_integration_api_credentials`:

`relation "public.integration_connections" does not exist`

No migration before `023` records `public.integration_connections`.

Production inspection proved the missing historical foundation includes:

- tenant-scoped `integration_connections` table
- organization/profile/self-parent foreign keys
- connection status invariant
- organization, provider/status, parent, and tenant/provider/external lookup indexes
- `touch_integration_updated_at()` trigger function
- `enforce_integration_connection_parent_org()` trigger function
- updated-at trigger
- same-organization parent guard trigger
- RLS enabled
- fail-closed `deny_direct_client_access` policy

Provider and auth-mode checks are intentionally not recreated by the recovery baseline because migration `023` immediately drops/replaces those constraints as part of its own contract. Production's later Instagram provider expansion is therefore not pulled backward into the pre-023 historical state.

Recovery artifact:

- `supabase/recovery/023_integration_connections_baseline.sql`

Replay result after applying this structural baseline:

- `023_integration_api_credentials` ✅
- `024_integration_credential_management` ✅
- `025_integration_credential_lifecycle` ✅
- `026_credential_bound_website_lead_ingestion` ✅
- `027_course_tracking_alias_resolver` ✅
- `028_course_capture_value_aliases` ✅
- `029_person_course_affinity` ✅

No additional compatibility repair was required for migrations `024` through `029`.

## Next independent boundary — migration 030

Migration `030_lead_sales_intelligence` stops while creating `public.v_lead_sales_intelligence` because:

`relation "public.v_admissions_priority_queue" does not exist`

Further inspection of the clean replay showed the migration-030 dependency set is broader than one view:

- `public.v_admissions_priority_queue` — missing
- `public.v_lead_revenue_status` — missing
- `public.v_paid_media_leads_ui` — missing
- `public.v_followups_due` — present

No migration before `030` records `v_admissions_priority_queue`.

This is intentionally treated as the next distinct recovery bundle rather than being stubbed during the 1i rehearsal.

## Proven migration frontier

The schema-only cold-rebuild frontier is now:

**migration `029_person_course_affinity` inclusive**

The next checkpoint is:

**PH-5.2B.1j — reconstruct the admissions/sales read-model prerequisites required by migration 030, replay migration 030, and continue until the next independent boundary.**

## Safety statement

- Production schema and production data were not modified.
- No production connection or credential rows were copied into the rehearsal.
- Recovery artifacts remain isolated cold-rebuild compatibility files, not normal production migrations.
- The disposable Supabase branch was deleted after evidence capture, stopping the hourly branch charge.
