# PH-5.2B.1j–1k replay evidence

Date: 2026-10-30
Scope: isolated schema-only cold-recovery rehearsal
Production changes: none
Disposable branch: deleted after evidence capture

## Starting point

A fresh Supabase development branch replayed the production migration ledger from migration 001.

The established recovery prerequisites were re-proven in sequence:

- 007 website-sync columns + legacy authorization compatibility
- 016 enrollment tenant ownership + contact-log + journey-view baselines
- 017 payment tenant ownership
- 018 geo/source compatibility
- 019 leads/stage-aging workspace foundation
- 020 attribution-view compatibility
- 023 integration-connection foundation

The recorded chain then reached migration `029_person_course_affinity` successfully.

## PH-5.2B.1j — migration 030 sales/read-model recovery

Migration `030_lead_sales_intelligence` required historical reporting objects that existed in production but were never created by the recorded pre-030 chain.

Recovery artifacts:

- `supabase/recovery/030_lead_geo_baseline.sql`
- `supabase/recovery/030_followups_tenant_baseline.sql`
- `supabase/recovery/030_sales_read_models_baseline.sql`

Proven hidden prerequisites:

1. `leads.geo_country`, `leads.geo_region`, `leads.geo_city`
   - production shape: nullable `text`, no defaults
2. `tasks.organization_id`
   - production shape: `uuid NOT NULL`, no default
   - FK to `organizations(id) ON DELETE RESTRICT`
   - cold recovery derives tenant ownership from mandatory `tasks.lead_id`
3. tenant-aware `v_followups_due`
   - `security_invoker=true`
   - includes `organization_id`
   - joins tasks/leads on both lead id and organization id
4. reporting stack required by admissions priority logic:
   - `v_lead_payment_totals`
   - `v_lead_revenue_status`
   - `v_paid_media_leads`
   - `v_paid_media_leads_ui`
   - `v_admissions_priority_queue`

The paid-media compatibility layer intentionally does **not** pull the later Google/Meta ad-warehouse tables backward into migration 030. Acquisition-cost / campaign-spend / ROAS fields remain null or explicitly unavailable until their later historical boundary owns those objects.

Replay result:

- `030_lead_sales_intelligence` ✅
- `031_lead_conversion_facts` ✅

## PH-5.2B.1k — migration 032 integration-assets recovery

Migration `032_conversion_feedback_foundation` failed because `public.integration_assets` did not exist in the recorded chain.

Production evidence showed the table is a tenant-owned child of `integration_connections`, with:

- organization + connection foreign keys
- unique `(connection_id, asset_type, external_id)`
- status invariant
- selected/connection/organization indexes
- RLS enabled
- fail-closed direct-client policy
- organization derivation trigger
- updated-at trigger

Recovery artifact:

- `supabase/recovery/032_integration_assets_baseline.sql`

The recovery asset-type constraint is intentionally limited to the two types migration 032 itself proves it needs:

- `google_ads_customer`
- `meta_ad_account`

Later provider expansions are not pulled backward without historical evidence.

Replay result:

- `032_conversion_feedback_foundation` ✅
- `033_conversion_feedback_queue_lifecycle` ✅
- `034_tracking_consent_ledger` ✅
- `035_conversion_feedback_match_context` ✅
- `036_integration_connection_subject_uniqueness` ✅
- `037_lead_ingest_events_tenant_hardening` ✅
- `038_whatsapp_message_status_tenant_hardening` ✅

## Next independent boundary

The next migration is:

`039_analytics_seo_tenant_hardening`

Replay stops because:

`relation "public.ga4_daily" does not exist`

This is intentionally **not** repaired inside 1k. Migration 039 is a broad analytics/SEO canonicalization boundary and expects a larger historical reporting foundation, including the GA4 daily/reporting family and downstream Analytics/SEO read models.

The next recovery checkpoint should map the full migration-039 prerequisite set read-only before another paid replay branch is created.

## Safety evidence

- current production schema/data were not changed
- no production integration assets or credentials were copied
- no production ad/analytics rows were copied
- all recovery SQL was executed only on the disposable development branch
- recovery files remain outside the normal production migration ledger
- the disposable branch was deleted after evidence capture, stopping the hourly branch charge

## Verification contracts

- `scripts/verify-recovery-readiness-1j.mjs`
- `scripts/verify-recovery-readiness-1k.mjs`
- `npm run verify:recovery-readiness` includes both checkpoints
