import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function requireText(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`Follow-ups final closeout verification failed: ${label}`);
  }
}

function forbidText(source, needle, label) {
  if (source.includes(needle)) {
    throw new Error(`Follow-ups final closeout verification failed: ${label}`);
  }
}

const page = read('app/follow-ups/page.tsx');
const actions = read('app/follow-ups/actions.ts');
const data = read('lib/followups-data.ts');
const canonicalRpc = read(
  'supabase/migrations/20261030120500_followups_expose_task_type_v1.sql',
);
const mutationBoundary = read(
  'supabase/migrations/20261101101500_followups_mutation_boundary_source_sync_v1.sql',
);

for (const [needle, label] of [
  ['snoozeFollowUpFromQueueAction', 'queue rescheduling must use the dedicated IST-aware action'],
  ['whose due time has arrived or passed', 'Due now wording must match due_at <= now() semantics'],
  ['Fallback queue', 'fallback mode must be visibly labelled instead of presented as Live'],
  ['Not classified separately by the compatibility queue', 'fallback payment-check metric must disclose reduced classification detail'],
  ['title="Page adjusted"', 'out-of-range pagination must be disclosed after clamping'],
  ['Reschedule (IST)', 'reschedule control must state its timezone'],
  ['formatDateTime(task.dueAt)} IST', 'rendered due timestamps must make the display timezone explicit'],
]) {
  requireText(page, needle, label);
}
forbidText(page, 'at or after their due time', 'legacy backwards Due now wording must stay removed');
forbidText(page, 'snoozeFollowUpAction', 'Follow-ups queue must not use the timezone-ambiguous shared snooze action');

for (const [needle, label] of [
  ["/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$/", 'datetime-local input must be shape-validated before parsing'],
  ["${value}:00+05:30", 'datetime-local values must be interpreted explicitly as IST'],
  ['new Date(dueAt).getTime() <= Date.now()', 'rescheduling must require a genuinely future instant'],
  ["supabase.rpc('snooze_followup_task'", 'rescheduling must use the canonical task mutation RPC'],
  ["revalidatePath('/follow-ups')", 'successful rescheduling must refresh the queue'],
]) {
  requireText(actions, needle, label);
}
forbidText(actions, ".from('tasks')", 'queue rescheduling must not bypass the canonical mutation RPC with a direct task write');

for (const [needle, label] of [
  ['workspace.pagination.page > workspace.pagination.totalPages', 'canonical pagination must detect out-of-range pages'],
  ['const lastPage = workspace.pagination.totalPages', 'canonical pagination must clamp to the actual last page'],
  ['loadCanonicalWorkspace(', 'canonical pagination must refetch the clamped page instead of fabricating rows'],
  ['fallback: true', 'legacy compatibility fallback must remain explicit'],
  ['Optimized follow-up read model unavailable:', 'canonical read failure must retain a visible fallback reason'],
]) {
  requireText(data, needle, label);
}

for (const [needle, label] of [
  ['public.is_organization_member(p_organization_id)', 'canonical read RPC must remain organization-member scoped'],
  ['from public.v_followups_due f', 'canonical read RPC must consume the RLS-backed due-task view'],
  ["current_stage in ('high_intent','payment_pending')", 'high-intent summary must retain its canonical stage definition'],
  ["task_type = 'payment_check'", 'payment-check summary must use canonical task_type evidence'],
  ['least(greatest(coalesce(p_page_size,50),1),100)', 'canonical page size must remain bounded'],
]) {
  requireText(canonicalRpc, needle, label);
}

for (const [needle, label] of [
  ['create or replace function public.complete_followup_task', 'hardened completion function must be reproducible in source'],
  ['create or replace function public.snooze_followup_task', 'hardened snooze function must be reproducible in source'],
  ['for update;', 'task mutations must lock their target before authorization/mutation'],
  ['public.can_work_lead(v_task.lead_id)', 'task mutations must authorize through the parent lead'],
  ['insert into public.activities', 'task mutations must retain activity audit evidence'],
  ['revoke all on function public.complete_followup_task(uuid) from public, anon;', 'completion RPC must deny public/anonymous execution'],
  ['revoke all on function public.snooze_followup_task(uuid, timestamptz) from public, anon;', 'snooze RPC must deny public/anonymous execution'],
  ['grant execute on function public.complete_followup_task(uuid) to authenticated, service_role;', 'completion RPC must retain authenticated/service-role execution'],
  ['grant execute on function public.snooze_followup_task(uuid, timestamptz) to authenticated, service_role;', 'snooze RPC must retain authenticated/service-role execution'],
]) {
  requireText(mutationBoundary.toLowerCase(), needle.toLowerCase(), label);
}

console.log('Follow-ups final closeout contracts verified.');
