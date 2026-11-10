const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const basename = '20261110041634_r2_staging_privileged_function_grants_v1.sql';
const reviewedSourceBlob = '4dce41ad8f75d486c33e1364646ca24d44bf5c31';
const root = path.resolve(__dirname, '../..');
const stageFile = path.join(root, 'supabase/staging-only/migrations', basename);
const productionAutoFile = path.join(root, 'supabase/migrations', basename);
const sql = fs.readFileSync(stageFile, 'utf8');

test('CLI-generated R2 ACL migration is parked outside the automatic production migration path', () => {
  assert.match(basename, /^\d{14}_r2_staging_privileged_function_grants_v1\.sql$/);
  assert.equal(fs.existsSync(stageFile), true);
  assert.equal(fs.existsSync(productionAutoFile), false);
  assert.doesNotMatch(stageFile, /\/supabase\/migrations\//);
});

test('stage-only SQL is byte-identical to independently approved PR #682 source blob', () => {
  const gitBlob = crypto.createHash('sha1')
    .update('blob ' + Buffer.byteLength(sql, 'utf8') + '\0')
    .update(sql, 'utf8')
    .digest('hex');
  assert.equal(gitBlob, reviewedSourceBlob, 'Review again if ANY SQL byte changes');
});

test('staged ACL package is bounded and maintains human-only Sales Asset invariant', () => {
  assert.match(sql, /^BEGIN;$/m);
  assert.match(sql, /^COMMIT;$/m);
  assert.match(sql, /^SET LOCAL lock_timeout = '5s';$/m);
  assert.match(sql, /^SET LOCAL statement_timeout = '30s';$/m);
  assert.equal((sql.match(/^REVOKE EXECUTE ON FUNCTION public\./gm) || []).length, 26);
  assert.equal((sql.match(/^ALTER FUNCTION public\./gm) || []).length, 4);
  assert.doesNotMatch(sql, /^\s*GRANT\b/im);
  assert.doesNotMatch(sql, /^\s*(?:DROP|TRUNCATE|DELETE FROM|INSERT INTO|UPDATE public\.)\b/im);
  assert.doesNotMatch(sql, /^\s*REVOKE EXECUTE ON FUNCTION public\.approve_sales_asset_v1\(/m);
  assert.match(sql, /BLOCKED_R2_SALES_ASSET_HUMAN_ONLY_PREFLIGHT_FAILED/);
  assert.match(sql, /BLOCKED_R2_SALES_ASSET_HUMAN_ONLY_POSTFLIGHT_FAILED/);
  assert.match(sql, /NOT pg_catalog\.has_function_privilege\('service_role',p\.oid,'EXECUTE'\)/);
  assert.match(sql, /BLOCKED_R2_POSTINSTALL_FUNCTION_GRANTS_PARITY_FAILED/);
  assert.match(sql, /BLOCKED_R2_PUBLIC_INVOKER_POSTFLIGHT_FAILED/);
});
