import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createClient} from '@supabase/supabase-js';
import pg from 'pg';

import {FIXTURE_API_ORIGIN,validateFixtureStatus,fixtureApiUrl,createFixtureFetch} from './knowledge-import-provider-transport.mjs';

// Safety boundary: fixed disposable local endpoints, not a configurable remote project.
const bucket='knowledge-import-private-v1';
const fixtureFetch=createFixtureFetch();
const fixtureSql=`
create table public.organizations(id uuid primary key,status text not null);
create table public.organization_members(organization_id uuid,user_id uuid,active boolean,role text,primary key(organization_id,user_id));
create table public.tenant_session_bindings(session_id uuid primary key,user_id uuid,organization_id uuid);
create function public.is_crm_user() returns boolean language sql stable as $$ select auth.uid() is not null $$;
create function public.is_organization_member(uuid) returns boolean language sql stable as $$ select exists(select 1 from public.organization_members m where m.organization_id=$1 and m.user_id=auth.uid() and m.active) $$;
create function public.can_manage_organization(uuid) returns boolean language sql stable as $$ select exists(select 1 from public.organization_members m where m.organization_id=$1 and m.user_id=auth.uid() and m.active and m.role in ('admin','owner')) $$;
create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now();return new;end $$;
`;
const digest=b=>createHash('sha256').update(b).digest('hex');
const denied=r=>assert.ok([400,401,403,404,409,410,413,422,423].includes(r.status),'expected denial, got '+r.status);
const reviewMode=process.env.SALSYS_STORAGE_REVIEW_MODE;
test('actual disposable Supabase Storage authorization and lifecycle: '+reviewMode,{timeout:600000},async t=>{
  assert.equal(process.env.SALSYS_ALLOW_DISPOSABLE_STORAGE_TEST,'1');
  assert.ok(['gateway-only','rejected-direct-tus'].includes(reviewMode),'explicit disposable architecture mode required');
  const status=JSON.parse(readFileSync(process.env.SALSYS_LOCAL_STORAGE_STATUS_FILE,'utf8'));
  const dbUrl=validateFixtureStatus(status);
  const api=new URL(FIXTURE_API_ORIGIN);
  const anon=status.ANON_KEY||status.PUBLISHABLE_KEY, service=status.SERVICE_ROLE_KEY||status.SECRET_KEY;
  assert.ok(typeof anon==='string'&&anon.length>10&&typeof service==='string'&&service.length>10,'local stack credentials missing');
  const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:fixtureFetch}};
  const admin=createClient(api.origin,service,options);
  const db=new pg.Client({connectionString:dbUrl.href});await db.connect();
  try{
    // Refuse any existing application schema or bucket before touching the database.
    assert.equal((await db.query("select to_regclass('public.organizations') is null as fresh")).rows[0].fresh,true);
    assert.equal((await db.query('select count(*)::int as n from storage.buckets where id=$1',[bucket])).rows[0].n,0);
    await db.query(fixtureSql);
    for(const file of ['supabase/migrations/20261016171500_organization_knowledge_v1.sql','supabase/migrations/20261103190000_ai_knowledge_provenance_readiness_v2.sql','docs/sql/knowledge-import-ledger-v1-REVIEW-DRAFT.sql','docs/sql/knowledge-import-transactions-REVIEW-DRAFT.sql','docs/sql/knowledge-import-storage-policies-REVIEW-DRAFT.sql']){
      await db.query(readFileSync(file,'utf8'));
    }
    if(reviewMode==='rejected-direct-tus'){
      await db.query('grant usage on schema knowledge_import_review to authenticated;grant execute on function knowledge_import_review.storage_insert_allowed(text,text,jsonb) to authenticated');
    }else{
      // Install the deny policy before the fresh bucket exists; never create any
      // direct-TUS upload session or grant the permissive predicate in this mode.
      await db.query(readFileSync('docs/sql/knowledge-import-gateway-only-REVIEW-DRAFT.sql','utf8'));
      assert.equal((await db.query("select has_function_privilege('authenticated','knowledge_import_review.storage_insert_allowed(text,text,jsonb)','EXECUTE') as allowed")).rows[0].allowed,false);
      assert.equal((await db.query("select count(*)::int as n from pg_policies where schemaname='storage' and tablename='objects' and policyname in ('kb_import_review_insert','kb_import_review_insert_guard')")).rows[0].n,0);
      assert.equal((await db.query("select count(*)::int as n from pg_policies where schemaname='storage' and tablename='objects' and policyname='kb_import_review_gateway_insert_guard'")).rows[0].n,1);
    }
    const made=await admin.storage.createBucket(bucket,{public:false,fileSizeLimit:50*1024*1024,allowedMimeTypes:['application/json']});
    assert.equal(Boolean(made.error),false,'local bucket creation failed');
    const org=randomUUID(), other=randomUUID();
    await db.query("insert into public.organizations values($1,'active'),($2,'active')",[org,other]);
    const users=[];
    for(const tenant of [org,other]){
      const email='kb-fixture-'+randomUUID()+'@example.test', password='Fixture-'+randomUUID()+'Aa!';
      const created=await admin.auth.admin.createUser({email,password,email_confirm:true});
      assert.equal(Boolean(created.error),false,'local user creation failed');
      const client=createClient(api.origin,anon,options), login=await client.auth.signInWithPassword({email,password});
      assert.equal(Boolean(login.error),false,'local sign-in failed');
      const token=login.data.session.access_token, claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());
      const actor=login.data.user.id, sid=claims.session_id;
      assert.equal((await db.query('select count(*)::int as n from auth.sessions where id=$1 and user_id=$2',[sid,actor])).rows[0].n,1);
      await db.query("insert into public.organization_members values($1,$2,true,'admin')",[tenant,actor]);
      await db.query('insert into public.tenant_session_bindings values($1,$2,$3)',[sid,actor,tenant]);
      users.push({tenant,token,claims,actor});
    }
    const [owner, outsider]=users;
    await db.query('insert into knowledge_import_review.quotas values($1,25,104857600)',[org]);
    const bytes=Buffer.from(JSON.stringify({version:1,drafts:[{title:'Fixture',content:'Synthetic provider content',source_name:'Fixture'}]}));
    const createJob=async(length=bytes.length)=>{
      const id=randomUUID(), path=org+'/'+id+'/source.json';
      await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(owner.claims)]);
      await db.query('select knowledge_import_review.reserve($1,$2,$3,$4,$5)',[org,id,length,new Date(Date.now()+600000),new Date(Date.now()+1200000)]);
      return {id,path,length};
    };
    const endpoint=api.origin+'/storage/v1/upload/resumable';
    const request=async(method,url,user,headers={},body)=>{
      const parsed=fixtureApiUrl(url);
      assert.ok(parsed.pathname==='/storage/v1/upload/resumable'||parsed.pathname.startsWith('/storage/v1/upload/resumable/'));
      return fixtureFetch(parsed,{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{apikey:anon,'Tus-Resumable':'1.0.0',...(user?{Authorization:'Bearer '+user.token}:{}),...headers},body});
    };
    const meta=(path)=>Object.entries({bucketName:bucket,objectName:path,contentType:'application/json',cacheControl:'0'}).map(([k,v])=>k+' '+Buffer.from(v).toString('base64')).join(',');
    const start=(job,user=owner,length=job.length)=>request('POST',endpoint,user,{'Upload-Length':String(length),'Upload-Metadata':meta(job.path)});
    const location=r=>{
      assert.ok([200,201].includes(r.status),'TUS creation failed: '+r.status);
      const value=r.headers.get('location');assert.ok(value,'TUS location missing');
      const u=fixtureApiUrl(new URL(value,endpoint).href);
      assert.ok(u.pathname.startsWith('/storage/v1/upload/resumable/'));return u.href;
    };
    const patch=(url,data,offset=0,user=owner)=>request('PATCH',url,user,{'Upload-Offset':String(offset),'Content-Type':'application/offset+octet-stream'},data);
    const read=async job=>{
      const r=await admin.storage.from(bucket).download(job.path);
      return r.error?null:Buffer.from(await r.data.arrayBuffer());
    };
    if(reviewMode==='rejected-direct-tus'){
    // Preserve all original direct-TUS assertions, including the known failing
    // cross-tenant HEAD denial. This mode never runs gateway acceptance.
    await t.test('real JWT: reserved upload, content identity and private read denial',async()=>{
      const j=await createJob();
      denied(await start(j,outsider));denied(await start(j,owner,j.length+1));
      const u=location(await start(j));const finished=await patch(u,bytes);
      assert.ok([200,204].includes(finished.status),'authorized upload completion failed: '+finished.status);
      const saved=await read(j);assert.ok(saved);assert.equal(digest(saved),digest(bytes));
      const version=(await db.query('select version from storage.objects where bucket_id=$1 and name=$2',[bucket,j.path])).rows[0]?.version;
      assert.ok(typeof version==='string'&&version.length>0,'provider version unavailable');
      const direct=await fixtureFetch(api.origin+'/storage/v1/object/'+bucket+'/'+j.path,{redirect:'error',headers:{apikey:anon,Authorization:'Bearer '+owner.token},signal:AbortSignal.timeout(20000)});
      denied(direct);
      denied(await start(j));
      // Delete through actual Storage API, then check absence. Not a quota release or proof of TUS quiescence.
      const removed=await admin.storage.from(bucket).remove([j.path]);assert.equal(Boolean(removed.error),false);
      assert.equal((await db.query('select count(*)::int as n from storage.objects where bucket_id=$1 and name=$2',[bucket,j.path])).rows[0].n,0);
      assert.equal(await read(j),null);
    });
    await t.test('expired reservation rejects fresh upload',async()=>{
      const j=await createJob();
      await db.query("update knowledge_import_jobs_v1 set created_at=now()-interval '2 hours',upload_expires_at=now()-interval '1 hour' where id=$1",[j.id]);
      denied(await start(j));assert.equal(await read(j),null);
    });
    await t.test('cross-tenant and revoked membership cannot resume or inspect an existing upload',async()=>{
      const j=await createJob(),u=location(await start(j));
      const cross=await request('HEAD',u,outsider);
      t.diagnostic('direct TUS cross-tenant HEAD status='+cross.status);
      await db.query('update public.organization_members set active=false where organization_id=$1 and user_id=$2',[org,owner.actor]);
      try{
        const head=await request('HEAD',u,owner), final=await patch(u,bytes), present=Boolean(await read(j));
        t.diagnostic(JSON.stringify({directRevokedHead:head.status,directRevokedPatch:final.status,objectPresent:present}));
        denied(cross);denied(head);denied(final);assert.equal(present,false);
      }finally{await db.query('update public.organization_members set active=true where organization_id=$1 and user_id=$2',[org,owner.actor]);}
    });
    await t.test('cancellation before final chunk prevents publication',async()=>{
      const j=await createJob(),u=location(await start(j));
      assert.equal((await db.query('select knowledge_import_review.cancel($1,$2) as ok',[org,j.id])).rows[0].ok,true);
      const final=await patch(u,bytes),present=Boolean(await read(j));
      t.diagnostic(JSON.stringify({directCancelledPatch:final.status,objectPresent:present}));
      denied(final);assert.equal(present,false);
    });
    await t.test('concurrent resumable sessions cannot replace an existing object',async()=>{
      const j=await createJob(),first=location(await start(j)), second=await start(j);
      const r=await patch(first,bytes);assert.ok([200,204].includes(r.status),'first upload did not complete');
      const original=await read(j);assert.ok(original);assert.equal(digest(original),digest(bytes));
      if([200,201].includes(second.status)){
        const u2=location(second),modified=Buffer.from(bytes);modified[modified.length-2]=32;
        denied(await patch(u2,modified));
      }else denied(second);
      const saved=await read(j);assert.ok(saved);assert.equal(digest(saved),digest(bytes));
    });
    await t.test('cancelled abandoned upload cannot be completed after cleanup attempt',async()=>{
      const j=await createJob(),u=location(await start(j));
      assert.equal((await db.query('select knowledge_import_review.cancel($1,$2) as ok',[org,j.id])).rows[0].ok,true);
      const deletion=await request('DELETE',u,owner);
      assert.ok([200,204,400,401,403,404,405,410].includes(deletion.status),'unexpected abort response');
      denied(await patch(u,bytes));assert.equal(await read(j),null);
      // Provider part-store absence is not established by object-table absence.
    });

    return;
    }
    // Independent gateway-only test. No rejected direct-TUS upload sessions exist.
    assert.equal((await db.query('select count(*)::int as n from storage.objects where bucket_id=$1',[bucket])).rows[0].n,0);
    assert.equal((await db.query('select count(*)::int as n from public.knowledge_import_jobs_v1')).rows[0].n,0);
    await db.query(readFileSync('docs/sql/knowledge-import-gateway-staging-REVIEW-DRAFT.sql','utf8'));
    await db.query(readFileSync('docs/sql/knowledge-import-application-boundary-REVIEW-DRAFT.sql','utf8'));
    await db.query(readFileSync('docs/sql/knowledge-import-application-broker-REVIEW-DRAFT.sql','utf8'));
    await db.query(readFileSync('docs/sql/knowledge-import-reconciliation-REVIEW-DRAFT.sql','utf8'));
    const require=createRequire(import.meta.url),{load}=require('../readiness/helpers.cjs');
    const upload=load('lib/knowledge-import-upload-contract.ts');
    const prep=load('lib/knowledge-import-source-preparation.ts',{'server-only':{},'node:crypto':require('node:crypto'),'./knowledge-bulk-import-preflight':load('lib/knowledge-bulk-import-preflight.ts'),'./knowledge-import-upload-contract':upload});
    const gateway=load('lib/knowledge-import-gateway-review.ts',{'server-only':{},'node:crypto':require('node:crypto'),'./knowledge-import-source-preparation':prep,'./knowledge-import-upload-contract':upload});
    // Local-only streaming observation: read the actual object over a guarded, exact-path
    // signed GET, independently observe version before/after, and never send admin credentials.
    // This does not establish immutable-version semantics for a hosted provider.
    const observeStream=async(job,path)=>{
      assert.equal(path,job.path);
      const current=async()=> (await db.query('select version from storage.objects where bucket_id=$1 and name=$2',[bucket,path])).rows[0]?.version;
      const version=await current();if(!version)throw Error('object absent');
      const chunks=(async function*(){
        const signed=await admin.storage.from(bucket).createSignedUrl(path,30);
        if(signed.error)throw Error('signed read unavailable');
        const url=fixtureApiUrl(signed.data.signedUrl);
        assert.equal(url.pathname,'/storage/v1/object/sign/'+bucket+'/'+path);
        assert.deepEqual([...url.searchParams.keys()],['token']);assert.ok(url.searchParams.get('token'));
        const response=await fixtureFetch(url,{method:'GET',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(60000)});
        if(response.status!==200||!response.body||response.headers.get('content-type')?.split(';')[0]!=='application/json'){
          await response.body?.cancel().catch(()=>{});throw Error('source response rejected');
        }
        const reader=response.body.getReader();let n=0;
        try{
          while(true){const item=await reader.read();if(item.done)break;n+=item.value.byteLength;if(n>job.length)throw Error('source too large');yield item.value;}
          if(n!==job.length||await current()!==version)throw Error('source identity changed');
        }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
      })();
      return {version,chunks};
    };
    const makeAdapter=(job,afterPut=async()=>{},writer=null)=>({
      async reservation(scope){
        const result=await db.query("select j.organization_id,j.id,j.requested_by,j.request_session_id,j.object_path,j.declared_bytes,j.upload_expires_at,j.status from knowledge_import_review.lock_job($1,$2) j",[scope.organizationId,scope.jobId]);
        const j=result.rows[0];if(j.status!=='awaiting_upload')throw Error('not awaiting upload');
        return {context:{organizationId:j.organization_id,actorId:j.requested_by,sessionId:j.request_session_id,active:true,canManage:true},reservation:{organizationId:j.organization_id,actorId:j.requested_by,sessionId:j.request_session_id,jobId:j.id,objectPath:j.object_path,declaredBytes:Number(j.declared_bytes),expiresAtMs:j.upload_expires_at.getTime()}};
      },
      async put(path,body){
        const result=await admin.storage.from(bucket).upload(path,body,{contentType:'application/json',upsert:false,cacheControl:'0'});
        if(result.error)throw Error('provider write not confirmed');
        await afterPut();
      },
      async inspect(path){return observeStream(job,path);},
      async digests(payloads){return (await db.query('select * from knowledge_import_review.digest_payloads($1::jsonb)',[JSON.stringify(payloads)])).rows.map(r=>r.payload_sha256);},
      async register(scope,p){return writer?(await db.query('select knowledge_import_review.gateway_register($1,$2,$3,$4,$5,$6,$7,$8::jsonb) as status',[scope.organizationId,scope.jobId,writer,1,p.objectVersion,p.byteLength,p.sha256,JSON.stringify(p.manifest)])).rows[0].status:(await db.query('select knowledge_import_review.register_verified_source($1,$2,$3,$4,$5,$6::jsonb) as status',[scope.organizationId,scope.jobId,p.objectVersion,p.byteLength,p.sha256,JSON.stringify(p.manifest)])).rows[0].status;}
    });
    await t.test('gateway-only policy denies new direct TUS and ordinary client upload',async()=>{
      const j=await createJob();denied(await start(j));denied(await start(j,outsider));denied(await start(j,null));
      assert.equal((await db.query("select has_function_privilege('authenticated','knowledge_import_review.storage_insert_allowed(text,text,jsonb)','EXECUTE') as allowed")).rows[0].allowed,false);
      const direct=await fixtureFetch(api.origin+'/storage/v1/object/'+bucket+'/'+j.path,{method:'POST',headers:{apikey:anon,Authorization:'Bearer '+owner.token,'Content-Type':'application/json'},body:bytes,redirect:'error',signal:AbortSignal.timeout(20000)});
      denied(direct);assert.equal(await read(j),null);
    });
    await t.test('server-mediated create-only publication verifies bytes and registers exact provider version',async()=>{
      const j=await createJob(),scope={organizationId:org,jobId:j.id};
      const writer=randomUUID();
      await db.query('select * from knowledge_import_review.gateway_acquire($1,$2,$3)',[org,j.id,writer]);
      const chunk=()=>db.query('select knowledge_import_review.gateway_append($1,$2,$3,$4,$5,$6) as n',[org,j.id,writer,1,0,bytes]);
      assert.equal((await chunk()).rows[0].n,String(bytes.length));assert.equal((await chunk()).rows[0].n,String(bytes.length));
      const staged=(await db.query('select knowledge_import_review.gateway_begin_publication($1,$2,$3,$4) as bytes',[org,j.id,writer,1])).rows[0].bytes;
      const result=await gateway.publishKnowledgeGatewayReview(scope,staged,makeAdapter(j,async()=>{},writer),Date.now);
      assert.deepEqual(result,{state:'registered',status:'queued'});
      const saved=await read(j);assert.ok(saved);assert.equal(digest(saved),digest(bytes));
      const row=(await db.query('select object_version,sha256,status from knowledge_import_jobs_v1 where id=$1',[j.id])).rows[0];
      assert.ok(row.object_version);assert.equal(row.sha256,digest(bytes));assert.equal(row.status,'queued');
      const before=await read(j);
      const replay=await gateway.publishKnowledgeGatewayReview(scope,bytes,makeAdapter(j),Date.now);
      assert.equal(replay.state,'rejected');assert.deepEqual(await read(j),before);
    });

    await t.test('browser client and HTTP handler connect to real local Auth, staged SQL and Storage',async()=>{
      const j=await createJob(), httpOrigin='https://fixture.example';
      const http=load('lib/knowledge-import-gateway-http-review.ts',{'server-only':{},'node:crypto':require('node:crypto'),'./knowledge-import-gateway-review':gateway});
      const browser=load('lib/knowledge-import-browser-review.ts');
      const handle=http.createKnowledgeGatewayHttpReview({origin:httpOrigin,authenticate:async req=>{
        const token=req.headers.get('authorization')?.replace(/^Bearer /,'');
        if(!token)return null;
        const verified=await admin.auth.getUser(token);
        if(verified.error||verified.data.user?.id!==owner.actor||token!==owner.token)return null;
        // Local fixture only: owner claims sourced from real verified JWT; no hosted grants.
        await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(owner.claims)]);
        return {organizationId:org,query:async(statement,params)=>db.query(statement,params),publication:makeAdapter(j)};
      }});
      let calls=0;
      const run=browser.createKnowledgeBrowserUploadReview({origin:httpOrigin,jobId:j.id,file:new File([bytes],'fixture.json',{type:'application/json'}),fetcher:async(url,opts)=>{
        const op=url.split('/').at(-1);
        const headers={...opts.headers,origin:httpOrigin,authorization:'Bearer '+owner.token};
        const req=new Request(url,{method:'POST',headers,body:opts.body});
        const res=await handle(req,j.id,op);
        if(op==='append'&&++calls===1)throw Error('synthetic lost chunk ack');
        return res;
      }});
      assert.equal((await run()).state,'interrupted');
      assert.deepEqual(await run(),{state:'registered',status:'queued'});
      assert.equal(digest(await read(j)),digest(bytes));
      assert.equal((await db.query('select count(*)::int as n from knowledge_import_review.gateway_chunks where job_id=$1',[j.id])).rows[0].n,0);
      const historyHttp=load('lib/knowledge-import-history-http-review.ts',{'server-only':{},'./knowledge-import-history-review':load('lib/knowledge-import-history-review.ts')});
      const history=historyHttp.createKnowledgeHistoryHttpReview({origin:httpOrigin,authenticate:async()=>({query:async(statement,params)=>db.query(statement,params)})});
      const response=await history(new Request(httpOrigin+'/history'));assert.equal(response.status,200);
      const page=await response.json();assert.equal(page.jobs.find(x=>x.id===j.id).status,'queued');
    });
    await t.test('single application boundary reserves, uploads, reads history and cancels using verified local Auth',async()=>{
      const httpOrigin='https://fixture.example', id=randomUUID(), j={id,path:org+'/'+id+'/source.json',length:bytes.length};
      const http=load('lib/knowledge-import-gateway-http-review.ts',{'server-only':{},'node:crypto':require('node:crypto'),'./knowledge-import-gateway-review':gateway});
      const historyHttp=load('lib/knowledge-import-history-http-review.ts',{'server-only':{},'./knowledge-import-history-review':load('lib/knowledge-import-history-review.ts')});
      const application=load('lib/knowledge-import-application-review.ts',{'server-only':{},'node:crypto':require('node:crypto'),'./knowledge-import-gateway-http-review':http,'./knowledge-import-history-http-review':historyHttp});
      const browser=load('lib/knowledge-import-browser-review.ts');
      const broker=load('lib/knowledge-import-application-broker-review.ts',{'server-only':{}});
      const login='kb_app_'+randomUUID().replaceAll('-',''),password=randomUUID().replaceAll('-','');
      await db.query("create role "+login+" login password '"+password+"' nosuperuser nocreatedb nocreaterole noreplication nobypassrls noinherit");
      await db.query('insert into knowledge_import_review.application_principals values($1,true)',[login]);
      await db.query('grant usage on schema knowledge_import_review to '+login);
      await db.query('grant execute on function knowledge_import_review.broker_current_scope(),knowledge_import_review.broker_reserve_current(uuid,bigint,integer,integer),knowledge_import_review.broker_cancel_current(uuid),knowledge_import_review.broker_gateway_acquire(uuid,uuid,uuid),knowledge_import_review.broker_gateway_append(uuid,uuid,uuid,bigint,bigint,bytea),knowledge_import_review.broker_gateway_begin_publication(uuid,uuid,uuid,bigint),knowledge_import_review.broker_gateway_lock(uuid,uuid,uuid,bigint),knowledge_import_review.broker_gateway_register(uuid,uuid,uuid,bigint,text,bigint,text,jsonb),knowledge_import_review.broker_gateway_publication_receipt(uuid,uuid,uuid,bigint),knowledge_import_review.broker_current_history(integer,timestamptz,uuid),knowledge_import_review.broker_reservation(uuid,uuid),knowledge_import_review.broker_digests(jsonb) to '+login);
      const loginUrl=new URL(dbUrl.href);loginUrl.username=login;loginUrl.password=password;
      const restricted=new pg.Client({connectionString:loginUrl.href});await restricted.connect();
      try{
        await assert.rejects(restricted.query('select * from public.knowledge_import_jobs_v1'),e=>e.code==='42501');
        await assert.rejects(restricted.query('select * from knowledge_import_review.gateway_chunks'),e=>e.code==='42501');
        await assert.rejects(restricted.query('select * from knowledge_import_review.worker_due_jobs(1)'),e=>e.code==='42501');
        await assert.rejects(restricted.query('select knowledge_import_review.gateway_purge_receiving($1,$2)',[org,id]),e=>e.code==='42501');
        await assert.rejects(restricted.query('select knowledge_import_review.broker_current_scope()'),e=>e.code==='42501');
      }finally{await restricted.end();}
      const transport=claims=>async(statement,params)=>{
        const conn=new pg.Client({connectionString:loginUrl.href,connectionTimeoutMillis:5000});await conn.connect();
        try{await conn.query('begin');await conn.query("set local statement_timeout='15s'");await conn.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify(claims)]);
          const result=await conn.query(statement,params);await conn.query('commit');return result;
        }catch(e){await conn.query('rollback');throw e;}finally{await conn.end();}
      };
      await assert.rejects(transport({...owner.claims,exp:1})('select knowledge_import_review.broker_current_scope()',[]),e=>e.code==='42501');
      const scopeQuery=broker.createKnowledgeBrokerQueryReview(transport(owner.claims));
      await assert.rejects(scopeQuery('select * from auth.sessions',[]),/operation denied/);
      const publicationAdapter=load('lib/knowledge-import-publication-adapter-review.ts',{'server-only':{},'./knowledge-import-upload-contract':upload});
      const runtime=load('lib/knowledge-import-runtime-composition-review.ts',{'server-only':{},'./knowledge-import-application-review':application,'./knowledge-import-application-broker-review':broker,'./knowledge-import-publication-adapter-review':publicationAdapter});
      const secondId=randomUUID(),second={id:secondId,path:org+'/'+secondId+'/source.json',length:bytes.length};
      const jobs=new Map([[j.id,j],[second.id,second]]);
      const handle=runtime.createKnowledgeRuntimeCompositionReview({origin:httpOrigin,issuer:owner.claims.iss,uploadSeconds:600,retentionSeconds:1200,
        accessToken:async req=>req.headers.get('authorization')?.replace(/^Bearer /,'')??null,
        verifyUser:async token=>{const verified=await admin.auth.getUser(token);return verified.error?null:verified.data.user;},
        openDedicatedApplication:async()=>{
          const conn=new pg.Client({connectionString:loginUrl.href,connectionTimeoutMillis:5000});await conn.connect();
          return {query:(statement,params)=>conn.query(statement,params),destroy:()=>conn.end()};
        },
        providerFor:scope=>{
          const selected=scope.organizationId===org?jobs.get(scope.jobId):null;
          return {
            async createOnly(object,body){assert.ok(selected);assert.equal(object.path,selected.path);await makeAdapter(selected).put(object.path,body);},
            async inspectExact(object){assert.ok(selected);assert.equal(object.path,selected.path);return observeStream(selected,object.path);}
          };
        }
      });
      // Only fixture Storage put/inspect uses the privileged local provider adapter.
      // All application database calls use the restricted login and fixed broker wrappers.
      await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(owner.claims)]);
      const ownerScope=application.knowledgeImportScopeKeyReview(owner.actor,owner.claims.session_id,org),outsideScope=application.knowledgeImportScopeKeyReview(outsider.actor,outsider.claims.session_id,other);
      const base=httpOrigin+'/api/knowledge-import-review/',call=(suffix,token=owner.token,method='POST',headers={})=>handle(new Request(base+suffix,{method,headers:{origin:httpOrigin,authorization:'Bearer '+token,'x-knowledge-scope':token===outsider.token?outsideScope:ownerScope,...headers}}));
      assert.equal((await call(id+'/reserve',owner.token,'POST',{'x-knowledge-file-bytes':String(bytes.length),'x-organization-id':other})).status,200);
      assert.equal((await call(id+'/reserve',owner.token,'POST',{'x-knowledge-file-bytes':String(bytes.length)})).status,200);
      assert.equal((await call(id+'/cancel',outsider.token)).status,403);
      assert.equal((await call(id+'/reserve','invalid','POST',{'x-knowledge-file-bytes':'10'})).status,403);
      const run=browser.createKnowledgeBrowserUploadReview({origin:httpOrigin,jobId:id,file:new File([bytes],'fixture.json',{type:'application/json'}),fetcher:async(url,opts)=>handle(new Request(url,{method:'POST',headers:{...opts.headers,origin:httpOrigin,authorization:'Bearer '+owner.token,'x-knowledge-scope':ownerScope},body:opts.body}))});
      assert.deepEqual(await run(),{state:'registered',status:'queued'});
      const flow=load('lib/knowledge-import-upload-flow-review.ts',{'./knowledge-import-browser-review':browser});
      const progress=[];
      const secondRun=flow.createKnowledgeUploadFlowReview({origin:httpOrigin,jobId:secondId,scopeKey:ownerScope,file:new File([bytes],'fixture.json',{type:'application/json'}),emit:s=>progress.push(s.state),fetcher:async(url,opts)=>handle(new Request(url,{method:'POST',headers:{...opts.headers,origin:httpOrigin,authorization:'Bearer '+owner.token},body:opts.body}))});
      await secondRun.start();assert.equal(secondRun.snapshot().state,'registered');assert.ok(progress.includes('reserving'));assert.ok(progress.includes('uploading'));
      assert.equal(digest(await read(j)),digest(bytes));assert.equal(digest(await read(second)),digest(bytes));
      const history=await call('history',owner.token,'GET');assert.equal(history.status,200);const historyJobs=(await history.json()).jobs;assert.equal(historyJobs.find(x=>x.id===id).status,'queued');assert.equal(historyJobs.find(x=>x.id===secondId).status,'queued');
      const outside=await call('history',outsider.token,'GET');assert.equal(outside.status,200);assert.equal((await outside.json()).jobs.some(x=>x.id===id),false);
      assert.equal((await call('history',owner.token,'GET',{'x-knowledge-scope':outsideScope})).status,403);
      await db.query("insert into public.organization_members values($1,$2,true,'admin')",[other,owner.actor]);
      await db.query('update public.tenant_session_bindings set organization_id=$1 where session_id=$2',[other,owner.claims.session_id]);
      try{
        assert.equal((await call('history',owner.token,'GET')).status,403);
        assert.equal((await call(randomUUID()+'/reserve',owner.token,'POST',{'x-knowledge-file-bytes':'3'})).status,403);
        const stale=broker.createKnowledgeBrokerTransactionReview({...owner.claims,is_anonymous:false},async()=>{
          const conn=new pg.Client({connectionString:loginUrl.href,connectionTimeoutMillis:5000});await conn.connect();
          return {query:(statement,params)=>conn.query(statement,params),destroy:()=>conn.end()};
        },Date.now,()=>org);
        await assert.rejects(stale('select knowledge_import_review.current_scope() as organization_id',[]),e=>e.code==='42501');
      }finally{
        await db.query('update public.tenant_session_bindings set organization_id=$1 where session_id=$2',[org,owner.claims.session_id]);
        await db.query('delete from public.organization_members where organization_id=$1 and user_id=$2',[other,owner.actor]);
      }
      assert.equal((await call(id+'/cancel')).status,200);
      await db.query('update public.organization_members set active=false where organization_id=$1 and user_id=$2',[org,owner.actor]);
      try{assert.equal((await call('history',owner.token,'GET')).status,403);}finally{await db.query('update public.organization_members set active=true where organization_id=$1 and user_id=$2',[org,owner.actor]);}
      await db.query('update knowledge_import_review.application_principals set enabled=false where login_role=$1',[login]);
      assert.equal((await call('history',owner.token,'GET')).status,403);
      await assert.rejects(transport(owner.claims)('select knowledge_import_review.broker_current_scope()',[]),e=>e.code==='42501');

    });
    await t.test('delegated scheduler processes real private Storage source with restricted worker login',async()=>{
      const j=await createJob(),scope={organizationId:org,jobId:j.id},writer=randomUUID();
      await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(owner.claims)]);
      await db.query('select * from knowledge_import_review.gateway_acquire($1,$2,$3)',[org,j.id,writer]);
      await db.query('select knowledge_import_review.gateway_append($1,$2,$3,$4,$5,$6)',[org,j.id,writer,1,0,bytes]);
      const staged=(await db.query('select knowledge_import_review.gateway_begin_publication($1,$2,$3,$4) as bytes',[org,j.id,writer,1])).rows[0].bytes;
      assert.deepEqual(await gateway.publishKnowledgeGatewayReview(scope,staged,makeAdapter(j,async()=>{},writer),Date.now),{state:'registered',status:'queued'});
      const login='kb_worker_'+randomUUID().replaceAll('-',''),password=randomUUID().replaceAll('-','');
      await db.query("create role "+login+" login password '"+password+"' nosuperuser nocreatedb nocreaterole noreplication nobypassrls noinherit");
      await db.query('insert into knowledge_import_review.worker_principals values($1,true)',[login]);
      await db.query('grant usage on schema knowledge_import_review to '+login);
      await db.query('grant execute on function knowledge_import_review.worker_due_jobs(integer),knowledge_import_review.worker_source_identity(uuid,uuid),knowledge_import_review.worker_verify_manifest(uuid,uuid,text,bigint,text,jsonb),knowledge_import_review.worker_digest_payloads(uuid,uuid,jsonb),knowledge_import_review.worker_claim(uuid,uuid,integer),knowledge_import_review.worker_finalize(uuid,uuid,integer,uuid,integer,jsonb),knowledge_import_review.worker_result(uuid,uuid,integer,uuid,integer),knowledge_import_review.worker_settle_failure(uuid,uuid,integer,uuid,integer,text) to '+login);
      const workerUrl=new URL(dbUrl.href);workerUrl.username=login;workerUrl.password=password;
      const worker=new pg.Client({connectionString:workerUrl.href,connectionTimeoutMillis:5000});await worker.connect();
      try{
        await worker.query("set statement_timeout='15s'");
        const query=(sql,params)=>worker.query(sql,params);
        assert.equal((await query('select * from knowledge_import_review.worker_due_jobs($1)',[1])).rowCount,0);
        await assert.rejects(query('select * from public.knowledge_documents',[]),e=>e.code==='42501');
        await assert.rejects(query('select * from knowledge_import_review.gateway_chunks',[]),e=>e.code==='42501');
        await assert.rejects(query('select knowledge_import_review.broker_current_scope()',[]),e=>e.code==='42501');
        assert.equal((await db.query('select knowledge_import_review.delegate_worker($1,$2,$3,$4) as ok',[org,j.id,login,new Date(Date.now()+600000)])).rows[0].ok,true);
        const adapters=load('lib/knowledge-import-worker-adapters-review.ts',{'server-only':{},'./knowledge-import-source-preparation':prep,'./knowledge-import-upload-contract':upload});
        const runner=load('lib/knowledge-import-worker-review.ts',{'server-only':{}});
        const scheduler=load('lib/knowledge-import-scheduler-review.ts',{'server-only':{},'./knowledge-import-worker-review':runner});
        // Fixture-only privileged issuer, NOT a credential available to the worker.
        // Check actual delegated identity at issuance, and observed Storage version before/after read.
        const version=async()=> (await db.query('select version from storage.objects where bucket_id=$1 and name=$2',[bucket,j.path])).rows[0]?.version;
        let issued=0,downloads=0;
        const readSource=async(requested,identity)=>{
          assert.deepEqual(requested,scope);assert.equal(identity.objectPath,j.path);
          const authorized=(await query('select * from knowledge_import_review.worker_source_identity($1,$2)',[requested.organizationId,requested.jobId])).rows[0];
          assert.equal(authorized.object_version,identity.objectVersion);assert.equal(authorized.source_sha256,identity.sha256);assert.equal(authorized.byte_length,String(identity.byteLength));
          assert.equal(await version(),identity.objectVersion);
          const signed=await admin.storage.from(bucket).createSignedUrl(j.path,30);
          assert.equal(Boolean(signed.error),false);issued++;
          const url=fixtureApiUrl(signed.data.signedUrl);
          assert.equal(url.pathname,'/storage/v1/object/sign/'+bucket+'/'+j.path);
          assert.equal(url.searchParams.getAll('token').length,1);assert.ok(url.searchParams.get('token'));assert.deepEqual([...url.searchParams.keys()],['token']);
          // Only the short-lived read capability is used here, no admin Authorization header.
          const response=await fixtureFetch(url,{method:'GET',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000)});
          assert.equal(response.status,200);assert.equal(response.headers.get('content-type')?.split(';')[0],'application/json');
          assert.ok(response.body);downloads++;
          const stream=response.body;
          const chunks=(async function*(){const reader=stream.getReader();let total=0;
            try{while(true){const item=await reader.read();if(item.done)break;total+=item.value.byteLength;if(total>identity.byteLength)throw Error('source too large');yield item.value;}
              assert.equal(total,identity.byteLength);assert.equal(await version(),identity.objectVersion);
            }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
          })();
          return {bucket,objectPath:j.path,version:identity.objectVersion,contentType:'application/json',chunks};
        };
        const runtime=load('lib/knowledge-import-worker-runtime-review.ts',{'server-only':{},'./knowledge-import-worker-adapters-review':adapters,'./knowledge-import-scheduler-review':scheduler});
        let runtimeOpened=0,runtimeClosed=0;
        const tick=await runtime.runKnowledgeWorkerRuntimeReview({expectedLogin:login,windowBatches:2,budgetMs:90000,readSource,
          openDedicatedWorker:async()=>{
            const conn=new pg.Client({connectionString:workerUrl.href,connectionTimeoutMillis:5000});await conn.connect();runtimeOpened++;
            return {query:(statement,params)=>conn.query(statement,params),destroy:async()=>{await conn.end();runtimeClosed++;}};
          }
        });
        assert.equal(runtimeOpened,1);assert.equal(runtimeClosed,1);
        assert.equal(tick.stop,'complete');assert.equal(tick.reports.length,1);assert.equal(tick.reports[0].report.created,1);assert.equal(issued,1);assert.equal(downloads,1);
        const docs=(await db.query("select status,created_by from public.knowledge_documents where metadata->>'import_job_id'=$1",[j.id])).rows;
        assert.deepEqual(docs,[{status:'draft',created_by:owner.actor}]);
        assert.equal((await db.query('select status from knowledge_import_jobs_v1 where id=$1',[j.id])).rows[0].status,'completed');
        assert.equal((await query('select * from knowledge_import_review.worker_due_jobs($1)',[1])).rowCount,0);
        await assert.rejects(query('select * from knowledge_import_review.worker_source_identity($1,$2)',[other,j.id]),e=>e.code==='42501');
      }finally{await worker.end();}
    });
    await t.test('cancel after provider write prevents manifest publication and preserves quota',async()=>{
      const j=await createJob(),scope={organizationId:org,jobId:j.id};
      const writer=randomUUID();
      await db.query('select * from knowledge_import_review.gateway_acquire($1,$2,$3)',[org,j.id,writer]);
      await db.query('select knowledge_import_review.gateway_append($1,$2,$3,$4,$5,$6)',[org,j.id,writer,1,0,bytes]);
      const staged=(await db.query('select knowledge_import_review.gateway_begin_publication($1,$2,$3,$4) as bytes',[org,j.id,writer,1])).rows[0].bytes;
      const result=await gateway.publishKnowledgeGatewayReview(scope,staged,makeAdapter(j,async()=>{
        assert.equal((await db.query('select knowledge_import_review.cancel($1,$2) as ok',[org,j.id])).rows[0].ok,true);
      },writer),Date.now);
      assert.equal(result.state,'reconciliation_required');
      const row=(await db.query('select status,manifest_sha256,storage_released_at from knowledge_import_jobs_v1 where id=$1',[j.id])).rows[0];
      assert.deepEqual(row,{status:'cancelled',manifest_sha256:null,storage_released_at:null});
      assert.equal((await db.query('select count(*)::int as n from knowledge_import_entries_v1 where job_id=$1',[j.id])).rows[0].n,0);
      // A private unregistered object may remain. No worker access or quota release is implied.
      assert.ok(await read(j));
      const reconcile=load('lib/knowledge-import-reconciliation-review.ts',{'server-only':{},'node:crypto':require('node:crypto'),'./knowledge-import-upload-contract':upload});
      const snapshot=async()=> (await db.query('select * from knowledge_import_review.reconciliation_snapshot($1,$2)',[org,j.id])).rows[0]??null;
      const observe=async(b,p)=>{
        assert.equal(b,bucket);assert.equal(p,j.path);
        const v=async()=> (await db.query('select version from storage.objects where bucket_id=$1 and name=$2',[b,p])).rows[0]?.version;
        const before=await v(),saved=await read(j),after=await v();
        if(!before||before!==after||!saved)return {kind:'unknown'};
        return {kind:'present',version:before,chunks:(async function*(){yield saved;})()};
      };
      assert.equal((await reconcile.inspectKnowledgeStorageReconciliationReview(scope,{snapshot,observe})).state,'not_eligible');
      await db.query("update knowledge_import_jobs_v1 set created_at=now()-interval '3 hours',upload_expires_at=now()-interval '2 hours',retention_expires_at=now()-interval '1 hour' where id=$1",[j.id]);
      const inspected=await reconcile.inspectKnowledgeStorageReconciliationReview(scope,{snapshot,observe});
      assert.equal(inspected.state,'matching_orphan');assert.equal(inspected.mayDelete,false);assert.equal(inspected.mayReleaseQuota,false);
      await assert.rejects(db.query('select knowledge_import_review.gateway_purge_receiving($1,$2)',[org,j.id]),/publication reconciliation required/);
      assert.equal((await db.query('select storage_released_at from knowledge_import_jobs_v1 where id=$1',[j.id])).rows[0].storage_released_at,null);
      assert.ok(await read(j));
    });
    await t.test('exact-version cleanup protects replacement and retains quota on uncertain deletion',async()=>{
      // These are exclusively newly generated, synthetic objects in the fresh local test
      // bucket. No path-only deletion, no production credentials, no quota release.
      const prepareTerminal=async()=>{
        const j=await createJob(),scope={organizationId:org,jobId:j.id},writer=randomUUID();
        await db.query('select * from knowledge_import_review.gateway_acquire($1,$2,$3)',[org,j.id,writer]);
        await db.query('select knowledge_import_review.gateway_append($1,$2,$3,$4,$5,$6)',[org,j.id,writer,1,0,bytes]);
        const staged=(await db.query('select knowledge_import_review.gateway_begin_publication($1,$2,$3,$4) as bytes',[org,j.id,writer,1])).rows[0].bytes;
        assert.deepEqual(await gateway.publishKnowledgeGatewayReview(scope,staged,makeAdapter(j,async()=>{},writer),Date.now),{state:'registered',status:'queued'});
        assert.equal((await db.query('select knowledge_import_review.cancel($1,$2) as ok',[org,j.id])).rows[0].ok,true);
        await assert.rejects(db.query('select knowledge_import_review.begin_storage_cleanup($1,$2)',[org,j.id]),/cleanup not eligible/);
        await db.query("update knowledge_import_jobs_v1 set created_at=now()-interval '3 hours',upload_expires_at=now()-interval '2 hours',retention_expires_at=now()-interval '1 hour' where id=$1",[j.id]);
        const cleanup=(await db.query('select knowledge_import_review.begin_storage_cleanup($1,$2) as id',[org,j.id])).rows[0].id;
        assert.equal((await db.query('select knowledge_import_review.begin_storage_cleanup($1,$2) as id',[org,j.id])).rows[0].id,cleanup);
        const row=(await db.query('select object_version,sha256 from knowledge_import_jobs_v1 where organization_id=$1 and id=$2',[org,j.id])).rows[0];
        assert.equal(row.sha256,digest(bytes));assert.match(row.object_version,/^[0-9a-f-]{36}$/i);
        return {j,scope,cleanup,version:row.object_version};
      };
      const removeVersion=async(j,version,user=null)=>{
        assert.equal(j.path,org+'/'+j.id+'/source.json');assert.match(version,/^[0-9a-f-]{36}$/i);
        const u=new URL('/storage/v1/object/'+bucket+'/'+j.path,api.origin);u.searchParams.set('versionId',version);
        return fixtureFetch(u,{method:'DELETE',redirect:'error',signal:AbortSignal.timeout(20000),headers:{apikey:user?anon:service,Authorization:'Bearer '+(user?user.token:service)}});
      };
      const current=async(j)=> (await db.query('select version from storage.objects where bucket_id=$1 and name=$2',[bucket,j.path])).rows[0]?.version??null;
      const quotaRetained=async(x)=>{
        const row=(await db.query('select j.storage_released_at,c.completed_at,c.evidence_sha256 from public.knowledge_import_jobs_v1 j join knowledge_import_review.storage_cleanup c on c.organization_id=j.organization_id and c.job_id=j.id where j.organization_id=$1 and j.id=$2 and c.cleanup_id=$3',[org,x.j.id,x.cleanup])).rows[0];
        assert.deepEqual(row,{storage_released_at:null,completed_at:null,evidence_sha256:null});
      };
      const first=await prepareTerminal();
      for(const user of [owner,outsider]){
        denied(await removeVersion(first.j,first.version,user));
        assert.equal(await current(first.j),first.version);assert.equal(digest(await read(first.j)),digest(bytes));
      }
      const wrong=await removeVersion(first.j,randomUUID());
      assert.ok(wrong.ok||[400,404,409,422].includes(wrong.status),'unexpected stale-version response '+wrong.status);
      assert.equal(await current(first.j),first.version);assert.equal(digest(await read(first.j)),digest(bytes));
      // Simulate a lost acknowledgement AFTER an actual exact-version provider call.
      const exact=await removeVersion(first.j,first.version);
      assert.equal(exact.status,200);await exact.body?.cancel();
      assert.equal(await current(first.j),null);assert.equal(await read(first.j),null);
      const reconcile=load('lib/knowledge-import-reconciliation-review.ts',{'server-only':{},'node:crypto':require('node:crypto'),'./knowledge-import-upload-contract':upload});
      const observed=await reconcile.inspectKnowledgeStorageReconciliationReview(first.scope,{
        snapshot:async()=> (await db.query('select * from knowledge_import_review.reconciliation_snapshot($1,$2)',[org,first.j.id])).rows[0]??null,
        observe:async(b,p)=>{assert.equal(b,bucket);assert.equal(p,first.j.path);assert.equal(await current(first.j),null);assert.equal(await read(first.j),null);return {kind:'absent_observed'};}
      });
      assert.equal(observed.state,'absent_unproven');assert.equal(observed.mayReleaseQuota,false);await quotaRetained(first);
      const second=await prepareTerminal();
      // Test-only service-role overwrite models a provider-side replacement after cleanup
      // receipt creation. The application's real publication adapter forbids upsert.
      const replacement=Buffer.from(bytes.toString('utf8').replace('Fixture','Replace'));
      assert.equal(replacement.length,bytes.length);assert.notEqual(digest(replacement),digest(bytes));
      const changed=await admin.storage.from(bucket).upload(second.j.path,replacement,{contentType:'application/json',upsert:true,cacheControl:'0'});
      assert.equal(Boolean(changed.error),false);
      const newVersion=await current(second.j);assert.ok(newVersion);assert.notEqual(newVersion,second.version);
      const stale=await removeVersion(second.j,second.version);
      assert.ok(stale.ok||[400,404,409,422].includes(stale.status),'unexpected stale-version response '+stale.status);
      assert.equal(await current(second.j),newVersion);assert.equal(digest(await read(second.j)),digest(replacement));
      await quotaRetained(second);
      t.diagnostic(JSON.stringify({exactVersionDeleteStatus:exact.status,unknownAck:'absence_unproven',wrongVersionStatus:wrong.status,oldVersionAfterReplacementStatus:stale.status,replacementPreserved:true,quotaReleased:false}));
    });
    await t.test('50 MiB transport, 10000 ledger entries and 10000 actual restricted-worker draft writes',async()=>{
      const start=Date.now(),max=50*1024*1024;
      const memory=(phase)=>{const m=process.memoryUsage();t.diagnostic(JSON.stringify({capacityPhase:phase,rssBytes:m.rss,heapUsedBytes:m.heapUsed,externalBytes:m.external,arrayBufferBytes:m.arrayBuffers,maxRssKiB:process.resourceUsage().maxRSS}));};
      memory('before_upload');
      const j=await createJob(max),scope={organizationId:org,jobId:j.id},writer=randomUUID();
      // Keep raw, staged and downloaded upload buffers inside this function. The worker
      // phase does not retain references to them. GC timing/RSS reclamation is not guaranteed.
      const uploadAndVerify=async()=>{
      const raw=(()=>{
        const json=JSON.stringify({version:1,drafts:Array.from({length:10000},(_,i)=>({title:'Capacity fixture '+i,content:'x'.repeat(5100),source_name:'Synthetic fixture'}))});
        assert.ok(Buffer.byteLength(json)<=max);const bytes=Buffer.alloc(max,32);bytes.write(json,0,'utf8');return bytes;
      })();
      const expectedDigest=digest(raw);
      memory('source_generated');
      await db.query('select * from knowledge_import_review.gateway_acquire($1,$2,$3)',[org,j.id,writer]);
      for(let offset=0;offset<max;offset+=1048576){
        const count=(await db.query('select knowledge_import_review.gateway_append($1,$2,$3,$4,$5,$6) as n',[org,j.id,writer,1,offset,raw.subarray(offset,offset+1048576)])).rows[0].n;
        assert.equal(Number(count),offset+1048576);
      }
      const staged=(await db.query('select knowledge_import_review.gateway_begin_publication($1,$2,$3,$4) as bytes',[org,j.id,writer,1])).rows[0].bytes;
      assert.equal(staged.length,max);assert.equal(digest(staged),expectedDigest);memory('staged');
      const result=await gateway.publishKnowledgeGatewayReview(scope,staged,makeAdapter(j,async()=>{},writer),Date.now);
      assert.deepEqual(result,{state:'registered',status:'queued'});
      // Gateway has already independently hashed the actual Storage stream. Repeat the
      // observation without allocating a second full download for the capacity assertion.
      const saved=await observeStream(j,j.path);let verifiedBytes=0;const verifiedHash=createHash('sha256');
      for await(const chunk of saved.chunks){verifiedBytes+=chunk.byteLength;verifiedHash.update(chunk);}
      assert.equal(verifiedBytes,max);assert.equal(verifiedHash.digest('hex'),expectedDigest);memory('storage_verified');
      const ledger=(await db.query("select count(*)::int as total,count(*) filter(where status='pending')::int as pending from knowledge_import_entries_v1 where organization_id=$1 and job_id=$2",[org,j.id])).rows[0];
      assert.deepEqual(ledger,{total:10000,pending:10000});
      assert.equal((await db.query('select count(*)::int as n from knowledge_import_review.gateway_chunks where job_id=$1',[j.id])).rows[0].n,0);
      t.diagnostic(JSON.stringify({bytes:max,ledgerEntries:10000,elapsedMs:Date.now()-start,maxRssKiB:process.resourceUsage().maxRSS,scope:'actual local chunk staging, Storage publication and ledger registration'}));
      };
      await uploadAndVerify();memory('upload_scope_released');
      const workerStart=Date.now(),login='kb_capacity_'+randomUUID().replaceAll('-',''),password=randomUUID().replaceAll('-','');
      await db.query("create role "+login+" login password '"+password+"' nosuperuser nocreatedb nocreaterole noreplication nobypassrls noinherit");
      await db.query('insert into knowledge_import_review.worker_principals values($1,true)',[login]);
      await db.query('grant usage on schema knowledge_import_review to '+login);
      await db.query('grant execute on function knowledge_import_review.worker_due_jobs(integer),knowledge_import_review.worker_source_identity(uuid,uuid),knowledge_import_review.worker_verify_manifest(uuid,uuid,text,bigint,text,jsonb),knowledge_import_review.worker_digest_payloads(uuid,uuid,jsonb),knowledge_import_review.worker_claim(uuid,uuid,integer),knowledge_import_review.worker_finalize(uuid,uuid,integer,uuid,integer,jsonb),knowledge_import_review.worker_result(uuid,uuid,integer,uuid,integer),knowledge_import_review.worker_settle_failure(uuid,uuid,integer,uuid,integer,text) to '+login);
      const workerUrl=new URL(dbUrl.href);workerUrl.username=login;workerUrl.password=password;
      const worker=new pg.Client({connectionString:workerUrl.href,connectionTimeoutMillis:5000});await worker.connect();
      try{
        await worker.query("set statement_timeout='15s'");
        const query=(sql,params)=>worker.query(sql,params);
        assert.equal((await query('select * from knowledge_import_review.worker_due_jobs($1)',[1])).rowCount,0);
        await assert.rejects(query('select * from public.knowledge_documents',[]),e=>e.code==='42501');
        assert.equal((await db.query('select knowledge_import_review.delegate_worker($1,$2,$3,$4) as ok',[org,j.id,login,new Date(Date.now()+840000)])).rows[0].ok,true);
        const adapters=load('lib/knowledge-import-worker-adapters-review.ts',{'server-only':{},'./knowledge-import-source-preparation':prep,'./knowledge-import-upload-contract':upload});
        const runner=load('lib/knowledge-import-worker-review.ts',{'server-only':{}});
        const scheduler=load('lib/knowledge-import-scheduler-review.ts',{'server-only':{},'./knowledge-import-worker-review':runner});
        const v=async()=> (await db.query('select version from storage.objects where bucket_id=$1 and name=$2',[bucket,j.path])).rows[0]?.version;
        let sourceReads=0;
        const actual=adapters.createKnowledgeWorkerSourceAdaptersReview(query,async(requested,identity)=>{
          assert.deepEqual(requested,scope);assert.equal(identity.objectPath,j.path);assert.equal(await v(),identity.objectVersion);
          const signed=await admin.storage.from(bucket).createSignedUrl(j.path,30);
          assert.equal(Boolean(signed.error),false);const url=fixtureApiUrl(signed.data.signedUrl);
          assert.equal(url.pathname,'/storage/v1/object/sign/'+bucket+'/'+j.path);assert.deepEqual([...url.searchParams.keys()],['token']);assert.ok(url.searchParams.get('token'));
          const response=await fixtureFetch(url,{method:'GET',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(60000)});
          assert.equal(response.status,200);assert.equal(response.headers.get('content-type')?.split(';')[0],'application/json');assert.ok(response.body);sourceReads++;
          const stream=response.body;
          const chunks=(async function*(){const reader=stream.getReader();let total=0;
            try{while(true){const item=await reader.read();if(item.done)break;total+=item.value.byteLength;if(total>identity.byteLength)throw Error('source too large');yield item.value;}
              assert.equal(total,identity.byteLength);assert.equal(await v(),identity.objectVersion);
            }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
          })();
          return {bucket,objectPath:j.path,version:identity.objectVersion,contentType:'application/json',chunks};
        });
        // Actual scheduler windows: every invocation independently re-reads and verifies
        // Storage source bytes and the canonical manifest. No fixture snapshot override.
        let created=0,ticks=0;
        for(;ticks<20&&created<10000;ticks++){
          if(Date.now()-workerStart>480000)throw Error('capacity worker exceeded 8-minute test budget');
          const before=sourceReads;
          const tick=await scheduler.runKnowledgeImportSchedulerReview(query,actual,{jobs:1,batchSize:10,windowBatches:200,budgetMs:90000});
          assert.ok(['complete','budget'].includes(tick.stop));assert.equal(tick.reports.length,1);
          const report=tick.reports[0].report;
          assert.ok(['batch_complete','budget'].includes(report.stop));assert.ok(report.created>0&&report.created<=2000);
          assert.equal(report.claimed,report.created);assert.equal(report.recovered+report.retried+report.failed,0);
          assert.equal(sourceReads,before+1);created+=report.created;
          t.diagnostic(JSON.stringify({capacityCreated:created,ticks:ticks+1,sourceReads,elapsedMs:Date.now()-workerStart}));memory('worker_window_completed');
        }
        assert.equal(created,10000);assert.equal(sourceReads,ticks);assert.ok(ticks>=5&&ticks<=20);
        const reconciled=(await db.query("select count(*)::int as total,count(distinct e.document_id)::int as unique_documents,count(*) filter(where e.status='created' and d.status='draft' and d.created_by=$3 and d.organization_id=$1 and d.metadata->>'import_job_id'=($2::uuid)::text)::int as verified_drafts from public.knowledge_import_entries_v1 e join public.knowledge_documents d on d.id=e.document_id and d.organization_id=e.organization_id where e.organization_id=$1 and e.job_id=$2",[org,j.id,owner.actor])).rows[0];
        assert.deepEqual(reconciled,{total:10000,unique_documents:10000,verified_drafts:10000});
        const chunks=(await db.query("select count(*)::int as n from public.knowledge_import_entries_v1 e join public.knowledge_chunks c on c.document_id=e.document_id and c.organization_id=e.organization_id where e.organization_id=$1 and e.job_id=$2",[org,j.id])).rows[0].n;
        assert.equal(chunks,10000);
        assert.equal((await db.query('select status from knowledge_import_jobs_v1 where id=$1',[j.id])).rows[0].status,'completed');
        assert.equal((await query('select * from knowledge_import_review.worker_due_jobs($1)',[1])).rowCount,0);
        memory('worker_reconciled');
        t.diagnostic(JSON.stringify({capacityDrafts:created,sourceReads,ticks,workerElapsedMs:Date.now()-workerStart,totalElapsedMs:Date.now()-start,maxRssKiB:process.resourceUsage().maxRSS,scope:'actual restricted SQL draft writes with fresh signed Storage source and manifest per bounded scheduler window'}));
      }finally{await worker.end();}
    });
  }finally{await db.end();}
});
