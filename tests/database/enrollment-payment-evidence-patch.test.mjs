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

const admin = new pg.Client({
  connectionString: url.href,
  application_name: 'salsys-payment-evidence-patch-admin',
});

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

create table public.leads (
  id uuid primary key,
  organization_id uuid not null
);

create or replace function public.associate_booking_payments_enrollment_v1(
  p_organization_id uuid,
  p_lead_id uuid,
  p_enrollment_id uuid,
  p_booking_reference text,
  p_raw_event_id uuid
)
returns jsonb language sql security definer set search_path=''
as $$ select jsonb_build_object('ok',true) $$;
revoke all on function public.associate_booking_payments_enrollment_v1(uuid,uuid,uuid,text,uuid)
  from public,anon,authenticated,service_role;

create or replace function public.process_enrollment_raw_event_v1(
  p_organization_id uuid,
  p_raw_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_raw record;
  v_source record;
  v_payload jsonb := '{}'::jsonb;
  v_lead_id uuid := '40000000-0000-4000-8000-000000000001'::uuid;
  v_enrollment_id uuid := '50000000-0000-4000-8000-000000000001'::uuid;
  v_enrollment_reference text := 'ENR-BOOK-1';
  v_booking_reference text := 'BOOK-1';
  v_currency text;
begin
  if v_enrollment_reference is null then raise exception 'enrollment_reference is required'; end if;

  perform 1 from public.leads where id=v_lead_id and organization_id=p_organization_id for update;
  if not found then raise exception 'enrollment lead tenant mismatch'; end if;

  v_currency := upper(nullif(btrim(v_payload->>'currency'),''));

  perform pg_advisory_xact_lock(hashtextextended('enrollment-ref:'||p_organization_id::text||':'||v_source.source_system||':'||v_enrollment_reference,0));

  perform public.associate_booking_payments_enrollment_v1(
      p_organization_id,v_lead_id,v_enrollment_id,v_booking_reference,p_raw_event_id
    );

  return jsonb_build_object('ok',true);
end;
$function$;
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
  const database = `salsys_payment_patch_test_${randomUUID().replaceAll('-', '')}`;
  assert.match(database, /^salsys_payment_patch_test_[a-f0-9]{32}$/);
  const connection = new URL(url);
  connection.pathname = `/${database}`;
  const client = new pg.Client({ connectionString: connection.href });
  await admin.query(`create database "${database}"`);
  try {
    await client.connect();
    await client.query(foundation);
    await run(client);
  } finally {
    await client.end().catch(() => {});
    await admin.query(`drop database "${database}"`);
  }
}

test('full migration patches the reviewed PostgreSQL function shape exactly once', () =>
  fixture(async (client) => {
    const before = (
      await client.query(
        `select pg_get_functiondef('public.process_enrollment_raw_event_v1(uuid,uuid)'::regprocedure) as definition`,
      )
    ).rows[0].definition;
    assert.equal((before.match(/assert_verified_payment_enrollment_v1/g) || []).length, 0);

    await client.query(migration);

    const after = (
      await client.query(
        `select pg_get_functiondef('public.process_enrollment_raw_event_v1(uuid,uuid)'::regprocedure) as definition`,
      )
    ).rows[0].definition;

    assert.equal((after.match(/assert_verified_payment_enrollment_v1/g) || []).length, 1);
    assert.match(after, /confirmation_basis',''\)\) = 'verified_payment'/);
    assert.match(after, /payment_reference/);
    assert.match(after, /payment_provider/);
    assert.equal((after.match(/associate_booking_payments_enrollment_v1/g) || []).length, 1);
    assert.match(after, /perform 1 from public\.leads where id=v_lead_id and organization_id=p_organization_id for update/);
  }));

test('processor remains service-role only and helper remains private after patch', () =>
  fixture(async (client) => {
    await client.query(migration);
    const rows = (
      await client.query(`select role_name,
        has_function_privilege(role_name,'public.process_enrollment_raw_event_v1(uuid,uuid)','EXECUTE') as processor,
        has_function_privilege(role_name,'app_private.assert_verified_payment_enrollment_v1(uuid,uuid,text,text,text,text)','EXECUTE') as helper
      from unnest(array['anon','authenticated','service_role']) role_name`)
    ).rows;

    assert.deepEqual(
      rows.map((row) => [row.role_name,row.processor,row.helper]),
      [
        ['anon',false,false],
        ['authenticated',false,false],
        ['service_role',true,false],
      ],
    );
  }));

test('migration fails closed when the reviewed association baseline is missing', () =>
  fixture(async (client) => {
    await client.query(`create or replace function public.process_enrollment_raw_event_v1(
      p_organization_id uuid,
      p_raw_event_id uuid
    ) returns jsonb language sql security definer set search_path=''
      as $$ select jsonb_build_object('ok',true) $$;`);
    await assert.rejects(
      client.query(migration),
      /Expected reviewed enrollment payment-association and lead-lock baseline|reviewed enrollment processor baseline/i,
    );
  }));
