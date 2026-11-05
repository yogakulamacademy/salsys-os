const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { load } = require('./helpers.cjs');

const parser = load('lib/instagram-receipt-reconciliation-validation.ts');
const fixture = {
  totalReceipts: 4470,
  processedReceipts: 4470,
  exactInboundMatches: 2450,
  ignoredNonMessageEnvelopes: 1995,
  ignoredContactShareDuplicates: 25,
  processedWithoutExactMatchReview: 0,
  ignoredAlreadyMatched: 1,
  unprocessedOrMissingStatus: 0,
  checkedAt: '2026-11-05T08:30:00Z',
};

test('Instagram reconciliation distinguishes projected, intentionally ignored and review cohorts', () => {
  assert.deepEqual(parser.parseInstagramReceiptReconciliation(fixture), fixture);
  const zero = {
    ...fixture, totalReceipts: 0, processedReceipts: 0,
    exactInboundMatches: 0, ignoredNonMessageEnvelopes: 0,
    ignoredContactShareDuplicates: 0, ignoredAlreadyMatched: 0,
  };
  assert.deepEqual(parser.parseInstagramReceiptReconciliation(zero), zero);
  const unresolved = {
    ...fixture, exactInboundMatches: 2449,
    processedWithoutExactMatchReview: 1,
  };
  assert.deepEqual(parser.parseInstagramReceiptReconciliation(unresolved), unresolved);
});

test('Instagram reconciliation rejects extra fields, identifiers, bad arithmetic and dates', () => {
  for (const invalid of [
    null, [], {}, { ...fixture, customerName: 'private' },
    { ...fixture, providerMessageId: 'sensitive' },
    { ...fixture, rawPayload: 'unavailable-to-ui' },
    { ...fixture, totalReceipts: 4469 },
    { ...fixture, processedReceipts: 4469 },
    { ...fixture, ignoredContactShareDuplicates: 26 },
    { ...fixture, processedWithoutExactMatchReview: -1 },
    { ...fixture, exactInboundMatches: 2449 },
    { ...fixture, ignoredAlreadyMatched: 2451 },
    { ...fixture, unprocessedOrMissingStatus: 1 },
    { ...fixture, ignoredNonMessageEnvelopes: '1995' },
    { ...fixture, exactInboundMatches: 0.5 },
    { ...fixture, checkedAt: 'not-a-time' },
  ]) {
    assert.throws(() => parser.parseInstagramReceiptReconciliation(invalid));
  }
});

test('SQL reads only tenant-bound Instagram metadata with service-role-only access', () => {
  const sql = readFileSync('supabase/migrations/20261105090000_instagram_receipt_reconciliation_v1.sql','utf8');
  const executable = sql.split('\n').filter(line => !line.trim().startsWith('--')).join('\n');
  for (const expected of [
    'stable', 'security invoker',
    're.organization_id = p_organization_id',
    "re.source_system = 'instagram'",
    "re.ingestion_method = 'instagram_webhook'",
    "re.source_event_type like 'message:%'",
    'rp.organization_id = re.organization_id',
    'm.organization_id = r.organization_id',
    "m.direction::text = 'inbound'",
    "c.channel::text = 'instagram'",
    'c.external_account_id = r.source_account_id',
    "'non_message_messaging_envelope'",
    "'instagram_native_contact_share_duplicate'",
    "'processedWithoutExactMatchReview'",
    "'ignoredAlreadyMatched'",
    'from public, anon, authenticated;',
    'to service_role;',
  ]) assert.ok(sql.includes(expected), expected);
  assert.doesNotMatch(executable, /\b(?:insert\s+into|update\s+public\b|delete\s+from|truncate\s+|alter\s+table|drop\s+table|create\s+trigger|perform\s+)\b/i);
  assert.doesNotMatch(executable, /\bsecurity definer\b/i);
  const projection = sql.split('select jsonb_build_object(').at(-1)?.split('from totals;')[0] ?? '';
  assert.doesNotMatch(projection, /\b(?:source_account_id|source_subject_id|organization_id|external_message_id|payload|body|processing_metadata|phone|token)\b/i);
});

test('owner/admin authorization precedes optional service RPC; no user content in UI', () => {
  const app = readFileSync('lib/message-sync-audit.ts','utf8');
  const page = readFileSync('app/system-health/message-sync/page.tsx','utf8');
  assert.match(app, /get_instagram_receipt_reconciliation_v1/);
  assert.match(app, /parseInstagramReceiptReconciliation/);
  assert.match(app, /workspace.activeOrganizationId !== active.organizationId/);
  assert.match(app, /\['owner', 'admin'\]\.includes\(active\.role\)/);
  assert.ok(app.indexOf('const admin = createAdminClient()') >
    app.indexOf('if (!active ||'));
  assert.match(app, /p_organization_id: active.organizationId/);
  assert.match(app, /instagramReceiptReconciliation = null/);
  assert.match(page, /Instagram inbound receipt reconciliation/);
  assert.match(page, /ignoredNonMessageEnvelopes/);
  assert.match(page, /processedWithoutExactMatchReview/);
  assert.match(page, /ignoredAlreadyMatched/);
  assert.match(page, /No automatic replay or message creation/);
  assert.doesNotMatch(page, /replayInstagram|sendInstagramMessage|apply: true|rawPayload|accessToken/);
});
