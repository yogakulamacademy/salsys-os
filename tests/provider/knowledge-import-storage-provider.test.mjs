import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createClient} from '@supabase/supabase-js';
import pg from 'pg';

// Safety boundary: this fixture is permitted only in an explicitly disposable local project.
const loopback=new Set(['localhost','127.0.0.1','[::1]']);
const bucket='knowledge-import-private-v1';
const local=(value,protocols)=>{
  const u=new URL(value);
  assert.ok(loopback.has(u.hostname),'refusing non-loopback provider');
  assert.ok(protocols.includes(u.protocol),'unexpected protocol');
  return u;
};
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
  const api=local(status.API_URL,['http:']), dbUrl=local(status.DB_URL,['postgres:','postgresql:']);
  assert.equal(dbUrl.pathname,'/postgres');assert.equal(dbUrl.username,'postgres');
  const anon=status.ANON_KEY||status.PUBLISHABLE_KEY, service=status.SERVICE_ROLE_KEY||status.SECRET_KEY;
  assert.ok(typeof anon==='string'&&anon.length>10&&typeof service==='string'&&service.length>10,'local stack credentials missing');
  const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
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
      const parsed=local(url,['http:']);assert.equal(parsed.port,api.port);
      assert.ok(parsed.pathname.startsWith('/storage/v1/upload/resumable'));
      return fetch(parsed,{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{apikey:anon,'Tus-Resumable':'1.0.0',...(user?{Authorization:'Bearer '+user.token}:{}),...headers},body});
    };
    const meta=(path)=>Object.entries({bucketName:bucket,objectName:path,contentType:'application/json',cacheControl:'0'}).map(([k,v])=>k+' '+Buffer.from(v).toString('base64')).join(',');
    const start=(job,user=owner,length=job.length)=>request('POST',endpoint,user,{'Upload-Length':String(length),'Upload-Metadata':meta(job.path)});
    const location=r=>{
      assert.ok([200,201].includes(r.status),'TUS creation failed: '+r.status);
      const value=r.headers.get('location');assert.ok(value,'TUS location missing');
      const u=local(new URL(value,endpoint).href,['http:']);assert.equal(u.port,api.port);
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
      const direct=await fetch(api.origin+'/storage/v1/object/'+bucket+'/'+j.path,{redirect:'error',headers:{apikey:anon,Authorization:'Bearer '+owner.token},signal:AbortSignal.timeout(20000)});
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
      const direct=await fetch(api.origin+'/storage/v1/object/'+bucket+'/'+j.path,{method:'POST',headers:{apikey:anon,Authorization:'Bearer '+owner.token,'Content-Type':'application/json'},body:bytes,redirect:'error',signal:AbortSignal.timeout(20000)});
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
