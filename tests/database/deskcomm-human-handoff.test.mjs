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
grant select on public.profiles,public.organization_members to authenticated;
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
create table public.automation_provider_send_audits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  lead_id uuid not null,
  channel text not null,
  provider text not null,
  status text not null,
  customer_message_sent boolean not null default false,
  provider_response jsonb not null default '{}'::jsonb,
  provider_message_id text
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

    // All identifiers below are fixed synthetic UUIDs, never external inputs.
    // PostgreSQL prepared statements cannot contain multiple commands, so this
    // deliberately executes a local-only synthetic seed as one simple batch.
    await observer.query(`
      insert into public.organizations(id) values ('${org}'),('${otherOrg}');
      insert into public.profiles(id) values ('${actor}'),('${assignee}'),('${otherOwner}');
      insert into public.organization_members(organization_id,user_id,role,active)
      values ('${org}','${actor}','owner',true),
             ('${org}','${assignee}','member',true),
             ('${otherOrg}','${otherOwner}','owner',true);
      insert into public.organization_workspaces(organization_id,workspace_code,enabled)
      values ('${org}','sales',true),('${otherOrg}','sales',true);
      insert into public.workspace_memberships(organization_id,workspace_code,user_id,role,active)
      values ('${org}','sales','${assignee}','member',true);
      insert into public.leads(id,organization_id) values('${lead}','${org}');
      insert into public.conversations(id,organization_id,lead_id,channel,external_account_id,external_conversation_id)
      values ('${conversation}','${org}','${lead}','whatsapp','meta-phone-a','919999123456');
      insert into public.messages(organization_id,lead_id,conversation_id,external_message_id,direction)
      values ('${org}','${lead}','${conversation}','wamid-unique','inbound');
      insert into public.whatsapp_crm_message_links(organization_id,lead_id,conversation_id,external_message_id)
      values ('${org}','${lead}','${conversation}','wamid-unique');
      insert into public.automation_enrollments(id,organization_id,lead_id,status)
      values('${enrollment}','${org}','${lead}','active');
      insert into public.automation_scheduled_jobs(organization_id,lead_id,status)
      values('${org}','${lead}','scheduled');
      insert into public.automation_wait_states(organization_id,lead_id,status)
      values('${org}','${lead}','waiting');
    `);

    await observer.query(
      `insert into public.raw_events(
        id,organization_id,source_system,source_event_type,ingestion_method,
        external_message_id,source_account_id,source_subject_id,metadata
      ) values
      ($1,$3,'whatsapp','message:text','whatsapp_webhook','wamid-unique','meta-phone-a','919999123456',$4),
      ($2,$3,'whatsapp','message:text','whatsapp_webhook','wamid-stop','meta-phone-a','919999123456',$5)`,
      [event,eventStop,org,JSON.stringify(shadow()),JSON.stringify(shadow('opt_out_candidate'))],
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
  const assignedNotifications = await f.observer.query(
    'select id,recipient_user_id,lead_id,notification_kind from public.whatsapp_handoff_staff_notifications',
  );
  assert.equal(assignedNotifications.rows.length,1);
  assert.equal(assignedNotifications.rows[0].recipient_user_id,assignee);
  assert.equal(assignedNotifications.rows[0].lead_id,lead);
  assert.equal(assignedNotifications.rows[0].notification_kind,'human_review_assigned');

  const closed=await close(c,result.handoff_id);
  assert.equal(closed.automation_resumed,false);
  assert.equal((await f.observer.query('select status from public.tasks')).rows[0].status,'completed');
  assert.equal((await f.observer.query('select ai_hold_active from public.whatsapp_human_handoffs')).rows[0].ai_hold_active,true);
  await assert.rejects(
    f.observer.query('insert into public.automation_enrollments(id,organization_id,lead_id,status) values($1,$2,$3,$4)',
      [randomUUID(),org,lead,'active']),
    /held for human review/,
  );
  assert.equal((await f.observer.query('select next_followup_at from public.leads')).rows[0].next_followup_at,null);
  assert.equal((await f.observer.query('select status from public.automation_enrollments')).rows[0].status,'paused');
  assert.equal((await f.observer.query('select status from public.automation_scheduled_jobs')).rows[0].status,'cancelled');
  const closedAgain=await close(c,result.handoff_id);
  assert.equal(closedAgain.changed,false);

  // Releasing is a second operator action, never an implicit effect of closing.
  const released=await authenticatedCall(c,
    'select public.release_verified_whatsapp_handoff_ai_hold_v1($1,$2) as result',
    [org,result.handoff_id]);
  assert.equal(released.ok,true);
  assert.equal(released.jobs_replayed,false);
  assert.equal(released.automation_resumed,false);
  assert.equal((await f.observer.query('select ai_hold_active from public.whatsapp_human_handoffs')).rows[0].ai_hold_active,false);
  const releaseAgain=await authenticatedCall(c,
    'select public.release_verified_whatsapp_handoff_ai_hold_v1($1,$2) as result',
    [org,result.handoff_id]);
  assert.equal(releaseAgain.changed,false);
  await f.observer.query(
    'insert into public.automation_enrollments(id,organization_id,lead_id,status) values($1,$2,$3,$4)',
    [randomUUID(),org,lead,'active'],
  );
  assert.equal((await f.observer.query('select count(*)::int as n from public.automation_enrollments where status=$1',['active'])).rows[0].n,1);
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


test('claimed WhatsApp send must settle before human handoff can open',async()=>fixture(async f=>{
  await f.observer.query(
    'insert into public.whatsapp_handoff_pilot_controls(organization_id,actions_enabled) values($1,true)',
    [org],
  );
  const audit = randomUUID();
  await f.observer.query(
    'insert into public.automation_provider_send_audits(id,organization_id,lead_id,channel,provider,status) values($1,$2,$3,$4,$5,$6)',
    [audit,org,lead,'whatsapp','meta_cloud_api','ready'],
  );
  // Existing worker claim commits before the human clicks. Meta may be in flight.
  await f.observer.query(
    'update public.automation_provider_send_audits set status=$1 where id=$2',
    ['sending',audit],
  );
  const c=await f.connect();
  const blocked=await open(c);
  assert.equal(blocked.ok,false);
  assert.equal(blocked.reason,'whatsapp_provider_send_in_flight');
  assert.equal(blocked.customer_message_sent,false);
  assert.equal(
    (await f.observer.query('select count(*)::int as n from public.tasks')).rows[0].n,0,
  );
  // Only the original provider worker's terminal reconciliation clears the
  // in-flight state; a handoff cannot shortcut provider reconciliation.
  await f.observer.query(
    'update public.automation_provider_send_audits set status=$1,customer_message_sent=true where id=$2',
    ['sent',audit],
  );
  const opened=await open(c);
  assert.equal(opened.created,true);
  assert.equal(opened.paused_enrollments,1);
}));

test('new provider send claims fail closed under a human handoff hold',async()=>fixture(async f=>{
  await f.observer.query(
    'insert into public.whatsapp_handoff_pilot_controls(organization_id,actions_enabled) values($1,true)',
    [org],
  );
  const c=await f.connect();
  const handoff=await open(c);
  assert.equal(handoff.created,true);
  const audit=randomUUID();
  await f.observer.query(
    'insert into public.automation_provider_send_audits(id,organization_id,lead_id,channel,provider,status) values($1,$2,$3,$4,$5,$6)',
    [audit,org,lead,'whatsapp','meta_cloud_api','ready'],
  );
  // Both standard and broadcast claim paths transition this same audit to
  // sending. The trigger rejects that transition before any Meta HTTP call.
  await assert.rejects(
    f.observer.query('update public.automation_provider_send_audits set status=$1 where id=$2',['sending',audit]),
    /blocked by an active human handoff/,
  );
  assert.equal(
    (await f.observer.query('select status from public.automation_provider_send_audits where id=$1',[audit])).rows[0].status,
    'ready',
  );

  await close(c,handoff.handoff_id);
  await assert.rejects(
    f.observer.query('update public.automation_provider_send_audits set status=$1 where id=$2',['sending',audit]),
    /blocked by an active human handoff/,
  );
  const released=await authenticatedCall(c,
    'select public.release_verified_whatsapp_handoff_ai_hold_v1($1,$2) as result',
    [org,handoff.handoff_id],
  );
  assert.equal(released.jobs_replayed,false);
  await f.observer.query(
    'update public.automation_provider_send_audits set status=$1 where id=$2',['sending',audit],
  );
  assert.equal(
    (await f.observer.query('select status from public.automation_provider_send_audits where id=$1',[audit])).rows[0].status,
    'sending',
  );
}));

test('unrelated tenants and channels have no new provider-send restrictions',async()=>fixture(async f=>{
  await f.observer.query(
    'insert into public.whatsapp_handoff_pilot_controls(organization_id,actions_enabled) values($1,true)',
    [org],
  );
  const c=await f.connect();
  assert.equal((await open(c)).created,true);
  for(const [tenant,channel,provider] of [
    [otherOrg,'whatsapp','meta_cloud_api'],
    [org,'instagram','meta'],
    [org,'whatsapp','non_meta_provider'],
  ]) {
    const audit=randomUUID();
    await f.observer.query(
      'insert into public.automation_provider_send_audits(id,organization_id,lead_id,channel,provider,status) values($1,$2,$3,$4,$5,$6)',
      [audit,tenant,lead,channel,provider,'ready'],
    );
    await f.observer.query(
      'update public.automation_provider_send_audits set status=$1 where id=$2',
      ['sending',audit],
    );
    const current=await f.observer.query(
      'select status from public.automation_provider_send_audits where id=$1',[audit],
    );
    assert.equal(current.rows[0].status,'sending');
  }
}));

test('an in-flight claim and handoff serialize under the same advisory lock',async()=>fixture(async f=>{
  await f.observer.query(
    'insert into public.whatsapp_handoff_pilot_controls(organization_id,actions_enabled) values($1,true)',
    [org],
  );
  const audit=randomUUID();
  await f.observer.query(
    'insert into public.automation_provider_send_audits(id,organization_id,lead_id,channel,provider,status) values($1,$2,$3,$4,$5,$6)',
    [audit,org,lead,'whatsapp','meta_cloud_api','ready'],
  );
  const sender=await f.connect('handoff-provider-claim-race');
  const reviewer=await f.connect('handoff-reviewer-race');
  // The provider-send process holds a privileged server transaction, while
  // the human reviewer uses an authenticated owner/admin session.
  await sender.query('begin');
  await signed(reviewer);
  await sender.query(
    'update public.automation_provider_send_audits set status=$1 where id=$2',
    ['sending',audit],
  );
  // Sender has transitioned to 'sending' but not committed. Reviewer waits
  // for the advisory lock. Once it commits, reviewer must observe 'sending'.
  const pending=reviewer.query(
    'select public.open_verified_whatsapp_human_handoff_v1($1,$2,$3) as result',
    [org,event,assignee],
  ).then(x=>({value:x.rows[0].result}),error=>({error}));
  await sender.query('commit');
  const result=await pending;
  assert.equal(result.error,undefined,result.error?.message);
  assert.equal(result.value.reason,'whatsapp_provider_send_in_flight');
  await reviewer.query('commit');
  assert.equal((await f.observer.query('select count(*)::int as n from public.tasks')).rows[0].n,0);
}));


test('staff alerts are recipient-only, readable once and never duplicate on retry',async()=>fixture(async f=>{
  await f.observer.query(
    'insert into public.whatsapp_handoff_pilot_controls(organization_id,actions_enabled) values($1,true)',
    [org],
  );
  const owner=await f.connect();
  const opened=await open(owner);
  assert.equal(opened.created,true);
  assert.equal((await open(owner)).created,false);
  const rows=await f.observer.query(
    'select id,organization_id,recipient_user_id,read_at from public.whatsapp_handoff_staff_notifications',
  );
  assert.equal(rows.rows.length,1);
  const notificationId=rows.rows[0].id;

  const staff=await f.connect();
  const allowed=await authenticatedCall(staff,
    'select count(*)::integer as result from public.whatsapp_handoff_staff_notifications where organization_id=$1',
    [org],assignee);
  assert.equal(allowed,1);
  const invisible=await authenticatedCall(owner,
    'select count(*)::integer as result from public.whatsapp_handoff_staff_notifications where organization_id=$1',
    [org],actor);
  assert.equal(invisible,0);

  const ack=await authenticatedCall(staff,
    'select public.acknowledge_whatsapp_handoff_staff_alert_v1($1,$2) as result',
    [org,notificationId],assignee);
  assert.equal(ack.ok,true);
  assert.equal(ack.acknowledged,true);

  const wrongRecipient=await authenticatedCall(owner,
    'select public.acknowledge_whatsapp_handoff_staff_alert_v1($1,$2) as result',
    [org,notificationId],actor);
  assert.equal(wrongRecipient.ok,false);
  const wrongOrg=await authenticatedCall(staff,
    'select public.acknowledge_whatsapp_handoff_staff_alert_v1($1,$2) as result',
    [otherOrg,notificationId],assignee).then(x=>({value:x}),error=>({error}));
  assert.ok(wrongOrg.error);
  assert.equal(
    (await f.observer.query('select count(*)::integer as n from public.whatsapp_handoff_staff_notifications where read_at is not null')).rows[0].n,
    1,
  );
});

test('a dispatched Meta timeout stays non-retryable until verified acceptance evidence exists',async()=>fixture(async f=>{
  const audit=randomUUID();
  await f.observer.query(
    'insert into public.automation_provider_send_audits(id,organization_id,lead_id,channel,provider,status,provider_response) values($1,$2,$3,$4,$5,$6,$7)',
    [audit,org,lead,'whatsapp','meta_cloud_api','sending',
      JSON.stringify({transport_outcome:{status:'unknown',retry_safe:false}})],
  );
  await assert.rejects(
    f.observer.query(
      'update public.automation_provider_send_audits set status=$1 where id=$2',
      ['failed',audit],
    ),
    /Unknown Meta send outcome requires verified provider acceptance/,
  );
  await assert.rejects(
    f.observer.query(
      'update public.automation_provider_send_audits set status=$1 where id=$2',
      ['ready',audit],
    ),
    /Unknown Meta send outcome requires verified provider acceptance/,
  );
  await assert.rejects(
    f.observer.query(
      'update public.automation_provider_send_audits set status=$1,provider_response=$2 where id=$3',
      ['sending',JSON.stringify({}),audit],
    ),
    /Unknown Meta send outcome requires verified provider acceptance/,
  );
  await assert.rejects(
    f.observer.query(
      'update public.automation_provider_send_audits set status=$1 where id=$2',
      ['sent',audit],
    ),
    /Unknown Meta send outcome requires verified provider acceptance/,
  );
  const before=await f.observer.query(
    'select status,customer_message_sent from public.automation_provider_send_audits where id=$1',
    [audit],
  );
  assert.deepEqual(before.rows[0],{status:'sending',customer_message_sent:false});
  // A verified provider acceptance, with a provider message ID, can be
  // reconciled without ever replaying the outbound request.
  await f.observer.query(
    'update public.automation_provider_send_audits set status=$1,customer_message_sent=true,provider_message_id=$2 where id=$3',
    ['sent','wamid-provider-accepted',audit],
  );
  const after=await f.observer.query(
    'select status,provider_message_id from public.automation_provider_send_audits where id=$1',
    [audit],
  );
  assert.equal(after.rows[0].status,'sent');
  assert.equal(after.rows[0].provider_message_id,'wamid-provider-accepted');
});
