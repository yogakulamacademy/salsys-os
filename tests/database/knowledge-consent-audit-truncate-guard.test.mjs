import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const { Client } = pg;
const original = readFileSync(
  new URL('../../docs/sql/KB-06B-audited-discovery-consent-lifecycle-DRAFT.sql',import.meta.url),'utf8',
);
const erasure = readFileSync(
  new URL('../../docs/sql/KB-06C-revoked-discovery-metadata-erasure-DRAFT.sql',import.meta.url),'utf8',
);
const proposal = readFileSync(
  new URL('../../docs/sql/KB-07D-consent-erasure-audit-truncate-guard-DRAFT.sql',import.meta.url),'utf8',
);

const ORG = '10000000-0000-4000-8000-000000000001';
const CONSENT_A = '20000000-0000-4000-8000-000000000001';
const CONSENT_B = '20000000-0000-4000-8000-000000000002';
const AUDIT_A = '30000000-0000-4000-8000-000000000001';
const AUDIT_B = '30000000-0000-4000-8000-000000000002';
const ERASURE_B = '40000000-0000-4000-8000-000000000001';

function onlyDisposableLoopbackPostgres(){
  assert.equal(process.env.SALSYS_ALLOW_LOCAL_DB_TESTS,'1',
    'Database tests require explicit local opt-in');
  const raw=process.env.SALSYS_TEST_DATABASE_URL;
  assert.ok(raw,'Missing disposable local PostgreSQL connection');
  const url=new URL(raw);
  assert.equal(url.protocol,'postgres:');
  assert.ok(['127.0.0.1','localhost'].includes(url.hostname),'Remote database forbidden');
  assert.equal(url.pathname,'/postgres','Application database forbidden');
  assert.equal(url.username,'postgres','Local PostgreSQL admin required');
  return url;
}

function exactFragment(sql,re,label){
  const m=sql.match(re);
  assert.ok(m,'Cannot find exact source SQL for '+label);
  return m[0];
}

function verifySourceContracts(){
  assert.match(original,
    /consent_id uuid not null references public\.knowledge_discovery_site_consents\(id\) on delete cascade/i);
  assert.match(original,
    /grant all on public\.knowledge_discovery_consent_audit to service_role/i);
  assert.match(original,
    /create trigger kb_discovery_consent_audit_immutable\s+before update or delete/i);
  assert.match(erasure,
    /consent_id uuid not null references public\.knowledge_discovery_site_consents\(id\) on delete restrict/i);
  assert.match(erasure,
    /create trigger kb_discovery_metadata_erasure_audit_immutable\s+before update or delete/i);
  assert.equal((proposal.match(/create trigger kb_discovery_/gi)||[]).length,2);
  assert.match(proposal,
    /create trigger kb_discovery_consent_audit_truncate_block\s+before truncate on public\.knowledge_discovery_consent_audit\s+for each statement\s+execute function public\.kb_discovery_consent_audit_immutable_v1\(\)/i);
  assert.match(proposal,
    /create trigger kb_discovery_metadata_erasure_audit_truncate_block\s+before truncate on public\.knowledge_discovery_metadata_erasure_audit\s+for each statement\s+execute function public\.kb_discovery_consent_audit_immutable_v1\(\)/i);
  assert.doesNotMatch(proposal,/\b(delete\s+from|truncate\s+table|alter\s+table|drop\s+trigger|grant|create\s+policy)\b/i);
  return {
    fn:exactFragment(original,/create or replace function public\.kb_discovery_consent_audit_immutable_v1\(\)[\s\S]*?\$fn\$;/i,'immutable trigger function'),
    consentTrigger:exactFragment(original,/create trigger kb_discovery_consent_audit_immutable\s+before update or delete[\s\S]*?;/i,'consent audit immutable trigger'),
    erasureTrigger:exactFragment(erasure,/create trigger kb_discovery_metadata_erasure_audit_immutable\s+before update or delete[\s\S]*?;/i,'erasure audit immutable trigger'),
  };
}

test('KB-07D original consent audit trigger blocks CASCADE, while unguarded TRUNCATE erases audits; DRAFT protects both',async()=>{
  const snippets=verifySourceContracts();
  const local=onlyDisposableLoopbackPostgres();
  const name='salsys_kb07d_fixture_'+randomUUID().replaceAll('-','').slice(0,18);
  assert.match(name,/^salsys_kb07d_fixture_[a-f0-9]{18}$/);
  const dburl=new URL(local);dburl.pathname='/'+name;
  const admin=new Client({connectionString:local.toString()});
  let db=null,created=false;
  await admin.connect();
  try{
    await admin.query('create database "'+name+'"');
    created=true;
    db=new Client({connectionString:dburl.toString()});
    await db.connect();
    await db.query("set statement_timeout = '20000'");
    await db.query("set lock_timeout = '3000'");
    // Minimal isolated test schema reproducing the EXACT source FK actions,
    // with the actual source trigger/function text extracted without edits.
    await db.query(`
      create table public.knowledge_discovery_site_consents(
        id uuid primary key,organization_id uuid not null
      );
      create table public.knowledge_discovery_consent_audit(
        id uuid primary key,consent_id uuid not null
          references public.knowledge_discovery_site_consents(id) on delete cascade,
        organization_id uuid not null,
        action text not null
      );
      create table public.knowledge_discovery_metadata_erasure_audit(
        id uuid primary key,consent_id uuid not null
          references public.knowledge_discovery_site_consents(id) on delete restrict,
        organization_id uuid not null
      );
    `);
    await db.query(snippets.fn);
    await db.query(snippets.consentTrigger);
    await db.query(snippets.erasureTrigger);
    await db.query('insert into public.knowledge_discovery_site_consents(id,organization_id) values($1,$3),($2,$3)',
      [CONSENT_A,CONSENT_B,ORG]);
    const insertConsentAudits=()=>db.query(
      "insert into public.knowledge_discovery_consent_audit(id,consent_id,organization_id,action) values($1,$3,$5,'granted'),($2,$4,$5,'withdrawn')",
      [AUDIT_A,AUDIT_B,CONSENT_A,CONSENT_B,ORG],
    );
    const insertErasure=()=>db.query(
      'insert into public.knowledge_discovery_metadata_erasure_audit(id,consent_id,organization_id) values($1,$2,$3)',
      [ERASURE_B,CONSENT_B,ORG],
    );
    await insertConsentAudits();
    await insertErasure();

    // Contrary to a naive reading of ON DELETE CASCADE, PostgreSQL invokes
    // the CHILD table's BEFORE DELETE trigger on FK cascades. The exact
    // KB-06B immutable function rejects consent delete and preserves audit.
    await assert.rejects(
      db.query('delete from public.knowledge_discovery_site_consents where id=$1',[CONSENT_A]),
      e=>{assert.equal(e.code,'42501');assert.match(e.message,/consent_audit_append_only/);return true;},
    );
    assert.equal((await db.query('select count(*)::int as n from public.knowledge_discovery_consent_audit')).rows[0].n,2);

    // BEFORE DELETE triggers do NOT fire on TRUNCATE. These sacrificial
    // synthetic audit rows are lost under the current DRAFT SQL.
    await db.query('truncate public.knowledge_discovery_consent_audit');
    assert.equal((await db.query('select count(*)::int as n from public.knowledge_discovery_consent_audit')).rows[0].n,0);
    await insertConsentAudits();
    await db.query('truncate public.knowledge_discovery_metadata_erasure_audit');
    assert.equal((await db.query('select count(*)::int as n from public.knowledge_discovery_metadata_erasure_audit')).rows[0].n,0);
    await insertErasure();

    // EXACT proposed KB-07D DRAFT SQL, unchanged, in a throwaway local DB.
    await db.query(proposal);
    const triggers=await db.query(`
      select tgname,pg_get_triggerdef(oid) as definition
      from pg_trigger
      where not tgisinternal and tgname in
        ('kb_discovery_consent_audit_truncate_block',
         'kb_discovery_metadata_erasure_audit_truncate_block')
      order by tgname
    `);
    assert.equal(triggers.rowCount,2);
    for(const row of triggers.rows){
      assert.match(row.definition,/BEFORE TRUNCATE/i);
      assert.match(row.definition,/kb_discovery_consent_audit_immutable_v1/i);
    }

    for(const table of [
      'knowledge_discovery_consent_audit',
      'knowledge_discovery_metadata_erasure_audit',
    ]){
      await assert.rejects(db.query('truncate public.'+table),
        e=>{assert.equal(e.code,'42501');assert.match(e.message,/consent_audit_append_only/);return true;});
    }
    // TRUNCATE CASCADE can bypass RESTRICT FKs, so protect the affected child
    // audit tables using their own BEFORE TRUNCATE statement triggers.
    await assert.rejects(
      db.query('truncate public.knowledge_discovery_site_consents cascade'),
      e=>{assert.equal(e.code,'42501');return true;},
    );
    await assert.rejects(
      db.query('delete from public.knowledge_discovery_site_consents where id=$1',[CONSENT_A]),
      e=>{assert.equal(e.code,'42501');return true;},
    );
    await assert.rejects(
      db.query("update public.knowledge_discovery_consent_audit set action='revised' where id=$1",[AUDIT_A]),
      e=>{assert.equal(e.code,'42501');return true;},
    );
    const remaining=await db.query(`
      select
        (select count(*)::int from public.knowledge_discovery_site_consents) as consents,
        (select count(*)::int from public.knowledge_discovery_consent_audit) as audit,
        (select count(*)::int from public.knowledge_discovery_metadata_erasure_audit) as erasure
    `);
    assert.deepEqual(remaining.rows,[{consents:2,audit:2,erasure:1}]);
  }finally{
    if(db) await db.end();
    try{if(created) await admin.query('drop database "'+name+'" with (force)');}
    finally{await admin.end();}
  }
});
