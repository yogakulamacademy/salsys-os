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
    // Reservation and enqueue use the actual review functions, not seeded ledger rows.
    const reserve=(db,j,bytes,upload,retain,o=org)=>db.query('select knowledge_import_review.reserve($1,$2,$3,$4,$5) as id',[o,j,bytes,upload,retain]);
    const enqueue=(db,j,bytes,hash,manifest)=>db.query('select knowledge_import_review.enqueue($1,$2,$3,$4,$5::jsonb) as status',[org,j,bytes,hash,JSON.stringify(manifest)]);
    const upload=new Date(Date.now()+3600000), retain=new Date(Date.now()+7200000), reserved=randomUUID();
    await assert.rejects(reserve(a,reserved,100,upload,retain),/quota not configured/);
    await a.query('insert into knowledge_import_review.quotas values($1,1,300)',[org]);
    await assert.rejects(reserve(a,reserved,100,upload,retain,other),e=>e.code==='42501');
    assert.equal((await reserve(a,reserved,100,upload,retain)).rows[0].id,reserved);
    const uploadCheck=(db,o=org,j=reserved,bucket='knowledge-import-private-v1',path=org+'/'+reserved+'/source.json',bytes=100)=>db.query('select knowledge_import_review.upload_allowed($1,$2,$3,$4,$5) as ok',[o,j,bucket,path,bytes]);
    assert.equal((await uploadCheck(a)).rows[0].ok,true);
    assert.equal((await uploadCheck(a,other)).rows[0].ok,false);
    assert.equal((await uploadCheck(a,org,reserved,'public')).rows[0].ok,false);
    assert.equal((await uploadCheck(a,org,reserved,'knowledge-import-private-v1','../other/source.json')).rows[0].ok,false);
    assert.equal((await uploadCheck(a,org,reserved,'knowledge-import-private-v1',org+'/'+reserved+'/source.json',101)).rows[0].ok,false);
    await a.query('update organization_members set active=false where organization_id=$1 and user_id=$2',[org,actor]);
    assert.equal((await uploadCheck(b)).rows[0].ok,false);
    await assert.rejects(b.query('select * from knowledge_import_review.history($1,25)',[org]),e=>e.code==='42501');
    await a.query('update organization_members set active=true where organization_id=$1 and user_id=$2',[org,actor]);
    await assert.rejects(b.query('select * from knowledge_import_review.history($1,25)',[other]),e=>e.code==='42501');
    await b.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({...JSON.parse(claims),session_id:randomUUID()})]);
    assert.equal((await uploadCheck(b)).rows[0].ok,false);
    await assert.rejects(b.query('select * from knowledge_import_review.history($1,25)',[org]),e=>e.code==='42501');
    await b.query("select set_config('request.jwt.claims',$1,false)",[claims]);
    const history=async(db,limit,before=null,beforeId=null)=>(await db.query('select * from knowledge_import_review.history($1,$2,$3,$4)',[org,limit,before,beforeId])).rows;
    const historyPage=await history(a,1);assert.equal(historyPage.length,1);assert.equal(historyPage[0].job_id,reserved);
    assert.deepEqual(Object.keys(historyPage[0]).sort(),['job_id','job_status','created_at','file_bytes','total_entries','pending','leased','created','invalid','duplicate','failed','cancelled'].sort());
    // Preserve database timestamp precision using text cursor rather than JS Date milliseconds.
    const cursor=(await a.query('select created_at::text as ts from knowledge_import_jobs_v1 where id=$1',[reserved])).rows[0].ts;
    const older=await history(b,1,cursor,reserved);assert.equal(older[0].job_id,job);
    await assert.rejects(history(a,26),/invalid history cursor/);

    assert.equal((await reserve(b,reserved,100,upload,retain)).rows[0].id,reserved);
    await assert.rejects(reserve(b,reserved,101,upload,retain),/reservation conflict/);
    await assert.rejects(reserve(b,randomUUID(),1,upload,retain),/quota exceeded/);
    const pd=(await a.query("select encode(sha256(convert_to(($1::jsonb)::text,'UTF8')),'hex') as h",[JSON.stringify(payload)])).rows[0].h;
    const manifest=[{index:0,status:'pending',payload_sha256:pd},{index:1,status:'invalid'},{index:2,status:'duplicate'}];
    const canonical=(await a.query('select * from knowledge_import_review.digest_payloads($1::jsonb)',[JSON.stringify([payload,{...payload,content:'日本語 synthetic'}])])).rows;
    assert.equal(canonical.length,2);assert.equal(canonical[0].entry_index,'0');assert.equal(canonical[0].payload_sha256,pd);
    assert.notEqual(canonical[1].payload_sha256,pd);
    await assert.rejects(a.query('select * from knowledge_import_review.digest_payloads($1::jsonb)',[JSON.stringify([null])]),/invalid digest payload/);
    await assert.rejects(a.query('select * from knowledge_import_review.digest_payloads($1::jsonb)',[JSON.stringify(Array(51).fill(payload))]),/invalid digest batch/);

    await assert.rejects(enqueue(a,reserved,99,'b'.repeat(64),manifest),/invalid manifest/);
    await assert.rejects(enqueue(a,reserved,100,'b'.repeat(64),[{...manifest[0],index:1},manifest[1]]),/invalid manifest entry/);
    await assert.rejects(enqueue(a,reserved,100,'b'.repeat(64),[{...manifest[0],p_approve:true}]),/invalid manifest entry/);
    assert.equal((await a.query('select count(*)::int as n from knowledge_import_entries_v1 where job_id=$1',[reserved])).rows[0].n,0);
    // Actual insert failure must roll back the entire enqueue.
    await a.query("create function fixture_enqueue_abort() returns trigger language plpgsql as $$ begin if new.entry_index=1 then raise exception 'fixture enqueue crash'; end if;return new;end $$; create trigger fixture_enqueue_abort before insert on knowledge_import_entries_v1 for each row execute function fixture_enqueue_abort()");
    await assert.rejects(enqueue(a,reserved,100,'b'.repeat(64),manifest),/fixture enqueue crash/);
    assert.equal((await a.query('select count(*)::int as n from knowledge_import_entries_v1 where job_id=$1',[reserved])).rows[0].n,0);
    assert.equal((await a.query('select status from knowledge_import_jobs_v1 where id=$1',[reserved])).rows[0].status,'awaiting_upload');
    await a.query('drop trigger fixture_enqueue_abort on knowledge_import_entries_v1');
    const pair=await Promise.all([enqueue(a,reserved,100,'b'.repeat(64),manifest),enqueue(b,reserved,100,'b'.repeat(64),manifest)]);
    assert.deepEqual(pair.map(x=>x.rows[0].status),['queued','queued']);
    assert.equal((await uploadCheck(b)).rows[0].ok,false);
    const queuedSummary=(await history(b,25)).find(row=>row.job_id===reserved);
    assert.equal(queuedSummary.total_entries,3);
    assert.deepEqual([queuedSummary.pending,queuedSummary.invalid,queuedSummary.duplicate],[1,1,1]);

    assert.equal((await a.query('select count(*)::int as n from knowledge_import_entries_v1 where job_id=$1',[reserved])).rows[0].n,3);
    await assert.rejects(enqueue(b,reserved,100,'c'.repeat(64),manifest),/manifest conflict/);

    // Dedicated synthetic login, not SET ROLE or forged administrator JWT.
    const workerName='salsys_kb_worker_'+randomUUID().replaceAll('-','').slice(0,16);
    const password=randomUUID();
    await admin.query("create role "+workerName+" login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password '"+password+"'");
    roles.push(workerName);
    await a.query('insert into knowledge_import_review.worker_principals values($1,true)',[workerName]);
    const until=new Date(Date.now()+600000);
    const delegate=()=>a.query('select knowledge_import_review.delegate_worker($1,$2,$3,$4) as ok',[org,reserved,workerName,until]);
    assert.equal((await delegate()).rows[0].ok,false); // no verified object version
    await a.query("update knowledge_import_jobs_v1 set object_version='synthetic-immutable-version' where id=$1",[reserved]);
    assert.equal((await delegate()).rows[0].ok,true);
    assert.equal((await delegate()).rows[0].ok,false);
    assert.equal((await a.query('select knowledge_import_review.worker_allowed($1,$2) as ok',[org,reserved])).rows[0].ok,false); // postgres != worker
    const workerUrl=new URL(target);workerUrl.username=workerName;workerUrl.password=password;
    const worker=new pg.Client({connectionString:workerUrl.href});clients.push(worker);await worker.connect();
    const allowed=()=>worker.query('select knowledge_import_review.worker_allowed($1,$2) as ok',[org,reserved]);
    await assert.rejects(allowed(),e=>e.code==='42501');
    // Only this disposable database grants usage of the review predicate to the exact test login.
    await a.query('grant usage on schema knowledge_import_review to '+workerName);
    await a.query('grant execute on function knowledge_import_review.worker_allowed(uuid,uuid) to '+workerName);
    assert.equal((await allowed()).rows[0].ok,true);
    assert.equal((await worker.query('select knowledge_import_review.worker_allowed($1,$2) as ok',[other,reserved])).rows[0].ok,false);
    await assert.rejects(worker.query('select * from knowledge_import_review.claim($1,$2,1)',[org,reserved]),e=>e.code==='42501');
    await assert.rejects(worker.query('select * from public.knowledge_documents'),e=>e.code==='42501');
    await a.query('update organization_members set active=false where organization_id=$1 and user_id=$2',[org,actor]);
    assert.equal((await allowed()).rows[0].ok,false);
    await a.query('update organization_members set active=true where organization_id=$1 and user_id=$2',[org,actor]);
    await a.query("update knowledge_import_jobs_v1 set object_version='replacement' where id=$1",[reserved]);
    assert.equal((await allowed()).rows[0].ok,false);
    await a.query("update knowledge_import_jobs_v1 set object_version='synthetic-immutable-version' where id=$1",[reserved]);
    assert.equal((await allowed()).rows[0].ok,true);
    await a.query('update knowledge_import_review.worker_principals set enabled=false where login_role=$1',[workerName]);
    assert.equal((await allowed()).rows[0].ok,false);
    await a.query('update knowledge_import_review.worker_principals set enabled=true where login_role=$1',[workerName]);
    assert.equal((await a.query('select knowledge_import_review.revoke_worker($1,$2) as ok',[org,reserved])).rows[0].ok,true);
    assert.equal((await allowed()).rows[0].ok,false);
    assert.equal((await a.query('select knowledge_import_review.cancel($1,$2) as ok',[org,reserved])).rows[0].ok,true);
    // Old terminal jobs still consume retained byte budget; one active slot available.
    const contenders=await Promise.allSettled([reserve(a,randomUUID(),100,upload,retain),reserve(b,randomUUID(),100,upload,retain)]);
    assert.equal(contenders.filter(x=>x.status==='fulfilled').length,1);
    assert.match(contenders.find(x=>x.status==='rejected').reason.message,/quota exceeded/);
    assert.equal((await a.query("select sum(declared_bytes)::int as n from knowledge_import_jobs_v1 where organization_id=$1",[org])).rows[0].n,300);
    // A reserved-but-not-uploaded job can expire, yet bytes are not silently released.
    await a.query("update knowledge_import_jobs_v1 set created_at=now()-interval '3 hours',upload_expires_at=now()-interval '2 hours',retention_expires_at=now()-interval '1 hour' where organization_id=$1 and status='awaiting_upload'",[org]);
    const expJob=(await a.query("select id from knowledge_import_jobs_v1 where organization_id=$1 and status='awaiting_upload'",[org])).rows[0].id;
    assert.equal((await a.query('select knowledge_import_review.expire($1,$2) as ok',[org,expJob])).rows[0].ok,true);
    await assert.rejects(reserve(b,randomUUID(),1,upload,retain),/quota exceeded/);
    // Independent jobs: database-owned backoff, permanent failure and expiry.
    const seedJob=async(n)=>{
      const j=randomUUID();
      await a.query("insert into knowledge_import_jobs_v1(id,organization_id,requested_by,request_session_id,object_path,declared_bytes,verified_bytes,sha256,total_entries,status,upload_expires_at,retention_expires_at) values($1,$2,$3,$4,$5,100,100,repeat('a',64),$6,'queued',now()+interval '1 hour',now()+interval '2 hours')",[j,org,actor,session,org+'/'+j+'/source.json',n]);
      await a.query("insert into knowledge_import_entries_v1(organization_id,job_id,entry_index,payload_sha256) select $1,$2,i,encode(sha256(convert_to(($3::jsonb)::text,'UTF8')),'hex') from generate_series(0,$4::int-1) i",[org,j,JSON.stringify(payload),n]);return j;
    };
    const claimJob=async(db,j)=>(await db.query('select * from knowledge_import_review.claim($1,$2,1)',[org,j])).rows[0];
    const finishJob=(db,j,c)=>db.query('select knowledge_import_review.finalize($1,$2,$3,$4,$5,$6::jsonb) as id',[org,j,c.entry_index,c.lease_token,c.attempts,JSON.stringify(payload)]);
    const settle=(db,j,c,code)=>db.query('select knowledge_import_review.settle_failure($1,$2,$3,$4,$5,$6) as status',[org,j,c.entry_index,c.lease_token,c.attempts,code]);

    // Worker-specific processing on a new synthetic job, independently of original-session paths.
    const wjob=await seedJob(2);
    await a.query("update knowledge_import_jobs_v1 set object_version='fixture-v2',manifest_sha256=repeat('b',64) where id=$1",[wjob]);
    assert.equal((await a.query('select knowledge_import_review.delegate_worker($1,$2,$3,$4) as ok',[org,wjob,workerName,new Date(Date.now()+600000)])).rows[0].ok,true);
    const wclaim=(db,j=wjob,o=org)=>db.query('select * from knowledge_import_review.worker_claim($1,$2,1)',[o,j]);
    const wfinish=(db,c,p=payload)=>db.query('select knowledge_import_review.worker_finalize($1,$2,$3,$4,$5,$6::jsonb) as id',[org,wjob,c.entry_index,c.lease_token,c.attempts,JSON.stringify(p)]);
    await assert.rejects(wclaim(worker),e=>e.code==='42501');
    await a.query('grant execute on function knowledge_import_review.worker_claim(uuid,uuid,integer),knowledge_import_review.worker_finalize(uuid,uuid,integer,uuid,integer,jsonb) to '+workerName);
    await assert.rejects(wclaim(worker,wjob,other),e=>e.code==='42501');
    const wc=(await wclaim(worker)).rows[0];assert.ok(wc.lease_token);
    await assert.rejects(finishJob(a,wjob,wc),/stale claim/);
    await assert.rejects(wfinish(worker,wc,{...payload,p_approve:true}),/payload mismatch/);
    await assert.rejects(wfinish(worker,{...wc,lease_token:randomUUID()}),/stale worker claim/);
    await a.query("create trigger fixture_worker_abort before update on knowledge_import_entries_v1 for each row execute function fixture_abort()");
    await assert.rejects(wfinish(worker,wc),/fixture crash/);
    assert.equal((await a.query("select count(*)::int as n from knowledge_documents where metadata->>'import_job_id'=$1",[wjob])).rows[0].n,0);
    await a.query('drop trigger fixture_worker_abort on knowledge_import_entries_v1');
    const wd=(await wfinish(worker,wc)).rows[0].id;
    const madeDraft=(await a.query('select organization_id,created_by,status,approved_by,approved_at from knowledge_documents where id=$1',[wd])).rows[0];
    assert.deepEqual(madeDraft,{organization_id:org,created_by:actor,status:'draft',approved_by:null,approved_at:null});
    await assert.rejects(wfinish(worker,wc),/stale worker claim/);
    const wc2=(await wclaim(worker)).rows[0];assert.notEqual(wc2.entry_index,wc.entry_index);
    await a.query('update organization_members set active=false where organization_id=$1 and user_id=$2',[org,actor]);
    await assert.rejects(wfinish(worker,wc2),e=>e.code==='42501');
    await a.query('update organization_members set active=true where organization_id=$1 and user_id=$2',[org,actor]);
    await a.query('select knowledge_import_review.revoke_worker($1,$2)',[org,wjob]);
    await assert.rejects(wfinish(worker,wc2),e=>e.code==='42501');
    await assert.rejects(wclaim(worker),e=>e.code==='42501');
    await assert.rejects(worker.query('select * from public.knowledge_documents'),e=>e.code==='42501');
    await assert.rejects(worker.query('select * from public.knowledge_import_entries_v1'),e=>e.code==='42501');
    await assert.rejects(worker.query('select knowledge_import_review.cancel($1,$2)',[org,wjob]),e=>e.code==='42501');
    assert.equal((await a.query('select count(*)::int as n from knowledge_approvals')).rows[0].n,0);

    const recoveryJob=await seedJob(1);
    await a.query("update knowledge_import_jobs_v1 set object_version='fixture-recovery',manifest_sha256=repeat('c',64) where id=$1",[recoveryJob]);
    const grantUntil=new Date(Date.now()+300000);
    assert.equal((await a.query('select knowledge_import_review.delegate_worker($1,$2,$3,$4) as ok',[org,recoveryJob,workerName,grantUntil])).rows[0].ok,true);
    const renew=(db,j,until)=>db.query('select knowledge_import_review.renew_worker($1,$2,$3) as ok',[org,j,until]);
    const workerFail=(j,c,code)=>worker.query('select knowledge_import_review.worker_settle_failure($1,$2,$3,$4,$5,$6) as status',[org,j,c.entry_index,c.lease_token,c.attempts,code]);
    const workerResult=(j,c,o=org)=>worker.query('select knowledge_import_review.worker_result($1,$2,$3,$4,$5) as id',[o,j,c.entry_index,c.lease_token,c.attempts]);
    await assert.rejects(renew(worker,recoveryJob,new Date(Date.now()+600000)),e=>e.code==='42501');
    assert.equal((await renew(a,recoveryJob,new Date(Date.now()+3600000))).rows[0].ok,false);
    assert.equal((await renew(a,recoveryJob,new Date(Date.now()+600000))).rows[0].ok,true);
    assert.equal((await renew(a,wjob,new Date(Date.now()+800000))).rows[0].ok,false); // revoked
    await a.query('grant execute on function knowledge_import_review.worker_settle_failure(uuid,uuid,integer,uuid,integer,text),knowledge_import_review.worker_result(uuid,uuid,integer,uuid,integer) to '+workerName);
    let rec=(await wclaim(worker,recoveryJob)).rows[0];
    assert.equal((await workerResult(recoveryJob,rec)).rows[0].id,null);
    await assert.rejects(workerFail(recoveryJob,{...rec,lease_token:randomUUID()},'db_transient'),/stale worker claim/);
    await assert.rejects(workerFail(recoveryJob,rec,'unreviewed'),/unsupported failure code/);
    assert.equal((await workerFail(recoveryJob,rec,'db_transient')).rows[0].status,'pending');
    assert.equal((await wclaim(worker,recoveryJob)).rowCount,0);
    await a.query("update knowledge_import_entries_v1 set available_at=now()-interval '1 second' where job_id=$1",[recoveryJob]);
    const rec2=(await wclaim(worker,recoveryJob)).rows[0];assert.equal(rec2.attempts,2);
    await assert.rejects(workerFail(recoveryJob,rec,'db_transient'),/stale worker claim/);
    const committed=(await worker.query('select knowledge_import_review.worker_finalize($1,$2,$3,$4,$5,$6::jsonb) as id',[org,recoveryJob,rec2.entry_index,rec2.lease_token,rec2.attempts,JSON.stringify(payload)])).rows[0].id;
    assert.equal((await a.query('select status from knowledge_import_jobs_v1 where id=$1',[recoveryJob])).rows[0].status,'completed');
    assert.equal((await workerResult(recoveryJob,rec2)).rows[0].id,committed);
    assert.equal((await workerResult(recoveryJob,rec)).rows[0].id,null);
    assert.equal((await workerResult(recoveryJob,{...rec2,lease_token:randomUUID()})).rows[0].id,null);
    await assert.rejects(workerResult(recoveryJob,rec2,other),e=>e.code==='42501');
    await assert.rejects(wclaim(worker,recoveryJob),e=>e.code==='42501');
    await a.query('update organization_members set active=false where organization_id=$1 and user_id=$2',[org,actor]);
    await assert.rejects(workerResult(recoveryJob,rec2),e=>e.code==='42501');
    await a.query('update organization_members set active=true where organization_id=$1 and user_id=$2',[org,actor]);
    await a.query("update knowledge_import_review.worker_delegations set expires_at=now()-interval '1 second' where job_id=$1",[recoveryJob]);
    await assert.rejects(workerResult(recoveryJob,rec2),e=>e.code==='42501');
    const exhaustionJob=await seedJob(1);
    await a.query("update knowledge_import_jobs_v1 set object_version='fixture-exhaustion',manifest_sha256=repeat('d',64) where id=$1",[exhaustionJob]);
    assert.equal((await a.query('select knowledge_import_review.delegate_worker($1,$2,$3,$4) as ok',[org,exhaustionJob,workerName,new Date(Date.now()+600000)])).rows[0].ok,true);
    for(let attempt=1;attempt<=5;attempt++){
      const c=(await wclaim(worker,exhaustionJob)).rows[0];assert.equal(c.attempts,attempt);
      assert.equal((await workerFail(exhaustionJob,c,'storage_transient')).rows[0].status,attempt<5?'pending':'failed');
      if(attempt<5)await a.query("update knowledge_import_entries_v1 set available_at=now()-interval '1 second' where job_id=$1",[exhaustionJob]);
    }
    assert.equal((await a.query('select status from knowledge_import_jobs_v1 where id=$1',[exhaustionJob])).rows[0].status,'completed');
    assert.equal((await a.query('select status from knowledge_import_entries_v1 where job_id=$1',[exhaustionJob])).rows[0].status,'failed');
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
