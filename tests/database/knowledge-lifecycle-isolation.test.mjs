import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import pg from 'pg';

const { Client } = pg;

/**
 * KB-05A: execute exact checked-in Organization Knowledge lifecycle and
 * tenant-authorization functions in a disposable LOCAL PostgreSQL database.
 * The fixture rolls back all application objects and synthetic rows.
 */
function localAdminUrl() {
  assert.equal(process.env.SALSYS_ALLOW_LOCAL_DB_TESTS, '1',
    'Only explicit local test runners may execute this fixture');
  const raw = process.env.SALSYS_TEST_DATABASE_URL;
  assert.ok(raw, 'Dedicated local PostgreSQL test URL required');
  const url = new URL(raw);
  assert.equal(url.protocol, 'postgres:', 'No remote URI schemes');
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname),
    'Only loopback PostgreSQL is allowed');
  assert.equal(url.pathname, '/postgres', 'Never use a customer application database');
  assert.equal(url.username, 'postgres', 'Only disposable local-admin test credentials');
  return url;
}

const roles = [
  'do $roles$',
  'begin',
  "  if not exists (select 1 from pg_roles where rolname='anon') then",
  '    create role anon nologin;',
  '  end if;',
  "  if not exists (select 1 from pg_roles where rolname='authenticated') then",
  '    create role authenticated nologin;',
  '  end if;',
  "  if not exists (select 1 from pg_roles where rolname='service_role') then",
  '    create role service_role nologin;',
  '  end if;',
  'end;',
  '$roles$;',
].join('\n');

test('exact production knowledge SQL: tenant isolation, approval, source validity, archive and rollback', async () => {
  const base = localAdminUrl();
  const name = 'salsys_kb05a_' + randomUUID().replaceAll('-', '').slice(0, 20);
  const target = new URL(base);
  target.pathname = '/' + name;
  const admin = new Client({ connectionString: base.toString() });
  const sandbox = new Client({ connectionString: target.toString() });
  const tempDir = await mkdtemp(join(tmpdir(), 'salsys-kb05a-'));
  const generatedPath = join(tempDir, 'knowledge-lifecycle.rollback.sql');
  let created = false;
  let sandboxConnected = false;

  await admin.connect();
  try {
    await admin.query('create database "' + name + '"');
    created = true;
    await sandbox.connect();
    sandboxConnected = true;

    const preflight = await sandbox.query(
      "select to_regclass('public.organizations') as organizations, " +
      "to_regclass('public.knowledge_documents') as knowledge, " +
      "to_regclass('public.payments') as payments",
    );
    assert.deepEqual(preflight.rows[0],
      { organizations: null, knowledge: null, payments: null },
      'Refuse non-empty or application-like test database');

    await sandbox.query(roles);
    const authBootstrap = await readFile(
      new URL('./local-auth-bootstrap.sql', import.meta.url), 'utf8',
    );
    await sandbox.query(authBootstrap);

    // The existing builder extracts canonical authorization helper definitions
    // and exact committed knowledge migrations, then inserts the existing
    // rollback-only fixture. We never change the SQL under test.
    execFileSync(process.execPath, [
      resolve('scripts/build-knowledge-readiness-sandbox.mjs'),
      generatedPath,
    ], {
      cwd: process.cwd(),
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 20_000,
    });

    const sql = await readFile(generatedPath, 'utf8');
    assert.ok(sql.length > 25_000, 'Require complete generated lifecycle SQL');
    assert.ok(sql.includes('create_source_backed_knowledge_document_v2'));
    assert.ok(sql.includes('approve_knowledge_document_v1'));
    assert.ok(sql.includes('search_organization_knowledge_v1'));
    assert.ok(sql.includes('owner A cannot create source-backed knowledge in B'));
    assert.ok(sql.includes('tenant B direct read cannot see A'));
    assert.ok(sql.includes('anonymous source-backed lifecycle execute denied'));

    // A single connection and simple protocol preserve BEGIN/ROLLBACK.
    const batch = await sandbox.query(sql);
    const last = Array.isArray(batch) ? batch.at(-1) : batch;
    assert.equal(last?.rows?.length, 1, 'Expected final rollback audit');
    assert.equal(last.rows[0].suite, 'knowledge_readiness_v2');
    assert.equal(last.rows[0].assertions_completed, 27);
    assert.equal(last.rows[0].rollback_verified, true,
      'Knowledge fixture must remove all application objects');

    const postflight = await sandbox.query(
      "select to_regclass('public.organizations') as organizations, " +
      "to_regclass('public.knowledge_documents') as knowledge, " +
      "to_regclass('public.knowledge_sources') as sources, " +
      "to_regclass('public.knowledge_approvals') as approvals",
    );
    assert.deepEqual(postflight.rows[0],
      { organizations: null, knowledge: null, sources: null, approvals: null });

    // This proves synthetic PostgreSQL role/tenant behavior only, not live
    // Supabase authentication, consent, retention or production readiness.
  } finally {
    if (sandboxConnected) await sandbox.end().catch(() => {});
    try {
      if (created) await admin.query('drop database "' + name + '" with (force)');
    } finally {
      await admin.end().catch(() => {});
      await rm(tempDir, { recursive: true, force: true });
    }
  }
});
