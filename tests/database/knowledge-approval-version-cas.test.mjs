import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const { Client } = pg;
const draft = readFileSync(new URL(
  '../../docs/sql/KB-08E-version-aware-knowledge-approval-REHEARSAL-DRAFT.sql',
  import.meta.url), 'utf8');
const ORG_A='10000000-0000-4000-8000-000000000001';
const ORG_B='10000000-0000-4000-8000-000000000002';
const ADMIN_A='20000000-0000-4000-8000-000000000001';
const ADMIN_B='20000000-0000-4000-8000-000000000002';
const MEMBER_A='20000000-0000-4000-8000-000000000003';
const SNAPSHOT='a'.repeat(64),BLOCK='b'.repeat(64);
const QUOTE='c'.repeat(64),PACKET='d'.repeat(64);
const URL='https://sample.example.com/course';
const RPC='select kb08e_fixture.approve_knowledge_cas_rehearsal_v1($1,$2,$3,$4,$5,$6,$7,$8,$9) as result';
const SIGNATURE='kb08e_fixture.approve_knowledge_cas_rehearsal_v1(uuid,uuid,integer,text,text,text,text,timestamptz,text)';

function localAdmin(){
  assert.equal(process.env.SALSYS_ALLOW_LOCAL_DB_TESTS,'1',
    'Opt-in required for disposable local PostgreSQL tests');
  const raw=process.env.SALSYS_TEST_DATABASE_URL;
  assert.ok(raw);
  const url=new URL(raw);
  assert.equal(url.protocol,'postgres:');
  assert.ok(['localhost','127.0.0.1'].includes(url.hostname),'Refuse remote databases');
  assert.equal(url.pathname,'/postgres','Refuse any application database');
  assert.equal(url.username,'postgres');
  assert.equal(url.search,'');
  return url;
}
async function auth(db,actor){
  await db.query('begin');
  await db.query("set local statement_timeout='8s'");
  await db.query("set local lock_timeout='6s'");
  await db.query('set local role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);
  await db.query("select set_config('request.jwt.claim.role','authenticated',true)");
}
async function call(db,actor,args){
  await auth(db,actor);
  try{
    const result=(await db.query(RPC,args)).rows[0].result;
    await db.query('commit');
    return result;
  }catch(error){
    await db.query('rollback');
    throw error;
  }
}
const args=(org,doc,when,version=1)=>[
  org,doc,version,URL,SNAPSHOT,BLOCK,QUOTE,when,PACKET,
];
const rejectsWith=(code,message)=>error=>error.code===code&&error.message===message;

test('KB-08E exact draft SQL passes version/source CAS, authorization, audit rollback and concurrent races on disposable PostgreSQL',async()=>{
  const base=localAdmin();
  const name='salsys_kb08e_'+randomUUID().replaceAll('-','').slice(0,18);
  assert.match(name,/^salsys_kb08e_[a-f0-9]{18}$/);
  const target=new URL(base);target.pathname='/'+name;
  const admin=new Client({connectionString:base.toString()});
  const sessions=[];let created=false;
  await admin.connect();
  try{
    await admin.query('create database "'+name+'"');
    created=true;
    const connect=async()=>{
      const c=new Client({connectionString:target.toString()});
      sessions.push(c);await c.connect();return c;
    };
    const root=await connect();
    assert.equal((await root.query(
      "select to_regclass('public.organizations') as existing"
    )).rows[0].existing,null);
    await root.query(
      'create schema auth;'+
      'create role anon nologin;'+
      'create role authenticated nologin;'+
      'create role service_role nologin;'+
      'create function auth.uid() returns uuid language sql stable as '+
      "$$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$"
    );
    await root.query(draft); // Exact unmodified SQL; it refuses nonfixture DB names.
    assert.ok(!draft.includes('create or replace function public.approve_knowledge_document_v1'));
    assert.ok(!draft.includes('create or replace function public.create_source_backed_knowledge_document_v2'));

    const acl=(await root.query(
      "select has_function_privilege('anon',$1,'execute') as anon,"+
      "has_function_privilege('service_role',$1,'execute') as service,"+
      "has_function_privilege('authenticated',$1,'execute') as authenticated,"+
      "has_table_privilege('authenticated','kb08e_fixture.documents','update') as table_update,"+
      "has_table_privilege('authenticated','kb08e_fixture.approval_audit','insert') as audit_insert",
      [SIGNATURE],
    )).rows[0];
    assert.deepEqual(acl,{
      anon:false,service:false,authenticated:true,table_update:false,audit_insert:false,
    });
    const rls=(await root.query(
      "select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace "+
      "where n.nspname='kb08e_fixture' and c.relkind='r'"
    )).rows;
    assert.equal(rls.length,4);
    assert.ok(rls.every(row=>row.relrowsecurity===true));

    const fetched=new Date(Date.now()-120000).toISOString();
    const reviewed=new Date(Date.now()-60000).toISOString();
    await root.query(
      "insert into kb08e_fixture.organization_admins values "+
      "($1,$2,'owner',true),($3,$4,'admin',true),($5,$6,'member',true)",
      [ORG_A,ADMIN_A,ORG_B,ADMIN_B,ORG_A,MEMBER_A],
    );
    const sourceA=randomUUID(),sourceB=randomUUID();
    await root.query(
      "insert into kb08e_fixture.source_versions values "+
      "($1,$2,$3,$4,$5,$6,$7,'active'),"+
      "($8,$9,$10,$11,$12,$13,$14,'active')",
      [ORG_A,sourceA,URL,SNAPSHOT,BLOCK,QUOTE,fetched,
       ORG_B,sourceB,URL,SNAPSHOT,BLOCK,QUOTE,fetched],
    );
    async function addDoc(org,source,opts={}){
      const id=randomUUID();
      await root.query(
        "insert into kb08e_fixture.documents "+
        "(organization_id,id,source_id,version,status,review_packet_sha256,reviewed_at,valid_until) "+
        "values($1,$2,$3,$4,$5,$6,$7,$8)",
        [org,id,source,opts.version??1,opts.status??'draft',
         opts.packet??PACKET,reviewed,opts.until??null],
      );
      return id;
    }
    const getDoc=async(org,id)=>(await root.query(
      "select status,version,approved_by from kb08e_fixture.documents "+
      "where organization_id=$1 and id=$2",[org,id]
    )).rows[0];
    const count=async(org,id)=>(await root.query(
      "select count(*)::int as n from kb08e_fixture.approval_audit "+
      "where organization_id=$1 and document_id=$2",[org,id]
    )).rows[0].n;
    const a=await connect(),b=await connect(),c=await connect();

    // One approval writes the version and audit atomically; retry fails closed.
    const approved=await addDoc(ORG_A,sourceA);
    const ok=await call(a,ADMIN_A,args(ORG_A,approved,fetched));
    assert.deepEqual(ok,{
      ok:true,status:'approved',document_id:approved,document_version:2,
    });
    assert.deepEqual(await getDoc(ORG_A,approved),{
      status:'approved',version:2,approved_by:ADMIN_A,
    });
    assert.equal(await count(ORG_A,approved),1);
    await assert.rejects(call(a,ADMIN_A,args(ORG_A,approved,fetched)),
      rejectsWith('P0001','kb08e_document_version_stale'));
    assert.equal(await count(ORG_A,approved),1);

    // Cross-tenant A -> B and member -> A must be denied; B still works.
    const bDoc=await addDoc(ORG_B,sourceB);
    await assert.rejects(call(a,ADMIN_A,args(ORG_B,bDoc,fetched)),
      e=>e.code==='42501');
    await assert.rejects(call(a,MEMBER_A,args(ORG_A,approved,fetched)),
      e=>e.code==='42501');
    assert.equal((await getDoc(ORG_B,bDoc)).status,'draft');
    assert.equal((await call(b,ADMIN_B,args(ORG_B,bDoc,fetched))).document_version,2);

    // Anonymous, missing Auth and direct table writes cannot bypass approvals.
    await auth(c,ADMIN_A);
    await assert.rejects(
      c.query("update kb08e_fixture.documents set status='approved' where organization_id=$1",
        [ORG_A]),e=>e.code==='42501');
    await c.query('rollback');
    await c.query('begin');
    await c.query('set local role authenticated');
    await assert.rejects(c.query(RPC,args(ORG_A,approved,fetched)),
      e=>e.code==='42501');
    await c.query('rollback');

    const wrongVersion=await addDoc(ORG_A,sourceA,{version:4});
    await assert.rejects(call(a,ADMIN_A,args(ORG_A,wrongVersion,fetched,3)),
      rejectsWith('P0001','kb08e_document_version_stale'));
    const wrongPacket=await addDoc(ORG_A,sourceA,{packet:'f'.repeat(64)});
    await assert.rejects(call(a,ADMIN_A,args(ORG_A,wrongPacket,fetched)),
      rejectsWith('P0001','kb08e_source_evidence_stale'));
    assert.equal(await count(ORG_A,wrongPacket),0);

    // Each exact source field is bound to the stored, locked source row.
    const mutations=[
      a=>a[3]='https://sample.example.com/updated',
      a=>a[4]='f'.repeat(64),
      a=>a[5]='f'.repeat(64),
      a=>a[6]='f'.repeat(64),
      a=>a[7]=new Date(Date.parse(fetched)-1000).toISOString(),
    ];
    for(const mutate of mutations){
      const id=await addDoc(ORG_A,sourceA);
      const attempt=args(ORG_A,id,fetched);mutate(attempt);
      await assert.rejects(call(a,ADMIN_A,attempt),
        rejectsWith('P0001','kb08e_source_evidence_stale'));
      assert.deepEqual(await getDoc(ORG_A,id),{
        status:'draft',version:1,approved_by:null,
      });
      assert.equal(await count(ORG_A,id),0);
    }
    const revoked=await addDoc(ORG_A,sourceA);
    await root.query(
      "update kb08e_fixture.source_versions set state='revoked' "+
      "where organization_id=$1 and id=$2",[ORG_A,sourceA]);
    await assert.rejects(call(a,ADMIN_A,args(ORG_A,revoked,fetched)),
      rejectsWith('P0001','kb08e_source_evidence_stale'));
    await root.query(
      "update kb08e_fixture.source_versions set state='active' "+
      "where organization_id=$1 and id=$2",[ORG_A,sourceA]);

    const archived=await addDoc(ORG_A,sourceA,{status:'archived'});
    await assert.rejects(call(a,ADMIN_A,args(ORG_A,archived,fetched)),
      rejectsWith('P0001','kb08e_document_not_draft'));
    const expired=await addDoc(ORG_A,sourceA,{
      until:new Date(Date.now()-1000).toISOString(),
    });
    await assert.rejects(call(a,ADMIN_A,args(ORG_A,expired,fetched)),
      rejectsWith('P0001','kb08e_document_outside_validity'));

    // Deliberate audit uniqueness failure rolls back the document UPDATE.
    const rollbackDoc=await addDoc(ORG_A,sourceA);
    await root.query(
      "insert into kb08e_fixture.approval_audit values "+
      "($1,$2,2,$3,$4,$5,$6,now())",
      [ORG_A,rollbackDoc,ADMIN_A,SNAPSHOT,QUOTE,PACKET],
    );
    await assert.rejects(call(a,ADMIN_A,args(ORG_A,rollbackDoc,fetched)),
      e=>e.code==='23505');
    assert.deepEqual(await getDoc(ORG_A,rollbackDoc),{
      status:'draft',version:1,approved_by:null,
    });
    assert.equal(await count(ORG_A,rollbackDoc),1);

    // Two independent transactions contend on the same document row lock.
    const raced=await addDoc(ORG_A,sourceA);
    await auth(a,ADMIN_A);
    assert.equal((await a.query(RPC,args(ORG_A,raced,fetched))).rows[0].result.document_version,2);
    await auth(b,ADMIN_A);
    let secondSettled=false;
    const second=b.query(RPC,args(ORG_A,raced,fetched)).then(
      value=>({ok:true,value}),error=>({ok:false,error})
    ).finally(()=>{secondSettled=true;});
    await new Promise(resolve=>setTimeout(resolve,75));
    assert.equal(secondSettled,false,'Second approval should wait on document lock');
    await a.query('commit');
    const loser=await second;
    assert.equal(loser.ok,false);
    assert.equal(loser.error.message,'kb08e_document_version_stale');
    await b.query('rollback');
    assert.equal(await count(ORG_A,raced),1);

    // An earlier committed source replacement wins over a waiting approval.
    const replaced=await addDoc(ORG_A,sourceA);
    await root.query('begin');
    await root.query(
      "update kb08e_fixture.source_versions set snapshot_sha256=$1 "+
      "where organization_id=$2 and id=$3",
      ['e'.repeat(64),ORG_A,sourceA]);
    await auth(c,ADMIN_A);
    let sourceSettled=false;
    const waiting=c.query(RPC,args(ORG_A,replaced,fetched)).then(
      value=>({ok:true,value}),error=>({ok:false,error})
    ).finally(()=>{sourceSettled=true;});
    await new Promise(resolve=>setTimeout(resolve,75));
    assert.equal(sourceSettled,false,'Approval should wait for source lock');
    await root.query('commit');
    const stale=await waiting;
    assert.equal(stale.ok,false);
    assert.equal(stale.error.message,'kb08e_source_evidence_stale');
    await c.query('rollback');
    assert.deepEqual(await getDoc(ORG_A,replaced),{
      status:'draft',version:1,approved_by:null,
    });
    assert.equal(await count(ORG_A,replaced),0);
  }finally{
    await Promise.allSettled(sessions.map(c=>c.end()));
    try{if(created)await admin.query('drop database "'+name+'" with (force)');}
    finally{await admin.end();}
  }
});
