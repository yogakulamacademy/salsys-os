# PH-5.2B.1j — sales/read-model recovery

## Boundary

A clean cold-rebuild replay reached migration `030_lead_sales_intelligence` with the recorded chain through migration 029, but the historical sales/admissions reporting stack was missing.

## Proven recovery contract

Recovery artifacts:

- `supabase/recovery/030_lead_geo_baseline.sql`
- `supabase/recovery/030_followups_tenant_baseline.sql`
- `supabase/recovery/030_sales_read_models_baseline.sql`

The recovery bundle restores only the pre-030 contracts needed by the migration:

- nullable lead geo fields used by paid-media reads
- tenant ownership on `tasks`, derived from mandatory `lead_id`
- tenant-aware `v_followups_due`
- lead payment/revenue read models
- paid-media compatibility read models
- admissions priority queue

The paid-media compatibility layer deliberately leaves later ad-warehouse acquisition metrics null/unavailable rather than pulling Google/Meta warehouse tables backward before their own migration boundary.

All recovery views use `security_invoker=true` and no production reporting data is copied.

## Replay result

Fresh isolated replay on 2026-10-30 proved:

- `030_lead_sales_intelligence` ✅
- `031_lead_conversion_facts` ✅

The replay then exposed the next independent historical gap at migration 032: missing `public.integration_assets`.

Full replay evidence continues in:

- `docs/checkpoints/PH-5.2B.1j-1k-replay-evidence.md`

## Safety

- recovery-only SQL; not part of normal production migration history
- current production schema/data unchanged
- no production ad/reporting rows copied
- verifier: `scripts/verify-recovery-readiness-1j.mjs`
