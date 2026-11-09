import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import vm from 'node:vm';
import pg from 'pg';
import ts from 'typescript';

// Uses the exact checked-in identity-link trigger SQL and synthetic minimal
// tables. It does not reproduce the complete live ingestion function.
const source = readFileSync(new URL('../../supabase/migrations/008_identity_resolution.sql', import.meta.url), 'utf8');
const functionSql = source.match(/CREATE OR REPLACE FUNCTION public\.link_web_sessions_from_identity\(\)[\s\S]*?\$function\$;/i)?.[0];
const triggerSql = source.match(/drop trigger if exists trg_link_web_sessions_from_identity[\s\S]*?execute function public\.link_web_sessions_from_identity\(\);/i)?.[0];
assert.ok(functionSql && triggerSql, 'Exact repository trigger definitions required');
assert.match(functionSql, /update public\.web_sessions/i);
assert.match(functionSql, /and session_key\s*=/i);
const helper = readFileSync(new URL('../../lib/website-leads/deadlock-retry.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(helper, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const helperExports = {};
vm.runInNewContext(compiled, { exports: helperExports, setTimeout });
const { retryWebsiteLeadIngestDeadlock } = helperExports;

function testAdmin() {
  assert.equal(process.env.SALSYS_ALLOW_LOCAL_DB_TESTS, '1');
  assert.ok(process.env.SALSYS_TEST_DATABASE_URL);
  const u = new URL(process.env.SALSYS_TEST_DATABASE_URL);
  assert.equal(u.protocol, 'postgres:');
  assert.ok(['127.0.0.1', 'localhost'].includes(u.hostname), 'Remote databases forbidden');
  assert.equal(u.pathname, '/postgres');
  assert.equal(u.username, 'postgres');
  return u;
}
async function waitBlocked(observer, blockedPid, holderPid) {
  for (let n = 0; n < 120; n++) {
    const r = await observer.query('select $1::int=any(pg_blocking_pids($2::int)) as blocked', [holderPid, blockedPid]);
    if (r.rows[0].blocked) return true;
    await sleep(20);
  }
  return false;
}

test('exact identity trigger creates a real 40P01; retry commits one receipt', async () => {
  const base = testAdmin();
  const db = 'salsys_r2_identity_' + randomUUID().replaceAll('-', '');
  assert.match(db, /^salsys_r2_identity_[a-f0-9]{32}$/);
  const admin = new pg.Client({ connectionString: base.href });
  const target = new URL(base); target.pathname = '/' + db;
  const connected = []; let created = false;
  const org = '10000000-0000-4000-8000-000000000001';
  const lead = '20000000-0000-4000-8000-000000000001';
  const visitor = 'synthetic-visitor';
  const session = 'synthetic-session';
  await admin.connect();
  try {
    await admin.query('create database "' + db + '"'); created = true;
    const connect = async () => {
      const c = new pg.Client({ connectionString: target.href });
      await c.connect(); connected.push(c); return c;
    };
    const setup = await connect();
    await setup.query([
      'create table public.web_sessions (organization_id uuid not null, anonymous_visitor_id text not null,',
      'session_key text not null, lead_id uuid, primary key(organization_id,session_key));',
      'create table public.visitor_identity_links (organization_id uuid not null,anonymous_visitor_id text not null,',
      'lead_id uuid,last_session_key text,primary key(organization_id,anonymous_visitor_id));',
      'create table public.fixture_ingest_events (external_event_id text primary key);',
    ].join('\n'));
    await setup.query('insert into public.web_sessions values($1,$2,$3,null)', [org,visitor,session]);
    await setup.query('insert into public.visitor_identity_links values($1,$2,$3,$4)', [org,visitor,lead,session]);
    await setup.query(functionSql);
    await setup.query(triggerSql);

    const a = await connect(), b = await connect(), observer = await connect();
    const apid = (await a.query('select pg_backend_pid() as pid')).rows[0].pid;
    const bpid = (await b.query('select pg_backend_pid() as pid')).rows[0].pid;
    await a.query("begin; set local deadlock_timeout='5s'; set local statement_timeout='12s';");
    await a.query("insert into public.fixture_ingest_events values ('event-a')");
    await a.query('update public.web_sessions set lead_id=$1 where organization_id=$2 and session_key=$3', [lead,org,session]);

    let attempts = 0, backoffs = 0, writerDone;
    const invoke = async () => {
      attempts++;
      await b.query("begin; set local deadlock_timeout='100ms'; set local statement_timeout='12s';");
      try {
        const event = await b.query(
          'insert into public.fixture_ingest_events values($1) on conflict do nothing returning external_event_id',
          ['event-b'],
        );
        if (!event.rowCount) {
          await b.query('commit'); return { data: { duplicate: true }, error: null };
        }
        await b.query(
          'insert into public.visitor_identity_links values($1,$2,$3,$4) on conflict (organization_id,anonymous_visitor_id) do update set lead_id=excluded.lead_id,last_session_key=excluded.last_session_key',
          [org,visitor,lead,session],
        );
        await b.query('commit'); return { data: { accepted: true }, error: null };
      } catch (error) {
        await b.query('rollback');
        return { data: null, error: { code: error.code, message: error.message } };
      }
    };
    const outcomeP = retryWebsiteLeadIngestDeadlock(invoke, async ms => {
      assert.equal(ms, 35); backoffs++;
      assert.deepEqual(await writerDone, { committed: true });
    });
    const wasBlocked = await waitBlocked(observer,bpid,apid);
    // B holds identity row, waits on A's web session; A now requests identity
    // row, creating the reversed lock order and selecting B as 40P01 victim.
    writerDone = a.query(
      'update public.visitor_identity_links set lead_id=$1 where organization_id=$2 and anonymous_visitor_id=$3',
      [lead,org,visitor],
    ).then(() => a.query('commit')).then(
      () => ({ committed: true }), error => ({ code: error.code ?? null }),
    );
    const outcome = await outcomeP;
    assert.equal(wasBlocked, true);
    assert.deepEqual(JSON.parse(JSON.stringify(outcome)), { data: { accepted: true }, error: null });
    assert.equal(attempts, 2); assert.equal(backoffs, 1);
    const eventRows = await observer.query(
      'select external_event_id,count(*)::int as n from public.fixture_ingest_events group by external_event_id order by external_event_id',
    );
    assert.deepEqual(eventRows.rows, [
      { external_event_id: 'event-a', n: 1 },
      { external_event_id: 'event-b', n: 1 },
    ]);
    assert.equal((await observer.query(
      'select lead_id from public.web_sessions where organization_id=$1 and session_key=$2', [org,session],
    )).rows[0].lead_id, lead);
    assert.deepEqual(await invoke(), { data: { duplicate: true }, error: null });
    assert.equal((await observer.query("select count(*)::int as n from public.fixture_ingest_events where external_event_id='event-b'")).rows[0].n,1);
  } finally {
    await Promise.allSettled(connected.map(c => c.end()));
    try { if (created) await admin.query('drop database "' + db + '" with (force)'); }
    finally { await admin.end(); }
  }
});
