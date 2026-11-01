import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function requireText(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`CRM/Customer 360 final closeout verification failed: missing ${label} (${needle})`);
  }
}

function forbidText(source, needle, label) {
  if (source.toLowerCase().includes(needle.toLowerCase())) {
    throw new Error(`CRM/Customer 360 final closeout verification failed: forbidden ${label} (${needle})`);
  }
}

const migration = read('supabase/migrations/20261101042000_crm_customer360_final_closeout_v1.sql');
const dataQuality = read('app/data-quality/page.tsx');
const action = read('app/actions/identity-resolution.ts');
const packageJson = read('package.json');
const ci = read('.github/workflows/ci.yml');

for (const [needle, label] of [
  ['ranked_primary_contacts', 'deterministic existing primary-contact repair'],
  ['partition by c.organization_id, c.lead_id, c.contact_type', 'tenant-safe primary grouping'],
  ['order by c.verified desc, c.created_at asc, c.id asc', 'deterministic primary selection'],
  ['set is_primary = false', 'duplicate primary demotion'],
  ['uq_lead_contacts_one_primary_per_type_v1', 'primary-contact partial unique index'],
  ['where is_primary = true', 'partial primary uniqueness predicate'],
  ['dismiss_identity_resolution_conflict_v1', 'human identity-conflict review RPC'],
  ['can_administer_organization_crm', 'manager/admin authorization boundary'],
  ["status = 'dismissed'", 'explicit dismissed state'],
  ["resolution_action = 'dismissed_after_human_review'", 'review provenance'],
  ['revoke all on function public.dismiss_identity_resolution_conflict_v1(uuid)', 'RPC execute hardening'],
  ['to authenticated, service_role', 'explicit RPC execute grant'],
]) {
  requireText(migration, needle, label);
}

for (const [needle, label] of [
  ['update public.person_leads', 'automatic Person-link rewrite'],
  ['update public.person_identifiers', 'automatic identifier reassignment'],
  ['delete from public.persons', 'Person deletion'],
  ['delete from public.person_identifiers', 'identifier deletion'],
  ['delete from public.person_leads', 'Person-link deletion'],
]) {
  forbidText(migration, needle, label);
}

for (const [needle, label] of [
  ["from('identity_resolution_conflicts')", 'live conflict queue read'],
  [".eq('status', 'open')", 'open-conflict scope'],
  ['Identity conflict review', 'conflict review UI'],
  ['Exact value is intentionally not shown in this queue.', 'PII-minimizing conflict presentation'],
  ['Dismiss as distinct', 'human dismissal control'],
  ['Manager review required', 'review permission state'],
  ['No automatic merge from this workspace', 'explicit no-auto-merge boundary'],
]) {
  requireText(dataQuality, needle, label);
}

forbidText(dataQuality, 'normalized_value', 'raw normalized identifier rendering');

for (const [needle, label] of [
  ['dismissIdentityResolutionConflictAction', 'server review action'],
  ['dismiss_identity_resolution_conflict_v1', 'canonical review RPC call'],
  ['revalidatePath("/data-quality")', 'Data Quality revalidation'],
  ['revalidatePath("/customer-360")', 'Customer 360 revalidation'],
  ['revalidatePath("/system-health")', 'health revalidation'],
]) {
  requireText(action, needle, label);
}

requireText(
  packageJson,
  'verify:crm-customer360-final-closeout',
  'package closeout verifier script',
);
requireText(
  ci,
  'npm run verify:crm-customer360-final-closeout',
  'CI closeout verifier step',
);

console.log('CRM + Customer 360 final closeout contracts verified.');
