// Structural guard for operator-only read-only pre-release SQL.
// Synthetic verification only: this does not authenticate a live operator,
// validate backups, verify consent or authorize production migration.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const sql = readFileSync(
  path.resolve(__dirname, '../../docs/sql/r2-reliability-pre-release-guard-v1.sql'),
  'utf8'
);
const active = sql.split('\n')
  .filter(line => !line.trimStart().startsWith('--'))
  .join('\n')
  .trim();

test('operator diagnostic is exactly one SELECT/CTE query without mutation', () => {
  assert.match(active, /^with\s+sig\s+as\s*\(/i);
  assert.equal((active.match(/;/g) ?? []).length, 1);
  assert.match(active, /as aggregate_preflight_only\s+from rpc r cross join idx i cross join health h;$/i);
  assert.doesNotMatch(active,
    /\b(?:insert\s+into|update\s+public\.|delete\s+from|drop\s+(?:table|function|index)|alter\s+(?:table|function)|create\s+(?:table|function|index)|grant\s+|revoke\s+|truncate\s+|copy\s+|call\s+|execute\s+|perform\s+|lock\s+table)\b/i
  );
});

test('read-only guard verifies exact pre-migration function authority and unique index', () => {
  assert.match(active, /to_regprocedure\(/);
  assert.match(active, /309f9d3ea4929e26f6c44f77099559ed/);
  assert.match(active, /\bsecurity_definer\b/);
  assert.match(active, /\bexecute_acl\b/);
  assert.match(active, /\bsearch_path=public\b/);
  assert.match(active, /\bpi\.indisvalid\s+and\s+pi\.indisready\b/);
  assert.match(active, /uq_lead_contacts_one_primary_per_type_v1/);
  assert.match(active, /STOP_source_acl_or_index_drift/);
});

test('aggregate-only output does not counterfeit independent acceptance', () => {
  for (const gate of [
    'independent_review_verified',
    'isolated_live_e2e_verified',
    'production_backup_restore_verified',
    'production_merge_authorized',
  ]) {
    assert.match(active, new RegExp("'"+gate+"',false"));
  }
  assert.match(active, /lead_receipts_last_24h/);
  assert.match(active, /failed_receipts_last_24h/);
  assert.match(active, /duplicate_primary_contact_groups/);
  assert.match(active, /open_identity_conflict_records/);
  assert.match(sql, /No row data, UUIDs, contacts, event IDs, source keys or PII are returned/);
  assert.doesNotMatch(active, /\b(?:jsonb_agg|array_agg|string_agg)\s*\(/i);
});
