import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const helperPath = path.join(root, 'lib/conversations-data.ts');
const migrationPath = path.join(
  root,
  'supabase/migrations/20261029093000_current_conversations_workspace_v1.sql',
);

const helper = fs.readFileSync(helperPath, 'utf8');
const migration = fs.readFileSync(migrationPath, 'utf8');

const start = helper.indexOf('export async function getConversationsWorkspace');
const end = helper.indexOf('\nfunction unwrapPayload', start);

if (start < 0 || end < 0) {
  throw new Error('Unable to isolate the optimized Conversations workspace loader.');
}

const hotPath = helper.slice(start, end);

if (!hotPath.includes('get_current_conversations_workspace_v1')) {
  throw new Error('Conversations hot path must use the single current-workspace RPC.');
}

for (const forbidden of [
  'auth.getUser()',
  'requireCurrentOrganizationId',
  'getCurrentOrganizationId(',
  'get_conversations_workspace"',
]) {
  if (hotPath.includes(forbidden)) {
    throw new Error(`Conversations hot path must not perform separate preflight work: ${forbidden}`);
  }
}

const rpcCalls = hotPath.match(/\.rpc\(/g) ?? [];
if (rpcCalls.length !== 1) {
  throw new Error(`Conversations hot path must make exactly one RPC call; found ${rpcCalls.length}.`);
}

for (const required of [
  'create or replace function public.get_current_conversations_workspace_v1(',
  'security invoker',
  'if auth.uid() is null',
  'public.get_current_workspace_context_v1()',
  'public.get_conversations_workspace(',
  'revoke all on function public.get_current_conversations_workspace_v1(uuid, integer)',
  'grant execute on function public.get_current_conversations_workspace_v1(uuid, integer)',
  'to authenticated;',
]) {
  if (!migration.toLowerCase().includes(required.toLowerCase())) {
    throw new Error(`Conversations migration is missing required contract: ${required}`);
  }
}

if (migration.toLowerCase().includes('security definer')) {
  throw new Error('Conversations composition wrapper must remain SECURITY INVOKER.');
}

if (/p_organization_id/i.test(migration)) {
  throw new Error('Current Conversations wrapper must resolve organization server-side, not accept it as input.');
}

console.log('Single-RPC Conversations workspace contracts verified.');
