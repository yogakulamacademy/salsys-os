# PH-5.2B.1l — Analytics / SEO recovery mapping

Date: 2026-10-30
Scope: read-only production mapping + repository recovery artifact
Production DDL/data changes: none
Replay status: pending isolated disposable branch

## Proven prior frontier

The preceding cold-rebuild rehearsal reached migration `038_whatsapp_message_status_tenant_hardening` inclusive.

Migration `039_analytics_seo_tenant_hardening` then failed because `public.ga4_daily` did not exist.

## What migration 039 actually owns

Migration 039 does not create the Analytics/SEO warehouse tables. It assumes they already exist and canonicalizes tenant-aware reporting above them:

- GA4 30-day views and sync health
- CRM/GA4 reconciliation views
- GSC overview
- SEO 30-day views, opportunity classification, and sync health
- Analytics workspace RPC
- SEO workspace RPC
- reporting-view least-privilege grants

## Unversioned warehouse prerequisite set

The checked migration history does not contain a pre-039 `CREATE TABLE` foundation for the warehouse family that 039 consumes.

The required base tables are:

### GA4

1. `ga4_daily`
2. `ga4_source_medium_daily`
3. `ga4_landing_page_daily`
4. `ga4_campaign_daily`
5. `ga4_country_daily`
6. `ga4_sync_runs`

### GSC

7. `gsc_sync_runs`
8. `gsc_daily`
9. `gsc_query_daily`
10. `gsc_page_daily`
11. `gsc_country_daily`
12. `gsc_device_daily`
13. `gsc_search_appearance_daily`

## Production contract mapped read-only

Current production confirms all 13 tables are tenant scoped with `organization_id uuid NOT NULL` and an FK to `organizations(id) ON DELETE RESTRICT`.

GA4 metric tables use bigint surrogate IDs, property/date dimensions, metric defaults, and organization-aware unique indexes.

GSC metric tables use UUID IDs, site/date/search-type dimensions, optional sync-run ownership, metric defaults, and organization-aware unique indexes.

`gsc_sync_runs` is created before the GSC metric tables because the metric tables reference it with `ON DELETE SET NULL`.

Production security shape:

- RLS enabled on all 13 tables
- authenticated SELECT policy on each table using `is_organization_member(organization_id)`
- GSC metric tables retain `set_updated_at()` triggers
- `set_updated_at()` is already versioned from migration 001

## Supabase 2026 Data API boundary

Supabase now requires explicit table grants for new public-schema objects instead of relying on automatic exposure. The recovery baseline therefore makes privileges explicit:

- anon: no table privileges
- authenticated: SELECT only
- service_role: worker access

This is intentionally tighter than the legacy implicit production ACL while preserving the effective tenant-read / service-worker behavior enforced by RLS.

## Historical boundary decision

Current production `ga4_sync_runs` and `gsc_sync_runs` also contain:

- `connection_id`
- `integration_asset_id`

Migration 039 does not reference these fields, and the checked migration history does not prove they belonged to the pre-039 warehouse foundation. The 1l baseline therefore does not pull those integration-reference columns backward.

## Recovery artifact

- `supabase/recovery/039_analytics_seo_warehouse_baseline.sql`
- `scripts/verify-recovery-readiness-1l.mjs`

The baseline contains schema only. It copies no Analytics, SEO, integration, credential, or provider data from production.

## Replay plan

On the next isolated schema-only Supabase development branch:

1. replay the already-proven recovery chain through migration 038
2. apply `039_analytics_seo_warehouse_baseline.sql`
3. rebase the recorded migration chain
4. verify migration 039 completes
5. continue until the next independent boundary
6. capture evidence
7. delete the paid branch immediately

No merge to production is permitted until the broader PH-5.2B cold-rebuild chain is proven and final security/schema checks pass.
