import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import pg from 'pg';

const {Client}=pg;
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const A='10000000-0000-4000-8000-000000000001';
const B='10000000-0000-4000-8000-000000000002';
const ADMIN_A='20000000-0000-4000-8000-000000000001';
const ADMIN_B='20000000-0000-4000-8000-000000000002';
const MANAGER='20000000-0000-4000-8000-000000000003';
const S_A='30000000-0000-4000-8000-000000000001';
const S_B='30000000-0000-4000-8000-000000000002';
const S_M='30000000-0000-4000-8000-000000000003';
const COURSE_A='40000000-0000-4000-8000-000000000001';
const COURSE_B='40000000-0000-4000-8000-000000000002';
const COURSE_HIDDEN='40000000-0000-4000-8000-000000000003';
const COURSE_NO_BATCH='40000000-0000-4000-8000-000000000004';
const BATCH_A_EARLY='50000000-0000-4000-8000-000000000001';
const BATCH_A_LATE='50000000-0000-4000-8000-000000000002';
const BATCH_B='50000000-0000-4000-8000-000000000003';
const BATCH_INACTIVE='50000000-0000-4000-8000-000000000004';
const LEAD_A='60000000-0000-4000-8000-000000000001';
const LEAD_B='60000000-0000-4000-8000-000000000002';
const LEAD_INVALID='60000000-0000-4000-8000-000000000003';
const READ='select ai09g_rehearsal.read_real_shape_fixture_v1($1,$2,$3) as result';

function disposableDbUrl(){
  assert.equal(process.env.SALSYS_ALLOW_LOCAL_DB_TESTS,'1','Local SQL guard not enabled');
  const url=new URL(process.env.SALSYS_TEST_DATABASE_URL||'');
  assert.equal(url.protocol,'postgres:');
  assert.ok(['127.0.0.1','localhost'].includes(url.hostname),'Hosted database prohibited');
  assert.equal(url.username,'postgres');
  assert.equal(url.pathname,'/postgres');
  assert.equal(url.search,'');
  return url;
}

async function as(db,role,actor,session,sql,args=[]){
  await db.query('begin');
  try{
    await db.query("set local statement_timeout='8s'");
    await db.query("set local lock_timeout='6s'");
    await db.query('set local role '+role);
    await db.query("select set_config('request.jwt.claims',$1,true)",[
      JSON.stringify({role,sub:actor,session_id:session}),
    ]);
    const result=await db.query(sql,args);
    await db.query('commit');
    return result;
  }catch(err){
    await db.query('rollback');
    throw err;
  }
}
const invoke=(db,role,actor,session,org,tool,resource=null)=>as(
  db,role,actor,session,READ,[org,tool,resource],
).then(x=>x.rows[0].result);

async function denied(p,label){
  await assert.rejects(p,e=>{
    assert.equal(e.code,'42501',label+': '+e.message);
    return true;
  },label);
}

test('AI-09G: real-shape course and lead reads with capability, signed-session fixture, audit, and Knowledge deny',async()=>{
  const base=disposableDbUrl();
  const name='salsys_ai09g_'+randomUUID().replaceAll('-','').slice(0,18);
  const target=new URL(base);target.pathname='/'+name;
  const admin=new Client({connectionString:base.toString()});
  const clients=[];
  let made=false;
  await admin.connect();
  const open=async()=>{
    const db=new Client({connectionString:target.toString()});
    await db.connect();clients.push(db);return db;
  };
  try{
    await admin.query('create database "'+name+'"');
    made=true;
    const root=await open();
    await root.query(read('./knowledge-discovery.foundation.sql'));
    await root.query('alter role service_role bypassrls'); // only disposable CI PostgreSQL
    await root.query("alter table public.organizations add column status text not null default 'active'");
    await root.query('create table public.test_ai09g_fixture(id boolean primary key default true)');
    await root.query('create table public.organization_members(organization_id uuid,user_id uuid,role text,active boolean)');
    await root.query('create table public.tenant_session_bindings(session_id uuid primary key,user_id uuid,organization_id uuid)');
    await root.query('create table auth.sessions(id uuid primary key,user_id uuid)');
    await root.query('create table public.organization_workspaces(organization_id uuid,workspace_code text,enabled boolean)');

    const sql=read('../../docs/sql/AI-09G-real-shape-read-REHEARSAL-DRAFT.sql');
    assert.match(sql,/AI09G_LOCAL_DISPOSABLE_FIXTURE_REQUIRED/);
    assert.match(sql,/^-- NOT A MIGRATION/m);
    assert.doesNotMatch(sql,/^create\s+(or\s+replace\s+)?function\s+public\./mi);
    await denied(root.query(sql),'SQL guard rejects absent fixture marker');
    await root.query('insert into public.test_ai09g_fixture(id) values(true)');
    await root.query(sql);

    const grants=(await root.query("select has_function_privilege('authenticated','ai09g_rehearsal.read_real_shape_fixture_v1(uuid,text,uuid)','execute') as authed,has_function_privilege('anon','ai09g_rehearsal.read_real_shape_fixture_v1(uuid,text,uuid)','execute') as anonymous,has_function_privilege('service_role','ai09g_rehearsal.read_real_shape_fixture_v1(uuid,text,uuid)','execute') as service,has_table_privilege('authenticated','ai09g_rehearsal.leads','select') as leads,has_table_privilege('authenticated','ai09g_rehearsal.read_audit','insert') as audit")).rows[0];
    assert.deepEqual(grants,{authed:true,anonymous:false,service:false,leads:false,audit:false});

    await root.query("insert into public.organizations(id,name) values($1,'Synthetic A'),($2,'Synthetic B')",[A,B]);
    await root.query("insert into public.organization_members values($1,$2,'admin',true),($3,$4,'owner',true),($1,$5,'manager',true)",[A,ADMIN_A,B,ADMIN_B,MANAGER]);
    await root.query('insert into public.tenant_session_bindings values($1,$2,$3),($4,$5,$6),($7,$8,$3)',[S_A,ADMIN_A,A,S_B,ADMIN_B,B,S_M,MANAGER]);
    await root.query('insert into auth.sessions values($1,$2),($3,$4),($5,$6)',[S_A,ADMIN_A,S_B,ADMIN_B,S_M,MANAGER]);
    await root.query("insert into public.organization_workspaces values($1,'admin',true),($1,'sales',true),($2,'admin',true),($2,'sales',true)",[A,B]);
    await root.query("insert into ai09g_rehearsal.tenant_capabilities values($1,'education_core',true),($2,'education_core',true)",[A,B]);

    await root.query("insert into ai09g_rehearsal.courses values($1,$2,'200 Hour Teacher Training',true,'private course note'),($3,$4,'Other tenant course',true,'private B'),($5,$2,'Unpublished course',false,'private hidden'),($6,$2,'No Batch Course',true,'private empty')",[COURSE_A,A,COURSE_B,B,COURSE_HIDDEN,COURSE_NO_BATCH]);
    await root.query("insert into ai09g_rehearsal.course_batches values($1,$2,$3,'non_residential','2026-12-07',true,100),($4,$2,$3,'online','2026-12-15',true,200),($5,$6,$7,'online','2026-12-08',true,999),($8,$2,$3,'hybrid','2026-11-01',false,700)",[BATCH_A_EARLY,A,COURSE_A,BATCH_A_LATE,BATCH_B,B,COURSE_B,BATCH_INACTIVE]);
    await root.query("insert into ai09g_rehearsal.leads values($1,$2,'qualified',$3,'a@example.test','private A'),($4,$5,'new',$6,'b@example.test','private B'),($7,$2,'malformed_stage',$3,'c@example.test','private C')",[LEAD_A,A,ADMIN_A,LEAD_B,B,ADMIN_B,LEAD_INVALID]);

    const actorA=await open(),actorB=await open(),manager=await open();
    const courses=await invoke(actorA,'authenticated',ADMIN_A,S_A,A,'crm.course.list');
    assert.equal(courses.local_fixture_only,true);
    assert.equal(courses.may_execute,false);
    assert.deepEqual(courses.records,[{
      organizationId:A,courseId:COURSE_A,
      title:'200 Hour Teacher Training',mode:'in_person',startsOn:'2026-12-07',
    }]);
    assert.doesNotMatch(JSON.stringify(courses),/private|100|200|No Batch|Unpublished|Other tenant/);

    const lead=await invoke(actorA,'authenticated',ADMIN_A,S_A,A,'crm.lead.read',LEAD_A);
    assert.deepEqual(lead.records,[{
      organizationId:A,leadId:LEAD_A,stage:'qualified',lastActivityAt:null,
    }]);
    assert.doesNotMatch(JSON.stringify(lead),/a@example|private A/);
    assert.equal(lead.classification,'untrusted_data_not_instructions');

    const other=await invoke(actorB,'authenticated',ADMIN_B,S_B,B,'crm.course.list');
    assert.deepEqual(other.records,[{
      organizationId:B,courseId:COURSE_B,
      title:'Other tenant course',mode:'online',startsOn:'2026-12-08',
    }]);
    await denied(invoke(actorB,'authenticated',ADMIN_B,S_B,A,'crm.course.list'),'cross-tenant org denied');
    await denied(invoke(actorA,'authenticated',ADMIN_A,S_A,A,'crm.lead.read',LEAD_B),'foreign lead denied');
    await denied(invoke(actorA,'authenticated',ADMIN_A,S_A,A,'crm.lead.read',LEAD_INVALID),'invalid stage denied');
    await denied(invoke(manager,'authenticated',MANAGER,S_M,A,'crm.course.list'),'manager role not yet allowed');
    await denied(invoke(actorA,'anon',ADMIN_A,S_A,A,'crm.course.list'),'anonymous denied');
    await denied(invoke(actorA,'service_role',ADMIN_A,S_A,A,'crm.course.list'),'service bypass denied');
    await denied(invoke(actorA,'authenticated',ADMIN_A,S_A,A,'crm.lead.update'),'write tool denied');
    await denied(invoke(actorA,'authenticated',ADMIN_A,S_A,A,'knowledge.approved.search'),'Knowledge always denied');
    await denied(invoke(actorA,'authenticated',ADMIN_A,S_A,A,'crm.course.list',COURSE_A),'course resource scope denied');
    await denied(invoke(actorA,'authenticated',ADMIN_A,S_A,A,'crm.lead.read'),'lead ID mandatory');
    await denied(as(actorA,'authenticated',ADMIN_A,S_A,'select * from ai09g_rehearsal.leads'),'raw lead table denied');
    await denied(as(actorA,'authenticated',ADMIN_A,S_A,'select * from ai09g_rehearsal.read_audit'),'raw audit table denied');

    // R11 Education Core is a distinct CURRENT check; disabling it blocks
    // course reads while leaving independently authorized lead reads possible.
    await root.query("update ai09g_rehearsal.tenant_capabilities set enabled=false where organization_id=$1",[A]);
    await denied(invoke(actorA,'authenticated',ADMIN_A,S_A,A,'crm.course.list'),'capability disabled');
    await root.query("update ai09g_rehearsal.tenant_capabilities set enabled=true where organization_id=$1",[A]);
    await root.query("update public.organization_workspaces set enabled=false where organization_id=$1 and workspace_code='admin'",[A]);
    await denied(invoke(actorA,'authenticated',ADMIN_A,S_A,A,'crm.course.list'),'admin workspace disabled');
    await root.query("update public.organization_workspaces set enabled=true where organization_id=$1 and workspace_code='admin'",[A]);
    await root.query("update public.organization_workspaces set enabled=false where organization_id=$1 and workspace_code='sales'",[A]);
    await denied(invoke(actorA,'authenticated',ADMIN_A,S_A,A,'crm.lead.read',LEAD_A),'sales workspace disabled');
    await root.query("update public.organization_workspaces set enabled=true where organization_id=$1 and workspace_code='sales'",[A]);

    const audit=(await root.query('select * from ai09g_rehearsal.read_audit order by id')).rows;
    assert.deepEqual(audit.map(a=>a.tool_id),['crm.course.list','crm.lead.read','crm.course.list']);
    assert.deepEqual(audit.map(a=>a.row_count),[1,1,1]);
    assert.equal(audit[0].actor_id,ADMIN_A);
    assert.equal(audit[2].organization_id,B);
    assert.doesNotMatch(JSON.stringify(audit),/private|@example|teacher training/i);
    await denied(root.query('delete from ai09g_rehearsal.read_audit where id=$1',[audit[0].id]),'append-only audit');
    await denied(root.query('truncate ai09g_rehearsal.read_audit'),'truncate audit denied');

    await root.query("create function ai09g_rehearsal.fail_audit() returns trigger language plpgsql as $fail$ begin raise exception 'forced audit failure' using errcode='42501'; end; $fail$");
    await root.query('create trigger ai09g_reject_audit before insert on ai09g_rehearsal.read_audit for each row execute function ai09g_rehearsal.fail_audit()');
    await denied(invoke(actorA,'authenticated',ADMIN_A,S_A,A,'crm.lead.read',LEAD_A),'failed audit blocks response');
    await root.query('drop trigger ai09g_reject_audit on ai09g_rehearsal.read_audit');
    assert.equal((await root.query('select count(*)::integer as n from ai09g_rehearsal.read_audit')).rows[0].n,3);

    // No sole-membership fallback: missing live auth.sessions row is fatal.
    await root.query('delete from auth.sessions where id=$1',[S_A]);
    await denied(invoke(actorA,'authenticated',ADMIN_A,S_A,A,'crm.lead.read',LEAD_A),'revoked live session');
    await root.query('insert into auth.sessions(id,user_id) values($1,$2)',[S_A,ADMIN_A]);
    await root.query('delete from public.tenant_session_bindings where session_id=$1',[S_A]);
    await denied(invoke(actorA,'authenticated',ADMIN_A,S_A,A,'crm.lead.read',LEAD_A),'direct binding removed');
    assert.equal((await root.query('select count(*)::integer as n from ai09g_rehearsal.read_audit')).rows[0].n,3);
  }finally{
    for(const c of clients.reverse())await c.end().catch(()=>{});
    if(made)await admin.query('drop database "'+name+'" with (force)').catch(()=>{});
    await admin.end().catch(()=>{});
  }
});
