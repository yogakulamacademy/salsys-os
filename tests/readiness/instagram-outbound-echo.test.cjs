const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const read = path => readFileSync(path, 'utf8');
const sql = read('supabase/migrations/20261104170000_instagram_outbound_echo_v1.sql');
const webhook = read('app/api/instagram/webhook/route.ts');
const manual = read('app/conversations/instagram-actions.ts');

test('Echo webhook preserves signature, account and sender direction guards', () => {
  for (const token of [
    'verifyMetaSignature(rawBytes, signatureHeader, appSecret)',
    'extractInstagramOutboundEchoEvents(payload)',
    'message.is_echo !== true',
    'senderId !== accountId',
    'recipientId === accountId',
    'if (!messageId) continue',
    'p_payload: { outbound_echo: echo.raw }',
    'p_source_subject_id: echo.recipientId'
  ]) assert.ok(webhook.includes(token), token);
});

test('Outbound echo ingestion is service-only and existing-conversation-only', () => {
  for (const token of [
    "if auth.role() <> 'service_role'",
    'c.external_account_id = v_account',
    "c.external_conversation_id = v_account || ':' || v_customer",
    'm.external_message_id = v_mid',
    "'duplicate_message', true",
    "'deferred', true",
    "'conversation_not_found'",
    "p_direction => 'outbound'::public.message_direction",
    "v_raw.payload -> 'outbound_echo'"
  ]) assert.ok(sql.includes(token), token);
  assert.doesNotMatch(sql, /create_crm_lead|insert into public.leads/i);
});

test('Manual Instagram send checks for a matching echo before logging', () => {
  const lookup = manual.indexOf('.eq("external_message_id", externalMessageId)');
  const log = manual.indexOf('"log_lead_interaction",');
  assert.ok(lookup >= 0 && log > lookup);
  assert.ok(manual.includes('echoLogged.conversation_id !== conversation.id'));
  assert.ok(manual.includes('if (!crmMessageId) {'));
});

test('Outgoing echo feature remains opt-in until migration and Meta webhook QA', () => {
  assert.ok(webhook.includes("process.env.INSTAGRAM_OUTBOUND_ECHO_ENABLED === 'true'"));
  assert.ok(webhook.includes(": [];"));
});

test('Instagram read receipts never become synthetic inbound messages', () => {
  const start = webhook.indexOf('function extractInstagramInboundEvents(');
  const end = webhook.indexOf('function extractInstagramOutboundEchoEvents(', start);
  assert.ok(start >= 0 && end > start, 'Inbound webhook parser must exist');
  const inbound = webhook.slice(start, end);
  const guard = inbound.indexOf('!Object.keys(message).length &&');
  const postback = inbound.indexOf('!Object.keys(postback).length &&', guard);
  const referral = inbound.indexOf('!Object.keys(referral).length)', postback);
  const syntheticId = inbound.indexOf('deterministicSyntheticEventId(accountId, senderId, messagingEvent)');
  assert.ok(guard > 0 && postback > guard && referral > postback);
  assert.ok(syntheticId > referral, 'Non-message events must be filtered before synthetic IDs');
  assert.ok(inbound.includes('if (message.is_echo === true || message.is_deleted === true) continue;'));
  assert.ok(inbound.includes('stringValue(message.mid)'));
  assert.ok(inbound.includes('stringValue(postback.mid)'));
  assert.ok(inbound.includes('stringValue(referral.ref)'));
});
