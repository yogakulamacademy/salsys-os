import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import pg from 'pg';

const { Client } = pg;
const foundation = readFileSync(new URL('./instagram-outbound-echo.foundation.sql', import.meta.url), 'utf8');
const projector = readFileSync(new URL('../../supabase/migrations/20261104170000_instagram_outbound_echo_v1.sql', import.meta.url), 'utf8');
const ORG = '10000000-0000-4000-8000-000000000001';
const LEAD = '20000000-0000-4000-8000-000000000001';
const THREAD = '30000000-0000-4000-8000-000000000001';
const RAW_A = '40000000-0000-4000-8000-000000000001';
const RAW_B = '40000000-0000-4000-8000-000000000002';
const ACCOUNT = 'synthetic-concurrent-ig-account';
const RECIPIENT = 'synthetic-concurrent-customer';
const MID = 'synthetic-concurrent-provider-mid';
const projectSQL = 'select public.ingest_instagram_outbound_echo_v1($1::uuid) as result';
const claims = JSON.stringify({ role: 'service_role' });

function localAdminUrl() {
  assert.equal(process.env.SALSYS_ALLOW_LOCAL_DB_TESTS, '1', 'Explicit local test opt-in required');
  assert.ok(process.env.SALSYS_TEST_DATABASE_URL, 'Explicit local database URL required');
  const u = new URL(process.env.SALSYS_TEST_DATABASE_URL);
  assert.equal(u.protocol, 'postgres:');
  assert.ok(['127.0.0.1', 'localhost'].includes(u.hostname), 'Refuse remote PostgreSQL');
  assert.equal(u.pathname, '/postgres', 'Refuse application database');
  assert.equal(u.username, 'postgres', 'Only local admin test service allowed');
  return u;
}

async function beginServiceTransaction(db) {
  await db.query('begin');
  await db.query("set local statement_timeout = '12s'");
  await db.query("set local lock_timeout = '10s'");
  await db.query("select set_config('request.jwt.claims',$1,true)", [claims]);
}

async function seed(db) {
  await db.query('insert into public.leads(id,organization_id) values($1,$2)', [LEAD,ORG]);
  await db.query("insert into public.integration_connections(organization_id,provider,status,external_account_id) values($1,'instagram','connected',$2)", [ORG,ACCOUNT]);
  await db.query("insert into public.conversations(id,organization_id,lead_id,channel,external_account_id,external_conversation_id) values($1,$2,$3,'instagram',$4,$5)", [THREAD,ORG,LEAD,ACCOUNT,ACCOUNT+':'+RECIPIENT]);
  for (const id of [RAW_A,RAW_B]) {
    await db.query(
      'insert into public.raw_events(id,organization_id,source_system,source_event_type,source_event_id,source_account_id,source_subject_id,external_message_id,payload) values($1,$2,\'instagram\',\'outbound_echo:text\',$3,$4,$5,$6,$7::jsonb)',
      [id,ORG,'echo:'+id,ACCOUNT,RECIPIENT,MID,JSON.stringify({outbound_echo:{sender:{id:ACCOUNT},recipient:{id:RECIPIENT},message:{mid:MID,is_echo:true,text:'Synthetic isolated fixture'}}})],
    );
  }
}

/**
 * Two independent transactions use the exact projector from the current
 * production migration. A holds an uncommitted unique MID; B independently
 * sees no committed MID, attempts to write, and blocks on A's unique index.
 * The baseline throws 23505 for B. A later B retry is a safe duplicate.
 * This proves no second stored record, not a clean 2xx for both first tries.
 */
test('concurrent same-MID deliveries preserve one CRM record and retry idempotently', async () => {
  const base = localAdminUrl();
  const name = 'salsys_ig_echo_race_' + randomUUID().replace(/-/g,'').slice(0,20);
  assert.match(name,/^salsys_ig_echo_race_[a-f0-9]{20}$/);
  const quoted = '"' + name + '"';
  const target = new URL(base); target.pathname = '/' + name;
  const admin = new Client({connectionString:base.toString()});
  const sessions = []; let created = false;
  await admin.connect();
  try {
    await admin.query('create database '+quoted); created = true;
    const setup = new Client({connectionString:target.toString()});
    sessions.push(setup); await setup.connect();
    await setup.query(foundation);
    await setup.query(projector); // unchanged exact repository SQL
    await seed(setup);
    const a = new Client({connectionString:target.toString()});
    const b = new Client({connectionString:target.toString()});
    const observer = new Client({connectionString:target.toString()});
    sessions.push(a,b,observer); await Promise.all([a.connect(),b.connect(),observer.connect()]);
    const bPid = (await b.query('select pg_backend_pid() as pid')).rows[0].pid;
    await beginServiceTransaction(a); await beginServiceTransaction(b);
    const first = await a.query(projectSQL,[RAW_A]);
    assert.equal(first.rows[0].result.processed,true);
    let secondSettled = false;
    const waiting = b.query(projectSQL,[RAW_B]).then(
      result=>({ok:true,result}), error=>({ok:false,error}),
    ).finally(()=>{ secondSettled = true; });
    let blocked = false;
    for(let i=0;i<120;i++) {
      const p = await observer.query('select cardinality(pg_blocking_pids($1::int))>0 as blocked',[bPid]);
      if(p.rows[0].blocked) {blocked = true; break;}
      if(secondSettled) break;
      await sleep(35);
    }
    await a.query('commit'); // release lock even if contention assertion failed
    const second = await waiting;
    assert.equal(blocked,true,'Competing independent transaction was blocked');
    assert.equal(second.ok,false,'Baseline should not create a second stored MID');
    assert.equal(second.error?.code,'23505','Unique index should reject competing MID');
    await b.query('rollback');
    const one = await observer.query('select organization_id,conversation_id,direction::text as direction,external_message_id from public.messages');
    assert.equal(one.rowCount,1);
    assert.equal(one.rows[0].organization_id,ORG);
    assert.equal(one.rows[0].conversation_id,THREAD);
    assert.equal(one.rows[0].direction,'outbound');
    assert.equal(one.rows[0].external_message_id,MID);
    await beginServiceTransaction(b);
    const retried = await b.query(projectSQL,[RAW_B]);
    assert.equal(retried.rows[0].result.duplicate_message,true);
    assert.equal(retried.rows[0].result.processed,false);
    await b.query('commit');
    const count = await observer.query('select count(*)::integer as n from public.messages');
    assert.equal(count.rows[0].n,1);
    const status = await observer.query("select status,metadata->>'duplicate_message' as duplicate from public.fixture_processing where source_event_id=$1",['echo:'+RAW_B]);
    assert.equal(status.rows[0].status,'processed');
    assert.equal(status.rows[0].duplicate,'true');
  } finally {
    await Promise.allSettled(sessions.map(c=>c.end()));
    try { if(created) await admin.query('drop database '+quoted+' with (force)'); }
    finally { await admin.end(); }
  }
});
