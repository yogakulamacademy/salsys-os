import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Recovery readiness verification failed: ${message}`);
  }
}

const runbook = read('docs/SalsysOS_Database_Recovery_Runbook_v1.md');
const resilience = read('docs/SalsysOS_Resilience_Principles.md');
const durableEvents = read('lib/tracking/durable-events.ts');
const consumer = read('app/api/tracking/durable-events/consume/route.ts');
const migration007 = read('supabase/migrations/007_tenant_schema_foundation.sql');
const vercel = JSON.parse(read('vercel.json'));

for (const [needle, label] of [
  ['Target production RPO:', 'target RPO'],
  ['Target production RTO:', 'target RTO'],
  ['PITR enabled/disabled state is not yet verified', 'PITR evidence boundary'],
  ['never start an in-place production restore as a test', 'no production restore rehearsal rule'],
  ['## 6. Expected system behavior during database unavailability', 'outage behavior section'],
  ['## 7. Production restore sequence', 'restore sequence'],
  ['## 8. Post-restore validation sequence', 'post-restore validation'],
  ['## 9. Recovery completion criteria', 'completion criteria'],
  ['## 10. Isolated restore rehearsal (PH-5.2B)', 'isolated rehearsal plan'],
  ['automation_scheduled_jobs', 'automation backlog validation'],
  ['raw_event_processing', 'raw-event recovery validation'],
  ['admissions_auto_task_runs', 'admissions scheduler real-run evidence'],
]) {
  assert(runbook.includes(needle), `runbook missing ${label}.`);
}

assert(
  resilience.includes('Backups and transport resilience solve different problems'),
  'canonical resilience principles must retain backup/transport separation.',
);

assert(
  durableEvents.includes('const QUEUE_RETENTION_SECONDS = 7 * 24 * 60 * 60;'),
  'trusted-event queue retention must remain seven days.',
);

assert(
  durableEvents.includes("'Vqs-Idempotency-Key'"),
  'trusted-event publishing must retain transport idempotency.',
);

assert(
  consumer.includes('status: 503') && consumer.includes("'Retry-After': '60'"),
  'transient durable-event persistence failures must remain retryable.',
);

const coursePrerequisite = migration007.indexOf(
  'alter table public.courses\n  add column if not exists external_course_id text;',
);
const courseIndex = migration007.indexOf(
  'create unique index if not exists uq_courses_org_source_external',
);
const batchPrerequisite = migration007.indexOf(
  'alter table public.course_batches\n  add column if not exists external_batch_id text;',
);
const batchIndex = migration007.indexOf(
  'create unique index if not exists uq_course_batches_org_source_external',
);

for (const [needle, label] of [
  ['alter table public.courses\n  add column if not exists source_system text;', 'courses.source_system recovery prerequisite'],
  ['alter table public.courses\n  add column if not exists external_course_id text;', 'courses.external_course_id recovery prerequisite'],
  ['alter table public.course_batches\n  add column if not exists source_system text;', 'course_batches.source_system recovery prerequisite'],
  ['alter table public.course_batches\n  add column if not exists external_batch_id text;', 'course_batches.external_batch_id recovery prerequisite'],
]) {
  assert(migration007.includes(needle), `migration 007 missing ${label}.`);
}

assert(
  coursePrerequisite >= 0 && courseIndex >= 0 && coursePrerequisite < courseIndex,
  'migration 007 must create courses.external_course_id before the tenant-scoped course index.',
);

assert(
  batchPrerequisite >= 0 && batchIndex >= 0 && batchPrerequisite < batchIndex,
  'migration 007 must create course_batches.external_batch_id before the tenant-scoped batch index.',
);

const durableTrigger =
  vercel.functions?.['app/api/tracking/durable-events/consume/route.ts']?.experimentalTriggers?.[0];

assert(
  durableTrigger?.type === 'queue/v2beta' &&
    durableTrigger?.topic === 'salsys-trusted-events-v1',
  'durable trusted-event queue trigger must remain registered.',
);

assert(
  durableTrigger?.maxConcurrency === 5,
  'durable trusted-event recovery concurrency must remain capped at 5.',
);

console.log('PH-5.2 recovery runbook, resilience, and migration replay contracts verified.');
