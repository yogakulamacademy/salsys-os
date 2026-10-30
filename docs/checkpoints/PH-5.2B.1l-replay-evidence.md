# PH-5.2B.1l — Analytics / SEO cold-rebuild replay evidence

Date: 2026-10-30
Scope: isolated schema-only Supabase development branch
Production DDL/data changes: none
Disposable branch deleted after evidence capture: yes

## Starting point

A fresh disposable branch reproduced the established cold-rebuild sequence from migrations `001`–`006`.

The previously proven recovery artifacts were then replayed in historical order through migration `038_whatsapp_message_status_tenant_hardening`.

## Migration 039 recovery prerequisites

The pre-039 recovery contract consisted of:

- `supabase/recovery/039_analytics_seo_warehouse_baseline.sql`
- `supabase/recovery/039_leads_landing_page_baseline.sql`

The warehouse baseline reconstructs the 13 missing GA4/GSC warehouse tables required by migration 039, with tenant ownership, constraints, indexes, RLS, explicit least-privilege grants, and GSC updated-at triggers.

During the first post-warehouse replay, migration 039 progressed through the GA4 reporting views and then exposed one additional historical drift column:

`public.leads.landing_page`

Production read-only inspection proved its current contract is nullable `text` with no default. The checked migration history did not contain a pre-039 creation for that field, so the recovery baseline adds only that column and copies no lead data.

## Proven replay result

After installing the complete 039 recovery prerequisites:

- `039_analytics_seo_tenant_hardening` ✅

The migration completed its Analytics and SEO reporting views and both workspace RPCs.

## Next independent boundary

The recorded chain then advanced to migration `040_campaigns_google_ads_tenant_hardening` and stopped immediately because:

`relation "public.google_ads_campaign_daily" does not exist`

Migration 040 describes the Campaigns / Google Ads reporting objects as having previously existed only in the live database. This is therefore treated as the next independent cold-rebuild subsystem boundary, not as part of the migration 039 recovery contract.

## Safety

- no production schema or data were changed
- no Analytics, SEO, Google Ads, credential, or integration rows were copied
- recovery SQL remains outside the normal production migration ledger
- the disposable Supabase branch was deleted immediately after evidence capture, stopping the hourly branch charge
- PR #355 remains draft

## Proven frontier

Cold-rebuild compatibility is now proven through **migration `039_analytics_seo_tenant_hardening` inclusive**.
