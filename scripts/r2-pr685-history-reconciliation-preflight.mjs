import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// READ-ONLY OFFLINE SIMULATION: NO database connections, CLI repair, DDL or history write.
// This is a DBA decision aid; NOT an executable authorization to modify a hosted ledger.
const STAGING_PROJECT = 'ndxpjqkthuzxlmbenxti';
const MISSING_VERSION = '20261110041634';
const MISSING_NAME = 'r2_staging_privileged_function_grants_v1';
const EXPECTED_SOURCE_BLOB = '4dce41ad8f75d486c33e1364646ca24d44bf5c31';
const EXPECTED_LOCAL_REPLAY_DIGEST = '9b83197df43d64401e6444f0af5458ddae5b8e4be7573736f7a4ff979d1f4d90';
const VERSION_ALIAS_ROWS = [
  ['20261111082713', '20261111103500', 'whatsapp_template_drafts_v1'],
  ['20261111082927', '20261111141500', 'whatsapp_template_draft_name_length_guard_v1'],
];

export function simulateReconciliation(snapshot) {
  // Pin the ENTIRE reviewed fixture bytes: version+name records and aliases.
  // A version-only digest cannot detect a migration name silently changing.
  const fixturePath = path.resolve('tests/fixtures/r2-pr685-staging-ledger-20261111.json');
  const reviewedBytes = fs.readFileSync(fixturePath);
  const checkedGitBlob = crypto.createHash('sha1')
    .update('blob ' + reviewedBytes.byteLength + '\0')
    .update(reviewedBytes)
    .digest('hex');
  assert.equal(checkedGitBlob, '250d76174f6b7388cc61fcff1310884fb6d16d7c',
    'reviewed staging snapshot bytes changed; independent recheck required');
  assert.deepEqual(snapshot, JSON.parse(reviewedBytes.toString('utf8')),
    'incoming snapshot differs from reviewed original');
  assert.equal(snapshot.source_project, STAGING_PROJECT, 'wrong project');
  assert.equal(snapshot.expected_ledger_count, 433, 'unexpected count contract');
  assert.equal(snapshot.source_reviewed_blob, EXPECTED_SOURCE_BLOB, 'reviewed SQL blob changed');
  assert.equal(snapshot.manual_sql_version_absent, MISSING_VERSION, 'wrong missing version');
  assert.equal(snapshot.local_replay_404_sha256_sorted_versions_newline_join, EXPECTED_LOCAL_REPLAY_DIGEST);
  assert(Array.isArray(snapshot.migrations), 'missing ledger');
  assert.equal(snapshot.migrations.length, 433, 'hosted migration count drift');
  const rows = snapshot.migrations;
  for (const row of rows) {
    assert(row && typeof row.version === 'string' && /^\d{3,14}$/.test(row.version), 'invalid migration version');
    assert(typeof row.name === 'string' && /^[a-z0-9_]+$/.test(row.name), 'invalid migration name');
  }
  const versions = rows.map(row => row.version);
  assert.equal(new Set(versions).size, 433, 'duplicate versions');
  assert(!versions.includes(MISSING_VERSION), 'candidate version already recorded; STOP');
  assert.deepEqual(snapshot.whatsapp_aliases.map(a => [a.staging, a.source_replay, a.name]), VERSION_ALIAS_ROWS, 'alias drift');
  assert.deepEqual(rows.slice(-2).map(r => [r.version, r.name]),
    VERSION_ALIAS_ROWS.map(a => [a[0], a[2]]),
    'expected WhatsApp migrations are no longer the final hosted records');
  for (const a of snapshot.whatsapp_aliases) {
    assert(!versions.includes(a.source_replay), 'source/replay alias unexpectedly hosted');
  }
  const mapping = new Map(VERSION_ALIAS_ROWS.map(a => [a[0], a[1]]));
  const mapped = versions.map(v => mapping.get(v) || v).sort();
  const digest = crypto.createHash('sha256').update(mapped.join('\n')).digest('hex');
  assert.equal(digest, EXPECTED_LOCAL_REPLAY_DIGEST, 'hosted history fingerprint drift');

  // Produce an OFFLINE array only. Do not change original snapshot or execute SQL.
  const simulated = rows.map(r => ({ version:r.version, name:r.name }));
  simulated.push({ version:MISSING_VERSION, name:MISSING_NAME });
  simulated.sort((a,b) => a.version.localeCompare(b.version));
  assert.equal(simulated.length,434);
  assert.equal(new Set(simulated.map(r => r.version)).size,434);
  for (const row of rows) {
    assert(simulated.some(x => x.version === row.version && x.name === row.name),
      'original ledger entry was lost');
  }
  assert.deepEqual(snapshot.migrations, rows, 'snapshot changed');
  return {
    verdict: 'OFFLINE_RECONCILIATION_CANDIDATE_NOT_AUTHORIZED',
    staging_project: STAGING_PROJECT,
    reviewed_source_sql_git_blob: EXPECTED_SOURCE_BLOB,
    reviewed_migration_version: MISSING_VERSION,
    reviewed_migration_name: MISSING_NAME,
    snapshot_date_utc: snapshot.observed_date_utc,
    verified_existing_rows: rows.length,
    hypothetical_rows_if_separately_authorized: simulated.length,
    hypothetical_additions: [simulated.find(x => x.version === MISSING_VERSION)],
    all_433_original_entries_preserved_in_simulation: true,
    staged_sql_was_already_manually_applied: 'evidence documented in issue #531; not re-executed here',
    alias_versions_unmodified: VERSION_ALIAS_ROWS,
    required_before_any_hosted_action: [
      'Independent qualified DBA confirms full exact database state and manual SQL execution evidence',
      'Independent DBA confirms provider-supported migration-history reconciliation method and risks of older version insertion',
      'A verified isolated physical restore or explicit risk acceptance for missing restore evidence',
      'Recorded named recovery operator and separately approved rollback plan',
      'Fresh hosted ledger/catalog preflight must match reviewed fingerprint; abort if not',
      'Separate owner authorization for a precisely scoped hosted action; none exists in this workflow',
    ],
    non_goals: [
      'This file contains no executable SQL, migration repair, hosted writes or database connectivity',
      'No provider physical backup restored; no RPO/RTO verified',
      'No proof of full 433 migration SQL body parity or complete application behavior',
    ],
  };
}

const executedDirectly=process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (executedDirectly) {
  const fixture = path.resolve('tests/fixtures/r2-pr685-staging-ledger-20261111.json');
  const snapshot = JSON.parse(fs.readFileSync(fixture, 'utf8'));
  const output = simulateReconciliation(snapshot);
  // Default is stdout; optional file exists ONLY within GitHub runner artifact directory.
  const outIndex = process.argv.indexOf('--out');
  if (outIndex >= 0) {
    const outFile=process.argv[outIndex+1];
    assert(outFile && !outFile.startsWith('-'), 'missing --out filename');
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(output,null,2)+'\n');
  }
  console.log(JSON.stringify(output,null,2));
}
