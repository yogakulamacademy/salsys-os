# PH-5.2B.1e — Cold-Rebuild Replay Evidence

**Date:** 2026-10-30  
**Scope:** isolated schema-only cold-rebuild rehearsal; production unchanged

## Rehearsal setup

A disposable Supabase development branch was created at the confirmed branch rate of `$0.01344/hour`, with production data excluded.

The branch initialized at migrations `001` through `006`. The rehearsal then pre-seeded the already-proven historical prerequisites required to cross the `006 -> 007` boundary:

- `courses.source_system text`
- `courses.external_course_id text`
- `course_batches.source_system text`
- `course_batches.external_batch_id text`
- `is_crm_admin()`
- `can_view_lead_pii()`
- legacy recovery-only `can_access_lead(uuid)`

Supabase replay then applied migrations `007` through `015` successfully.

At the `015 -> 016` boundary, the rehearsal applied the two recovery-only compatibility baselines already captured in the draft PR:

- `supabase/recovery/016_enrollments_tenant_baseline.sql`
- `supabase/recovery/016_lead_contact_logs_baseline.sql`

## Result

Migration `016_journey_workspace_hardening` progressed beyond both previously observed failures:

1. `public.enrollments.organization_id` was present and no longer blocked the view definition.
2. `public.lead_contact_logs` was present and no longer blocked the view definition.

The next failure occurred while migration `016` created `public.v_source_journey_summary`:

- PostgreSQL SQLSTATE: `42P01`
- error: `relation "public.v_lead_journey_intelligence" does not exist`

This proves that both PH-5.2B.1d and PH-5.2B.1e recovery baselines are effective and that `public.v_lead_journey_intelligence` is the next independent historical prerequisite.

## Provenance audit for the next boundary

Repository and production-ledger evidence show:

- migration `016` references `public.v_lead_journey_intelligence` but does not create it;
- no checked-in migration before `016` creates `public.v_lead_journey_intelligence`;
- the production migration ledger likewise contains no earlier creation statement for it;
- application commit `dee6c798822ddcb77011dd56a446835494db5bee` (`Add lead journey and repeat visit intelligence`, 2026-09-26) added UI/application consumers of `v_lead_journey_intelligence` and `v_lead_session_journey`, but did not add SQL migration files;
- therefore the journey views existed in production outside the recorded migration chain before migration `016` was captured;
- `v_lead_journey_intelligence` depends on `public.v_lead_session_journey`;
- `v_lead_session_journey` was only version-captured much later in `20261028033543_optimize_lead_session_journey_lookup.sql` and hardened later again.

## Safety decision

Do **not** add a guessed journey-view bootstrap yet.

Before a recovery baseline is version-captured, prove that the later recorded definitions of both journey views are compatible with the schema available immediately after migration `015`, or reconstruct an earlier definition from stronger historical evidence.

This avoids pulling later schema dependencies backward into the `016` recovery boundary.

## Cleanup

The disposable Supabase branch was deleted immediately after evidence capture. There is no continuing branch charge. Production database state and production migration history were not changed.

## Next checkpoint

**PH-5.2B.1f — journey-view recovery baseline audit**

Required next evidence:

1. dependency inventory for the later `v_lead_session_journey` definition against the `001-015` schema;
2. dependency inventory for the current `v_lead_journey_intelligence` definition;
3. security/grant compatibility for both views;
4. decide whether to use later version-captured definitions as recovery baselines or reconstruct a narrower historical definition;
5. only then add recovery SQL and run another isolated replay.
