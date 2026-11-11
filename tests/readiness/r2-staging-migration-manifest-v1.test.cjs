const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const script = path.resolve(__dirname, '../../scripts/r2-staging-migration-manifest.mjs');
function fixture(entries, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r2-staging-manifest-'));
  try { for (const [name, content] of Object.entries(entries)) fs.writeFileSync(path.join(dir, name), content); return fn(dir); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
function run(folder) { return spawnSync(process.execPath, [script, folder], { encoding: 'utf8' }); }

test('hashes SQL files only and reports non-deploy authorization', () => fixture({
  '001_initial.sql': 'create table foo(id int);',
  '0065_prerequisite.sql': 'alter table foo add column bar int;',
  'README.txt': 'not an SQL migration',
}, dir => {
  const result = run(dir);
  assert.equal(result.status, 0, result.stderr);
  const data = JSON.parse(result.stdout);
  assert.equal(data.fileCount, 2);
  assert.deepEqual(data.files.map(x => x.version), ['001', '0065']);
  assert.equal(data.safety.authorizationToDeploy, false);
  assert.equal(data.safety.remoteSchemaReady, false);
  assert.ok(/^[a-f0-9]{64}$/.test(data.manifestSha256));
  assert.ok(data.files.every(x => !x.sql));
}));

test('manifest is deterministic and changes on SQL byte drift', () => fixture({
  '001_initial.sql': 'select 1;',
  '002_second.sql': 'select 2;',
}, dir => {
  const a = JSON.parse(run(dir).stdout), b = JSON.parse(run(dir).stdout);
  assert.equal(a.manifestSha256, b.manifestSha256);
  fs.writeFileSync(path.join(dir, '002_second.sql'), 'select 3;');
  const c = JSON.parse(run(dir).stdout);
  assert.notEqual(a.manifestSha256, c.manifestSha256);
}));

test('duplicate versions fail closed, without SQL content output', () => fixture({
  '029_a.sql': 'password=secret-goes-here;',
  '029_b.sql': 'select 2;',
}, dir => {
  const r = run(dir);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /DUPLICATE_MIGRATION_VERSION/);
  assert.doesNotMatch(r.stderr, /secret-goes-here/);
}));

test('invalid filename and empty migration directory fail closed', () => {
  fixture({ 'ABC_bad.sql': 'select 1;' }, dir => assert.equal(run(dir).status, 2));
  fixture({ 'notes.txt': 'hello' }, dir => assert.equal(run(dir).status, 2));
});

test('missing argument fails without any remote execution', () => {
  const r = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /BLOCKED_USAGE/);
  const source = fs.readFileSync(script, 'utf8');
  assert.doesNotMatch(source, /\b(?:fetch\(|supabase db push|apply_migration\(|create_project\()/);
});
