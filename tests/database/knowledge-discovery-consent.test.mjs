import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import pg from 'pg';
const {Client}=pg;
const foundation=readFileSync(new URL('./knowledge-discovery.foundation.sql',import.meta.url),'utf8');
const original=readFileSync(new URL('../../docs/sql/KB-01B-discovery-schema-DRAFT.sql',import.meta.url),'utf8');
const consent=readFileSync(new URL('../../docs/sql/KB-06A-discovery-consent-execution-DRAFT.sql',import.meta.url),'utf8');
const A='10000000-0000-4000-8000-000000000001';
const B='10000000-0000-4000-8000-000000000002';
const UA='20000000-0000-4000-8000-000000000001';
const UB='20000000-0000-4000-8000-000000000002';

function localUrl(){
  assert.equal(process.env.SALSYS_ALLOW_LOCAL_DB_TESTS,'1','Local-only opt-in required');
  const uri=new URL(process.env.SALSYS_TEST_DATABASE_URL??'');
  assert.equal(uri.protocol,'postgres:');
  assert.ok(['localhost','127.0.0.1'].includes(uri.hostname));
  assert.equal(uri.pathname,'/postgres','Application databases forbidden');
  assert.equal(uri.username,'postgres');
  return uri;
}
test('KB-06A consent SQL denies unconsented leases and delayed commits after withdrawal',async()=>{
  const base=localUrl();
  const name='salsys_kb06a_'+randomUUID().replaceAll('-','').slice(0,20);
  const target=new URL(base);target.pathname='/'+name;
  const admin=new Client({connectionString:base.toString()});
  const db=new Client({connectionString:target.toString()});
  let adminReady=false,created=false,dbReady=false;
  async function asRole(role,user,sql,args=[]){
    await db.query('begin');
    try{
      await db.query('set local role '+role);
      await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role,sub:user})]);
      const response=await db.query(sql,args);
      await db.query('commit');
      return response;
    }catch(e){await db.query('rollback');throw e;}
  }
  const service=(sql,args)=>asRole('service_role',UA,sql,args);
  try{
    await admin.connect();adminReady=true;
    await admin.query('create database "'+name+'"');created=true;
    await db.connect();dbReady=true;
    await db.query(foundation);await db.query(original);await db.query(consent);
    await db.query('insert into public.organizations(id) values($1),($2)',[A,B]);
    await db.query('insert into public.test_knowledge_admins(organization_id,user_id) values($1,$2),($3,$4)',[A,UA,B,UB]);
    const grantSql=[
      'insert into public.knowledge_discovery_site_consents',
      '(organization_id,hostname,status,policy_version,granted_by,granted_at,valid_until)',
      "values($1,$2,'granted','synthetic-v1',$3,now()-interval '1 minute',now()+interval '1 day')",
      'returning id',
    ].join(' ');
    const grant=(await db.query(grantSql,[A,'fixture.example.com',UA])).rows[0].id;
    assert.equal((await db.query('select public.knowledge_discovery_consent_active_v1($1,$2) as yes',
      [A,'https://fixture.example.com/'])).rows[0].yes,true);
    for(const [org,url] of [
      [B,'https://fixture.example.com/'],[A,'https://other.example.com/'],
      [A,'http://fixture.example.com/'],[A,'https://fixture.example.com@evil.net/'],
      [A,'https://fixture.example.com:443/'],[A,'https://fixture.example.com.evil.net/'],
    ]){
      assert.equal((await db.query('select public.knowledge_discovery_consent_active_v1($1,$2) as yes',
        [org,url])).rows[0].yes,false,org+' '+url);
    }
    const addJob=[
      'insert into public.knowledge_discovery_jobs',
      '(organization_id,created_by,seed_url,max_pages,status)',
      "values ($1,$2,$3,3,'queued'),($4,$5,$6,3,'queued')",
      'returning id,organization_id',
    ].join(' ');
    const jobs=(await db.query(addJob,[A,UA,'https://fixture.example.com/',
      B,UB,'https://other.example.com/'])).rows;
    const jobA=jobs.find(x=>x.organization_id===A).id;
    const jobB=jobs.find(x=>x.organization_id===B).id;
    const addPages=[
      'insert into public.knowledge_discovery_pages',
      '(organization_id,job_id,url,depth,status)',
      "values($1,$2,$3,0,'discovered'),($4,$5,$6,0,'discovered')",
      'returning id,job_id',
    ].join(' ');
    const pages=(await db.query(addPages,[A,jobA,'https://fixture.example.com/',
      B,jobB,'https://other.example.com/'])).rows;
    const pageA=pages.find(x=>x.job_id===jobA).id;
    const pageB=pages.find(x=>x.job_id===jobB).id;
    const claimed=(await service('select * from public.claim_knowledge_discovery_job_v1()')).rows;
    assert.equal(claimed.length,1);
    assert.equal(claimed[0].organization_id,A);
    assert.equal(claimed[0].job_id,jobA);
    const b=await db.query('select status,last_error_code from public.knowledge_discovery_jobs where id=$1',[jobB]);
    assert.deepEqual(b.rows[0],{status:'cancelled',last_error_code:'consent_not_active'});
    assert.equal((await db.query('select status from public.knowledge_discovery_pages where id=$1',[pageB])).rows[0].status,'discovered');
    assert.equal((await asRole('authenticated',UA,
      'select count(*)::int as n from public.knowledge_discovery_site_consents')).rows[0].n,1);
    assert.equal((await asRole('authenticated',UB,
      'select count(*)::int as n from public.knowledge_discovery_site_consents')).rows[0].n,0);
    await assert.rejects(
      asRole('authenticated',UA,
        "update public.knowledge_discovery_site_consents set status='withdrawn' where id=$1",[grant]),
      e=>e.code==='42501');

    // A correct original lease cannot commit after withdrawal.
    await db.query(
      "update public.knowledge_discovery_site_consents set status='withdrawn',withdrawn_at=clock_timestamp() where id=$1",
      [grant]);
    const delayed=await service(
      'select public.commit_knowledge_discovery_page_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11) as result',
      [A,jobA,pageA,claimed[0].lease_token,'fetched',200,'text/html',
        'Must never save',null,JSON.stringify(['https://fixture.example.com/extra']),2]);
    assert.deepEqual(delayed.rows[0].result,{ok:false,reason:'consent_not_active'});
    const untouched=(await db.query(
      'select status,page_title,http_status from public.knowledge_discovery_pages where id=$1',
      [pageA])).rows[0];
    assert.deepEqual(untouched,{status:'discovered',page_title:null,http_status:null});
    const stopped=(await db.query(
      'select status,last_error_code,lease_token from public.knowledge_discovery_jobs where id=$1',
      [jobA])).rows[0];
    assert.deepEqual(stopped,{status:'cancelled',last_error_code:'consent_not_active',lease_token:null});
    assert.equal((await db.query('select count(*)::int as n from public.knowledge_discovery_pages where job_id=$1',
      [jobA])).rows[0].n,1);
    assert.equal((await service('select count(*)::int as n from public.claim_knowledge_discovery_job_v1()')).rows[0].n,0);

    // An unrelated B grant never reactivates the original A job.
    await db.query(grantSql,[B,'other.example.com',UB]);
    assert.equal((await db.query(
      'select public.knowledge_discovery_consent_active_v1($1,$2) as yes',
      [A,'https://fixture.example.com/'])).rows[0].yes,false);
    await db.query(
      "update public.knowledge_discovery_site_consents set status='granted',withdrawn_at=null,valid_until=now()-interval '1 second' where id=$1",
      [grant]);
    assert.equal((await db.query(
      'select public.knowledge_discovery_consent_active_v1($1,$2) as yes',
      [A,'https://fixture.example.com/'])).rows[0].yes,false);
  }finally{
    if(dbReady)await db.end().catch(()=>{});
    try{if(adminReady&&created)await admin.query('drop database "'+name+'" with (force)');}
    finally{if(adminReady)await admin.end().catch(()=>{});}
  }
});
