import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const { Client } = pg;
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const ORG_A='10000000-0000-4000-8000-000000000001';
const ORG_B='10000000-0000-4000-8000-000000000002';
const ADMIN_A='20000000-0000-4000-8000-000000000001';
const ADMIN_B='20000000-0000-4000-8000-000000000002';
const MEMBER='20000000-0000-4000-8000-000000000003';
const SESSION_A='30000000-0000-4000-8000-000000000001';
const SESSION_B='30000000-0000-4000-8000-000000000002';
const SESSION_M='30000000-0000-4000-8000-000000000003';
const LEAD_A='40000000-0000-4000-8000-000000000001';
const LEAD_B='40000000-0000-4000-8000-000000000002';
const INVOKE='select ai09j_rehearsal.record_once_fixture_v1($1,$2,$3,$4,$5) as receipt';
const req=(id=randomUUID(),organizationId=ORG_A,toolId='crm.lead.read',resourceId=LEAD_A,rowCount=1)=>
  [id,organizationId,toolId,resourceId,rowCount];

function localRoot(){
  assert.equal(process.env.SALSYS_ALLOW_LOCAL_DB_TESTS,'1','Local-only guard required');
  const base=new URL(process.env.SALSYS_TEST_DATABASE_URL||'');
  assert.equal(base.protocol,'postgres:');
  assert.ok(['127.0.0.1','localhost'].includes(base.hostname),'Hosted DB forbidden');
  assert.equal(base.username,'postgres');
  assert.equal(base.pathname,'/postgres');
  assert.equal(base.search,'');
  return base;
}
async function beginAs(client,role,user,session){
  await client.query('begin');
  await client.query("set local statement_timeout='12s'");
  await client.query("set local lock_timeout='10s'");
  await client.query('set local role '+role);
  await client.query("select set_config('request.jwt.claims',$1,true)",[
    JSON.stringify({role,sub:user,session_id:session}),
  ]);
}
async function invoke(client,scope){
  const data=await client.query(INVOKE,scope);
  return data.rows[0].receipt;
}
async function once(client,role,user,session,scope){
  await beginAs(client,role,user,session);
  try{
    const result=await invoke(client,scope);
    await client.query('commit');
    return result;
  }catch(e){
    await client.query('rollback');
    throw e;
  }
}
async function denied(p,label){
  await assert.rejects(p,e=>{
    assert.equal(e.code,'42501',label+' got '+e.code+': '+e.message);
    return true;
  },label);
}
async function count(root,id){
  const r=await root.query(
    'select count(*)::integer as n from ai09j_rehearsal.read_request_audit where request_id=$1',[id],
  );
  return r.rows[0].n;
}

test('AI-09J: disposable PostgreSQL independently verifies global audit dedup, collision rejection, COMMIT/ROLLBACK races',async()=>{
  const base=localRoot();
  const database='salsys_ai09j_'+randomUUID().replaceAll('-','').slice(0,18);
  const target=new URL(base);target.pathname='/'+database;
  const admin=new Client({connectionString:base.toString()});
  let created=false;
  const clients=[];
  await admin.connect();
  const open=async()=>{
    const client=new Client({connectionString:target.toString()});
    await client.connect();clients.push(client);return client;
  };
  try{
    await admin.query('create database "'+database+'"');
    created=true;
    const root=await open();
    await root.query(read('./knowledge-discovery.foundation.sql'));
    // Synthetic local cluster fixture, not a change to any hosted role.
    await root.query('alter role service_role bypassrls');
    await root.query("alter table public.organizations add column status text not null default 'active'");
    await root.query('create table public.test_ai09j_fixture(id boolean primary key default true)');
    await root.query('create table public.organization_members(organization_id uuid,user_id uuid,role text,active boolean)');
    await root.query('create table public.tenant_session_bindings(session_id uuid primary key,user_id uuid,organization_id uuid)');
    await root.query('create table auth.sessions(id uuid primary key,user_id uuid)');

    const sql=read('../../docs/sql/AI-09J-idempotent-audit-replay-REHEARSAL-DRAFT.sql');
    assert.match(sql,/AI09J_LOCAL_DISPOSABLE_FIXTURE_REQUIRED/);
    assert.match(sql,/^-- NOT A MIGRATION/m);
    assert.doesNotMatch(sql,/^create\s+(?:or\s+replace\s+)?function\s+public\./mi);
    await denied(root.query(sql),'fixture marker mandatory');
    await root.query('insert into public.test_ai09j_fixture values(true)');
    await root.query(sql);

    const perms=(await root.query("select has_function_privilege('authenticated','ai09j_rehearsal.record_once_fixture_v1(uuid,uuid,text,uuid,integer)','execute') as authed,has_function_privilege('anon','ai09j_rehearsal.record_once_fixture_v1(uuid,uuid,text,uuid,integer)','execute') as anonymous,has_function_privilege('service_role','ai09j_rehearsal.record_once_fixture_v1(uuid,uuid,text,uuid,integer)','execute') as service,has_table_privilege('authenticated','ai09j_rehearsal.read_request_audit','select') as direct_select,has_table_privilege('authenticated','ai09j_rehearsal.read_request_audit','insert') as direct_insert")).rows[0];
    assert.deepEqual(perms,{
      authed:true,anonymous:false,service:false,direct_select:false,direct_insert:false,
    });

    await root.query("insert into public.organizations(id,name) values($1,'Synthetic A'),($2,'Synthetic B')",[ORG_A,ORG_B]);
    await root.query("insert into public.organization_members values($1,$2,'admin',true),($3,$4,'owner',true),($1,$5,'member',true)",[
      ORG_A,ADMIN_A,ORG_B,ADMIN_B,MEMBER,
    ]);
    await root.query('insert into public.tenant_session_bindings values($1,$2,$3),($4,$5,$6),($7,$8,$3)',[
      SESSION_A,ADMIN_A,ORG_A,SESSION_B,ADMIN_B,ORG_B,SESSION_M,MEMBER,
    ]);
    await root.query('insert into auth.sessions values($1,$2),($3,$4),($5,$6)',[
      SESSION_A,ADMIN_A,SESSION_B,ADMIN_B,SESSION_M,MEMBER,
    ]);

    const actorA=await open(),retryA=await open(),actorB=await open(),member=await open();
    const firstId=randomUUID();
    const first=await once(actorA,'authenticated',ADMIN_A,SESSION_A,req(firstId));
    assert.equal(first.local_fixture_only,true);
    assert.equal(first.may_execute,false);
    assert.equal(first.replay_state,'inserted_pending_commit');
    assert.deepEqual(first.records,[]);
    // Fresh independent connection verifies COMMITTED row, not a mock receipt.
    assert.equal(await count(root,firstId),1);

    const repeat=await once(retryA,'authenticated',ADMIN_A,SESSION_A,req(firstId));
    assert.equal(repeat.replay_state,'already_present_no_result');
    assert.deepEqual(repeat.records,[]);
    assert.equal(await count(root,firstId),1);

    for(const scope of [
      req(firstId,ORG_A,'crm.lead.read',LEAD_B,1),
      req(firstId,ORG_A,'crm.lead.read',LEAD_A,0),
      req(firstId,ORG_A,'crm.course.list',null,1),
    ]){
      await denied(once(retryA,'authenticated',ADMIN_A,SESSION_A,scope),'same request ID with changed read scope');
    }
    await denied(once(actorB,'authenticated',ADMIN_B,SESSION_B,
      req(firstId,ORG_B,'crm.lead.read',LEAD_B,1)),
      'globally unique request ID cannot cross tenant boundary');
    assert.equal(await count(root,firstId),1);

    await denied(once(actorB,'authenticated',ADMIN_B,SESSION_B,
      req(randomUUID(),ORG_A,'crm.lead.read',LEAD_A,1)),
      'B cannot write A audit with forged org scope');
    await denied(once(member,'authenticated',MEMBER,SESSION_M,
      req(randomUUID())),
      'member is not owner/admin');
    await denied(once(actorA,'anon',ADMIN_A,SESSION_A,req(randomUUID())),
      'anonymous not permitted');
    await denied(once(actorA,'service_role',ADMIN_A,SESSION_A,req(randomUUID())),
      'service role bypass rejected');
    for(const scope of [
      req(randomUUID(),ORG_A,'knowledge.approved.search',null,0),
      req(randomUUID(),ORG_A,'crm.lead.update',LEAD_A,1),
      req(randomUUID(),ORG_A,'crm.lead.read',null,1),
      req(randomUUID(),ORG_A,'crm.lead.read',LEAD_A,2),
      req(randomUUID(),ORG_A,'crm.course.list',LEAD_A,1),
    ])await denied(once(actorA,'authenticated',ADMIN_A,SESSION_A,scope),
      'unknown tool or malformed read scope denied');
  }finally{
    for(const client of clients.reverse())await client.end().catch(()=>{});
    if(created)await admin.query('drop database "'+database+'" with (force)').catch(()=>{});
    await admin.end().catch(()=>{});
  }
});
