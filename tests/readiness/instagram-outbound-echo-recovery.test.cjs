const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

const migration = readFileSync(
  'supabase/migrations/20261104171500_instagram_outbound_echo_recovery_v1.sql',
  'utf8',
);
const echoMigration = readFileSync(
  'supabase/migrations/20261104170000_instagram_outbound_echo_v1.sql',
  'utf8',
);

test('Outbound echo retry is isolated from inbound Instagram messages', () => {
  for (const needle of [
    "re.source_system = 'instagram'",
    "re.source_event_type like 'outbound_echo:%'",
    "re.payload ? 'outbound_echo'",
    "rep.status in ('received', 'failed')",
    'public.ingest_instagram_outbound_echo_v1(r.id)',
  ]) assert.ok(migration.includes(needle), needle);
  assert.doesNotMatch(migration, /ingest_instagram_dm_event|create_crm_lead|insert into public\.leads/i);
});

test('Retry processing is bounded, throttled, and deadlock-safe', () => {
  for (const needle of [
    'least(greatest(coalesce(p_limit, 10), 1), 25)',
    "interval '5 minutes'",
    "interval '30 days'",
    'for update of re skip locked',
    "'dead_letter'",
    'exception when others',
  ]) assert.ok(migration.includes(needle), needle);
});

test('Recovery function is restricted and cron scheduling idempotent', () => {
  for (const needle of [
    'security definer',
    'set search_path = public, auth, pg_temp',
    'revoke all on function public.retry_instagram_outbound_echoes_v1(integer)',
    'from public, anon, authenticated;',
    'to service_role;',
    "jobname = 'instagram-outbound-echo-retry-v1'",
    "'*/2 * * * *'",
    'v_job_id := cron.schedule(',
    'perform cron.alter_job(job_id := v_job_id, active := false);',
    'and active is false',
    'raise exception \'Instagram outbound retry job must remain inactive after migration\'',
  ]) assert.ok(migration.includes(needle), needle);

  // Schema deployment must NEVER turn on a live retry worker. The only
  // release path is a later, explicitly approved cron activation.
  assert.doesNotMatch(migration, /cron\.alter_job\([^;]*active\s*(?::=|=>)\s*true/si);
  assert.ok(
    migration.indexOf('v_job_id := cron.schedule(') <
      migration.indexOf('perform cron.alter_job(job_id := v_job_id, active := false);'),
    'scheduling must be followed by immediate default-deny deactivation',
  );
});

test('Existing echo projector does not manufacture customer leads and deduplicates provider IDs', () => {
  assert.ok(echoMigration.includes('m.external_message_id = v_mid'));
  assert.ok(echoMigration.includes("'duplicate_message', true"));
  assert.ok(echoMigration.includes("'conversation_not_found'"));
  assert.doesNotMatch(echoMigration, /create_crm_lead|insert into public\.leads/i);
});
