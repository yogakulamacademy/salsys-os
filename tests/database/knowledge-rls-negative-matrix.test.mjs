import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import pg from 'pg';

const { Client } = pg;
const matrixPath = new URL('./knowledge-rls-negative-matrix.fixture.sql',import.meta.url);
const strictCandidatePath = new URL('./knowledge-monitoring-strict-session-candidate.fixture.sql',import.meta.url);
const originalBuilder = resolve('scripts/build-knowledge-readiness-sandbox.mjs');
const SCENARIOS = ['OWNER_A','OWNER_B','EMPLOYEE','DB_ROLES'];

/**
 * CI-only disposable PostgreSQL negative authorization test.
 * Keep exact canonical knowledge migration SQL and the original rollback
 * fixture unchanged; the matrix inserts further expectations into the
 * same BEGIN/ROLLBACK transaction before the final rollback audit.
 */
function requireLocalAdmin(){
  assert.equal(process.env.SALSYS_ALLOW_LOCAL_DB_TESTS,'1',
    'Explicit disposable test opt-in required');
  const uri=new URL(process.env.SALSYS_TEST_DATABASE_URL??'');
  assert.equal(uri.protocol,'postgres:');
  assert.ok(['localhost','127.0.0.1'].includes(uri.hostname),
    'No remote PostgreSQL or hosted Supabase connections');
  assert.equal(uri.pathname,'/postgres','Refuse non-admin/application databases');
  assert.equal(uri.username,'postgres','Local test cluster admin required');
  return uri;
}

function readSections(source){
  const result=new Map();
  const matches=[...source.matchAll(/^-- @@([A-Z_]+)@@$/gm)];
  assert.deepEqual(matches.map(x=>x[1]),SCENARIOS,
    'Scenario sections must remain complete and in the expected order');
  for(let i=0;i<matches.length;i++){
    const start=matches[i].index+matches[i][0].length;
    const end=i+1<matches.length?matches[i+1].index:source.length;
    const value=source.slice(start,end).trim();
    assert.ok(value.includes('KB05B'),'Expected named safety checks, not empty section');
    result.set(matches[i][1],value);
  }
  return result;
}

function injectExactlyOnce(original,anchor,suffix){
  const first=original.indexOf(anchor);
  assert.ok(first>=0,'Canonical fixture anchor must remain present: '+anchor.slice(0,60));
  assert.equal(original.indexOf(anchor,first+anchor.length),-1,
    'Ambiguous canonical fixture anchor');
  return original.slice(0,first)+suffix+original.slice(first);
}

function buildMatrix(sql,sections){
  const aAnchor="select set_config('request.jwt.claims',"+
    "'{\"role\":\"authenticated\",\"sub\":\"20000000-0000-4000-8000-000000000002\"";
  let result=injectExactlyOnce(sql,aAnchor,
    sections.get('OWNER_A')+'\n\n');
  const bAnchor="select set_config('request.jwt.claims',"+
    "'{\"role\":\"authenticated\",\"sub\":\"20000000-0000-4000-8000-000000000003\"";
  result=injectExactlyOnce(result,bAnchor,
    sections.get('OWNER_B')+'\n\n');
  result=injectExactlyOnce(result,'reset role;\nselect pg_temp.assert_true',
    sections.get('EMPLOYEE')+'\n\n');
  result=injectExactlyOnce(result,"rollback;\nselect 'knowledge_readiness_v2'",
    sections.get('DB_ROLES')+'\n\n');
  for(const scenario of SCENARIOS)assert.ok(
    result.includes(sections.get(scenario)),'Missing injected '+scenario);
  return result;
}

const roles=[
  'do $roles$', 'begin',
  "if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;",
  "if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;",
  "if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;",
  'end;','$roles$;',
].join('\n');

test('real knowledge SQL denies direct cross-tenant RLS writes, forged sessions and approval escalation',async()=>{
  const base=requireLocalAdmin();
  const dbName='salsys_kb05b_'+randomUUID().replaceAll('-','').slice(0,20);
  const target=new URL(base);target.pathname='/'+dbName;
  const admin=new Client({connectionString:base.toString()});
  const db=new Client({connectionString:target.toString()});
  const dir=await mkdtemp(join(tmpdir(),'salsys-kb05b-'));
  const file=join(dir,'canonical-knowledge.rollback.sql');
  let created=false,connected=false,adminConnected=false;
  try{
    await admin.connect();adminConnected=true;
    await admin.query('create database "'+dbName+'"');
    created=true;
    await db.connect();connected=true;
    const clean=await db.query(
      "select to_regclass('public.organizations') as orgs,"+
      "to_regclass('public.knowledge_documents') as docs,"+
      "to_regclass('public.payments') as payments");
    assert.deepEqual(clean.rows[0],{orgs:null,docs:null,payments:null});
    await db.query(roles);
    await db.query(await readFile(new URL('./local-auth-bootstrap.sql',import.meta.url),'utf8'));
    execFileSync(process.execPath,[originalBuilder,file],{
      cwd:process.cwd(),stdio:['ignore','pipe','pipe'],timeout:20_000,
    });
    const [canonical,extra,candidate]=await Promise.all([
      readFile(file,'utf8'),readFile(matrixPath,'utf8'),
      readFile(strictCandidatePath,'utf8'),
    ]);
    assert.ok(canonical.length>25_000,'Missing canonical SQL');
    assert.ok(candidate.includes('create function pg_temp.kb05c_strict_monitoring_session_candidate'));
    assert.ok(!/^\s*(?:begin|commit|rollback)\s*;/im.test(candidate),
      'Candidate must not control the outer rollback transaction');
    assert.ok(!candidate.includes('create or replace function public.'),
      'Candidate cannot modify deployed authorization functions');
    const expanded=injectExactlyOnce(
      buildMatrix(canonical,readSections(extra)),
      "rollback;\nselect 'knowledge_readiness_v2'",
      candidate+'\n\n',
    );
    assert.ok(expanded.includes('create_source_backed_knowledge_document_v2'));
    assert.ok(expanded.includes('search_organization_knowledge_v1'));
    assert.ok(expanded.includes('KB05B B cannot forge A approval row'));
    assert.ok(expanded.includes('KB05B B user with A session cannot read B'));
    assert.ok(expanded.includes('KB05C singleton'));

    const all=await db.query(expanded);
    const end=Array.isArray(all)?all.at(-1):all;
    assert.equal(end?.rows?.[0]?.suite,'knowledge_readiness_v2');
    assert.equal(end.rows[0].assertions_completed,27,
      'All original assertions must continue to execute');
    assert.equal(end.rows[0].rollback_verified,true,
      'All app objects in original fixture must be rolled back');
    const after=await db.query(
      "select to_regclass('public.organizations') as orgs,"+
      "to_regclass('public.knowledge_documents') as docs,"+
      "to_regclass('public.knowledge_sources') as sources,"+
      "to_regclass('public.knowledge_approvals') as approvals");
    assert.deepEqual(after.rows[0],
      {orgs:null,docs:null,sources:null,approvals:null});

    // Synthetic JWT configuration and database roles are compatibility
    // fixtures, not live Supabase Auth proof or verified staging policies.
  }finally{
    if(connected)await db.end().catch(()=>{});
    try{
      if(created&&adminConnected)
        await admin.query('drop database "'+dbName+'" with (force)');
    }finally{
      if(adminConnected)await admin.end().catch(()=>{});
      await rm(dir,{recursive:true,force:true});
    }
  }
});
