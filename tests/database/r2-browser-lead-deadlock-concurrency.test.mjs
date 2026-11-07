import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import vm from 'node:vm';
import pg from 'pg';
import ts from 'typescript';

// Exercise a real PostgreSQL 40P01 lock cycle against a disposable, simplified
// schema and the actual application retry helper. This is not a reproduction
// of the complete production ingest function, triggers or their full lock graph.
function localAdminUrl() {
  assert.equal(process.env.SALSYS_ALLOW_LOCAL_DB_TESTS, '1', 'Explicit local test opt-in required');
  assert.ok(process.env.SALSYS_TEST_DATABASE_URL, 'Explicit local DB URL required');
  const url = new URL(process.env.SALSYS_TEST_DATABASE_URL);
  assert.equal(url.protocol, 'postgres:', 'Only local PostgreSQL allowed');
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname), 'Remote PostgreSQL prohibited');
  assert.equal(url.pathname, '/postgres', 'Only disposable database admin allowed');
  assert.equal(url.username, 'postgres', 'Dedicated local test admin expected');
  return url;
}

const source = readFileSync(new URL('../../lib/website-leads/deadlock-retry.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const helperExports = {};
vm.runInNewContext(compiled, { exports: helperExports, setTimeout }, { filename: 'deadlock-retry.js' });
const { retryWebsiteLeadIngestDeadlock } = helperExports;

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

async function blockedBy(observer, waitingPid, holdingPid) {
  for (let i = 0; i < 140; i++) {
    const result = await observer.query(
      'select $1::integer=any(pg_blocking_pids($2::integer)) as blocked',
      [holdingPid, waitingPid],
    );
    if (result.rows[0].blocked) return true;
    await sleep(25);
  }
  return false;
}

test('disposable two-session 40P01 abort is retried once with one committed receipt', async () => {
  const adminUrl = localAdminUrl();
  const name = 'salsys_r2_ingest_race_' + randomUUID().replaceAll('-', '');
  assert.match(name, /^salsys_r2_ingest_race_[a-f0-9]{32}$/);
  const quoted = '"' + name + '"';
  const target = new URL(adminUrl);
  target.pathname = '/' + name;
  const admin = new pg.Client({ connectionString: adminUrl.href });
  const connections = [];
  let created = false;
  await admin.connect();
  try {
    await admin.query('create database ' + quoted);
    created = true;
    const connect = async () => {
      const client = new pg.Client({ connectionString: target.href });
      await client.connect();
      connections.push(client);
      return client;
    };
    const setup = await connect();
    await setup.query([
      'create table public.synthetic_visitor_identity_links (',
      '  visitor_key text primary key, last_event_id text not null);',
      'create table public.synthetic_lead_ingest_events (',
      '  external_event_id text primary key, visitor_key text not null);',
      "insert into public.synthetic_visitor_identity_links(visitor_key,last_event_id)",
      "values ('visitor_a','seed'),('visitor_b','seed');",
    ].join('\n'));

    const a = await connect(), b = await connect(), observer = await connect();
    const aPid = (await a.query('select pg_backend_pid() as pid')).rows[0].pid;
    const bPid = (await b.query('select pg_backend_pid() as pid')).rows[0].pid;
    await a.query("begin; set local statement_timeout = '10s';");
    await a.query([
      "insert into public.synthetic_lead_ingest_events values ('event_a','visitor_a');",
      "update public.synthetic_visitor_identity_links set last_event_id='event_a'",
      "where visitor_key='visitor_a';",
    ].join('\n'));

    const firstBReady = deferred(), permitSecondLock = deferred();
    const eventIdB = 'event_b';
    let attempts = 0, pauseCount = 0;
    const invoke = async () => {
      attempts++;
      await b.query('begin');
      await b.query("set local statement_timeout = '10s'");
      try {
        const inserted = await b.query(
          "insert into public.synthetic_lead_ingest_events (external_event_id,visitor_key) values ($1,'visitor_b') on conflict (external_event_id) do nothing returning external_event_id",
          [eventIdB],
        );
        if (!inserted.rowCount) {
          await b.query('commit');
          return { data: { duplicate: true }, error: null };
        }
        await b.query("update public.synthetic_visitor_identity_links set last_event_id='event_b' where visitor_key='visitor_b'");
        if (attempts === 1) {
          firstBReady.resolve();
          await permitSecondLock.promise;
        }
        await b.query("update public.synthetic_visitor_identity_links set last_event_id='event_b' where visitor_key='visitor_a'");
        await b.query('commit');
        return { data: { accepted: true }, error: null };
      } catch (error) {
        await b.query('rollback');
        return { data: null, error: { code: error.code, message: error.message } };
      }
    };

    let aFinished;
    const resultPromise = retryWebsiteLeadIngestDeadlock(invoke, async ms => {
      assert.equal(ms, 35);
      pauseCount++;
      await aFinished; // The first transaction must commit before retry.
    });
    await firstBReady.promise;
    aFinished = a.query("update public.synthetic_visitor_identity_links set last_event_id='event_a' where visitor_key='visitor_b'")
      .then(() => a.query('commit'));
    const blocked = await blockedBy(observer, aPid, bPid);
    permitSecondLock.resolve();
    const outcome = await resultPromise;
    assert.equal(blocked, true, 'Verified actual PostgreSQL conflicting locks');
    assert.deepEqual(JSON.parse(JSON.stringify(outcome)), { data: { accepted: true }, error: null });
    assert.equal(attempts, 2);
    assert.equal(pauseCount, 1);
    const receipts = await observer.query(
      'select external_event_id, count(*)::integer as n from public.synthetic_lead_ingest_events group by external_event_id order by external_event_id',
    );
    assert.deepEqual(receipts.rows, [
      { external_event_id: 'event_a', n: 1 },
      { external_event_id: 'event_b', n: 1 },
    ]);
    const visitor = await observer.query(
      "select last_event_id from public.synthetic_visitor_identity_links where visitor_key='visitor_b'");
    assert.equal(visitor.rows[0].last_event_id, 'event_b');
    const replay = await invoke();
    assert.deepEqual(replay, { data: { duplicate: true }, error: null });
    assert.equal((await observer.query(
      "select count(*)::integer as n from public.synthetic_lead_ingest_events where external_event_id='event_b'",
    )).rows[0].n, 1);
  } finally {
    await Promise.allSettled(connections.map(c => c.end()));
    try { if (created) await admin.query('drop database ' + quoted + ' with (force)'); }
    finally { await admin.end(); }
  }
});
