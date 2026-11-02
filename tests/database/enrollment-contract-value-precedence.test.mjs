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
  .find((file) => file.endsWith('_enrollment_contract_value_precedence_v1.sql'));
if (!migrationFile) throw Error('Missing enrollment contract-value precedence migration');
const migration = fs.readFileSync(`supabase/migrations/${migrationFile}`, 'utf8');

const admin = new pg.Client({
  connectionString: url.href,
  application_name: 'salsys-contract-precedence-test-admin',
});

const org = '10000000-0000-4000-8000-000000000001';
const lead = '40000000-0000-4000-8000-000000000001';
const enrollment = '50000000-0000-4000-8000-000000000001';

const foundation = `
create type public.lead_stage as enum (
  'new','contacted','engaged','qualified','high_intent','payment_pending','enrolled',
  'nurture','not_now','lost','unqualified','duplicate'
);
create type public.lead_status as enum ('open','won','lost','archived');
create type public.contact_channel as enum ('website','instagram','whatsapp','email','phone','meta_lead_form','other');

create table public.leads(
  id uuid primary key,
  lead_code text,
  first_name text,
  last_name text,
  display_name text,
  current_stage public.lead_stage not null default 'new',
  status public.lead_status not null default 'open',
  preferred_location text,
  preferred_month date,
  preferred_mode text,
  first_touch_source text,
  first_touch_medium text,
  first_touch_campaign text,
  lead_creation_channel public.contact_channel,
  expected_close_date date,
  created_at timestamptz not null default now(),
  potential_value numeric(14,2),
  potential_currency text,
  organization_id uuid not null
);

create table public.enrollments(
  id uuid primary key,
  lead_id uuid not null references public.leads(id),
  organization_id uuid not null,
  total_value numeric(14,2),
  currency text,
  created_at timestamptz not null default now()
);

create table public.lead_payment_totals_fixture(
  organization_id uuid not null,
  lead_id uuid not null,
  currency text not null,
  gross_paid numeric(14,2) not null default 0,
  refunds numeric(14,2) not null default 0,
  net_paid numeric(14,2) not null default 0
);

create view public.v_lead_payment_totals
with (security_invoker = true)
as
select organization_id, lead_id, currency, gross_paid, refunds, net_paid
from public.lead_payment_totals_fixture;

create table public.organization_lead_stage_probabilities(
  organization_id uuid not null,
  stage text not null,
  probability numeric not null
);
create table public.lead_stage_probabilities(
  stage text primary key,
  probability numeric not null
);

-- Old-shape placeholder views ensure CREATE OR REPLACE compatibility is tested.
create view public.v_lead_revenue_status
with (security_invoker = true)
as
select
  l.id as lead_id,
  l.lead_code,
  coalesce(l.display_name,l.lead_code) as lead_name,
  l.current_stage,
  l.potential_value::numeric(12,2) as potential_value,
  upper(coalesce(l.potential_currency,'INR')) as currency,
  0::numeric(14,2) as gross_paid,
  0::numeric(14,2) as refunds,
  0::numeric(14,2) as net_paid,
  null::numeric(14,2) as outstanding_balance,
  'unvalued'::text as payment_status,
  l.organization_id
from public.leads l;

create view public.v_revenue_forecast
with (security_invoker = true)
as
select
  l.id,
  l.lead_code,
  trim(both from concat_ws(' ',l.first_name,l.last_name)) as lead_name,
  l.current_stage,
  l.preferred_location,
  l.preferred_month,
  l.preferred_mode,
  l.first_touch_source,
  l.first_touch_medium,
  l.first_touch_campaign,
  l.lead_creation_channel,
  l.expected_close_date,
  l.created_at,
  l.potential_value,
  coalesce(l.potential_currency,'INR') as currency,
  0::numeric as probability,
  0::numeric as weighted_value,
  0::numeric as actual_revenue,
  date_trunc('month',l.created_at)::date as forecast_month,
  l.organization_id
from public.leads l;
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
  const database = `salsys_contract_precedence_test_${randomUUID().replaceAll('-', '')}`;
  assert.match(database, /^salsys_contract_precedence_test_[a-f0-9]{32}$/);
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
    await owner.query(migration);
    await owner.query(
      `insert into public.leads(
        id,lead_code,first_name,last_name,current_stage,status,expected_close_date,
        potential_value,potential_currency,organization_id
      ) values($1,'LD-000001','Asha','Test','qualified','open','2026-12-15',1000,'INR',$2)`,
      [lead, org],
    );
    await owner.query(
      `insert into public.organization_lead_stage_probabilities(organization_id,stage,probability)
       values($1,'qualified',0.5),($1,'enrolled',1.0)`,
      [org],
    );
    await run({ owner });
  } finally {
    for (const client of clients) await client.query('rollback').catch(() => {});
    await Promise.allSettled(clients.map((client) => client.end()));
    await admin.query(`drop database "${database}"`);
  }
}

test('before enrollment the lead potential value remains the forecast authority', () =>
  fixture(async ({ owner }) => {
    await owner.query(
      `insert into public.lead_payment_totals_fixture(organization_id,lead_id,currency,gross_paid,refunds,net_paid)
       values($1,$2,'INR',200,0,200)`,
      [org, lead],
    );

    const revenue = (
      await owner.query(`select potential_value::text,currency,gross_paid::text,net_paid::text,
        outstanding_balance::text,payment_status from public.v_lead_revenue_status where lead_id=$1`, [lead])
    ).rows[0];
    assert.deepEqual(revenue, {
      potential_value: '1000.00',
      currency: 'INR',
      gross_paid: '200.00',
      net_paid: '200.00',
      outstanding_balance: '800.00',
      payment_status: 'partially_paid',
    });

    const forecast = (
      await owner.query(`select potential_value::text,currency,probability::text,weighted_value::text
        from public.v_revenue_forecast where id=$1`, [lead])
    ).rows[0];
    assert.equal(forecast.potential_value, '1000.00');
    assert.equal(forecast.currency, 'INR');
    assert.equal(Number(forecast.probability), 0.5);
    assert.equal(Number(forecast.weighted_value), 500);
  }));

test('after enrollment the latest enrollment contract value and currency override lead forecast', () =>
  fixture(async ({ owner }) => {
    await owner.query(
      `insert into public.enrollments(id,lead_id,organization_id,total_value,currency,created_at)
       values($1,$2,$3,800,'USD','2026-11-02T10:00:00Z')`,
      [enrollment, lead, org],
    );
    await owner.query(
      `insert into public.lead_payment_totals_fixture(organization_id,lead_id,currency,gross_paid,refunds,net_paid)
       values($1,$2,'INR',999,0,999),($1,$2,'USD',200,0,200)`,
      [org, lead],
    );

    const revenue = (
      await owner.query(`select potential_value::text,currency,gross_paid::text,net_paid::text,
        outstanding_balance::text,payment_status from public.v_lead_revenue_status where lead_id=$1`, [lead])
    ).rows[0];
    assert.deepEqual(revenue, {
      potential_value: '800.00',
      currency: 'USD',
      gross_paid: '200.00',
      net_paid: '200.00',
      outstanding_balance: '600.00',
      payment_status: 'partially_paid',
    });

    const forecast = (
      await owner.query(`select potential_value::text,currency,probability::text,weighted_value::text
        from public.v_revenue_forecast where id=$1`, [lead])
    ).rows[0];
    assert.equal(forecast.potential_value, '800.00');
    assert.equal(forecast.currency, 'USD');
    assert.equal(Number(forecast.probability), 0.5);
    assert.equal(Number(forecast.weighted_value), 400);
  }));

test('latest enrollment wins when multiple canonical enrollments exist', () =>
  fixture(async ({ owner }) => {
    await owner.query(
      `insert into public.enrollments(id,lead_id,organization_id,total_value,currency,created_at)
       values($1,$2,$3,800,'USD','2026-11-01T10:00:00Z'),
             ($4,$2,$3,700,'INR','2026-11-03T10:00:00Z')`,
      [enrollment, lead, org, randomUUID()],
    );
    await owner.query(
      `insert into public.lead_payment_totals_fixture(organization_id,lead_id,currency,gross_paid,refunds,net_paid)
       values($1,$2,'INR',300,0,300)`,
      [org, lead],
    );
    const row = (
      await owner.query(`select potential_value::text,currency,outstanding_balance::text
        from public.v_lead_revenue_status where lead_id=$1`, [lead])
    ).rows[0];
    assert.deepEqual(row, {
      potential_value: '700.00',
      currency: 'INR',
      outstanding_balance: '400.00',
    });
  }));

test('enrolled actual revenue uses enrollment contract value even if stale lead forecast differs', () =>
  fixture(async ({ owner }) => {
    await owner.query(`update public.leads set current_stage='enrolled' where id=$1`, [lead]);
    await owner.query(
      `insert into public.enrollments(id,lead_id,organization_id,total_value,currency)
       values($1,$2,$3,750,'USD')`,
      [enrollment, lead, org],
    );
    const row = (
      await owner.query(`select potential_value::text,currency,actual_revenue::text,weighted_value::text
        from public.v_revenue_forecast where id=$1`, [lead])
    ).rows[0];
    assert.equal(row.potential_value, '750.00');
    assert.equal(row.currency, 'USD');
    assert.equal(Number(row.actual_revenue), 750);
    assert.equal(Number(row.weighted_value), 750);
  }));

test('both replaced views retain security_invoker=true', () =>
  fixture(async ({ owner }) => {
    const rows = (
      await owner.query(`select c.relname,c.reloptions from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relname in ('v_lead_revenue_status','v_revenue_forecast')
        order by c.relname`)
    ).rows;
    assert.equal(rows.length, 2);
    for (const row of rows) {
      assert.ok(row.reloptions?.includes('security_invoker=true'), `${row.relname} must remain security_invoker`);
    }
  }));
