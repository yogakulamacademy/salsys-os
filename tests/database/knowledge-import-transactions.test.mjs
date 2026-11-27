import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
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
    // The reservation row lock requires a fresh statement snapshot. Stronger isolation
    // must not accidentally admit two reservations against a stale count.
    for(const isolation of ['repeatable read','serializable']){
      await b.query('begin isolation level '+isolation);
      try{
        await assert.rejects(reserve(b,randomUUID(),100,upload,retain),e=>e.code==='25000'&&/requires read committed/.test(e.message));
      }finally{await b.query('rollback');}
    }
    assert.equal((await b.query('show transaction_isolation')).rows[0].transaction_isolation,'read committed');
    await assert.rejects(reserve(a,reserved,100,upload,retain,other),e=>e.code==='42501');
    assert.equal((await reserve(a,reserved,100,upload,retain)).rows[0].id,reserved);
    const uploadCheck=(db,o=org,j=reserved,bucket='knowledge-import-private-v1',path=org+'/'+reserved+'/source.json',bytes=100)=>db.query('select knowledge_import_review.upload_allowed($1,$2,$3,$4,$5) as ok',[o,j,bucket,path,bytes]);
    assert.equal((await uploadCheck(a)).rows[0].ok,true);
    // Disposable Storage-shaped table: deliberately broad existing policies must not bypass guards.
    await a.query("create schema storage; create table storage.objects(bucket_id text not null,name text not null,metadata jsonb,primary key(bucket_id,name)); alter table storage.objects enable row level security; grant usage on schema storage to authenticated,anon; grant select,insert,update,delete on storage.objects to authenticated,anon; create policy fixture_broad on storage.objects for all to authenticated,anon using(true) with check(true)");
    await a.query(readFileSync('docs/sql/knowledge-import-storage-policies-REVIEW-DRAFT.sql','utf8'));
    await a.query('grant usage on schema knowledge_import_review to authenticated; grant execute on function knowledge_import_review.storage_insert_allowed(text,text,jsonb) to authenticated');
    const storageBucket='knowledge-import-private-v1',storagePath=org+'/'+reserved+'/source.json',storageMeta={contentLength:100,mimetype:'application/json'};
    const insertStorage=(db,bucket,path,meta)=>db.query('insert into storage.objects values($1,$2,$3::jsonb)',[bucket,path,JSON.stringify(meta)]);
    await b.query('set role authenticated');
    await assert.rejects(insertStorage(b,storageBucket,other+'/'+reserved+'/source.json',storageMeta),e=>e.code==='42501');
    await assert.rejects(insertStorage(b,storageBucket,storagePath,{...storageMeta,contentLength:101}),e=>e.code==='42501');
    await assert.rejects(insertStorage(b,storageBucket,storagePath,{}),e=>e.code==='42501');
    await assert.rejects(insertStorage(b,storageBucket,storagePath,{size:100,mimetype:'application/json'}),e=>e.code==='42501');
    await assert.rejects(insertStorage(b,storageBucket,storagePath,{...storageMeta,contentLength:'100'}),e=>e.code==='42501');
    await assert.rejects(insertStorage(b,storageBucket,storagePath,{...storageMeta,size:101}),e=>e.code==='42501');
    await assert.rejects(insertStorage(b,storageBucket,storagePath,{...storageMeta,mimetype:'text/html'}),e=>e.code==='42501');

    await b.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({...JSON.parse(claims),is_anonymous:true})]);
    await assert.rejects(insertStorage(b,storageBucket,storagePath,storageMeta),e=>e.code==='42501');
    await b.query("select set_config('request.jwt.claims',$1,false)",[claims]);
    await insertStorage(b,storageBucket,storagePath,storageMeta);
    assert.equal((await b.query('select * from storage.objects where bucket_id=$1',[storageBucket])).rowCount,0);
    assert.equal((await b.query('update storage.objects set metadata=$1::jsonb where bucket_id=$2',[JSON.stringify({size:1}),storageBucket])).rowCount,0);
    assert.equal((await b.query('delete from storage.objects where bucket_id=$1',[storageBucket])).rowCount,0);
    await insertStorage(b,'unrelated-fixture','existing.txt',{});
    assert.equal((await b.query("select * from storage.objects where bucket_id='unrelated-fixture'")).rowCount,1);
    await assert.rejects(b.query('select * from public.knowledge_import_jobs_v1'),e=>e.code==='42501');
    await b.query('reset role');await b.query('set role anon');
    await assert.rejects(insertStorage(b,storageBucket,storagePath,storageMeta),e=>e.code==='42501');
    await b.query('reset role');
    // Revocation is checked using current membership, not cached role claims.
    await a.query('delete from storage.objects where bucket_id=$1',[storageBucket]);
    await a.query('update organization_members set active=false where organization_id=$1 and user_id=$2',[org,actor]);
    await b.query('set role authenticated');
    await assert.rejects(insertStorage(b,storageBucket,storagePath,storageMeta),e=>e.code==='42501');
    await b.query('reset role');
    await a.query('update organization_members set active=true where organization_id=$1 and user_id=$2',[org,actor]);

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
    // Only a narrow fixture grant: no direct tables or org-selectable history.
    await b.query('set role authenticated');
    await assert.rejects(b.query('select * from knowledge_import_review.current_history(1)'),e=>e.code==='42501');
    await b.query('reset role');
    await a.query('grant execute on function knowledge_import_review.current_history(integer,timestamptz,uuid) to authenticated');
    const currentHistory=(db,limit=1,ts=null,id=null)=>db.query('select * from knowledge_import_review.current_history($1,$2,$3)',[limit,ts,id]);
    await b.query('set role authenticated');
    const currentPage=(await currentHistory(b)).rows;
    assert.equal(currentPage[0].job_id,reserved);
    assert.match(currentPage[0].created_at,/\.\d{6}Z$/);
    assert.deepEqual(Object.keys(currentPage[0]).sort(),Object.keys(historyPage[0]).sort());
    assert.equal((await currentHistory(b,1,currentPage[0].created_at,reserved)).rows[0].job_id,job);
    await assert.rejects(b.query('select * from knowledge_import_review.history($1,1)',[org]),e=>e.code==='42501');
    await assert.rejects(b.query('select * from public.knowledge_import_entries_v1'),e=>e.code==='42501');
    await b.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({...JSON.parse(claims),is_anonymous:true})]);
    await assert.rejects(currentHistory(b),e=>e.code==='42501');
    await b.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({...JSON.parse(claims),session_id:randomUUID()})]);
    await assert.rejects(currentHistory(b),e=>e.code==='42501');
    await b.query("select set_config('request.jwt.claims',$1,false)",[claims]);
    await a.query('update organization_members set active=false where organization_id=$1 and user_id=$2',[org,actor]);
    await assert.rejects(currentHistory(b),e=>e.code==='42501');
    await a.query('update organization_members set active=true where organization_id=$1 and user_id=$2',[org,actor]);
    await b.query('reset role');


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
    const dueJobs=()=>worker.query('select * from knowledge_import_review.worker_due_jobs(25)');
    await assert.rejects(dueJobs(),e=>e.code==='42501');
    await a.query('grant execute on function knowledge_import_review.worker_due_jobs(integer) to '+workerName);
    assert.deepEqual((await dueJobs()).rows,[{organization_id:org,job_id:reserved}]);
    await assert.rejects(worker.query('select * from knowledge_import_review.worker_due_jobs(26)'),/invalid discovery limit/);

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
    assert.equal((await dueJobs()).rowCount,0);
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
    // Worker metadata/manifest checks use a canonical fixture manifest registered before delegation.
    const verifyJob=await seedJob(1);
    const verifyManifest=[{index:0,status:'pending',payload_sha256:pd}];
    await a.query("update knowledge_import_jobs_v1 set object_version='fixture-verified',manifest_sha256=encode(sha256(convert_to(($2::jsonb)::text,'UTF8')),'hex') where id=$1",[verifyJob,JSON.stringify(verifyManifest)]);
    assert.equal((await a.query('select knowledge_import_review.delegate_worker($1,$2,$3,$4) as ok',[org,verifyJob,workerName,new Date(Date.now()+600000)])).rows[0].ok,true);
    const sourceIdentity=(o=org)=>worker.query('select * from knowledge_import_review.worker_source_identity($1,$2)',[o,verifyJob]);
    const verify=(version='fixture-verified',bytes=100,digest='a'.repeat(64),manifest=verifyManifest)=>worker.query('select knowledge_import_review.worker_verify_manifest($1,$2,$3,$4,$5,$6::jsonb) as ok',[org,verifyJob,version,bytes,digest,JSON.stringify(manifest)]);
    await assert.rejects(sourceIdentity(),e=>e.code==='42501');
    await a.query('grant execute on function knowledge_import_review.worker_source_identity(uuid,uuid),knowledge_import_review.worker_verify_manifest(uuid,uuid,text,bigint,text,jsonb) to '+workerName);
    const sourceRow=(await sourceIdentity()).rows[0];
    assert.deepEqual(Object.keys(sourceRow).sort(),['object_path','object_version','byte_length','source_sha256','manifest_sha256'].sort());
    assert.equal(sourceRow.object_version,'fixture-verified');assert.equal(sourceRow.byte_length,'100');
    assert.equal((await verify()).rows[0].ok,true);
    const workerDigest=(o=org)=>worker.query('select * from knowledge_import_review.worker_digest_payloads($1,$2,$3::jsonb)',[o,verifyJob,JSON.stringify([payload])]);
    await assert.rejects(workerDigest(),e=>e.code==='42501');
    await a.query('grant execute on function knowledge_import_review.worker_digest_payloads(uuid,uuid,jsonb) to '+workerName);
    assert.equal((await workerDigest()).rows[0].payload_sha256,pd);
    await assert.rejects(workerDigest(other),e=>e.code==='42501');

    assert.equal((await verify('replacement')).rows[0].ok,false);
    assert.equal((await verify('fixture-verified',101)).rows[0].ok,false);
    assert.equal((await verify('fixture-verified',100,'f'.repeat(64))).rows[0].ok,false);
    assert.equal((await verify('fixture-verified',100,'a'.repeat(64),[{index:0,status:'invalid'}])).rows[0].ok,false);
    await assert.rejects(sourceIdentity(other),e=>e.code==='42501');
    await a.query('select knowledge_import_review.revoke_worker($1,$2)',[org,verifyJob]);
    await assert.rejects(sourceIdentity(),e=>e.code==='42501');

    await assert.rejects(workerFail(recoveryJob,rec,'db_transient'),/stale worker claim/);
    const committed=(await worker.query('select knowledge_import_review.worker_finalize($1,$2,$3,$4,$5,$6::jsonb) as id',[org,recoveryJob,rec2.entry_index,rec2.lease_token,rec2.attempts,JSON.stringify(payload)])).rows[0].id;
    assert.equal((await a.query('select status from knowledge_import_jobs_v1 where id=$1',[recoveryJob])).rows[0].status,'completed');
    assert.equal((await workerResult(recoveryJob,rec2)).rows[0].id,committed);
    assert.equal((await workerResult(recoveryJob,rec)).rows[0].id,null);
    assert.equal((await workerResult(recoveryJob,{...rec2,lease_token:randomUUID()})).rows[0].id,null);
    await assert.rejects(workerResult(recoveryJob,rec2,other),e=>e.code==='42501');
    assert.equal((await wclaim(worker,recoveryJob)).rowCount,0); // completed job: no new claims
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

    // Connected review flow: actual reservation, source preparation, canonical SQL, worker and rendered history.
    // Only Storage HTTP and Auth foundation are synthetic. Never contacts a hosted project.
    const require=createRequire(import.meta.url), {load}=require('../readiness/helpers.cjs');
    const uploadLib=load('lib/knowledge-import-upload-contract.ts');
    const prep=load('lib/knowledge-import-source-preparation.ts',{'server-only':{},'node:crypto':require('node:crypto'),'./knowledge-bulk-import-preflight':load('lib/knowledge-bulk-import-preflight.ts'),'./knowledge-import-upload-contract':uploadLib});
    const adapters=load('lib/knowledge-import-worker-adapters-review.ts',{'server-only':{},'./knowledge-import-source-preparation':prep,'./knowledge-import-upload-contract':uploadLib});
    const runner=load('lib/knowledge-import-worker-review.ts',{'server-only':{}});
    const historyLib=load('lib/knowledge-import-history-review.ts');
    const integrationJob=randomUUID(), scope={organizationId:org,jobId:integrationJob}, objectPath=org+'/'+integrationJob+'/source.json';
    const baseRow={title:'Integrated fixture',content:'Synthetic connected flow content',source_name:'Fixture',category:'faq',source_type:'manual'};
    const raw=Buffer.from(JSON.stringify({version:1,drafts:[baseRow,{...baseRow,title:'Second fixture'},{...baseRow,title:'Third fixture'},baseRow,null]}));
    const sourceHash=createHash('sha256').update(raw).digest('hex'), version='synthetic-immutable-integration';
    const uploadEnd=new Date(Date.now()+3600000), retentionEnd=new Date(Date.now()+7200000);
    await a.query('update knowledge_import_review.quotas set max_active_jobs=100,max_reserved_bytes=10485760 where organization_id=$1',[org]);
    assert.equal((await reserve(a,integrationJob,raw.length,uploadEnd,retentionEnd)).rows[0].id,integrationJob);
    const p=await prep.prepareKnowledgeImportSource({organizationId:org,actorId:actor,sessionId:session,active:true,canManage:true},
      {...scope,actorId:actor,sessionId:session,objectPath,declaredBytes:raw.length,expiresAtMs:uploadEnd.getTime()},
      {version,sha256:sourceHash},{bucket:'knowledge-import-private-v1',objectPath,version,contentType:'application/json',chunks:(async function*(){yield raw;})()},
      async payloads=>(await a.query('select * from knowledge_import_review.digest_payloads($1::jsonb)',[JSON.stringify(payloads)])).rows.map(x=>x.payload_sha256),Date.now);
    assert.equal(p.ok,true);
    const register=(v)=>a.query('select knowledge_import_review.register_verified_source($1,$2,$3,$4,$5,$6::jsonb) as status',[org,integrationJob,v,raw.length,sourceHash,JSON.stringify(p.manifest)]);
    assert.equal((await register(version)).rows[0].status,'queued');
    assert.equal((await register(version)).rows[0].status,'queued');
    await assert.rejects(register('changed-version'),/object version conflict/);
    assert.equal((await a.query('select knowledge_import_review.delegate_worker($1,$2,$3,$4) as ok',[org,integrationJob,workerName,new Date(Date.now()+600000)])).rows[0].ok,true);
    // Demonstrate processing after the upload window is closed.
    await a.query("update knowledge_import_jobs_v1 set created_at=now()-interval '2 hours',upload_expires_at=now()-interval '1 hour' where id=$1",[integrationJob]);
    let downloads=0, finalizeCalls=0;
    const origin='https://fixture.supabase.co', signed=origin+'/storage/v1/object/sign/knowledge-import-private-v1/'+objectPath+'?token=synthetic';
    const realQuery=async(statement,params)=>{
      const result=await worker.query(statement,params);
      if(statement.includes('worker_finalize')&&++finalizeCalls===1)throw Error('synthetic lost response after commit');
      return result;
    };
    const adapter=adapters.createKnowledgeWorkerReviewAdapters(realQuery,origin,async()=>signed,async()=>{
      downloads++;return new Response(raw,{headers:{'content-type':'application/json','content-length':String(raw.length)}});
    });
    const scheduler=load('lib/knowledge-import-scheduler-review.ts',{'server-only':{},'./knowledge-import-worker-review':runner});
    const tick=await scheduler.runKnowledgeImportSchedulerReview(realQuery,adapter,{jobs:1,batchSize:1,batches:4});
    assert.equal(tick.stop,'complete');assert.equal(tick.reports.length,1);assert.deepEqual(tick.reports[0].scope,scope);
    const report=tick.reports[0].report;
    assert.deepEqual([report.created,report.recovered,report.claimed,report.stop,downloads,finalizeCalls],[2,1,3,'batch_complete',1,3]);
    const actual=(await a.query("select h.*,h.created_at::text as created_at from knowledge_import_review.history($1,25) h",[org])).rows;
    const normalized=historyLib.projectKnowledgeImportHistory(actual);
    assert.ok(normalized);
    const summary=normalized.find(x=>x.id===integrationJob);
    assert.deepEqual([summary.status,summary.total,summary.percent,summary.counts.created,summary.counts.duplicate,summary.counts.invalid],['completed',5,100,3,1,1]);
    assert.equal((await a.query("select count(*)::int as n from knowledge_documents where metadata->>'import_job_id'=$1 and status='draft' and created_by=$2",[integrationJob,actor])).rows[0].n,3);
    // Render actual React component using authorized fixture rows. No browser or hosted route.
    const ts=require('typescript'), React=require('react'), {renderToStaticMarkup}=require('react-dom/server');
    const componentCode=ts.transpileModule(readFileSync('components/knowledge-import-centre-review.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    const componentExports={};
    new Function('require','exports',componentCode)(name=>{
      if(name==='react/jsx-runtime')return require(name);
      if(name==='@/lib/knowledge-import-history-review')return historyLib;
      if(name.endsWith('.module.css'))return {__esModule:true,default:{}};
      throw Error('unexpected component dependency');
    },componentExports);
    const html=renderToStaticMarkup(React.createElement(componentExports.KnowledgeImportCentreReview,{rows:actual}));
    assert.match(html,/Knowledge Import Centre/);assert.match(html,/5 of 5 processed/);assert.match(html,/disabled/);
    assert.ok(!html.includes(objectPath)&&!html.includes('token=synthetic')&&!html.includes(baseRow.content));
    await a.query('update organization_members set active=false where organization_id=$1 and user_id=$2',[org,actor]);
    await assert.rejects(a.query('select * from knowledge_import_review.history($1,25)',[org]),e=>e.code==='42501');
    await a.query('update organization_members set active=true where organization_id=$1 and user_id=$2',[org,actor]);

    // Cleanup remains privileged review-only; external receipt is synthetic, not actual deletion.
    const beginCleanup=(db,j,o=org)=>db.query('select knowledge_import_review.begin_storage_cleanup($1,$2) as id',[o,j]);
    const completeCleanup=(db,id,ver=version,evidence='e'.repeat(64),o=org)=>db.query('select knowledge_import_review.complete_storage_cleanup($1,$2,$3,$4,$5,$6,$7) as ok',[o,integrationJob,id,objectPath,ver,sourceHash,evidence]);
    await assert.rejects(beginCleanup(worker,integrationJob),e=>e.code==='42501');
    await assert.rejects(beginCleanup(a,integrationJob),/cleanup not eligible/);
    await assert.rejects(beginCleanup(a,expJob),/cleanup not eligible/); // unversioned reservation stays charged
    await a.query("update knowledge_import_jobs_v1 set created_at=now()-interval '3 hours',upload_expires_at=now()-interval '2 hours',retention_expires_at=now()-interval '1 hour' where id=$1",[integrationJob]);
    await assert.rejects(beginCleanup(a,integrationJob,other),/cleanup not eligible/);
    const cleanupId=(await beginCleanup(a,integrationJob)).rows[0].id;
    assert.equal((await beginCleanup(b,integrationJob)).rows[0].id,cleanupId);
    const charged=Number((await a.query('select sum(declared_bytes) filter(where storage_released_at is null) as n from knowledge_import_jobs_v1 where organization_id=$1',[org])).rows[0].n);
    await a.query('update knowledge_import_review.quotas set max_reserved_bytes=$2 where organization_id=$1',[org,charged]);
    await assert.rejects(reserve(a,randomUUID(),1,uploadEnd,retentionEnd),/quota exceeded/);
    await assert.rejects(completeCleanup(worker,cleanupId),e=>e.code==='42501');
    await assert.rejects(completeCleanup(a,randomUUID()),/cleanup evidence mismatch/);
    await assert.rejects(completeCleanup(a,cleanupId,'different-version'),/cleanup evidence mismatch/);
    await assert.rejects(completeCleanup(a,cleanupId,version,'bad'),/cleanup evidence mismatch/);
    assert.equal((await a.query('select storage_released_at from knowledge_import_jobs_v1 where id=$1',[integrationJob])).rows[0].storage_released_at,null);
    // Inject a failure after receipt write: quota release and receipt must roll back together.
    await a.query("create function fixture_cleanup_abort() returns trigger language plpgsql as $$ begin if new.storage_released_at is not null then raise exception 'fixture cleanup abort';end if;return new;end $$;create trigger fixture_cleanup_abort before update on knowledge_import_jobs_v1 for each row execute function fixture_cleanup_abort()");
    await assert.rejects(completeCleanup(a,cleanupId),/fixture cleanup abort/);
    assert.equal((await a.query('select completed_at from knowledge_import_review.storage_cleanup where job_id=$1',[integrationJob])).rows[0].completed_at,null);
    await a.query('drop trigger fixture_cleanup_abort on knowledge_import_jobs_v1');
    const clean=await Promise.all([completeCleanup(a,cleanupId),completeCleanup(b,cleanupId)]);
    assert.deepEqual(clean.map(x=>x.rows[0].ok),[true,true]);
    await assert.rejects(completeCleanup(a,cleanupId,version,'f'.repeat(64)),/cleanup receipt conflict/);
    assert.equal(Number((await a.query('select sum(declared_bytes) filter(where storage_released_at is null) as n from knowledge_import_jobs_v1 where organization_id=$1',[org])).rows[0].n),charged-raw.length);
    const newJob=randomUUID();
    assert.equal((await reserve(a,newJob,raw.length,uploadEnd,retentionEnd)).rows[0].id,newJob);
    await assert.rejects(reserve(b,randomUUID(),1,uploadEnd,retentionEnd),/quota exceeded/);
    assert.equal((await a.query("select count(*)::int as n from knowledge_documents where metadata->>'import_job_id'=$1 and status='draft'",[integrationJob])).rows[0].n,3);
    assert.equal((await a.query('select count(*)::int as n from knowledge_import_entries_v1 where job_id=$1',[integrationJob])).rows[0].n,5);
    await a.query('update knowledge_import_review.quotas set max_reserved_bytes=10485760 where organization_id=$1',[org]);

    // Real PostgreSQL durable chunk stage: 1 MiB + tail, retry, takeover, fencing.
    await a.query(readFileSync('docs/sql/knowledge-import-gateway-staging-REVIEW-DRAFT.sql','utf8'));
    const chunkJob=randomUUID(), chunkToken=randomUUID(), secondToken=randomUUID();
    const firstChunk=Buffer.alloc(1048576,32), tail=Buffer.from('synthetic tail'), chunkBytes=firstChunk.length+tail.length;
    await reserve(a,chunkJob,chunkBytes,uploadEnd,retentionEnd);
    const acquire=(conn,j=chunkJob,token=chunkToken,o=org)=>conn.query('select * from knowledge_import_review.gateway_acquire($1,$2,$3)',[o,j,token]);
    const append=(conn,j,token,g,offset,bytes)=>conn.query('select knowledge_import_review.gateway_append($1,$2,$3,$4,$5,$6) as n',[org,j,token,g,offset,bytes]);
    const beginPub=(conn,j,token,g)=>conn.query('select knowledge_import_review.gateway_begin_publication($1,$2,$3,$4) as bytes',[org,j,token,g]);
    await assert.rejects(acquire(worker),e=>e.code==='42501');
    await assert.rejects(acquire(a,chunkJob,chunkToken,other),e=>e.code==='42501');
    const firstWriter=(await acquire(a)).rows[0];
    assert.equal(firstWriter.generation,'1');assert.equal(firstWriter.received_bytes,'0');
    await assert.rejects(acquire(b,chunkJob,secondToken),/writer busy/);
    await assert.rejects(append(a,chunkJob,chunkToken,1,1048576,tail),/offset mismatch/);
    await assert.rejects(append(a,chunkJob,chunkToken,1,0,tail),/invalid gateway chunk/);
    assert.equal((await append(a,chunkJob,chunkToken,1,0,firstChunk)).rows[0].n,'1048576');
    assert.equal((await append(b,chunkJob,chunkToken,1,0,firstChunk)).rows[0].n,'1048576');
    await assert.rejects(append(b,chunkJob,chunkToken,1,0,Buffer.alloc(1048576,33)),/chunk conflict/);
    assert.equal((await acquire(b)).rows[0].received_bytes,'1048576');
    await assert.rejects(beginPub(a,chunkJob,chunkToken,1),/source incomplete/);
    await a.query("update knowledge_import_review.gateway_uploads set writer_until=now()-interval '1 second' where job_id=$1",[chunkJob]);
    const takeover=(await acquire(b,chunkJob,secondToken)).rows[0];assert.equal(takeover.generation,'2');assert.equal(takeover.received_bytes,'1048576');
    await assert.rejects(append(a,chunkJob,chunkToken,1,1048576,tail),/stale gateway writer/);
    assert.equal((await append(b,chunkJob,secondToken,2,1048576,tail)).rows[0].n,String(chunkBytes));
    assert.deepEqual((await beginPub(b,chunkJob,secondToken,2)).rows[0].bytes,Buffer.concat([firstChunk,tail]));
    await assert.rejects(beginPub(a,chunkJob,secondToken,2),/stale gateway writer/);
    await assert.rejects(acquire(a,chunkJob,secondToken),/publication already started/);
    assert.equal((await a.query('select knowledge_import_review.cancel($1,$2) as ok',[org,chunkJob])).rows[0].ok,true);
    await assert.rejects(a.query('select knowledge_import_review.gateway_register($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',[org,chunkJob,secondToken,2,'fixture',chunkBytes,createHash('sha256').update(Buffer.concat([firstChunk,tail])).digest('hex'),JSON.stringify(manifest)]),/stale gateway writer/);
    assert.equal((await a.query('select status from knowledge_import_jobs_v1 where id=$1',[chunkJob])).rows[0].status,'cancelled');
    const publishJob=randomUUID(), publishToken=randomUUID();
    await reserve(a,publishJob,raw.length,uploadEnd,retentionEnd);
    await acquire(a,publishJob,publishToken);
    await append(a,publishJob,publishToken,1,0,raw);
    assert.deepEqual((await beginPub(a,publishJob,publishToken,1)).rows[0].bytes,raw);
    const stagedRegister=(sha)=>a.query('select knowledge_import_review.gateway_register($1,$2,$3,$4,$5,$6,$7,$8::jsonb) as status',[org,publishJob,publishToken,1,version,raw.length,sha,JSON.stringify(p.manifest)]);
    await assert.rejects(stagedRegister('f'.repeat(64)),/gateway source mismatch/);
    assert.equal((await stagedRegister(sourceHash)).rows[0].status,'queued');
    assert.equal((await a.query('select count(*)::int as n from knowledge_import_review.gateway_chunks where job_id=$1',[publishJob])).rows[0].n,0);
    assert.equal((await a.query('select phase from knowledge_import_review.gateway_uploads where job_id=$1',[publishJob])).rows[0].phase,'registered');
    const publicationReceipt=(conn,j=publishJob,token=publishToken,g=1,o=org)=>conn.query('select * from knowledge_import_review.gateway_publication_receipt($1,$2,$3,$4)',[o,j,token,g]);
    assert.deepEqual((await publicationReceipt(b)).rows,[{state:'registered',job_status:'queued'}]);
    await assert.rejects(publicationReceipt(b,publishJob,randomUUID()),e=>e.code==='42501');
    await assert.rejects(publicationReceipt(b,publishJob,publishToken,2),e=>e.code==='42501');
    await assert.rejects(publicationReceipt(b,publishJob,publishToken,1,other),e=>e.code==='42501');
    await assert.rejects(publicationReceipt(worker),e=>e.code==='42501');
    assert.deepEqual((await publicationReceipt(b,chunkJob,secondToken,2)).rows,[{state:'reconciliation_required',job_status:'cancelled'}]);
    await a.query("update knowledge_import_review.gateway_uploads set writer_until=now()-interval '1 second' where job_id=$1",[publishJob]);
    assert.equal((await publicationReceipt(b)).rows[0].state,'registered');
    await a.query('update organization_members set active=false where organization_id=$1 and user_id=$2',[org,actor]);
    await assert.rejects(publicationReceipt(b),e=>e.code==='42501');
    await a.query('update organization_members set active=true where organization_id=$1 and user_id=$2',[org,actor]);

    await assert.rejects(worker.query('select * from knowledge_import_review.gateway_chunks'),e=>e.code==='42501');
    // Purge never releases quota or deletes publishing/registered source records.
    const purge=(conn,j,o=org)=>conn.query('select knowledge_import_review.gateway_purge_receiving($1,$2) as n',[o,j]);
    const abandoned=randomUUID(), abandonToken=randomUUID();
    await reserve(a,abandoned,chunkBytes,uploadEnd,retentionEnd);
    await acquire(a,abandoned,abandonToken);
    await append(a,abandoned,abandonToken,1,0,firstChunk);
    await assert.rejects(purge(a,abandoned),/purge not eligible/);
    await assert.rejects(purge(worker,abandoned),e=>e.code==='42501');
    await assert.rejects(purge(a,abandoned,other),/purge not eligible/);
    assert.equal((await a.query('select knowledge_import_review.cancel($1,$2) as ok',[org,abandoned])).rows[0].ok,true);
    await assert.rejects(purge(a,abandoned),/purge not eligible/);
    await a.query("update knowledge_import_jobs_v1 set created_at=now()-interval '3 hours',upload_expires_at=now()-interval '2 hours',retention_expires_at=now()-interval '1 hour' where id in ($1,$2)",[abandoned,chunkJob]);
    await assert.rejects(a.query('update knowledge_import_jobs_v1 set storage_released_at=now() where id=$1',[abandoned]),/gateway cleanup incomplete/);
    await assert.rejects(purge(a,chunkJob),/publication reconciliation required/);
    await assert.rejects(a.query('update knowledge_import_jobs_v1 set storage_released_at=now() where id=$1',[chunkJob]),/gateway cleanup incomplete/);
    // Fail closed on inconsistent staged byte accounting. Fixture-only corruption.
    await a.query('update knowledge_import_review.gateway_uploads set received_bytes=received_bytes-1 where job_id=$1',[abandoned]);
    await assert.rejects(purge(a,abandoned),/staged byte count conflict/);
    await a.query('update knowledge_import_review.gateway_uploads set received_bytes=received_bytes+1 where job_id=$1',[abandoned]);
    const receipt=()=>a.query('select generation,removed_bytes,purged_at from knowledge_import_review.gateway_receiving_purges where organization_id=$1 and job_id=$2',[org,abandoned]);
    assert.equal((await receipt()).rowCount,0);
    await a.query('begin');
    assert.equal((await purge(a,abandoned)).rows[0].n,'1048576');
    assert.equal((await receipt()).rowCount,1);
    await a.query('rollback');
    assert.equal((await receipt()).rowCount,0);
    assert.equal((await a.query('select count(*)::int as n from knowledge_import_review.gateway_chunks where job_id=$1',[abandoned])).rows[0].n,1);
    assert.equal((await purge(a,abandoned)).rows[0].n,'1048576');
    const recorded=(await receipt()).rows[0];
    assert.equal(recorded.generation,'1');assert.equal(recorded.removed_bytes,'1048576');assert.ok(recorded.purged_at instanceof Date);
    assert.equal((await purge(b,abandoned)).rows[0].n,'0');
    assert.deepEqual((await receipt()).rows,[recorded]);
    await assert.rejects(worker.query('select * from knowledge_import_review.gateway_receiving_purges'),e=>e.code==='42501');
    assert.equal((await a.query('select storage_released_at from knowledge_import_jobs_v1 where id=$1',[abandoned])).rows[0].storage_released_at,null);
    assert.equal((await a.query('select count(*)::int as n from knowledge_import_review.gateway_chunks where job_id=$1',[abandoned])).rows[0].n,0);

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
