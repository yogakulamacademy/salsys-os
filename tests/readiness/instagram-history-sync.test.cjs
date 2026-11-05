const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const read = path => readFileSync(path, 'utf8');
const sql = read('supabase/migrations/20261104203000_instagram_history_reconciliation_v1.sql');
const worker = read('lib/integrations/instagram-history-reconciliation.ts');
const route = read('app/api/instagram/history-sync/route.ts');
const control = read('components/instagram-history-sync-control.tsx');
const cron = JSON.parse(read('vercel.json'));

test('History ingestion is service-only, tenant-bound, existing-conversation-only', () => {
  for (const check of [
    "if auth.role() <> 'service_role'",
    "revoke all on function public.ingest_instagram_history_message_v1(uuid)",
    "to service_role;",
    "c.organization_id = v_raw.organization_id",
    "c.external_conversation_id = v_account || ':' || v_customer",
    "ic.status = 'connected'",
    "v_from is distinct from v_expected_from",
    "on conflict (organization_id, external_message_id)",
    "where external_message_id is not null do nothing",
    "created_at, metadata",
    "coalesce(c.last_message_at, v_at)",
  ]) assert.ok(sql.includes(check), check);
  assert.doesNotMatch(sql, /create_crm_lead|insert into public\.leads|log_lead_interaction|set_lead_stage/i);
});

test('Historical sync cursor is protected and incoming provider evidence is immutable', () => {
  for (const check of [
    "enable row level security",
    "from public, anon, authenticated",
    "getInstagramRuntimeForOrganization",
    "instagram_history_sync_cursor_v1",
    "history_message: providerMessage",
    "p_ingestion_method: 'instagram_graph_conversations'",
    "p_source_event_id: 'history:' + id",
    "p_source_account_id: accountId",
    "p_source_subject_id: instagramUserId",
    "p_external_message_id: id",
    "if (!apply) continue",
    "messagesAlreadyPresent",
  ]) assert.ok((sql + worker).includes(check), check);
  assert.doesNotMatch(worker, /\bPOST\b|\/messages\/send|sendInstagramMessageAction|send_whatsapp/i);
});

test('Admin-only history preview and explicit deployment flag for writes', () => {
  for (const check of [
    "process.env.INSTAGRAM_HISTORY_SYNC_ENABLED !== 'true'",
    "bearerMatchesAnySecret",
    "request.headers.get('origin') !== request.nextUrl.origin",
    "['owner', 'admin'].includes(active.role)",
    "workspace.activeOrganizationId !== active.organizationId",
    "member.organizationId === active.organizationId && member.role === active.role",
    "body.mode === 'history_preview'",
    "body.apply !== false",
    ".eq('organization_id', organizationId)",
    ".eq('id', connectionId)",
    "customerMessageSent: false",
    "reconcileInstagramMessageHistory",
  ]) assert.ok(route.includes(check), check);
  assert.ok(control.includes("Preview message history"));
  assert.ok(control.includes("Sync next batch"));
  assert.ok(cron.crons.some(c => c.path === '/api/instagram/history-sync'));
});

test('Settings integration preview uses supported read-only API mode and shows count-only outbound coverage', () => {
  assert.ok(control.includes("mode: echoCheck ? 'echo_status' : apply ? undefined : 'history_preview'"));
  assert.ok(control.includes('outboundMessagesSeen'));
  assert.ok(control.includes('outboundMessagesMatched'));
  assert.ok(control.includes('outboundMessagesNotInCrm'));
  assert.ok(control.includes('summary.dryRun'));
  assert.doesNotMatch(control, /mode:\s*echoCheck\s*\?\s*'echo_status'\s*:\s*'history'/);
});

test('Outgoing native-app echoes have a read-only provider subscription check', () => {
  assert.ok(worker.includes('inspectInstagramEchoSubscription'));
  assert.ok(worker.includes("'/me/subscribed_apps'"));
  assert.ok(worker.includes("method: 'GET'"));
  assert.ok(worker.includes("fields.includes('message_echoes')"));
  assert.ok(route.includes("body.mode === 'echo_status'"));
  assert.ok(control.includes('Check outgoing-message sync'));
  assert.doesNotMatch(worker, /method:\s*'POST'/);
});
