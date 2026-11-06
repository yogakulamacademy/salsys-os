import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const { Client } = pg;
const foundation = readFileSync(new URL('./knowledge-discovery.foundation.sql', import.meta.url), 'utf8');
const exactDraft = readFileSync(new URL('../../docs/sql/KB-01B-discovery-schema-DRAFT.sql', import.meta.url), 'utf8');
const ORG_A = '10000000-0000-4000-8000-000000000001';
const ORG_B = '10000000-0000-4000-8000-000000000002';
const USER_A = '20000000-0000-4000-8000-000000000001';
const USER_B = '20000000-0000-4000-8000-000000000002';
const STRANGER = '20000000-0000-4000-8000-000000000003';

function localAdminUrl() {
  assert.equal(process.env.SALSYS_ALLOW_LOCAL_DB_TESTS,'1','Explicit local opt-in required');
  const raw = process.env.SALSYS_TEST_DATABASE_URL;
  assert.ok(raw,'Local test URL required');
  const url = new URL(raw);
  assert.equal(url.protocol,'postgres:');
  assert.ok(['localhost','127.0.0.1'].includes(url.hostname),'Never connect to remote PostgreSQL');
  assert.equal(url.pathname,'/postgres','Refuse application databases');
  assert.equal(url.username,'postgres','Local admin only');
  return url;
}
async function context(db,role,user) {
  await db.query('begin');
  await db.query("set local statement_timeout = '10s'");
  await db.query('set local role '+role);
  await db.query('select set_config($1,$2,true)',[
    'request.jwt.claims',JSON.stringify({role,sub:user}),
  ]);
}

test('exact KB-01B SQL passes tenant, RLS, lease and cancellation checks in disposable PostgreSQL', async () => {
  const base = localAdminUrl();
  const name = 'salsys_kb01c_'+randomUUID().replaceAll('-','').slice(0,20);
  const dbName = '"'+name+'"';
  const target = new URL(base);target.pathname='/'+name;
  const admin = new Client({connectionString:base.toString()});
  const sessions=[];let created=false;
  await admin.connect();
  try {
    await admin.query('create database '+dbName);created=true;
    const db = new Client({connectionString:target.toString()});
    sessions.push(db);await db.connect();
    assert.equal((await db.query("select to_regclass('public.organizations') as existing")).rows[0].existing,null);
    await db.query(foundation);
    await db.query(exactDraft);
    await db.query('insert into public.organizations(id) values($1),($2)',[ORG_A,ORG_B]);
    await db.query('insert into public.test_knowledge_admins(organization_id,user_id) values($1,$2),($3,$4)',[ORG_A,USER_A,ORG_B,USER_B]);
    await db.query(
      "insert into public.knowledge_discovery_domain_verifications"+
      " (organization_id,hostname,challenge_hash,created_by,challenge_expires_at,verified_at,verified_until)"+
      " values ($1,'yogakulam.com',$2,$3,now()+interval '1 day',now(),now()+interval '30 days'),"+
      " ($4,'example.org',$5,$6,now()+interval '1 day',now(),now()+interval '30 days')",
      [ORG_A,'a'.repeat(64),USER_A,ORG_B,'b'.repeat(64),USER_B]);


    const acl=await db.query(
      "select "+
      "has_table_privilege('anon','public.knowledge_discovery_jobs','SELECT') as anon_jobs,"+
      "has_table_privilege('authenticated','public.knowledge_discovery_jobs','INSERT') as client_insert,"+
      "has_table_privilege('authenticated','public.knowledge_discovery_jobs','UPDATE') as client_update,"+
      "has_table_privilege('authenticated','public.knowledge_discovery_pages','INSERT') as client_page_insert,"+
      "has_table_privilege('anon','public.knowledge_discovery_domain_verifications','SELECT') as anon_proof,"+
      "has_table_privilege('authenticated','public.knowledge_discovery_domain_verifications','INSERT') as client_proof_insert,"+
      "has_function_privilege('anon','public.claim_knowledge_discovery_job_v1()','EXECUTE') as anon_claim,"+
      "has_function_privilege('authenticated','public.claim_knowledge_discovery_job_v1()','EXECUTE') as client_claim,"+
      "has_function_privilege('service_role','public.claim_knowledge_discovery_job_v1()','EXECUTE') as service_claim"
    );
    assert.deepEqual(acl.rows[0],{
      anon_jobs:false,client_insert:false,client_update:false,client_page_insert:false,
      anon_proof:false,client_proof_insert:false,
      anon_claim:false,client_claim:false,service_claim:true,
    });

    const aJob=await db.query(
      "insert into public.knowledge_discovery_jobs(organization_id,created_by,seed_url,max_pages)"+
      " values($1,$2,'https://yogakulam.com/',10) returning id",[ORG_A,USER_A]);
    const bJob=await db.query(
      "insert into public.knowledge_discovery_jobs(organization_id,created_by,seed_url,max_pages)"+
      " values($1,$2,'https://example.org/',10) returning id",[ORG_B,USER_B]);
    const idA=aJob.rows[0].id,idB=bJob.rows[0].id;
    await db.query(
      "insert into public.knowledge_discovery_pages(organization_id,job_id,url)"+
      " values($1,$2,'https://yogakulam.com/'),($3,$4,'https://example.org/')",
      [ORG_A,idA,ORG_B,idB]);
    await db.query('begin');
    await db.query('savepoint duplicate_job');
    await assert.rejects(db.query(
      "insert into public.knowledge_discovery_jobs(organization_id,created_by,seed_url)"+
      " values($1,$2,'https://yogakulam.com/again')",[ORG_A,USER_A]),e=>e.code==='23505');
    await db.query('rollback to savepoint duplicate_job');
    await db.query('savepoint cross_tenant_page');
    await assert.rejects(db.query(
      "insert into public.knowledge_discovery_pages(organization_id,job_id,url)"+
      " values($1,$2,'https://yogakulam.com/cross')",[ORG_B,idA]),e=>e.code==='23503');
    await db.query('rollback to savepoint cross_tenant_page');
    await db.query('commit');

    await context(db,'authenticated',USER_A);
    assert.deepEqual((await db.query('select organization_id from public.knowledge_discovery_jobs')).rows.map(x=>x.organization_id),[ORG_A]);
    assert.deepEqual((await db.query('select organization_id from public.knowledge_discovery_pages')).rows.map(x=>x.organization_id),[ORG_A]);
    assert.deepEqual((await db.query('select organization_id from public.knowledge_discovery_domain_verifications')).rows.map(x=>x.organization_id),[ORG_A]);
    await db.query('savepoint prohibited_write');
    await assert.rejects(db.query(
      "insert into public.knowledge_discovery_jobs(organization_id,created_by,seed_url)"+
      " values($1,$2,'https://example.com/')",[ORG_A,USER_A]),e=>e.code==='42501');
    await db.query('rollback to savepoint prohibited_write');
    await db.query('rollback');

    await context(db,'authenticated',USER_B);
    assert.deepEqual((await db.query('select organization_id from public.knowledge_discovery_jobs')).rows.map(x=>x.organization_id),[ORG_B]);
    assert.deepEqual((await db.query('select organization_id from public.knowledge_discovery_domain_verifications')).rows.map(x=>x.organization_id),[ORG_B]);
    await db.query('rollback');
    await context(db,'authenticated',STRANGER);
    assert.equal((await db.query('select count(*)::int as n from public.knowledge_discovery_jobs')).rows[0].n,0);
    assert.equal((await db.query('select count(*)::int as n from public.knowledge_discovery_domain_verifications')).rows[0].n,0);
    await db.query('rollback');

    const a=new Client({connectionString:target.toString()});
    const b=new Client({connectionString:target.toString()});
    sessions.push(a,b);await Promise.all([a.connect(),b.connect()]);
    await Promise.all([context(a,'service_role',USER_A),context(b,'service_role',USER_B)]);
    const [first,second]=await Promise.all([
      a.query('select * from public.claim_knowledge_discovery_job_v1()'),
      b.query('select * from public.claim_knowledge_discovery_job_v1()'),
    ]);
    assert.equal(first.rowCount,1);
    assert.equal(second.rowCount,1);
    assert.notEqual(first.rows[0].job_id,second.rows[0].job_id,'skip locked prevents duplicate claim');
    await Promise.all([a.query('commit'),b.query('commit')]);
    await context(a,'service_role',USER_A);
    assert.equal((await a.query('select count(*)::int as n from public.claim_knowledge_discovery_job_v1()')).rows[0].n,0);
    await a.query('commit');

    const firstId=first.rows[0].job_id,firstToken=first.rows[0].lease_token;
    await db.query("update public.knowledge_discovery_jobs set lease_until=now()-interval '1 second' where id=$1",[firstId]);
    await context(a,'service_role',USER_A);
    const renewed=await a.query('select * from public.claim_knowledge_discovery_job_v1()');
    assert.equal(renewed.rows[0].job_id,firstId);
    assert.notEqual(renewed.rows[0].lease_token,firstToken);
    await a.query('commit');
    const stale=await db.query(
      "update public.knowledge_discovery_jobs set status='completed'"+
      " where id=$1 and status='running' and lease_token=$2 returning id",[firstId,firstToken]);
    assert.equal(stale.rowCount,0);
    assert.equal((await db.query('select attempts from public.knowledge_discovery_jobs where id=$1',[firstId])).rows[0].attempts,1);

    // Atomic commit refuses a superseded token without touching any page.
    await context(a,'service_role',USER_A);
    const firstPageId = (await db.query(
      'select id from public.knowledge_discovery_pages where job_id=$1',[firstId])).rows[0].id;
    const staleCommit = await a.query(
      'select public.commit_knowledge_discovery_page_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11) as result',
      [first.rows[0].organization_id,firstId,firstPageId,firstToken,'fetched',200,
        'text/html','Unsafe stale result',null,'[]',2]);
    assert.equal(staleCommit.rows[0].result.ok,false,'stale lease cannot write page');
    assert.equal((await db.query(
      'select status from public.knowledge_discovery_pages where id=$1',[firstPageId])).rows[0].status,'discovered');
    const validCommit = await a.query(
      'select public.commit_knowledge_discovery_page_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11) as result',
      [first.rows[0].organization_id,firstId,firstPageId,renewed.rows[0].lease_token,
        'fetched',200,'text/html','Synthetic homepage',null,
        JSON.stringify(['https://yogakulam.com/about','https://yogakulam.com/classes']),2]);
    assert.equal(validCommit.rows[0].result.ok,true);
    assert.equal(validCommit.rows[0].result.status,'queued');
    await a.query('commit');
    const afterCommit=await db.query(
      'select status,pages_discovered,pages_fetched from public.knowledge_discovery_jobs where id=$1',[firstId]);
    assert.equal(afterCommit.rows[0].status,'queued');
    assert.equal(afterCommit.rows[0].pages_discovered,3);
    assert.equal(afterCommit.rows[0].pages_fetched,1);

    // Each successive page uses a new lease. Verify truthful partial coverage
    // when a robots-blocked page and a successfully fetched page coexist.
    for (const expectedStatus of ['blocked','fetched']) {
      await db.query(
        "update public.knowledge_discovery_jobs set next_allowed_at=now()-interval '1 second' where id=$1",
        [firstId]);
      await context(a,'service_role',USER_A);
      const claimed=await a.query('select * from public.claim_knowledge_discovery_job_v1()');
      assert.equal(claimed.rowCount,1);
      assert.equal(claimed.rows[0].job_id,firstId);
      const pending=await db.query(
        "select id from public.knowledge_discovery_pages where job_id=$1 and status='discovered' order by url limit 1",
        [firstId]);
      assert.equal(pending.rowCount,1);
      const response=await a.query(
        'select public.commit_knowledge_discovery_page_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11) as result',
        [first.rows[0].organization_id,firstId,pending.rows[0].id,
          claimed.rows[0].lease_token,expectedStatus,
          expectedStatus==='fetched'?200:null,
          expectedStatus==='fetched'?'text/html':null,
          expectedStatus==='fetched'?'Synthetic course':'',
          expectedStatus==='blocked'?'robots_disallow':null,
          '[]',2]);
      assert.equal(response.rows[0].result.ok,true);
      await a.query('commit');
    }
    const complete=await db.query(
      'select status,pages_discovered,pages_fetched,pages_blocked,pages_failed from public.knowledge_discovery_jobs where id=$1',
      [firstId]);
    assert.deepEqual(complete.rows[0],{
      status:'partial',pages_discovered:3,pages_fetched:2,pages_blocked:1,pages_failed:0,
    });

    // Cancellation obtains a row lock. A concurrent late worker waits,
    // then sees the cancelled job and cannot write its page.
    const otherId=firstId===idA?idB:idA;
    const otherOrg=firstId===idA?ORG_B:ORG_A;
    const otherToken=second.rows[0].lease_token;
    const otherPageId=(await db.query(
      'select id from public.knowledge_discovery_pages where job_id=$1',[otherId])).rows[0].id;
    await db.query('begin');
    await db.query(
      "update public.knowledge_discovery_jobs set status='cancelled',lease_token=null,lease_until=null where id=$1",
      [otherId]);
    await context(a,'service_role',USER_A);
    const racing=a.query(
      'select public.commit_knowledge_discovery_page_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11) as result',
      [otherOrg,otherId,otherPageId,otherToken,'fetched',200,'text/html',
        'Should not persist',null,'[]',2]);
    await db.query('commit');
    const rejected=await racing;
    assert.equal(rejected.rows[0].result.ok,false,'cancelled job rejects delayed commit');
    await a.query('commit');
    assert.equal((await db.query(
      'select status from public.knowledge_discovery_pages where id=$1',[otherPageId])).rows[0].status,'discovered');

    await db.query(
      "update public.knowledge_discovery_jobs set attempts=5,lease_until=now()-interval '1 minute',status='running' where id=$1",[firstId]);
    await context(a,'service_role',USER_A);
    assert.equal((await a.query('select count(*)::int as n from public.claim_knowledge_discovery_job_v1()')).rows[0].n,0);
    await a.query('commit');
    assert.equal((await db.query('select status from public.knowledge_discovery_jobs where id=$1',[firstId])).rows[0].status,'failed');

    // Database—not the browser—enforces a per-organization cooldown
    // and rolling 24-hour job limit after earlier scans finish.
    await assert.rejects(db.query(
      "insert into public.knowledge_discovery_jobs(organization_id,created_by,seed_url)"+
      " values($1,$2,'https://yogakulam.com/rate')",[ORG_A,USER_A]),
      e=>e.code==='P0001' && e.message==='discovery_scan_cooldown');

    await db.query(
      "update public.knowledge_discovery_jobs"+
      " set created_at=now()-interval '20 minutes' where organization_id=$1",[ORG_A]);
    const secondA=await db.query(
      "insert into public.knowledge_discovery_jobs(organization_id,created_by,seed_url)"+
      " values($1,$2,'https://yogakulam.com/second') returning id",[ORG_A,USER_A]);
    await db.query(
      "update public.knowledge_discovery_jobs set status='completed',"+
      " created_at=now()-interval '20 minutes' where id=$1",[secondA.rows[0].id]);
    const thirdA=await db.query(
      "insert into public.knowledge_discovery_jobs(organization_id,created_by,seed_url)"+
      " values($1,$2,'https://yogakulam.com/third') returning id",[ORG_A,USER_A]);
    await db.query(
      "update public.knowledge_discovery_jobs set status='completed' where id=$1",
      [thirdA.rows[0].id]);
    await assert.rejects(db.query(
      "insert into public.knowledge_discovery_jobs(organization_id,created_by,seed_url)"+
      " values($1,$2,'https://yogakulam.com/fourth')",[ORG_A,USER_A]),
      e=>e.code==='P0001' && e.message==='discovery_daily_scan_limit');

    // Concurrent first scans for a new tenant cannot both enter the queue.
    const ORG_C='10000000-0000-4000-8000-000000000003';
    await db.query('insert into public.organizations(id) values($1)',[ORG_C]);
    const insertC=()=>(
      "insert into public.knowledge_discovery_jobs(organization_id,created_by,seed_url)"+
      " values('"+ORG_C+"','"+USER_A+"','https://fixture.example.com/') returning id");
    const simultaneous=await Promise.allSettled([a.query(insertC()),b.query(insertC())]);
    assert.equal(simultaneous.filter(x=>x.status==='fulfilled').length,1,
      'Only one concurrent organization scan is accepted');
    assert.equal(simultaneous.filter(x=>x.status==='rejected' && x.reason.code==='23505').length,1,
      'Duplicate active-job invariant survives concurrent INSERTs');
    assert.equal((await db.query(
      'select count(*)::int as n from public.knowledge_discovery_jobs where organization_id=$1',[ORG_C]
    )).rows[0].n,1);


    // Website proof tokens cannot be reissued by parallel admins within
    // the five-minute cooldown. The second request waits on the same
    // transaction-scoped advisory lock and gets a deterministic rejection.
    const issueSql = 'select public.issue_knowledge_discovery_domain_challenge_v1('
      + '$1,$2,$3,$4) as expiry';
    const proofHost = 'fixture.example.com';
    const hashFirst='c'.repeat(64), hashSecond='d'.repeat(64);
    await Promise.all([context(a,'service_role',USER_A),context(b,'service_role',USER_B)]);
    const issued=await a.query(issueSql,[ORG_C,proofHost,USER_A,hashFirst]);
    assert.ok(Date.parse(issued.rows[0].expiry)>Date.now());
    const secondIssue=b.query(issueSql,[ORG_C,proofHost,USER_B,hashSecond])
      .then(value=>({ok:true,value}),error=>({ok:false,error}));
    await a.query('commit');
    const doubleIssue=await secondIssue;
    assert.equal(doubleIssue.ok,false);
    assert.equal(doubleIssue.error?.code,'P0001');
    assert.equal(doubleIssue.error?.message,'domain_challenge_cooldown');
    await b.query('rollback');
    const proofRow=await db.query(
      'select challenge_hash,issued_at,last_check_at from public.knowledge_discovery_domain_verifications'
      +' where organization_id=$1 and hostname=$2',[ORG_C,proofHost]);
    assert.equal(proofRow.rows[0].challenge_hash,hashFirst);
    assert.equal(proofRow.rows[0].last_check_at,null);

    // Proof reads are likewise budgeted before any outbound request.
    // The locking UPDATE permits exactly one concurrent verification fetch.
    const claimCheckSql = 'select public.claim_knowledge_discovery_proof_check_v1('
      + '$1,$2,$3) as allowed';
    await Promise.all([context(a,'service_role',USER_A),context(b,'service_role',USER_B)]);
    const firstCheck=await a.query(claimCheckSql,[ORG_C,proofHost,hashFirst]);
    assert.equal(firstCheck.rows[0].allowed,true);
    const duplicateCheck=b.query(claimCheckSql,[ORG_C,proofHost,hashFirst]);
    await a.query('commit');
    const duplicate=await duplicateCheck;
    assert.equal(duplicate.rows[0].allowed,false);
    await b.query('commit');

    await db.query(
      "update public.knowledge_discovery_domain_verifications"
      +" set last_check_at=now()-interval '31 seconds'"
      +" where organization_id=$1 and hostname=$2",[ORG_C,proofHost]);
    await context(a,'service_role',USER_A);
    assert.equal((await a.query(claimCheckSql,[ORG_C,proofHost,hashFirst])).rows[0].allowed,true);
    await a.query('commit');

    // A stale token or an unprivileged caller never obtains a fetch claim.
    await context(a,'service_role',USER_A);
    assert.equal((await a.query(claimCheckSql,[ORG_C,proofHost,hashSecond])).rows[0].allowed,false);
    await a.query('commit');
    await context(a,'authenticated',USER_A);
    await assert.rejects(a.query(issueSql,[ORG_C,proofHost,USER_A,hashSecond]),
      error=>error.code==='42501');
    await a.query('rollback');

  } finally {
    await Promise.allSettled(sessions.map(s=>s.end()));
    try{if(created)await admin.query('drop database '+dbName+' with (force)');}
    finally{await admin.end();}
  }
});
