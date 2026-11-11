const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const source=path.resolve('tests/fixtures/r2-pr685-staging-ledger-20261111.json');
const base=JSON.parse(fs.readFileSync(source, 'utf8'));
const fresh=()=>JSON.parse(JSON.stringify(base));
const load=()=>import(pathToFileURL(path.resolve('scripts/r2-pr685-history-reconciliation-preflight.mjs')).href);

test('offline simulation verifies 433 hosted versions; proposes exactly one candidate without changing the original ledger', async () => {
  const { simulateReconciliation }=await load();
  const data=fresh();
  const preserved=JSON.stringify(data);
  const result=simulateReconciliation(data);
  assert.equal(result.verdict,'OFFLINE_RECONCILIATION_CANDIDATE_NOT_AUTHORIZED');
  assert.equal(result.verified_existing_rows,433);
  assert.equal(result.hypothetical_rows_if_separately_authorized,434);
  assert.equal(result.hypothetical_additions.length,1);
  assert.deepEqual(result.hypothetical_additions,[{
    version:'20261110041634',name:'r2_staging_privileged_function_grants_v1'
  }]);
  assert.equal(result.all_433_original_entries_preserved_in_simulation,true);
  assert.equal(JSON.stringify(data),preserved,'source manifest was mutated');
  assert.deepEqual(result.alias_versions_unmodified.map(x=>x[0]),['20261111082713','20261111082927']);
});

test('fail closed for unexpected old/new migration state or mismatched source', async () => {
  const { simulateReconciliation }=await load();
  for (const change of [
    s=>{s.migrations.pop();},
    s=>{s.migrations[0].version=s.migrations[1].version;},
    s=>{s.migrations[0].version='999';},
    s=>{s.migrations.push({version:'20261110041634',name:'r2_staging_privileged_function_grants_v1'});},
    s=>{s.whatsapp_aliases[0].staging='20261111082714';},
    s=>{s.whatsapp_aliases[1].name='unverified_name';},
    s=>{s.migrations[s.migrations.length-1].name='unexpected_name';},
    s=>{s.source_project='doaozrkrtgeslddwhclj';},
    s=>{s.source_reviewed_blob='incorrect';},
    s=>{s.local_replay_404_sha256_sorted_versions_newline_join='incorrect';},
    s=>{s.migrations[4].name='unexpected_name';},
  ]) {
    const s=fresh(); change(s);
    assert.throws(()=>simulateReconciliation(s));
  }
});

test('offline program contains no database client dependency or SQL execution', () => {
  const src=fs.readFileSync(path.resolve('scripts/r2-pr685-history-reconciliation-preflight.mjs'),'utf8');
  assert.doesNotMatch(src, /from ['"](?:pg|@supabase\/supabase-js|postgres)['"]/);
  assert.doesNotMatch(src, /(?:child_process|execSync|spawnSync|fetch\s*\(|https?\.request)/);
  assert.doesNotMatch(src, /(?:supabase\\s+(?:migration\\s+repair|db\\s+push)|execute_sql\\s*\\(|apply_migration\\s*\\(|INSERT\\s+INTO\\s+supabase_migrations)/i);
});
