const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const stageDir = path.join(root, 'supabase/staging-only/migrations');
const autoDir = path.join(root, 'supabase/migrations');
const specs = [
  {
    name: 'tenant',
    filename: '20261110043007_r2_staging_automation_tenant_guard_v1.sql',
    reviewedBlob: 'e621500b5264aab86cbbcd1b91b718631254a9ed',
  },
  {
    name: 'privacy',
    filename: '20261110043010_r2_staging_privacy_identity_dependencies_v1.sql',
    reviewedBlob: '2a7af019efb727a2e5036ab1611b1d084edbd142',
  },
];
function gitBlob(text) {
  return crypto.createHash('sha1')
    .update('blob '+Buffer.byteLength(text,'utf8')+'\0')
    .update(text,'utf8').digest('hex');
}
const sqlByName = Object.fromEntries(specs.map(spec => [
  spec.name, fs.readFileSync(path.join(stageDir,spec.filename),'utf8'),
]));

test('two ordered CLI-generated stage-only migrations avoid normal production replay path', () => {
  for (const s of specs) {
    assert.match(s.filename, /^\d{14}_r2_staging_[a-z_]+_v1\.sql$/);
    assert.ok(fs.existsSync(path.join(stageDir,s.filename)));
    assert.equal(fs.existsSync(path.join(autoDir,s.filename)),false);
    assert.equal(gitBlob(sqlByName[s.name]),s.reviewedBlob,'Any SQL byte drift requires new independent review: '+s.name);
  }
  assert.ok(specs[0].filename < specs[1].filename,'Tenant guard must precede privacy dependency');
  assert.equal(new Set(specs.map(x=>x.filename)).size,2);
});

test('tenant function contract cannot expand privileges, background actions or table scope', () => {
  const sql=sqlByName.tenant;
  assert.match(sql,/^BEGIN;$/m);
  assert.match(sql,/^COMMIT;$/m);
  assert.match(sql,/^SET LOCAL lock_timeout = '5s';$/m);
  assert.match(sql,/^SET LOCAL statement_timeout = '30s';$/m);
  assert.equal((sql.match(/^CREATE OR REPLACE FUNCTION /gm)||[]).length,1);
  assert.equal((sql.match(/^CREATE TRIGGER /gm)||[]).length,0);
  assert.doesNotMatch(sql,/^\s*(?:GRANT|REVOKE|DROP|TRUNCATE|INSERT|UPDATE|DELETE)\b/im);
  assert.match(sql,/BLOCKED_R2_AUTOMATION_GUARD_SOURCE_OR_ACL_MISMATCH/);
  assert.match(sql,/BLOCKED_R2_AUTOMATION_TRIGGER_TABLE_CONTRACT_MISMATCH/);
  assert.match(sql,/BLOCKED_R2_AUTOMATION_GUARD_POSTFLIGHT_FAILED/);
  assert.match(sql,/NOT pg_catalog\.has_function_privilege\('anon',p\.oid,'EXECUTE'\)/);
  assert.match(sql,/NOT pg_catalog\.has_function_privilege\('authenticated',p\.oid,'EXECUTE'\)/);
  assert.match(sql,/pg_catalog\.has_function_privilege\('service_role',p\.oid,'EXECUTE'\)/);
  for (const table of ['automation_events','automation_runs','automation_enrollments',
    'automation_suppressions','automation_scheduled_jobs','automation_variables','automation_wait_states']) {
    assert.ok(sql.includes("'"+table+"'"),'Missing guarded table '+table);
  }
});

test('privacy tables require RLS, two parent composite keys and four tenant-paired FKs', () => {
  const sql=sqlByName.privacy;
  assert.match(sql,/^BEGIN;$/m);
  assert.match(sql,/^COMMIT;$/m);
  assert.equal((sql.match(/^CREATE TABLE /gm)||[]).length,2);
  assert.equal((sql.match(/^CREATE POLICY /gm)||[]).length,2);
  assert.match(sql,/ADD CONSTRAINT r2_privacy_person_org_id_key UNIQUE \(organization_id,id\)/);
  assert.match(sql,/ADD CONSTRAINT r2_privacy_request_org_id_key UNIQUE \(organization_id,id\)/);
  assert.equal((sql.match(/FOREIGN KEY \(organization_id,(?:request_id|person_id)\)/g)||[]).length,4);
  assert.match(sql,/ON DELETE SET NULL \(person_id\)/);
  assert.match(sql,/BLOCKED_R2_PRIVACY_SAME_TENANT_FOREIGN_KEYS/);
  assert.match(sql,/BLOCKED_R2_PRIVACY_COMPOSITE_PARENT_KEYS/);
  assert.match(sql,/BLOCKED_R2_PRIVACY_TARGET_TABLE_ALREADY_EXISTS/);
  assert.doesNotMatch(sql,/^\s*(?:DELETE FROM|TRUNCATE|DROP TABLE|UPDATE public\.)\b/im);
});

test('stage package has no active migration hook or hosting credentials', () => {
  for (const sql of Object.values(sqlByName)) {
    assert.doesNotMatch(sql,/ndxpjqkthuzxlmbenxti|doaozrkrtgeslddwhclj/);
    assert.doesNotMatch(sql,/https?:\/\/|supabase\.co|sb_secret_|bearer\s/i);
  }
});
