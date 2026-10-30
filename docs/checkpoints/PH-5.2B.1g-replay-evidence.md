# PH-5.2B.1g — Cold-Rebuild Replay Evidence

**Date:** 2026-10-30  
**Scope:** isolated schema-only cold-rebuild rehearsal; production unchanged

## Rehearsal environment

A disposable Supabase development branch was created from SalsysOS Production with production data excluded. The quoted branch rate was `$0.01344/hour`.

The branch began at the known clean migration boundary `001` through `006`. The already-proven migration-007 prerequisites were pre-seeded, then the branch replayed the production migration ledger.

The branch was deleted immediately after evidence capture so the hourly branch charge stopped.

## Proven progression

The rehearsal reconfirmed that the existing `007` recovery prerequisites allow migrations `007` through `015` to apply.

After applying the already-versioned migration-016 recovery baselines:

- `supabase/recovery/016_enrollments_tenant_baseline.sql`
- `supabase/recovery/016_lead_contact_logs_baseline.sql`
- `supabase/recovery/016_journey_views_baseline.sql`

migration `016_journey_workspace_hardening` applied successfully in full.

This is the first clean replay evidence that the PH-5.2B.1f journey-view baseline clears the complete `015 -> 016` boundary.

## Migration 017 — payment tenant prerequisite

The next failure was migration `017_person_360` with:

`column p.organization_id does not exist`

Inspection proved that the missing alias was `public.payments p`, not `public.persons p`.

Production evidence:

- `payments.organization_id uuid NOT NULL`
- no default
- FK `payments_organization_id_fkey -> organizations(id) ON DELETE RESTRICT`
- `payments.lead_id` is mandatory
- both current production payment rows have organization IDs that exactly match their linked Lead organization
- no recorded migration before `017` creates the payment tenant column

`supabase/recovery/017_payments_tenant_baseline.sql` reconstructs that missing historical state by adding the nullable column, deterministically inheriting organization from the mandatory Lead relationship, failing closed if any row remains unresolved, setting NOT NULL, and restoring the production FK.

After applying that baseline, migration `017_person_360` applied successfully.

## Migration 018 — journey-source prerequisites

Migration `018_person_journey` then exposed two sequential schema-drift groups.

First failure:

`column t.geo_country does not exist`

Production defines:

- `touchpoints.geo_country text`
- `touchpoints.geo_region text`
- `touchpoints.geo_city text`
- `web_sessions.geo_country text`
- `web_sessions.geo_region text`
- `web_sessions.geo_city text`
- `web_sessions.geo_timezone text`

All are nullable with no defaults. The clean replay had none of them. Migration `015` already contains website normalization code that writes the geo fields, while `018` is the first replay point that forces the missing touchpoint columns to resolve during view creation.

After restoring the geo contract, `018` advanced and failed with:

`column l.lead_origin does not exist`

Production defines four related nullable text columns with no defaults:

- `leads.lead_origin`
- `leads.first_touch_source`
- `leads.first_touch_medium`
- `leads.first_touch_campaign`

`supabase/recovery/018_person_journey_source_baseline.sql` reconstructs both source-column groups without adding data, indexes, triggers, or defaults.

After applying that baseline, migration `018_person_journey` applied successfully.

## Migration 019 — Leads workspace prerequisites

Migration `019_leads_workspace_tenant_scope` first stopped on its explicit safety assertion:

`v_leads_overview.organization_id is required`

The pre-019 replay view retained its complete 45-column legacy shape but lacked `organization_id`. The recovery baseline preserves the existing column order and appends `l.organization_id` as the final column while retaining `security_invoker=true`.

After that repair, migration `019` advanced and failed because:

`relation "public.v_pipeline_stage_aging" does not exist`

Production inspection proved that the missing view itself depends on two additional unversioned configuration-schema objects:

- `pipeline_stage_aging_rules`
- `organization_pipeline_stage_aging_rules`

The recovery baseline captures the production table constraints, RLS posture, read/write policy shape needed for the historical workspace, the default-rule updated-at trigger, the `security_invoker` stage-aging view, and the tenant column on `v_leads_overview`.

No production stage-aging configuration rows are copied into the recovery file; configuration/data recovery remains separate from schema/read-model compatibility.

`supabase/recovery/019_leads_workspace_baseline.sql` cleared this boundary and migration `019_leads_workspace_tenant_scope` applied successfully.

## Next independent boundary

The replay then reached migration `020_attribution_workspace_tenant_scope` and stopped with:

`public.v_attribution_lead_facts is required`

This is the next independent historical cold-rebuild dependency. It was not analyzed or repaired during PH-5.2B.1g.

## Proven migration frontier

With the recovery artifacts now captured in PR #355, the schema-only cold-rebuild frontier has advanced from migration `015` to migration `019` inclusive.

The next checkpoint is therefore:

**PH-5.2B.1h — reconstruct the pre-020 attribution read-model prerequisites, replay migration 020, and continue until the next independent boundary.**

## Safety statement

- Production schema/data were not changed by this rehearsal.
- The disposable Supabase branch was deleted after evidence capture.
- Recovery files under `supabase/recovery/` are isolated cold-rebuild compatibility artifacts, not normal production migrations.
