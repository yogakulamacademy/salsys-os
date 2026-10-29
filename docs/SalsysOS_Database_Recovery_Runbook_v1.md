# SalsysOS Database Recovery Runbook v1

**Date:** 2026-10-29  
**Status:** PH-5.2A recovery procedure and verification contract  
**Scope:** Supabase/Postgres recovery, application continuity, durable event handling, and post-restore validation

This runbook operationalizes `docs/SalsysOS_Resilience_Principles.md`. It does not replace provider documentation and does not authorize destructive production actions by itself.

## 1. Recovery objectives

SalsysOS uses separate controls for stored-state recovery and in-flight event durability.

- **Target production RPO:** <= 2 minutes once PITR is verified enabled and retained for the required window.
- **Fallback daily-backup RPO:** may be up to approximately 24 hours if PITR is not enabled.
- **Target production RTO:** <= 30 minutes for the current small database profile, after an isolated restore rehearsal proves that target.
- The RPO/RTO values above are internal operating objectives, not provider SLAs.
- Until PITR state and an isolated restore rehearsal are proven, RPO/RTO must be reported as **target**, not **proven**.

## 2. Current audited recovery profile

Audited on 2026-10-29:

- Supabase project: `SalsysOS Production`
- plan: Pro
- region: `ap-southeast-1`
- PostgreSQL: 17.6
- database size: approximately 167 MB
- Supabase Storage objects: 0
- logical subscriptions: 0
- replication slots: 0
- production schema is migration-managed
- trusted business-event ingestion has an independent Vercel durable queue
- current durable queue retention is 7 days
- current durable queue consumer concurrency is capped at 5

**PITR enabled/disabled state is not yet verified by connected management tooling.** Do not claim PITR is active until PH-5.2B records provider evidence for the recovery window.

## 3. Incident declaration

Declare a database recovery incident when one or more of these are true:

1. production Postgres is unavailable long enough to affect normal operations;
2. confirmed destructive or corrupting writes require rollback to an earlier database state;
3. database state cannot be trusted from normal application-level repair;
4. Supabase advises restore as the recovery path.

Record before any restore action:

- incident start time in UTC;
- detected failure/corruption window;
- last known-good business event/time;
- affected organizations and workflows;
- current production Git/Vercel deployment SHA;
- current Supabase project reference;
- intended recovery point and why it is safe;
- operator approving the destructive restore action.

## 4. Restore authority and safety rules

A production restore is destructive to database changes after the selected recovery point.

Therefore:

- never start an in-place production restore as a test;
- never guess the recovery point;
- never expose or copy database/service secrets into incident notes;
- never weaken RLS, authentication, tenant isolation, or provider authorization to make recovery easier;
- do not mutate unrelated crons, queues, integrations, or provider settings during the restore;
- use an isolated recovery environment for rehearsal whenever possible;
- any paid recovery project/add-on must be explicitly approved before creation/enabling.

## 5. Choosing the recovery point

Preferred order:

1. **PITR**, if verified enabled and the requested point is inside the provider recovery window;
2. the closest provider daily backup made before the destructive event;
3. provider-supported/manual recovery path documented for the incident.

For an accidental destructive write, choose the latest safe point **before** the first bad transaction, not merely the latest available timestamp.

Record:

- earliest provider recovery point;
- latest provider recovery point;
- selected target timestamp;
- expected data-loss window;
- whether queued/trusted events exist after the selected point and can replay safely.

## 6. Expected system behavior during database unavailability

### 6.1 Authenticated application

Database/Auth-dependent application paths may be unavailable or degraded. Security-sensitive authorization must remain fail-closed.

### 6.2 Trusted business-event ingestion

The trusted event path is:

`trusted source -> /api/events/v1 -> Vercel durable queue -> private consumer -> Supabase/Postgres`

The durable queue is independent of Supabase. Current code requests 7-day retention and uses stable idempotency keys. The private consumer returns a non-2xx/503 response for transient Supabase failures so Vercel can retry rather than acknowledge the message.

This protects trusted events arriving during a temporary database outage, subject to the queue retention window and provider availability.

### 6.3 Vercel scheduled jobs

Vercel Cron invocations should not be assumed to replay every missed schedule automatically. Jobs that execute during database downtime may fail and wait for their next normal schedule unless their own workflow has backlog/catch-up semantics.

After restore, verify each critical scheduled workflow from persisted evidence rather than assuming the cron trigger itself recovered work.

### 6.4 Database-local pg_cron

Database-local cron stops while Postgres is unavailable. Missed pg_cron invocations are not assumed to replay automatically.

Persisted work queues/state must therefore be checked after recovery, including where relevant:

- `automation_scheduled_jobs`
- `raw_event_processing`
- `search_index_outbox`
- `seo_embedding_outbox`

## 7. Production restore sequence

Only execute this section during an approved recovery incident.

1. Confirm the incident and selected recovery point.
2. Confirm current provider backup/PITR evidence in Supabase.
3. Confirm the current production Git/Vercel SHA and preserve it unless application rollback is independently required.
4. Notify operators that authenticated CRM functions may remain unavailable during restore.
5. Start the provider-supported Supabase restore to the approved recovery point.
6. Do not redeploy application code merely because the database is restoring.
7. Wait for Supabase to report the project healthy before application validation.
8. Run the validation sequence in Section 8.
9. Reconcile business events created after the restore point before declaring recovery complete.
10. Record actual restore start/end timestamps and calculate observed RPO/RTO.

## 8. Post-restore validation sequence

Recovery is not complete when the database merely becomes reachable.

### 8.1 Platform health

- Supabase project reports healthy.
- Production Vercel deployment/aliases still resolve to the expected SHA.
- Protected routes still require authentication.
- No unexpected production error/fatal spike appears during validation.

### 8.2 Schema and migration integrity

- migration history is present and includes the expected latest production migration;
- critical schemas/tables/views/functions are present;
- no unexpected migration drift is introduced by the restore procedure.

### 8.3 Authentication and tenant isolation

- Auth users are present;
- organization memberships resolve correctly;
- active workspace binding works;
- Admin and Employee authorization remains separated;
- representative cross-tenant access remains denied;
- RLS/security-invoker boundaries remain intact.

### 8.4 CRM business truth

Verify representative records and totals for:

- leads;
- conversations/messages;
- follow-ups;
- payments/enrollments;
- course/batch references;
- attribution/revenue evidence;
- admissions automation run history.

Do not validate only aggregate counts; inspect representative canonical records and tenant ownership.

### 8.5 Event and automation recovery

- inspect `raw_events` and `raw_event_processing` for backlog/failures/dead-letter states;
- verify durable queue consumer processing resumes;
- verify stable event IDs prevent duplicates during replay;
- inspect overdue `automation_scheduled_jobs` and their retry/claim state;
- verify critical provider runners resume normal execution;
- verify admissions scheduler health is based on real `admissions_auto_task_runs` outcomes.

### 8.6 Provider reconciliation

Where the source provider can contain authoritative facts newer than the selected restore point, reconcile provider truth against SalsysOS before declaring full recovery.

Priority examples:

- payment/enrollment provider facts;
- WhatsApp message status/outbound lineage;
- Instagram inbound/retry state;
- trusted-source event IDs versus persisted `raw_events`.

## 9. Recovery completion criteria

A database incident may be marked **recovered** only when:

1. Supabase is healthy;
2. application authentication and tenant authorization are proven;
3. migration/schema integrity is proven;
4. representative CRM and commercial records are consistent;
5. durable event ingestion is processing again;
6. automation/backlog state has been evaluated;
7. critical provider reconciliation is complete or explicitly tracked;
8. observed RPO/RTO are recorded;
9. no unresolved critical data-loss or cross-tenant integrity issue remains.

Use evidence language consistently:

- BUILT
- MERGED
- DEPLOYED
- TESTED
- PROVEN E2E

## 10. Isolated restore rehearsal (PH-5.2B)

Do not use the production project for the rehearsal.

Before creating a paid recovery project or enabling a paid PITR add-on:

1. obtain the provider cost/retention details;
2. obtain explicit approval for nonzero cost;
3. choose an isolated target environment;
4. restore/clone using a provider-supported method;
5. run the Section 8 validation sequence against the isolated environment;
6. record actual restore duration and validation duration;
7. compare observed results against the target RPO/RTO;
8. delete/retire the isolated environment after evidence is captured, when appropriate.

A development branch alone is not proof of production-data restore because Supabase branches do not carry production data by default.

## 11. PH-5.2 evidence record

Maintain the following evidence for each production recovery capability review or rehearsal:

- audit date;
- Supabase plan and compute tier;
- PITR enabled/disabled;
- recovery retention period;
- earliest recovery point;
- latest recovery point;
- daily backup availability if PITR is disabled;
- database size;
- Storage object count;
- logical subscription/replication-slot count;
- selected recovery point;
- restore start/end;
- observed RPO;
- observed RTO;
- validation result;
- unresolved blockers;
- operator/approver.

## 12. References

- `docs/SalsysOS_Resilience_Principles.md`
- `docs/durable-event-ingestion-v1.md`
- `vercel.json`
- `app/api/tracking/durable-events/consume/route.ts`
- `lib/tracking/durable-events.ts`
- Supabase Database Backups documentation
- Supabase Point-in-Time Recovery documentation
