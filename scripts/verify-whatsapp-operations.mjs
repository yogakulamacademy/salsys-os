import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

function fail(message) {
  console.error(`\n[whatsapp-operations] FAIL: ${message}`);
  process.exit(1);
}

function read(relativePath) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) fail(`Missing required file: ${relativePath}`);
  return fs.readFileSync(absolute, 'utf8');
}

const migration = read('supabase/migrations/20261020084500_whatsapp_operations_suite_v1.sql');
const actions = read('app/automation/whatsapp/actions.ts');
const page = read('app/automation/whatsapp/page.tsx');
const helper = read('lib/whatsapp-operations.ts');
const api = read('app/api/whatsapp/quick-replies/route.ts');
const composer = read('components/conversation-composer.tsx');
const layout = read('app/automation/layout.tsx');
const navigation = read('components/automation/automation-navigation.tsx');

for (const [needle, label] of [
  ['whatsapp_audience_segments', 'audience segments'],
  ['whatsapp_broadcast_campaigns', 'broadcast campaigns'],
  ['whatsapp_broadcast_recipients', 'recipient snapshots'],
  ['whatsapp_quick_replies', 'quick replies'],
  ['whatsapp_campaign_events', 'campaign audit events'],
  ['v_whatsapp_campaign_performance_v1', 'campaign performance view'],
  ['enable row level security', 'row-level security'],
  ['public.is_organization_member(organization_id)', 'tenant member read boundary'],
  ['public.can_manage_organization(organization_id)', 'tenant admin mutation boundary'],
]) {
  if (!migration.includes(needle)) fail(`Migration is missing ${label} (${needle}).`);
}

for (const status of ['draft','ready','approved','scheduled','running','paused','completed','cancelled','failed']) {
  if (!migration.includes(`'${status}'`)) fail(`Campaign status contract is missing ${status}.`);
}

for (const [needle, label] of [
  ['requireCurrentOrganizationId', 'server-derived organization binding'],
  ["'can_manage_organization'", 'organization admin authorization'],
  ['createWhatsAppAudienceSegmentAction', 'audience creation'],
  ['createWhatsAppBroadcastCampaignAction', 'campaign creation'],
  ['snapshotWhatsAppBroadcastAudienceAction', 'audience snapshot action'],
  ['approveWhatsAppBroadcastCampaignAction', 'human campaign approval'],
  ['pauseWhatsAppBroadcastCampaignAction', 'campaign pause'],
  ['cancelWhatsAppBroadcastCampaignAction', 'campaign cancel'],
  ['createWhatsAppQuickReplyAction', 'quick reply creation'],
  ["approval_boundary: 'campaign_level_human_review'", 'campaign human-review marker'],
  ["send_policy: 'fail_closed'", 'fail-closed campaign marker'],
]) {
  if (!actions.includes(needle)) fail(`WhatsApp actions are missing ${label} (${needle}).`);
}

for (const forbidden of [
  'executePreparedWhatsAppProviderSend',
  'claim_whatsapp_provider_send_v1',
  'provider_send_enabled: true',
  'autonomous_send_enabled: true',
]) {
  if (actions.includes(forbidden)) {
    fail(`Campaign management must not directly arm or execute provider sends (${forbidden}).`);
  }
}

for (const [needle, label] of [
  ['DEFAULT_ACTIVE_STAGES', 'safe active-stage default'],
  ['verified_primary_whatsapp_required', 'verified-primary WhatsApp gate'],
  ['suppressed', 'suppression exclusion'],
  ['automation_suppressions', 'suppression source'],
  ['require_verified_primary_whatsapp', 'verified contact filter'],
]) {
  if (!helper.includes(needle)) fail(`Audience resolver is missing ${label} (${needle}).`);
}

for (const [needle, label] of [
  ['Inbox, broadcasts & audiences', 'operations workspace'],
  ['Create audience segment', 'segment builder'],
  ['Create broadcast campaign', 'campaign builder'],
  ['Broadcast campaign control', 'campaign controls'],
  ['Quick replies', 'quick reply manager'],
  ['Messaging safety posture', 'safety posture'],
]) {
  if (!page.includes(needle)) fail(`WhatsApp Operations page is missing ${label} (${needle}).`);
}

if (!layout.includes('AutomationNavigation') || !navigation.includes("href: '/automation/whatsapp'")) {
  fail('Automation navigation does not expose WhatsApp Ops.');
}

for (const [needle, label] of [
  ['requireCurrentOrganizationId', 'server-derived quick-reply organization'],
  [".from('whatsapp_quick_replies')", 'quick-reply source'],
  ["'Cache-Control': 'no-store'", 'no-store response'],
]) {
  if (!api.includes(needle)) fail(`Quick-reply API is missing ${label} (${needle}).`);
}

for (const [needle, label] of [
  ['/api/whatsapp/quick-replies', 'quick-reply API fetch'],
  ['availableQuickReplies', 'loaded quick-reply state'],
  ['applyQuickReply', 'quick-reply composer action'],
  ['AI-assisted draft', 'existing Copilot marker'],
  ['crm:whatsapp-sent', 'existing realtime send event'],
]) {
  if (!composer.includes(needle)) fail(`WhatsApp composer is missing ${label} (${needle}).`);
}

console.log('[whatsapp-operations] PASS: tenant-scoped audiences, broadcasts, analytics, quick replies and fail-closed campaign controls verified.');
