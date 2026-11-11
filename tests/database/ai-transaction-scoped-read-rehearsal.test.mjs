import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const {Client}=pg;
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const A='10000000-0000-4000-8000-000000000001';
const B='10000000-0000-4000-8000-000000000002';
const USER_A='20000000-0000-4000-8000-000000000001';
const USER_B='20000000-0000-4000-8000-000000000002';
const MEMBER='20000000-0000-4000-8000-000000000003';
const SID_A='30000000-0000-4000-8000-000000000001';
const SID_B='30000000-0000-4000-8000-000000000002';
const SID_M='30000000-0000-4000-8000-000000000003';
const COURSE_A='40000000-0000-4000-8000-000000000001';
const COURSE_B='40000000-0000-4000-8000-000000000002';
const HIDDEN='40000000-0000-4000-8000-000000000003';
const LEAD_A='50000000-0000-4000-8000-000000000001';
const LEAD_B='50000000-0000-4000-8000-000000000002';
const DOC_A='60000000-0000-4000-8000-000000000001';
const DOC_B='60000000-0000-4000-8000-000000000002';
const UNVERIFIED='60000000-0000-4000-8000-000000000003';
const WITHDRAWN='60000000-0000-4000-8000-000000000004';
const SQL='select ai09d_rehearsal.read_fixture_v1($1,$2,$3,$4) as result';

function safeDbUrl(){
  assert.equal(process.env.SALSYS_ALLOW_LOCAL_DB_TESTS,'1');
  const url=new URL(process.env.SALSYS_TEST_DATABASE_URL||'');
  assert.equal(url.protocol,'postgres:');
  assert.ok(['localhost','127.0.0.1'].includes(url.hostname),'Hosted database prohibited');
  assert.equal(url.username,'postgres');
  assert.equal(url.pathname,'/postgres');
  assert.equal(url.search,'');
  return url;
}
async function callAs(db,role,user,sid,sql,args=[]){
  await db.query('begin');
  try{
    await db.query("set local statement_timeout='8s'");
    await db.query("set local lock_timeout='6s'");
    await db.query('set local role '+role);
    await db.query("select set_config('request.jwt.claims',$1,true)",[
      JSON.stringify({role,sub:user,session_id:sid}),
    ]);
    const r=await db.query(sql,args);
    await db.query('commit');
    return r;
  }catch(e){
    await db.query('rollback');
    throw e;
  }
}
async function blocked(p,label){
  await assert.rejects(p,e=>{
    assert.ok(['42501','22023','P0001'].includes(e.code),
      label+': unexpected SQL '+e.code+' '+e.message);
    return true;
  },label);
}
const readAs=(db,role,user,sid,org,tool,resource=null,query=null)=>
  callAs(db,role,user,sid,SQL,[org,tool,resource,query])
    .then(result=>result.rows[0].result);

test('AI-09D disposable SQL: tenant-session read, minimal projection, audit and revocation',async()=>{
  const base=safeDbUrl();
  const dbName='salsys_ai09d_'+randomUUID().replaceAll('-','').slice(0,18);
  const target=new URL(base);target.pathname='/'+dbName;
  const admin=new Client({connectionString:base.toString()});
  const clients=[];
  let created=false;
  await admin.connect();
  const open=async()=>{
    const c=new Client({connectionString:target.toString()});
    await c.connect();clients.push(c);return c;
  };
  try{
    await admin.query('create database "'+dbName+'"');
    created=true;
    const root=await open();
    await root.query(read('./knowledge-discovery.foundation.sql'));
    // Match shared disposable-cluster fixture role flags, not a hosted role.
    await root.query('alter role service_role bypassrls');
    await root.query("alter table public.organizations add column status text not null default 'active'");
    await root.query('create table public.test_ai09d_fixture(id boolean primary key default true)');
    await root.query('create table public.organization_members(organization_id uuid,user_id uuid,role text,active boolean)');
    await root.query('create table public.tenant_session_bindings(session_id uuid primary key,user_id uuid,organization_id uuid)');
    await root.query('create table auth.sessions(id uuid primary key,user_id uuid)');

    const sql=read('../../docs/sql/AI-09D-transaction-scoped-read-REHEARSAL-DRAFT.sql');
    assert.match(sql,/AI09D_LOCAL_DISPOSABLE_FIXTURE_REQUIRED/);
    assert.match(sql,/^-- NOT A MIGRATION/m);
    assert.doesNotMatch(sql,/create\s+(or\s+replace\s+)?function\s+public\./i);
    await blocked(root.query(sql),'fixture marker guard');
    await root.query('insert into public.test_ai09d_fixture values(true)');
    await root.query(sql);

    const grants=await root.query("select has_function_privilege('authenticated','ai09d_rehearsal.read_fixture_v1(uuid,text,uuid,text)','execute') as authed,has_function_privilege('anon','ai09d_rehearsal.read_fixture_v1(uuid,text,uuid,text)','execute') as anon,has_function_privilege('service_role','ai09d_rehearsal.read_fixture_v1(uuid,text,uuid,text)','execute') as service,has_table_privilege('authenticated','ai09d_rehearsal.leads','select') as leads,has_table_privilege('authenticated','ai09d_rehearsal.read_audit','insert') as audit");
    assert.deepEqual(grants.rows[0],{authed:true,anon:false,service:false,leads:false,audit:false});

    await root.query("insert into public.organizations(id,name) values($1,'A'),($2,'B')",[A,B]);
    await root.query("insert into public.organization_members values($1,$2,'admin',true),($3,$4,'owner',true),($1,$5,'member',true)",[A,USER_A,B,USER_B,MEMBER]);
    await root.query('insert into public.tenant_session_bindings values($1,$2,$3),($4,$5,$6),($7,$8,$3)',[SID_A,USER_A,A,SID_B,USER_B,B,SID_M,MEMBER]);
    await root.query('insert into auth.sessions values($1,$2),($3,$4),($5,$6)',[SID_A,USER_A,SID_B,USER_B,SID_M,MEMBER]);
    await root.query("insert into ai09d_rehearsal.courses values($1,$2,'200-Hour Course','residential','2026-12-07',true,'secret A'),($3,$4,'Other Tenant','online',null,true,'secret B'),($5,$2,'Hidden Course','online',null,false,'hidden')",[COURSE_A,A,COURSE_B,B,HIDDEN]);
    await root.query("insert into ai09d_rehearsal.leads values($1,$2,'qualified','2026-11-09T04:12:00Z','+12025550101','private@tenant.test','sensitive'),($3,$4,'new',null,'+999','other@tenant.test','other')",[LEAD_A,A,LEAD_B,B]);
    await root.query("insert into ai09d_rehearsal.knowledge values($1,$2,'approved','active',true,'Synthetic verified FAQ about course location.','private instruction'),($3,$4,'approved','active',true,'Synthetic other tenant FAQ.','hidden'),($5,$2,'approved','active',false,'Synthetic unverified FAQ.','hidden'),($6,$2,'approved','withdrawn',true,'Synthetic withdrawn FAQ.','hidden')",[DOC_A,A,DOC_B,B,UNVERIFIED,WITHDRAWN]);

    const a=await open(),b=await open(),member=await open();
    const courses=await readAs(a,'authenticated',USER_A,SID_A,A,'crm.course.list');
    assert.equal(courses.may_execute,false);
    assert.equal(courses.local_fixture_only,true);
    assert.deepEqual(courses.records,[{organizationId:A,courseId:COURSE_A,title:'200-Hour Course',mode:'residential',startsOn:'2026-12-07'}]);
    assert.doesNotMatch(JSON.stringify(courses),/secret A|Hidden Course/);

    const lead=await readAs(a,'authenticated',USER_A,SID_A,A,'crm.lead.read',LEAD_A);
    assert.deepEqual(lead.records,[{organizationId:A,leadId:LEAD_A,stage:'qualified',lastActivityAt:'2026-11-09T04:12:00.000Z'}]);
    assert.doesNotMatch(JSON.stringify(lead),/private@|12025550101|sensitive/);

    const knowledge=await readAs(a,'authenticated',USER_A,SID_A,A,'knowledge.approved.search',null,'Synthetic');
    assert.deepEqual(knowledge.records,[{organizationId:A,documentId:DOC_A,approvalStatus:'approved',sourceStatus:'active',sourceTextVerified:true,evidenceText:'Synthetic verified FAQ about course location.'}]);
    assert.equal(knowledge.classification,'untrusted_data_not_instructions');
    assert.doesNotMatch(JSON.stringify(knowledge),/private instruction|unverified|withdrawn/);

    const other=await readAs(b,'authenticated',USER_B,SID_B,B,'crm.course.list');
    assert.equal(other.records.length,1);
    assert.equal(other.records[0].organizationId,B);
    await blocked(readAs(b,'authenticated',USER_B,SID_B,A,'crm.course.list'),'cross tenant');
    await blocked(readAs(a,'authenticated',USER_A,SID_A,A,'crm.lead.read',LEAD_B),'cross tenant lead ID');
    await blocked(readAs(member,'authenticated',MEMBER,SID_M,A,'crm.course.list'),'member denied');
    await blocked(readAs(a,'anon',USER_A,SID_A,A,'crm.course.list'),'anon denied');
    await blocked(readAs(a,'service_role',USER_A,SID_A,A,'crm.course.list'),'service denied');
    await blocked(callAs(a,'authenticated',USER_A,SID_A,'select * from ai09d_rehearsal.leads'),'direct lead select');
    await blocked(callAs(a,'authenticated',USER_A,SID_A,'select * from ai09d_rehearsal.read_audit'),'audit access');
    await blocked(readAs(a,'authenticated',USER_A,SID_A,A,'crm.lead.update'),'arbitrary tool');
    await blocked(readAs(a,'authenticated',USER_A,SID_A,A,'knowledge.approved.search',null,'Syn%'),'wildcard query');
    await blocked(readAs(a,'authenticated',USER_A,SID_A,A,'crm.course.list',LEAD_A),'unexpected scope');

    const audits=(await root.query('select * from ai09d_rehearsal.read_audit order by id')).rows;
    assert.deepEqual(audits.map(x=>x.tool_id),['crm.course.list','crm.lead.read','knowledge.approved.search','crm.course.list']);
    assert.equal(audits[0].actor_id,USER_A);
    assert.equal(audits[3].actor_id,USER_B);
    assert.doesNotMatch(JSON.stringify(audits),/private@|12025550101|verified FAQ/);
    await blocked(root.query('delete from ai09d_rehearsal.read_audit where id=$1',[audits[0].id]),'audit append only');
    await blocked(root.query('truncate ai09d_rehearsal.read_audit'),'audit truncate denied');

    await root.query("create function ai09d_rehearsal.deny_fixture_audit() returns trigger language plpgsql as $fail$ begin raise exception 'forced audit refusal' using errcode='42501'; end; $fail$");
    await root.query('create trigger ai09d_fail_insert before insert on ai09d_rehearsal.read_audit for each row execute function ai09d_rehearsal.deny_fixture_audit()');
    await blocked(readAs(a,'authenticated',USER_A,SID_A,A,'crm.course.list'),'audit failure must abort');
    await root.query('drop trigger ai09d_fail_insert on ai09d_rehearsal.read_audit');
    assert.equal((await root.query('select count(*)::integer as n from ai09d_rehearsal.read_audit')).rows[0].n,4);

    await root.query('update ai09d_rehearsal.knowledge set source_text_verified=false where id=$1',[DOC_A]);
    const withdrawn=await readAs(a,'authenticated',USER_A,SID_A,A,'knowledge.approved.search',null,'Synthetic');
    assert.deepEqual(withdrawn.records,[]);

    await root.query('delete from auth.sessions where id=$1',[SID_A]);
    await blocked(readAs(a,'authenticated',USER_A,SID_A,A,'crm.course.list'),'revoked session');
    assert.equal((await root.query('select count(*)::integer as n from ai09d_rehearsal.read_audit')).rows[0].n,5);
  }finally{
    for(const c of clients.reverse())await c.end().catch(()=>{});
    if(created)await admin.query('drop database "'+dbName+'" with (force)').catch(()=>{});
    await admin.end().catch(()=>{});
  }
});
