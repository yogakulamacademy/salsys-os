import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const { Client }=pg;
const approval=readFileSync(new URL(
  '../../docs/sql/KB-08E-version-aware-knowledge-approval-REHEARSAL-DRAFT.sql',
  import.meta.url),'utf8');
const invalidation=readFileSync(new URL(
  '../../docs/sql/KB-08F-postapproval-source-invalidation-REHEARSAL-DRAFT.sql',
  import.meta.url),'utf8');

const ORG_A='10000000-0000-4000-8000-000000000001';
const ORG_B='10000000-0000-4000-8000-000000000002';
const ADMIN_A='20000000-0000-4000-8000-000000000001';
const ADMIN_B='20000000-0000-4000-8000-000000000002';
const SNAP='a'.repeat(64),BLOCK='b'.repeat(64);
const QUOTE='c'.repeat(64),PACKET='d'.repeat(64);
const SNAP_NEW='e'.repeat(64), BLOCK_NEW='f'.repeat(64);
const SOURCE_URL='https://sample.example.com/course';
const APPROVE='select kb08e_fixture.approve_knowledge_cas_rehearsal_v1($1,$2,$3,$4,$5,$6,$7,$8,$9) as result';
const CHANGE='select kb08f_fixture.apply_synthetic_source_revision_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as result';
const CHANGE_SIGNATURE='kb08f_fixture.apply_synthetic_source_revision_v1(uuid,uuid,integer,text,text,text,text,text,timestamptz,text)';

function localTestAdmin(){
  assert.equal(process.env.SALSYS_ALLOW_LOCAL_DB_TESTS,'1',
    'Explicit throwaway PostgreSQL opt-in required');
  const url=new URL(process.env.SALSYS_TEST_DATABASE_URL||'');
  assert.equal(url.protocol,'postgres:');
  assert.ok(['127.0.0.1','localhost'].includes(url.hostname),'Refuse a hosted DB');
  assert.equal(url.pathname,'/postgres','Refuse any application DB');
  assert.equal(url.username,'postgres');
  assert.equal(url.search,'');
  return url;
}
async function beginAuthenticated(db,actor){
  await db.query('begin');
  await db.query("set local statement_timeout='8s'");
  await db.query("set local lock_timeout='6s'");
  await db.query('set local role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);
  await db.query("select set_config('request.jwt.claim.role','authenticated',true)");
}
async function beginService(db){
  await db.query('begin');
  await db.query("set local statement_timeout='8s'");
  await db.query("set local lock_timeout='6s'");
  await db.query('set local role service_role');
}
async function invoke(db,begin,query,params){
  await begin(db);
  try{
    const result=(await db.query(query,params)).rows[0].result;
    await db.query('commit');
    return result;
  }catch(e){await db.query('rollback');throw e;}
}
const approveArgs=(org,id,at,snapshot=SNAP,block=BLOCK,quote=QUOTE)=>[
  org,id,1,SOURCE_URL,snapshot,block,quote,at,PACKET,
];
const sourceArgs=(org,id,at,{
  rev=1,expected=SNAP,url=SOURCE_URL,snapshot=SNAP_NEW,block=BLOCK_NEW,
  quote=QUOTE,state='active',
}={})=>[org,id,rev,expected,url,snapshot,block,quote,at,state];
const failure=(code,reason)=>e=>e?.code===code&&(!reason||e.message===reason);

test('KB-08F postapproval change invalidates eligible source evidence, persists holds and survives races only in disposable PostgreSQL',async()=>{
  const base=localTestAdmin();
  const name='salsys_kb08e_'+randomUUID().replaceAll('-','').slice(0,18);
  assert.match(name,/^salsys_kb08e_[a-f0-9]{18}$/);
  const target=new URL(base);target.pathname='/'+name;
  const admin=new Client({connectionString:base.toString()});
  const sessions=[];let created=false;
  await admin.connect();
  try{
    await admin.query('create database "'+name+'"');created=true;
    const connect=async()=>{
      const db=new Client({connectionString:target.toString()});
      sessions.push(db);await db.connect();return db;
    };
    const root=await connect();
    assert.equal((await root.query(
      "select to_regclass('public.organizations') as existing"
    )).rows[0].existing,null);
    // PostgreSQL roles are cluster-wide and may already be created by other
    // parallel disposable test databases. Never recreate existing roles.
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
    await root.query(approval);
    await root.query(invalidation);
    assert.match(invalidation,/KB08F_DISPOSABLE_PARENT_FIXTURE_REQUIRED/);
    assert.doesNotMatch(invalidation,/create or replace function public\./i);
    assert.doesNotMatch(invalidation,/grant execute.*to anon/i);
    const acl=(await root.query(
      "select has_function_privilege('anon',$1,'execute') as anon,"+
      "has_function_privilege('authenticated',$1,'execute') as client,"+
      "has_function_privilege('service_role',$1,'execute') as service,"+
      "has_table_privilege('service_role','kb08f_fixture.review_holds','insert') as table_write,"+
      "has_table_privilege('authenticated','kb08f_fixture.synthetic_eligible_knowledge','select') as retrieval_view",
      [CHANGE_SIGNATURE]
    )).rows[0];
    assert.deepEqual(acl,{
      anon:false,client:false,service:true,table_write:false,retrieval_view:false,
    });
    const rls=(await root.query(
      "select relrowsecurity from pg_class c join pg_namespace n on c.relnamespace=n.oid "+
      "where n.nspname='kb08f_fixture' and c.relkind='r'"
    )).rows;
    assert.equal(rls.length,2);
    assert.ok(rls.every(x=>x.relrowsecurity===true));

    const fetched=new Date(Date.now()-180000).toISOString();
    const reviewed=new Date(Date.now()-120000).toISOString();
    const refresh=new Date(Date.now()-90000).toISOString();
    const changeTime=new Date(Date.now()-60000).toISOString();
    await root.query(
      "insert into kb08e_fixture.organization_admins values "+
      "($1,$2,'owner',true),($3,$4,'admin',true)",
      [ORG_A,ADMIN_A,ORG_B,ADMIN_B],
    );
    async function addSource(org){
      const id=randomUUID();
      await root.query(
        "insert into kb08e_fixture.source_versions "+
        "(organization_id,id,source_url,snapshot_sha256,block_id,quote_sha256,fetched_at,state) "+
        "values($1,$2,$3,$4,$5,$6,$7,'active')",
        [org,id,SOURCE_URL,SNAP,BLOCK,QUOTE,fetched]);
      return id;
    }
    async function addDoc(org,source){
      const id=randomUUID();
      await root.query(
        "insert into kb08e_fixture.documents "+
        "(organization_id,id,source_id,version,status,review_packet_sha256,reviewed_at) "+
        "values($1,$2,$3,1,'draft',$4,$5)",
        [org,id,source,PACKET,reviewed]);
      return id;
    }
    const eligible=async(org)=>(await root.query(
      "select document_id from kb08f_fixture.synthetic_eligible_knowledge "+
      "where organization_id=$1 order by document_id",[org]
    )).rows.map(r=>r.document_id);
    const docState=async(org,id)=>(await root.query(
      "select status,version from kb08e_fixture.documents "+
      "where organization_id=$1 and id=$2",[org,id]
    )).rows[0];
    const holds=async(org,id)=>(await root.query(
      "select reason,source_revision,prior_document_version,held_document_version "+
      "from kb08f_fixture.review_holds where organization_id=$1 and document_id=$2 "+
      "order by source_revision",[org,id]
    )).rows;
    const a=await connect(),b=await connect(),c=await connect();
    const approveAs=(db,actor,params)=>invoke(
      db,conn=>beginAuthenticated(conn,actor),APPROVE,params);
    const changeAsService=(db,params)=>invoke(db,beginService,CHANGE,params);

    const sourceA=await addSource(ORG_A);
    const sourceB=await addSource(ORG_B);
    const docA1=await addDoc(ORG_A,sourceA);
    const docA2=await addDoc(ORG_A,sourceA);
    const docADraft=await addDoc(ORG_A,sourceA);
    const docB=await addDoc(ORG_B,sourceB);
    assert.deepEqual(await eligible(ORG_A),[]);
    assert.equal((await approveAs(a,ADMIN_A,approveArgs(ORG_A,docA1,fetched))).document_version,2);
    assert.equal((await approveAs(a,ADMIN_A,approveArgs(ORG_A,docA2,fetched))).document_version,2);
    assert.equal((await approveAs(b,ADMIN_B,approveArgs(ORG_B,docB,fetched))).document_version,2);
    assert.deepEqual((await eligible(ORG_A)).sort(),[docA1,docA2].sort());
    assert.deepEqual(await eligible(ORG_B),[docB]);
    assert.equal((await root.query(
      "select count(*)::int as n from kb08f_fixture.approved_evidence where organization_id=$1",
      [ORG_A]
    )).rows[0].n,2,'Approval evidence is captured in the audit transaction');

    // Unchanged content with a more recent fetchedAt is harmless in this
    // synthetic model. It does NOT independently prove a real recrawl.
    const same=await changeAsService(b,sourceArgs(ORG_A,sourceA,refresh,{
      snapshot:SNAP,block:BLOCK,quote:QUOTE,
    }));
    assert.equal(same.material_change,false);
    assert.equal(same.held,0);
    assert.deepEqual((await eligible(ORG_A)).sort(),[docA1,docA2].sort());

    // Even if privileged SQL bypasses the mock change handler, the private
    // retrieval guard fails closed when bound evidence no longer matches.
    await root.query(
      "update kb08e_fixture.source_versions set block_id=$1 "+
      "where organization_id=$2 and id=$3",[BLOCK_NEW,ORG_A,sourceA]);
    assert.deepEqual(await eligible(ORG_A),[]);
    assert.deepEqual(await docState(ORG_A,docA1),{status:'approved',version:2},
      'Bypass does not create a hold: real writers must route through an audited handler');
    await root.query(
      "update kb08e_fixture.source_versions set block_id=$1 "+
      "where organization_id=$2 and id=$3",[BLOCK,ORG_A,sourceA]);
    assert.equal((await eligible(ORG_A)).length,2);

    // One material source update suppresses all approved A records, creates
    // one hold for each, and leaves the draft and tenant B untouched.
    const changed=await changeAsService(b,sourceArgs(ORG_A,sourceA,changeTime));
    assert.deepEqual(changed,{
      ok:true,material_change:true,held:2,source_revision:2,
      manual_review_required:true,
    });
    assert.deepEqual(await eligible(ORG_A),[]);
    assert.deepEqual(await eligible(ORG_B),[docB]);
    for(const id of [docA1,docA2]){
      assert.deepEqual(await docState(ORG_A,id),{status:'review',version:3});
      assert.deepEqual(await holds(ORG_A,id),[{
        reason:'source_replaced',source_revision:2,
        prior_document_version:2,held_document_version:3,
      }]);
    }
    assert.deepEqual(await docState(ORG_A,docADraft),{status:'draft',version:1});
    assert.equal((await root.query(
      "select count(*)::int as n from kb08e_fixture.approval_audit where organization_id=$1",
      [ORG_A]
    )).rows[0].n,2,'Historical approvals remain auditable');
    await assert.rejects(
      changeAsService(b,sourceArgs(ORG_A,sourceA,changeTime)),
      failure('P0001','kb08f_stale_source_revision'),
      'Duplicate/out-of-order source event is not replayed');
    assert.equal((await holds(ORG_A,docA1)).length,1);

    // No caller-supplied tenant switch can change another tenant's source.
    await assert.rejects(
      changeAsService(b,sourceArgs(ORG_B,sourceA,changeTime)),
      failure('P0002','kb08f_source_not_found'));
    assert.deepEqual(await eligible(ORG_B),[docB]);
    await beginAuthenticated(a,ADMIN_A);
    await assert.rejects(
      a.query(CHANGE,sourceArgs(ORG_B,sourceB,changeTime)),
      error=>error.code==='42501','Admin cannot impersonate the service role');
    await a.query('rollback');

    // Revocation is material even when the same quote/hash is still present.
    const revoked=await changeAsService(b,sourceArgs(ORG_B,sourceB,changeTime,{
      snapshot:SNAP,block:BLOCK,quote:QUOTE,state:'revoked',
    }));
    assert.equal(revoked.held,1);
    assert.deepEqual(await eligible(ORG_B),[]);
    assert.deepEqual((await holds(ORG_B,docB))[0].reason,'source_revoked');

    // Simulate an audit insertion collision and prove SOURCE + DOCUMENT
    // update rollback as well as no fake retrieval suppression.
    const sourceC=await addSource(ORG_A);
    const docC=await addDoc(ORG_A,sourceC);
    await approveAs(a,ADMIN_A,approveArgs(ORG_A,docC,fetched));
    await root.query(
      "insert into kb08f_fixture.review_holds "+
      "(organization_id,document_id,source_revision,prior_document_version,"+
      "held_document_version,prior_snapshot_sha256,new_snapshot_sha256,reason,detected_at) "+
      "values($1,$2,2,2,3,$3,$4,'source_replaced',now())",
      [ORG_A,docC,SNAP,SNAP_NEW]);
    await assert.rejects(
      changeAsService(b,sourceArgs(ORG_A,sourceC,changeTime)),
      error=>error.code==='23505','An invalidation audit error aborts the entire update');
    assert.deepEqual(await eligible(ORG_A),[docC]);
    assert.deepEqual(await docState(ORG_A,docC),{status:'approved',version:2});
    assert.deepEqual((await root.query(
      "select snapshot_sha256,revision from kb08e_fixture.source_versions where id=$1",
      [sourceC]
    )).rows[0],{snapshot_sha256:SNAP,revision:1});

    // Independent sessions: approval commits first while source update waits
    // on document lock, then immediately moves the approved answer to review.
    const sourceD=await addSource(ORG_A);
    const docD=await addDoc(ORG_A,sourceD);
    await beginAuthenticated(a,ADMIN_A);
    assert.equal((await a.query(APPROVE,approveArgs(ORG_A,docD,fetched))).rows[0].result.document_version,2);
    await beginService(c);
    let settled=false;
    const race=c.query(CHANGE,sourceArgs(ORG_A,sourceD,changeTime)).then(
      value=>({ok:true,value}),error=>({ok:false,error})
    ).finally(()=>{settled=true;});
    await new Promise(resolve=>setTimeout(resolve,80));
    assert.equal(settled,false,'Source update waits on approving document lock');
    await a.query('commit');
    const completed=await race;
    assert.equal(completed.ok,true);
    assert.equal(completed.value.rows[0].result.held,1);
    await c.query('commit');
    assert.deepEqual(await docState(ORG_A,docD),{status:'review',version:3});
    assert.ok(!(await eligible(ORG_A)).includes(docD));

    // Reverse ordering: if source update commits first on a draft's source,
    // an approval using the original evidence MUST fail its source CAS.
    const sourceE=await addSource(ORG_A);
    const docE=await addDoc(ORG_A,sourceE);
    await beginService(c);
    const first=(await c.query(CHANGE,sourceArgs(ORG_A,sourceE,changeTime))).rows[0].result;
    assert.equal(first.held,0);
    await beginAuthenticated(a,ADMIN_A);
    let approvalSettled=false;
    const pending=a.query(APPROVE,approveArgs(ORG_A,docE,fetched)).then(
      value=>({ok:true,value}),error=>({ok:false,error})
    ).finally(()=>{approvalSettled=true;});
    await new Promise(resolve=>setTimeout(resolve,80));
    assert.equal(approvalSettled,false,'Approval waits on source update transaction');
    await c.query('commit');
    const stale=await pending;
    assert.equal(stale.ok,false);
    assert.equal(stale.error.message,'kb08e_source_evidence_stale');
    await a.query('rollback');
    assert.deepEqual(await docState(ORG_A,docE),{status:'draft',version:1});
    assert.ok(!(await eligible(ORG_A)).includes(docE));
  } finally {
    await Promise.allSettled(sessions.map(db=>db.end()));
    try{if(created)await admin.query('drop database "'+name+'" with (force)');}
    finally{await admin.end();}
  }
});
