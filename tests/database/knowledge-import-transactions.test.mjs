import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';
const org='10000000-0000-4000-8000-000000000001', other='10000000-0000-4000-8000-000000000002', actor='20000000-0000-4000-8000-000000000001', session='30000000-0000-4000-8000-000000000001', job='40000000-0000-4000-8000-000000000001';
const payload={title:'Synthetic policy',category:'faq',content:'Synthetic content for fixture only',source_name:'Fixture',source_type:'manual'};
const fixture=`
create schema auth;
create table auth.users(id uuid primary key);
create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id));
create table public.organizations(id uuid primary key,status text not null);
create table public.organization_members(organization_id uuid,user_id uuid,active boolean,role text,primary key(organization_id,user_id));
create table public.tenant_session_bindings(session_id uuid primary key,user_id uuid,organization_id uuid);
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
create function auth.role() returns text language sql stable as $$ select auth.jwt()->>'role' $$;
create function public.is_crm_user() returns boolean language sql stable as $$ select auth.uid() is not null $$;
create function public.is_organization_member(uuid) returns boolean language sql stable as $$ select exists(select 1 from public.organization_members m where m.organization_id=$1 and m.user_id=auth.uid() and m.active) $$;
create function public.can_manage_organization(uuid) returns boolean language sql stable as $$ select exists(select 1 from public.organization_members m where m.organization_id=$1 and m.user_id=auth.uid() and m.active and m.role in ('admin','owner')) $$;
create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now();return new;end $$;
`;
const claims=JSON.stringify({sub:actor,role:'authenticated',session_id:session});
const runClaim=(db)=>db.query('select * from knowledge_import_review.claim($1,$2,1)',[org,job]);
const finalize=(db,c,p=payload)=>db.query('select knowledge_import_review.finalize($1,$2,$3,$4,$5,$6::jsonb) as id',[org,job,c.entry_index,c.lease_token,c.attempts,JSON.stringify(p)]);
test('disposable PG: exact Knowledge RPC, competing claims, rollback, retry, revoke, cancellation',async()=>{
  assert.equal(process.env.SALSYS_ALLOW_LOCAL_DB_TESTS,'1');
  const url=new URL(process.env.SALSYS_TEST_DATABASE_URL);
  assert.equal(url.protocol,'postgres:');assert.ok(['127.0.0.1','localhost'].includes(url.hostname));assert.equal(url.pathname,'/postgres');assert.equal(url.username,'postgres');
  const name='salsys_kb_fixture_'+randomUUID().replaceAll('-',''),target=new URL(url);target.pathname='/'+name;
  const admin=new pg.Client({connectionString:url.href}), clients=[], roles=[];let made=false;
  await admin.connect();
  try{
    for(const role of ['anon','authenticated','service_role']){if(!(await admin.query('select 1 from pg_roles where rolname=$1',[role])).rowCount){await admin.query('create role '+role+' nologin');roles.push(role);}}
    await admin.query('create database "'+name+'"');made=true;
    const connect=async()=>{const db=new pg.Client({connectionString:target.href});clients.push(db);await db.connect();await db.query("set statement_timeout='12s'");await db.query("select set_config('request.jwt.claims',$1,false)",[claims]);return db;};
    const a=await connect(), b=await connect();
    await a.query(fixture);
    for(const path of ['supabase/migrations/20261016171500_organization_knowledge_v1.sql','supabase/migrations/20261103190000_ai_knowledge_provenance_readiness_v2.sql','docs/sql/knowledge-import-ledger-v1-REVIEW-DRAFT.sql','docs/sql/knowledge-import-transactions-REVIEW-DRAFT.sql']) await a.query(readFileSync(path,'utf8'));
    assert.equal((await a.query("select has_schema_privilege('authenticated','knowledge_import_review','USAGE') as allowed")).rows[0].allowed,false);
    await a.query('insert into auth.users values($1)',[actor]);await a.query('insert into auth.sessions values($1,$2)',[session,actor]);
    await a.query("insert into organizations values($1,'active'),($2,'active')",[org,other]);
    await a.query("insert into organization_members values($1,$2,true,'admin')",[org,actor]);
    await a.query('insert into tenant_session_bindings values($1,$2,$3)',[session,actor,org]);
    await a.query("insert into knowledge_import_jobs_v1(id,organization_id,requested_by,request_session_id,object_path,declared_bytes,verified_bytes,sha256,total_entries,status,upload_expires_at,retention_expires_at) values($1,$2,$3,$4,$5,100,100,repeat('a',64),3,'queued',now()+interval '1 hour',now()+interval '2 hours')",[job,org,actor,session,org+'/'+job+'/source.json']);
    await a.query("insert into knowledge_import_entries_v1(organization_id,job_id,entry_index,payload_sha256) select $1,$2,i,encode(sha256(convert_to(($3::jsonb)::text,'UTF8')),'hex') from generate_series(0,2) i",[org,job,JSON.stringify(payload)]);
    const [x,y]=await Promise.all([runClaim(a),runClaim(b)]);const c=x.rows[0],d=y.rows[0];assert.notEqual(c.entry_index,d.entry_index);
    await assert.rejects(a.query('select * from knowledge_import_review.claim($1,$2,1)',[other,job]),e=>e.code==='42501');
    await assert.rejects(finalize(a,c,{...payload,content:'Modified synthetic policy'}),/payload mismatch/);
    // Inject an actual failure at the ledger update, after the real creation RPC.
    await a.query("create function fixture_abort() returns trigger language plpgsql as $$ begin if new.status='created' then raise exception 'fixture crash'; end if;return new;end $$; create trigger fixture_abort before update on knowledge_import_entries_v1 for each row execute function fixture_abort()");
    await assert.rejects(finalize(a,c),/fixture crash/);
    assert.equal((await a.query('select count(*)::int as n from knowledge_documents')).rows[0].n,0);
    await a.query('drop trigger fixture_abort on knowledge_import_entries_v1');
    const id=(await finalize(a,c)).rows[0].id;assert.equal((await finalize(b,c)).rows[0].id,id);
    assert.equal((await a.query("select count(*)::int as n from knowledge_documents where status='draft' and organization_id=$1 and created_by=$2",[org,actor])).rows[0].n,1);
    await a.query("update knowledge_import_entries_v1 set lease_expires_at=now()-interval '1 second' where organization_id=$1 and job_id=$2 and entry_index=$3",[org,job,d.entry_index]);
    const reclaimed=(await runClaim(b)).rows[0];assert.equal(reclaimed.entry_index,d.entry_index);assert.equal(reclaimed.attempts,2);
    await assert.rejects(finalize(a,d),/stale claim/);
    await a.query('update organization_members set active=false where organization_id=$1 and user_id=$2',[org,actor]);
    await assert.rejects(finalize(b,reclaimed),e=>e.code==='42501');
    await a.query('update organization_members set active=true where organization_id=$1 and user_id=$2',[org,actor]);
    assert.equal((await a.query('select knowledge_import_review.cancel($1,$2) as ok',[org,job])).rows[0].ok,true);
    await assert.rejects(finalize(b,reclaimed),/stale claim/);
    assert.deepEqual((await a.query('select status,count(*)::int as n from knowledge_import_entries_v1 group by status order by status')).rows,[{status:'cancelled',n:2},{status:'created',n:1}]);
    assert.equal((await a.query('select count(*)::int as n from knowledge_approvals')).rows[0].n,0);
    // Independent jobs: database-owned backoff, permanent failure and expiry.
    const seedJob=async(n)=>{
      const j=randomUUID();
      await a.query("insert into knowledge_import_jobs_v1(id,organization_id,requested_by,request_session_id,object_path,declared_bytes,verified_bytes,sha256,total_entries,status,upload_expires_at,retention_expires_at) values($1,$2,$3,$4,$5,100,100,repeat('a',64),$6,'queued',now()+interval '1 hour',now()+interval '2 hours')",[j,org,actor,session,org+'/'+j+'/source.json',n]);
      await a.query("insert into knowledge_import_entries_v1(organization_id,job_id,entry_index,payload_sha256) select $1,$2,i,encode(sha256(convert_to(($3::jsonb)::text,'UTF8')),'hex') from generate_series(0,$4::int-1) i",[org,j,JSON.stringify(payload),n]);return j;
    };
    const claimJob=async(db,j)=>(await db.query('select * from knowledge_import_review.claim($1,$2,1)',[org,j])).rows[0];
    const finishJob=(db,j,c)=>db.query('select knowledge_import_review.finalize($1,$2,$3,$4,$5,$6::jsonb) as id',[org,j,c.entry_index,c.lease_token,c.attempts,JSON.stringify(payload)]);
    const settle=(db,j,c,code)=>db.query('select knowledge_import_review.settle_failure($1,$2,$3,$4,$5,$6) as status',[org,j,c.entry_index,c.lease_token,c.attempts,code]);
    const retryJob=await seedJob(1);
    for(let attempt=1;attempt<=5;attempt++){
      const c=await claimJob(a,retryJob);assert.equal(c.attempts,attempt);
      await assert.rejects(settle(b,retryJob,c,'unreviewed_error'),/unsupported failure code/);
      assert.equal((await settle(a,retryJob,c,'db_transient')).rows[0].status,attempt<5?'pending':'failed');
      await assert.rejects(settle(b,retryJob,c,'db_transient'),/stale claim/);
      assert.equal(await claimJob(b,retryJob),undefined);
      if(attempt<5){
        const due=(await a.query('select extract(epoch from available_at-clock_timestamp())::float8 as seconds from knowledge_import_entries_v1 where job_id=$1',[retryJob])).rows[0].seconds;
        assert.ok(due>30*2**(attempt-1)-5 && due<=30*2**(attempt-1));
        // Advance synthetic fixture only; no production time override.
        await a.query("update knowledge_import_entries_v1 set available_at=now()-interval '1 second' where job_id=$1",[retryJob]);
      }
    }
    const permanent=await seedJob(1), pc=await claimJob(a,permanent);
    assert.equal((await settle(a,permanent,pc,'invalid_payload')).rows[0].status,'failed');
    assert.equal(await claimJob(b,permanent),undefined);
    const expired=await seedJob(1), ec=await claimJob(a,expired);
    assert.equal((await a.query('select knowledge_import_review.expire($1,$2) as ok',[org,expired])).rows[0].ok,false);
    await a.query("update knowledge_import_jobs_v1 set created_at=now()-interval '3 hours',upload_expires_at=now()-interval '2 hours',retention_expires_at=now()-interval '1 hour' where id=$1",[expired]);
    assert.equal((await a.query('select knowledge_import_review.expire($1,$2) as ok',[org,expired])).rows[0].ok,true);
    await assert.rejects(finishJob(b,expired,ec),/stale claim/);
    assert.equal((await a.query('select status from knowledge_import_jobs_v1 where id=$1',[expired])).rows[0].status,'expired');
    // Two real sessions: cancellation blocks behind a finalization transaction.
    const race=await seedJob(2), rc=await claimJob(a,race);
    await a.query('begin');
    const saved=(await finishJob(a,race,rc)).rows[0].id;
    const waiting=b.query('select knowledge_import_review.cancel($1,$2) as ok',[org,race]).then(result=>({result}),error=>({error}));
    const observer=await connect(), pid=(await observer.query("select pid from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and query like '%knowledge_import_review.cancel%'")).rows[0]?.pid;
    let blocked=Boolean(pid);
    for(let i=0;!blocked&&i<100;i++){await new Promise(resolve=>setTimeout(resolve,25));blocked=(await observer.query("select exists(select 1 from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and query like '%knowledge_import_review.cancel%') as blocked")).rows[0].blocked;}
    await a.query('commit');
    const cancelled=await waiting;assert.equal(blocked,true);assert.ifError(cancelled.error);assert.equal(cancelled.result.rows[0].ok,true);
    assert.deepEqual((await a.query('select status,document_id from knowledge_import_entries_v1 where job_id=$1 order by entry_index',[race])).rows,[{status:'created',document_id:saved},{status:'cancelled',document_id:null}]);
    // Cancel-first ordering refuses subsequent creation.
    const race2=await seedJob(1), rc2=await claimJob(a,race2);
    await a.query('begin');await a.query('select knowledge_import_review.cancel($1,$2)',[org,race2]);
    const losing=finishJob(b,race2,rc2).then(result=>({result}),error=>({error}));
    await a.query('commit');
    assert.match((await losing).error?.message??'',/stale claim/);
    assert.equal((await a.query('select count(*)::int as n from knowledge_approvals')).rows[0].n,0);

  }finally{
    for(const db of clients)await db.end().catch(()=>{});
    if(made)await admin.query('drop database "'+name+'" with (force)');
    for(const role of roles.reverse())await admin.query('drop role if exists '+role);
    await admin.end();
  }
});
