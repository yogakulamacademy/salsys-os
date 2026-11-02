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
  .find((file) => file.endsWith('_enrollment_contract_replay_preservation_v1.sql'));
if (!migrationFile) throw Error('Missing enrollment contract replay-preservation migration');
const migration = fs.readFileSync(`supabase/migrations/${migrationFile}`, 'utf8');

const admin = new pg.Client({
  connectionString: url.href,
  application_name: 'salsys-contract-replay-test-admin',
});

const org = '10000000-0000-4000-8000-000000000001';
const lead = '40000000-0000-4000-8000-000000000001';
const adjustedEnrollment = '50000000-0000-4000-8000-000000000001';
const plainEnrollment = '50000000-0000-4000-8000-000000000002';

const foundation = `
create schema app_private authorization postgres;
create role salsys_fixture_marker nologin;

create table public.leads(
  id uuid primary key,
  organization_id uuid not null
);
create table public.enrollments(
  id uuid primary key,
  organization_id uuid not null,
  lead_id uuid not null,
  total_value numeric(14,2),
  currency text,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table public.enrollment_contract_adjustments(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  enrollment_id uuid not null
);

create or replace function app_private.assert_verified_payment_enrollment_v1(
  uuid,uuid,text,text,text,text
) returns uuid language plpgsql security definer set search_path='' as $$
begin
  return gen_random_uuid();
end;
$$;

create or replace function public.associate_booking_payments_enrollment_v1(
  uuid,uuid,uuid,text,uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  return '{}'::jsonb;
end;
$$;

create or replace function public.process_enrollment_raw_event_v1(
  p_organization_id uuid,
  p_raw_event_id uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_lead_id uuid;
  v_total_value numeric := 1000;
  v_currency text := 'USD';
  e_row public.enrollments%rowtype;
begin
  select e.lead_id into v_lead_id
  from public.enrollments e
  where e.id=p_raw_event_id and e.organization_id=p_organization_id;
  if v_lead_id is null then raise exception 'fixture enrollment missing'; end if;

  perform app_private.assert_verified_payment_enrollment_v1(
    p_organization_id,v_lead_id,'BOOK-1','PAY-1','provider','USD'
  );
  perform public.associate_booking_payments_enrollment_v1(
    p_organization_id,v_lead_id,p_raw_event_id,'BOOK-1',p_raw_event_id
  );
  perform 1 from public.leads where id=v_lead_id and organization_id=p_organization_id for update;

  update public.enrollments e set
      total_value=coalesce(v_total_value,e.total_value),
      currency=coalesce(v_currency,e.currency),
      metadata=coalesce(e.metadata,'{}'::jsonb)||jsonb_build_object('replayed',true),
      updated_at=now()
  where e.id=p_raw_event_id and e.organization_id=p_organization_id
  returning e.* into e_row;

  return jsonb_build_object(
    'total_value',e_row.total_value,
    'currency',e_row.currency,
    'replayed',e_row.metadata->>'replayed'
  );
end;
$function$;

revoke all on function public.process_enrollment_raw_event_v1(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.process_enrollment_raw_event_v1(uuid,uuid)
  to service_role;
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

async function fixture(run, { drift = false } = {}) {
  const database = `salsys_contract_replay_test_${randomUUID().replaceAll('-', '')}`;
  assert.match(database, /^salsys_contract_replay_test_[a-f0-9]{32}$/);
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
    await owner.query(foundation.replace(
      drift ? 'total_value=coalesce(v_total_value,e.total_value),' : '__NO_DRIFT__',
      drift ? 'total_value=case when v_total_value is null then e.total_value else v_total_value end,' : '__NO_DRIFT__',
    ).replaceAll('__NO_DRIFT__', ''));
    await owner.query(
      `insert into public.leads(id,organization_id) values($1,$2)`,
      [lead, org],
    );
    await owner.query(
      `insert into public.enrollments(id,organization_id,lead_id,total_value,currency)
       values($1,$2,$3,800,'INR'),($4,$2,$3,700,'INR')`,
      [adjustedEnrollment, org, lead, plainEnrollment],
    );
    await owner.query(
      `insert into public.enrollment_contract_adjustments(organization_id,enrollment_id)
       values($1,$2)`,
      [org, adjustedEnrollment],
    );
    await run({ owner });
  } finally {
    for (const client of clients) await client.query('rollback').catch(() => {});
    await Promise.allSettled(clients.map((client) => client.end()));
    await admin.query(`drop database "${database}"`);
  }
}

test('trusted replay preserves governed contract value/currency but refreshes non-contract evidence', () =>
  fixture(async ({ owner }) => {
    await owner.query(migration);

    const adjusted = (
      await owner.query(
        `select public.process_enrollment_raw_event_v1($1,$2) as result`,
        [org, adjustedEnrollment],
      )
    ).rows[0].result;
    assert.equal(Number(adjusted.total_value), 800);
    assert.equal(adjusted.currency, 'INR');
    assert.equal(adjusted.replayed, 'true');

    const plain = (
      await owner.query(
        `select public.process_enrollment_raw_event_v1($1,$2) as result`,
        [org, plainEnrollment],
      )
    ).rows[0].result;
    assert.equal(Number(plain.total_value), 1000);
    assert.equal(plain.currency, 'USD');
    assert.equal(plain.replayed, 'true');

    const source = (
      await owner.query(
        `select pg_get_functiondef('public.process_enrollment_raw_event_v1(uuid,uuid)'::regprocedure) as definition`,
      )
    ).rows[0].definition;
    assert.match(source, /from public\.enrollment_contract_adjustments a/);
    assert.match(source, /then e\.total_value/);
    assert.match(source, /then e\.currency/);

    const privileges = (
      await owner.query(`select role_name,
        has_function_privilege(role_name,'public.process_enrollment_raw_event_v1(uuid,uuid)','EXECUTE') as can_execute
        from unnest(array['anon','authenticated','service_role']) role_name`)
    ).rows;
    assert.deepEqual(
      privileges.map((row) => [row.role_name, row.can_execute]),
      [['anon', false], ['authenticated', false], ['service_role', true]],
    );
  }));

test('migration fails closed when the reviewed total-value update anchor has drifted', () =>
  fixture(
    async ({ owner }) => {
      await assert.rejects(
        owner.query(migration),
        /Expected reviewed enrollment association\/payment-evidence baseline before contract replay preservation/,
      );
      const source = (
        await owner.query(
          `select pg_get_functiondef('public.process_enrollment_raw_event_v1(uuid,uuid)'::regprocedure) as definition`,
        )
      ).rows[0].definition;
      assert.doesNotMatch(source, /from public\.enrollment_contract_adjustments a/);
    },
    { drift: true },
  ));
