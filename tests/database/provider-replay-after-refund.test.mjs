import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { buildRefundReadinessSql } from '../../scripts/build-refund-readiness-sandbox.mjs';

const url = new URL(process.env.SALSYS_TEST_DATABASE_URL || 'postgres://postgres:local-fixture-only@127.0.0.1:55432/postgres');
if (process.env.SALSYS_ALLOW_LOCAL_DB_TESTS !== '1' || !['127.0.0.1','localhost','[::1]'].includes(url.hostname) || url.pathname !== '/postgres') {
  throw Error('Explicit local-only disposable database test configuration is required');
}

const admin = new pg.Client({ connectionString: url.href, application_name: 'salsys-provider-replay-test-admin' });
const org = '10000000-0000-4000-8000-000000000001';
const lead = '40000000-0000-4000-8000-000000000001';
const claims = { role:'authenticated', sub:'20000000-0000-4000-8000-000000000001', session_id:'30000000-0000-4000-8000-000000000001' };
const source = buildRefundReadinessSql();
const schema = source.slice(0, source.indexOf('create temp table assertions'));
const seedStart = source.indexOf('insert into public.organizations(id) values');
const seeds = source.slice(seedStart, source.indexOf('\nset local role authenticated;', seedStart));
const enrollmentProcessorBaseline = fs.readFileSync('tests/database/process-enrollment-raw-event-v1.production-baseline.sql','utf8');

before(async () => {
  await admin.connect();
  await admin.query(`do $$ begin
    if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
  end; $$;`);
});
after(async () => { await admin.end(); });

async function authenticate(client) {
  await client.query('begin');
  await client.query('set local role authenticated');
  await client.query(`select set_config('request.jwt.claims',$1,true)`,[JSON.stringify(claims)]);
}

async function fixture(run) {
  const database = `salsys_refund_test_${randomUUID().replaceAll('-','')}`;
  assert.match(database,/^salsys_refund_test_[a-f0-9]{32}$/);
  const connection = new URL(url); connection.pathname = `/${database}`;
  const clients = [];
  await admin.query(`create database "${database}"`);
  const connect = async () => { const c = new pg.Client({connectionString:connection.href}); await c.connect(); clients.push(c); return c; };
  try {
    const owner = await connect();
    await owner.query(fs.readFileSync(new URL('./local-auth-bootstrap.sql',import.meta.url),'utf8'));
    await owner.query(`${schema}\n${seeds}\ncommit;`);
    const user = await connect();
    await authenticate(user);
    const original = (await user.query(
      `select public.verify_payment_v1($1,100,'INR','deposit','bank_transfer','provider-replay-original') as result`,[lead]
    )).rows[0].result.payment_id;
    await user.query('commit');

    // Booking identity exists before the refund. Once a linked refund exists this
    // identity is intentionally immutable, matching the real event order.
    await owner.query(`update public.payments set metadata=metadata||jsonb_build_object('booking_reference','SYN-PROVIDER-B1') where id=$1`,[original]);

    await authenticate(user);
    const refund = (await user.query(
      `select public.record_refund_v1($1,$2,10,'INR',$3,'bank_transfer','provider-replay-refund',null,'Synthetic bank return verified') as result`,
      [lead,original,randomUUID()]
    )).rows[0].result.payment_id;
    await user.query('commit');
    await run({owner,original,refund});
  } finally {
    for (const c of clients) try { await c.query('rollback'); } catch {}
    await Promise.allSettled(clients.map(c=>c.end()));
    await admin.query(`drop database "${database}"`);
  }
}

async function providerLikeReplay(owner, paymentId, { amount=100, enrollmentId=null, status='paid' }={}) {
  return owner.query(`update public.payments p set
      enrollment_id=coalesce($2::uuid,p.enrollment_id),
      payment_kind=case when p.payment_kind='other' then 'deposit'::public.payment_kind else p.payment_kind end,
      status=case when p.status='paid' then p.status else $3::public.payment_status end,
      amount=$4,
      currency='INR',
      paid_at=case when $3::public.payment_status='paid' then coalesce(p.paid_at,now()) else p.paid_at end,
      metadata=coalesce(p.metadata,'{}'::jsonb)||jsonb_build_object(
        'latest_raw_event_id','00000000-0000-4000-8000-000000000999',
        'latest_source_event_id','provider-replay',
        'booking_reference',p.metadata->>'booking_reference',
        'trusted_server_event',true),
      updated_at=now()
    where p.id=$1`,[paymentId,enrollmentId,status,amount]);
}

test('same-facts provider replay can refresh evidence after a refund without rewriting cash', () => fixture(async f => {
  const before = (await f.owner.query(`select amount::text,status::text,currency,payment_kind::text,paid_at::text from public.payments where id=$1`,[f.original])).rows[0];
  await providerLikeReplay(f.owner,f.original);
  const after = (await f.owner.query(`select amount::text,status::text,currency,payment_kind::text,paid_at::text,metadata->>'latest_source_event_id' as replay from public.payments where id=$1`,[f.original])).rows[0];
  assert.deepEqual({amount:after.amount,status:after.status,currency:after.currency,payment_kind:after.payment_kind,paid_at:after.paid_at},before);
  assert.equal(after.replay,'provider-replay');
  const totals=(await f.owner.query(`select sum(case when payment_kind='refund' then -amount else amount end)::text as cash from public.payments`)).rows[0];
  assert.equal(totals.cash,'90.00');
}));

test('conflicting provider replay cannot rewrite refunded financial truth', () => fixture(async f => {
  await assert.rejects(providerLikeReplay(f.owner,f.original,{amount:101}),/immutable/);
  await assert.rejects(f.owner.query(`update public.payments set provider='other-provider' where id=$1`,[f.original]),/immutable/);
  const row=(await f.owner.query(`select amount::text,provider,status::text from public.payments where id=$1`,[f.original])).rows[0];
  assert.deepEqual(row,{amount:'100.00',provider:'bank_transfer',status:'paid'});
}));

test('after guarded late enrollment association a same-enrollment provider replay remains idempotent', () => fixture(async f => {
  const enrollment=randomUUID(), raw=randomUUID();
  await f.owner.query(`insert into public.enrollments(id,organization_id,lead_id,currency,metadata) values($1,$2,$3,'INR',$4)`,[
    enrollment,org,lead,{booking_reference:'SYN-PROVIDER-B1',raw_event_id:raw,trusted_server_event:true}
  ]);
  const linked=(await f.owner.query(`select public.associate_booking_payments_enrollment_v1($1,$2,$3,$4,$5) as result`,[
    org,lead,enrollment,'SYN-PROVIDER-B1',raw
  ])).rows[0].result;
  assert.equal(linked.linked_records,2);
  await providerLikeReplay(f.owner,f.original,{enrollmentId:enrollment});
  const rows=(await f.owner.query(`select enrollment_id,amount::text from public.payments where id in ($1,$2) order by payment_kind`,[f.original,f.refund])).rows;
  assert.ok(rows.every(row=>row.enrollment_id===enrollment));
  assert.deepEqual(rows.map(row=>row.amount).sort(),['10.00','100.00']);
}));

test('captured enrollment processor baseline still contains the provider-association boundary being replaced', () => {
  assert.match(enrollmentProcessorBaseline,/update public\.payments p set enrollment_id=v_enrollment_id,updated_at=now\(\)/);
  assert.match(enrollmentProcessorBaseline,/p\.metadata->>'booking_reference'=v_booking_reference/);
});
