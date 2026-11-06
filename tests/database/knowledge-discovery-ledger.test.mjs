import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const { Client } = pg;
const foundation = readFileSync(new URL('./knowledge-discovery.foundation.sql', import.meta.url), 'utf8');
const exactDraft = readFileSync(new URL('../../docs/sql/KB-01B-discovery-schema-DRAFT.sql', import.meta.url), 'utf8');
const ORG_A = '10000000-0000-4000-8000-000000000001';
const ORG_B = '10000000-0000-4000-8000-000000000002';
const USER_A = '20000000-0000-4000-8000-000000000001';
const USER_B = '20000000-0000-4000-8000-000000000002';
const STRANGER = '20000000-0000-4000-8000-000000000003';

function localAdminUrl() {
  assert.equal(process.env.SALSYS_ALLOW_LOCAL_DB_TESTS,'1','Explicit local opt-in required');
  const raw = process.env.SALSYS_TEST_DATABASE_URL;
  assert.ok(raw,'Local test URL required');
  const url = new URL(raw);
  assert.equal(url.protocol,'postgres:');
  assert.ok(['localhost','127.0.0.1'].includes(url.hostname),'Never connect to remote PostgreSQL');
  assert.equal(url.pathname,'/postgres','Refuse application databases');
  assert.equal(url.username,'postgres','Local admin only');
  return url;
}
async function context(db,role,user) {
  await db.query('begin');
  await db.query("set local statement_timeout = '10s'");
  await db.query('set local role '+role);
  await db.query('select set_config($1,$2,true)',[
    'request.jwt.claims',JSON.stringify({role,sub:user}),
  ]);
}

test('exact KB-01B SQL passes tenant, RLS, lease and cancellation checks in disposable PostgreSQL', async () => {
  const base = localAdminUrl();
  const name = 'salsys_kb01c_'+randomUUID().replaceAll('-','').slice(0,20);
  const dbName = '"'+name+'"';
  const target = new URL(base);target.pathname='/'+name;
  const admin = new Client({connectionString:base.toString()});
  const sessions=[];let created=false;
  await admin.connect();
  try {
    await admin.query('create database '+dbName);created=true;
    const db = new Client({connectionString:target.toString()});
    sessions.push(db);await db.connect();
    assert.equal((await db.query("select to_regclass('public.organizations') as existing")).rows[0].existing,null);
    await db.query(foundation);
    await db.query(exactDraft);
    await db.query('insert into public.organizations(id) values($1),($2)',[ORG_A,ORG_B]);
    await db.query('insert into public.test_knowledge_admins(organization_id,user_id) values($1,$2),($3,$4)',[ORG_A,USER_A,ORG_B,USER_B]);

    const acl=await db.query(
      "select "+
      "has_table_privilege('anon','public.knowledge_discovery_jobs','SELECT') as anon_jobs,"+
      "has_table_privilege('authenticated','public.knowledge_discovery_jobs','INSERT') as client_insert,"+
      "has_table_privilege('authenticated','public.knowledge_discovery_jobs','UPDATE') as client_update,"+
      "has_table_privilege('authenticated','public.knowledge_discovery_pages','INSERT') as client_page_insert,"+
      "has_function_privilege('anon','public.claim_knowledge_discovery_job_v1()','EXECUTE') as anon_claim,"+
      "has_function_privilege('authenticated','public.claim_knowledge_discovery_job_v1()','EXECUTE') as client_claim,"+
      "has_function_privilege('service_role','public.claim_knowledge_discovery_job_v1()','EXECUTE') as service_claim"
    );
    assert.deepEqual(acl.rows[0],{
      anon_jobs:false,client_insert:false,client_update:false,client_page_insert:false,
      anon_claim:false,client_claim:false,service_claim:true,
    });

    const aJob=await db.query(
      "insert into public.knowledge_discovery_jobs(organization_id,created_by,seed_url,max_pages)"+
      " values($1,$2,'https://yogakulam.com/',10) returning id",[ORG_A,USER_A]);
    const bJob=await db.query(
      "insert into public.knowledge_discovery_jobs(organization_id,created_by,seed_url,max_pages)"+
      " values($1,$2,'https://example.org/',10) returning id",[ORG_B,USER_B]);
    const idA=aJob.rows[0].id,idB=bJob.rows[0].id;
    await db.query(
      "insert into public.knowledge_discovery_pages(organization_id,job_id,url)"+
      " values($1,$2,'https://yogakulam.com/'),($3,$4,'https://example.org/')",
      [ORG_A,idA,ORG_B,idB]);
    await db.query('begin');
    await db.query('savepoint duplicate_job');
    await assert.rejects(db.query(
      "insert into public.knowledge_discovery_jobs(organization_id,created_by,seed_url)"+
      " values($1,$2,'https://yogakulam.com/again')",[ORG_A,USER_A]),e=>e.code==='23505');
    await db.query('rollback to savepoint duplicate_job');
    await db.query('savepoint cross_tenant_page');
    await assert.rejects(db.query(
      "insert into public.knowledge_discovery_pages(organization_id,job_id,url)"+
      " values($1,$2,'https://yogakulam.com/cross')",[ORG_B,idA]),e=>e.code==='23503');
    await db.query('rollback to savepoint cross_tenant_page');
    await db.query('commit');

    await context(db,'authenticated',USER_A);
    assert.deepEqual((await db.query('select organization_id from public.knowledge_discovery_jobs')).rows.map(x=>x.organization_id),[ORG_A]);
    assert.deepEqual((await db.query('select organization_id from public.knowledge_discovery_pages')).rows.map(x=>x.organization_id),[ORG_A]);
    await db.query('savepoint prohibited_write');
    await assert.rejects(db.query(
      "insert into public.knowledge_discovery_jobs(organization_id,created_by,seed_url)"+
      " values($1,$2,'https://example.com/')",[ORG_A,USER_A]),e=>e.code==='42501');
    await db.query('rollback to savepoint prohibited_write');
    await db.query('rollback');

    await context(db,'authenticated',USER_B);
    assert.deepEqual((await db.query('select organization_id from public.knowledge_discovery_jobs')).rows.map(x=>x.organization_id),[ORG_B]);
    await db.query('rollback');
    await context(db,'authenticated',STRANGER);
    assert.equal((await db.query('select count(*)::int as n from public.knowledge_discovery_jobs')).rows[0].n,0);
    await db.query('rollback');

    const a=new Client({connectionString:target.toString()});
    const b=new Client({connectionString:target.toString()});
    sessions.push(a,b);await Promise.all([a.connect(),b.connect()]);
    await Promise.all([context(a,'service_role',USER_A),context(b,'service_role',USER_B)]);
    const [first,second]=await Promise.all([
      a.query('select * from public.claim_knowledge_discovery_job_v1()'),
      b.query('select * from public.claim_knowledge_discovery_job_v1()'),
    ]);
    assert.equal(first.rowCount,1);
    assert.equal(second.rowCount,1);
    assert.notEqual(first.rows[0].job_id,second.rows[0].job_id,'skip locked prevents duplicate claim');
    await Promise.all([a.query('commit'),b.query('commit')]);
    await context(a,'service_role',USER_A);
    assert.equal((await a.query('select count(*)::int as n from public.claim_knowledge_discovery_job_v1()')).rows[0].n,0);
    await a.query('commit');

    const firstId=first.rows[0].job_id,firstToken=first.rows[0].lease_token;
    await db.query("update public.knowledge_discovery_jobs set lease_until=now()-interval '1 second' where id=$1",[firstId]);
    await context(a,'service_role',USER_A);
    const renewed=await a.query('select * from public.claim_knowledge_discovery_job_v1()');
    assert.equal(renewed.rows[0].job_id,firstId);
    assert.notEqual(renewed.rows[0].lease_token,firstToken);
    await a.query('commit');
    const stale=await db.query(
      "update public.knowledge_discovery_jobs set status='completed'"+
      " where id=$1 and status='running' and lease_token=$2 returning id",[firstId,firstToken]);
    assert.equal(stale.rowCount,0);
    assert.equal((await db.query('select attempts from public.knowledge_discovery_jobs where id=$1',[firstId])).rows[0].attempts,1);

    const otherId=firstId===idA?idB:idA;
    const otherToken=second.rows[0].lease_token;
    await db.query("update public.knowledge_discovery_jobs set status='cancelled',lease_token=null,lease_until=null where id=$1",[otherId]);
    const late=await db.query(
      "update public.knowledge_discovery_jobs set status='completed'"+
      " where id=$1 and status='running' and lease_token=$2 returning id",[otherId,otherToken]);
    assert.equal(late.rowCount,0);
    await db.query(
      "update public.knowledge_discovery_jobs set attempts=5,lease_until=now()-interval '1 minute',status='running' where id=$1",[firstId]);
    await context(a,'service_role',USER_A);
    assert.equal((await a.query('select count(*)::int as n from public.claim_knowledge_discovery_job_v1()')).rows[0].n,0);
    await a.query('commit');
    assert.equal((await db.query('select status from public.knowledge_discovery_jobs where id=$1',[firstId])).rows[0].status,'failed');
  } finally {
    await Promise.allSettled(sessions.map(s=>s.end()));
    try{if(created)await admin.query('drop database '+dbName+' with (force)');}
    finally{await admin.end();}
  }
});
