import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const {Client}=pg;
const sqlFiles=[
  './knowledge-discovery.foundation.sql',
  '../../docs/sql/KB-01B-discovery-schema-DRAFT.sql',
  '../../docs/sql/KB-06A-discovery-consent-execution-DRAFT.sql',
  '../../docs/sql/KB-06B-audited-discovery-consent-lifecycle-DRAFT.sql',
  '../../docs/sql/KB-09F-commit-side-ownership-guard-REHEARSAL-DRAFT.sql',
  '../../docs/sql/KB-09G-direct-write-boundary-REHEARSAL-DRAFT.sql',
  '../../docs/sql/KB-09H-tenant-cancel-and-seed-failure-CAS-REHEARSAL-DRAFT.sql',
  '../../docs/sql/KB-09I-discovery-public-rpc-bridge-REHEARSAL-DRAFT.sql',
  '../../docs/sql/KB-09J-atomic-session-authorized-enqueue-REHEARSAL-DRAFT.sql',
  '../../docs/sql/KB-09K-proof-consent-direct-DML-boundary-REHEARSAL-DRAFT.sql',
  '../../docs/sql/KB-09L-proof-preimage-operator-hold-REHEARSAL-DRAFT.sql',
  '../../docs/sql/KB-09M-proof-checked-worker-commit-bridge-REHEARSAL-DRAFT.sql',
  '../../docs/sql/KB-09N-retired-seed-rpc-and-acl-preflight-REHEARSAL-DRAFT.sql',
  '../../docs/sql/KB-09S-atomic-website-evidence-REHEARSAL-DRAFT.sql',
].map(path=>readFileSync(new URL(path,import.meta.url),'utf8'));
const [foundation,discovery,consentA,consentB,guard,writeGuard,jobFinalization,rpcBridge,atomicEnqueue,proofBoundary,preimageAndPolicyHold,checkedCommitBridge,retiredSeedAudit,atomicEvidenceRehearsal]=sqlFiles;

const ORG_A='10000000-0000-4000-8000-000000000001';
const ORG_B='10000000-0000-4000-8000-000000000002';
const ADMIN_A='20000000-0000-4000-8000-000000000001';
const ADMIN_B='20000000-0000-4000-8000-000000000002';
const SID_A='30000000-0000-4000-8000-000000000001';
const SID_B='30000000-0000-4000-8000-000000000002';
const ORG_C='10000000-0000-4000-8000-000000000003';
const ORG_D='10000000-0000-4000-8000-000000000004';
const ORG_E='10000000-0000-4000-8000-000000000005';
const ADMIN_C='20000000-0000-4000-8000-000000000003';
const ADMIN_D='20000000-0000-4000-8000-000000000004';
const ADMIN_E='20000000-0000-4000-8000-000000000005';
const SID_C='30000000-0000-4000-8000-000000000003';
const SID_D='30000000-0000-4000-8000-000000000004';
const SID_E='30000000-0000-4000-8000-000000000005';
const SITE_URL='https://fixture.example.com/';
const HOST='fixture.example.com';
const SHA='a'.repeat(64);
const POLICY_SHA='b'.repeat(64);
const CLAIM='select * from public.claim_knowledge_discovery_job_v1()';
const OLD_COMMIT='select public.commit_knowledge_discovery_page_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) as result';
const SAFE_COMMIT='select kb09f_fixture.commit_page_with_current_proof_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) as result';
const WITHDRAW='select public.withdraw_knowledge_discovery_consent_v1($1,$2,$3) as result';
// Exercise the exact PUBLIC RPC names used by app/api/knowledge/discovery/route.ts.
const CANCEL_JOB='select public.cancel_knowledge_discovery_job_v1($1,$2) as result';
const SEED_FAILURE='select public.fail_knowledge_discovery_seed_v1($1,$2,$3) as result';
const ENQUEUE='select public.enqueue_knowledge_discovery_job_v1($1,$2,$3) as result';
const ENQUEUE_SIG='public.enqueue_knowledge_discovery_job_v1(uuid,text,integer)';
const PROOF_ISSUE="select public.issue_knowledge_discovery_challenge_for_admin_v1($1,$2,$3) as expiry";
const PROOF_CLAIM="select public.claim_knowledge_discovery_proof_check_for_admin_v1($1,$2,$3) as allowed";
const PROOF_FINISH="select public.confirm_checked_knowledge_discovery_proof_v1($1,$2,$3) as result";
const PROOF_PREIMAGE="select public.confirm_checked_knowledge_discovery_proof_v2($1,$2,$3) as result";
const PUBLIC_SAFE_COMMIT='select public.commit_knowledge_discovery_page_with_proof_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) as result';
const PUBLIC_SAFE_COMMIT_SIG='public.commit_knowledge_discovery_page_with_proof_v1(uuid,uuid,uuid,uuid,text,integer,text,text,text,jsonb,integer)';
const CANCEL_SIG='kb09h_fixture.cancel_job_for_current_admin_v1(uuid,uuid)';
const FAILURE_SIG='kb09h_fixture.fail_unseeded_queued_job_v1(uuid,uuid,uuid)';
const PUBLIC_CANCEL_SIG='public.cancel_knowledge_discovery_job_v1(uuid,uuid)';
const PUBLIC_FAILURE_SIG='public.fail_knowledge_discovery_seed_v1(uuid,uuid,uuid)';
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
async function beginAs(db,role,actor=ADMIN_A,session=SID_A,jwtRole=role){
  await db.query('begin');
  await db.query("set local statement_timeout='9s'");
  await db.query("set local lock_timeout='7s'");
  await db.query('set local role '+role);
  await db.query("select set_config('request.jwt.claims',$1,true)",[
    JSON.stringify({role:jwtRole,sub:actor,session_id:session}),
  ]);
}
async function callAs(db,role,query,args=[],actor=ADMIN_A,session=SID_A,jwtRole=role){
  await beginAs(db,role,actor,session,jwtRole);
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

test('KB-09F/G/H proof, BYPASSRLS, tenant-finalization, consent and commit races in disposable DB',async()=>{
  const base=requireLocalPostgres();
  const name='salsys_kb09f_'+randomUUID().replaceAll('-','').slice(0,18);
  assert.match(name,/^salsys_kb09f_[a-f0-9]{18}$/);
  const url=new URL(base);url.pathname='/'+name;
  const admin=new Client({connectionString:base.toString()});
  const connections=[];let created=false;let bypassRole=null;
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

    // KB-09G: reality check. Supabase's actual service_role BYPASSES RLS.
    // The earlier synthetic "service_role" in this fixture does not have
    // BYPASSRLS; create a unique cluster-local test role that inherits its
    // grants and explicitly bypasses RLS, then drop it before test exit.
    bypassRole='kb09g_writer_'+randomUUID().replaceAll('-','').slice(0,12);
    assert.match(bypassRole,/^kb09g_writer_[a-f0-9]{12}$/);
    await root.query('create role "'+bypassRole+'" nologin inherit bypassrls');
    await root.query('grant service_role to "'+bypassRole+'"');
    assert.equal((await root.query(
      'select rolbypassrls from pg_roles where rolname=$1',[bypassRole]
    )).rows[0].rolbypassrls,true);
    assert.equal((await root.query(
      "select has_table_privilege($1,'public.knowledge_discovery_pages','update') as allowed",
      [bypassRole]
    )).rows[0].allowed,true,'BYPASSRLS role inherits dangerous direct UPDATE');

    // The old RPC is already revoked by KB-09F, but a privileged direct
    // page mutation is still possible even when current ownership EXPIRED.
    const unguarded=await prepareJob(ORG_A);
    await expire(ORG_A);
    await assert.rejects(
      callAs(b,bypassRole,OLD_COMMIT,safeArgs(
        ORG_A,unguarded,unguarded.lease
      ),ADMIN_A,SID_A,'service_role'),
      isCode('42501'),'Old RPC revocation is real but insufficient'
    );
    const bypass=(await callAs(b,bypassRole,
      "update public.knowledge_discovery_pages set "+
      "status='fetched',page_title='synthetic-direct-bypass',"+
      "processed_at=clock_timestamp() where id=$1 returning id",
      [unguarded.page],ADMIN_A,SID_A,'service_role')).rows;
    assert.equal(bypass.length,1,
      'Direct privileged DML bypasses ownership/consent-aware RPC');
    assert.equal((await page(unguarded)).page_title,'synthetic-direct-bypass');
    await root.query(
      "update public.knowledge_discovery_pages set "+
      "status='discovered',page_title=null,processed_at=null where id=$1",
      [unguarded.page]
    );
    await retire(unguarded);

    // KB-09G is explicitly NOT a migration: only alter grants and add
    // insert-state triggers in this already-guarded random local DB.
    await root.query(writeGuard);
    await root.query(jobFinalization);
    await root.query(rpcBridge);
    assert.match(rpcBridge,/KB09I_DISPOSABLE_PARENT_FIXTURE_REQUIRED/);
    assert.doesNotMatch(rpcBridge,/create or replace function public\./i);
    assert.doesNotMatch(rpcBridge,/cron\.schedule|net\.http|http_get/i);
    const exposedRpcPrivileges=(await root.query(
      "select has_function_privilege('anon',$1,'execute') as anon_cancel,"+
      "has_function_privilege('authenticated',$1,'execute') as admin_cancel,"+
      "has_function_privilege('service_role',$1,'execute') as service_cancel,"+
      "has_function_privilege('anon',$2,'execute') as anon_failure,"+
      "has_function_privilege('authenticated',$2,'execute') as user_failure,"+
      "has_function_privilege('service_role',$2,'execute') as service_failure",
      [PUBLIC_CANCEL_SIG,PUBLIC_FAILURE_SIG]
    )).rows[0];
    assert.deepEqual(exposedRpcPrivileges,{
      anon_cancel:false,admin_cancel:true,service_cancel:false,
      anon_failure:false,user_failure:false,service_failure:true,
    },'PUBLIC RPC bridge must not add extra privileged callers');
    assert.match(jobFinalization,/KB09H_DISPOSABLE_PARENT_FIXTURE_REQUIRED/);
    assert.doesNotMatch(jobFinalization,/create or replace function public\./i);
    assert.doesNotMatch(jobFinalization,/cron\.schedule|net\.http|http_get/i);
    const finalizationPrivileges=(await root.query(
      "select has_function_privilege('authenticated',$1,'execute') as user_cancel,"+
      "has_function_privilege('service_role',$1,'execute') as svc_cancel,"+
      "has_function_privilege('authenticated',$2,'execute') as user_seed,"+
      "has_function_privilege('service_role',$2,'execute') as svc_seed,"+
      "has_table_privilege('authenticated','kb09h_fixture.job_finalization_audit','insert') as user_audit,"+
      "has_table_privilege('service_role','kb09h_fixture.job_finalization_audit','insert') as svc_audit",
      [CANCEL_SIG,FAILURE_SIG]
    )).rows[0];
    assert.deepEqual(finalizationPrivileges,{
      user_cancel:true,svc_cancel:false,user_seed:false,svc_seed:true,
      user_audit:false,svc_audit:false,
    });
    assert.match(writeGuard,/KB09G_DISPOSABLE_PARENT_FIXTURE_REQUIRED/);
    assert.doesNotMatch(writeGuard,/create or replace function public\./i);
    for(const table of ['knowledge_discovery_pages','knowledge_discovery_jobs']){
      const perms=(await root.query(
        "select "+
        "has_table_privilege($1,'public."+table+"','update') as update,"+
        "has_table_privilege($1,'public."+table+"','delete') as delete,"+
        "has_table_privilege($1,'public."+table+"','truncate') as truncate,"+
        "has_table_privilege($1,'public."+table+"','trigger') as trigger,"+
        "has_table_privilege($1,'public."+table+"','insert') as insert",
        [bypassRole]
      )).rows[0];
      assert.deepEqual(perms,{
        update:false,delete:false,truncate:false,trigger:false,insert:true,
      },'Privileged mutations must be blocked without disrupting seed inserts');
      await assert.rejects(
        callAs(b,bypassRole,
          "update public."+table+" set "+
          (table==='knowledge_discovery_pages'
            ? "page_title='unsafe-bypass' where id=$1"
            : "status='completed' where id=$1"),
          [table==='knowledge_discovery_pages'?unguarded.page:unguarded.id],
          ADMIN_A,SID_A,'service_role'),
        isCode('42501'),'Direct table UPDATE must be denied'
      );
      await assert.rejects(
        callAs(b,bypassRole,"truncate public."+table,[],
          ADMIN_A,SID_A,'service_role'),
        isCode('42501'),'TRUNCATE is included in GRANT ALL and must be denied'
      );
    }
    await assert.rejects(
      callAs(b,bypassRole,
        "insert into public.knowledge_discovery_pages "+
        "(organization_id,job_id,url,depth,status,page_title) "+
        "values($1,$2,$3,0,'fetched','forged')",
        [ORG_A,unguarded.id,'https://fixture.example.com/forged-fetched'],
        ADMIN_A,SID_A,'service_role'),
      isCode('42501'),'Fake processed pages cannot be inserted directly'
    );
    await assert.rejects(
      callAs(b,bypassRole,
        "insert into public.knowledge_discovery_jobs "+
        "(organization_id,created_by,seed_url,status) "+
        "values($1,$2,$3,'completed')",
        [ORG_A,ADMIN_A,SITE_URL],ADMIN_A,SID_A,'service_role'),
      isCode('42501'),'Fake completed jobs cannot be inserted directly'
    );

    // These two direct INSERT paths remain intentionally permitted for the
    // existing API. They ALSO remain risky: page discovery and job creation
    // need future tenant-bound DB authorization, not just an app check.
    const residual=(await callAs(b,bypassRole,
      "insert into public.knowledge_discovery_pages "+
      "(organization_id,job_id,url,depth,status) "+
      "values($1,$2,$3,0,'discovered') returning id",
      [ORG_A,unguarded.id,'https://fixture.example.com/residual-discovery'],
      ADMIN_A,SID_A,'service_role')).rows;
    assert.equal(residual.length,1,
      'Seed/link INSERT remains allowed; this is a documented residual risk');

    // Approved SQL SECURITY DEFINER page commits still work after direct
    // UPDATE is revoked, so privilege closure need not break the worker RPC.
    await renew(ORG_A);
    const restricted=await prepareJob(ORG_A);
    const permitted=(await callAs(b,'service_role',SAFE_COMMIT,
      safeArgs(ORG_A,restricted,restricted.lease,'skipped'))).rows[0].result;
    assert.equal(permitted.ok,true);
    assert.equal((await page(restricted)).status,'skipped');

    // Time-of-check vs actual COMMIT remains a separate limitation. Proof
    // may expire *after* the SQL wrapper returned a successful result, while
    // a caller holds the transaction open. This is a negative rehearsal,
    // NOT a claim that expiry is enforced at external COMMIT time.
    const held=await prepareJob(ORG_A);
    await root.query(
      "update public.knowledge_discovery_domain_verifications "+
      "set verified_until=clock_timestamp()+interval '3 seconds' "+
      "where organization_id=$1",[ORG_A]
    );
    await beginAs(c,'service_role');
    const ack=(await c.query(SAFE_COMMIT,
      safeArgs(ORG_A,held,held.lease,'skipped'))).rows[0].result;
    assert.equal(ack.ok,true,'Proof is valid at invocation time');
    await c.query('select pg_sleep(3.2)');
    await c.query('commit');
    assert.equal((await root.query(
      "select verified_until<clock_timestamp() as expired "+
      "from public.knowledge_discovery_domain_verifications "+
      "where organization_id=$1",[ORG_A]
    )).rows[0].expired,true);
    assert.equal((await page(held)).status,'skipped',
      'An outer transaction can commit after proof expiry: unresolved gap');
    await renew(ORG_A);

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

    // KB-09H: private, session-scoped cancellation and exact seed-failure
    // state transitions. These are NOT connected to the draft HTTP API.
    const cancelJob=(db,org,id,actor=ADMIN_A,session=SID_A)=>
      callAs(db,'authenticated',CANCEL_JOB,[org,id],actor,session);
    const seedFailed=(db,org,id,creator)=>
      callAs(db,'service_role',SEED_FAILURE,[org,id,creator]);
    const jobAudit=async(org,id)=>(await root.query(
      "select action,initiator,actor_id,session_id,job_created_by,"+
      "previous_status,final_status from kb09h_fixture.job_finalization_audit "+
      "where organization_id=$1 and job_id=$2",[org,id]
    )).rows;
    const enqueueUnseeded=async(org=ORG_A)=>{
      await root.query(
        "update public.knowledge_discovery_jobs set "+
        "created_at=now()-interval '26 hours' "+
        "where organization_id=$1 and status not in ('queued','running')",[org]
      );
      return (await root.query(
        "insert into public.knowledge_discovery_jobs "+
        "(organization_id,created_by,seed_url,max_pages,status) "+
        "values($1,$2,$3,3,'queued') returning id",
        [org,org===ORG_A?ADMIN_A:ADMIN_B,SITE_URL]
      )).rows[0].id;
    };

    // Tenant/session cannot be inferred from a caller's job ID or forged
    // actor argument. The KB-06B session-aware owner helper is mandatory.
    const runningCancel=await prepareJob(ORG_A);
    await assert.rejects(
      callAs(b,'service_role',CANCEL_JOB,[ORG_A,runningCancel.id]),
      isCode('42501'),'Service token must not impersonate human cancellation'
    );
    await assert.rejects(
      callAs(b,'authenticated',SEED_FAILURE,
        [ORG_A,runningCancel.id,ADMIN_A]),
      isCode('42501'),'Authenticated user must never use seed repair'
    );
    await assert.rejects(
      cancelJob(b,ORG_B,runningCancel.id),isCode('42501'),
      'Foreign tenant session cannot cancel another organization'
    );
    await assert.rejects(
      cancelJob(b,ORG_A,runningCancel.id,ADMIN_B,SID_B),isCode('42501'),
      'Authenticated user from another tenant cannot cancel'
    );
    await assert.rejects(
      cancelJob(b,ORG_A,runningCancel.id,ADMIN_A,randomUUID()),isCode('42501'),
      'Unbound JWT session must be refused'
    );
    await root.query(
      "update public.organization_members set active=false "+
      "where organization_id=$1 and user_id=$2",[ORG_A,ADMIN_A]
    );
    await assert.rejects(
      cancelJob(b,ORG_A,runningCancel.id),isCode('42501'),
      'Revoked organization membership must be refused'
    );
    await root.query(
      "update public.organization_members set active=true "+
      "where organization_id=$1 and user_id=$2",[ORG_A,ADMIN_A]
    );
    assert.equal((await state(runningCancel)).status,'running');
    assert.deepEqual(await jobAudit(ORG_A,runningCancel.id),[]);
    assert.deepEqual((await cancelJob(b,ORG_A,runningCancel.id)).rows[0].result,{
      ok:true,status:'cancelled',audit_recorded:true,
    });
    assert.equal((await state(runningCancel)).status,'cancelled');
    assert.equal((await state(runningCancel)).lease_token,null);
    assert.deepEqual((await cancelJob(b,ORG_A,runningCancel.id)).rows[0].result,{
      ok:false,reason:'not_active_or_not_found',
    },'Duplicate cancellation must not make another audit');
    assert.deepEqual((await safe(b,ORG_A,runningCancel)).rows[0].result,{
      ok:false,reason:'inactive_or_stale_lease',
    });
    assert.deepEqual(await jobAudit(ORG_A,runningCancel.id),[{
      action:'tenant_cancel',initiator:'tenant_admin',actor_id:ADMIN_A,
      session_id:SID_A,job_created_by:ADMIN_A,
      previous_status:'running',final_status:'cancelled',
    }]);

    // Audit collision rolls back the job mutation, not just its audit.
    const auditCollision=await prepareJob(ORG_A);
    await root.query(
      "insert into kb09h_fixture.job_finalization_audit "+
      "(organization_id,job_id,action,previous_status,final_status,"+
      "initiator,actor_id,session_id,job_created_by) "+
      "values($1,$2,'tenant_cancel','running','cancelled',"+
      "'tenant_admin',$3,$4,$3)",[ORG_A,auditCollision.id,ADMIN_A,SID_A]
    );
    await assert.rejects(
      cancelJob(b,ORG_A,auditCollision.id),isCode('23505'),
      'Audit uniqueness failure must rollback the cancellation'
    );
    assert.equal((await state(auditCollision)).status,'running');
    assert.equal((await state(auditCollision)).lease_token,auditCollision.lease);
    await retire(auditCollision);

    // Service can mark only its own exact UNCLAIMED, unseeded queued job
    // as seed_insert_failed. It cannot override a job with a real page.
    const noSeedId=await enqueueUnseeded(ORG_A);
    await assert.rejects(
      callAs(b,'authenticated',SEED_FAILURE,[ORG_A,noSeedId,ADMIN_A]),
      isCode('42501')
    );
    assert.deepEqual((await seedFailed(b,ORG_A,noSeedId,ADMIN_B)).rows[0].result,{
      ok:false,reason:'not_eligible',
    },'Creator mismatch must not modify queued job');
    assert.deepEqual((await seedFailed(b,ORG_B,noSeedId,ADMIN_A)).rows[0].result,{
      ok:false,reason:'not_eligible',
    },'Service failure repair must target exact tenant and job');
    assert.deepEqual((await seedFailed(b,ORG_A,noSeedId,ADMIN_A)).rows[0].result,{
      ok:true,status:'failed',audit_recorded:true,
    });
    assert.deepEqual((await seedFailed(b,ORG_A,noSeedId,ADMIN_A)).rows[0].result,{
      ok:false,reason:'not_eligible',
    });
    assert.deepEqual(await jobAudit(ORG_A,noSeedId),[{
      action:'seed_failure',initiator:'service_seed_handler',
      actor_id:null,session_id:null,job_created_by:ADMIN_A,
      previous_status:'queued',final_status:'failed',
    }]);
    const failureState=(await root.query(
      "select status,last_error_code,lease_token from public.knowledge_discovery_jobs "+
      "where id=$1",[noSeedId]
    )).rows[0];
    assert.deepEqual(failureState,{
      status:'failed',last_error_code:'seed_insert_failed',lease_token:null,
    });

    const withPageId=await enqueueUnseeded(ORG_A);
    await root.query(
      "insert into public.knowledge_discovery_pages "+
      "(organization_id,job_id,url,depth,status) "+
      "values($1,$2,$3,0,'discovered')",
      [ORG_A,withPageId,SITE_URL]
    );
    assert.deepEqual((await seedFailed(b,ORG_A,withPageId,ADMIN_A)).rows[0].result,{
      ok:false,reason:'not_eligible',
    },'Seed failure cannot erase a job that already has a page');
    assert.deepEqual(await jobAudit(ORG_A,withPageId),[]);
    await cancelJob(b,ORG_A,withPageId);

    // Independent transactions: admin cancel wins the job row lock, and
    // a worker page commit must wait then return a STALE lease.
    const cancelFirst=await prepareJob(ORG_A);
    await beginAs(b,'authenticated');
    assert.equal((await b.query(CANCEL_JOB,[ORG_A,cancelFirst.id]))
      .rows[0].result.ok,true);
    await beginAs(c,'service_role');
    let commitDone=false;
    const pendingCommit=c.query(SAFE_COMMIT,
      safeArgs(ORG_A,cancelFirst,cancelFirst.lease,'skipped'))
      .then(value=>({ok:true,value}),error=>({ok:false,error}))
      .finally(()=>{commitDone=true;});
    await pauseForLock();
    assert.equal(commitDone,false,'Page commit must wait for cancellation lock');
    await b.query('commit');
    const deniedCommit=await pendingCommit;
    assert.equal(deniedCommit.ok,true);
    assert.deepEqual(deniedCommit.value.rows[0].result,{
      ok:false,reason:'inactive_or_stale_lease',
    });
    await c.query('commit');
    assert.equal((await page(cancelFirst)).status,'discovered');
    assert.equal((await jobAudit(ORG_A,cancelFirst.id)).length,1);

    // Worker commit wins first: a later cancellation is a no-op and
    // MUST NOT forge an audit or reverse an already committed page.
    const finishFirst=await prepareJob(ORG_A);
    await beginAs(c,'service_role');
    assert.equal((await c.query(SAFE_COMMIT,
      safeArgs(ORG_A,finishFirst,finishFirst.lease,'skipped')))
      .rows[0].result.ok,true);
    await beginAs(b,'authenticated');
    let cancelDone=false;
    const lateCancel=b.query(CANCEL_JOB,[ORG_A,finishFirst.id])
      .then(value=>({ok:true,value}),error=>({ok:false,error}))
      .finally(()=>{cancelDone=true;});
    await pauseForLock();
    assert.equal(cancelDone,false,'Cancellation must wait while worker holds job row');
    await c.query('commit');
    const lateResponse=await lateCancel;
    assert.equal(lateResponse.ok,true);
    assert.deepEqual(lateResponse.value.rows[0].result,{
      ok:false,reason:'not_active_or_not_found',
    });
    await b.query('commit');
    assert.equal((await page(finishFirst)).status,'skipped');
    assert.deepEqual(await jobAudit(ORG_A,finishFirst.id),[]);

    // Seed repair cannot preempt a lease that already became running.
    // The existing claim SQL and the repair CAS agree on the job state.
    const raceSeed=await enqueueUnseeded(ORG_A);
    await beginAs(b,'service_role');
    const leaseClaim=(await b.query(CLAIM)).rows;
    assert.equal(leaseClaim.length,1);
    assert.equal(leaseClaim[0].job_id,raceSeed);
    await beginAs(c,'service_role');
    let seedResolved=false;
    const lateSeed=c.query(SEED_FAILURE,[ORG_A,raceSeed,ADMIN_A])
      .then(value=>({ok:true,value}),error=>({ok:false,error}))
      .finally(()=>{seedResolved=true;});
    await pauseForLock();
    assert.equal(seedResolved,false,'Seed failure CAS must wait for job lease claim');
    await b.query('commit');
    const seedLoser=await lateSeed;
    assert.equal(seedLoser.ok,true);
    assert.deepEqual(seedLoser.value.rows[0].result,{
      ok:false,reason:'not_eligible',
    });
    await c.query('commit');
    assert.deepEqual(await jobAudit(ORG_A,raceSeed),[]);
    await cancelJob(b,ORG_A,raceSeed);

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
    // KB-09J: all new operations are in an auto-dropped loopback fixture.
    // Strictly no hosted Supabase/Auth, no staging and no migration.
    await root.query(
      "create table public.organization_onboarding("+
      "organization_id uuid primary key references public.organizations(id),"+
      "website_url text)"
    );
    for (const [org,actor,session] of [
      [ORG_C,ADMIN_C,SID_C],[ORG_D,ADMIN_D,SID_D],[ORG_E,ADMIN_E,SID_E],
    ]){
      await root.query("insert into public.organizations(id) values($1)",[org]);
      await root.query(
        "insert into public.organization_onboarding(organization_id,website_url) "+
        "values($1,$2)",[org,SITE_URL]
      );
      await root.query(
        "insert into public.organization_members(organization_id,user_id,role,active) "+
        "values($1,$2,'admin',true)",[org,actor]
      );
      await root.query(
        "insert into auth.sessions(id,user_id) values($1,$2)",[session,actor]
      );
      await root.query(
        "insert into public.tenant_session_bindings(session_id,user_id,organization_id) "+
        "values($1,$2,$3)",[session,actor,org]
      );
      await root.query(
        "insert into public.knowledge_discovery_domain_verifications "+
        "(organization_id,hostname,challenge_hash,created_by,issued_at,"+
        "challenge_expires_at,verified_at,verified_until) "+
        "values($1,$2,$3,$4,now()-interval '1 hour',"+
        "now()+interval '1 hour',now()-interval '3 minutes',"+
        "now()+interval '30 minutes')",
        [org,HOST,SHA,actor]
      );
      const consentId=(await root.query(
        "insert into public.knowledge_discovery_site_consents "+
        "(organization_id,hostname,purpose,status,policy_version,"+
        "granted_by,granted_at,valid_until,revision) "+
        "values($1,$2,'website_discovery_review_only','granted',"+
        "'synthetic-policy', $3,now()-interval '20 minutes',"+
        "now()+interval '30 minutes',1) returning id",
        [org,HOST,actor]
      )).rows[0].id;
      await root.query(
        "insert into public.knowledge_discovery_consent_audit "+
        "(consent_id,organization_id,hostname,action,actor_id,session_id,"+
        "policy_version,policy_sha256,revision,valid_until) "+
        "values($1,$2,$3,'granted',$4,$5,'synthetic-policy',$6,1,"+
        "now()+interval '30 minutes')",
        [consentId,org,HOST,actor,session,POLICY_SHA]
      );
    }
    await root.query(atomicEnqueue);
    assert.match(atomicEnqueue,/KB09J_DISPOSABLE_PARENT_FIXTURE_REQUIRED/);
    assert.doesNotMatch(atomicEnqueue,/cron\.schedule|net\.http|http_get/i);
    const enqueueACL=(await root.query(
      "select has_function_privilege('anon',$1,'execute') as anon,"+
      "has_function_privilege('authenticated',$1,'execute') as client,"+
      "has_function_privilege('service_role',$1,'execute') as service",
      [ENQUEUE_SIG]
    )).rows[0];
    assert.deepEqual(enqueueACL,{anon:false,client:true,service:false});
    for(const t of ['knowledge_discovery_jobs','knowledge_discovery_pages']){
      const direct=(await root.query(
        "select has_table_privilege('service_role',$1,'insert') as service,"+
        "has_table_privilege($2,$1,'insert') as bypass",
        ['public.'+t,bypassRole]
      )).rows[0];
      assert.deepEqual(direct,{service:false,bypass:false},
        'No privileged direct insert bypass on '+t);
      await assert.rejects(
        callAs(b,bypassRole,
          "insert into public."+t+" "+
          (t==='knowledge_discovery_jobs'
            ? "(organization_id,created_by,seed_url) values($1,$2,$3)"
            : "(organization_id,job_id,url) values($1,$2,$3)"),
          t==='knowledge_discovery_jobs'
            ? [ORG_C,ADMIN_C,SITE_URL] : [ORG_C,randomUUID(),SITE_URL],
          ADMIN_C,SID_C,'service_role'),
        isCode('42501'),'BYPASSRLS must not bypass revoked INSERT privilege'
      );
    }
    const enqueueAs=(org,actor,sid,seed=SITE_URL,max=3,db=b)=>
      callAs(db,'authenticated',ENQUEUE,[org,seed,max],actor,sid);

    await assert.rejects(
      callAs(b,'anon',ENQUEUE,[ORG_C,SITE_URL,3]),isCode('42501')
    );
    await assert.rejects(
      callAs(b,'service_role',ENQUEUE,[ORG_C,SITE_URL,3]),isCode('42501')
    );
    await assert.rejects(enqueueAs(ORG_D,ADMIN_C,SID_C),isCode('42501'),
      'A session bound to tenant C cannot enqueue in tenant D');
    await assert.rejects(enqueueAs(ORG_C,ADMIN_D,SID_D),isCode('42501'),
      'Tenant D actor cannot enqueue in C');
    await assert.rejects(enqueueAs(ORG_C,ADMIN_C,randomUUID()),isCode('42501'),
      'Forged/unbound session denied');
    await root.query(
      "update public.organization_members set active=false where organization_id=$1",
      [ORG_C]
    );
    await assert.rejects(enqueueAs(ORG_C,ADMIN_C,SID_C),isCode('42501'),
      'Revoked admin cannot enqueue');
    await root.query(
      "update public.organization_members set active=true where organization_id=$1",
      [ORG_C]
    );
    const countJobs=async(org)=>(await root.query(
      "select count(*)::int as n from public.knowledge_discovery_jobs "+
      "where organization_id=$1",[org]
    )).rows[0].n;

    for(const seed of [
      'http://fixture.example.com/',
      'https://fixture.example.com:444/',
      'https://fixture.example.com/other',
      'https://fixture.example.com/?query=1',
      'https://fixture.example.com.attacker.net/',
      'https://foo..fixture.example.com/',
    ]){
      const denied=(await enqueueAs(ORG_D,ADMIN_D,SID_D,seed)).rows[0].result;
      assert.equal(denied.ok,false);
      assert.ok(['invalid_scan_request','configured_domain_mismatch'].includes(
        denied.reason
      ),'Non-canonical or foreign seed must fail');
    }
    assert.equal(await countJobs(ORG_D),0);

    await root.query(
      "update public.organization_onboarding set website_url=$2 "+
      "where organization_id=$1",
      [ORG_D,'https://attacker.example.net/']
    );
    assert.deepEqual((await enqueueAs(ORG_D,ADMIN_D,SID_D)).rows[0].result,{
      ok:false,reason:'configured_domain_mismatch',
    });
    await root.query(
      "update public.organization_onboarding set website_url=$2 "+
      "where organization_id=$1",
      [ORG_D,SITE_URL]
    );
    await root.query(
      "update public.knowledge_discovery_domain_verifications "+
      "set verified_until=now()-interval '1 second' where organization_id=$1",
      [ORG_D]
    );
    assert.deepEqual((await enqueueAs(ORG_D,ADMIN_D,SID_D)).rows[0].result,{
      ok:false,reason:'ownership_proof_not_current',
    });
    await renew(ORG_D);
    await root.query(
      "update public.knowledge_discovery_site_consents "+
      "set status='withdrawn',withdrawn_at=now() where organization_id=$1",
      [ORG_D]
    );
    assert.deepEqual((await enqueueAs(ORG_D,ADMIN_D,SID_D)).rows[0].result,{
      ok:false,reason:'consent_not_active',
    });
    await root.query(
      "update public.knowledge_discovery_site_consents "+
      "set status='granted',withdrawn_at=null where organization_id=$1",
      [ORG_D]
    );
    assert.equal(await countJobs(ORG_D),0);

    // With an in-flight proof change, authenticated enqueue blocks on
    // FOR SHARE, then observes revoked proof and creates no job or page.
    await b.query('begin');
    await b.query("set local lock_timeout='7s'");
    await b.query(
      "update public.knowledge_discovery_domain_verifications "+
      "set verified_until=now()-interval '1 second' where organization_id=$1",
      [ORG_D]
    );
    let enqueueResolved=false;
    const pendingEnqueue=enqueueAs(ORG_D,ADMIN_D,SID_D,SITE_URL,3,c)
      .then(value=>({ok:true,value}),error=>({ok:false,error}))
      .finally(()=>{enqueueResolved=true;});
    await pauseForLock();
    assert.equal(enqueueResolved,false,'Enqueue waits for proof row update');
    await b.query('commit');
    const rejectedAfterProof=await pendingEnqueue;
    assert.equal(rejectedAfterProof.ok,true);
    assert.deepEqual(rejectedAfterProof.value.rows[0].result,{
      ok:false,reason:'ownership_proof_not_current',
    });
    assert.equal(await countJobs(ORG_D),0);
    await renew(ORG_D);

    // Successful atomic enqueue yields exactly one queued job plus its
    // initial pending page, with created_by taken from authenticated JWT.
    const acceptedC=(await enqueueAs(ORG_C,ADMIN_C,SID_C,SITE_URL,4)).rows[0].result;
    assert.equal(acceptedC.ok,true);
    assert.equal(acceptedC.seed_inserted,true);
    assert.equal(acceptedC.status,'queued');
    assert.match(acceptedC.job_id,/^[a-f0-9-]{36}$/i);
    const savedC=(await root.query(
      "select organization_id,created_by,seed_url,max_pages,status "+
      "from public.knowledge_discovery_jobs where id=$1",[acceptedC.job_id]
    )).rows[0];
    assert.deepEqual(savedC,{
      organization_id:ORG_C,created_by:ADMIN_C,seed_url:SITE_URL,
      max_pages:4,status:'queued',
    });
    const pagesC=(await root.query(
      "select organization_id,job_id,url,depth,status "+
      "from public.knowledge_discovery_pages where job_id=$1",
      [acceptedC.job_id]
    )).rows;
    assert.deepEqual(pagesC,[{
      organization_id:ORG_C,job_id:acceptedC.job_id,url:SITE_URL,
      depth:0,status:'discovered',
    }]);
    await assert.rejects(
      enqueueAs(ORG_C,ADMIN_C,SID_C),isCode('23505'),
      'Active-job unique index must still reject duplicate concurrent scans'
    );
    assert.equal(await countJobs(ORG_C),1);

    const acceptedD=(await enqueueAs(ORG_D,ADMIN_D,SID_D)).rows[0].result;
    assert.equal(acceptedD.ok,true);
    await root.query(
      "update public.knowledge_discovery_jobs set status='completed',"+
      "finished_at=now() where id=$1",[acceptedD.job_id]
    );
    await assert.rejects(
      enqueueAs(ORG_D,ADMIN_D,SID_D),
      e=>e?.code==='P0001' && /discovery_scan_cooldown/.test(e?.message||''),
      'Original 15-minute SQL cooldown must remain enforced'
    );
    assert.equal(await countJobs(ORG_D),1);

    // Inject the seed-page INSERT failure inside the SAME SQL statement:
    // it must abort the job INSERT, leaving no orphan even on SQL error.
    await root.query([
      "create function kb09j_fixture.reject_synthetic_seed_page()",
      "returns trigger language plpgsql as $fail$",
      "begin raise exception 'kb09j_forced_seed_insert_failure'",
      "using errcode='23514'; end; $fail$",
    ].join(' ')+';');
    await root.query(
      "create trigger kb09j_force_seed_failure before insert "+
      "on public.knowledge_discovery_pages for each row "+
      "execute function kb09j_fixture.reject_synthetic_seed_page()"
    );
    await assert.rejects(
      enqueueAs(ORG_E,ADMIN_E,SID_E),isCode('23514'),
      'Seed failure aborts the entire job/page creation statement'
    );
    assert.equal(await countJobs(ORG_E),0,'No orphan job after page insert error');
    const remainingPages=(await root.query(
      "select count(*)::int as n from public.knowledge_discovery_pages "+
      "where organization_id=$1",[ORG_E]
    )).rows[0].n;
    assert.equal(remainingPages,0);
    await root.query("drop trigger kb09j_force_seed_failure on public.knowledge_discovery_pages");
    await root.query("drop function kb09j_fixture.reject_synthetic_seed_page()");

    // KB-09K starts only AFTER the prior job/page DML tests: all proof/
    // consent direct DML privileges become unavailable to service_role.
    await root.query(proofBoundary);
    assert.match(proofBoundary,/KB09K_DISPOSABLE_PARENT_FIXTURE_REQUIRED/);
    assert.doesNotMatch(proofBoundary,/cron\.schedule|net\.http|http_get/i);
    for(const [fn,allowed] of [
      ['public.issue_knowledge_discovery_challenge_for_admin_v1(uuid,text,text)',{anon:false,auth:true,service:false}],
      ['public.claim_knowledge_discovery_proof_check_for_admin_v1(uuid,text,text)',{anon:false,auth:true,service:false}],
      ['public.confirm_checked_knowledge_discovery_proof_v1(uuid,text,text)',{anon:false,auth:false,service:true}],
    ]){
      const acl=(await root.query(
        "select has_function_privilege('anon',$1,'execute') as anon,"+
        "has_function_privilege('authenticated',$1,'execute') as auth,"+
        "has_function_privilege('service_role',$1,'execute') as service",
        [fn]
      )).rows[0];
      assert.deepEqual(acl,allowed,'Narrow RPC execute grants for '+fn);
    }
    for(const sig of [
      'public.issue_knowledge_discovery_domain_challenge_v1(uuid,text,uuid,text)',
      'public.claim_knowledge_discovery_proof_check_v1(uuid,text,text)',
    ]){
      assert.equal((await root.query(
        "select has_function_privilege('service_role',$1,'execute') as allowed",
        [sig]
      )).rows[0].allowed,false,'Legacy service-side proof writer revoked');
    }
    const sealedTables=[
      'knowledge_discovery_domain_verifications',
      'knowledge_discovery_site_consents',
      'knowledge_discovery_consent_control',
      'knowledge_discovery_consent_audit',
    ];
    for(const table of sealedTables){
      const acl=(await root.query(
        "select has_table_privilege('service_role',$1,'insert') as insert,"+
        "has_table_privilege('service_role',$1,'update') as update,"+
        "has_table_privilege('service_role',$1,'delete') as delete,"+
        "has_table_privilege('service_role',$1,'truncate') as truncate,"+
        "has_table_privilege($2,$1,'update') as bypass",
        ['public.'+table,bypassRole]
      )).rows[0];
      assert.deepEqual(acl,{insert:false,update:false,delete:false,truncate:false,bypass:false},
        'Proof or consent direct DML bypass must be closed: '+table);
      await assert.rejects(
        callAs(b,bypassRole,"truncate public."+table,[],
          ADMIN_E,SID_E,'service_role'),
        isCode('42501'),'BYPASSRLS must not retain direct consent/proof TRUNCATE'
      );
    }

    // Existing grant/withdraw RPC owner privileges survive direct
    // service_role consent DML revocation. E was granted synthetically.
    const withdrawE=(await callAs(b,'authenticated',WITHDRAW,
      [ORG_E,HOST,1],ADMIN_E,SID_E)).rows[0].result;
    assert.deepEqual(withdrawE,{
      ok:true,status:'withdrawn',revision:2,jobsCancelled:0,
    });
    const consentE=(await root.query(
      "select status,revision from public.knowledge_discovery_site_consents "+
      "where organization_id=$1",[ORG_E]
    )).rows[0];
    assert.deepEqual(consentE,{status:'withdrawn',revision:2});
    const auditE=(await root.query(
      "select action from public.knowledge_discovery_consent_audit "+
      "where organization_id=$1 order by revision",[ORG_E]
    )).rows.map(x=>x.action);
    assert.deepEqual(auditE,['granted','withdrawn']);
    await assert.rejects(
      callAs(b,bypassRole,
        "update public.knowledge_discovery_site_consents set status='granted' "+
        "where organization_id=$1",[ORG_E],
        ADMIN_E,SID_E,'service_role'),
      isCode('42501'),'Direct service_role regrant must not bypass audit'
    );
    await assert.rejects(
      callAs(b,bypassRole,
        "update public.knowledge_discovery_consent_control set grants_enabled=true",
        [],ADMIN_E,SID_E,'service_role'),
      isCode('42501'),'Service role cannot forge policy registry approval'
    );

    // Owner/admin session cannot be forged across tenants, after logout or
    // when membership has been revoked. No raw token or user supplied to RPC.
    const candidateHash='c'.repeat(64);
    await assert.rejects(
      callAs(b,'service_role',PROOF_ISSUE,[ORG_D,HOST,candidateHash]),
      isCode('42501')
    );
    await assert.rejects(
      callAs(b,'authenticated',PROOF_FINISH,[ORG_D,HOST,candidateHash],
        ADMIN_D,SID_D),
      isCode('42501')
    );
    await assert.rejects(
      callAs(b,'authenticated',PROOF_ISSUE,[ORG_D,HOST,candidateHash],
        ADMIN_E,SID_E),
      isCode('42501'),'Wrong-tenant authenticated owner must not issue proof'
    );
    await assert.rejects(
      callAs(b,'authenticated',PROOF_ISSUE,[ORG_D,HOST,candidateHash],
        ADMIN_D,randomUUID()),
      isCode('42501'),'Unbound signed session must be refused'
    );
    await root.query(
      "update public.organization_members set active=false "+
      "where organization_id=$1",[ORG_D]
    );
    await assert.rejects(
      callAs(b,'authenticated',PROOF_ISSUE,[ORG_D,HOST,candidateHash],
        ADMIN_D,SID_D),
      isCode('42501'),'Revoked owner/admin must not issue proof'
    );
    await root.query(
      "update public.organization_members set active=true "+
      "where organization_id=$1",[ORG_D]
    );
    await assert.rejects(
      callAs(b,'authenticated',PROOF_ISSUE,[ORG_D,'attacker.example.net',candidateHash],
        ADMIN_D,SID_D),
      isCode('42501'),'Configured exact website must match'
    );
    await assert.rejects(
      callAs(b,'authenticated',PROOF_ISSUE,[ORG_D,HOST,'bad-digest'],
        ADMIN_D,SID_D),
      isCode('22023'),'Hash must be an exact 64-character digest'
    );
    await assert.rejects(
      callAs(b,'authenticated',PROOF_ISSUE,[ORG_D,HOST,candidateHash],
        ADMIN_D,SID_D),
      e=>e?.code==='P0001'&&/domain_already_verified/.test(e.message),
      'Currently verified proof cannot be silently reissued'
    );
    await expire(ORG_D);
    const issued=(await callAs(b,'authenticated',PROOF_ISSUE,
      [ORG_D,HOST,candidateHash],ADMIN_D,SID_D)).rows[0].expiry;
    assert.ok(new Date(issued).getTime()>Date.now());
    const proofD=(await root.query(
      "select challenge_hash,created_by,verified_at,verified_until "+
      "from public.knowledge_discovery_domain_verifications where organization_id=$1",
      [ORG_D]
    )).rows[0];
    assert.equal(proofD.challenge_hash,candidateHash);
    assert.equal(proofD.created_by,ADMIN_D);
    assert.equal(proofD.verified_at,null);
    assert.equal(proofD.verified_until,null);
    await assert.rejects(
      callAs(b,'authenticated',PROOF_ISSUE,[ORG_D,HOST,'d'.repeat(64)],
        ADMIN_D,SID_D),
      e=>e?.code==='P0001'&&/domain_challenge_cooldown/.test(e.message)
    );
    const noClaim=(await callAs(b,'service_role',PROOF_FINISH,
      [ORG_D,HOST,candidateHash])).rows[0].result;
    assert.deepEqual(noClaim,{ok:false,reason:'challenge_changed_or_expired'},
      'Service finalization without a recent claim must be refused');
    const wrong=(await callAs(b,'authenticated',PROOF_CLAIM,
      [ORG_D,HOST,'d'.repeat(64)],ADMIN_D,SID_D)).rows[0].allowed;
    assert.equal(wrong,false);
    const claimed=(await callAs(b,'authenticated',PROOF_CLAIM,
      [ORG_D,HOST,candidateHash],ADMIN_D,SID_D)).rows[0].allowed;
    assert.equal(claimed,true);
    assert.equal((await callAs(b,'authenticated',PROOF_CLAIM,
      [ORG_D,HOST,candidateHash],ADMIN_D,SID_D)).rows[0].allowed,false,
      '30-second rate limit continues to apply');
    await assert.rejects(
      callAs(b,'authenticated',PROOF_CLAIM,
        [ORG_D,HOST,candidateHash],ADMIN_E,SID_E),
      isCode('42501'),'Different bound user cannot operate tenant D proof'
    );
    const crossTenantProofRead=(await callAs(b,'authenticated',
      "select count(*)::int as n from public.knowledge_discovery_domain_verifications "+
      "where organization_id=$1",[ORG_D],ADMIN_E,SID_E)).rows[0].n;
    assert.equal(crossTenantProofRead,0);
    const unboundProofRead=(await callAs(b,'authenticated',
      "select count(*)::int as n from public.knowledge_discovery_domain_verifications "+
      "where organization_id=$1",[ORG_D],ADMIN_D,randomUUID())).rows[0].n;
    assert.equal(unboundProofRead,0);

    // Held row update wins: a stale confirmation of an older hash must
    // block on its row and then return a safe no-op.
    await b.query('begin');
    await b.query("set local lock_timeout='7s'");
    await b.query(
      "update public.knowledge_discovery_domain_verifications "+
      "set challenge_hash=$2 where organization_id=$1",
      [ORG_D,'d'.repeat(64)]
    );
    await beginAs(c,'service_role');
    let confirmResolved=false;
    const delayed=c.query(PROOF_FINISH,[ORG_D,HOST,candidateHash])
      .then(value=>({ok:true,value}),error=>({ok:false,error}))
      .finally(()=>{confirmResolved=true;});
    await pauseForLock();
    assert.equal(confirmResolved,false,'Confirmation waits for proof row lock');
    await b.query('commit');
    const stale=await delayed;
    assert.equal(stale.ok,true);
    assert.deepEqual(stale.value.rows[0].result,{
      ok:false,reason:'challenge_changed_or_expired',
    });
    await c.query('commit');
    await root.query(
      "update public.knowledge_discovery_domain_verifications "+
      "set challenge_hash=$2 where organization_id=$1",
      [ORG_D,candidateHash]
    );
    const finished=(await callAs(b,'service_role',PROOF_FINISH,
      [ORG_D,HOST,candidateHash])).rows[0].result;
    assert.equal(finished.ok,true);
    assert.equal(finished.status,'verified');
    assert.ok(new Date(finished.verified_until).getTime()>Date.now());
    const duplicate=(await callAs(b,'service_role',PROOF_FINISH,
      [ORG_D,HOST,candidateHash])).rows[0].result;
    assert.deepEqual(duplicate,{ok:false,reason:'challenge_changed_or_expired'},
      'Same claim cannot extend a currently verified proof');

    // IMPORTANT negative policy test: proof can still expire after the
    // wrapper's check but before an outer caller-controlled COMMIT.
    // This does not imply proof validity at actual external COMMIT time.
    await root.query(
      "update public.knowledge_discovery_domain_verifications "+
      "set issued_at=now()-interval '2 hours',verified_at=null,"+
      "verified_until=null,challenge_expires_at=clock_timestamp()+interval '2 seconds' "+
      "where organization_id=$1",[ORG_D]
    );
    await root.query(
      "update public.knowledge_discovery_domain_verifications "+
      "set last_check_at=clock_timestamp() where organization_id=$1",[ORG_D]
    );
    await beginAs(c,'service_role');
    const early=(await c.query(PROOF_FINISH,
      [ORG_D,HOST,candidateHash])).rows[0].result;
    assert.equal(early.ok,true);
    await c.query('select pg_sleep(2.2)');
    await c.query('commit');
    assert.equal((await root.query(
      "select challenge_expires_at<clock_timestamp() as expired,"+
      "verified_at is not null as verified "+
      "from public.knowledge_discovery_domain_verifications "+
      "where organization_id=$1",[ORG_D]
    )).rows[0].verified,true,
      'External transaction can commit after challenge expiry: still unresolved');


    // KB-09L: Retire hash-only service confirmation and demand the ORIGINAL
    // proof-token preimage. The test runs in this auto-dropped localhost DB.
    await root.query(preimageAndPolicyHold);
    assert.match(preimageAndPolicyHold,/KB09L_DISPOSABLE_PARENT_FIXTURE_REQUIRED/);
    assert.doesNotMatch(preimageAndPolicyHold,/cron\.schedule|net\.http|http_get/i);
    assert.doesNotMatch(preimageAndPolicyHold,/grants_enabled\s*=\s*true/i);
    const oldProofPrivilege=(await root.query(
      "select has_function_privilege('service_role',$1,'execute') as old_public,"+
      "has_function_privilege('service_role',$2,'execute') as old_private",
      ['public.confirm_checked_knowledge_discovery_proof_v1(uuid,text,text)',
       'kb09k_fixture.confirm_checked_domain_proof_v1(uuid,text,text)']
    )).rows[0];
    assert.deepEqual(oldProofPrivilege,{old_public:false,old_private:false});
    const proofV2ACL=(await root.query(
      "select has_function_privilege('anon',$1,'execute') as anon,"+
      "has_function_privilege('authenticated',$1,'execute') as authenticated,"+
      "has_function_privilege('service_role',$1,'execute') as service",
      ['public.confirm_checked_knowledge_discovery_proof_v2(uuid,text,text)']
    )).rows[0];
    assert.deepEqual(proofV2ACL,{anon:false,authenticated:false,service:true});
    await assert.rejects(
      callAs(b,'service_role',PROOF_FINISH,[ORG_D,HOST,'c'.repeat(64)]),
      isCode('42501'),'Hash-only proof RPC must remain unreachable'
    );
    await assert.rejects(
      callAs(b,'authenticated',PROOF_PREIMAGE,[ORG_D,HOST,'c'.repeat(64)],
        ADMIN_D,SID_D),
      isCode('42501'),'Tenant-authenticated clients cannot call service proof RPC'
    );

    const rawToken='salsysos-domain-verification='+'e'.repeat(64);
    const tokenDigest=createHash('sha256').update(rawToken,'utf8').digest('hex');
    assert.equal(rawToken.length,93);
    await root.query(
      "update public.knowledge_discovery_domain_verifications "+
      "set challenge_hash=$2,challenge_expires_at=clock_timestamp()+interval '15 minutes',"+
      "last_check_at=clock_timestamp(),verified_at=null,verified_until=null "+
      "where organization_id=$1",[ORG_D,tokenDigest]
    );

    const badFormat=(await callAs(b,'service_role',PROOF_PREIMAGE,
      [ORG_D,HOST,tokenDigest])).rows[0].result;
    assert.deepEqual(badFormat,{ok:false,reason:'invalid_proof_preimage'},
      'A stored SHA-256 digest is not acceptable evidence');
    const otherPreimage=(await callAs(b,'service_role',PROOF_PREIMAGE,
      [ORG_D,HOST,'salsysos-domain-verification='+'f'.repeat(64)]))
      .rows[0].result;
    assert.deepEqual(otherPreimage,{ok:false,reason:'challenge_changed_or_expired'});
    assert.equal((await root.query(
      "select verified_at from public.knowledge_discovery_domain_verifications "+
      "where organization_id=$1",[ORG_D]
    )).rows[0].verified_at,null);

    await root.query(
      "update public.knowledge_discovery_domain_verifications "+
      "set last_check_at=now()-interval '3 minutes' "+
      "where organization_id=$1",[ORG_D]
    );
    const unclaimed=(await callAs(b,'service_role',PROOF_PREIMAGE,
      [ORG_D,HOST,rawToken])).rows[0].result;
    assert.deepEqual(unclaimed,{ok:false,reason:'challenge_changed_or_expired'},
      'Preimage cannot bypass the bounded authenticated fetch claim');
    await root.query(
      "update public.knowledge_discovery_domain_verifications "+
      "set last_check_at=clock_timestamp() "+
      "where organization_id=$1",[ORG_D]
    );
    const approvedPreimage=(await callAs(b,'service_role',PROOF_PREIMAGE,
      [ORG_D,HOST,rawToken])).rows[0].result;
    assert.equal(approvedPreimage.ok,true);
    assert.equal(approvedPreimage.status,'verified');
    assert.equal(typeof approvedPreimage.verified_until,'string');
    assert.equal(JSON.stringify(approvedPreimage).includes(rawToken),false,
      'Success response must not expose the secret preimage');
    const replay=(await callAs(b,'service_role',PROOF_PREIMAGE,
      [ORG_D,HOST,rawToken])).rows[0].result;
    assert.deepEqual(replay,{ok:false,reason:'challenge_changed_or_expired'});

    // Best-effort 5-second margin denies near-expiry confirmation.
    await root.query(
      "update public.knowledge_discovery_domain_verifications "+
      "set verified_at=null,verified_until=null,last_check_at=clock_timestamp(),"+
      "challenge_expires_at=clock_timestamp()+interval '3 seconds' "+
      "where organization_id=$1",[ORG_D]
    );
    const nearExpiry=(await callAs(b,'service_role',PROOF_PREIMAGE,
      [ORG_D,HOST,rawToken])).rows[0].result;
    assert.deepEqual(nearExpiry,{ok:false,reason:'challenge_changed_or_expired'});

    // Negative decision test: a permitted standalone function can still
    // commit AFTER expiry if an outer client explicitly holds its transaction.
    await root.query(
      "update public.knowledge_discovery_domain_verifications "+
      "set verified_at=null,verified_until=null,last_check_at=clock_timestamp(),"+
      "challenge_expires_at=clock_timestamp()+interval '8 seconds' "+
      "where organization_id=$1",[ORG_D]
    );
    await beginAs(c,'service_role');
    const earlyV2=(await c.query(PROOF_PREIMAGE,
      [ORG_D,HOST,rawToken])).rows[0].result;
    assert.equal(earlyV2.ok,true);
    await c.query('select pg_sleep(8.2)');
    await c.query('commit');
    const staleAtCommit=(await root.query(
      "select challenge_expires_at<clock_timestamp() as expired,verified_at is not null as verified "+
      "from public.knowledge_discovery_domain_verifications "+
      "where organization_id=$1",[ORG_D]
    )).rows[0];
    assert.deepEqual(staleAtCommit,{expired:true,verified:true},
      'Even a 5s margin cannot provide physical external-COMMIT-time authorization');

    // Operator-policy receipts are DB-owner-only evidence, never an API
    // policy switch; this fixture cannot activate consent management.
    assert.equal((await root.query(
      "select grants_enabled from public.knowledge_discovery_consent_control "+
      "where singleton=true"
    )).rows[0].grants_enabled,false);
    const policyText='Synthetic KB09L policy review fixture. No real consent or legal approval is granted.';
    const policyHash=createHash('sha256').update(policyText,'utf8').digest('hex');
    await assert.rejects(
      root.query(
        "insert into kb09l_fixture.policy_review_receipts "+
        "(policy_version,exact_policy_text,policy_sha256,source_reference,"+
        "security_reviewer,privacy_reviewer,security_evidence_ref,privacy_evidence_ref) "+
        "values($1,$2,$3,$4,$5,$6,$7,$8)",
        ['synthetic-v1',policyText,policyHash,'synthetic://policy',
        'same-reviewer','same-reviewer','ticket-security','ticket-privacy']
      ),isCode('23514'),'Independent reviewer identities required'
    );
    await assert.rejects(
      root.query(
        "insert into kb09l_fixture.policy_review_receipts "+
        "(policy_version,exact_policy_text,policy_sha256,source_reference,"+
        "security_reviewer,privacy_reviewer,security_evidence_ref,privacy_evidence_ref) "+
        "values($1,$2,$3,$4,$5,$6,$7,$8)",
        ['synthetic-v1',policyText,'0'.repeat(64),'synthetic://policy',
        'security-reviewer','privacy-reviewer','ticket-security','ticket-privacy']
      ),isCode('23514'),'Exact policy bytes must match their digest'
    );
    await root.query(
      "insert into kb09l_fixture.policy_review_receipts "+
      "(policy_version,exact_policy_text,policy_sha256,source_reference,"+
      "security_reviewer,privacy_reviewer,security_evidence_ref,privacy_evidence_ref) "+
      "values($1,$2,$3,$4,$5,$6,$7,$8)",
      ['synthetic-v1',policyText,policyHash,'synthetic://policy',
      'security-reviewer','privacy-reviewer','ticket-security','ticket-privacy']
    );
    await assert.rejects(
      root.query("update kb09l_fixture.policy_review_receipts set policy_version='forged'"),
      isCode('42501'),'Operator receipts are append-only'
    );
    await assert.rejects(
      root.query("truncate kb09l_fixture.policy_review_receipts"),
      isCode('42501'),'Operator receipts cannot be truncated'
    );
    await assert.rejects(
      callAs(b,'service_role',"select count(*) from kb09l_fixture.policy_review_receipts"),
      isCode('42501'),'Service role has no operator-review evidence access'
    );
    await assert.rejects(
      callAs(b,'service_role',
        "update public.knowledge_discovery_consent_control set grants_enabled=true"),
      isCode('42501'),'Service role cannot enable policy registry'
    );
    assert.equal((await root.query(
      "select grants_enabled from public.knowledge_discovery_consent_control "+
      "where singleton=true"
    )).rows[0].grants_enabled,false);

    // KB-09M verifies the REAL public RPC name used by the application
    // runner, not merely the private KB-09F helper. No hosted DB touched.
    await root.query(checkedCommitBridge);
    assert.match(checkedCommitBridge,/KB09M_DISPOSABLE_PARENT_FIXTURE_REQUIRED/);
    const workerACL=(await root.query(
      "select has_function_privilege('anon',$1,'execute') as anon,"+
      "has_function_privilege('authenticated',$1,'execute') as authenticated,"+
      "has_function_privilege('service_role',$1,'execute') as service",
      [PUBLIC_SAFE_COMMIT_SIG]
    )).rows[0];
    assert.deepEqual(workerACL,{anon:false,authenticated:false,service:true});
    assert.equal((await root.query(
      "select has_function_privilege('service_role',$1,'execute') as legacy",
      [OLD_SIG]
    )).rows[0].legacy,false,'Legacy unchecked page commit remains unavailable');
    await assert.rejects(
      callAs(b,'service_role',OLD_COMMIT,
        [ORG_D,acceptedD.job_id,randomUUID(),randomUUID(),
         'fetched',200,'text/html','bad',null,'[]',2]),
      isCode('42501'),'Worker must never silently fall back to revoked RPC'
    );

    // Resume a purely synthetic queued-job snapshot with a fresh valid lease.
    // D still has its first discovered seed page, active consent, and a
    // verified 30-day ownership proof from KB-09L's rehearsal.
    const workerLease=randomUUID();
    const seedD=(await root.query(
      "select id,status from public.knowledge_discovery_pages "+
      "where job_id=$1 and organization_id=$2 order by discovered_at limit 1",
      [acceptedD.job_id,ORG_D]
    )).rows[0];
    assert.equal(seedD?.status,'discovered');
    await root.query(
      "update public.knowledge_discovery_jobs "+
      "set status='running',lease_token=$2,"+
      "lease_until=clock_timestamp()+interval '1 minute',"+
      "finished_at=null where id=$1",[acceptedD.job_id,workerLease]
    );
    const workerArgs=[
      ORG_D,acceptedD.job_id,seedD.id,workerLease,'fetched',200,
      'text/html','Synthetic worker page',null,'[]',2,
    ];
    await assert.rejects(
      callAs(b,'authenticated',PUBLIC_SAFE_COMMIT,workerArgs,ADMIN_D,SID_D),
      isCode('42501'),'No authenticated client gets privileged worker page commit'
    );
    const foreign=(await callAs(b,'service_role',PUBLIC_SAFE_COMMIT,
      [ORG_E,...workerArgs.slice(1)])).rows[0].result;
    assert.deepEqual(foreign,{ok:false,reason:'inactive_or_stale_lease'});
    const staleLease=(await callAs(b,'service_role',PUBLIC_SAFE_COMMIT,
      [...workerArgs.slice(0,3),randomUUID(),...workerArgs.slice(4)]))
      .rows[0].result;
    assert.deepEqual(staleLease,{ok:false,reason:'inactive_or_stale_lease'});

    // Revoke proof before worker commit. The new wrapper must preserve the
    // private KB-09F current-proof check, and must NOT mutate the page.
    await root.query(
      "update public.knowledge_discovery_domain_verifications "+
      "set verified_until=clock_timestamp()-interval '1 second' "+
      "where organization_id=$1",[ORG_D]
    );
    const workerProofDenied=(await callAs(b,'service_role',PUBLIC_SAFE_COMMIT,workerArgs))
      .rows[0].result;
    assert.deepEqual(workerProofDenied,{ok:false,reason:'ownership_proof_not_current'});
    assert.equal((await root.query(
      "select status from public.knowledge_discovery_pages where id=$1",
      [seedD.id]
    )).rows[0].status,'discovered');
    await root.query(
      "update public.knowledge_discovery_domain_verifications "+
      "set verified_until=clock_timestamp()+interval '1 hour' "+
      "where organization_id=$1",[ORG_D]
    );

    const committed=(await callAs(b,'service_role',PUBLIC_SAFE_COMMIT,workerArgs))
      .rows[0].result;
    assert.equal(committed.ok,true,'Exact public checked worker RPC must complete');
    assert.equal(committed.status,'completed');
    assert.equal(committed.pages_fetched,1);
    const pageAfter=(await root.query(
      "select status from public.knowledge_discovery_pages where id=$1",
      [seedD.id]
    )).rows[0].status;
    assert.equal(pageAfter,'fetched');
    const repeated=(await callAs(b,'service_role',PUBLIC_SAFE_COMMIT,workerArgs))
      .rows[0].result;
    assert.deepEqual(repeated,{ok:false,reason:'inactive_or_stale_lease'},
      'Completed job cannot be committed with consumed lease');


    // KB-09N closes a privileged orphaned service-only seed-repair path
    // that no longer has a runtime caller after KB-09J atomic job enqueue.
    // All assertions operate only on this random auto-dropped local DB.
    const kb09nBefore=(await root.query(
      "select status,coalesce(last_error_code,'') as code "+
      "from public.knowledge_discovery_jobs where id=$1",
      [acceptedD.job_id]
    )).rows[0];
    await root.query(retiredSeedAudit);
    assert.match(retiredSeedAudit,/KB09N_DISPOSABLE_PARENT_FIXTURE_REQUIRED/);
    const kb09nPriv=(await root.query(
      "select has_function_privilege('service_role',$1,'execute') as public_repair,"+
      "has_function_privilege('service_role',$2,'execute') as private_repair",
      [PUBLIC_FAILURE_SIG,FAILURE_SIG]
    )).rows[0];
    assert.deepEqual(kb09nPriv,{public_repair:false,private_repair:false});
    await assert.rejects(
      callAs(b,'service_role',SEED_FAILURE,[ORG_D,acceptedD.job_id,ADMIN_D]),
      isCode('42501'),'Retired public seed-repair must not be service-callable'
    );
    await assert.rejects(
      callAs(b,'service_role',
        'select kb09h_fixture.fail_unseeded_queued_job_v1($1,$2,$3)',
        [ORG_D,acceptedD.job_id,ADMIN_D]),
      isCode('42501'),'Retired private seed-repair must not be service-callable'
    );
    assert.deepEqual((await root.query(
      "select status,coalesce(last_error_code,'') as code "+
      "from public.knowledge_discovery_jobs where id=$1",
      [acceptedD.job_id]
    )).rows[0],kb09nBefore,'Refused repair cannot alter the job');

    // The read-only catalog contract must fail if a future GRANT makes
    // any retired RPC callable again, even when regular tests pass.
    const kb09nAuditStart=retiredSeedAudit.indexOf('do $kb09n_audit$');
    const kb09nAuditEnd=retiredSeedAudit.indexOf('$kb09n_audit$;',kb09nAuditStart);
    assert.ok(kb09nAuditStart>=0 && kb09nAuditEnd>kb09nAuditStart);
    const kb09nAuditSql=retiredSeedAudit.slice(
      kb09nAuditStart,kb09nAuditEnd+'$kb09n_audit$;'.length
    );
    await root.query(
      'grant execute on function public.fail_knowledge_discovery_seed_v1(uuid,uuid,uuid) to service_role'
    );
    await assert.rejects(root.query(kb09nAuditSql),
      e=>e?.code==='42501'&&/KB09N_retired_rpc_still_executable/.test(e.message),
      'Catalog guard detects a regressed obsolete RPC grant');
    await root.query(
      'revoke execute on function public.fail_knowledge_discovery_seed_v1(uuid,uuid,uuid) from service_role'
    );

    // KB-01B inherited REFERENCES across job/page rows: deny all
    // service-role DML and schema-manipulation grants, not only UPDATE.
    for(const table of [
      'knowledge_discovery_jobs','knowledge_discovery_pages',
      'knowledge_discovery_domain_verifications',
      'knowledge_discovery_site_consents',
      'knowledge_discovery_consent_control',
      'knowledge_discovery_consent_audit',
    ]){
      for(const privilege of [
        'insert','update','delete','truncate','trigger','references',
      ]){
        assert.equal((await root.query(
          "select has_table_privilege('service_role',$1,$2) as allowed",
          ['public.'+table,privilege]
        )).rows[0].allowed,false,'Denied service DML/DDL: '+table+'.'+privilege);
      }
    }
    await root.query(
      'grant references on public.knowledge_discovery_jobs to service_role'
    );
    await assert.rejects(root.query(kb09nAuditSql),
      e=>e?.code==='42501'&&/KB09N_service_role_direct_write_or_ddl/.test(e.message),
      'Catalog guard must detect a regressed REFERENCES privilege');
    await root.query(
      'revoke references on public.knowledge_discovery_jobs from service_role'
    );
    await root.query(kb09nAuditSql);

    // Legitimate authorized workload remains reachable after closing the
    // obsolete seed-repair RPC and inherited table DDL rights.
    const kb09nWorkerACL=(await root.query(
      "select has_function_privilege('service_role',$1,'execute') as checked_worker,"+
      "has_function_privilege('authenticated',$2,'execute') as tenant_cancel",
      [PUBLIC_SAFE_COMMIT_SIG,PUBLIC_CANCEL_SIG]
    )).rows[0];
    assert.deepEqual(kb09nWorkerACL,{checked_worker:true,tenant_cancel:true});
    assert.equal((await root.query(
      "select grants_enabled from public.knowledge_discovery_consent_control"
    )).rows[0].grants_enabled,false);

    // KB-09S: The local-only evidence write is atomically attached to the
    // same checked page-commit function. Never use real website/customer
    // content; all values below belong to the auto-dropped synthetic DB.
    await root.query(atomicEvidenceRehearsal);
    assert.match(atomicEvidenceRehearsal,/KB09S_DISPOSABLE_PARENT_FIXTURE_REQUIRED/);
    const evidenceSignature='public.commit_discovery_evidence_kb09s_rehearsal_v1('+
      'uuid,uuid,uuid,uuid,text,integer,text,text,text,jsonb,integer,jsonb)';
    const evidenceAcl=(await root.query(
      "select has_function_privilege('anon',$1,'execute') as anonymous,"+
      "has_function_privilege('authenticated',$1,'execute') as user_role,"+
      "has_function_privilege('service_role',$1,'execute') as service",
      [evidenceSignature]
    )).rows[0];
    assert.deepEqual(evidenceAcl,{anonymous:false,user_role:false,service:true});
    assert.equal((await root.query(
      "select has_table_privilege('service_role',"+
      "'kb09s_fixture.page_evidence','insert') as direct_write"
    )).rows[0].direct_write,false,'No direct service INSERT into evidence');

    const candidatePage=(await root.query(
      "select id from public.knowledge_discovery_pages where job_id=$1 "+
      "and organization_id=$2 order by discovered_at limit 1",
      [acceptedC.job_id,ORG_C]
    )).rows[0].id;
    const syntheticLease=randomUUID();
    const syntheticQuote='Synthetic fixture answer: training lasts five days.';
    const syntheticEnvelope={
      source_url:SITE_URL,
      snapshot_sha256:'c'.repeat(64),
      fetched_at:new Date().toISOString(),
      quotes:[{
        block_id:'d'.repeat(64),
        exact_quote:syntheticQuote,
        quote_sha256:createHash('sha256').update(syntheticQuote).digest('hex'),
      }],
    };
    const evidenceCommit="select public.commit_discovery_evidence_kb09s_rehearsal_v1("+
      "$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) as result";
    const evidenceArgs=[
      ORG_C,acceptedC.job_id,candidatePage,syntheticLease,
      'fetched',200,'text/html','Synthetic fixture page',null,'[]',2,
      JSON.stringify(syntheticEnvelope),
    ];
    await root.query(
      "update public.knowledge_discovery_jobs set status='running',"+
      "lease_token=$2,lease_until=clock_timestamp()+interval '1 hour',"+
      "finished_at=null where id=$1",
      [acceptedC.job_id,syntheticLease]
    );
    const evidenceCount=async()=>(await root.query(
      'select count(*)::int as n from kb09s_fixture.page_evidence'
    )).rows[0].n;
    const pageAfter=async()=>(await root.query(
      'select status from public.knowledge_discovery_pages where id=$1',
      [candidatePage]
    )).rows[0].status;

    await assert.rejects(
      callAs(b,'authenticated',evidenceCommit,evidenceArgs,ADMIN_C,SID_C),
      isCode('42501'),'Authenticated member cannot call private evidence RPC'
    );
    await assert.rejects(
      callAs(b,'anon',evidenceCommit,evidenceArgs,ADMIN_C,SID_C),
      isCode('42501'),'Anonymous role cannot call evidence RPC'
    );
    assert.equal((await callAs(b,'service_role',evidenceCommit,
      [ORG_D,...evidenceArgs.slice(1)])).rows[0].result.ok,false,
      'Service cannot write another tenant or wrong claim');
    assert.equal(await evidenceCount(),0);
    assert.equal(await pageAfter(),'discovered');

    const alteredHash={...syntheticEnvelope,quotes:[{
      ...syntheticEnvelope.quotes[0],quote_sha256:'f'.repeat(64),
    }]};
    await assert.rejects(callAs(b,'service_role',evidenceCommit,[
      ...evidenceArgs.slice(0,-1),JSON.stringify(alteredHash),
    ]),isCode('22023'),'Quote hash does not match quoted source bytes');
    await assert.rejects(callAs(b,'service_role',evidenceCommit,[
      ...evidenceArgs.slice(0,-1),JSON.stringify({
        ...syntheticEnvelope,unexpected:'forged source authorization',
      }),
    ]),isCode('22023'),'Unexpected evidence metadata cannot be smuggled in');
    const wrongSource=(await callAs(b,'service_role',evidenceCommit,[
      ...evidenceArgs.slice(0,-1),JSON.stringify({
        ...syntheticEnvelope,source_url:'https://attacker.example.com/',
      }),
    ])).rows[0].result;
    assert.deepEqual(wrongSource,{
      ok:false,reason:'source_outside_current_tenant_page',
    });
    // The off-host claim is refused by the explicit stored-page check.
    assert.equal(await evidenceCount(),0);
    assert.equal(await pageAfter(),'discovered');

    // SQL atomicity negative: when the synthetic evidence table fails its
    // INSERT, the earlier proof-/consent-checked PAGE+JOB COMMIT must roll
    // back completely (no fetched page without its evidence).
    await root.query(
      "create function kb09s_fixture.reject_evidence_insert() returns trigger "+
      "language plpgsql as $reject$ begin "+
      "raise exception 'kb09s_forced_evidence_failure' using errcode='23514'; "+
      "end; $reject$"
    );
    await root.query(
      "create trigger kb09s_reject_evidence before insert on "+
      "kb09s_fixture.page_evidence for each row "+
      "execute function kb09s_fixture.reject_evidence_insert()"
    );
    await assert.rejects(
      callAs(b,'service_role',evidenceCommit,evidenceArgs),
      isCode('23514'),'Evidence insert failure must roll back page commit'
    );
    assert.equal(await pageAfter(),'discovered');
    assert.equal(await evidenceCount(),0);
    assert.equal((await root.query(
      'select status from public.knowledge_discovery_jobs where id=$1',
      [acceptedC.job_id]
    )).rows[0].status,'running','Job state also rolled back');
    await root.query('drop trigger kb09s_reject_evidence on kb09s_fixture.page_evidence');

    await root.query(
      "update public.knowledge_discovery_domain_verifications "+
      "set verified_until=clock_timestamp()-interval '1 second' "+
      "where organization_id=$1",[ORG_C]
    );
    const expiredEvidence=(await callAs(b,'service_role',evidenceCommit,
      evidenceArgs)).rows[0].result;
    assert.deepEqual(expiredEvidence,{ok:false,reason:'ownership_proof_not_current'});
    assert.equal(await evidenceCount(),0);
    assert.equal(await pageAfter(),'discovered');
    await root.query(
      "update public.knowledge_discovery_domain_verifications "+
      "set verified_until=clock_timestamp()+interval '1 hour' "+
      "where organization_id=$1",[ORG_C]
    );

    const recorded=(await callAs(b,'service_role',evidenceCommit,
      evidenceArgs)).rows[0].result;
    assert.deepEqual(recorded,{
      ok:true,status:'fetched_with_unreviewed_evidence',
      evidence_recorded:true,snapshot_sha256:'c'.repeat(64),
    });
    assert.equal(await pageAfter(),'fetched');
    assert.equal(await evidenceCount(),1);
    const stored=(await root.query(
      "select organization_id,job_id,page_id,source_url,snapshot_sha256,"+
      "review_state,publish_eligible,quotes "+
      "from kb09s_fixture.page_evidence where page_id=$1",[candidatePage]
    )).rows[0];
    assert.deepEqual(stored,{
      organization_id:ORG_C,job_id:acceptedC.job_id,page_id:candidatePage,
      source_url:SITE_URL,snapshot_sha256:'c'.repeat(64),
      review_state:'unreviewed',publish_eligible:false,
      quotes:syntheticEnvelope.quotes,
    });
    const replay=(await callAs(b,'service_role',evidenceCommit,
      evidenceArgs)).rows[0].result;
    assert.equal(replay.ok,false,'Consumed/stale lease cannot duplicate evidence');
    assert.equal(await evidenceCount(),1);
  }finally{
    await Promise.allSettled(connections.map(db=>db.end()));
    try{if(created)await admin.query('drop database "'+name+'" with (force)');}
    finally{
      try{
        if(bypassRole){
          await admin.query('revoke service_role from "'+bypassRole+'"');
          await admin.query('drop role "'+bypassRole+'"');
        }
    
  }finally{await admin.end();}
    }
  }
});
