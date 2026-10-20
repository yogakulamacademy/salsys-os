import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

function fail(message) {
  console.error(`\n[whatsapp-broadcast-runner] FAIL: ${message}`);
  process.exit(1);
}

function read(relativePath) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) fail(`Missing required file: ${relativePath}`);
  return fs.readFileSync(absolute, 'utf8');
}

const migration = read('supabase/migrations/20261020093000_whatsapp_broadcast_runner_v1.sql');
const hardening = read('supabase/migrations/20261020093500_whatsapp_broadcast_runner_hardening_v1.sql');
const lineage = read('supabase/migrations/20261020094000_whatsapp_broadcast_message_lineage_v1.sql');
const runner = read('lib/automation/whatsapp-broadcast-runner.ts');
const route = read('app/api/automation/whatsapp/broadcast-runner/route.ts');
const provider = read('lib/integrations/whatsapp-provider-send.ts');
const vercel = read('vercel.json');

for (const [needle, label] of [
  ['broadcast_campaign_id', 'campaign lineage on provider audits'],
  ['broadcast_recipient_id', 'recipient lineage on provider audits'],
  ['evaluate_whatsapp_broadcast_send_policy_v1', 'campaign policy evaluator'],
  ['prepare_whatsapp_broadcast_provider_send_v1', 'guarded prepare function'],
  ['claim_whatsapp_broadcast_provider_send_v1', 'broadcast claim function'],
  ['claim_whatsapp_provider_send_v2', 'provider claim router'],
  ['return public.claim_whatsapp_provider_send_v1', 'legacy claim delegation'],
  ["v_reason not in ('autonomous_send_disabled','human_approval_required')", 'narrow campaign approval override'],
  ["coalesce((v_base->>'suppressed')::boolean,false)=false", 'suppression authority'],
  ["coalesce((v_base->>'policy_enabled')::boolean,false)=true", 'messaging policy authority'],
  ["coalesce((v_base->>'frequency_limited')::boolean,true)=false", 'frequency-cap authority'],
  ['provider_send_enabled is not true', 'provider gate recheck'],
  ['pilot_lead_not_allowlisted', 'pilot lead allowlist'],
  ['pilot_send_cap_reached', 'pilot message cap'],
  ['template_variables_not_configured', 'no guessed template variables'],
  ['sync_whatsapp_broadcast_recipient_from_audit_v1', 'delivery/read reconciliation'],
  ['mark_whatsapp_broadcast_reply_v1', 'reply reconciliation'],
]) {
  if (!migration.includes(needle)) fail(`Runner migration is missing ${label} (${needle}).`);
}

for (const [needle, label] of [
  ['rearm_whatsapp_broadcast_provider_send_v1', 'safe blocked-audit rearm'],
  ["v_audit.customer_message_sent=true", 'no rearm after customer message'],
  ["v_audit.provider_message_id is not null", 'no rearm after provider message id'],
  ["c.channel::text='whatsapp'", 'WhatsApp-only reply attribution'],
  ["v_recipient_status := 'eligible'", 'transient blocked recipient retry'],
  ['Keep eligible_count as the approved audience snapshot count', 'immutable approved audience count'],
]) {
  if (!hardening.includes(needle)) fail(`Runner hardening is missing ${label} (${needle}).`);
}

if (/set\s+eligible_count\s*=/i.test(hardening)) {
  fail('Runtime count refresh must not overwrite the approved eligible_count snapshot.');
}

for (const [needle, label] of [
  ['enrich_whatsapp_broadcast_provider_audit_v1', 'provider audit lineage enrichment'],
  ["'human_approved',true", 'human approval on provider payload'],
  ['approved same-tenant campaign/recipient lineage', 'lineage tenant approval guard'],
  ['enrich_whatsapp_broadcast_message_lineage_v1', 'canonical message lineage enrichment'],
  ["'broadcast_attribution','direct_provider_send_lineage'", 'direct broadcast lineage marker'],
]) {
  if (!lineage.includes(needle)) fail(`Message-lineage migration is missing ${label} (${needle}).`);
}

for (const [needle, label] of [
  [".in('status', ['approved', 'scheduled', 'running'])", 'approved/scheduled/running campaign scope'],
  ["policy?.policy_enabled !== true", 'messaging-policy gate before campaign start'],
  ["provider?.provider_send_enabled !== true", 'provider gate before campaign start'],
  ['pilot_scope_mismatch', 'pilot blast-radius gate'],
  ['maxRecipientsPerCampaign', 'bounded recipient work'],
  ['Math.min(max, Math.max(min', 'bounded runner clamp'],
  ["'prepare_whatsapp_broadcast_provider_send_v1'", 'prepare RPC'],
  ["'rearm_whatsapp_broadcast_provider_send_v1'", 'blocked audit rearm RPC'],
  ['executePreparedWhatsAppProviderSend', 'existing provider adapter reuse'],
  ["'refresh_whatsapp_broadcast_campaign_counts_v1'", 'campaign count refresh'],
]) {
  if (!runner.includes(needle)) fail(`Runtime runner is missing ${label} (${needle}).`);
}

for (const forbidden of [
  'provider_send_enabled: true',
  'autonomous_send_enabled: true',
  'WA_ACCESS_TOKEN',
  'META_ACCESS_TOKEN',
]) {
  if (runner.includes(forbidden)) fail(`Runtime runner must not open gates or handle provider secrets directly (${forbidden}).`);
}

for (const [needle, label] of [
  ['WHATSAPP_BROADCAST_RUNNER_SECRET', 'dedicated optional runner secret'],
  ['CRON_SECRET', 'cron authorization fallback'],
  ["request.headers.get('authorization')", 'Bearer authorization header'],
  ['maxCampaigns: 5', 'bounded campaign batch'],
  ['maxRecipientsPerCampaign: 10', 'bounded recipient batch'],
  ["'Cache-Control': 'no-store'", 'no-store response'],
]) {
  if (!route.includes(needle)) fail(`Broadcast route is missing ${label} (${needle}).`);
}

if (route.includes('organizationId') || route.includes('organization_id')) {
  fail('Broadcast route must not accept a client-supplied organization selector.');
}

if (!provider.includes("'claim_whatsapp_provider_send_v2'")) {
  fail('Provider adapter must use the campaign-aware claim router.');
}

if (!vercel.includes('/api/automation/whatsapp/broadcast-runner')) {
  fail('Vercel cron does not schedule the guarded broadcast runner.');
}

console.log('[whatsapp-broadcast-runner] PASS: human-approved broadcasts remain tenant-bound, bounded, suppression/frequency/provider/pilot gated, idempotent, human-approved in the CRM ledger, and reconciled.');
