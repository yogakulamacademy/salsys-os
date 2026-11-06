import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import pg from 'pg';
const {Client}=pg;
const foundation=readFileSync(new URL('./knowledge-discovery.foundation.sql',import.meta.url),'utf8');
const discovery=readFileSync(new URL('../../docs/sql/KB-01B-discovery-schema-DRAFT.sql',import.meta.url),'utf8');
const consentA=readFileSync(new URL('../../docs/sql/KB-06A-discovery-consent-execution-DRAFT.sql',import.meta.url),'utf8');
const consentB=readFileSync(new URL('../../docs/sql/KB-06B-audited-discovery-consent-lifecycle-DRAFT.sql',import.meta.url),'utf8');
const ORG_A='10000000-0000-4000-8000-000000000001';
const ORG_B='10000000-0000-4000-8000-000000000002';
const USER_A='20000000-0000-4000-8000-000000000001';
const USER_B='20000000-0000-4000-8000-000000000002';
const EMPLOYEE='20000000-0000-4000-8000-000000000003';
const SID_A='30000000-0000-4000-8000-000000000001';
const SID_B='30000000-0000-4000-8000-000000000002';
const SID_E='30000000-0000-4000-8000-000000000003';
const HOST_A='fixture.example.com';
const HOST_B='second.example.com';
const POLICY='synthetic-discovery-policy-2026-11';
const SHA='a'.repeat(64);
const ACK='I authorize read-only website discovery for this domain';

function local(){
  assert.equal(process.env.SALSYS_ALLOW_LOCAL_DB_TESTS,'1');
  const uri=new URL(process.env.SALSYS_TEST_DATABASE_URL??'');
  assert.equal(uri.protocol,'postgres:');
  assert.ok(['localhost','127.0.0.1'].includes(uri.hostname),'No remote SQL');
  assert.equal(uri.pathname,'/postgres','Application databases are forbidden');
  assert.equal(uri.username,'postgres','Disposable local administrator required');
  return uri;
}
test('KB-06B exact SQL: signed session, policy switch, atomic audit and withdrawal',async()=>{
  const uri=local();
  const name='salsys_kb06b_'+randomUUID().replaceAll('-','').slice(0,20);
  const target=new URL(uri);target.pathname='/'+name;
  const admin=new Client({connectionString:uri.toString()});
  const db=new Client({connectionString:target.toString()});
  let adminReady=false,dbReady=false,created=false;
  async function invoke(role,actor,sid,name,args){
    await db.query('begin');
    try{
      await db.query('set local role '+role);
      await db.query('select set_config($1,$2,true)',[
        'request.jwt.claims',JSON.stringify({role,sub:actor,session_id:sid}),
      ]);
      const out=await db.query(name,args);
      await db.query('commit');
      return out;
    }catch(e){await db.query('rollback');throw e;}
  }
  const grantArgs=(org=ORG_A,host=HOST_A,policy=POLICY,sha=SHA,expiry=new Date(Date.now()+3600_000).toISOString(),ack=ACK)=>
    [org,host,policy,sha,expiry,ack];
  const grantSql='select public.grant_knowledge_discovery_consent_v1($1,$2,$3,$4,$5,$6) as outcome';
  const withdrawSql='select public.withdraw_knowledge_discovery_consent_v1($1,$2,$3) as outcome';
  const a=(query,args)=>invoke('authenticated',USER_A,SID_A,query,args);
  const b=(query,args)=>invoke('authenticated',USER_B,SID_B,query,args);
  try{
    await admin.connect();adminReady=true;
    await admin.query('create database "'+name+'"');created=true;
    await db.connect();dbReady=true;
    await db.query(foundation);
    await db.query(discovery);
    await db.query(consentA);

    // Local-only stand-ins for the repo's production session-binding tables.
    // Nothing is read from or written to a hosted Supabase project.
    await db.query([
      "alter table public.organizations add column status text not null default 'active'",
      "create table public.organization_members(organization_id uuid not null,user_id uuid not null,role text not null,active boolean not null)",
      "create table public.tenant_session_bindings(session_id uuid primary key,user_id uuid not null,organization_id uuid not null)",
      "create table auth.sessions(id uuid primary key,user_id uuid not null)",
      "create function auth.uid() returns uuid language sql stable as $q$ select nullif(auth.jwt()->>'sub','')::uuid $q$",
      "grant execute on function auth.uid() to authenticated",
      "grant usage on schema auth to authenticated",
    ].join(';\n')+';');
    await db.query(consentB);
    await db.query('insert into public.organizations(id) values($1),($2)',[ORG_A,ORG_B]);
    await db.query('insert into public.test_knowledge_admins(organization_id,user_id) values($1,$2),($3,$4)',[ORG_A,USER_A,ORG_B,USER_B]);
    await db.query(
      "insert into public.organization_members(organization_id,user_id,role,active) values($1,$2,'owner',true),($3,$4,'admin',true),($5,$6,'employee',true)",
      [ORG_A,USER_A,ORG_B,USER_B,ORG_A,EMPLOYEE]);
    await db.query('insert into auth.sessions(id,user_id) values($1,$2),($3,$4),($5,$6)',
      [SID_A,USER_A,SID_B,USER_B,SID_E,EMPLOYEE]);
    await db.query('insert into public.tenant_session_bindings(session_id,user_id,organization_id) values($1,$2,$3),($4,$5,$6),($7,$8,$9)',
      [SID_A,USER_A,ORG_A,SID_B,USER_B,ORG_B,SID_E,EMPLOYEE,ORG_A]);

    // Explicit policy switch is OFF. Even the actual owner must be blocked.
    await assert.rejects(a(grantSql,grantArgs()),e=>e.code==='42501'&&/policy_unapproved/.test(e.message));
    assert.equal((await db.query('select count(*)::int as n from public.knowledge_discovery_site_consents')).rows[0].n,0);
    const control=(await db.query('select grants_enabled from public.knowledge_discovery_consent_control')).rows[0];
    assert.equal(control.grants_enabled,false);

    // A deliberate synthetic operator review enables only a matching policy.
    await db.query('update public.knowledge_discovery_consent_control set grants_enabled=true,approved_policy_version=$1,approved_policy_sha256=$2,approved_at=now() where singleton=true',[POLICY,SHA]);

    await assert.rejects(a(grantSql,grantArgs()),e=>e.code==='42501'&&/domain_not_verified/.test(e.message));
    await db.query(
      "insert into public.knowledge_discovery_domain_verifications(organization_id,hostname,challenge_hash,created_by,challenge_expires_at,verified_at,verified_until) values($1,$2,$3,$4,now()+interval '1 day',now()-interval '1 hour',now()+interval '1 day')",
      [ORG_A,HOST_A,'b'.repeat(64),USER_A]);

    // Forged org, session, employee role or missing active session denied.
    await assert.rejects(b(grantSql,grantArgs()),e=>e.code==='42501'&&/actor_or_session_denied/.test(e.message));
    await assert.rejects(
      invoke('authenticated',USER_A,SID_B,grantSql,grantArgs()),
      e=>e.code==='42501'&&/actor_or_session_denied/.test(e.message));
    await assert.rejects(
      invoke('authenticated',EMPLOYEE,SID_E,grantSql,grantArgs()),
      e=>e.code==='42501'&&/actor_or_session_denied/.test(e.message));
    await assert.rejects(
      invoke('authenticated',USER_A,null,grantSql,grantArgs()),
      e=>e.code==='42501'&&/actor_or_session_denied/.test(e.message));
    await assert.rejects(
      invoke('service_role',USER_A,SID_A,grantSql,grantArgs()),
      e=>e.code==='42501');
    await assert.rejects(a(grantSql,grantArgs(ORG_A,HOST_A,'wrong-policy')),
      e=>e.code==='42501'&&/policy_unapproved/.test(e.message));
    await assert.rejects(a(grantSql,grantArgs(ORG_A,HOST_A,POLICY,SHA,new Date(Date.now()+9*86400_000).toISOString())),
      e=>e.code==='22023');
    await assert.rejects(a(grantSql,grantArgs(ORG_A,HOST_A,POLICY,SHA,undefined,'generic consent')),
      e=>e.code==='22023');

    const first=(await a(grantSql,grantArgs())).rows[0].outcome;
    assert.deepEqual(first,{ok:true,status:'granted',revision:1});
    const row=(await db.query(
      'select id,granted_by,revision,status,hostname from public.knowledge_discovery_site_consents where organization_id=$1',
      [ORG_A])).rows[0];
    assert.equal(row.granted_by,USER_A);
    assert.equal(row.hostname,HOST_A);
    assert.equal(row.status,'granted');
    assert.equal(row.revision,1);
    assert.equal((await db.query('select count(*)::int as n from public.knowledge_discovery_consent_audit')).rows[0].n,1);
    await assert.rejects(a(grantSql,grantArgs()),e=>e.code==='23505');
    assert.equal((await db.query('select count(*)::int as n from public.knowledge_discovery_consent_audit')).rows[0].n,1);

    // Authenticated clients cannot update consent/audit rows, even in own org.
    await assert.rejects(a(
      "update public.knowledge_discovery_site_consents set status='withdrawn' where id=$1",[row.id]),
      e=>e.code==='42501');
    await assert.rejects(a(
      "update public.knowledge_discovery_consent_audit set policy_version='tampered' where consent_id=$1",[row.id]),
      e=>e.code==='42501');
    await assert.rejects(db.query(
      "update public.knowledge_discovery_consent_audit set policy_version='tampered' where consent_id=$1",[row.id]),
      e=>e.code==='42501'&&/append_only/.test(e.message));

    const j=(await db.query(
      "insert into public.knowledge_discovery_jobs(organization_id,created_by,seed_url,status) values($1,$2,$3,'queued') returning id",
      [ORG_A,USER_A,'https://'+HOST_A+'/'])).rows[0].id;
    const claimed=(await invoke('service_role',USER_A,SID_A,
      'select * from public.claim_knowledge_discovery_job_v1()',[])).rows;
    assert.equal(claimed.length,1);
    assert.equal(claimed[0].job_id,j);
    const page=(await db.query(
      "insert into public.knowledge_discovery_pages(organization_id,job_id,url,status) values($1,$2,$3,'discovered') returning id",
      [ORG_A,j,'https://'+HOST_A+'/'])).rows[0].id;

    // Stale revision, cross-org user and absent session cannot withdraw.
    const stale=(await a(withdrawSql,[ORG_A,HOST_A,2])).rows[0].outcome;
    assert.deepEqual(stale,{ok:false,reason:'stale_revision'});
    await assert.rejects(b(withdrawSql,[ORG_A,HOST_A,1]),e=>e.code==='42501');
    await assert.rejects(
      invoke('authenticated',USER_A,SID_B,withdrawSql,[ORG_A,HOST_A,1]),
      e=>e.code==='42501');
    assert.equal((await db.query('select status from public.knowledge_discovery_jobs where id=$1',[j])).rows[0].status,'running');

    // Disabling future grants does NOT prevent explicit withdrawal.
    await db.query('update public.knowledge_discovery_consent_control set grants_enabled=false where singleton=true');
    const withdrawn=(await a(withdrawSql,[ORG_A,HOST_A,1])).rows[0].outcome;
    assert.deepEqual(withdrawn,{ok:true,status:'withdrawn',revision:2,jobsCancelled:1});
    const stopped=(await db.query(
      'select status,lease_token,last_error_code from public.knowledge_discovery_jobs where id=$1',[j])).rows[0];
    assert.deepEqual(stopped,{status:'cancelled',lease_token:null,last_error_code:'consent_withdrawn'});
    const audit=(await db.query(
      'select action,actor_id,session_id,revision,job_cancellations from public.knowledge_discovery_consent_audit where organization_id=$1 order by revision',
      [ORG_A])).rows;
    assert.deepEqual(audit.map(x=>[x.action,x.actor_id,x.session_id,x.revision,x.job_cancellations]),[
      ['granted',USER_A,SID_A,1,0],['withdrawn',USER_A,SID_A,2,1],
    ]);
    const delayed=(await invoke('service_role',USER_A,SID_A,
      'select public.commit_knowledge_discovery_page_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11) as outcome',
      [ORG_A,j,page,claimed[0].lease_token,'fetched',200,'text/html','Wrong',null,'[]',2])).rows[0].outcome;
    assert.equal(delayed.ok,false);
    assert.equal((await db.query('select status,page_title from public.knowledge_discovery_pages where id=$1',[page])).rows[0].page_title,null);
    const duplicate=(await a(withdrawSql,[ORG_A,HOST_A,1])).rows[0].outcome;
    assert.deepEqual(duplicate,{ok:false,reason:'stale_revision'});
    assert.equal((await db.query('select count(*)::int as n from public.knowledge_discovery_consent_audit')).rows[0].n,2);
    await assert.rejects(a(grantSql,grantArgs()),e=>e.code==='42501','Policy remains OFF');
    // Strict session revocation: loss of auth.sessions row immediately denies.
    await db.query('delete from auth.sessions where id=$1',[SID_A]);
    await assert.rejects(a(withdrawSql,[ORG_A,HOST_A,2]),e=>e.code==='42501');

    // Local-only, disposable synthetic data. No real staging or production.
  }finally{
    if(dbReady)await db.end().catch(()=>{});
    try{if(created&&adminReady)await admin.query('drop database "'+name+'" with (force)');}
    finally{if(adminReady)await admin.end().catch(()=>{});}
  }
});
