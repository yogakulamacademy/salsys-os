const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const script = path.resolve(__dirname, '../../scripts/r2-staging-sql-external-effects-audit.mjs');
async function fixture(sqlFiles, cb) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r2-effects-inventory-'));
  try {
    for (const [name, sql] of Object.entries(sqlFiles)) fs.writeFileSync(path.join(dir,name),sql);
    const tool = await import('../../scripts/r2-staging-sql-external-effects-audit.mjs');
    return await cb({dir,tool});
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
}

test('identifies scheduled jobs and live-domain literals without printing contents', async () => {
  await fixture({
    '001_jobs.sql': "do $$ begin perform cron.schedule('retry','* * * * *','select 1;'); end $$;",
    '002_endpoint.sql': "select 'https://salsysos.com/private/example?secret=this_must_not_leak';",
  }, ({dir,tool}) => {
    const audit=tool.auditStagedMigrationFiles(dir), printed=JSON.stringify(audit);
    assert.equal(audit.inspectedSqlFiles,2);
    assert.equal(audit.categories.cron_schedule,1);
    assert.equal(audit.categories.remote_url_literal,1);
    assert.equal(audit.authorizedToRunMigrations,false);
    assert.equal(audit.absenceOfExternalEffectsVerified,false);
    assert.doesNotMatch(printed,/this_must_not_leak|\/private\/example|salsysos.com/);
  });
});

test('reports network extensions, HTTP invocations, vault, outbound and cross DB candidates', async () => {
  await fixture({
    '001_network.sql': "create extension if not exists pg_net; select net.http_post('https://example.com', '{}'); select vault.decrypted_secrets; select dblink_connect('x'); select send_whatsapp('x');",
  }, ({dir,tool}) => {
    const a=tool.auditStagedMigrationFiles(dir);
    for(const kind of ['extension_network','http_execution','remote_url_literal','vault_reference','cross_database','outbound_queue']) {
      assert.ok(a.categories[kind] > 0, kind);
    }
    assert.ok(a.candidateOccurrences>=6);
  });
});

test('hashes are deterministic and change when migration bytes change', async () => {
  await fixture({'001_first.sql':'select 1;'}, ({dir,tool}) => {
    const a=tool.auditStagedMigrationFiles(dir),b=tool.auditStagedMigrationFiles(dir);
    assert.equal(a.sqlManifestSha256,b.sqlManifestSha256);
    fs.writeFileSync(path.join(dir,'001_first.sql'),'select 2;');
    assert.notEqual(a.sqlManifestSha256,tool.auditStagedMigrationFiles(dir).sqlManifestSha256);
  });
});

test('zero detected candidates is NOT proof of safety', async () => {
  await fixture({'001_first.sql':'select 1;'}, ({dir,tool}) => {
    const a=tool.auditStagedMigrationFiles(dir);
    assert.equal(a.candidateOccurrences,0);
    assert.equal(a.reviewRequired,true);
    assert.equal(a.authorizedToRunMigrations,false);
    assert.equal(a.absenceOfExternalEffectsVerified,false);
  });
});

test('bad working tree, duplicate versions and missing CLI argument fail closed', async () => {
  await fixture({'029_a.sql':'select 1;','029_b.sql':'select 2;'}, ({dir,tool}) => {
    assert.throws(()=>tool.auditStagedMigrationFiles(dir),/DUPLICATE_MIGRATION_VERSION/);
    const r=spawnSync(process.execPath,[script,dir],{encoding:'utf8'});
    assert.equal(r.status,2);
    assert.match(r.stderr,/BLOCKED_INVALID_MIGRATION_WORKTREE/);
  });
  const r=spawnSync(process.execPath,[script],{encoding:'utf8'});
  assert.equal(r.status,2);
  assert.match(r.stderr,/BLOCKED_USAGE_EXPLICIT_LOCAL_DIRECTORY_REQUIRED/);
});
