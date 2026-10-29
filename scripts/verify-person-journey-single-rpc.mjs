import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const helperPath = path.join(root, 'lib/person-journey-data.ts');
const migrationPath = path.join(
  root,
  'supabase/migrations/20261029101500_current_person_journey_workspace_v1.sql',
);

const helper = fs.readFileSync(helperPath, 'utf8');
const migration = fs.readFileSync(migrationPath, 'utf8');

const start = helper.indexOf('export async function getPersonJourneyForLead');
const end = helper.indexOf('\nasync function getLegacyAuthorizedPersonJourney', start);

if (start < 0 || end < 0) {
  throw new Error('Unable to isolate the optimized Person Journey loader.');
}

const hotPath = helper.slice(start, end);

if (!hotPath.includes('get_current_person_journey_workspace_v1')) {
  throw new Error('Healthy Person Journey path must use the current-workspace RPC.');
}

for (const forbidden of [
  'auth.getUser()',
  'requireCurrentOrganizationId',
  'can_access_lead',
  'get_person_journey_workspace_v3',
  'get_person_journey_workspace_v2',
]) {
  if (hotPath.includes(forbidden)) {
    throw new Error(`Healthy Person Journey path contains separate preflight/data work: ${forbidden}`);
  }
}

const rpcCalls = hotPath.match(/\.rpc\(/g) ?? [];
if (rpcCalls.length !== 1) {
  throw new Error(`Healthy Person Journey path must make exactly one RPC call; found ${rpcCalls.length}.`);
}

for (const required of [
  'getLegacyAuthorizedPersonJourney(',
  'current.__legacyFallbackRequired',
  'current.access_granted === false',
]) {
  if (!hotPath.includes(required)) {
    throw new Error(`Person Journey loader is missing required degradation/access behavior: ${required}`);
  }
}

for (const required of [
  'create or replace function public.get_current_person_journey_workspace_v1(',
  'security invoker',
  'if auth.uid() is null',
  'public.get_current_workspace_context_v1()',
  'public.can_access_lead(p_lead_id)',
  'public.get_person_journey_workspace_v3(',
  "'__legacyFallbackRequired', true",
  'revoke all on function public.get_current_person_journey_workspace_v1(uuid, integer)',
  'grant execute on function public.get_current_person_journey_workspace_v1(uuid, integer)',
  'to authenticated;',
]) {
  if (!migration.toLowerCase().includes(required.toLowerCase())) {
    throw new Error(`Person Journey migration is missing required contract: ${required}`);
  }
}

if (migration.toLowerCase().includes('security definer')) {
  throw new Error('Person Journey composition wrapper must remain SECURITY INVOKER.');
}

if (/\n\s*stable\s*\n/i.test(migration)) {
  throw new Error('Current Person Journey wrapper must remain VOLATILE/default because workspace context may refresh session binding state.');
}

if (/p_organization_id/i.test(migration)) {
  throw new Error('Current Person Journey wrapper must resolve organization server-side.');
}

const contextIndex = migration.indexOf('public.get_current_workspace_context_v1()');
const innerBeginIndex = migration.indexOf('\n  begin\n', contextIndex);
if (contextIndex < 0 || innerBeginIndex < 0 || innerBeginIndex < contextIndex) {
  throw new Error('Workspace-context resolution must occur outside the inner V3 fallback boundary.');
}

console.log('Single-RPC Person Journey workspace contracts verified.');
