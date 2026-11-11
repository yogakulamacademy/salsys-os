import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const {Client}=pg;
const sqlFiles=[
  './knowledge-discovery.foundation.sql',
  '../../docs/sql/KB-01B-discovery-schema-DRAFT.sql',
  '../../docs/sql/KB-06A-discovery-consent-execution-DRAFT.sql',
  '../../docs/sql/KB-06B-audited-discovery-consent-lifecycle-DRAFT.sql',
  '../../docs/sql/KB-09F-commit-side-ownership-guard-REHEARSAL-DRAFT.sql',
].map(path=>readFileSync(new URL(path,import.meta.url),'utf8'));
const [foundation,discovery,consentA,consentB,guard]=sqlFiles;

const ORG_A='10000000-0000-4000-8000-000000000001';
const ORG_B='10000000-0000-4000-8000-000000000002';
const ADMIN_A='20000000-0000-4000-8000-000000000001';
const ADMIN_B='20000000-0000-4000-8000-000000000002';
const SID_A='30000000-0000-4000-8000-000000000001';
const SID_B='30000000-0000-4000-8000-000000000002';
const SITE_URL='https://fixture.example.com/';
const HOST='fixture.example.com';
const SHA='a'.repeat(64);
const POLICY_SHA='b'.repeat(64);
const CLAIM='select * from public.claim_knowledge_discovery_job_v1()';
const OLD_COMMIT='select public.commit_knowledge_discovery_page_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) as result';
const SAFE_COMMIT='select kb09f_fixture.commit_page_with_current_proof_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) as result';
const WITHDRAW='select public.withdraw_knowledge_discovery_consent_v1($1,$2,$3) as result';
const SAFE_SIG='kb09f_fixture.commit_page_with_current_proof_v1(uuid,uuid,uuid,uuid,text,integer,text,text,text,jsonb,integer)';
const OLD_SIG='public.commit_knowledge_discovery_page_v1(uuid,uuid,uuid,uuid,text,integer,text,text,text,jsonb,integer)';

function requireLocalPostgres(){
  assert.equal(process.env.SALSYS_ALLOW_LOCAL_DB_TESTS,'1');
  const url=new URL(process.env.SALSYS_TEST_DATABASE_URL||'');
  assert.equal(url.protocol,'postgres:');
  assert.ok(['127.0.0.1','localhost'].includes(url.hostname),'Never connect to hosted SQL');
  assert.equal(url.pathname,'/postgres','Must create a new disposable database');
  assert.equal(url.username,'postgres');
  assert.equal(url.search,'');
  return url;
}
async function beginAs(db,role,actor=ADMIN_A,session=SID_A){
  await db.query('begin');
  await db.query("set local statement_timeout='9s'");
  await db.query("set local lock_timeout='7s'");
  await db.query('set local role '+role);
  await db.query("select set_config('request.jwt.claims',$1,true)",[
    JSON.stringify({role,sub:actor,session_id:session}),
  ]);
}
async function callAs(db,role,query,args=[],actor=ADMIN_A,session=SID_A){
  await beginAs(db,role,actor,session);
  try{
    const r=await db.query(query,args);
    await db.query('commit');
    return r;
  }catch(e){await db.query('rollback');throw e;}
}
const isCode=code=>e=>e?.code===code;
function safeArgs(org,job,lease,status='fetched'){
  return [org,job.id,job.page,lease,status,200,'text/html',
    'Synthetic website',null,'[]',2];
}
async function pauseForLock(){
  await new Promise(resolve=>setTimeout(resolve,100));
}

test('KB-09F checks current domain ownership at commit under job/proof/consent locks in disposable DB',async()=>{
  const base=requireLocalPostgres();
  const name='salsys_kb09f_'+randomUUID().replaceAll('-','').slice(0,18);
  assert.match(name,/^salsys_kb09f_[a-f0-9]{18}$/);
  const url=new URL(base);url.pathname='/'+name;
  const admin=new Client({connectionString:base.toString()});
  const connections=[];let created=false;
  await admin.connect();
  try{
    await admin.query('create database "'+name+'"');created=true;
    const open=async()=>{
      const db=new Client({connectionString:url.toString()});
      connections.push(db);await db.connect();return db;
    };
    const root=await open();
    assert.equal((await root.query(
      "select to_regclass('public.organizations') as present"
    )).rows[0].present,null,'Fixture must start empty');
    await root.query(foundation);
    await root.query(discovery);
    await root.query(consentA);

    // The *existing* KB-06B audited withdrawal uses real tenant-session
    // contracts. Add only the local test stand-ins it expects.
    await root.query([
      "alter table public.organizations add column status text not null default 'active'",
      "create table public.organization_members(organization_id uuid not null,user_id uuid not null,role text not null,active boolean not null)",
      "create table public.tenant_session_bindings(session_id uuid primary key,user_id uuid not null,organization_id uuid not null)",
      "create table auth.sessions(id uuid primary key,user_id uuid not null)",
      "create function auth.uid() returns uuid language sql stable as $q$ select nullif(auth.jwt()->>'sub','')::uuid $q$",
      "grant usage on schema auth to authenticated",
      "grant execute on function auth.uid() to authenticated",
    ].join(';\n')+';');
    await root.query(consentB);
    await root.query(guard); // Guarded private function, NEVER a migration.
    assert.match(guard,/KB09F_DISPOSABLE_PARENT_FIXTURE_REQUIRED/);
    assert.doesNotMatch(guard,/create or replace function public\./i);
    assert.doesNotMatch(guard,/cron\.schedule|net\.http|http_get/i);

    const acl=(await root.query(
      "select has_function_privilege('anon',$1,'execute') as anon,"+
      "has_function_privilege('authenticated',$1,'execute') as client,"+
      "has_function_privilege('service_role',$1,'execute') as service,"+
      "has_function_privilege('service_role',$2,'execute') as old_service,"+
      "has_function_privilege('authenticated',$2,'execute') as old_client",
      [SAFE_SIG,OLD_SIG]
    )).rows[0];
    assert.deepEqual(acl,{
      anon:false,client:false,service:true,old_service:false,old_client:false,
    },'Old RPC must not bypass the proof guard in the local fixture');

    await root.query('insert into public.organizations(id) values($1),($2)',[ORG_A,ORG_B]);
    await root.query(
      "insert into public.test_knowledge_admins(organization_id,user_id) "+
      "values($1,$2),($3,$4)",[ORG_A,ADMIN_A,ORG_B,ADMIN_B]);
    await root.query(
      "insert into public.organization_members(organization_id,user_id,role,active) "+
      "values($1,$2,'owner',true),($3,$4,'admin',true)",
      [ORG_A,ADMIN_A,ORG_B,ADMIN_B]
    );
    await root.query(
      'insert into auth.sessions(id,user_id) values($1,$2),($3,$4)',
      [SID_A,ADMIN_A,SID_B,ADMIN_B]
    );
    await root.query(
      "insert into public.tenant_session_bindings(session_id,user_id,organization_id) "+
      "values($1,$2,$3),($4,$5,$6)",
      [SID_A,ADMIN_A,ORG_A,SID_B,ADMIN_B,ORG_B]
    );

    for(const [org,user,sid] of [
      [ORG_A,ADMIN_A,SID_A],[ORG_B,ADMIN_B,SID_B]
    ]){
      await root.query(
        "insert into public.knowledge_discovery_domain_verifications "+
        "(organization_id,hostname,challenge_hash,created_by,issued_at,"+
        "challenge_expires_at,verified_at,verified_until) "+
        "values($1,$2,$3,$4,now()-interval '1 hour',"+
        "now()+interval '1 hour',now()-interval '3 minutes',"+
        "now()+interval '30 minutes')",
        [org,HOST,SHA,user]
      );
      const consentId=(await root.query(
        "insert into public.knowledge_discovery_site_consents "+
        "(organization_id,hostname,purpose,status,policy_version,"+
        "granted_by,granted_at,valid_until,revision) "+
        "values($1,$2,'website_discovery_review_only','granted',"+
        "'synthetic-policy', $3,now()-interval '20 minutes',"+
        "now()+interval '30 minutes',1) returning id",
        [org,HOST,user]
      )).rows[0].id;
      await root.query(
        "insert into public.knowledge_discovery_consent_audit "+
        "(consent_id,organization_id,hostname,action,actor_id,session_id,"+
        "policy_version,policy_sha256,revision,valid_until) "+
        "values($1,$2,$3,'granted',$4,$5,'synthetic-policy',$6,1,"+
        "now()+interval '30 minutes')",
        [consentId,org,HOST,user,sid,POLICY_SHA]
      );
    }
    const a=await open(),b=await open(),c=await open();
    async function prepareJob(org){
      await root.query(
        "update public.knowledge_discovery_jobs set "+
        "created_at=now()-interval '26 hours' "+
        "where organization_id=$1 and status not in ('queued','running')",[org]);
      const id=(await root.query(
        "insert into public.knowledge_discovery_jobs "+
        "(organization_id,created_by,seed_url,max_pages) "+
        "values($1,$2,$3,3) returning id",
        [org,org===ORG_A?ADMIN_A:ADMIN_B,SITE_URL]
      )).rows[0].id;
      const page=(await root.query(
        "insert into public.knowledge_discovery_pages "+
        "(organization_id,job_id,url,depth,status) "+
        "values($1,$2,$3,0,'discovered') returning id",[org,id,SITE_URL]
      )).rows[0].id;
      const claims=(await callAs(a,'service_role',CLAIM)).rows;
      assert.equal(claims.length,1);
      assert.equal(claims[0].organization_id,org);
      assert.equal(claims[0].job_id,id);
      return {id,page,lease:claims[0].lease_token};
    }
    const safe=(db,org,job,token=job.lease)=>
      callAs(db,'service_role',SAFE_COMMIT,safeArgs(org,job,token));
    const page=async job=>(await root.query(
      "select status,page_title,processed_at from public.knowledge_discovery_pages "+
      "where id=$1",[job.page]
    )).rows[0];
    const state=async job=>(await root.query(
      "select status,lease_token from public.knowledge_discovery_jobs where id=$1",
      [job.id]
    )).rows[0];
    const proof=async(org,until)=>
      root.query(
        "update public.knowledge_discovery_domain_verifications "+
        "set verified_at=now()-interval '3 minutes',"+
        "verified_until="+until+" where organization_id=$1",[org]);
    const renew=org=>proof(org,"now()+interval '30 minutes'");
    const expire=org=>proof(org,"now()-interval '1 second'");
    const retire=job=>root.query(
      "update public.knowledge_discovery_jobs set status='cancelled',"+
      "lease_until=null,lease_token=null,finished_at=now() "+
      "where id=$1 and status='running'",[job.id]);
    const actualWithdraw=(db,org,actor,sid)=>
      callAs(db,'authenticated',WITHDRAW,[org,HOST,1],actor,sid);

    // Explicitly deny the previous unguarded RPC and non-service callers.
    const first=await prepareJob(ORG_A);
    await assert.rejects(callAs(b,'service_role',OLD_COMMIT,
      safeArgs(ORG_A,first,first.lease)),isCode('42501'));
    await assert.rejects(callAs(b,'authenticated',SAFE_COMMIT,
      safeArgs(ORG_A,first,first.lease)),isCode('42501'));
    assert.equal((await safe(b,ORG_B,first)).rows[0].result.reason,
      'inactive_or_stale_lease','Wrong tenant cannot commit');
    assert.equal((await safe(b,ORG_A,first,randomUUID())).rows[0].result.reason,
      'inactive_or_stale_lease','Wrong token cannot commit');
    assert.equal((await page(first)).status,'discovered');
    const accepted=(await safe(b,ORG_A,first)).rows[0].result;
    assert.equal(accepted.ok,true,'Valid proof and consent are accepted');
    assert.equal((await page(first)).status,'fetched');
    assert.equal((await page(first)).page_title,'Synthetic website');
    assert.equal((await state(first)).status,'completed');

    // Proof expiration AFTER claim must not permit any page/title mutation.
    const expired=await prepareJob(ORG_A);
    await expire(ORG_A);
    assert.deepEqual((await safe(b,ORG_A,expired)).rows[0].result,
      {ok:false,reason:'ownership_proof_not_current'});
    assert.equal((await page(expired)).status,'discovered');
    assert.equal((await page(expired)).page_title,null);
    assert.equal((await state(expired)).status,'running',
      'This guard does not pretend to cancel a lease');
    await retire(expired);
    await renew(ORG_A);

    // A restored proof after a stale denial must allow the same valid lease.
    const renewed=await prepareJob(ORG_A);
    await expire(ORG_A);
    assert.equal((await safe(b,ORG_A,renewed)).rows[0].result.ok,false);
    await renew(ORG_A);
    assert.equal((await safe(b,ORG_A,renewed)).rows[0].result.ok,true);
    assert.equal((await state(renewed)).status,'completed');

    // Simulate proof revocation independently of expiry: a null verification
    // is denied even with a live lease and previously granted consent.
    const revoked=await prepareJob(ORG_A);
    await root.query(
      "update public.knowledge_discovery_domain_verifications "+
      "set verified_at=null,verified_until=null where organization_id=$1",
      [ORG_A]
    );
    assert.equal((await safe(b,ORG_A,revoked)).rows[0].result.reason,
      'ownership_proof_not_current');
    assert.equal((await page(revoked)).status,'discovered');
    await retire(revoked);
    await renew(ORG_A);

    // A pending proof update wins first: commit wrapper must wait for the
    // proof row lock and then see the new expired value, with NO page write.
    const proofFirst=await prepareJob(ORG_A);
    await b.query('begin');
    await b.query("set local lock_timeout='7s'");
    await b.query(
      "update public.knowledge_discovery_domain_verifications "+
      "set verified_until=now()-interval '1 second' where organization_id=$1",
      [ORG_A]
    );
    await beginAs(c,'service_role');
    let checkedFinished=false;
    const late=c.query(SAFE_COMMIT,safeArgs(
      ORG_A,proofFirst,proofFirst.lease
    )).then(value=>({ok:true,value}),error=>({ok:false,error}))
      .finally(()=>{checkedFinished=true;});
    await pauseForLock();
    assert.equal(checkedFinished,false,'Proof change holds the verification lock');
    await b.query('commit');
    const afterProof=await late;
    assert.equal(afterProof.ok,true);
    assert.deepEqual(afterProof.value.rows[0].result,
      {ok:false,reason:'ownership_proof_not_current'});
    await c.query('commit');
    assert.equal((await page(proofFirst)).status,'discovered');
    await retire(proofFirst);
    await renew(ORG_A);

    // Commit wins first: a competing proof expiry waits for the proof-lock.
    // It may expire AFTER the committed page; that earlier write is not
    // retroactively erased by this prototype.
    const commitFirst=await prepareJob(ORG_A);
    await beginAs(c,'service_role');
    const confirmed=(await c.query(SAFE_COMMIT,safeArgs(
      ORG_A,commitFirst,commitFirst.lease
    ))).rows[0].result;
    assert.equal(confirmed.ok,true);
    await b.query('begin');
    await b.query("set local lock_timeout='7s'");
    let expiryFinished=false;
    const lateExpiry=b.query(
      "update public.knowledge_discovery_domain_verifications "+
      "set verified_until=now()-interval '1 second' where organization_id=$1",
      [ORG_A]
    ).then(value=>({ok:true,value}),error=>({ok:false,error}))
      .finally(()=>{expiryFinished=true;});
    await pauseForLock();
    assert.equal(expiryFinished,false,'Update must wait for verified proof row');
    await c.query('commit');
    const afterCommit=await lateExpiry;
    assert.equal(afterCommit.ok,true);
    await b.query('commit');
    assert.equal((await page(commitFirst)).status,'fetched');
    assert.equal((await state(commitFirst)).status,'completed');
    await renew(ORG_A);

    // Actual KB-06B withdrawal AFTER an approved page commit: the audited
    // withdrawal waits for the job row, then revokes consent. Earlier
    // transaction-bound page metadata remains (no retroactive delete).
    const committedBeforeWithdrawal=await prepareJob(ORG_B);
    await beginAs(c,'service_role',ADMIN_B,SID_B);
    assert.equal((await c.query(SAFE_COMMIT,safeArgs(
      ORG_B,committedBeforeWithdrawal,committedBeforeWithdrawal.lease
    ))).rows[0].result.ok,true);
    await beginAs(b,'authenticated',ADMIN_B,SID_B);
    let withdrawnLater=false;
    const lateWithdraw=b.query(WITHDRAW,[ORG_B,HOST,1])
      .then(value=>({ok:true,value}),error=>({ok:false,error}))
      .finally(()=>{withdrawnLater=true;});
    await pauseForLock();
    assert.equal(withdrawnLater,false,
      'Actual withdrawal must wait for the worker job row');
    await c.query('commit');
    const afterWithdrawal=await lateWithdraw;
    assert.equal(afterWithdrawal.ok,true);
    assert.equal(afterWithdrawal.value.rows[0].result.status,'withdrawn');
    await b.query('commit');
    assert.equal((await page(committedBeforeWithdrawal)).status,'fetched');
    assert.equal((await state(committedBeforeWithdrawal)).status,'completed');

    // Actual KB-06B audited withdrawal wins first: job is cancelled and a
    // later worker can never commit its old lease or page metadata.
    const revokedBeforeCommit=await prepareJob(ORG_A);
    await beginAs(b,'authenticated',ADMIN_A,SID_A);
    const withdrawn=(await b.query(WITHDRAW,[ORG_A,HOST,1])).rows[0].result;
    assert.equal(withdrawn.ok,true);
    assert.equal(withdrawn.jobsCancelled,1);
    await beginAs(c,'service_role');
    let commitFinished=false;
    const lateWorker=c.query(SAFE_COMMIT,safeArgs(
      ORG_A,revokedBeforeCommit,revokedBeforeCommit.lease
    )).then(value=>({ok:true,value}),error=>({ok:false,error}))
      .finally(()=>{commitFinished=true;});
    await pauseForLock();
    assert.equal(commitFinished,false,'Worker must wait for withdrawn job lock');
    await b.query('commit');
    const deniedAfterWithdraw=await lateWorker;
    assert.equal(deniedAfterWithdraw.ok,true);
    assert.deepEqual(deniedAfterWithdraw.value.rows[0].result,
      {ok:false,reason:'inactive_or_stale_lease'});
    await c.query('commit');
    assert.equal((await page(revokedBeforeCommit)).status,'discovered');
    assert.equal((await state(revokedBeforeCommit)).status,'cancelled');
    const audit=(await root.query(
      "select action,job_cancellations from public.knowledge_discovery_consent_audit "+
      "where organization_id=$1 and action='withdrawn'",[ORG_A]
    )).rows;
    assert.deepEqual(audit,[{action:'withdrawn',job_cancellations:1}]);

    // A tenant-B withdrawal does not affect A's history or vice versa.
    assert.equal((await root.query(
      "select count(*)::int as n from public.knowledge_discovery_consent_audit "+
      "where organization_id=$1 and action='withdrawn'",[ORG_B]
    )).rows[0].n,1);
    assert.equal((await root.query(
      "select count(*)::int as n from public.knowledge_discovery_pages "+
      "where organization_id=$1 and status='fetched'",[ORG_A]
    )).rows[0].n,3);
  }finally{
    await Promise.allSettled(connections.map(db=>db.end()));
    try{if(created)await admin.query('drop database "'+name+'" with (force)');}
    finally{await admin.end();}
  }
});
