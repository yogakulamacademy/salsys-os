import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const {Client}=pg;
const foundation=readFileSync(new URL(
  './knowledge-discovery.foundation.sql',import.meta.url),'utf8');
const discovery=readFileSync(new URL(
  '../../docs/sql/KB-01B-discovery-schema-DRAFT.sql',import.meta.url),'utf8');
const consent=readFileSync(new URL(
  '../../docs/sql/KB-06A-discovery-consent-execution-DRAFT.sql',import.meta.url),'utf8');
const prototype=readFileSync(new URL(
  '../../docs/sql/KB-09E-claimed-job-early-denial-CAS-REHEARSAL-DRAFT.sql',
  import.meta.url),'utf8');

const ORG_A='10000000-0000-4000-8000-000000000001';
const ORG_B='10000000-0000-4000-8000-000000000002';
const USER='20000000-0000-4000-8000-000000000001';
const SITE='https://fixture.example.com/';
const HOST='fixture.example.com';
const HASH='a'.repeat(64);
const ABORT='select kb09e_fixture.abort_claimed_job_on_current_denial_v1($1,$2,$3,$4) as result';
const CLAIM='select * from public.claim_knowledge_discovery_job_v1()';
const COMMIT='select public.commit_knowledge_discovery_page_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) as result';
const SIGNATURE='kb09e_fixture.abort_claimed_job_on_current_denial_v1(uuid,uuid,uuid,text)';

function localAdmin(){
  assert.equal(process.env.SALSYS_ALLOW_LOCAL_DB_TESTS,'1',
    'A manually opted-in disposable local PostgreSQL fixture is required');
  const url=new URL(process.env.SALSYS_TEST_DATABASE_URL||'');
  assert.equal(url.protocol,'postgres:');
  assert.ok(['localhost','127.0.0.1'].includes(url.hostname),'Never contact hosted SQL');
  assert.equal(url.pathname,'/postgres','Refuse existing app databases');
  assert.equal(url.username,'postgres');
  assert.equal(url.search,'');
  return url;
}
async function beginRole(db,role='service_role'){
  await db.query('begin');
  await db.query("set local statement_timeout='9s'");
  await db.query("set local lock_timeout='7s'");
  await db.query('set local role '+role);
  await db.query("select set_config('request.jwt.claims',$1,true)",[
    JSON.stringify({role,sub:USER}),
  ]);
}
async function rpc(db,role,query,args=[]){
  await beginRole(db,role);
  try{
    const response=await db.query(query,args);
    await db.query('commit');
    return response;
  }catch(e){await db.query('rollback');throw e;}
}
const abortArgs=(org,job,token,reason)=>[org,job,token,reason];
const commitArgs=(org,job,token)=>[
  org,job,null,token,'skipped',null,null,null,null,'[]',2,
];
const isError=(code)=>e=>e?.code===code;

test('KB-09E guarded SQL: early-denial CAS, audit, tenant privileges and racing page commits only in disposable PostgreSQL',async()=>{
  const base=localAdmin();
  const name='salsys_kb09e_'+randomUUID().replaceAll('-','').slice(0,18);
  assert.match(name,/^salsys_kb09e_[a-f0-9]{18}$/);
  const target=new URL(base);target.pathname='/'+name;
  const administrator=new Client({connectionString:base.toString()});
  const sessions=[];let created=false;
  await administrator.connect();
  try{
    await administrator.query('create database "'+name+'"');created=true;
    const connect=async()=>{
      const client=new Client({connectionString:target.toString()});
      sessions.push(client);await client.connect();return client;
    };
    const root=await connect();
    assert.equal((await root.query(
      "select to_regclass('public.organizations') as existing"
    )).rows[0].existing,null);
    await root.query(foundation);
    await root.query(discovery);
    await root.query(consent);
    await root.query(prototype); // Apply the exact, guarded NON-migration draft.
    assert.match(prototype,/KB09E_DISPOSABLE_PARENT_FIXTURE_REQUIRED/);
    assert.doesNotMatch(prototype,/create or replace function public\./i);
    assert.doesNotMatch(prototype,/cron\.schedule|net\.http|http_get/i);
    const acl=(await root.query(
      "select has_function_privilege('anon',$1,'execute') as anon,"+
      "has_function_privilege('authenticated',$1,'execute') as client,"+
      "has_function_privilege('service_role',$1,'execute') as service,"+
      "has_table_privilege('authenticated','kb09e_fixture.early_denial_audit','insert') as client_audit,"+
      "has_table_privilege('service_role','kb09e_fixture.early_denial_audit','insert') as service_audit",
      [SIGNATURE]
    )).rows[0];
    assert.deepEqual(acl,{
      anon:false,client:false,service:true,client_audit:false,service_audit:false,
    });
    assert.equal((await root.query(
      "select relrowsecurity from pg_class where oid='kb09e_fixture.early_denial_audit'::regclass"
    )).rows[0].relrowsecurity,true);

    await root.query('insert into public.organizations(id) values($1),($2)',[ORG_A,ORG_B]);
    const proofUntil=new Date(Date.now()+1800_000).toISOString();
    const consentUntil=new Date(Date.now()+1800_000).toISOString();
    for(const org of [ORG_A,ORG_B]){
      await root.query(
        "insert into public.knowledge_discovery_domain_verifications "+
        "(organization_id,hostname,challenge_hash,created_by,issued_at,"+
        "challenge_expires_at,verified_at,verified_until) "+
        "values($1,$2,$3,$4,now()-interval '1 hour',"+
        "now()+interval '1 hour',now()-interval '3 minutes',$5)",
        [org,HOST,HASH,USER,proofUntil]
      );
      await root.query(
        "insert into public.knowledge_discovery_site_consents "+
        "(organization_id,hostname,purpose,status,policy_version,granted_by,granted_at,valid_until) "+
        "values($1,$2,'website_discovery_review_only','granted',"+
        "'synthetic-test-policy', $3,now()-interval '30 minutes',$4)",
        [org,HOST,USER,consentUntil]
      );
    }
    const a=await connect(),b=await connect(),c=await connect();
    const getJob=async(org,id)=>(await root.query(
      "select status,lease_token,attempts,last_error_code from public.knowledge_discovery_jobs "+
      "where organization_id=$1 and id=$2",[org,id]
    )).rows[0];
    const audits=async(org,id)=>(await root.query(
      "select reason,lease_sha256,prior_status,result_status "+
      "from kb09e_fixture.early_denial_audit where organization_id=$1 and job_id=$2",
      [org,id]
    )).rows;
    const freshConsent=async(org)=>root.query(
      "update public.knowledge_discovery_site_consents set "+
      "status='granted',withdrawn_at=null,valid_until=now()+interval '30 minutes' "+
      "where organization_id=$1",[org]);
    const expireConsent=async(org)=>root.query(
      "update public.knowledge_discovery_site_consents set "+
      "valid_until=now()-interval '1 second' where organization_id=$1",[org]);
    const freshProof=async(org)=>root.query(
      "update public.knowledge_discovery_domain_verifications set "+
      "verified_until=now()+interval '30 minutes' where organization_id=$1",[org]);
    const expireProof=async(org)=>root.query(
      "update public.knowledge_discovery_domain_verifications set "+
      "verified_until=now()-interval '1 second' where organization_id=$1",[org]);

    async function claimNew(org){
      // Existing KB-01E per-org rate guard is preserved; backdate completed
      // synthetic rows so unrelated tests can create another isolated case.
      await root.query(
        "update public.knowledge_discovery_jobs set "+
        "created_at=now()-interval '26 hours' "+
        "where organization_id=$1 and status not in ('queued','running')",
        [org]
      );
      const id=(await root.query(
        "insert into public.knowledge_discovery_jobs "+
        "(organization_id,created_by,seed_url,max_pages) "+
        "values($1,$2,$3,2) returning id",[org,USER,SITE]
      )).rows[0].id;
      const claimed=(await rpc(a,'service_role',CLAIM)).rows;
      assert.equal(claimed.length,1);
      assert.equal(claimed[0].job_id,id);
      assert.equal(claimed[0].organization_id,org);
      assert.ok(claimed[0].lease_token);
      return {id,lease:claimed[0].lease_token};
    }
    async function retire(org,id){
      await root.query(
        "update public.knowledge_discovery_jobs set status='cancelled',"+
        "lease_token=null,lease_until=null,finished_at=now() "+
        "where organization_id=$1 and id=$2 and status='running'",[org,id]
      );
    }
    const cancel=(db,org,job,lease,reason)=>rpc(
      db,'service_role',ABORT,abortArgs(org,job,lease,reason));

    // No false cancellation when tenant evidence remains valid.
    const current=await claimNew(ORG_A);
    let result=(await cancel(b,ORG_A,current.id,current.lease,'consent_not_active')).rows[0].result;
    assert.deepEqual(result,{ok:false,reason:'denial_not_current'});
    result=(await cancel(b,ORG_A,current.id,current.lease,'ownership_proof_expired')).rows[0].result;
    assert.deepEqual(result,{ok:false,reason:'denial_not_current'});
    assert.deepEqual(await audits(ORG_A,current.id),[]);
    assert.equal((await getJob(ORG_A,current.id)).status,'running');

    // Incorrect tenant, token and attempted replay never cancel the job.
    result=(await cancel(b,ORG_B,current.id,current.lease,'consent_not_active')).rows[0].result;
    assert.deepEqual(result,{ok:false,reason:'inactive_or_stale_lease'});
    result=(await cancel(b,ORG_A,current.id,randomUUID(),'consent_not_active')).rows[0].result;
    assert.deepEqual(result,{ok:false,reason:'inactive_or_stale_lease'});
    await assert.rejects(
      rpc(c,'authenticated',ABORT,abortArgs(
        ORG_A,current.id,current.lease,'consent_not_active'
      )),isError('42501'));
    await assert.rejects(
      cancel(b,ORG_A,current.id,current.lease,'untrusted_failure'),
      isError('22023'));
    assert.deepEqual(await audits(ORG_A,current.id),[]);
    await retire(ORG_A,current.id);

    // Expired consent AFTER claim: terminate immediately with hashed lease
    // evidence and no retries; old worker cannot commit against this lease.
    const lostConsent=await claimNew(ORG_A);
    await expireConsent(ORG_A);
    result=(await cancel(b,ORG_A,lostConsent.id,lostConsent.lease,'consent_not_active')).rows[0].result;
    assert.deepEqual(result,{
      ok:true,status:'cancelled',reason:'consent_not_active',audit_recorded:true,
    });
    const after=await getJob(ORG_A,lostConsent.id);
    assert.equal(after.status,'cancelled');
    assert.equal(after.lease_token,null);
    assert.equal(after.last_error_code,'consent_not_active');
    assert.equal(after.attempts,0,'No additional retries introduced by cancellation');
    assert.deepEqual(await audits(ORG_A,lostConsent.id),[{
      reason:'consent_not_active',
      lease_sha256:createHash('sha256').update(lostConsent.lease,'utf8').digest('hex'),
      prior_status:'running',result_status:'cancelled',
    }]);
    assert.deepEqual((await cancel(b,ORG_A,lostConsent.id,lostConsent.lease,'consent_not_active'))
      .rows[0].result,{ok:false,reason:'inactive_or_stale_lease'});
    assert.deepEqual((await rpc(b,'service_role',COMMIT,
      commitArgs(ORG_A,lostConsent.id,lostConsent.lease))).rows[0].result,
      {ok:false,reason:'inactive_or_stale_lease'});

    // Expired proof while consent still active is a distinct validated reason.
    await freshConsent(ORG_A);
    const lostProof=await claimNew(ORG_A);
    await expireProof(ORG_A);
    assert.equal((await cancel(b,ORG_A,lostProof.id,lostProof.lease,
      'consent_not_active')).rows[0].result.reason,'denial_not_current');
    assert.deepEqual((await cancel(b,ORG_A,lostProof.id,lostProof.lease,
      'ownership_proof_expired')).rows[0].result,{
      ok:true,status:'cancelled',reason:'ownership_proof_expired',audit_recorded:true,
    });
    assert.equal((await audits(ORG_A,lostProof.id))[0].reason,'ownership_proof_expired');

    // A revalidated proof means a stale preflight denial is not enough.
    await freshProof(ORG_A);
    const renewed=await claimNew(ORG_A);
    const renewedAnswer=(await cancel(b,ORG_A,renewed.id,renewed.lease,
      'ownership_proof_expired')).rows[0].result;
    assert.deepEqual(renewedAnswer,{ok:false,reason:'denial_not_current'});
    await retire(ORG_A,renewed.id);

    // Failure to insert audit MUST roll back job status/token clearing.
    const colliding=await claimNew(ORG_A);
    await expireProof(ORG_A);
    const tokenHash=createHash('sha256').update(colliding.lease,'utf8').digest('hex');
    await root.query(
      "insert into kb09e_fixture.early_denial_audit "+
      "(organization_id,job_id,lease_sha256,reason,prior_status,result_status) "+
      "values($1,$2,$3,'ownership_proof_expired','running','cancelled')",
      [ORG_A,colliding.id,tokenHash]
    );
    await assert.rejects(cancel(b,ORG_A,colliding.id,colliding.lease,
      'ownership_proof_expired'),isError('23505'));
    assert.equal((await getJob(ORG_A,colliding.id)).status,'running');
    assert.equal((await getJob(ORG_A,colliding.id)).lease_token,colliding.lease);
    await root.query(
      "delete from kb09e_fixture.early_denial_audit where organization_id=$1 and job_id=$2",
      [ORG_A,colliding.id]
    );
    await retire(ORG_A,colliding.id);
    await freshProof(ORG_A);

    // Two transactions race to abort the SAME lease; exactly one may win.
    const raced=await claimNew(ORG_A);
    await expireProof(ORG_A);
    await beginRole(b);
    const winner=(await b.query(ABORT,abortArgs(ORG_A,raced.id,raced.lease,
      'ownership_proof_expired'))).rows[0].result;
    assert.equal(winner.ok,true);
    await beginRole(c);
    let resolved=false;
    const second=c.query(ABORT,abortArgs(ORG_A,raced.id,raced.lease,
      'ownership_proof_expired')).then(
        value=>({ok:true,value}),error=>({ok:false,error})
      ).finally(()=>{resolved=true;});
    await new Promise(resolve=>setTimeout(resolve,90));
    assert.equal(resolved,false,'Second abort must wait for row lock');
    await b.query('commit');
    const secondResult=await second;
    assert.equal(secondResult.ok,true);
    assert.deepEqual(secondResult.value.rows[0].result,{
      ok:false,reason:'inactive_or_stale_lease',
    });
    await c.query('commit');
    assert.equal((await audits(ORG_A,raced.id)).length,1);

    // Abort winning first means the existing SQL page commit cannot write.
    await freshProof(ORG_A);
    const abortFirst=await claimNew(ORG_A);
    await expireProof(ORG_A);
    await beginRole(b);
    assert.equal((await b.query(ABORT,abortArgs(ORG_A,abortFirst.id,abortFirst.lease,
      'ownership_proof_expired'))).rows[0].result.ok,true);
    await beginRole(c);
    let commitResolved=false;
    const lateCommit=c.query(COMMIT,commitArgs(
      ORG_A,abortFirst.id,abortFirst.lease
    )).then(value=>({ok:true,value}),error=>({ok:false,error}))
      .finally(()=>{commitResolved=true;});
    await new Promise(resolve=>setTimeout(resolve,90));
    assert.equal(commitResolved,false,'SQL commit must wait on job CAS lock');
    await b.query('commit');
    const loser=await lateCommit;
    assert.equal(loser.ok,true);
    assert.deepEqual(loser.value.rows[0].result,{
      ok:false,reason:'inactive_or_stale_lease',
    });
    await c.query('commit');
    assert.equal((await audits(ORG_A,abortFirst.id)).length,1);

    // A completed SQL commit that wins FIRST cannot be undone by a late
    // cancellation. This is a known limitation, not a concurrency success.
    await freshProof(ORG_A);
    const commitFirst=await claimNew(ORG_A);
    await expireProof(ORG_A);
    await beginRole(b);
    const ack=(await b.query(COMMIT,commitArgs(
      ORG_A,commitFirst.id,commitFirst.lease
    ))).rows[0].result;
    assert.equal(ack.ok,true);
    await beginRole(c);
    let aborted=false;
    const staleAbort=c.query(ABORT,abortArgs(
      ORG_A,commitFirst.id,commitFirst.lease,'ownership_proof_expired'
    )).then(value=>({ok:true,value}),error=>({ok:false,error}))
      .finally(()=>{aborted=true;});
    await new Promise(resolve=>setTimeout(resolve,90));
    assert.equal(aborted,false,'Abort must wait while page commit owns job row');
    await b.query('commit');
    const stale=await staleAbort;
    assert.equal(stale.ok,true);
    assert.deepEqual(stale.value.rows[0].result,{
      ok:false,reason:'inactive_or_stale_lease',
    });
    await c.query('commit');
    assert.deepEqual(await audits(ORG_A,commitFirst.id),[]);
    assert.equal((await getJob(ORG_A,commitFirst.id)).status,'completed');

    // Tenant B remains untouched throughout all A cancellations/retries.
    await freshProof(ORG_B);
    const tenantB=await claimNew(ORG_B);
    const stateB=await getJob(ORG_B,tenantB.id);
    assert.equal(stateB.status,'running');
    assert.deepEqual(await audits(ORG_B,tenantB.id),[]);
    await retire(ORG_B,tenantB.id);
  }finally{
    await Promise.allSettled(sessions.map(s=>s.end()));
    try{if(created)await administrator.query('drop database "'+name+'" with (force)');}
    finally{await administrator.end();}
  }
});
