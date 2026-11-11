import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const { Client } = pg;
const original = readFileSync(
  new URL('../../supabase/migrations/20261016171500_organization_knowledge_v1.sql',import.meta.url),
  'utf8',
);
const proposal = readFileSync(
  new URL('../../docs/sql/KB-07C-knowledge-approval-audit-delete-guard-DRAFT.sql',import.meta.url),
  'utf8',
);
const ORG = '10000000-0000-4000-8000-000000000001';
const DOC_APPROVED = '20000000-0000-4000-8000-000000000001';
const DOC_DRAFT = '20000000-0000-4000-8000-000000000002';
const DOC_BASELINE = '20000000-0000-4000-8000-000000000003';

function loopbackAdmin() {
  assert.equal(process.env.SALSYS_ALLOW_LOCAL_DB_TESTS,'1',
    'Only explicitly opted-in disposable local PostgreSQL is permitted');
  const raw=process.env.SALSYS_TEST_DATABASE_URL;
  assert.ok(raw,'No local PostgreSQL service configured');
  const u=new URL(raw);
  assert.equal(u.protocol,'postgres:');
  assert.ok(['127.0.0.1','localhost'].includes(u.hostname),
    'Never connect to a remote hosted database');
  assert.equal(u.pathname,'/postgres','Never run on an application database');
  assert.equal(u.username,'postgres','Requires local test-only Postgres admin');
  return u;
}

test('KB-07C exact draft SQL prevents silent deletion of human approval history in disposable PostgreSQL',async()=>{
  // Test fixture uses a MINIMAL recreation of source FK relationships; it
  // does not claim to reproduce production Auth, RLS or organization deletion.
  assert.match(original,
    /constraint knowledge_approvals_document_fk\s+foreign key \(document_id, organization_id\)\s+references public\.knowledge_documents\(id, organization_id\)\s+on delete cascade/i);
  assert.match(original,
    /constraint knowledge_chunks_document_fk\s+foreign key \(document_id, organization_id\)\s+references public\.knowledge_documents\(id, organization_id\)\s+on delete cascade/i);
  assert.match(proposal,
    /alter table public\.knowledge_approvals\s+drop constraint knowledge_approvals_document_fk;/i);
  assert.match(proposal,
    /alter table public\.knowledge_approvals\s+add constraint knowledge_approvals_document_fk\s+foreign key \(document_id, organization_id\)\s+references public\.knowledge_documents\(id, organization_id\)\s+on delete restrict;/i);
  assert.doesNotMatch(proposal,/\bdelete\s+from\b|\btruncate\b|\bcreate\s+policy\b/i);
  assert.doesNotMatch(proposal,/\bcreate\s+or\s+replace\s+function\b|\bgrant\b/i);

  const url=loopbackAdmin();
  const name='salsys_kb07c_fixture_'+randomUUID().replace(/-/g,'').slice(0,18);
  assert.match(name,/^salsys_kb07c_fixture_[a-f0-9]{18}$/);
  const database=new URL(url);database.pathname='/'+name;
  const admin=new Client({connectionString:url.toString()});
  let db=null;let created=false;
  await admin.connect();
  try {
    await admin.query('create database "'+name+'"');
    created=true;
    db=new Client({connectionString:database.toString()});
    await db.connect();
    await db.query("set statement_timeout = '20000'");
    await db.query("set lock_timeout = '3000'");
    await db.query(`
      create table public.knowledge_documents (
        id uuid primary key,
        organization_id uuid not null,
        unique (id,organization_id)
      );
      create table public.knowledge_approvals (
        id uuid primary key,
        document_id uuid not null,
        organization_id uuid not null,
        constraint knowledge_approvals_document_fk
          foreign key (document_id,organization_id)
          references public.knowledge_documents(id,organization_id)
          on delete cascade
      );
      create table public.knowledge_chunks (
        id uuid primary key,
        document_id uuid not null,
        organization_id uuid not null,
        constraint knowledge_chunks_document_fk
          foreign key (document_id,organization_id)
          references public.knowledge_documents(id,organization_id)
          on delete cascade
      );
    `);
    for(const id of [DOC_APPROVED,DOC_DRAFT,DOC_BASELINE]){
      await db.query('insert into public.knowledge_documents values($1,$2)',[id,ORG]);
    }
    await db.query('insert into public.knowledge_approvals values($1,$2,$3)',
      ['30000000-0000-4000-8000-000000000001',DOC_APPROVED,ORG]);
    await db.query('insert into public.knowledge_approvals values($1,$2,$3)',
      ['30000000-0000-4000-8000-000000000002',DOC_BASELINE,ORG]);
    for(const [i,doc] of [DOC_APPROVED,DOC_DRAFT,DOC_BASELINE].entries()){
      await db.query('insert into public.knowledge_chunks values($1,$2,$3)',
        ['40000000-0000-4000-8000-00000000000'+(i+1),doc,ORG]);
    }

    // Demonstrate the deployed baseline danger using ONLY sacrificial rows.
    await db.query('delete from public.knowledge_documents where id=$1',[DOC_BASELINE]);
    const before=await db.query(
      'select count(*)::integer as count from public.knowledge_approvals where document_id=$1',
      [DOC_BASELINE],
    );
    assert.equal(before.rows[0].count,0,
      'Original CASCADE removed approval audit along with document');

    // This is the EXACT proposed DRAFT SQL, unmodified, executed only on
    // this just-created local isolated throwaway database.
    await db.query(proposal);
    const fk=await db.query(`
      select c.confdeltype, t.relname as child, p.relname as parent
      from pg_constraint c
      join pg_class t on t.oid=c.conrelid
      join pg_class p on p.oid=c.confrelid
      where c.conname='knowledge_approvals_document_fk'
    `);
    assert.deepEqual(fk.rows,[{
      confdeltype:'r', child:'knowledge_approvals', parent:'knowledge_documents',
    }],'Actual PostgreSQL FK must now RESTRICT removal');

    // Even a privileged DB writer cannot accidentally delete an approved
    // document and cascade its existing human audit row.
    await assert.rejects(
      db.query('delete from public.knowledge_documents where id=$1',[DOC_APPROVED]),
      err=>{assert.equal(err.code,'23503');return true;},
    );
    const retained=await db.query(`
      select
        (select count(*)::integer from public.knowledge_documents where id=$1) as docs,
        (select count(*)::integer from public.knowledge_approvals where document_id=$1) as audits,
        (select count(*)::integer from public.knowledge_chunks where document_id=$1) as chunks
    `,[DOC_APPROVED]);
    assert.deepEqual(retained.rows,[{docs:1,audits:1,chunks:1}]);

    // Preserve legacy derived-chunk cascade on a draft with NO approval row;
    // KB-07C is intentionally NOT a full content retention/erasure policy.
    await db.query('delete from public.knowledge_documents where id=$1',[DOC_DRAFT]);
    const draft=await db.query(`
      select
        (select count(*)::integer from public.knowledge_documents where id=$1) as docs,
        (select count(*)::integer from public.knowledge_chunks where document_id=$1) as chunks
    `,[DOC_DRAFT]);
    assert.deepEqual(draft.rows,[{docs:0,chunks:0}]);
    const auditTotal=await db.query('select count(*)::integer as count from public.knowledge_approvals');
    assert.equal(auditTotal.rows[0].count,1);
  } finally {
    if(db) await db.end();
    try{if(created)await admin.query('drop database "'+name+'" with (force)');}
    finally{await admin.end();}
  }
});
