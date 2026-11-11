import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const { Client }=pg;
const files=[
  'KB-08E-version-aware-knowledge-approval-REHEARSAL-DRAFT.sql',
  'KB-08F-postapproval-source-invalidation-REHEARSAL-DRAFT.sql',
  'KB-08G-source-verification-alert-gate-REHEARSAL-DRAFT.sql',
].map(name=>readFileSync(new URL('../../docs/sql/'+name,import.meta.url),'utf8'));
const ORG_A='10000000-0000-4000-8000-000000000001';
const ORG_B='10000000-0000-4000-8000-000000000002';
const ADMIN_A='20000000-0000-4000-8000-000000000001';
const ADMIN_B='20000000-0000-4000-8000-000000000002';
const OBS_1='30000000-0000-4000-8000-000000000001';
const OBS_2='30000000-0000-4000-8000-000000000002';
const OUTSIDER='30000000-0000-4000-8000-000000000009';
const SOURCE_URL='https://sample.example.com/course';
const HASH='a'.repeat(64),BLOCK='b'.repeat(64);
const QUOTE='c'.repeat(64),PACKET='d'.repeat(64);
const NEW_HASH='e'.repeat(64),NEW_BLOCK='f'.repeat(64);
const APPROVE='select kb08e_fixture.approve_knowledge_cas_rehearsal_v1($1,$2,$3,$4,$5,$6,$7,$8,$9) as result';
const OBSERVE='select kb08g_fixture.record_synthetic_source_observation_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as result';
const BEGIN='select kb08g_fixture.begin_synthetic_verification_cycle_v1($1,$2,$3) as result';
const SCAN='select kb08g_fixture.scan_synthetic_verification_gaps_v1($1) as result';
const OBS_SIGNATURE='kb08g_fixture.record_synthetic_source_observation_v1(uuid,uuid,integer,uuid,text,text,text,text,timestamptz,text)';

function localAdmin(){
  assert.equal(process.env.SALSYS_ALLOW_LOCAL_DB_TESTS,'1');
  const url=new URL(process.env.SALSYS_TEST_DATABASE_URL||'');
  assert.equal(url.protocol,'postgres:');
  assert.ok(['127.0.0.1','localhost'].includes(url.hostname),'Never use hosted database');
  assert.equal(url.pathname,'/postgres','Never use application database');
  assert.equal(url.username,'postgres');
  assert.equal(url.search,'');
  return url;
}
async function beginAs(db,role,actor){
  await db.query('begin');
  await db.query("set local statement_timeout='8s'");
  await db.query("set local lock_timeout='6s'");
  await db.query('set local role '+role);
  if(actor){
    await db.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);
    await db.query("select set_config('request.jwt.claim.role','authenticated',true)");
  }
}
async function run(db,role,sql,values,actor){
  await beginAs(db,role,actor);
  try{
    const response=(await db.query(sql,values)).rows[0].result;
    await db.query('commit');
    return response;
  }catch(e){await db.query('rollback');throw e;}
}
function approvalParams(org,doc,fetched){
  return [org,doc,1,SOURCE_URL,HASH,BLOCK,QUOTE,fetched,PACKET];
}
function observation(org,source,cycle,observer,fetched,opts={}){
  return [
    org,source,cycle,observer,opts.url??SOURCE_URL,
    opts.snapshot??HASH,opts.block??BLOCK,opts.quote??QUOTE,
    fetched,opts.state??'active',
  ];
}
const denied=(code,message)=>error=>error?.code===code&&
  (message===undefined||error.message===message);

test('KB-08G two mock observers, missing/delayed verification and private alert gating fail closed in disposable PostgreSQL',async()=>{
  const base=localAdmin();
  const name='salsys_kb08e_'+randomUUID().replaceAll('-','').slice(0,18);
  assert.match(name,/^salsys_kb08e_[a-f0-9]{18}$/);
  const testUrl=new URL(base);testUrl.pathname='/'+name;
  const admin=new Client({connectionString:base.toString()});
  const connections=[];let created=false;
  await admin.connect();
  try{
    await admin.query('create database "'+name+'"');
    created=true;
    const open=async()=>{
      const db=new Client({connectionString:testUrl.toString()});
      connections.push(db);await db.connect();return db;
    };
    const root=await open();
    assert.equal((await root.query(
      "select to_regclass('public.organizations') as existing"
    )).rows[0].existing,null);
    await root.query(
      'create schema auth;'+
      'do $roles$ begin '+
      "if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;"+
      "if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;"+
      "if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;"+
      'end $roles$;'+
      'create function auth.uid() returns uuid language sql stable as '+
      "$$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$"
    );
    for(const sql of files)await root.query(sql);
    assert.match(files[2],/KB08G_DISPOSABLE_PARENT_FIXTURE_REQUIRED/);
    assert.doesNotMatch(files[2],/create or replace function public\./i);
    assert.doesNotMatch(files[2],/http_get|fetch\(|net\.http|cron\.schedule/i);

    const acl=(await root.query(
      "select has_function_privilege('anon',$1,'execute') as anon,"+
      "has_function_privilege('authenticated',$1,'execute') as authenticated,"+
      "has_function_privilege('service_role',$1,'execute') as service,"+
      "has_table_privilege('authenticated','kb08g_fixture.monitor_alerts','insert') as direct_alert,"+
      "has_table_privilege('service_role','kb08g_fixture.mock_observations','insert') as direct_observation,"+
      "has_table_privilege('authenticated','kb08g_fixture.synthetic_verified_eligible_knowledge','select') as retrieval",
      [OBS_SIGNATURE]
    )).rows[0];
    assert.deepEqual(acl,{
      anon:false,authenticated:false,service:true,
      direct_alert:false,direct_observation:false,retrieval:false,
    });
    const rls=(await root.query(
      "select relrowsecurity from pg_class c join pg_namespace n on c.relnamespace=n.oid "+
      "where n.nspname='kb08g_fixture' and c.relkind='r'"
    )).rows;
    assert.equal(rls.length,4);
    assert.ok(rls.every(r=>r.relrowsecurity===true));

    const fetched=new Date(Date.now()-600000).toISOString();
    const reviewed=new Date(Date.now()-540000).toISOString();
    const check1=new Date(Date.now()-480000).toISOString();
    const check2=new Date(Date.now()-420000).toISOString();
    const check3=new Date(Date.now()-360000).toISOString();
    const check4=new Date(Date.now()-300000).toISOString();
    await root.query(
      "insert into kb08e_fixture.organization_admins values "+
      "($1,$2,'owner',true),($3,$4,'admin',true)",
      [ORG_A,ADMIN_A,ORG_B,ADMIN_B]
    );
    async function source(org){
      const id=randomUUID();
      await root.query(
        "insert into kb08e_fixture.source_versions "+
        "(organization_id,id,source_url,snapshot_sha256,block_id,quote_sha256,fetched_at,state) "+
        "values($1,$2,$3,$4,$5,$6,$7,'active')",
        [org,id,SOURCE_URL,HASH,BLOCK,QUOTE,fetched]);
      await root.query(
        "insert into kb08g_fixture.source_monitors(organization_id,source_id) values($1,$2)",
        [org,id]);
      await root.query(
        "insert into kb08g_fixture.mock_observers values "+
        "($1,$2,$3,true),($4,$5,$6,true)",
        [org,id,OBS_1,org,id,OBS_2]
      );
      return id;
    }
    async function document(org,src){
      const id=randomUUID();
      await root.query(
        "insert into kb08e_fixture.documents "+
        "(organization_id,id,source_id,version,status,review_packet_sha256,reviewed_at) "+
        "values($1,$2,$3,1,'draft',$4,$5)",
        [org,id,src,PACKET,reviewed]);
      return id;
    }
    const eligible=async(org)=>(await root.query(
      "select document_id from kb08g_fixture.synthetic_verified_eligible_knowledge "+
      "where organization_id=$1 order by document_id",[org]
    )).rows.map(x=>x.document_id);
    const doc=async(org,id)=>(await root.query(
      "select status,version from kb08e_fixture.documents "+
      "where organization_id=$1 and id=$2",[org,id]
    )).rows[0];
    const monitor=async(org,src)=>(await root.query(
      "select cycle,status,verified_source_revision from kb08g_fixture.source_monitors "+
      "where organization_id=$1 and source_id=$2",[org,src]
    )).rows[0];
    const alerts=async(org,src)=>(await root.query(
      "select cycle,kind from kb08g_fixture.monitor_alerts "+
      "where organization_id=$1 and source_id=$2 order by cycle,kind",[org,src]
    )).rows;
    const holdCount=async(org,src)=>(await root.query(
      "select count(*)::int as n from kb08f_fixture.review_holds h "+
      "join kb08e_fixture.documents d on d.organization_id=h.organization_id "+
      "and d.id=h.document_id where d.organization_id=$1 and d.source_id=$2",
      [org,src]
    )).rows[0].n;

    const a=await open(),b=await open(),c=await open();
    const service=(db,query,values)=>run(db,'service_role',query,values);
    const approve=(db,actor,org,id)=>run(
      db,'authenticated',APPROVE,approvalParams(org,id,fetched),actor);

    const sA=await source(ORG_A),sB=await source(ORG_B),sGap=await source(ORG_A);
    const dA1=await document(ORG_A,sA),dA2=await document(ORG_A,sA);
    const dB=await document(ORG_B,sB),dGap=await document(ORG_A,sGap);
    await approve(a,ADMIN_A,ORG_A,dA1);
    await approve(a,ADMIN_A,ORG_A,dA2);
    await approve(b,ADMIN_B,ORG_B,dB);
    await approve(a,ADMIN_A,ORG_A,dGap);
    assert.deepEqual(await eligible(ORG_A),[],'Never retrieve before any mock verification');
    assert.deepEqual(await eligible(ORG_B),[]);

    // No single observer, unknown observer, wrong tenant or forged user role
    // can create a verified result or source review hold.
    await assert.rejects(service(a,OBSERVE,observation(
      ORG_A,sA,1,OUTSIDER,check1)),denied('42501'));
    await assert.rejects(service(a,OBSERVE,observation(
      ORG_B,sA,1,OBS_1,check1)),denied('P0001','kb08g_stale_or_closed_cycle'));
    await assert.rejects(run(a,'authenticated',OBSERVE,observation(
      ORG_A,sA,1,OBS_1,check1),ADMIN_A),denied('42501'));
    const first=await service(a,OBSERVE,observation(ORG_A,sA,1,OBS_1,check1));
    assert.equal(first.status,'awaiting_second_mock_observer');
    assert.equal(first.eligible,false);
    assert.equal(await holdCount(ORG_A,sA),0);
    assert.deepEqual(await eligible(ORG_A),[]);
    await assert.rejects(service(a,OBSERVE,observation(
      ORG_A,sA,1,OBS_1,check1)),denied('23505'),'Same observer cannot count twice');
    const second=await service(b,OBSERVE,observation(ORG_A,sA,1,OBS_2,check1));
    assert.equal(second.status,'two_mock_observations_consistent');
    assert.equal(second.synthetic_not_independent_proof,true);
    assert.equal(second.material_change,false);
    assert.equal(second.held,0);
    assert.deepEqual((await eligible(ORG_A)).sort(),[dA1,dA2].sort());
    assert.deepEqual(await alerts(ORG_A,sA),[]);

    for(const [org,src] of [[ORG_B,sB],[ORG_A,sGap]]){
      await service(a,OBSERVE,observation(org,src,1,OBS_1,check1));
      await service(b,OBSERVE,observation(org,src,1,OBS_2,check1));
    }
    assert.deepEqual(await eligible(ORG_B),[dB]);
    assert.ok((await eligible(ORG_A)).includes(dGap));

    // A new cycle with only one asserted material change cannot make holds.
    const started=await service(a,BEGIN,[ORG_A,sA,1]);
    assert.equal(started.cycle,2);
    assert.deepEqual(await eligible(ORG_A),[dGap],
      'Pending verification immediately hides previous source-A approvals');
    const proposed={snapshot:NEW_HASH,block:NEW_BLOCK};
    const early=await service(a,OBSERVE,observation(
      ORG_A,sA,2,OBS_1,check2,proposed));
    assert.equal(early.held,0);
    assert.equal(await holdCount(ORG_A,sA),0);
    assert.deepEqual(await doc(ORG_A,dA1),{status:'approved',version:2});

    // Differing quotes or hashes are a conflict warning, not a verified
    // source change and not permission to invalidate an approved answer.
    const conflict=await service(b,OBSERVE,observation(
      ORG_A,sA,2,OBS_2,check2,{snapshot:NEW_HASH,block:BLOCK}));
    assert.equal(conflict.status,'mock_observers_disagree');
    assert.equal(await holdCount(ORG_A,sA),0);
    assert.deepEqual(await eligible(ORG_A),[dGap]);
    assert.deepEqual(await alerts(ORG_A,sA),[{cycle:2,kind:'observer_conflict'}]);
    await assert.rejects(service(a,OBSERVE,observation(
      ORG_A,sA,2,OBS_1,check2,proposed)),
      denied('P0001','kb08g_stale_or_closed_cycle'));

    // Only a NEW cycle with two matching synthetic reports can invoke
    // the disposable source-change handler that moves approved docs to review.
    assert.equal((await service(a,BEGIN,[ORG_A,sA,2])).cycle,3);
    await service(a,OBSERVE,observation(ORG_A,sA,3,OBS_1,check3,proposed));
    assert.equal(await holdCount(ORG_A,sA),0);
    const changed=await service(b,OBSERVE,observation(
      ORG_A,sA,3,OBS_2,check3,proposed));
    assert.equal(changed.material_change,true);
    assert.equal(changed.held,2);
    assert.equal(changed.eligible,false);
    assert.deepEqual(await eligible(ORG_A),[dGap]);
    for(const id of [dA1,dA2]){
      assert.deepEqual(await doc(ORG_A,id),{status:'review',version:3});
    }
    assert.equal(await holdCount(ORG_A,sA),2);
    assert.deepEqual(await alerts(ORG_A,sA),[
      {cycle:2,kind:'observer_conflict'},
      {cycle:3,kind:'source_changed'},
    ]);
    assert.deepEqual(await eligible(ORG_B),[dB],'Another tenant remains unaffected');

    // A revocation agreed by both mock observers suppresses a formerly
    // eligible document and creates a real hold only within this local fixture.
    await service(a,BEGIN,[ORG_B,sB,1]);
    const revoked={snapshot:HASH,block:BLOCK,quote:QUOTE,state:'revoked'};
    await service(a,OBSERVE,observation(ORG_B,sB,2,OBS_1,check2,revoked));
    assert.equal(await holdCount(ORG_B,sB),0);
    const revokeResult=await service(b,OBSERVE,observation(
      ORG_B,sB,2,OBS_2,check2,revoked));
    assert.equal(revokeResult.held,1);
    assert.deepEqual(await eligible(ORG_B),[]);
    assert.deepEqual(await alerts(ORG_B,sB),[{cycle:2,kind:'source_revoked'}]);

    // Missing monitor evidence MUST be fail-closed even when an alert scan
    // never ran. A synthetic 25-hour-old verifier timestamp is invisible.
    await root.query(
      "update kb08g_fixture.source_monitors set last_verified_at=clock_timestamp()-interval '25 hours' "+
      "where organization_id=$1 and source_id=$2",[ORG_A,sGap]);
    assert.deepEqual(await eligible(ORG_A),[]);
    const expired=await service(c,SCAN,[ORG_A]);
    assert.deepEqual(expired,{new_synthetic_alerts:1,no_live_notifications:true});
    assert.equal((await service(c,SCAN,[ORG_A])).new_synthetic_alerts,0);
    assert.deepEqual(await alerts(ORG_A,sGap),[{cycle:1,kind:'verification_expired'}]);
    assert.equal(await holdCount(ORG_A,sGap),0,
      'Missed verification blocks retrieval but does not forge source-change holds');

    // A new cycle that remains unresolved for over 15 simulated minutes
    // emits ONE delayed alert. Repeated scans are idempotent.
    assert.equal((await service(c,BEGIN,[ORG_A,sGap,1])).cycle,2);
    await root.query(
      "update kb08g_fixture.source_monitors "+
      "set cycle_started_at=clock_timestamp()-interval '16 minutes' "+
      "where organization_id=$1 and source_id=$2",[ORG_A,sGap]);
    assert.deepEqual(await eligible(ORG_A),[]);
    assert.equal((await service(c,SCAN,[ORG_A])).new_synthetic_alerts,1);
    assert.equal((await service(c,SCAN,[ORG_A])).new_synthetic_alerts,0);
    assert.deepEqual(await alerts(ORG_A,sGap),[
      {cycle:1,kind:'verification_expired'},
      {cycle:2,kind:'verification_delayed'},
    ]);
    assert.deepEqual(await doc(ORG_A,dGap),{status:'approved',version:2});

    // Recovery requires a new paired mock observation of unchanged content.
    await service(a,OBSERVE,observation(ORG_A,sGap,2,OBS_1,check4));
    const recovered=await service(b,OBSERVE,observation(
      ORG_A,sGap,2,OBS_2,check4));
    assert.equal(recovered.material_change,false);
    assert.equal(recovered.held,0);
    assert.deepEqual(await eligible(ORG_A),[dGap]);
    assert.equal((await monitor(ORG_A,sGap)).status,'verified');
    assert.equal(await holdCount(ORG_A,sGap),0);
    assert.deepEqual(await alerts(ORG_A,sGap),[
      {cycle:1,kind:'verification_expired'},
      {cycle:2,kind:'verification_delayed'},
    ],'Historical mock alerts remain retained without live notifications');
  }finally{
    await Promise.allSettled(connections.map(db=>db.end()));
    try{if(created)await admin.query('drop database "'+name+'" with (force)');}
    finally{await admin.end();}
  }
});
