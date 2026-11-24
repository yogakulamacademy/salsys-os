import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

// Disposable localhost only. Exercises exact signup draft + existing provisioning
// function against minimal Auth/CRM/commercial dependencies, not full Supabase
// Auth, P0 migration replay or live end-to-end authorization.
test('R13 public signup SQL fails closed and atomically provisions one scoped trial', async () => {
  assert.equal(process.env.SALSYS_ALLOW_LOCAL_DB_TESTS, '1');
  const url = new URL(process.env.SALSYS_TEST_DATABASE_URL);
  assert.equal(url.protocol, 'postgres:');
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
  assert.equal(url.pathname, '/postgres');
  assert.equal(url.username, 'postgres');
  const name = 'salsys_signup_' + randomUUID().replaceAll('-', '');
  const admin = new pg.Client({connectionString:url.href});
  const roles = [];
  let db, created = false;
  await admin.connect();
  try {
    for (const role of ['anon','authenticated','service_role']) {
      if (!(await admin.query('select 1 from pg_roles where rolname=$1',[role])).rowCount) {
        await admin.query('create role '+role+' nologin'+(role==='service_role'?' bypassrls':''));
        roles.push(role);
      }
    }
    await admin.query('create database "'+name+'"');
    created = true;
    url.pathname = '/'+name;
    db = new pg.Client({connectionString:url.href});
    await db.connect();
    await db.query(`
      create schema auth;
      create table auth.users(
        id uuid primary key, email text, email_confirmed_at timestamptz,
        is_anonymous boolean default false, created_at timestamptz default clock_timestamp(),
        raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}'
      );
      create function auth.role() returns text language sql stable as
        'select current_setting(''request.jwt.claim.role'', true)';
      create table public.organizations(
        id uuid primary key default gen_random_uuid(), name text not null,
        slug text unique not null, status text not null
      );
      create table public.profiles(
        id uuid primary key references auth.users(id), full_name text,
        role text, active boolean, updated_at timestamptz default now()
      );
      create table public.organization_members(
        organization_id uuid references public.organizations(id),
        user_id uuid references auth.users(id), role text, active boolean,
        primary key(organization_id,user_id)
      );
      create table public.workspace_catalog(code text primary key,status text);
      insert into public.workspace_catalog values ('admin','active'),('sales','active'),('finance','active');
      create table public.organization_workspaces(
        organization_id uuid references public.organizations(id),workspace_code text references public.workspace_catalog(code),
        enabled boolean, primary key(organization_id,workspace_code)
      );
      create table public.organization_onboarding(
        organization_id uuid primary key references public.organizations(id),
        status text,current_step text,goals text[],completed_steps text[],enforce_on_sign_in boolean
      );
      create table public.saas_plans(id uuid primary key,status text,version integer);
      create table public.saas_organization_subscriptions(
        organization_id uuid primary key references public.organizations(id),
        plan_id uuid references public.saas_plans(id),status text,source text,
        trial_started_at timestamptz,trial_ends_at timestamptz,metadata jsonb
      );
    `);
    await db.query(readFileSync('supabase/migrations/20261023184246_customer_organization_provisioning_v1.sql','utf8'));
    await db.query(readFileSync('supabase/drafts/r13_verified_signup.sql','utf8'));
    await db.query("select set_config('request.jwt.claim.role','service_role',false)");
    const scalar = async (sql, params=[]) => (await db.query(sql,params)).rows[0]?.value;
    const reserve = (id,email) => scalar("select public.reserve_signup_intent_v1($1,$2,'Fixture Person','Fixture Company') as value",[id,email]);
    const accept = (id,user) => scalar("select public.accept_signup_intent_v1($1,$2) as value",[id,user]);
    const provision = (user) => scalar("select public.provision_verified_signup_v1($1) as value",[user]);
    const addUser = (user,email,intent,verified=false) => db.query(
      "insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,case when $4 then now() else null end,jsonb_build_object('signup_intent_id',$3::text))",
      [user,email,intent,verified]
    );
    assert.equal(await scalar("select public.signup_trial_available_v1() as value"),false);
    assert.equal(await reserve(randomUUID(),'closed@example.invalid'),false);
    for (const role of ['anon','authenticated']) {
      for (const fn of ['signup_trial_available_v1()','reserve_signup_intent_v1(uuid,text,text,text)','accept_signup_intent_v1(uuid,uuid)','reserve_signup_resend_v1(text)','provision_verified_signup_v1(uuid)']) {
        assert.equal(await scalar("select has_function_privilege($1,$2,'EXECUTE') as value",[role,'public.'+fn]),false);
      }
    }
    for (const role of ['anon','authenticated','service_role']) {
      assert.equal(await scalar("select has_table_privilege($1,'public.signup_trial_policy','INSERT') as value",[role]),false);
      assert.equal(await scalar("select has_table_privilege($1,'public.signup_registration_intents','SELECT') as value",[role]),false);
    }
    const plan = randomUUID();
    await db.query("insert into public.saas_plans values($1,'active',1)",[plan]);
    await db.query("insert into public.signup_trial_policy(plan_id,plan_version,trial_days,allowed_workspace_codes,approval_ref,approved_at,enabled) values($1,1,14,array['admin','sales'],'synthetic test only',now(),true)",[plan]);
    assert.equal(await scalar("select public.signup_trial_available_v1() as value"),true);

    const email='person@example.invalid', intent=randomUUID(), user=randomUUID();
    assert.equal(await reserve(intent,email),true);
    await addUser(user,email,intent);
    assert.equal(await accept(intent,user),true);
    await assert.rejects(provision(user),/Registration not authorized/);
    assert.equal(await scalar("select public.reserve_signup_resend_v1($1) as value",[email]),true);
    assert.equal(await scalar("select public.reserve_signup_resend_v1($1) as value",[email]),false);
    await db.query('update auth.users set email_confirmed_at=now() where id=$1',[user]);
    await db.query('update public.saas_plans set version=2 where id=$1',[plan]);
    assert.equal(await scalar("select public.signup_trial_available_v1() as value"),false);
    await assert.rejects(provision(user),/Approved trial policy unavailable/);
    assert.equal(await scalar("select count(*)::int as value from public.organizations"),0);
    await db.query('update public.saas_plans set version=1 where id=$1',[plan]);
    const org=await provision(user);
    assert.equal(await provision(user),org);
    assert.equal(await scalar("select count(*)::int as value from public.organizations"),1);
    assert.deepEqual((await db.query("select workspace_code,enabled from public.organization_workspaces where organization_id=$1 order by workspace_code",[org])).rows,[
      {workspace_code:'admin',enabled:true},{workspace_code:'finance',enabled:false},{workspace_code:'sales',enabled:true}
    ]);
    assert.equal(await scalar("select count(*)::int as value from public.saas_organization_subscriptions where organization_id=$1 and plan_id=$2 and status='trialing' and trial_ends_at-trial_started_at=interval '14 days'",[org,plan]),1);
    assert.equal(await scalar("select raw_app_meta_data->>'self_signup_organization_id' as value from auth.users where id=$1",[user]),org);
    assert.equal(await scalar("select public.reserve_signup_resend_v1($1) as value",[email]),false);

    const auto=randomUUID(), autoIntent=randomUUID();
    assert.equal(await reserve(autoIntent,'auto@example.invalid'),true);
    await addUser(auto,'auto@example.invalid',autoIntent,true);
    assert.equal(await accept(autoIntent,auto),false);
    await assert.rejects(provision(auto),/Registration not authorized/);

    const quota='quota@example.invalid';
    for(let i=0;i<3;i++) assert.equal(await reserve(randomUUID(),quota),true);
    assert.equal(await reserve(randomUUID(),quota),false);

    // Force a failure at subscription creation and prove all tenant writes roll back.
    const failIntent=randomUUID(), failUser=randomUUID(), failEmail='rollback@example.invalid';
    assert.equal(await reserve(failIntent,failEmail),true);
    await addUser(failUser,failEmail,failIntent);
    assert.equal(await accept(failIntent,failUser),true);
    await db.query('update auth.users set email_confirmed_at=now() where id=$1',[failUser]);
    await db.query("alter table public.saas_organization_subscriptions add constraint fixture_force_failure check (organization_id = '"+org+"')");
    await assert.rejects(provision(failUser),/fixture_force_failure/);
    assert.equal(await scalar("select count(*)::int as value from public.organizations"),1);
    assert.equal(await scalar("select count(*)::int as value from public.organization_members where user_id=$1",[failUser]),0);
    assert.equal(await scalar("select count(*)::int as value from public.profiles where id=$1",[failUser]),0);
    assert.equal(await scalar("select count(*)::int as value from public.signup_registration_intents where id=$1 and user_id is null",[failIntent]),1);
  } finally {
    if(db) await db.end().catch(()=>{});
    if(created) await admin.query('drop database "'+name+'" with (force)');
    for(const role of roles.reverse()) await admin.query('drop role if exists '+role);
    await admin.end();
  }
});
