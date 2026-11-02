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
  .find((file) => file.endsWith('_enrollment_contract_adjustments_v1.sql'));
if (!migrationFile) throw Error('Missing enrollment contract-adjustment migration');
const migration = fs.readFileSync(`supabase/migrations/${migrationFile}`, 'utf8');

const admin = new pg.Client({
  connectionString: url.href,
  application_name: 'salsys-contract-adjustment-test-admin',
});

const org = '10000000-0000-4000-8000-000000000001';
const otherOrg = '10000000-0000-4000-8000-000000000002';
const userId = '20000000-0000-4000-8000-000000000001';
const otherUserId = '20000000-0000-4000-8000-000000000002';
const lead = '40000000-0000-4000-8000-000000000001';
const enrollment = '50000000-0000-4000-8000-000000000001';
const emptyEnrollment = '50000000-0000-4000-8000-000000000002';

const foundation = `
create type public.actor_type as enum ('lead','human','ai','automation','system');
create type public.payment_kind as enum ('deposit','balance','full','refund','other');
create type public.payment_status as enum ('pending','paid','failed','refunded','partially_refunded');

create table public.organizations(
  id uuid primary key
);
create table public.leads(
  id uuid primary key,
  organization_id uuid not null references public.organizations(id)
);
create table public.enrollments(
  id uuid primary key,
  organization_id uuid not null references public.organizations(id),
  lead_id uuid not null references public.leads(id),
  total_value numeric(14,2),
  currency text,
  updated_at timestamptz not null default now()
);
create table public.payments(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  lead_id uuid not null references public.leads(id),
  enrollment_id uuid references public.enrollments(id),
  payment_kind public.payment_kind not null,
  status public.payment_status not null,
  amount numeric(14,2) not null,
  currency text not null,
  provider text,
  external_payment_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.activities(
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id),
  activity_type text not null,
  actor_type public.actor_type not null default 'human',
  actor_id text,
  title text,
  details text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create or replace function public.organization_has_capability(p_organization_id uuid, p_capability text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_capability='education_core'
    and p_organization_id::text = auth.jwt()->>'org_id';
$$;
create or replace function public.is_organization_member(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and p_organization_id::text = auth.jwt()->>'org_id';
$$;
create or replace function public.can_mutate_organization(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and p_organization_id::text = auth.jwt()->>'org_id';
$$;
create or replace function public.has_organization_role(p_organization_id uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and p_organization_id::text = auth.jwt()->>'org_id'
    and (auth.jwt()->>'org_role') = any(p_roles);
$$;
create or replace function public.can_access_lead(p_lead_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists(
    select 1 from public.leads l
    where l.id=p_lead_id
      and l.organization_id::text = auth.jwt()->>'org_id'
  );
$$;

revoke all on function public.organization_has_capability(uuid,text) from public,anon;
revoke all on function public.is_organization_member(uuid) from public,anon;
revoke all on function public.can_mutate_organization(uuid) from public,anon;
revoke all on function public.has_organization_role(uuid,text[]) from public,anon;
revoke all on function public.can_access_lead(uuid) from public,anon;
grant execute on function public.organization_has_capability(uuid,text) to authenticated,service_role;
grant execute on function public.is_organization_member(uuid) to authenticated,service_role;
grant execute on function public.can_mutate_organization(uuid) to authenticated,service_role;
grant execute on function public.has_organization_role(uuid,text[]) to authenticated,service_role;
grant execute on function public.can_access_lead(uuid) to authenticated,service_role;

grant select on public.leads,public.enrollments,public.payments,public.activities to authenticated;
grant update on public.enrollments to authenticated;
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

function claims({ user = userId, organization = org, role = 'owner' } = {}) {
  return { role: 'authenticated', sub: user, org_id: organization, org_role: role };
}

async function fixture(run, { seedPayment = true } = {}) {
  const database = `salsys_contract_adjustment_test_${randomUUID().replaceAll('-', '')}`;
  assert.match(database, /^salsys_contract_adjustment_test_[a-f0-9]{32}$/);
  const connection = new URL(url);
  connection.pathname = `/${database}`;
  const clients = [];
  await admin.query(`create database "${database}"`);

  const connect = async (applicationName = 'salsys-contract-adjustment-test') => {
    const client = new pg.Client({ connectionString: connection.href, application_name: applicationName });
    await client.connect();
    clients.push(client);
    return client;
  };

  try {
    const owner = await connect('salsys-contract-adjustment-owner');
    await owner.query(fs.readFileSync(new URL('./local-auth-bootstrap.sql', import.meta.url), 'utf8'));
    await owner.query(foundation);
    await owner.query(migration);
    await owner.query(
      `insert into public.organizations(id) values($1),($2)`,
      [org, otherOrg],
    );
    await owner.query(
      `insert into public.leads(id,organization_id) values($1,$2)`,
      [lead, org],
    );
    await owner.query(
      `insert into public.enrollments(id,organization_id,lead_id,total_value,currency)
       values($1,$2,$3,1000,'USD'),($4,$2,$3,null,null)`,
      [enrollment, org, lead, emptyEnrollment],
    );
    if (seedPayment) {
      await owner.query(
        `insert into public.payments(
          organization_id,lead_id,enrollment_id,payment_kind,status,amount,currency,provider,external_payment_id
        ) values($1,$2,$3,'deposit','paid',700,'USD','paypal','PAY-BASE')`,
        [org, lead, enrollment],
      );
    }
    await run({ owner, connect });
  } finally {
    for (const client of clients) await client.query('rollback').catch(() => {});
    await Promise.allSettled(clients.map((client) => client.end()));
    await admin.query(`drop database "${database}"`);
  }
}

async function asAuthenticated(client, callback, customClaims = claims()) {
  await client.query('begin');
  try {
    await client.query('set local role authenticated');
    await client.query(`select set_config('request.jwt.claims',$1,true)`, [JSON.stringify(customClaims)]);
    const result = await callback();
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

async function adjust(
  client,
  {
    enrollmentId = enrollment,
    type = 'discount',
    newTotal = 900,
    reason = 'Approved launch discount',
    key = 'ADJ-1',
    metadata = { source: 'test' },
  } = {},
  customClaims = claims(),
) {
  return asAuthenticated(
    client,
    async () => (
      await client.query(
        `select public.apply_enrollment_contract_adjustment_v1($1,$2,$3,$4,$5,$6,$7::jsonb) as result`,
        [org, enrollmentId, type, newTotal, reason, key, JSON.stringify(metadata)],
      )
    ).rows[0].result,
    customClaims,
  );
}

test('discount changes contract value atomically, records append-only audit, and leaves cash unchanged', () =>
  fixture(async ({ owner, connect }) => {
    const user = await connect();
    const paymentsBefore = (await owner.query(`select to_jsonb(p) as row from public.payments p order by id`)).rows;

    const result = await adjust(user, {
      metadata: { source: 'test', cash_changed: true, adjustment_type: 'spoofed' },
    });
    assert.equal(result.ok, true);
    assert.equal(result.replayed, false);
    assert.equal(result.previous_total_value, 1000);
    assert.equal(result.new_total_value, 900);
    assert.equal(result.amount_delta, -100);
    assert.equal(result.cash_changed, false);

    const enrollmentRow = (
      await owner.query(`select total_value::text,currency from public.enrollments where id=$1`, [enrollment])
    ).rows[0];
    assert.deepEqual(enrollmentRow, { total_value: '900.00', currency: 'USD' });

    const adjustmentRow = (
      await owner.query(`select adjustment_type,previous_total_value::text,new_total_value::text,
        amount_delta::text,currency,reason,actor_user_id::text,metadata
        from public.enrollment_contract_adjustments where enrollment_id=$1`, [enrollment])
    ).rows[0];
    assert.equal(adjustmentRow.adjustment_type, 'discount');
    assert.equal(adjustmentRow.previous_total_value, '1000.00');
    assert.equal(adjustmentRow.new_total_value, '900.00');
    assert.equal(adjustmentRow.amount_delta, '-100.00');
    assert.equal(adjustmentRow.currency, 'USD');
    assert.equal(adjustmentRow.actor_user_id, userId);

    const activity = (
      await owner.query(`select activity_type,actor_type::text,actor_id,metadata
        from public.activities where activity_type='contract_value_adjusted'`)
    ).rows[0];
    assert.equal(activity.actor_type, 'human');
    assert.equal(activity.actor_id, userId);
    assert.equal(activity.metadata.cash_changed, false);
    assert.equal(activity.metadata.adjustment_type, 'discount');
    assert.equal(activity.metadata.source, 'test');

    const paymentsAfter = (await owner.query(`select to_jsonb(p) as row from public.payments p order by id`)).rows;
    assert.deepEqual(paymentsAfter, paymentsBefore);
    assert.equal(
      Number((await owner.query(`select count(*) from app_private.enrollment_contract_value_authorizations`)).rows[0].count),
      0,
    );
  }));

test('idempotent replay creates no second adjustment or activity and key reuse with different facts is rejected', () =>
  fixture(async ({ owner, connect }) => {
    const user = await connect();
    const first = await adjust(user);
    const replay = await adjust(user);
    assert.equal(replay.replayed, true);
    assert.equal(replay.adjustment_id, first.adjustment_id);
    assert.equal(
      Number((await owner.query(`select count(*) from public.enrollment_contract_adjustments`)).rows[0].count),
      1,
    );
    assert.equal(
      Number((await owner.query(`select count(*) from public.activities where activity_type='contract_value_adjusted'`)).rows[0].count),
      1,
    );
    await assert.rejects(
      adjust(user, { newTotal: 850 }),
      /Idempotency key is already bound to a different contract adjustment/,
    );
  }));

test('baseline may initialize once, but later direct value changes and currency changes are blocked', () =>
  fixture(async ({ owner }) => {
    await owner.query(`update public.enrollments set total_value=500,currency='USD' where id=$1`, [emptyEnrollment]);
    const initialized = (
      await owner.query(`select total_value::text,currency from public.enrollments where id=$1`, [emptyEnrollment])
    ).rows[0];
    assert.deepEqual(initialized, { total_value: '500.00', currency: 'USD' });

    await assert.rejects(
      owner.query(`update public.enrollments set total_value=550 where id=$1`, [emptyEnrollment]),
      /Enrollment contract value is governed/,
    );
    await assert.rejects(
      owner.query(`update public.enrollments set currency='INR' where id=$1`, [emptyEnrollment]),
      /Enrollment contract currency is immutable once set/,
    );
  }));

test('source-style replay cannot overwrite an approved adjusted contract value', () =>
  fixture(async ({ owner, connect }) => {
    const user = await connect();
    await adjust(user, { newTotal: 850, key: 'ADJ-REPLAY-GUARD' });
    await assert.rejects(
      owner.query(`update public.enrollments set total_value=1000 where id=$1`, [enrollment]),
      /Enrollment contract value is governed/,
    );
    assert.equal(
      (await owner.query(`select total_value::text from public.enrollments where id=$1`, [enrollment])).rows[0].total_value,
      '850.00',
    );
  }));

test('scholarship, discount and fee waiver cannot increase value while an approved price change can', () =>
  fixture(async ({ owner, connect }) => {
    const user = await connect();
    for (const [index, type] of ['scholarship', 'discount', 'fee_waiver'].entries()) {
      await assert.rejects(
        adjust(user, { type, newTotal: 1100, key: `ADJ-UP-${index}` }),
        new RegExp(`${type} cannot increase the contract value`),
      );
    }
    const priceChange = await adjust(user, {
      type: 'price_change',
      newTotal: 1100,
      key: 'ADJ-PRICE-UP',
      reason: 'Approved package upgrade',
    });
    assert.equal(priceChange.amount_delta, 100);
    assert.equal(
      (await owner.query(`select total_value::text from public.enrollments where id=$1`, [enrollment])).rows[0].total_value,
      '1100.00',
    );
  }));

test('owner/admin approval and an existing baseline contract are required', () =>
  fixture(async ({ connect }) => {
    const user = await connect();
    await assert.rejects(
      adjust(user, {}, claims({ role: 'member' })),
      /Not authorized to adjust enrollment contract value/,
    );
    await assert.rejects(
      adjust(user, { enrollmentId: emptyEnrollment, key: 'ADJ-NO-BASE' }),
      /Set the baseline enrollment contract value before recording an adjustment/,
    );
  }));

test('overpayment is reported for review without creating a refund or changing cash', () =>
  fixture(async ({ owner, connect }) => {
    await owner.query(`update public.payments set amount=1000 where enrollment_id=$1`, [enrollment]);
    const user = await connect();
    const result = await adjust(user, {
      type: 'scholarship',
      newTotal: 800,
      key: 'ADJ-OVERPAID',
      reason: 'Approved scholarship after payment',
    });
    assert.equal(result.linked_net_paid, 1000);
    assert.equal(result.overpaid_by, 200);
    assert.equal(result.overpayment_review_required, true);
    assert.equal(result.cash_changed, false);
    const paymentRows = (
      await owner.query(`select payment_kind::text,status::text,amount::text from public.payments order by created_at`)
    ).rows;
    assert.deepEqual(paymentRows, [{ payment_kind: 'deposit', status: 'paid', amount: '1000.00' }]);
  }));

test('adjustment ledger is append-only and direct API writes are not granted', () =>
  fixture(async ({ owner, connect }) => {
    const user = await connect();
    const result = await adjust(user, { key: 'ADJ-IMMUTABLE' });
    await assert.rejects(
      owner.query(`update public.enrollment_contract_adjustments set reason='tampered' where id=$1`, [result.adjustment_id]),
      /Enrollment contract adjustments are append-only/,
    );
    await assert.rejects(
      owner.query(`delete from public.enrollment_contract_adjustments where id=$1`, [result.adjustment_id]),
      /Enrollment contract adjustments are append-only/,
    );

    const privileges = (
      await owner.query(`select role_name,
        has_table_privilege(role_name,'public.enrollment_contract_adjustments','INSERT') as can_insert,
        has_table_privilege(role_name,'public.enrollment_contract_adjustments','UPDATE') as can_update,
        has_table_privilege(role_name,'public.enrollment_contract_adjustments','DELETE') as can_delete,
        has_function_privilege(
          role_name,
          'public.apply_enrollment_contract_adjustment_v1(uuid,uuid,text,numeric,text,text,jsonb)',
          'EXECUTE'
        ) as can_execute
      from unnest(array['anon','authenticated','service_role']) role_name`)
    ).rows;
    assert.deepEqual(
      privileges.map((row) => [row.role_name, row.can_insert, row.can_update, row.can_delete, row.can_execute]),
      [
        ['anon', false, false, false, false],
        ['authenticated', false, false, false, true],
        ['service_role', false, false, false, false],
      ],
    );
  }));

test('RLS exposes adjustment history only to the bound organization member', () =>
  fixture(async ({ connect }) => {
    const user = await connect();
    await adjust(user, { key: 'ADJ-RLS' });

    const visible = await asAuthenticated(
      user,
      async () => (
        await user.query(`select count(*)::integer as rows from public.enrollment_contract_adjustments`)
      ).rows[0].rows,
    );
    assert.equal(visible, 1);

    const other = await connect();
    const hidden = await asAuthenticated(
      other,
      async () => (
        await other.query(`select count(*)::integer as rows from public.enrollment_contract_adjustments`)
      ).rows[0].rows,
      claims({ user: otherUserId, organization: otherOrg, role: 'owner' }),
    );
    assert.equal(hidden, 0);
  }));

test('concurrent approved adjustments serialize and the second records the first result as its baseline', () =>
  fixture(async ({ owner, connect }) => {
    const a = await connect('salsys-contract-adjustment-a');
    const b = await connect('salsys-contract-adjustment-b');

    await a.query('begin');
    await a.query('set local role authenticated');
    await a.query(`select set_config('request.jwt.claims',$1,true)`, [JSON.stringify(claims())]);
    const first = (
      await a.query(
        `select public.apply_enrollment_contract_adjustment_v1($1,$2,'discount',900,'First approval','ADJ-CONCURRENT-A','{}'::jsonb) as result`,
        [org, enrollment],
      )
    ).rows[0].result;
    assert.equal(first.previous_total_value, 1000);

    await b.query('begin');
    await b.query('set local role authenticated');
    await b.query(`select set_config('request.jwt.claims',$1,true)`, [JSON.stringify(claims())]);
    const secondPromise = b.query(
      `select public.apply_enrollment_contract_adjustment_v1($1,$2,'discount',850,'Second approval','ADJ-CONCURRENT-B','{}'::jsonb) as result`,
      [org, enrollment],
    );

    await new Promise((resolve) => setTimeout(resolve, 100));
    const blockers = (
      await owner.query(`select pg_blocking_pids(pid) as blockers from pg_stat_activity
        where application_name='salsys-contract-adjustment-b' and state<>'idle' order by pid desc limit 1`)
    ).rows[0]?.blockers || [];
    assert.ok(blockers.length >= 1, 'second adjustment should wait for the lead/enrollment lock');

    await a.query('commit');
    const second = (await secondPromise).rows[0].result;
    await b.query('commit');
    assert.equal(second.previous_total_value, 900);
    assert.equal(second.new_total_value, 850);
    assert.equal(second.amount_delta, -50);

    const rows = (
      await owner.query(`select previous_total_value::text,new_total_value::text,amount_delta::text
        from public.enrollment_contract_adjustments order by created_at,id`)
    ).rows;
    assert.deepEqual(rows, [
      { previous_total_value: '1000.00', new_total_value: '900.00', amount_delta: '-100.00' },
      { previous_total_value: '900.00', new_total_value: '850.00', amount_delta: '-50.00' },
    ]);
  }));
