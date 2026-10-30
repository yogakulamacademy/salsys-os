# PH-5.2B.1m — Campaigns / Google Ads cold-recovery mapping

Date: 2026-10-30
Scope: read-only production mapping + repository recovery artifacts
Production DDL/data changes: none
Replay status: pending isolated disposable branch

## Proven prior frontier

PH-5.2B.1l proved the cold-rebuild chain through migration `039_analytics_seo_tenant_hardening` inclusive.

The next recorded migration, `040_campaigns_google_ads_tenant_hardening`, fails immediately because `public.google_ads_campaign_daily` does not exist.

Migration 040 explicitly states that its Campaigns / Google Ads reporting objects previously existed only in the live database.

## Pre-040 warehouse prerequisite set

### Google Ads

1. `google_ads_sync_runs`
2. `google_ads_campaign_daily`
3. `google_ads_keyword_daily`
4. `google_ads_search_term_daily`
5. `google_ads_geo_daily`
6. `google_ads_device_daily`

### Meta Ads required by the Campaigns cross-platform RPC

7. `meta_ads_sync_runs`
8. `meta_ads_campaign_daily`
9. `meta_ads_adset_daily`
10. `meta_ads_ad_daily`

The Meta tables are required because the pre-040 `v_meta_ads_campaign_crm_30d` dependency ultimately resolves campaign/ad-set/ad names through those warehouse tables.

## Pre-040 helper/read-model prerequisite set

Migration 040's Campaigns workspace also assumes the following live-only objects already exist:

### Helper functions

- `campaign_workspace_json_text(jsonb, text[])`
- `campaign_workspace_json_numeric(jsonb, text[])`

### Google read models

- `v_google_ads_reporting_window`
- `v_google_ads_lead_campaign_attribution`
- `v_google_ads_lead_revenue`
- `v_google_ads_campaign_crm_30d`

### Meta read models

- `v_meta_ads_reporting_window`
- `v_meta_ads_lead_attribution`
- `v_meta_ads_lead_revenue`
- `v_meta_ads_campaign_crm_30d`

Checked migration history contains later references/hardening for some of these objects but does not contain their pre-040 creation contract.

## Production contract mapped read-only

Production confirms:

- Google and Meta warehouse rows carry `organization_id uuid NOT NULL`
- organization FKs use `ON DELETE RESTRICT`
- metric rows optionally reference provider sync runs with `ON DELETE SET NULL`
- provider-specific unique indexes include `organization_id`
- RLS is enabled on all mapped provider tables
- Google tables allow authenticated tenant-scoped reads through `is_organization_member(organization_id)`
- Meta tables use the CRM-user + organization membership read boundary
- provider metric tables use `google_ads_set_updated_at()` / `meta_ads_set_updated_at()` triggers
- all eight prerequisite reporting views are `security_invoker=true`
- Campaigns JSON helper functions are immutable and use a fixed `pg_catalog, public` search path

## Historical boundary decision

Current production `google_ads_sync_runs` and `meta_ads_sync_runs` also contain:

- `connection_id`
- `integration_asset_id`

Migration 040 does not reference these columns and checked pre-040 migration history does not prove they belonged to this boundary. The recovery baseline therefore does not pull them backward.

## Recovery artifacts

- `supabase/recovery/040_paid_media_warehouse_baseline.sql`
- `supabase/recovery/040_campaigns_read_models_baseline.sql`
- `scripts/verify-recovery-readiness-1m.mjs`

The recovery SQL contains schema/read-model compatibility only. It copies no ad, CRM, payment, integration, credential, or provider data from production.

## Replay plan

On the next isolated schema-only Supabase development branch:

1. replay the already-proven recovery chain through migration 039
2. apply `040_paid_media_warehouse_baseline.sql`
3. apply `040_campaigns_read_models_baseline.sql`
4. resume the recorded migration chain
5. verify migration 040 completes
6. continue until the next independent cold-rebuild boundary
7. capture evidence
8. delete the paid branch immediately

No merge to production is permitted until the full PH-5.2B cold-rebuild chain and final security/schema parity checks are proven.
