import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {buildRefundReadinessSql} from '../../scripts/build-refund-readiness-sandbox.mjs';

// No production credentials or remote project connections are accepted here.
const url=new URL(process.env.SALSYS_TEST_DATABASE_URL||'postgres://postgres:local-fixture-only@127.0.0.1:55432/postgres');
if(process.env.SALSYS_ALLOW_LOCAL_DB_TESTS!=='1'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.pathname!=='/postgres')throw Error('Explicit local-only disposable database test configuration is required');
const admin=new pg.Client({connectionString:url.href,application_name:'salsys-refund-test-admin'});
const claims={role:'authenticated',sub:'20000000-0000-4000-8000-000000000001',session_id:'30000000-0000-4000-8000-000000000001'};
const lead='40000000-0000-4000-8000-000000000001',otherLead='40000000-0000-4000-8000-000000000003';
const source=buildRefundReadinessSql();
const schema=source.slice(0,source.indexOf('create temp table assertions'));
const seedStart=source.indexOf('insert into public.organizations(id) values');
const seeds=source.slice(seedStart,source.indexOf('\nset local role authenticated;',seedStart));
assert.ok(seedStart>0&&seeds.length>100,'Source fixture seeds must be present');
before(async()=>{
  await admin.connect();
  await admin.query(`do $$ begin
    if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
  end; $$;`);
});
after(async()=>{await admin.end();});

async function fixture(run,{empty=false}={}) {
  const database=`salsys_refund_test_${randomUUID().replaceAll('-','')}`;
  assert.match(database,/^salsys_refund_test_[a-f0-9]{32}$/);
  const connection=new URL(url);connection.pathname=`/${database}`;
  const clients=[];
  await admin.query(`create database "${database}"`);
  const connect=async()=>{const c=new pg.Client({connectionString:connection.href,application_name:'salsys-refund-test-session'});await c.connect();clients.push(c);return c;};
  try {
    const observer=await connect();
    await observer.query(fs.readFileSync(new URL('./local-auth-bootstrap.sql',import.meta.url),'utf8'));
    if(empty){await run({observer});return;}
    await observer.query(`${schema}\n${seeds}\ncommit;`);
    const a=await connect(),b=await connect();
    await begin(a);const original=(await a.query(`select public.verify_payment_v1($1,100,'INR','deposit','bank_transfer','original-1') as result`,[lead])).rows[0].result.payment_id;
    const second=(await a.query(`select public.verify_payment_v1($1,100,'INR','balance','bank_transfer','original-2') as result`,[lead])).rows[0].result.payment_id;
    const other=(await a.query(`select public.verify_payment_v1($1,100,'INR','deposit','bank_transfer','original-3') as result`,[otherLead])).rows[0].result.payment_id;
    await a.query('commit');
    await run({a,b,observer,original,second,other});
  } finally {
    for(const c of clients)try{await c.query('rollback');}catch{}
    await Promise.allSettled(clients.map(c=>c.end()));
    // Only the random database created above is ever dropped.
    await admin.query(`drop database "${database}"`);
    assert.equal((await admin.query('select count(*)::integer as count from pg_database where datname=$1',[database])).rows[0].count,0);
  }
}
async function begin(client,isolation='read committed') {
  assert.ok(['read committed','repeatable read','serializable'].includes(isolation));
  await client.query(`begin isolation level ${isolation}`);
  await client.query(`set local role authenticated; set local statement_timeout='8s'; set local lock_timeout='5s'`);
  await client.query(`select set_config('request.jwt.claims',$1,true)`,[JSON.stringify(claims)]);
}
function refund(client,original,{amount=60,key=randomUUID(),reference=null,leadId=lead,note='Synthetic bank return verified'}={}) {
  return client.query(`select public.record_refund_v1($1,$2,$3,'INR',$4,'bank_transfer',$5,null,$6) as result`,[leadId,original,amount,key,reference,note]).then(r=>r.rows[0].result);
}
async function waitBlocked(observer,blocked,blocker) {
  const deadline=Date.now()+3000;
  while(Date.now()<deadline) {
    const {rows}=await observer.query('select $1::integer=any(pg_blocking_pids($2::integer)) as blocked',[blocker.processID,blocked.processID]);
    if(rows[0].blocked)return;
    await new Promise(resolve=>setTimeout(resolve,15));
  }
  throw Error('The competing connection did not actually wait on the first transaction');
}
async function race(f,original,aArgs,bArgs,{rollbackFirst=false,isolation='read committed'}={}) {
  await begin(f.a);await begin(f.b,isolation);
  if(isolation!=='read committed')await f.b.query('select count(*) from public.payments');
  const first=await refund(f.a,original,aArgs);
  // Attach both handlers immediately so an expected database rejection is not unhandled.
  const waiting=refund(f.b,bArgs?.original??original,bArgs).then(value=>({value}),error=>({error}));
  await waitBlocked(f.observer,f.b,f.a);
  await f.a.query(rollbackFirst?'rollback':'commit');
  const second=await waiting;
  await f.b.query(second.error?'rollback':'commit');
  return {first,...second};
}
async function totals(observer) {
  return (await observer.query(`select
    (select count(*)::integer from public.payments where payment_kind='refund') as refunds,
    (select coalesce(sum(amount),0)::text from public.payments where payment_kind='refund') as returned,
    (select count(*)::integer from public.activities where activity_type='refund_recorded') as audits`)).rows[0];
}

test('simultaneous identical requests produce one refund and one audit',async()=>fixture(async f=>{
  const key=randomUUID();const r=await race(f,f.original,{key},{key});
  assert.equal(r.error,undefined);assert.equal(r.value.replayed,true);assert.equal(r.first.payment_id,r.value.payment_id);
  assert.deepEqual(await totals(f.observer),{refunds:1,returned:'60.00',audits:1});
}));
test('two competing refunds cannot spend the same remaining amount',async()=>fixture(async f=>{
  const r=await race(f,f.original,{},{});assert.match(r.error?.message??'',/exceeds/);
  assert.deepEqual(await totals(f.observer),{refunds:1,returned:'60.00',audits:1});
}));
test('concurrent changed payload cannot reuse a request key',async()=>fixture(async f=>{
  const key=randomUUID();const r=await race(f,f.original,{key},{key,amount:61});assert.match(r.error?.message??'',/conflicts/);
  assert.equal((await totals(f.observer)).refunds,1);
}));
test('reference retries from two forms return the same financial transaction',async()=>fixture(async f=>{
  const r=await race(f,f.original,{reference:'return-1'},{reference:'return-1'});
  assert.equal(r.error,undefined);assert.equal(r.value.payment_id,r.first.payment_id);
  assert.deepEqual(await totals(f.observer),{refunds:1,returned:'60.00',audits:1});
}));
test('rollback of the first writer lets the waiting request complete once',async()=>fixture(async f=>{
  const r=await race(f,f.original,{}, {},{rollbackFirst:true});assert.equal(r.error,undefined);assert.equal(r.value.replayed,false);
  assert.deepEqual(await totals(f.observer),{refunds:1,returned:'60.00',audits:1});
}));
for(const isolation of ['repeatable read','serializable'])test(`${isolation} stale snapshot must retry and cannot over-refund`,async()=>fixture(async f=>{
  const r=await race(f,f.original,{}, {},{isolation});assert.equal(r.error?.code,'40001');
  await begin(f.b);await assert.rejects(refund(f.b,f.original),/exceeds/);await f.b.query('rollback');
  await begin(f.b);await refund(f.b,f.original,{amount:40});await f.b.query('commit');
  assert.deepEqual(await totals(f.observer),{refunds:2,returned:'100.00',audits:2});
}));
test('same key cannot refund a second original payment',async()=>fixture(async f=>{
  const key=randomUUID();const r=await race(f,f.original,{key},{key,original:f.second});assert.match(r.error?.message??'',/conflicts/);
  assert.equal((await totals(f.observer)).refunds,1);
}));
test('original payment mutation waiting on a refund cannot rewrite financial truth',async()=>fixture(async f=>{
  await begin(f.a);await begin(f.b);await refund(f.a,f.original);
  const waiting=f.b.query('update public.payments set amount=1 where id=$1',[f.original]).then(value=>({value}),error=>({error}));
  await waitBlocked(f.observer,f.b,f.a);await f.a.query('commit');
  const result=await waiting;assert.match(result.error?.message??'',/immutable/);await f.b.query('rollback');
  assert.equal((await f.observer.query('select amount::text from public.payments where id=$1',[f.original])).rows[0].amount,'100.00');
}));
test('a key acknowledged through reference replay cannot later change its meaning',async()=>fixture(async f=>{
  await begin(f.a);await refund(f.a,f.original,{amount:10,reference:'return-alias'});await f.a.query('commit');
  const alias=randomUUID();await begin(f.b);
  assert.equal((await refund(f.b,f.original,{amount:10,key:alias,reference:'return-alias'})).replayed,true);await f.b.query('commit');
  await begin(f.b);await assert.rejects(refund(f.b,f.original,{amount:1,key:alias,reference:'different-return'}),/conflicts/);await f.b.query('rollback');
  assert.deepEqual(await totals(f.observer),{refunds:1,returned:'10.00',audits:1});
}));
test('one alias key cannot be bound to different refunds on different leads',async()=>fixture(async f=>{
  await begin(f.a);await refund(f.a,f.original,{amount:10,reference:'lead-a-return'});
  await refund(f.a,f.other,{amount:10,reference:'lead-b-return',leadId:otherLead});await f.a.query('commit');
  const key=randomUUID();const r=await race(f,f.original,{amount:10,key,reference:'lead-a-return'},{amount:10,key,reference:'lead-b-return',leadId:otherLead,original:f.other});
  assert.match(r.error?.message??'',/conflicts/);
  assert.deepEqual(await totals(f.observer),{refunds:2,returned:'20.00',audits:2});
  assert.equal((await f.observer.query('select count(*)::integer as count from public.payment_refund_requests where request_id=$1',[key])).rows[0].count,1);
}));
test('request bindings are hidden from browser/API roles and never become new cash',async()=>fixture(async f=>{
  await begin(f.a);await refund(f.a,f.original,{amount:10,reference:'binding-test'});await f.a.query('commit');
  const {rows}=await f.observer.query(`select has_table_privilege('anon','public.payment_refund_requests','SELECT') as anon_read,
    has_table_privilege('authenticated','public.payment_refund_requests','SELECT,INSERT,UPDATE,DELETE') as browser_access`);
  assert.equal(rows[0].anon_read,false);assert.equal(rows[0].browser_access,false);
  assert.deepEqual(await totals(f.observer),{refunds:1,returned:'10.00',audits:1});
}));
test('audit failure rolls back the refund, its request binding and parent row update',async()=>fixture(async f=>{
  const before=(await f.observer.query('select updated_at::text from public.payments where id=$1',[f.original])).rows[0].updated_at;
  await f.observer.query(`create function public.fixture_fail_audit() returns trigger language plpgsql as $$
    begin if new.activity_type='refund_recorded' then raise exception 'synthetic audit failure';end if;return new;end;$$;
    create trigger fixture_fail_audit before insert on public.activities for each row execute function public.fixture_fail_audit();`);
  await begin(f.a);await assert.rejects(refund(f.a,f.original),/synthetic audit failure/);await f.a.query('rollback');
  assert.deepEqual(await totals(f.observer),{refunds:0,returned:'0',audits:0});
  assert.equal((await f.observer.query('select count(*)::integer as count from public.payment_refund_requests')).rows[0].count,0);
  assert.equal((await f.observer.query('select updated_at::text from public.payments where id=$1',[f.original])).rows[0].updated_at,before);
}));
test('the existing forty-assertion rollback-only database fixture still passes',async()=>fixture(async({observer})=>{
  const results=await observer.query(source),last=results.at(-1).rows[0];
  assert.equal(last.assertions_completed,40);assert.equal(last.rollback_verified,true);
  assert.equal((await observer.query("select to_regclass('public.payment_refund_requests') is null as absent")).rows[0].absent,true);
},{empty:true}));
