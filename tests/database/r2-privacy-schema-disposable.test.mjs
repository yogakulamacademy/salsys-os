import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

// Exercise exactly the review-only privacy DDL in disposable CI PostgreSQL 17.
// BEGIN/COMMIT wrappers are deliberately omitted only to preserve a single
// outer rollback transaction. No hosted database, migration ledger, or egress.
const proposal = readFileSync(new URL(
  '../../docs/sql/r2-staging-identity-merge-privacy-table-review-v1.sql',
  import.meta.url,
), 'utf8');
const isolatedDDL = proposal
  .replace(/^BEGIN;\s*$/m, '')
  .replace(/^COMMIT;\s*$/m, '');

const A = '10000000-0000-4000-8000-000000000001';
const B = '10000000-0000-4000-8000-000000000002';
const actorA = randomUUID();
const actorB = randomUUID();
const personA = randomUUID();
const personB = randomUUID();
const reqA = randomUUID();
const reqB = randomUUID();

function disposableUrl() {
  assert.equal(process.env.SALSYS_ALLOW_LOCAL_DB_TESTS,'1','Explicit local opt-in required');
  assert.ok(process.env.SALSYS_TEST_DATABASE_URL,'CI fixture connection missing');
  const u = new URL(process.env.SALSYS_TEST_DATABASE_URL);
  assert.equal(u.protocol,'postgres:');
  assert.equal(u.hostname,'127.0.0.1','Never connect to hosted PostgreSQL');
  assert.equal(u.port,'55432','Only the disposable CI database is allowed');
  assert.equal(u.pathname,'/postgres','Never use a customer application database');
  assert.equal(u.username,'postgres','Only disposable test admin allowed');
  return u.toString();
}

async function mustReject(db,sql,params,code) {
  await db.query('SAVEPOINT privacy_negative');
  try {
    await assert.rejects(db.query(sql,params), error => {
      assert.equal(error.code,code);
      return true;
    });
  } finally {
    await db.query('ROLLBACK TO SAVEPOINT privacy_negative');
    await db.query('RELEASE SAVEPOINT privacy_negative');
  }
}

test('exact stage privacy proposal enforces composite tenant FKs, RLS, and person-only SET NULL', {
  timeout: 90_000,
}, async () => {
  assert.match(proposal,/^-- REVIEW ONLY: minimum two-table privacy contract/);
  assert.match(proposal,/^BEGIN;$/m);
  assert.match(proposal,/^COMMIT;$/m);
  assert.doesNotMatch(isolatedDDL,/^BEGIN;$/m);
  assert.doesNotMatch(isolatedDDL,/^COMMIT;$/m);

  const db = new pg.Client({connectionString:disposableUrl()});
  await db.connect();
  let began=false;
  try {
    await db.query('BEGIN');began=true;
    await db.query("SET LOCAL statement_timeout='20s'");
    await db.query("SET LOCAL lock_timeout='5s'");
    const forbidden = ['organizations','persons','privacy_data_subject_requests',
      'organization_members','privacy_erasure_jobs','privacy_export_runs'];
    const existing=await db.query(
      "SELECT c.relname FROM pg_catalog.pg_class c " +
      "JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace " +
      "WHERE n.nspname='public' AND c.relname=ANY($1::text[])",[forbidden]);
    assert.equal(existing.rowCount,0,'Refuse pre-existing application tables');
    const checkRoles=await db.query(
      "SELECT rolname FROM pg_catalog.pg_roles " +
      "WHERE rolname IN ('anon','authenticated','service_role')");
    assert.equal(checkRoles.rowCount,0,'Refuse modifying pre-existing Supabase roles');
    const existingMerge=await db.query(
      "SELECT pg_catalog.to_regprocedure('public.merge_identity_resolution_conflict_v1(uuid)') AS fn");
    assert.equal(existingMerge.rows[0].fn,null,'Refuse existing identity function');

    await db.query('CREATE ROLE anon NOLOGIN');
    await db.query('CREATE ROLE authenticated NOLOGIN');
    await db.query('CREATE ROLE service_role NOLOGIN');
    await db.query('CREATE SCHEMA auth');
    await db.query("CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS "+
      "$uid$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $uid$");
    await db.query('GRANT USAGE ON SCHEMA auth TO authenticated');
    await db.query('GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated');

    await db.query('CREATE TABLE public.organizations(id uuid PRIMARY KEY)');
    await db.query('CREATE TABLE public.persons('+
      'id uuid PRIMARY KEY, organization_id uuid NOT NULL)');
    await db.query('CREATE TABLE public.privacy_data_subject_requests('+
      'id uuid PRIMARY KEY, organization_id uuid NOT NULL, person_id uuid)');
    await db.query('CREATE TABLE public.organization_members('+
      'id uuid PRIMARY KEY, organization_id uuid NOT NULL, user_id uuid NOT NULL, active boolean NOT NULL)');
    for(const name of ['organizations','persons','privacy_data_subject_requests','organization_members']){
      await db.query('ALTER TABLE public.'+name+' ENABLE ROW LEVEL SECURITY');
    }
    // A standard member-table read policy in the disposable fixture.
    await db.query('GRANT SELECT ON public.organization_members TO authenticated');
    await db.query('CREATE POLICY member_self ON public.organization_members '+
      'FOR SELECT TO authenticated USING (active AND user_id=(SELECT auth.uid()))');

    // This stub is NOT invoked. It provides the exact source/owner/privilege
    // preflight metadata needed by the reviewed two-table DDL proposal.
    await db.query(
      'CREATE FUNCTION public.merge_identity_resolution_conflict_v1(uuid) '+
      'RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $stub$ '+
      'BEGIN /* public.privacy_erasure_jobs public.privacy_export_runs */ NULL; END; $stub$');
    await db.query('REVOKE ALL ON FUNCTION public.merge_identity_resolution_conflict_v1(uuid) '+
      'FROM PUBLIC,anon,authenticated');

    // The unchanged review proposal includes bounded preflight/postflight,
    // two parent keys, two child tables, four composite tenant FKs and RLS.
    await db.query(isolatedDDL);

    const parentKeys=await db.query(
      "SELECT count(*)::int AS n FROM pg_catalog.pg_constraint " +
      "WHERE conname IN ('r2_privacy_person_org_id_key','r2_privacy_request_org_id_key')");
    assert.equal(parentKeys.rows[0].n,2);
    const pairedFks=await db.query(
      "SELECT count(*)::int AS n FROM pg_catalog.pg_constraint " +
      "WHERE contype='f' AND convalidated AND conname IN "+
      "('privacy_erasure_jobs_request_id_fkey','privacy_erasure_jobs_person_id_fkey',"+
      "'privacy_export_runs_request_id_fkey','privacy_export_runs_person_id_fkey')");
    assert.equal(pairedFks.rows[0].n,4);

    await db.query('INSERT INTO public.organizations(id) VALUES($1),($2)',[A,B]);
    await db.query('INSERT INTO public.persons(id,organization_id) VALUES($1,$3),($2,$4)',
      [personA,personB,A,B]);
    await db.query('INSERT INTO public.privacy_data_subject_requests(id,organization_id,person_id) '+
      'VALUES($1,$3,$5),($2,$4,$6)',[reqA,reqB,A,B,personA,personB]);
    await db.query('INSERT INTO public.organization_members(id,organization_id,user_id,active) '+
      'VALUES($1,$3,$5,true),($2,$4,$6,true)',
      [randomUUID(),randomUUID(),A,B,actorA,actorB]);

    // The same tenant links succeed. Cross-tenant IDs fail on both INSERT
    // and UPDATE even for a privileged writer bypassing RLS.
    for (const tab of ['privacy_erasure_jobs','privacy_export_runs']) {
      const idA=randomUUID(), idB=randomUUID();
      const common=tab==='privacy_export_runs' ? ',package_hash' : '';
      const vals=tab==='privacy_export_runs' ? ',$5' : '';
      const paramsA=tab==='privacy_export_runs' ?
        [idA,A,reqA,personA,'synthetic-hash'] : [idA,A,reqA,personA];
      const paramsB=tab==='privacy_export_runs' ?
        [idB,B,reqB,personB,'synthetic-hash'] : [idB,B,reqB,personB];
      const insert='INSERT INTO public.'+tab+
        '(id,organization_id,request_id,person_id'+common+') '+
        'VALUES($1,$2,$3,$4'+vals+')';
      await db.query(insert,paramsA);
      await db.query(insert,paramsB);
      const badA=[randomUUID(),A,reqB,personA];
      const badB=[randomUUID(),A,reqA,personB];
      if(tab==='privacy_export_runs'){badA.push('synthetic');badB.push('synthetic');}
      await mustReject(db,insert,badA,'23503');
      await mustReject(db,insert,badB,'23503');
      await mustReject(db,'UPDATE public.'+tab+' SET request_id=$1 WHERE id=$2',
        [reqB,idA],'23503');
      await mustReject(db,'UPDATE public.'+tab+' SET person_id=$1 WHERE id=$2',
        [personB,idA],'23503');
    }

    // RLS member-only SELECT: actor A can see A, not B, for both tables.
    await db.query('SET LOCAL ROLE authenticated');
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[actorA]);
    for(const tab of ['privacy_erasure_jobs','privacy_export_runs']){
      const rows=await db.query('SELECT organization_id FROM public.'+tab);
      assert.equal(rows.rowCount,1);
      assert.equal(rows.rows[0].organization_id,A);
      await mustReject(db,'INSERT INTO public.'+tab+
        '(id,organization_id,request_id) VALUES($1,$2,$3)',
        [randomUUID(),A,reqA],'42501');
    }
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[actorB]);
    for(const tab of ['privacy_erasure_jobs','privacy_export_runs']){
      const rows=await db.query('SELECT organization_id FROM public.'+tab);
      assert.equal(rows.rowCount,1);
      assert.equal(rows.rows[0].organization_id,B);
    }
    await db.query('SET LOCAL ROLE anon');
    await mustReject(db,'SELECT count(*) FROM public.privacy_erasure_jobs',[],'42501');
    await mustReject(db,'SELECT count(*) FROM public.privacy_export_runs',[],'42501');
    await db.query('SET LOCAL ROLE postgres');

    // Optional person deletion leaves the NOT NULL organization intact.
    await db.query('DELETE FROM public.persons WHERE id=$1',[personA]);
    for(const tab of ['privacy_erasure_jobs','privacy_export_runs']){
      const row=await db.query('SELECT organization_id,person_id FROM public.'+tab+
        ' WHERE organization_id=$1',[A]);
      assert.equal(row.rowCount,1);
      assert.equal(row.rows[0].organization_id,A);
      assert.equal(row.rows[0].person_id,null);
    }
  } finally {
    if(began)await db.query('ROLLBACK');
    await db.end();
  }
});
