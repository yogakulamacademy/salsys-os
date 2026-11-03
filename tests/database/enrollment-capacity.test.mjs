import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const url = new URL(
  process.env.SALSYS_TEST_DATABASE_URL ||
    'postgres://postgres:local-fixture-only@127.0.0.1:55432/postgres',
);
if (
  process.env.SALSYS_ALLOW_LOCAL_DB_TESTS !== '1' ||
  !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
  url.pathname !== '/postgres'
) {
  throw Error('Explicit local-only disposable database test configuration is required');
}

const migrationFile = fs
  .readdirSync('supabase/migrations')
  .find((file) => file.endsWith('_enrollment_batch_capacity_guard_v1.sql'));
if (!migrationFile) throw Error('Missing enrollment batch capacity migration');
const migration = fs.readFileSync(`supabase/migrations/${migrationFile}`, 'utf8');

const admin = new pg.Client({
  connectionString: url.href,
  application_name: 'salsys-capacity-test-admin',
});

const org = '10000000-0000-4000-8000-000000000001';
const otherOrg = '10000000-0000-4000-8000-000000000002';

const foundation = `
create schema app_private authorization postgres;
revoke all on schema app_private from public, anon;
grant usage on schema app_private to authenticated, service_role;

create type public.lead_stage as enum ('new','engaged','payment_pending','enrolled','closed_won');
create type public.lead_status as enum ('open','won','lost','archived');
create type public.enrollment_status as enum ('pending','confirmed','cancelled','completed','deferred');

create table public.course_batches (
  id uuid primary key,
  organization_id uuid not null,
  capacity integer,
  seats_remaining integer
);

create table public.leads (
  id uuid primary key,
  organization_id uuid not null,
  preferred_batch_id uuid,
  current_stage public.lead_stage not null default 'new',
  status public.lead_status not null default 'open'
);

create table public.enrollments (
  id uuid primary key,
  organization_id uuid not null,
  lead_id uuid not null,
  batch_id uuid,
  status public.enrollment_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
`;

before(async () => {
  await admin.connect();
  await admin.query(`do $$ begin
    if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
  end; $$;`);
});

after(async () => {
  await admin.end();
});

async function fixture(run) {
  const database = `salsys_capacity_test_${randomUUID().replaceAll('-', '')}`;
  assert.match(database, /^salsys_capacity_test_[a-f0-9]{32}$/);
  const connection = new URL(url);
  connection.pathname = `/${database}`;
  const clients = [];

  await admin.query(`create database "${database}"`);
  const connect = async (name = 'salsys-capacity-test') => {
    const client = new pg.Client({
      connectionString: connection.href,
      application_name: name,
    });
    await client.connect();
    clients.push(client);
    return client;
  };

  try {
    const owner = await connect('salsys-capacity-owner');
    await owner.query(foundation);
    await owner.query(migration);
    await run({ owner, connect });
  } finally {
    for (const client of clients) {
      await client.query('rollback').catch(() => {});
    }
    await Promise.allSettled(clients.map((client) => client.end()));
    await admin.query(`drop database "${database}"`);
  }
}

async function batch(client, capacity, id = randomUUID(), organizationId = org) {
  await client.query(
    `insert into public.course_batches(id,organization_id,capacity) values($1,$2,$3)`,
    [id, organizationId, capacity],
  );
  return id;
}

async function lead(
  client,
  {
    id = randomUUID(),
    organizationId = org,
    preferredBatchId = null,
    stage = 'new',
    status = 'open',
  } = {},
) {
  await client.query(
    `insert into public.leads(id,organization_id,preferred_batch_id,current_stage,status)
     values($1,$2,$3,$4,$5)`,
    [id, organizationId, preferredBatchId, stage, status],
  );
  return id;
}

async function enrollment(
  client,
  {
    id = randomUUID(),
    organizationId = org,
    leadId,
    batchId,
    status = 'confirmed',
    createdAt = new Date().toISOString(),
  },
) {
  await client.query(
    `insert into public.enrollments(id,organization_id,lead_id,batch_id,status,created_at,updated_at)
     values($1,$2,$3,$4,$5,$6,$6)`,
    [id, organizationId, leadId, batchId, status, createdAt],
  );
  return id;
}

async function waitBlocked(observer, blocked, blocker) {
  const end = Date.now() + 5000;
  while (Date.now() < end) {
    const result = await observer.query(
      `select $1::integer = any(pg_blocking_pids($2::integer)) as blocked`,
      [blocker.processID, blocked.processID],
    );
    if (result.rows[0].blocked) return;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  throw Error('The competing enrollment did not wait on the batch capacity lock');
}

test('NULL and zero capacity keep the existing capacity-not-set semantics', () =>
  fixture(async ({ owner }) => {
    for (const capacity of [null, 0]) {
      const batchId = await batch(owner, capacity);
      for (let index = 0; index < 3; index += 1) {
        const leadId = await lead(owner);
        await enrollment(owner, { leadId, batchId, status: 'confirmed' });
      }
      const count = await owner.query(
        `select count(*)::integer as n from public.enrollments where batch_id=$1`,
        [batchId],
      );
      assert.equal(count.rows[0].n, 3);
    }
  }));

test('positive capacity counts confirmed and completed distinct leads', () =>
  fixture(async ({ owner }) => {
    const batchId = await batch(owner, 2);
    const first = await lead(owner);
    const second = await lead(owner);
    const third = await lead(owner);
    await enrollment(owner, { leadId: first, batchId, status: 'confirmed' });
    await enrollment(owner, { leadId: second, batchId, status: 'completed' });
    await assert.rejects(
      enrollment(owner, { leadId: third, batchId, status: 'confirmed' }),
      /Batch capacity exceeded: 3 occupied seats for capacity 2/,
    );
    const count = await owner.query(
      `select count(*)::integer as n from public.enrollments where batch_id=$1`,
      [batchId],
    );
    assert.equal(count.rows[0].n, 2);
  }));

test('pending enrollments do not consume a seat and cannot be confirmed after the batch is full', () =>
  fixture(async ({ owner }) => {
    const batchId = await batch(owner, 1);
    const first = await lead(owner);
    const second = await lead(owner);
    await enrollment(owner, { leadId: first, batchId, status: 'confirmed' });
    const pending = await enrollment(owner, { leadId: second, batchId, status: 'pending' });
    await assert.rejects(
      owner.query(`update public.enrollments set status='confirmed' where id=$1`, [pending]),
      /Batch capacity exceeded/,
    );
    const row = await owner.query(`select status::text from public.enrollments where id=$1`, [pending]);
    assert.equal(row.rows[0].status, 'pending');
  }));

test('cancelling the latest canonical enrollment frees the seat', () =>
  fixture(async ({ owner }) => {
    const batchId = await batch(owner, 1);
    const first = await lead(owner);
    const second = await lead(owner);
    const firstEnrollment = await enrollment(owner, { leadId: first, batchId, status: 'confirmed' });
    await owner.query(`update public.enrollments set status='cancelled' where id=$1`, [firstEnrollment]);
    await enrollment(owner, { leadId: second, batchId, status: 'confirmed' });
    const occupied = await owner.query(
      `select count(*)::integer as n from public.enrollments where batch_id=$1 and status in ('confirmed','completed')`,
      [batchId],
    );
    assert.equal(occupied.rows[0].n, 1);
  }));

test('legacy enrolled-stage fallback consumes one seat without double-counting its canonical enrollment', () =>
  fixture(async ({ owner }) => {
    const batchId = await batch(owner, 1);
    const fallbackLead = await lead(owner, {
      preferredBatchId: batchId,
      stage: 'enrolled',
    });
    const otherLead = randomUUID();

    await assert.rejects(
      lead(owner, {
        id: otherLead,
        preferredBatchId: batchId,
        stage: 'enrolled',
      }),
      /Batch capacity exceeded/,
    );

    await enrollment(owner, {
      leadId: fallbackLead,
      batchId,
      status: 'confirmed',
    });

    const fallbackExists = await owner.query(`select count(*)::integer as n from public.leads where id=$1`, [otherLead]);
    assert.equal(fallbackExists.rows[0].n, 0);
  }));

test('moving a canonical enrollment into a full batch rolls back the move', () =>
  fixture(async ({ owner }) => {
    const sourceBatch = await batch(owner, 2);
    const fullBatch = await batch(owner, 1);
    const movingLead = await lead(owner);
    const residentLead = await lead(owner);
    const movingEnrollment = await enrollment(owner, {
      leadId: movingLead,
      batchId: sourceBatch,
      status: 'confirmed',
    });
    await enrollment(owner, {
      leadId: residentLead,
      batchId: fullBatch,
      status: 'confirmed',
    });

    await assert.rejects(
      owner.query(`update public.enrollments set batch_id=$1 where id=$2`, [fullBatch, movingEnrollment]),
      /Batch capacity exceeded/,
    );
    const row = await owner.query(`select batch_id from public.enrollments where id=$1`, [movingEnrollment]);
    assert.equal(row.rows[0].batch_id, sourceBatch);
  }));

test('cross-tenant enrollment-to-batch association is rejected by the capacity boundary', () =>
  fixture(async ({ owner }) => {
    const batchId = await batch(owner, 2, randomUUID(), org);
    const leadId = await lead(owner, { organizationId: otherOrg });
    await assert.rejects(
      enrollment(owner, {
        organizationId: otherOrg,
        leadId,
        batchId,
        status: 'confirmed',
      }),
      /Enrollment batch tenant mismatch/,
    );
  }));

test('two concurrent confirmations for the final seat serialize and only one commits', () =>
  fixture(async ({ owner, connect }) => {
    const batchId = await batch(owner, 1);
    const firstLead = await lead(owner);
    const secondLead = await lead(owner);
    const first = await connect('salsys-capacity-first');
    const second = await connect('salsys-capacity-second');

    await first.query('begin');
    await first.query(
      `insert into public.enrollments(id,organization_id,lead_id,batch_id,status)
       values($1,$2,$3,$4,'confirmed')`,
      [randomUUID(), org, firstLead, batchId],
    );

    await second.query('begin');
    const competing = second.query(
      `insert into public.enrollments(id,organization_id,lead_id,batch_id,status)
       values($1,$2,$3,$4,'confirmed')`,
      [randomUUID(), org, secondLead, batchId],
    );

    await waitBlocked(owner, second, first);
    await first.query('commit');
    await assert.rejects(competing, /Batch capacity exceeded/);
    await second.query('rollback');

    const count = await owner.query(
      `select count(*)::integer as n from public.enrollments
       where batch_id=$1 and status in ('confirmed','completed')`,
      [batchId],
    );
    assert.equal(count.rows[0].n, 1);
  }));

test('capacity helpers stay private and cannot be called directly by API roles', () =>
  fixture(async ({ owner }) => {
    const rows = (
      await owner.query(`select role_name,
        has_function_privilege(role_name,'app_private.assert_batch_capacity_v1(uuid,uuid)','EXECUTE') as assert_capacity,
        has_function_privilege(role_name,'app_private.enforce_enrollment_batch_capacity_v1()','EXECUTE') as enrollment_trigger,
        has_function_privilege(role_name,'app_private.enforce_lead_batch_capacity_fallback_v1()','EXECUTE') as lead_trigger
      from unnest(array['anon','authenticated','service_role']) role_name`)
    ).rows;

    assert.deepEqual(
      rows.map((row) => [row.role_name, row.assert_capacity, row.enrollment_trigger, row.lead_trigger]),
      [
        ['anon', false, false, false],
        ['authenticated', false, false, false],
        ['service_role', false, false, false],
      ],
    );
  }));
