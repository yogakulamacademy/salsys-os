const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const script = path.join(root, 'scripts/r2-hosted-branch-ledger-preflight.mjs');
const pre = readFileSync(path.join(root, 'supabase/migrations/0065_catalog_integration_prerequisites.sql'), 'utf8');
const dep = readFileSync(path.join(root, 'supabase/migrations/007_tenant_schema_foundation.sql'), 'utf8');
const rec = readFileSync(path.join(root, 'supabase/recovery/007_catalog_authorization_prerequisite.sql'), 'utf8');

function run(snapshot) {
  const dir = mkdtempSync(path.join(tmpdir(), 'salsys-ledger-test-'));
  try {
    const file = path.join(dir, 'versions.json');
    writeFileSync(file, JSON.stringify(snapshot));
    const result = spawnSync(process.execPath, [script, '--ledger-json', file], { encoding: 'utf8' });
    return { exit: result.status, json: JSON.parse(result.stdout), stderr: result.stderr };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// Version-only real-provider subset from 2026-11-09; no customer data.
const observed = { migrations: ['001','002','003','004','005','006','007','008','009'].map(version => ({version})) };

test('observed provider ledger fails closed on missing 0065', () => {
  const r = run(observed);
  assert.equal(r.exit, 2);
  assert.equal(r.json.status, 'BLOCKED_0065_NOT_RECORDED_BEFORE_007');
  assert.equal(r.json.authorizationToCreatePaidBranch, false);
  assert.equal(r.json.fullMigrationReplayVerified, false);
  assert.equal(r.json.isolatedE2EVerified, false);
});

test('synthetic ledger including 0065 passes only known 007 prerequisite', () => {
  const r = run({ migrations: [...observed.migrations, {version:'0065'}] });
  assert.equal(r.exit, 0);
  assert.equal(r.json.status, 'PASS_KNOWN_007_PREREQUISITE_ONLY');
  assert.equal(r.json.fullMigrationReplayVerified, false);
  assert.equal(r.json.authorizationToCreatePaidBranch, false);
});

test('malformed, duplicate and incomplete snapshots never pass', () => {
  for (const input of [null, {}, {migrations:[]},
    {migrations:[{version:'006'}, {version:'007'}, {version:'007'}, {version:'0065'}]},
    {migrations:['006','0065']},
    {migrations:['006','007','0065','../../secret']},
    {migrations:['006', '007', 65]},
  ]) {
    const r = run(input);
    assert.equal(r.exit, 2);
    assert.ok(r.json.status.startsWith('BLOCKED_'));
  }
});

test('repository prerequisite and recovery SQL keep required columns', () => {
  for (const marker of ['source_system text','external_course_id text','external_batch_id text']) {
    assert.ok(pre.includes(marker));
    assert.ok(rec.includes(marker));
  }
  assert.match(dep, /uq_courses_org_source_external/);
  assert.match(dep, /public\.courses\(organization_id, source_system, external_course_id\)/);
  assert.equal(pre.replace(/\r\n/g,'\n'), rec.replace(/\r\n/g,'\n'));
});

test('CLI refuses to run without explicit local snapshot and makes no provider call', () => {
  const r = spawnSync(process.execPath, [script], {encoding:'utf8'});
  assert.equal(r.status, 2);
  assert.equal(JSON.parse(r.stdout).status, 'BLOCKED_LEDGER_SNAPSHOT_REQUIRED');
  assert.doesNotMatch(readFileSync(script, 'utf8'), /\b(?:fetch\(|create_branch\(|supabase db push|apply_migration\()/);
});
