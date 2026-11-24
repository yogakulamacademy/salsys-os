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
      create function auth.uid() returns uuid language sql stable as
        'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
      create table public.organizations(
        id uuid primary key default gen_random_uuid(), name text not null,
        slug text unique not null, status text not null
      );
      create table public.leads(id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id));
      create table public.profiles(
        id uuid primary key references auth.users(id), full_name text,
        role text, active boolean, updated_at timestamptz default now()
      );
      create table public.organization_members(
        organization_id uuid references public.organizations(id),
        user_id uuid references auth.users(id), role text, active boolean,
        primary key(organization_id,user_id)
      );
      -- Minimal session-bound context fixture, NOT the real session-binding RPC.
      create function public.get_current_workspace_context_v1() returns jsonb language plpgsql as $ctx$
      declare v_org uuid;
      begin
        select m.organization_id into v_org from public.organization_members m
          join public.organizations o on o.id=m.organization_id
          where m.user_id=auth.uid() and m.active and o.status='active' and auth.role()='authenticated';
        if v_org is null then raise exception 'Workspace access denied'; end if;
        return jsonb_build_object('organization_id',v_org);
      end;
      $ctx$;
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
      create table public.capability_catalog(code text primary key,status text);
      insert into public.capability_catalog values ('education_core','active'),('wellness_residential','active');
      create table public.organization_capabilities(organization_id uuid references public.organizations(id),capability_code text references public.capability_catalog(code),enabled boolean,primary key(organization_id,capability_code));
      create function public.session_is_bound_to_organization(p_org uuid) returns boolean language sql as $fn$
        select exists(select 1 from public.organization_members where organization_id=p_org and user_id=auth.uid() and active);
      $fn$;
      create function public.is_organization_member(p_org uuid) returns boolean language sql as $fn$
        select exists(select 1 from public.organization_members where organization_id=p_org and user_id=auth.uid() and active);
      $fn$;
      create table public.saas_plans(id uuid primary key,status text,version integer,code text unique);
      create table public.saas_plan_entitlements(plan_id uuid references public.saas_plans(id),capability_code text references public.capability_catalog(code),allowed boolean,primary key(plan_id,capability_code));
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
      for (const fn of ['signup_trial_available_v1()','reserve_signup_intent_v1(uuid,text,text,text)','accept_signup_intent_v1(uuid,uuid)','reserve_signup_resend_v1(text)','provision_verified_signup_v1(uuid)','convert_expired_signup_trial_v1(uuid)','reconcile_expired_signup_trials_v1(integer)','signup_automation_allowed_v1(uuid,text)','signup_integration_allowed_v1(uuid,text)','signup_advanced_operation_allowed_v1(uuid,text)']) {
        assert.equal(await scalar("select has_function_privilege($1,$2,'EXECUTE') as value",[role,'public.'+fn]),false);
      }
    }
    for (const role of ['anon','authenticated','service_role']) {
      assert.equal(await scalar("select has_table_privilege($1,'public.signup_trial_policy','INSERT') as value",[role]),false);
      assert.equal(await scalar("select has_table_privilege($1,'public.signup_registration_intents','SELECT') as value",[role]),false);
    }
    const plan = randomUUID(), free = randomUUID();
    await db.query("insert into public.saas_plans values($1,'active',1,'pro'),($2,'active',1,'free')",[plan,free]);
    await db.query("insert into public.signup_trial_policy(plan_id,plan_version,trial_days,allowed_workspace_codes,free_plan_id,free_plan_version,free_workspace_codes,pro_integration_codes,free_integration_codes,pro_named_users,pro_lead_records,free_named_users,free_lead_records,approval_ref,approved_at,enabled) values($1,1,14,array['admin','sales'],$2,1,array['admin'],array['instagram','ga4','google_ads'],array[]::text[],2,3,1,1,'synthetic test only',now(),true)",[plan,free]);
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

    const currentPlan = async (actor) => {
      await db.query("select set_config('request.jwt.claim.role','authenticated',false), set_config('request.jwt.claim.sub',$1,false)",[actor]);
      try { return await scalar("select public.get_current_signup_plan_v1() as value"); }
      finally { await db.query("select set_config('request.jwt.claim.role','service_role',false)"); }
    };
    const usage = async () => (await db.query("select named_users::int,lead_records::int from public.signup_usage_counters where organization_id=$1",[org])).rows[0];
    assert.deepEqual(await usage(),{named_users:1,lead_records:0});
    const teamUser=randomUUID(), extraUser=randomUUID();
    await addUser(teamUser,'team@example.invalid',randomUUID(),true);
    await addUser(extraUser,'extra@example.invalid',randomUUID(),true);
    await db.query("insert into public.organization_members values($1,$2,'employee',true)",[org,teamUser]);
    await assert.rejects(db.query("insert into public.organization_members values($1,$2,'employee',true)",[org,extraUser]),/Commercial usage limit reached: named_users/);
    await db.query("insert into public.organization_members values($1,$2,'employee',false)",[org,extraUser]);
    await assert.rejects(db.query("update public.organization_members set active=true where organization_id=$1 and user_id=$2",[org,extraUser]),/Commercial usage limit reached: named_users/);
    await db.query("insert into public.leads(organization_id) values($1),($1)",[org]);
    // Two independent transactions compete for the final lead slot.
    const peer = new pg.Client({connectionString:url.href});
    await peer.connect();
    try {
      const outcomes = await Promise.allSettled([
        db.query("insert into public.leads(organization_id) values($1)",[org]),
        peer.query("insert into public.leads(organization_id) values($1)",[org])
      ]);
      assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
      assert.match(String(outcomes.find(x=>x.status==='rejected').reason),/Commercial usage limit reached: lead_records/);
    } finally { await peer.end(); }
    assert.deepEqual(await usage(),{named_users:2,lead_records:3});
    await assert.rejects(db.query("insert into public.leads(organization_id) values($1)",[org]),/Commercial usage limit reached: lead_records/);
    await db.query("insert into public.saas_plan_entitlements values($1,'education_core',true),($1,'wellness_residential',true),($2,'education_core',false)",[plan,free]);
    await db.query("insert into public.organization_capabilities values($1,'education_core',true),($1,'wellness_residential',false)",[org]);
    const integration = (tenant,code) => scalar("select public.signup_integration_allowed_v1($1,$2) as value",[tenant,code]);
    assert.equal(await integration(org,'instagram'),true);
    assert.equal(await integration(org,'ga4'),true);
    assert.equal(await integration(org,'google_ads'),true);
    assert.equal(await integration(org,'whatsapp'),false);
    assert.equal(await integration(org,'gsc'),false);
    assert.equal(await integration(org,'meta_ads'),false);
    assert.equal(await integration(org,'unknown'),false);
    await db.query("select set_config('request.jwt.claim.role','authenticated',false)");
    assert.equal(await integration(org,'instagram'),false);
    await db.query("select set_config('request.jwt.claim.role','service_role',false)");
    const advanced = (tenant,operation) => scalar("select public.signup_advanced_operation_allowed_v1($1,$2) as value",[tenant,operation]);
    for (const op of ['ai_drafting','ai_autopilot','ad_audience_add','unknown']) assert.equal(await advanced(org,op),false);
    const automation = (tenant,channel) => scalar("select public.signup_automation_allowed_v1($1,$2) as value",[tenant,channel]);
    assert.equal(await automation(org,'whatsapp'),false);
    assert.equal(await automation(org,'instagram'),false);
    assert.equal(await automation(org,'unknown'),false);
    const capability = (tenant,code) => scalar("select public.organization_has_capability($1,$2) as value",[tenant,code]);
    assert.equal(await capability(org,'education_core'),true);
    assert.equal(await capability(org,'wellness_residential'),false);
    assert.equal(await capability(org,'unknown'),false);
    await db.query("select set_config('request.jwt.claim.role','authenticated',false),set_config('request.jwt.claim.sub',$1,false)",[user]);
    assert.equal(await capability(org,'education_core'),true);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[extraUser]);
    assert.equal(await capability(org,'education_core'),false);
    await db.query("select set_config('request.jwt.claim.role','anon',false)");
    assert.equal(await capability(org,'education_core'),false);
    await db.query("select set_config('request.jwt.claim.role','service_role',false)");
    for(const role of ['anon','authenticated','service_role']) {
      assert.equal(await scalar("select has_function_privilege($1,'public.signup_capability_allowed_internal_v1(uuid,text)','EXECUTE') as value",[role]),false);
    }
    const trial = await currentPlan(user);
    assert.equal(trial.state,'pro_trial');
    assert.equal(trial.plan_code,'pro');
    assert.ok(trial.remaining_seconds > 0 && trial.remaining_seconds <= 1209600);
    assert.deepEqual(trial.workspace_codes,['admin','sales']);
    await assert.rejects(currentPlan(randomUUID()),/Workspace access denied/);
    assert.equal(await scalar("select has_function_privilege('anon','public.get_current_signup_plan_v1()','EXECUTE') as value"),false);
    assert.equal(await scalar("select has_function_privilege('authenticated','public.get_current_signup_plan_v1()','EXECUTE') as value"),true);
    await assert.rejects(scalar("select public.get_current_signup_plan_v1() as value"),/Authenticated session required/);

    const convert = () => scalar("select public.convert_expired_signup_trial_v1($1) as value",[org]);
    assert.equal(await convert(),false);
    // Simulate clock passage only in the disposable fixture.
    await db.query("update public.signup_registration_intents set trial_ends_at=now()-interval '1 second' where organization_id=$1",[org]);
    await db.query("update public.saas_organization_subscriptions set trial_ends_at=(select trial_ends_at from public.signup_registration_intents where organization_id=$1) where organization_id=$1",[org]);
    const expired = await currentPlan(user);
    assert.equal(expired.state,'free_pending_reconciliation');
    assert.equal(await integration(org,'instagram'),false);
    assert.equal(await integration(org,'ga4'),false);
    assert.equal(await integration(org,'google_ads'),false);
    assert.equal(await capability(org,'education_core'),false);
    assert.deepEqual(await usage(),{named_users:2,lead_records:3});
    await assert.rejects(db.query("insert into public.leads(organization_id) values($1)",[org]),/Commercial usage limit reached: lead_records/);
    await db.query("update public.organization_members set active=false where organization_id=$1 and user_id=$2",[org,teamUser]);
    assert.deepEqual(await usage(),{named_users:1,lead_records:3});
    await assert.rejects(db.query("update public.organization_members set active=true where organization_id=$1 and user_id=$2",[org,teamUser]),/Commercial usage limit reached: named_users/);
    // Existing rows remain; updates and explicit deletions are still allowed.
    await db.query("update public.leads set organization_id=organization_id where organization_id=$1",[org]);
    assert.equal(await scalar("select count(*)::int as value from public.leads where organization_id=$1",[org]),3);
    assert.equal(expired.plan_code,'free');
    assert.equal(expired.remaining_seconds,0);
    assert.deepEqual(expired.workspace_codes,['admin']);
    assert.deepEqual(await scalar('select public.reconcile_expired_signup_trials_v1(100) as value'),{checked:1,converted:1,failed:0});
    assert.deepEqual(await scalar('select public.reconcile_expired_signup_trials_v1(100) as value'),{checked:0,converted:0,failed:0});
    await assert.rejects(scalar('select public.reconcile_expired_signup_trials_v1(101) as value'),/Invalid reconciliation batch size/);
    assert.equal(await convert(),false);
    assert.equal(await scalar("select count(*)::int as value from public.saas_organization_subscriptions where organization_id=$1 and plan_id=$2 and status='active'",[org,free]),1);
    assert.equal(await scalar("select enabled as value from public.organization_workspaces where organization_id=$1 and workspace_code='sales'",[org]),false);
    assert.equal(await scalar("select status as value from public.organizations where id=$1",[org]),'active');
    assert.equal(await scalar("select count(*)::int as value from public.organization_members where organization_id=$1 and user_id=$2",[org,user]),1);
    assert.equal(await provision(user),org);
    assert.equal((await currentPlan(user)).state,'free');
    await db.query("delete from public.leads where organization_id=$1",[org]);
    assert.deepEqual(await usage(),{named_users:1,lead_records:0});
    await db.query("insert into public.leads(organization_id) values($1)",[org]);
    await assert.rejects(db.query("insert into public.leads(organization_id) values($1)",[org]),/Commercial usage limit reached: lead_records/);
    // Legacy tenants are unaffected by the signup-only guard.
    const legacy=randomUUID();
    await db.query("insert into public.organizations values($1,'Legacy','legacy','active')",[legacy]);
    await db.query("insert into public.leads(organization_id) values($1),($1),($1),($1)",[legacy]);
    assert.equal(await scalar("select count(*)::int as value from public.leads where organization_id=$1",[legacy]),4);
    await db.query("delete from public.leads where organization_id=$1",[legacy]);
    await db.query("insert into public.organization_capabilities values($1,'education_core',true)",[legacy]);
    assert.equal(await capability(legacy,'education_core'),true);
    assert.equal(await automation(legacy,'whatsapp'),true);
    assert.equal(await automation(legacy,'instagram'),true);
    assert.equal(await integration(legacy,'instagram'),true);
    assert.equal(await integration(legacy,'gsc'),true);
    for (const op of ['ai_drafting','ai_autopilot','ad_audience_add']) assert.equal(await advanced(legacy,op),true);
    assert.equal(await advanced(legacy,'unknown'),false);
    assert.equal(await advanced(randomUUID(),'ai_drafting'),false);
    await db.query("select set_config('request.jwt.claim.role','authenticated',false)");
    assert.equal(await advanced(legacy,'ai_drafting'),false);
    await db.query("select set_config('request.jwt.claim.role','service_role',false)");
    assert.equal(await integration(randomUUID(),'ga4'),false);
    assert.equal(await automation(randomUUID(),'instagram'),false);
    await db.query("delete from public.organization_capabilities where organization_id=$1",[legacy]);
    await db.query("delete from public.organizations where id=$1",[legacy]);

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
