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
test('actual disposable Supabase Storage authorization and lifecycle',{timeout:240000},async t=>{
  assert.equal(process.env.SALSYS_ALLOW_DISPOSABLE_STORAGE_TEST,'1');
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
    await db.query('grant usage on schema knowledge_import_review to authenticated;grant execute on function knowledge_import_review.storage_insert_allowed(text,text,jsonb) to authenticated');
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

    // Direct TUS stays a failing acceptance probe. Test the alternative gateway independently.
    await db.query(readFileSync('docs/sql/knowledge-import-gateway-only-REVIEW-DRAFT.sql','utf8'));
    await db.query(readFileSync('docs/sql/knowledge-import-gateway-staging-REVIEW-DRAFT.sql','utf8'));
    await db.query(readFileSync('docs/sql/knowledge-import-application-boundary-REVIEW-DRAFT.sql','utf8'));
    await db.query(readFileSync('docs/sql/knowledge-import-application-broker-REVIEW-DRAFT.sql','utf8'));
    const require=createRequire(import.meta.url),{load}=require('../readiness/helpers.cjs');
    const upload=load('lib/knowledge-import-upload-contract.ts');
    const prep=load('lib/knowledge-import-source-preparation.ts',{'server-only':{},'node:crypto':require('node:crypto'),'./knowledge-bulk-import-preflight':load('lib/knowledge-bulk-import-preflight.ts'),'./knowledge-import-upload-contract':upload});
    const gateway=load('lib/knowledge-import-gateway-review.ts',{'server-only':{},'node:crypto':require('node:crypto'),'./knowledge-import-source-preparation':prep,'./knowledge-import-upload-contract':upload});
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
      async inspect(path){
        const result=await db.query('select version from storage.objects where bucket_id=$1 and name=$2',[bucket,path]);
        const saved=await read(job);if(!saved||!result.rows[0]?.version)throw Error('object absent');
        return {version:result.rows[0].version,bytes:saved};
      },
      async digests(payloads){return (await db.query('select * from knowledge_import_review.digest_payloads($1::jsonb)',[JSON.stringify(payloads)])).rows.map(r=>r.payload_sha256);},
      async register(scope,p){return writer?(await db.query('select knowledge_import_review.gateway_register($1,$2,$3,$4,$5,$6,$7,$8::jsonb) as status',[scope.organizationId,scope.jobId,writer,1,p.objectVersion,p.byteLength,p.sha256,JSON.stringify(p.manifest)])).rows[0].status:(await db.query('select knowledge_import_review.register_verified_source($1,$2,$3,$4,$5,$6::jsonb) as status',[scope.organizationId,scope.jobId,p.objectVersion,p.byteLength,p.sha256,JSON.stringify(p.manifest)])).rows[0].status;}
    });
    await t.test('gateway-only policy denies new direct TUS and ordinary client upload',async()=>{
      const j=await createJob();denied(await start(j));denied(await start(j,outsider));
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
      const application=load('lib/knowledge-import-application-review.ts',{'server-only':{},'./knowledge-import-gateway-http-review':http,'./knowledge-import-history-http-review':historyHttp});
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
      const routeBoundary=load('lib/knowledge-import-route-boundary-review.ts',{'server-only':{},'./knowledge-import-application-review':application});
      const publicationAdapter=load('lib/knowledge-import-publication-adapter-review.ts',{'server-only':{},'./knowledge-import-upload-contract':upload});
      const handle=routeBoundary.createKnowledgeRouteBoundaryReview({mode:'isolated_fixture',options:{origin:httpOrigin,issuer:owner.claims.iss,uploadSeconds:600,retentionSeconds:1200,
        accessToken:async req=>req.headers.get('authorization')?.replace(/^Bearer /,'')??null,
        verifyUser:async token=>{const verified=await admin.auth.getUser(token);return verified.error?null:verified.data.user;},
        connect:async claims=>{
          const query=broker.createKnowledgeBrokerQueryReview(transport(claims)),fixture=makeAdapter(j);
          const publication=publicationAdapter.createKnowledgePublicationAdapterReview(query,{
            async createOnly(object,body){assert.equal(object.path,j.path);await fixture.put(object.path,body);},
            async inspectExact(object){assert.equal(object.path,j.path);return fixture.inspect(object.path);}
          },{organizationId:org,jobId:id});
          return {query,publication,close:async()=>{}};
        }
      }});
      // Only fixture Storage put/inspect uses the privileged local provider adapter.
      // All application database calls use the restricted login and fixed broker wrappers.
      await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(owner.claims)]);
      const base=httpOrigin+'/api/knowledge-import-review/',call=(suffix,token=owner.token,method='POST',headers={})=>handle(new Request(base+suffix,{method,headers:{origin:httpOrigin,authorization:'Bearer '+token,...headers}}));
      assert.equal((await call(id+'/reserve',owner.token,'POST',{'x-knowledge-file-bytes':String(bytes.length),'x-organization-id':other})).status,200);
      assert.equal((await call(id+'/reserve',owner.token,'POST',{'x-knowledge-file-bytes':String(bytes.length)})).status,200);
      assert.equal((await call(id+'/cancel',outsider.token)).status,403);
      assert.equal((await call(id+'/reserve','invalid','POST',{'x-knowledge-file-bytes':'10'})).status,403);
      const run=browser.createKnowledgeBrowserUploadReview({origin:httpOrigin,jobId:id,file:new File([bytes],'fixture.json',{type:'application/json'}),fetcher:async(url,opts)=>handle(new Request(url,{method:'POST',headers:{...opts.headers,origin:httpOrigin,authorization:'Bearer '+owner.token},body:opts.body}))});
      assert.deepEqual(await run(),{state:'registered',status:'queued'});
      const history=await call('history',owner.token,'GET');assert.equal(history.status,200);assert.equal((await history.json()).jobs.find(x=>x.id===id).status,'queued');
      const outside=await call('history',outsider.token,'GET');assert.equal(outside.status,200);assert.equal((await outside.json()).jobs.some(x=>x.id===id),false);
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
        const workerAdapters=adapters.createKnowledgeWorkerSourceAdaptersReview(query,readSource);
        const tick=await scheduler.runKnowledgeImportSchedulerReview(query,workerAdapters,{jobs:1,batchSize:1,batches:2});
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
      const result=await gateway.publishKnowledgeGatewayReview(scope,bytes,makeAdapter(j,async()=>{
        assert.equal((await db.query('select knowledge_import_review.cancel($1,$2) as ok',[org,j.id])).rows[0].ok,true);
      }),Date.now);
      assert.equal(result.state,'reconciliation_required');
      const row=(await db.query('select status,manifest_sha256,storage_released_at from knowledge_import_jobs_v1 where id=$1',[j.id])).rows[0];
      assert.deepEqual(row,{status:'cancelled',manifest_sha256:null,storage_released_at:null});
      assert.equal((await db.query('select count(*)::int as n from knowledge_import_entries_v1 where job_id=$1',[j.id])).rows[0].n,0);
      // A private unregistered object may remain. No worker access or quota release is implied.
      assert.ok(await read(j));
    });
  }finally{await db.end();}
});
