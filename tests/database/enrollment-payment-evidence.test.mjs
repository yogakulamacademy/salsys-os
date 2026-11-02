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
  .find((file) => file.endsWith('_enrollment_verified_payment_evidence_v1.sql'));
if (!migrationFile) throw Error('Missing enrollment verified-payment migration');
const migration = fs.readFileSync(`supabase/migrations/${migrationFile}`, 'utf8');
const helperSql = migration.slice(0, migration.indexOf('-- Patch only the already-reviewed'));

const admin = new pg.Client({
  connectionString: url.href,
  application_name: 'salsys-enrollment-payment-evidence-admin',
});

const org = '10000000-0000-4000-8000-000000000001';
const otherOrg = '10000000-0000-4000-8000-000000000002';
const lead = '40000000-0000-4000-8000-000000000001';
const otherLead = '40000000-0000-4000-8000-000000000002';

const foundation = `
create schema app_private authorization postgres;
revoke all on schema app_private from public, anon;
grant usage on schema app_private to authenticated, service_role;

create type public.payment_kind as enum ('deposit','balance','full','refund','other');
create type public.payment_status as enum ('pending','paid','failed','refunded','partially_refunded');

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  lead_id uuid not null,
  provider text,
  external_payment_id text,
  payment_kind public.payment_kind not null,
  status public.payment_status not null,
  amount numeric not null,
  currency text not null,
  metadata jsonb not null default '{}'::jsonb
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
  const database = `salsys_payment_evidence_test_${randomUUID().replaceAll('-', '')}`;
  assert.match(database, /^salsys_payment_evidence_test_[a-f0-9]{32}$/);
  const connection = new URL(url);
  connection.pathname = `/${database}`;
  const clients = [];
  await admin.query(`create database "${database}"`);

  const connect = async () => {
    const client = new pg.Client({ connectionString: connection.href });
    await client.connect();
    clients.push(client);
    return client;
  };

  try {
    const owner = await connect();
    await owner.query(foundation);
    await owner.query(helperSql);
    await run({ owner });
  } finally {
    for (const client of clients) await client.query('rollback').catch(() => {});
    await Promise.allSettled(clients.map((client) => client.end()));
    await admin.query(`drop database "${database}"`);
  }
}

async function insertPayment(
  owner,
  {
    organizationId = org,
    leadId = lead,
    provider = 'paypal',
    paymentReference = 'PAY-1',
    kind = 'deposit',
    status = 'paid',
    amount = 1,
    currency = 'USD',
    bookingReference = 'BOOK-1',
  } = {},
) {
  const id = randomUUID();
  await owner.query(
    `insert into public.payments(
      id,organization_id,lead_id,provider,external_payment_id,payment_kind,status,amount,currency,metadata
    ) values($1,$2,$3,$4,$5,$6,$7,$8,$9,jsonb_build_object('booking_reference',$10))`,
    [id, organizationId, leadId, provider, paymentReference, kind, status, amount, currency, bookingReference],
  );
  return id;
}

async function assertEvidence(
  owner,
  {
    organizationId = org,
    leadId = lead,
    bookingReference = 'BOOK-1',
    paymentReference = 'PAY-1',
    provider = 'paypal',
    currency = 'USD',
  } = {},
) {
  return (
    await owner.query(
      `select app_private.assert_verified_payment_enrollment_v1($1,$2,$3,$4,$5,$6) as payment_id`,
      [organizationId, leadId, bookingReference, paymentReference, provider, currency],
    )
  ).rows[0].payment_id;
}

test('a positive canonical paid payment is sufficient without inventing a minimum deposit', () =>
  fixture(async ({ owner }) => {
    const paymentId = await insertPayment(owner, { amount: 1 });
    assert.equal(await assertEvidence(owner), paymentId);
  }));

test('pending payment fails first and the same evidence succeeds after authoritative paid transition', () =>
  fixture(async ({ owner }) => {
    const paymentId = await insertPayment(owner, { status: 'pending', amount: 200 });
    await assert.rejects(
      assertEvidence(owner),
      /Verified paid payment evidence is not available for this enrollment yet/,
    );
    await owner.query(`update public.payments set status='paid' where id=$1`, [paymentId]);
    assert.equal(await assertEvidence(owner), paymentId);
  }));

test('failed, refund, zero-value and refunded-status rows cannot confirm payment-backed enrollment', () =>
  fixture(async ({ owner }) => {
    for (const [index, overrides] of [
      ['failed', { status: 'failed' }],
      ['refund', { kind: 'refund', status: 'refunded' }],
      ['zero', { amount: 0 }],
      ['refunded-status', { status: 'refunded' }],
    ]) {
      const paymentReference = `PAY-${index}`;
      await insertPayment(owner, { ...overrides, paymentReference });
      await assert.rejects(
        assertEvidence(owner, { paymentReference }),
        /Verified paid payment evidence is not available for this enrollment yet/,
      );
    }
  }));

test('tenant, lead, booking, payment reference, provider and currency must all match', () =>
  fixture(async ({ owner }) => {
    await insertPayment(owner);
    for (const overrides of [
      { organizationId: otherOrg },
      { leadId: otherLead },
      { bookingReference: 'BOOK-OTHER' },
      { paymentReference: 'PAY-OTHER' },
      { provider: 'icici' },
      { currency: 'INR' },
    ]) {
      await assert.rejects(
        assertEvidence(owner, overrides),
        /Verified paid payment evidence is not available for this enrollment yet/,
      );
    }
  }));

test('booking, payment reference and provider evidence are mandatory for verified-payment confirmation', () =>
  fixture(async ({ owner }) => {
    for (const overrides of [
      { bookingReference: '' },
      { paymentReference: '' },
      { provider: '' },
    ]) {
      await assert.rejects(
        assertEvidence(owner, overrides),
        /requires booking, payment reference and provider evidence/,
      );
    }
  }));

test('currency may be omitted by a trusted source but a supplied currency must match', () =>
  fixture(async ({ owner }) => {
    const paymentId = await insertPayment(owner, { currency: 'USD' });
    assert.equal(await assertEvidence(owner, { currency: null }), paymentId);
    await assert.rejects(
      assertEvidence(owner, { currency: 'INR' }),
      /Verified paid payment evidence is not available for this enrollment yet/,
    );
  }));

test('verified-payment helper is not directly executable by API roles', () =>
  fixture(async ({ owner }) => {
    const rows = (
      await owner.query(`select role_name,
        has_function_privilege(
          role_name,
          'app_private.assert_verified_payment_enrollment_v1(uuid,uuid,text,text,text,text)',
          'EXECUTE'
        ) as can_execute
      from unnest(array['anon','authenticated','service_role']) role_name`)
    ).rows;
    assert.deepEqual(
      rows.map((row) => [row.role_name, row.can_execute]),
      [
        ['anon', false],
        ['authenticated', false],
        ['service_role', false],
      ],
    );
  }));
