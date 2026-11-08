const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const runner = path.join(root, 'scripts/r2-local-contact-rollback-rehearsal.mjs');

test('rollback SQL generator is opt-in and emits no SQL without the exact local-only flag', () => {
  const bad = spawnSync(process.execPath, [runner], { cwd: root, encoding: 'utf8' });
  assert.notEqual(bad.status, 0);
  assert.equal(bad.stdout, '');
});

test('generated disposable SQL rehearses old function restoration, then rolls back', () => {
  const result = spawnSync(process.execPath, [runner, '--disposable-local-only'], {
    cwd: root, encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const sql = result.stdout;
  assert.match(sql, /^\\set ON_ERROR_STOP on\n/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.ingest_website_lead\(/);
  assert.match(sql, /R2 local: legacy RPC not precisely restored/);
  assert.match(sql, /R2 local: transaction rollback did not preserve repaired RPC/);
  assert.match(sql, /current_setting\('salsys\.r2_local_preimage_hash'\)/);
  assert.match(sql, /SECURITY DEFINER\s+SET search_path TO 'public'/);
  assert.match(sql, /309f9d3ea4929e26f6c44f77099559ed/);
  assert.ok(sql.indexOf('BEGIN;') < sql.indexOf('CREATE OR REPLACE FUNCTION public.ingest_website_lead('));
  assert.ok(sql.indexOf('CREATE OR REPLACE FUNCTION public.ingest_website_lead(') < sql.indexOf('\nROLLBACK;'));
  assert.ok(sql.indexOf('\nROLLBACK;') < sql.indexOf('R2 local: transaction rollback did not preserve repaired RPC'));
  assert.equal((sql.match(/^ROLLBACK;$/gm) || []).length, 1);
  assert.doesNotMatch(sql, /https?:\/\//);
});
