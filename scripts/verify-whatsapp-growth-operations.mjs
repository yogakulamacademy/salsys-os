import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

function fail(message) {
  console.error(`\n[whatsapp-growth] FAIL: ${message}`);
  process.exit(1);
}

function read(relativePath) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) fail(`Missing required file: ${relativePath}`);
  return fs.readFileSync(absolute, 'utf8');
}

const migration = read('supabase/migrations/20261020101500_whatsapp_growth_operations_v1.sql');
const freeze = read('supabase/migrations/20261020102000_whatsapp_growth_approval_freeze_v1.sql');
const helper = read('lib/automation/whatsapp-growth.ts');
const actions = read('app/automation/whatsapp/growth/actions.ts');
const page = read('app/automation/whatsapp/growth/page.tsx');
const provider = read('lib/integrations/whatsapp-provider-send.ts');

for (const [needle, label] of [
  ['whatsapp_campaign_variants', 'campaign variant ledger'],
  ['template_parameter_bindings', 'explicit template binding snapshot'],
  ['validate_whatsapp_template_bindings_v1', 'binding validator'],
  ['resolve_whatsapp_template_components_for_lead_v1', 'parameter materialization'],
  ['assign_whatsapp_campaign_variant_v1', 'deterministic variant assignment'],
  ["md5(p_campaign_id::text||':'||p_lead_id::text)", 'stable experiment split'],
  ['prepare_whatsapp_broadcast_recipient_snapshot_v1', 'snapshot-time personalization validation'],
  ['template_parameter_value_missing', 'missing-value exclusion'],
  ['validate_whatsapp_broadcast_campaign_config_v1', 'approval-time campaign validation'],
  ["v_reason not in ('autonomous_send_disabled','human_approval_required')", 'narrow broadcast approval override'],
  ["coalesce((v_base->>'suppressed')::boolean,false)=false", 'STOP/suppression authority'],
  ["coalesce((v_base->>'frequency_limited')::boolean,true)=false", 'frequency-cap authority'],
  ['provider_send_enabled is not true', 'provider gate remains authoritative'],
  ["'template_parameter_binding_mode','explicit_snapshot'", 'audited parameter snapshot'],
  ['route_whatsapp_broadcast_reply_v1', 'reply routing'],
  ['owner_user_id is not null', 'existing-owner preservation'],
  ["owner_user_id is null", 'unassigned-only assignment'],
  ['v_whatsapp_campaign_conversion_attribution_v1', 'conversion attribution ledger'],
  ['last_sent_whatsapp_campaign_within_window', 'explicit attribution method'],
  ['v_whatsapp_campaign_variant_performance_v1', 'variant performance view'],
  ['v_whatsapp_campaign_performance_v2', 'campaign revenue/performance view'],
]) {
  if (!migration.includes(needle)) fail(`Growth migration is missing ${label} (${needle}).`);
}

for (const [needle, label] of [
  ['Approved WhatsApp campaign configuration is immutable', 'approved configuration freeze'],
  ['whatsapp_campaign_variants_guard_mutation', 'variant freeze'],
  ['whatsapp_broadcast_recipients_guard_insert_delete', 'approved audience freeze'],
  ["new.status := 'draft'", 'stale snapshot invalidation'],
  ["old.status in ('approved','scheduled','running','paused','completed')", 'post-approval guard'],
]) {
  if (!freeze.includes(needle)) fail(`Approval-freeze migration is missing ${label} (${needle}).`);
}

for (const source of [
  'lead.first_name',
  'lead.last_name',
  'lead.display_name',
  'lead.lead_code',
  'lead.country',
  'lead.preferred_location',
  'lead.preferred_mode',
  'lead.preferred_month',
  'course.name',
  'campaign.name',
]) {
  if (!helper.includes(`'${source}'`)) fail(`Binding helper is missing allowlisted source ${source}.`);
}

for (const [needle, label] of [
  ['constant:', 'explicit constant binding syntax'],
  ['Unsupported template binding source', 'binding-source fail closed'],
  ['bindings must be contiguous starting at', 'positional binding validation'],
  ['round_robin_if_unassigned', 'round-robin routing mode'],
]) {
  if (!helper.includes(needle)) fail(`Growth config helper is missing ${label} (${needle}).`);
}

for (const [needle, label] of [
  ['requireCurrentOrganizationId', 'server-derived tenant binding'],
  ["'can_manage_organization'", 'admin authorization'],
  ['parseWhatsAppTemplateBindings', 'explicit variable parser'],
  ['validate_whatsapp_template_bindings_v1', 'server-side template validation'],
  ['validate_whatsapp_broadcast_campaign_config_v1', 'approval config validation'],
  ["label: 'Control'", 'control variant'],
  ["label: 'Challenger'", 'challenger variant'],
  ['resolveWhatsAppAudience', 'CRM audience resolver'],
  [".select('status')", 'post-trigger snapshot recount'],
  ['campaign.growth_approved', 'human approval audit event'],
]) {
  if (!actions.includes(needle)) fail(`Growth actions are missing ${label} (${needle}).`);
}

for (const forbidden of [
  'executePreparedWhatsAppProviderSend',
  'provider_send_enabled: true',
  'autonomous_send_enabled: true',
  'WA_ACCESS_TOKEN',
  'META_ACCESS_TOKEN',
]) {
  if (actions.includes(forbidden)) fail(`Growth campaign management must not send or open provider gates (${forbidden}).`);
}

for (const [needle, label] of [
  ['Personalization, experiments & revenue', 'growth workspace heading'],
  ['Optional A/B experiment', 'experiment controls'],
  ['Reply routing', 'reply routing controls'],
  ['Conversion attribution window', 'attribution window control'],
  ['operational attribution', 'non-causal attribution disclosure'],
  ['Create campaign draft', 'draft-only creation action'],
]) {
  if (!page.includes(needle)) fail(`Growth workspace is missing ${label} (${needle}).`);
}

if (!provider.includes("'claim_whatsapp_provider_send_v2'")) {
  fail('Provider adapter must continue to use the campaign-aware guarded claim router.');
}

console.log('[whatsapp-growth] PASS: explicit personalization, deterministic experiments, unassigned-only reply routing, operational revenue attribution and approval immutability verified.');
