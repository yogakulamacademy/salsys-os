import fs from 'node:fs';

const migration = fs.readFileSync(
  'supabase/migrations/20261029121000_fix_admissions_rule_key_ambiguity.sql',
  'utf8',
);

function requireText(needle, label) {
  if (!migration.includes(needle)) {
    throw new Error(`Admissions rule_key ambiguity verification failed: missing ${label} (${needle})`);
  }
}

for (const [needle, label] of [
  ['create or replace function public.run_admissions_auto_tasks(', 'canonical RPC replacement'],
  ['returns table(', 'RETURNS TABLE contract'],
  ['rule_key text,', 'public rule_key result column'],
  ['#variable_conflict use_column', 'PL/pgSQL column-precedence directive'],
  ["from public.v_admissions_auto_task_candidates c", 'candidate source'],
  ['and c.rule_key is not null', 'candidate rule guard'],
  ['and c.event_key is not null', 'candidate event guard'],
  ['from public.admissions_auto_task_events e', 'idempotency pre-check'],
  ['perform public.create_followup_task(', 'follow-up task creation'],
  ['insert into public.admissions_auto_task_events (', 'event logging'],
  ['on conflict (organization_id, rule_key, event_key)', 'existing unique conflict target'],
  ["'created'::text", 'created result'],
  ["('failed: ' || sqlerrm)::text", 'per-candidate failure result'],
  ['security definer', 'security definer preserved'],
  ["set search_path to 'public'", 'search path preserved'],
]) {
  requireText(needle, label);
}

const directiveIndex = migration.indexOf('#variable_conflict use_column');
const declareIndex = migration.indexOf('declare');
if (directiveIndex < 0 || declareIndex < 0 || directiveIndex > declareIndex) {
  throw new Error('Admissions rule_key ambiguity fix must place #variable_conflict use_column before DECLARE.');
}

const forbidden = [
  'drop function',
  'drop table',
  'delete from public.',
  'update public.tasks',
  'update public.admissions_auto_task_events',
  'alter table',
];
for (const needle of forbidden) {
  if (migration.toLowerCase().includes(needle)) {
    throw new Error(`Admissions ambiguity migration must remain compatibility-only: ${needle}`);
  }
}

const conflictTargets = (
  migration.match(/on conflict \(organization_id, rule_key, event_key\)/g) ?? []
).length;
if (conflictTargets !== 1) {
  throw new Error(`Expected exactly one Admissions idempotency conflict target; found ${conflictTargets}.`);
}

console.log('Admissions rule_key ambiguity contracts verified.');
