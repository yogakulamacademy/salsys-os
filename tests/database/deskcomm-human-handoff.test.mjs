import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

// The same independent, disposable-local Postgres boundary as other financial
// / concurrency fixtures. NEVER use this with a remote or production database.
const url = new URL(
  process.env.SALSYS_TEST_DATABASE_URL ||
  'postgres://postgres:local-fixture-only@127.0.0.1:55432/postgres',
);
if (
  process.env.SALSYS_ALLOW_LOCAL_DB_TESTS !== '1' ||
  !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
  url.pathname !== '/postgres'
) {
  throw Error('Explicit local-only disposable database test configuration required');
}

const migration = fs.readFileSync(
  'supabase/migrations/20261116094500_deskcomm_human_handoff_task_v1.sql',
  'utf8',
);
const admin = new pg.Client({ connectionString: url.href, application_name: 'salsys-handoff-admin' });

const org = '11000000-0000-4000-8000-000000000001';
const otherOrg = '11000000-0000-4000-8000-000000000002';
const actor = '22000000-0000-4000-8000-000000000001';
const assignee = '22000000-0000-4000-8000-000000000002';
const otherOwner = '22000000-0000-4000-8000-000000000003';
const lead = '33000000-0000-4000-8000-000000000001';
const conversation = '44000000-0000-4000-8000-000000000001';
const event = '55000000-0000-4000-8000-000000000001';
const eventStop = '55000000-0000-4000-8000-000000000002';
const enrollment = '66000000-0000-4000-8000-000000000001';

const foundation = `
create schema auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;

create table public.organizations (id uuid primary key);
create table public.profiles (id uuid primary key,active boolean not null default true);
create table public.organization_members (
  organization_id uuid not null,user_id uuid not null,
  role text not null,active boolean not null default true
);
create table public.organization_workspaces (
  organization_id uuid not null,workspace_code text not null,
  enabled boolean not null
);
create table public.workspace_memberships (
  organization_id uuid not null,workspace_code text not null,
  user_id uuid not null,role text not null,active boolean not null
);
create or replace function public.has_organization_role(
  p_organization_id uuid,p_roles text[]
) returns boolean language sql security definer stable
set search_path=public,auth,pg_temp as $$
  select exists(
    select 1 from public.organization_members om
    where om.organization_id = p_organization_id
      and om.user_id = auth.uid()
      and om.active = true
      and om.role = any(p_roles)
  );
$$;

create table public.leads (
  id uuid primary key,organization_id uuid not null,
  next_followup_at timestamptz
);
create table public.conversations (
  id uuid primary key,organization_id uuid not null,
  lead_id uuid not null,channel text not null,
  external_account_id text,external_conversation_id text
);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,lead_id uuid not null,
  conversation_id uuid not null,external_message_id text,direction text
);
create table public.whatsapp_crm_message_links (
  organization_id uuid not null,lead_id uuid not null,
  conversation_id uuid not null,external_message_id text not null
);
create table public.raw_events (
  id uuid primary key,organization_id uuid not null,
  source_system text not null,source_event_type text not null,
  ingestion_method text not null,external_message_id text,
  source_account_id text,source_subject_id text,
  metadata jsonb not null default '{}'::jsonb,
  unique (organization_id,id)
);
create type public.task_type as enum ('follow_up','call','payment_check','human_review','other');
create type public.task_status as enum ('open','completed','cancelled','snoozed');
create type public.actor_type as enum ('lead','human','ai','automation','system');
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,lead_id uuid not null,
  task_type public.task_type,title text,description text,
  status public.task_status,due_at timestamptz,
  assigned_to uuid,created_by_type public.actor_type,
  created_by_id text,metadata jsonb,
  completed_at timestamptz
);
create table public.automation_enrollments (
  id uuid primary key,organization_id uuid not null,
  lead_id uuid not null,status text not null
);
create table public.automation_scheduled_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,lead_id uuid not null,
  status text not null,cancelled_at timestamptz
);
create table public.automation_wait_states (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,lead_id uuid not null,
  status text not null,cancelled_at timestamptz,cancel_reason text
);
`;

const shadow = (candidate = 'human_handoff_candidate',verified = true) => ({
  deskcomm_inbound_shadow: {
    schema_version: 1,adapter: 'deskcomm_inspired_meta_ingress',
    intent_candidate: candidate,evidence_state: 'verified',event_family: 'inbound_message',
    signature_verified: verified,active_tenant_sender_binding: true,
    automation_authorized: false,replay_authorized: false,
  },
});

before(async () => {
  await admin.connect();
  await admin.query(`do $$ begin
    if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
  end; $$;`);
});
after(async () => { await admin.end(); });

async function fixture(run) {
  const name = `salsys_handoff_test_${randomUUID().replaceAll('-','')}`;
  assert.match(name,/^salsys_handoff_test_[a-f0-9]{32}$/);
  const connection = new URL(url);
  connection.pathname = `/${name}`;
  const clients = [];

  await admin.query(`create database "${name}"`);
  const connect = async (label = 'handoff-fixture') => {
    const c = new pg.Client({ connectionString: connection.href, application_name: label });
    await c.connect();
    clients.push(c);
    return c;
  };

  try {
    const observer = await connect('handoff-admin-session');
    await observer.query(foundation);
    await observer.query(migration);

    await observer.query(
      `insert into public.organizations(id) values ($1),($2);
      insert into public.profiles(id) values ($3),($4),($5);
      insert into public.organization_members(organization_id,user_id,role,active)
      values ($1,$3,'owner',true),($1,$4,'member',true),($2,$5,'owner',true);
      insert into public.organization_workspaces(organization_id,workspace_code,enabled)
      values ($1,'sales',true),($2,'sales',true);
      insert into public.workspace_memberships(organization_id,workspace_code,user_id,role,active)
      values ($1,'sales',$4,'member',true);
      insert into public.leads(id,organization_id) values($6,$1);
      insert into public.conversations(id,organization_id,lead_id,channel,external_account_id,external_conversation_id)
      values ($7,$1,$6,'whatsapp','meta-phone-a','919999123456');
      insert into public.messages(organization_id,lead_id,conversation_id,external_message_id,direction)
      values ($1,$6,$7,'wamid-unique','inbound');
      insert into public.whatsapp_crm_message_links(organization_id,lead_id,conversation_id,external_message_id)
      values ($1,$6,$7,'wamid-unique');
      insert into public.automation_enrollments(id,organization_id,lead_id,status)
      values($8,$1,$6,'active');
      insert into public.automation_scheduled_jobs(organization_id,lead_id,status)
      values($1,$6,'scheduled');
      insert into public.automation_wait_states(organization_id,lead_id,status)
      values($1,$6,'waiting');`,
      [org,otherOrg,actor,assignee,otherOwner,lead,conversation,enrollment],
    );

    await observer.query(
      `insert into public.raw_events(
        id,organization_id,source_system,source_event_type,ingestion_method,
        external_message_id,source_account_id,source_subject_id,metadata
      ) values
      ($1,$3,'whatsapp','message:text','whatsapp_webhook','wamid-unique','meta-phone-a','919999123456',$5),
      ($2,$3,'whatsapp','message:text','whatsapp_webhook','wamid-stop','meta-phone-a','919999123456',$6)`,
      [event,eventStop,org,null,JSON.stringify(shadow()),JSON.stringify(shadow('opt_out_candidate'))],
    );

    await run({ observer, connect });
  } finally {
    for (const c of clients) await c.query('rollback').catch(() => {});
    await Promise.allSettled(clients.map(c => c.end()));
    await admin.query(`drop database "${name}"`);
    const rows = await admin.query('select count(*)::integer as count from pg_database where datname=$1',[name]);
    assert.equal(rows.rows[0].count,0);
  }
}

async function signed(client,user=actor) {
  await client.query('begin');
  await client.query("set local role authenticated; set local statement_timeout='8s'; set local lock_timeout='5s'");
  await client.query('select set_config($1,$2,true)', ['request.jwt.claim.sub',user]);
}

async function authenticatedCall(client,sql,params,user=actor) {
  await signed(client,user);
  try {
    const result=(await client.query(sql,params)).rows[0]?.result;
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

function open(client,{organizationId=org,eventId=event,assignedTo=assignee}={}) {
  return authenticatedCall(client,
    'select public.open_verified_whatsapp_human_handoff_v1($1,$2,$3) as result',
    [organizationId,eventId,assignedTo],
  );
}

function close(client,handoffId,resolution='resolved_by_staff') {
  return authenticatedCall(client,
    'select public.close_verified_whatsapp_human_handoff_v1($1,$2,$3) as result',
    [org,handoffId,resolution],
  );
}

test('OFF by default, direct RPC refuses a task even if web server flag is bypassed',async()=>fixture(async f=>{
  const c=await f.connect();
  await assert.rejects(open(c),/disabled for this organization/);
  const count=await f.observer.query('select count(*)::int as n from public.tasks');
  assert.equal(count.rows[0].n,0);
}));

test('one verified human request creates one assigned task and cancels unclaimed work atomically',async()=>fixture(async f=>{
  await f.observer.query('insert into public.whatsapp_handoff_pilot_controls(organization_id,actions_enabled) values($1,true)',[org]);
  const c=await f.connect();
  const result=await open(c);
  assert.equal(result.ok,true);
  assert.equal(result.created,true);
  assert.equal(result.assigned_to,assignee);
  assert.equal(result.paused_enrollments,1);
  assert.equal(result.cancelled_scheduled_jobs,1);
  assert.equal(result.cancelled_wait_states,1);
  assert.equal(result.customer_message_sent,false);
  const task=await f.observer.query('select task_type,status,assigned_to from public.tasks');
  assert.deepEqual(task.rows[0],{task_type:'human_review',status:'open',assigned_to:assignee});
  assert.equal((await f.observer.query('select status from public.automation_enrollments')).rows[0].status,'paused');
  assert.equal((await f.observer.query('select status from public.automation_scheduled_jobs')).rows[0].status,'cancelled');
  assert.equal((await f.observer.query('select status from public.automation_wait_states')).rows[0].status,'cancelled');
  const retry=await open(c);
  assert.equal(retry.created,false);
  assert.equal(retry.task_id,result.task_id);
  assert.equal((await f.observer.query('select count(*)::int as n from public.tasks')).rows[0].n,1);

  const closed=await close(c,result.handoff_id);
  assert.equal(closed.automation_resumed,false);
  assert.equal((await f.observer.query('select status from public.tasks')).rows[0].status,'completed');
  assert.equal((await f.observer.query('select next_followup_at from public.leads')).rows[0].next_followup_at,null);
  assert.equal((await f.observer.query('select status from public.automation_enrollments')).rows[0].status,'paused');
  assert.equal((await f.observer.query('select status from public.automation_scheduled_jobs')).rows[0].status,'cancelled');
  const closedAgain=await close(c,result.handoff_id);
  assert.equal(closedAgain.changed,false);
}));

test('cross tenant, unsigned/STOP, unassigned staff and mismatched sender all fail closed',async()=>fixture(async f=>{
  await f.observer.query('insert into public.whatsapp_handoff_pilot_controls(organization_id,actions_enabled) values($1,true)',[org]);
  const c=await f.connect();
  await assert.rejects(open(c,{organizationId:otherOrg}),/owners\/admins/);
  await assert.rejects(open(c,{eventId:eventStop}),/Verified human-request/);
  await assert.rejects(open(c,{assignedTo:otherOwner}),/active Sales workspace member/);

  await f.observer.query('update public.raw_events set source_subject_id=$1 where id=$2',['wrong-sender',event]);
  await assert.rejects(open(c),/no rows|more than one row|Exact inbound/i);
  await f.observer.query('update public.raw_events set source_subject_id=$1 where id=$2',['919999123456',event]);
  await f.observer.query('update public.raw_events set metadata=$1 where id=$2',[JSON.stringify(shadow('human_handoff_candidate',false)),event]);
  await assert.rejects(open(c),/Verified human-request/);
  assert.equal((await f.observer.query('select count(*)::int as n from public.tasks')).rows[0].n,0);
}));

test('concurrent duplicate staff claims serialize on the unique source without duplicate tasks',async()=>fixture(async f=>{
  await f.observer.query('insert into public.whatsapp_handoff_pilot_controls(organization_id,actions_enabled) values($1,true)',[org]);
  const a=await f.connect('handoff-concurrent-a');
  const b=await f.connect('handoff-concurrent-b');
  await signed(a);
  await signed(b);
  const sql='select public.open_verified_whatsapp_human_handoff_v1($1,$2,$3) as result';
  const first=(await a.query(sql,[org,event,assignee])).rows[0].result;
  const secondWait=b.query(sql,[org,event,assignee])
    .then(x=>({result:x.rows[0].result}),error=>({error}));
  await a.query('commit');
  const second=await secondWait;
  assert.equal(second.error,undefined,second.error?.message);
  await b.query('commit');
  assert.equal(first.created,true);
  assert.equal(second.result.created,false);
  assert.equal(second.result.task_id,first.task_id);
  assert.equal((await f.observer.query('select count(*)::int as n from public.tasks')).rows[0].n,1);
}));
