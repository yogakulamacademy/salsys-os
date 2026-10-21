import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

function fail(message) {
  console.error(`\n[instagram-operations] FAIL: ${message}`);
  process.exit(1);
}

function read(relativePath) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) fail(`Missing required file: ${relativePath}`);
  return fs.readFileSync(absolute, 'utf8');
}

const migration = read('supabase/migrations/20261020113000_instagram_operations_v1.sql');
const hardening = read('supabase/migrations/20261020113500_instagram_operations_hardening_v1.sql');
const integration = read('lib/integrations/instagram.ts');
const connection = read('lib/integrations/instagram-connection.ts');
const runtime = read('lib/automation/instagram-operations.ts');
const webhook = read('app/api/instagram/webhook/route.ts');
const manualAction = read('app/conversations/instagram-actions.ts');
const runner = read('app/api/automation/instagram/runner/route.ts');
const actions = read('app/automation/instagram/actions.ts');
const page = read('app/automation/instagram/page.tsx');
const policyNotes = read('components/automation/instagram-policy-notes.tsx');
const instagramUi = `${page}\n${policyNotes}`;
const quickReplies = read('app/api/instagram/quick-replies/route.ts');
const bridge = read('components/instagram-outbound-bridge.tsx');
const vercel = read('vercel.json');

for (const [needle, label] of [
  ['instagram_channel_policies', 'channel policy'],
  ['instagram_channel_preferences', 'recipient suppression'],
  ['instagram_quick_replies', 'quick replies'],
  ['instagram_automation_rules', 'automation rules'],
  ['instagram_comment_events', 'comment event ledger'],
  ['instagram_pilot_allowlist', 'pilot allowlist'],
  ['instagram_automation_runs', 'automation run ledger'],
  ['automation_enabled boolean not null default false', 'fail-closed automation default'],
  ['provider_send_enabled boolean not null default false', 'fail-closed provider default'],
  ['requires_human_approval boolean not null default true', 'human approval default'],
  ['pilot_mode_enabled boolean not null default true', 'pilot default'],
  ["interval '24 hours'", 'standard DM reply window'],
  ["interval '7 days'", 'comment private-reply window'],
  ['instagram_comment_private_reply_already_sent', 'one private reply per comment guard'],
  ['instagram_recipient_suppressed', 'suppression authority'],
  ['instagram_frequency_limited', 'frequency cap'],
  ['instagram_pilot_recipient_not_allowlisted', 'DM pilot allowlist'],
  ['instagram_pilot_comment_not_allowlisted', 'comment pilot allowlist'],
  ['claim_instagram_automation_run_v1', 'immediate provider claim'],
  ['finalize_instagram_automation_run_v1', 'provider finalization'],
  ['provider_send_enabled=false', 'pilot auto-disarm'],
]) {
  if (!migration.includes(needle)) fail(`Instagram migration is missing ${label} (${needle}).`);
}

for (const [needle, label] of [
  ['revoke all on public.v_instagram_reachability_v1 from public, anon, authenticated', 'server-only reachability view'],
  ['revoke all on public.v_instagram_automation_performance_v1 from public, anon, authenticated', 'server-only performance view'],
  ["'human_approved',v_run.human_approved", 'approval evidence in provider claim'],
  ['revoke all on function public.claim_instagram_automation_run_v1', 'service-only claim permission'],
]) {
  if (!hardening.includes(needle)) fail(`Instagram hardening is missing ${label} (${needle}).`);
}

for (const scope of [
  'instagram_business_basic',
  'instagram_business_manage_messages',
  'instagram_business_manage_comments',
]) {
  if (!integration.includes(`'${scope}'`)) fail(`Instagram OAuth is missing ${scope}.`);
}

if (!connection.includes('instagram_business_manage_messages')) {
  fail('Instagram runtime connection must require messaging permission.');
}
if (!connection.includes('token_expires_at')) {
  fail('Instagram runtime connection must fail closed on token expiry.');
}

for (const [needle, label] of [
  ['STOP_WORDS', 'STOP/suppression handling'],
  ['queueInstagramDmAutomation', 'DM rule queue'],
  ['queueInstagramCommentAutomation', 'comment rule queue'],
  ['claim_instagram_automation_run_v1', 'provider claim recheck'],
  ["? { comment_id: commentId }", 'comment private-reply recipient'],
  [': { id: userId }', 'customer-initiated DM recipient'],
  ['finalize_instagram_automation_run_v1', 'provider result finalization'],
  ['humanApproved = claim.human_approved === true', 'approval lineage'],
  ['log_lead_interaction', 'canonical CRM outbound logging'],
]) {
  if (!runtime.includes(needle)) fail(`Instagram runtime is missing ${label} (${needle}).`);
}

for (const [needle, label] of [
  ['verifyMetaSignature', 'signed webhook validation'],
  ['queueInstagramDmAutomation', 'DM automation enqueue'],
  ['queueInstagramCommentAutomation', 'comment automation enqueue'],
  ["field !== 'comments'", 'comment webhook parsing'],
  ['instagram_comment_events', 'comment persistence'],
  ['reconcile_instagram_private_reply_lead_v1', 'private-reply identity reconciliation'],
  ['CRM ingestion is authoritative and independent from automation', 'automation isolation from CRM ingestion'],
]) {
  if (!webhook.includes(needle)) fail(`Instagram webhook is missing ${label} (${needle}).`);
}
for (const forbidden of [
  'runInstagramAutomations(',
  'provider_send_enabled: true',
  'automation_enabled: true',
]) {
  if (webhook.includes(forbidden)) fail(`Instagram webhook must not directly execute/open automation (${forbidden}).`);
}

for (const [needle, label] of [
  ['evaluate_instagram_dm_send_policy_v1', 'manual-send reachability policy'],
  ['p_automated: false', 'human-reply policy mode'],
  ['instagram_24h_window_closed', '24-hour operator feedback'],
  ['policy.allowed !== true', 'fail-closed manual policy result'],
  ['human_approved: true', 'human outbound lineage'],
]) {
  if (!manualAction.includes(needle)) fail(`Manual Instagram send is missing ${label} (${needle}).`);
}
const policyIndex = manualAction.indexOf('evaluate_instagram_dm_send_policy_v1');
const providerIndex = manualAction.indexOf('https://graph.instagram.com/');
if (policyIndex < 0 || providerIndex < 0 || policyIndex > providerIndex) {
  fail('Manual Instagram policy check must execute before constructing the provider send call.');
}

for (const [needle, label] of [
  ['INSTAGRAM_AUTOMATION_RUNNER_SECRET', 'runner auth'],
  ['CRON_SECRET', 'cron auth fallback'],
  ['runInstagramAutomations', 'guarded runtime invocation'],
  ["'Cache-Control': 'no-store'", 'no-store response'],
]) {
  if (!runner.includes(needle)) fail(`Instagram runner is missing ${label} (${needle}).`);
}
if (!vercel.includes('/api/automation/instagram/runner')) {
  fail('Vercel cron is missing the Instagram automation runner.');
}

for (const [needle, label] of [
  ['requireCurrentOrganizationId', 'server-derived tenant binding'],
  ["'can_manage_organization'", 'admin authorization'],
  ['pending_approval', 'human approval queue'],
  ['pilot_sent_count: 0, provider_send_enabled: false', 'safe pilot reset'],
  ['active: false', 'inactive rule creation'],
]) {
  if (!actions.includes(needle)) fail(`Instagram admin actions are missing ${label} (${needle}).`);
}
for (const forbidden of [
  'runInstagramAutomations(',
  'fetch(\'https://graph.instagram.com',
  'provider_send_enabled: true',
]) {
  if (actions.includes(forbidden)) fail(`Instagram admin actions must not directly send/open gates (${forbidden}).`);
}

for (const [needle, label] of [
  ['Official API guardrails', 'provider-rule disclosure'],
  ['24-hour reply window', '24-hour UI disclosure'],
  ['one-time private reply', 'comment private-reply disclosure'],
  ['Instagram is not treated as a cold/bulk broadcast channel', 'no-broadcast disclosure'],
  ['Human approval queue', 'approval UI'],
  ['Pilot allowlist', 'pilot UI'],
  ['Suppression / STOP', 'suppression UI'],
  ['Comment permission', 'comment permission health'],
]) {
  if (!instagramUi.includes(needle)) fail(`Instagram workspace is missing ${label} (${needle}).`);
}

for (const [needle, label] of [
  ['requireCurrentOrganizationId', 'tenant-bound quick replies'],
  [".from('instagram_quick_replies')", 'quick reply source'],
  ["'Cache-Control': 'no-store'", 'quick reply no-store'],
]) {
  if (!quickReplies.includes(needle)) fail(`Instagram quick-reply API is missing ${label} (${needle}).`);
}
for (const [needle, label] of [
  ['/api/instagram/quick-replies', 'composer quick-reply API'],
  ['Instagram quick reply', 'composer quick-reply selector'],
  ['sendInstagramMessageAction', 'existing provider send bridge'],
]) {
  if (!bridge.includes(needle)) fail(`Instagram conversation bridge is missing ${label} (${needle}).`);
}

const sourceCorpus = [migration, hardening, runtime, webhook, actions, page, policyNotes].join('\n');
for (const forbidden of ['instagram_broadcast_campaigns', 'cold_instagram_dm', 'bulk_instagram_dm']) {
  if (sourceCorpus.includes(forbidden)) {
    fail(`Instagram Operations V1 must not introduce a cold/bulk broadcast primitive (${forbidden}).`);
  }
}

console.log('[instagram-operations] PASS: user-initiated DM policy, comment-to-DM, suppression, approval, pilot, idempotent provider execution and tenant boundaries verified.');
