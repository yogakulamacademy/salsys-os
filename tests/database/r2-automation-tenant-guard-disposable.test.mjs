import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

// Run the exact function body from the review-only proposal against an isolated
// PostgreSQL 17 test service. Never use hosted staging or customer data.
const proposal = readFileSync(new URL(
  '../../docs/sql/r2-staging-automation-tenant-guard-review-v1.sql',
  import.meta.url,
), 'utf8');
const functions = proposal.match(
  /CREATE OR REPLACE FUNCTION public\.enforce_automation_tenant_alignment_v1\(\)[\s\S]*?\$function\$;/g,
) || [];
const tables = [
  'automation_events', 'automation_runs', 'automation_enrollments',
  'automation_suppressions', 'automation_scheduled_jobs',
  'automation_variables', 'automation_wait_states',
];
const refs = [
  ['lead_id', 'lead', 'leads'],
  ['conversation_id', 'conversation', 'conversations'],
  ['message_id', 'message', 'messages'],
];
const orgA = '10000000-0000-4000-8000-000000000001';
const orgB = '10000000-0000-4000-8000-000000000002';
const ids = {
  lead: [randomUUID(), randomUUID()],
  conversation: [randomUUID(), randomUUID()],
  message: [randomUUID(), randomUUID()],
};

function localFixtureUrl() {
  assert.equal(process.env.SALSYS_ALLOW_LOCAL_DB_TESTS, '1', 'Explicit opt-in required');
  assert.ok(process.env.SALSYS_TEST_DATABASE_URL, 'Local PostgreSQL URL required');
  const u = new URL(process.env.SALSYS_TEST_DATABASE_URL);
  assert.equal(u.protocol, 'postgres:');
  assert.equal(u.hostname, '127.0.0.1', 'No hosted database connections');
  assert.equal(u.port, '55432', 'Refuse non-CI port');
  assert.equal(u.pathname, '/postgres', 'Refuse application database');
  assert.equal(u.username, 'postgres', 'Use the local test fixture admin only');
  return u.toString();
}

async function rejectsAndRollsBack(db, sql, args, pattern) {
  await db.query('SAVEPOINT r2_guard_rejection');
  try {
    await assert.rejects(db.query(sql, args), error => {
      assert.equal(error.code, 'P0001');
      assert.match(error.message, pattern);
      return true;
    });
  } finally {
    await db.query('ROLLBACK TO SAVEPOINT r2_guard_rejection');
    await db.query('RELEASE SAVEPOINT r2_guard_rejection');
  }
}

test('proposed tenant guard enforces seven INSERT/UPDATE paths in disposable PostgreSQL', {
  timeout: 90_000,
}, async () => {
  assert.equal(functions.length, 1, 'One exact proposed trigger function required');
  assert.match(proposal, /^-- REVIEW-ONLY R2 staging proposal\./);

  const db = new pg.Client({ connectionString: localFixtureUrl() });
  await db.connect();
  let began = false;
  try {
    await db.query('BEGIN'); began = true;
    await db.query("SET LOCAL statement_timeout='12s'");
    await db.query("SET LOCAL lock_timeout='5s'");
    const guardedNames = [...tables, 'leads', 'conversations', 'messages'];
    const existing = await db.query(
      "SELECT c.relname FROM pg_catalog.pg_class c " +
      "JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace " +
      "WHERE n.nspname='public' AND c.relname=ANY($1::text[])", [guardedNames]);
    assert.equal(existing.rowCount, 0, 'Refuse preexisting app tables');
    const preexistingFunction = await db.query(
      "SELECT pg_catalog.to_regprocedure('public.enforce_automation_tenant_alignment_v1()') AS fn");
    assert.equal(preexistingFunction.rows[0].fn, null, 'Refuse existing function');

    for (const [, , relation] of refs) {
      await db.query('CREATE TABLE public.'+relation+
        ' (id uuid PRIMARY KEY, organization_id uuid NOT NULL)');
    }
    for (const [, key, relation] of refs) {
      await db.query('INSERT INTO public.'+relation+
        '(id,organization_id) VALUES($1,$3),($2,$4)',
        [ids[key][0],ids[key][1],orgA,orgB]);
    }

    // Execute the unchanged source, rather than a duplicated implementation.
    await db.query(functions[0]);
    for (const table of tables) {
      await db.query('CREATE TABLE public.'+table+' ('+
        'id uuid PRIMARY KEY, organization_id uuid, lead_id uuid,'+
        'conversation_id uuid, message_id uuid)');
      await db.query('CREATE TRIGGER synthetic_'+table+'_tenant_guard '+
        'BEFORE INSERT OR UPDATE ON public.'+table+' '+
        'FOR EACH ROW EXECUTE FUNCTION public.enforce_automation_tenant_alignment_v1()');

      const goodId = randomUUID();
      const positive = await db.query('INSERT INTO public.'+table+
        '(id,organization_id,lead_id,conversation_id,message_id) '+
        'VALUES($1,$2,$3,$4,$5) RETURNING id',
        [goodId,orgA,ids.lead[0],ids.conversation[0],ids.message[0]]);
      assert.equal(positive.rows[0].id,goodId,table+' same-tenant positive');

      // Nullable references are allowed, null tenant is not.
      await db.query('INSERT INTO public.'+table+
        '(id,organization_id) VALUES($1,$2)',[randomUUID(),orgA]);
      await rejectsAndRollsBack(db,
        'INSERT INTO public.'+table+'(id,organization_id) VALUES($1,NULL)',
        [randomUUID()], /organization_id is required/);

      for (const [column,key] of refs) {
        const message = new RegExp('Automation '+key+' does not belong to organization');
        // All three paths must reject both another-tenant IDs and missing IDs.
        await rejectsAndRollsBack(db,
          'INSERT INTO public.'+table+'(id,organization_id,'+column+') VALUES($1,$2,$3)',
          [randomUUID(),orgA,ids[key][1]],message);
        await rejectsAndRollsBack(db,
          'INSERT INTO public.'+table+'(id,organization_id,'+column+') VALUES($1,$2,$3)',
          [randomUUID(),orgA,randomUUID()],message);
        await rejectsAndRollsBack(db,
          'UPDATE public.'+table+' SET '+column+'=$1 WHERE id=$2',
          [ids[key][1],goodId],message);
      }
      // Org changes must not leave cross-tenant links behind.
      await rejectsAndRollsBack(db,
        'UPDATE public.'+table+' SET organization_id=$1 WHERE id=$2',
        [orgB,goodId],/Automation lead does not belong to organization/);
    }
    // Trigger cannot be silently installed on an unexpected table.
    await db.query('CREATE TABLE public.r2_unlisted_fixture (organization_id uuid)');
    await db.query('CREATE TRIGGER synthetic_outside_whitelist '+
      'BEFORE INSERT ON public.r2_unlisted_fixture '+
      'FOR EACH ROW EXECUTE FUNCTION public.enforce_automation_tenant_alignment_v1()');
    await rejectsAndRollsBack(db,
      'INSERT INTO public.r2_unlisted_fixture(organization_id) VALUES($1)',
      [orgA],/Unexpected R2 automation tenant alignment trigger context/);
  } finally {
    if (began) await db.query('ROLLBACK');
    await db.end();
  }
});
