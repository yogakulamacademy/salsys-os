# PH-5.2B.1e — Lead Contact Log Replay Evidence

Date: 2026-10-30

## Disposable replay result

A fresh Supabase development branch was created at the confirmed branch rate of `$0.01344/hour` and deleted immediately after evidence capture.

The branch began with migration history `001` through `006` only. The isolated harness pre-seeded the seven already-proven migration-007 prerequisites, then successfully replayed migrations `007` through `015`.

After applying `supabase/recovery/016_enrollments_tenant_baseline.sql`, migration `016_journey_workspace_hardening` advanced beyond the previous missing `enrollments.organization_id` failure and then stopped with PostgreSQL `42P01`:

`relation "public.lead_contact_logs" does not exist`

The failing statement is the `create or replace view public.v_contact_intelligence_touch_journey` statement in migration `016`, whose FROM clause references `public.lead_contact_logs lcl`.

## Production evidence

Production currently defines `public.lead_contact_logs` with:

- 14 columns;
- primary key `id uuid default gen_random_uuid()`;
- mandatory `lead_id` FK to `public.leads(id) ON DELETE CASCADE`;
- nullable `employee_user_id` FK to `public.profiles(id) ON DELETE SET NULL`;
- method, direction, outcome, source, comment-length and call-duration checks;
- indexes `idx_lead_contact_logs_employee_time`, `idx_lead_contact_logs_lead_time`, `idx_lead_contact_logs_method_time`, `idx_lead_contact_logs_outcome_time`;
- partial unique index `uq_lead_contact_logs_external_reference` on `(source, external_reference)` where `external_reference is not null`;
- RLS enabled;
- authenticated SELECT policy `can_access_lead(lead_id)`;
- authenticated SELECT grant only;
- service-role table privileges;
- no custom triggers;
- 37 current rows.

The production migration ledger contains no recorded `ALTER TABLE public.lead_contact_logs`, and no migration before `016` creates the table.

## Recovery response

`supabase/recovery/016_lead_contact_logs_baseline.sql` version-captures this missing historical object for isolated cold recovery only. It does not add tenant columns, triggers, application data, or production-side mutations.

## Gate state

Exact head `9dd7d9fcff1a19cb45056f779ae0815f22686e5d` passed:

- PH-5 Recovery Readiness Contract
- TypeScript
- full Next.js build
- CI
- CodeQL workflow
- GitHub Advanced Security: no new alerts in changed code
- Vercel preview READY

A new disposable replay is required to determine whether migration `016` now completes and to discover the next historical drift boundary, if any.
