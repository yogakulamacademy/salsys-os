import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function requireText(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`WhatsApp final closeout verification failed: ${label}`);
  }
}

function forbidText(source, needle, label) {
  if (source.includes(needle)) {
    throw new Error(`WhatsApp final closeout verification failed: ${label}`);
  }
}

const migration = read('supabase/migrations/20261101064500_whatsapp_final_closeout_v1.sql');
const helper = read('lib/integrations/whatsapp-sender-readiness.ts');
const runtime = read('lib/integrations/whatsapp-connection.ts');
const overview = read('app/automation/page.tsx');
const readiness = read('app/automation/readiness/page.tsx');
const templates = read('app/automation/templates/page.tsx');
const settings = read('app/automation/settings/page.tsx');
const pilot = read('app/automation/pilot/page.tsx');
const operations = read('app/automation/whatsapp/page.tsx');

for (const [needle, label] of [
  ['whatsapp_accounts_one_active_default_per_org_uidx', 'one-active-default-per-organization index missing'],
  ['on public.whatsapp_accounts (organization_id)', 'default uniqueness must be organization scoped'],
  ['where active = true', 'default uniqueness must apply only to active senders'],
  ['and is_default = true', 'default uniqueness must apply only to default senders'],
  ['create or replace function public.get_whatsapp_sender_readiness_v1(', 'canonical sender readiness RPC missing'],
  ['public.is_organization_member(p_organization_id)', 'sender readiness must enforce tenant membership'],
  ["v_connection.provider <> 'whatsapp'", 'sender readiness must verify provider type'],
  ["v_connection.status <> 'connected'", 'sender readiness must verify connected integration state'],
  ['v_connection.access_token_ciphertext is null', 'sender readiness must verify encrypted credential presence'],
  ["'unbound_active_account_count'", 'sender readiness must report excluded unbound active records'],
  ['revoke all on function public.get_whatsapp_sender_readiness_v1(uuid) from public, anon;', 'sender readiness must deny anonymous execution'],
  ['grant execute on function public.get_whatsapp_sender_readiness_v1(uuid) to authenticated, service_role;', 'sender readiness grant contract missing'],
]) {
  requireText(migration, needle, label);
}

forbidText(migration, "'access_token',", 'sender readiness must not return an access-token field');
forbidText(migration, "'provider_metadata',", 'sender readiness must not return provider metadata');

for (const [needle, label] of [
  ["supabase.rpc('get_whatsapp_sender_readiness_v1'", 'shared helper must call canonical sender readiness RPC'],
  ['connected: row.connected === true', 'shared helper must fail closed unless connected is explicitly true'],
  ['unboundActiveAccountCount', 'shared helper must preserve excluded historical-account evidence'],
]) {
  requireText(helper, needle, label);
}

for (const [needle, label] of [
  [".eq(\n        \"active\",\n        true,\n      )", 'runtime must require active sender'],
  [".eq(\n        \"is_default\",\n        true,\n      )", 'runtime must require default sender'],
  ['!account.connection_id', 'runtime must reject unbound sender'],
  ['connection.provider !==\n      "whatsapp"', 'runtime must verify provider'],
  ['connection.status !==\n      "connected"', 'runtime must verify connected status'],
  ['!encryptedToken', 'runtime must require encrypted provider credential'],
]) {
  requireText(runtime, needle, label);
}

for (const [source, label] of [
  [overview, 'Automation Overview'],
  [readiness, 'Launch Readiness'],
  [templates, 'Template workspace'],
  [settings, 'Automation Settings'],
  [pilot, 'Controlled Rollout'],
  [operations, 'WhatsApp Operations'],
]) {
  requireText(source, 'getWhatsAppSenderReadiness', `${label} must use canonical sender readiness`);
}

requireText(overview, 'const senderConnected = senderReadiness?.connected === true;', 'Automation Overview must derive connection state from canonical readiness');
requireText(readiness, 'const senderConnected = senderReadiness?.connected === true;', 'Launch Readiness must derive connection state from canonical readiness');
requireText(templates, 'accountConnected={senderReadiness?.connected === true}', 'Template sync must require canonical connected sender');
requireText(settings, "statusPill(senderConnected, 'Sender connected', 'Sender unavailable')", 'Automation Settings must report canonical sender state');
requireText(pilot, 'approvedTemplates>0&&senderConnected', 'Pilot send assets must require canonical connected sender');
requireText(pilot, 'const armReadiness=', 'Pilot readiness gate missing');
requireText(pilot, '&&senderConnected&&', 'Pilot arm readiness must require canonical connected sender');
requireText(operations, "senderConnected?'Connected sender verified.':'Sender readiness blocked.'", 'WhatsApp Operations must expose canonical sender status');

for (const [source, label] of [
  [overview, 'Automation Overview'],
  [settings, 'Automation Settings'],
  [pilot, 'Controlled Rollout'],
]) {
  forbidText(source, "from('whatsapp_accounts').select('id',{count:'exact',head:true}).eq('organization_id'", `${label} must not use raw active-account counts as readiness`);
  forbidText(source, "from('whatsapp_accounts')\n              .select('id', { count: 'exact', head: true })", `${label} must not use raw active-account counts as readiness`);
}

console.log('WhatsApp final closeout contracts verified.');
