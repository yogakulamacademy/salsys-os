import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const helperPath = path.join(root, 'lib/integrations/provider-visibility.ts');
const migrationPath = path.join(
  root,
  'supabase/migrations/20261029074500_current_provider_visibility_v1.sql',
);

const helper = fs.readFileSync(helperPath, 'utf8');
const migration = fs.readFileSync(migrationPath, 'utf8');

if (!helper.includes('get_current_provider_visibility_v1')) {
  throw new Error('Provider visibility helper must use the single current-provider RPC.');
}

if (helper.includes('auth.getUser()')) {
  throw new Error('Provider visibility helper must not add a separate auth.getUser round trip.');
}

if (helper.includes('requireCurrentOrganizationId')) {
  throw new Error('Provider visibility helper must not add a separate tenant-resolution round trip.');
}

const rpcCalls = helper.match(/\.rpc\(/g) ?? [];
if (rpcCalls.length !== 1) {
  throw new Error(`Provider visibility helper must make exactly one RPC call; found ${rpcCalls.length}.`);
}

for (const required of [
  'create or replace function public.get_current_provider_visibility_v1()',
  'security invoker',
  "if auth.role() <> 'authenticated'",
  'public.get_current_workspace_context_v1()',
  'public.get_provider_visibility(v_organization_id)',
  'revoke all on function public.get_current_provider_visibility_v1() from public, anon;',
  'grant execute on function public.get_current_provider_visibility_v1() to authenticated;',
]) {
  if (!migration.toLowerCase().includes(required.toLowerCase())) {
    throw new Error(`Provider visibility migration is missing required contract: ${required}`);
  }
}

if (migration.toLowerCase().includes('security definer')) {
  throw new Error('Provider visibility composition wrapper must not become SECURITY DEFINER.');
}

console.log('Single-RPC provider visibility contracts verified.');
