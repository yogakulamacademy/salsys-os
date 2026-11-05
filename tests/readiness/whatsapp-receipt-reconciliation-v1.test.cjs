const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { load } = require('./helpers.cjs');

const parser = load('lib/whatsapp-receipt-reconciliation-validation.ts');

const fixture = {
  processedReceipts: 35,
  processedWithMessage: 29,
  processedWithoutMessage: 6,
  processedWithLink: 29,
  processedUnmatchedRawProcessed: 6,
  processedUnmatchedSameAccountThread: 0,
  processedUnmatchedOtherAccountThread: 5,
  processedUnmatchedMultipleAccountThreads: 0,
  processedUnmatchedNoSenderThread: 1,
  failedReceipts: 6,
  failedWithRawEvidence: 6,
  failedWithMessage: 0,
  failedWithoutMessage: 6,
  failedWithLink: 0,
  oldestProcessedUnmatchedAt: '2026-09-28T08:00:00Z',
  oldestFailedUnmatchedAt: '2026-09-28T09:00:00Z',
  checkedAt: '2026-11-05T05:00:00Z',
};

test('parse tenant-only WhatsApp provider receipt audit and verify arithmetic', () => {
  assert.deepEqual(parser.parseWhatsAppReceiptReconciliation(fixture), fixture);
  const empty = {
    ...fixture,
    processedReceipts: 0, processedWithMessage: 0, processedWithoutMessage: 0,
    processedWithLink: 0,
    processedUnmatchedRawProcessed: 0,
    processedUnmatchedSameAccountThread: 0,
    processedUnmatchedOtherAccountThread: 0,
    processedUnmatchedMultipleAccountThreads: 0,
    processedUnmatchedNoSenderThread: 0,
    failedReceipts: 0, failedWithRawEvidence: 0,
    failedWithMessage: 0, failedWithoutMessage: 0, failedWithLink: 0,
    oldestProcessedUnmatchedAt: null, oldestFailedUnmatchedAt: null,
  };
  assert.deepEqual(parser.parseWhatsAppReceiptReconciliation(empty), empty);
});

test('unexpected provider identifiers, message content and mismatched counts fail closed', () => {
  for (const bad of [
    null, {}, [], { ...fixture, customerPhone: 'not-for-ui' },
    { ...fixture, rawPayload: 'not-for-ui' },
    { ...fixture, externalMessageId: 'mid_private' },
    { ...fixture, processedReceipts: 34 },
    { ...fixture, processedWithMessage: 30 },
    { ...fixture, processedWithoutMessage: -1 },
    { ...fixture, processedWithLink: 36 },
    { ...fixture, processedUnmatchedRawProcessed: 7 },
    { ...fixture, processedUnmatchedOtherAccountThread: 6 },
    { ...fixture, processedUnmatchedSameAccountThread: 1 },
    { ...fixture, processedUnmatchedNoSenderThread: -1 },
    { ...fixture, processedUnmatchedMultipleAccountThreads: 2 },
    { ...fixture, failedWithRawEvidence: 7 },
    { ...fixture, failedWithLink: 7 },
    { ...fixture, failedWithoutMessage: 5 },
    { ...fixture, oldestProcessedUnmatchedAt: null },
    { ...fixture, oldestFailedUnmatchedAt: null },
    { ...fixture, checkedAt: 'not-a-date' },
    { ...fixture, failedReceipts: '6' },
    { ...fixture, failedWithMessage: 0.5 },
    { ...fixture, oldestProcessedUnmatchedAt: '2026-13-99T00:00:00Z' },
  ]) assert.throws(() => parser.parseWhatsAppReceiptReconciliation(bad));
});

test('service-only SQL reconciliation is SELECT-only, tenant-bound and projects aggregates', () => {
  const sql = readFileSync('supabase/migrations/20261105133000_whatsapp_receipt_account_identity_v2.sql', 'utf8');
  const executable = sql.split('\n').filter(line => !line.trim().startsWith('--')).join('\n');
  for (const expected of [
    'stable', 'security invoker', 'where w.organization_id = p_organization_id',
    'm.organization_id = r.organization_id',
    'l.organization_id = r.organization_id',
    're.organization_id = r.organization_id',
    "re.source_system = 'whatsapp'",
    "c.channel::text = 'whatsapp'",
    "m.direction::text = 'inbound'",
    'c.external_account_id = r.phone_number_id',
    'c.external_conversation_id = r.sender_digits',
    "'processedUnmatchedOtherAccountThread'",
    "'processedUnmatchedNoSenderThread'",
    "'processedWithoutMessage'", "'failedWithRawEvidence'",
    'from public, anon, authenticated;',
    'to service_role;',
  ]) assert.ok(sql.includes(expected), expected);
  assert.doesNotMatch(executable, /\b(?:insert\s+into|update\s+\S+|delete\s+from|truncate\s+|alter\s+table|drop\s+table|create\s+trigger|perform\s+)\b/i);
  assert.doesNotMatch(executable, /\bsecurity definer\b/i);
  assert.doesNotMatch(executable, /jsonb_build_object\([^)]*body/);
  // Account identifiers are used ONLY in tenant-constrained identity joins.
  // Keep them out of JSON output even when internal matching needs them.
  const publicProjection = sql.split('select jsonb_build_object(').at(-1)?.split('from totals;')[0] ?? '';
  assert.doesNotMatch(publicProjection,
    /\\b(?:phone_number_id|contact_wa_id|sender_digits|external_message_id|organization_id|payload|processing_error)\\b/i);
  assert.doesNotMatch(executable, /\\b(?:email|access_token|processing_error|payload|message_body)\\b/i);
});

test('server-only authenticated UI shows no raw provider MID, delivery command or replay actions', () => {
  const app = readFileSync('lib/whatsapp-coexistence-readiness.ts', 'utf8');
  const page = readFileSync('app/system-health/message-sync/page.tsx', 'utf8');
  assert.match(app, /get_whatsapp_receipt_reconciliation_v1/);
  assert.match(app, /workspace.activeOrganizationId !== active.organizationId/);
  assert.match(page, /Receipt-to-CRM reconciliation/);
  assert.match(page, /processedWithoutMessage/);
  assert.match(page, /failedWithRawEvidence/);
  assert.match(page, /processedUnmatchedOtherAccountThread/);
  assert.match(page, /processedUnmatchedNoSenderThread/);
  assert.match(page, /unavailable/);
  assert.doesNotMatch(page, /sendWhatsApp|replayWebhook|apply: true|accessToken|providerMessageId/);
});
