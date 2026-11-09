import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import pg from 'pg';

const {Client}=pg;
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const A='10000000-0000-4000-8000-000000000001';
const B='10000000-0000-4000-8000-000000000002';
const AUTHOR='20000000-0000-4000-8000-000000000001';
const REVIEWER='20000000-0000-4000-8000-000000000002';
const OUTSIDER='20000000-0000-4000-8000-000000000003';
const MEMBER='20000000-0000-4000-8000-000000000004';
const SID_AUTHOR='30000000-0000-4000-8000-000000000001';
const SID_REVIEWER='30000000-0000-4000-8000-000000000002';
const SID_OUTSIDER='30000000-0000-4000-8000-000000000003';
const SID_MEMBER='30000000-0000-4000-8000-000000000004';
const DRAFT='select ai03a_rehearsal.create_prompt_draft_v1($1,$2,$3) as receipt';
const SUBMIT='select ai03a_rehearsal.submit_prompt_review_v1($1,$2) as receipt';
const DECIDE='select ai03a_rehearsal.decide_prompt_review_v1($1,$2,$3) as receipt';
const BODY='Synthetic prompt draft for local review only. Never instruct a provider to send messages or make payments.';

function localhostAdminUrl(){
  assert.equal(process.env.SALSYS_ALLOW_LOCAL_DB_TESTS,'1','AI-03A local guard not enabled');
  const url=new URL(process.env.SALSYS_TEST_DATABASE_URL||'');
  assert.equal(url.protocol,'postgres:');
  assert.ok(['localhost','127.0.0.1'].includes(url.hostname),'Hosted SQL prohibited');
  assert.equal(url.username,'postgres');
  assert.equal(url.pathname,'/postgres');
  assert.equal(url.search,'');
  return url;
}

async function callAs(db,role,actor,sid,query,args=[]){
  await db.query('begin');
  try{
    await db.query("set local statement_timeout = '8s'");
    await db.query("set local lock_timeout = '6s'");
    await db.query('set local role '+role);
    await db.query("select set_config('request.jwt.claims',$1,true)",[
      JSON.stringify({role,sub:actor,session_id:sid}),
    ]);
    const result=await db.query(query,args);
    await db.query('commit');
    return result;
  }catch(error){
    await db.query('rollback');
    throw error;
  }
}

async function blocked(promise,label){
  await assert.rejects(promise,e=>(
    (e.code==='42501'||e.code==='22023'||e.code==='23505') &&
    typeof e.message==='string'
  ),label);
}

test('AI-03A locally locked review ledger: two-person decisions, tenant isolation, version immutability and no runtime',async()=>{
  const base=localhostAdminUrl();
  const dbName='salsys_ai03a_'+randomUUID().replaceAll('-','').slice(0,18);
  const target=new URL(base);target.pathname='/'+dbName;
  const admin=new Client({connectionString:base.toString()});
  const clients=[];
  let made=false;
  await admin.connect();
  const open=async()=>{const c=new Client({connectionString:target.toString()});await c.connect();clients.push(c);return c;};
  try{
    await admin.query('create database "'+dbName+'"');made=true;
    const root=await open();
    const sql=read('../../docs/sql/AI-03A-prompt-approval-ledger-REHEARSAL-DRAFT.sql');
    assert.match(sql,/AI03A_LOCAL_DISPOSABLE_FIXTURE_REQUIRED/);
    assert.match(sql,/^-- NOT A MIGRATION/m);
    assert.doesNotMatch(sql,/create\s+or\s+replace\s+function\s+public\.|grant\s+all\s+on\s+/i);

    await root.query(read('./knowledge-discovery.foundation.sql'));
    await root.query([
      "alter table public.organizations add column status text not null default 'active'",
      "create table public.test_ai03a_fixture (id boolean primary key default true)",
      "create table public.organization_members (organization_id uuid not null,user_id uuid not null,role text not null,active boolean not null)",
      "create table public.tenant_session_bindings(session_id uuid primary key,user_id uuid not null,organization_id uuid not null)",
      "create table auth.sessions(id uuid primary key,user_id uuid not null)",
    ].join(';\n')+';');

    // A test that looks like production must be explicitly denied.
    await blocked(root.query(sql),'Guard refuses synthetic-free DB install');
    await root.query('insert into public.test_ai03a_fixture(id) values(true)');
    await root.query(sql);

    const roleCheck=await root.query(`select
      has_function_privilege('authenticated','ai03a_rehearsal.create_prompt_draft_v1(uuid,text,text)','execute') as authed,
      has_function_privilege('anon','ai03a_rehearsal.create_prompt_draft_v1(uuid,text,text)','execute') as anon,
      has_function_privilege('service_role','ai03a_rehearsal.create_prompt_draft_v1(uuid,text,text)','execute') as service,
      has_table_privilege('authenticated','ai03a_rehearsal.prompt_versions','insert') as table_write,
      has_table_privilege('authenticated','ai03a_rehearsal.prompt_audit','select') as audit_read`);
    assert.deepEqual(roleCheck.rows[0],{
      authed:true,anon:false,service:false,table_write:false,audit_read:false,
    });
    const internal=await root.query("select has_function_privilege('authenticated','ai03a_rehearsal.current_reviewer_v1(uuid)','execute') as allowed");
    assert.equal(internal.rows[0].allowed,false);

    await root.query("insert into public.organizations(id,name) values($1,'Synthetic tenant A'),($2,'Synthetic tenant B')",[A,B]);
    await root.query("insert into public.organization_members(organization_id,user_id,role,active) values($1,$2,'admin',true),($1,$3,'owner',true),($2,$4,'owner',true),($1,$5,'member',true)",[A,AUTHOR,REVIEWER,OUTSIDER,MEMBER]);
    await root.query("insert into public.tenant_session_bindings(session_id,user_id,organization_id) values($1,$2,$3),($4,$5,$3),($6,$7,$8),($9,$10,$3)",[SID_AUTHOR,AUTHOR,A,SID_REVIEWER,REVIEWER,SID_OUTSIDER,OUTSIDER,B,SID_MEMBER,MEMBER]);
    await root.query("insert into auth.sessions(id,user_id) values($1,$2),($3,$4),($5,$6),($7,$8)",[SID_AUTHOR,AUTHOR,SID_REVIEWER,REVIEWER,SID_OUTSIDER,OUTSIDER,SID_MEMBER,MEMBER]);

    const creator=await open();const reviewer=await open();
    const outsider=await open();const member=await open();
    const draft=(await callAs(creator,'authenticated',AUTHOR,SID_AUTHOR,DRAFT,[A,'admissions_reply',BODY])).rows[0].receipt;
    assert.equal(draft.version,1);
    assert.equal(draft.status,'draft');
    assert.equal(draft.may_execute,false);
    assert.equal(draft.sha256,createHash('sha256').update(BODY).digest('hex'));
    assert.ok(/^[0-9a-f-]{36}$/i.test(draft.id));

    await blocked(callAs(outsider,'authenticated',OUTSIDER,SID_OUTSIDER,SUBMIT,[A,draft.id]),'Other tenant denied');
    await blocked(callAs(member,'authenticated',MEMBER,SID_MEMBER,SUBMIT,[A,draft.id]),'Member role denied');
    await blocked(callAs(reviewer,'authenticated',REVIEWER,SID_REVIEWER,SUBMIT,[A,draft.id]),'Non-author cannot submit');
    await blocked(callAs(creator,'authenticated',AUTHOR,SID_AUTHOR,DECIDE,[A,draft.id,'review']),'Cannot review draft before submit');
    const submitted=(await callAs(creator,'authenticated',AUTHOR,SID_AUTHOR,SUBMIT,[A,draft.id])).rows[0].receipt;
    assert.equal(submitted.status,'pending_review');
    assert.equal(submitted.may_execute,false);
    await blocked(callAs(creator,'authenticated',AUTHOR,SID_AUTHOR,DECIDE,[A,draft.id,'review']),'Author cannot self-approve');
    await blocked(callAs(reviewer,'authenticated',REVIEWER,SID_REVIEWER,DECIDE,[B,draft.id,'review']),'Cross-org ID denies');
    await blocked(callAs(reviewer,'authenticated',REVIEWER,SID_REVIEWER,DECIDE,[A,draft.id,'activate']),'No activation decision');

    const reviewed=(await callAs(reviewer,'authenticated',REVIEWER,SID_REVIEWER,DECIDE,[A,draft.id,'review'])).rows[0].receipt;
    assert.equal(reviewed.status,'reviewed');
    assert.equal(reviewed.may_execute,false);
    await blocked(callAs(reviewer,'authenticated',REVIEWER,SID_REVIEWER,DECIDE,[A,draft.id,'review']),'Cannot repeat review');

    const ledger=await root.query('select action,actor_id,body_sha256 from ai03a_rehearsal.prompt_audit where prompt_id=$1 order by id',[draft.id]);
    assert.deepEqual(ledger.rows.map(x=>x.action),['created','submitted','reviewed']);
    assert.deepEqual(ledger.rows.map(x=>x.actor_id),[AUTHOR,AUTHOR,REVIEWER]);
    assert.ok(ledger.rows.every(x=>x.body_sha256===draft.sha256));
    const row=(await root.query('select body,sha256,status,reviewer_id from ai03a_rehearsal.prompt_versions where id=$1',[draft.id])).rows[0];
    assert.deepEqual(row,{body:BODY,sha256:draft.sha256,status:'reviewed',reviewer_id:REVIEWER});

    await blocked(root.query('update ai03a_rehearsal.prompt_versions set body=$1 where id=$2',['Tampered body',draft.id]),'Even privileged SQL cannot silently change version bytes');
    await blocked(root.query('delete from ai03a_rehearsal.prompt_versions where id=$1',[draft.id]),'Delete blocked');
    await blocked(root.query('update ai03a_rehearsal.prompt_audit set action=$1 where prompt_id=$2',['rejected',draft.id]),'Audit mutation blocked');
    await blocked(root.query('delete from ai03a_rehearsal.prompt_audit where prompt_id=$1',[draft.id]),'Audit delete blocked');
    await blocked(root.query('truncate ai03a_rehearsal.prompt_audit'),'Audit truncate blocked');

    const newDraft=(await callAs(creator,'authenticated',AUTHOR,SID_AUTHOR,DRAFT,[A,'admissions_reply',BODY+' Version 2.'])).rows[0].receipt;
    assert.equal(newDraft.version,2);
    assert.equal(newDraft.may_execute,false);
    await callAs(creator,'authenticated',AUTHOR,SID_AUTHOR,SUBMIT,[A,newDraft.id]);
    const rejected=(await callAs(reviewer,'authenticated',REVIEWER,SID_REVIEWER,DECIDE,[A,newDraft.id,'reject'])).rows[0].receipt;
    assert.equal(rejected.status,'rejected');
    assert.equal(rejected.may_execute,false);

    await blocked(callAs(creator,'authenticated',AUTHOR,'44444444-4444-4444-8444-444444444444',DRAFT,[A,'staff_insight',BODY]),'Revoked or unbound session denied');
    await blocked(callAs(creator,'anon',AUTHOR,SID_AUTHOR,DRAFT,[A,'staff_insight',BODY]),'Anonymous role cannot execute');
    await blocked(callAs(creator,'service_role',AUTHOR,SID_AUTHOR,DRAFT,[A,'staff_insight',BODY]),'service_role cannot execute');
    await blocked(callAs(creator,'authenticated',AUTHOR,SID_AUTHOR,"select count(*) from ai03a_rehearsal.prompt_versions"),'Direct table read blocked');

    const instance=await root.query("select count(*)::integer as n from ai03a_rehearsal.prompt_versions");
    assert.equal(instance.rows[0].n,2);
    assert.equal((await root.query("select count(*)::integer as n from ai03a_rehearsal.prompt_audit")).rows[0].n,6);
  }finally{
    for(const c of clients.reverse()) await c.end().catch(()=>{});
    if(made)await admin.query('drop database "'+dbName+'" with (force)').catch(()=>{});
    await admin.end().catch(()=>{});
  }
});
