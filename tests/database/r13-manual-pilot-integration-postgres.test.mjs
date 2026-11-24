import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

// Disposable localhost only. Exercises exact signup draft + existing provisioning
// function against minimal Auth/CRM/commercial dependencies, not full Supabase
// Auth, P0 migration replay or live end-to-end authorization.
test('R13 integrated manual pilot applies exact approved contract and expiry without gateway', async () => {
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
      declare v_org uuid; v_role text;
      begin
        select m.organization_id,m.role into v_org,v_role from public.organization_members m
          join public.organizations o on o.id=m.organization_id
          where m.user_id=auth.uid() and m.active and o.status='active' and auth.role()='authenticated';
        if v_org is null then raise exception 'Workspace access denied'; end if;
        return jsonb_build_object('organization_id',v_org,'role',v_role);
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
      create function public.set_updated_at() returns trigger language plpgsql as $f$
      begin new.updated_at=now();return new;end;
      $f$;
    `);
    // Exact P0 #827 DDL (pinned fixture, not a duplicate migration).
    await db.query(readFileSync('supabase/migrations/20261108120000_r13_commercial_state_foundation_v1.sql','utf8'));
    await db.query(readFileSync('supabase/migrations/20261023184246_customer_organization_provisioning_v1.sql','utf8'));
    await db.query(readFileSync('tests/database/fixtures/r13-p2-verified-signup.sql','utf8'));
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
    await db.query("insert into public.saas_plans(id,status,version,code,display_name) values($1,'active',1,'pro','Synthetic Pro'),($2,'active',1,'free','Synthetic Free')",[plan,free]);
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
    await db.query("insert into public.saas_plan_entitlements(plan_id,capability_code,allowed) values($1,'education_core',true),($1,'wellness_residential',true),($2,'education_core',false)",[plan,free]);
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
    const dashboard = async (actor) => {
      await db.query("select set_config('request.jwt.claim.role','authenticated',false),set_config('request.jwt.claim.sub',$1,false)",[actor]);
      try { return await scalar("select public.get_current_subscription_dashboard_v1() as value"); }
      finally { await db.query("select set_config('request.jwt.claim.role','service_role',false)"); }
    };
    const billing=await dashboard(user);
    assert.equal(billing.state,'pro_trial');
    assert.equal(billing.named_users,2);
    assert.equal(billing.named_user_limit,2);
    assert.equal(billing.lead_records,3);
    assert.equal(billing.lead_record_limit,3);
    assert.equal(billing.history.length,1);
    assert.equal(billing.history[0].event_type,'subscription_created');
    assert.equal(billing.history[0].plan_code,'pro');
    assert.deepEqual(Object.keys(billing.history[0]).sort(),['event_type','new_status','occurred_at','plan_code','previous_status']);
    await db.query("insert into public.profiles(id,role,active) values($1,'employee',true)",[teamUser]);
    await assert.rejects(dashboard(teamUser),/Subscription access denied/);
    await assert.rejects(dashboard(randomUUID()),/Authenticated active account required/);
    assert.equal(await scalar("select has_function_privilege('anon','public.get_current_subscription_dashboard_v1()','EXECUTE') as value"),false);
    assert.equal(await scalar("select has_function_privilege('service_role','public.get_current_subscription_dashboard_v1()','EXECUTE') as value"),false);
    assert.equal(await scalar("select has_function_privilege('authenticated','public.get_current_subscription_dashboard_v1()','EXECUTE') as value"),true);
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
    await db.query("update public.saas_organization_subscriptions set trial_started_at=now()-interval '15 days',trial_ends_at=(select trial_ends_at from public.signup_registration_intents where organization_id=$1) where organization_id=$1",[org]);
    const expired = await currentPlan(user);
    assert.equal(expired.state,'free_pending_reconciliation');
    const expiredBilling=await dashboard(user);
    assert.equal(expiredBilling.state,'free_pending_reconciliation');
    assert.equal(expiredBilling.named_user_limit,1);
    assert.equal(expiredBilling.lead_record_limit,1);
    assert.equal(expiredBilling.lead_records,3);
    assert.ok(!expiredBilling.history.some(e=>e.new_status==='active'));
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
    const freeBilling=await dashboard(user);
    assert.equal(freeBilling.state,'free');
    assert.ok(freeBilling.history.some(e=>e.new_status==='active'&&e.plan_code==='free'));
    assert.equal(freeBilling.lead_records,3);
    await db.query("delete from public.leads where organization_id=$1",[org]);
    assert.deepEqual(await usage(),{named_users:1,lead_records:0});
    await db.query("insert into public.leads(organization_id) values($1)",[org]);
    await assert.rejects(db.query("insert into public.leads(organization_id) values($1)",[org]),/Commercial usage limit reached: lead_records/);
    // Exercise the actual combined candidates after normal trial fallback.
    for(const path of ['r13_governed_plan_admin.sql','r13_subscription_change_requests.sql','r13_manual_pilot_approvals.sql','r13_manual_pilot_activation.sql']){
      await db.query(readFileSync('supabase/drafts/'+path,'utf8'));
    }
    const operator=randomUUID(),reviewer=randomUUID(),publisher=randomUUID(),platform=randomUUID();
    await db.query("insert into public.organizations values($1,'Platform','salsysos','active')",[platform]);
    for(const actor of [operator,reviewer,publisher]){
      await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",[actor,actor+'@example.invalid']);
      await db.query("insert into public.profiles(id,role,active) values($1,'admin',true)",[actor]);
      await db.query("insert into public.organization_members values($1,$2,'owner',true)",[platform,actor]);
      await db.query("insert into saas_governance.operators(user_id,platform_organization_id,may_author,may_review,may_publish,may_approve_pilot,active) values($1,$2,true,true,true,true,true)",[actor,platform]);
    }
    const terms={display_name:'Synthetic Basic',amount_minor:12300,setup_min_minor:0,setup_max_minor:0,setup_optional:true,tax_treatment:'exclusive',named_users:3,lead_records:4,workspace_codes:['admin','sales'],integration_codes:['instagram']};
    const proposal=await scalar("select public.commercial_create_plan_request_v1($1,'basic',0,$2::jsonb,'Synthetic offer for combined test') as value",[operator,JSON.stringify(terms)]);
    const digest=await scalar("select snapshot_sha256 as value from saas_governance.plan_requests where id=$1",[proposal]);
    assert.equal(await scalar("select public.commercial_transition_plan_request_v1($1,$2,1,$3,'submit','Synthetic submit') as value",[operator,proposal,digest]),true);
    assert.equal(await scalar("select public.commercial_transition_plan_request_v1($1,$2,2,$3,'review','Synthetic review') as value",[reviewer,proposal,digest]),true);
    await db.query("insert into saas_governance.publication_authorizations(request_id,snapshot_sha256,authorized_publisher,commercial_approval_ref,release_approval_ref,expires_at) values($1,$2,$3,'synthetic commercial approval','synthetic release approval',clock_timestamp()+interval '1 hour')",[proposal,digest,publisher]);
    const basic=await scalar("select public.commercial_publish_initial_plan_v1($1,$2,3,$3) as value",[publisher,proposal,digest]);
    const readiness=()=>scalar("select public.commercial_manual_launch_readiness_v1($1) as value",[operator]);
    const beforeReadiness=await readiness();
    assert.equal(beforeReadiness.database_configuration_ready,false);
    assert.deepEqual(beforeReadiness.missing_plan_codes,['free','growth','pro']);
    assert.ok(beforeReadiness.blockers.includes('free_policy_mismatch'));
    assert.ok(beforeReadiness.blockers.includes('pro_policy_mismatch'));
    assert.equal(beforeReadiness.trial_days,14);
    assert.equal(beforeReadiness.pilot_capacity,10);
    await assert.rejects(scalar("select public.commercial_manual_launch_readiness_v1($1) as value",[user]),/operator not authorized/);
    const enrollment=()=>scalar("select public.commercial_enable_manual_pilot_requests_v1($1,$2,'Synthetic customer enrollment') as value",[operator,org]);
    const beforeEnrollment=await scalar("select public.commercial_list_manual_assignments_v1($1) as value",[operator]);
    assert.equal(beforeEnrollment.organizations.find(o=>o.id===org).pilot_enabled,false);
    await assert.rejects(scalar("select public.commercial_enable_manual_pilot_requests_v1($1,$2,'Synthetic invalid enrollment') as value",[user,org]),/operator not authorized/);
    await assert.rejects(scalar("select public.commercial_enable_manual_pilot_requests_v1($1,$2,'Synthetic invalid enrollment') as value",[operator,platform]),/Verified eligible customer required/);
    assert.equal(await enrollment(),true);
    assert.equal(await enrollment(),true);
    assert.equal(await scalar("select count(*)::int as value from saas_governance.manual_pilot_enrollment_events where organization_id=$1",[org]),1);
    assert.equal(await scalar("select count(*)::int as value from saas_governance.manual_pilot_organizations"),0);
    const afterEnrollment=await scalar("select public.commercial_list_manual_assignments_v1($1) as value",[operator]);
    assert.equal(afterEnrollment.organizations.find(o=>o.id===org).pilot_enabled,true);
    assert.equal((await currentPlan(user)).state,'free');
    await db.query("select set_config('request.jwt.claim.role','authenticated',false),set_config('request.jwt.claim.sub',$1,false)",[user]);
    const options=await scalar("select public.get_current_plan_change_options_v1() as value");
    const request=await scalar("select public.request_current_plan_change_v1($1,$2,1,$3,$4) as value",[randomUUID(),basic,digest,options.subscription_revision]);
    const activate=()=>scalar("select saas_governance.activate_manual_pilot($1,$2,$3) as value",[operator,request,digest]);
    await assert.rejects(activate(),/Manual approval required/);
    await db.query("select set_config('request.jwt.claim.role','service_role',false)");
    const endAt=await scalar("select (clock_timestamp()+interval '20 days')::text as value");
    const atomic=()=>scalar("select public.commercial_approve_activate_manual_pilot_v1($1,$2,$3,'complimentary',null,'Synthetic manual pilot approval',$4) as value",[operator,request,digest,endAt]);
    assert.equal((await currentPlan(user)).state,'free');
    // Force a late failure to prove the approval and pilot slot roll back too.
    await db.query("alter table public.saas_organization_subscriptions add constraint fixture_activation_failure check (plan_id <> '"+basic+"')");
    await assert.rejects(atomic(),/fixture_activation_failure/);
    assert.equal(await scalar("select count(*)::int as value from saas_governance.manual_pilot_approvals"),0);
    assert.equal(await scalar("select count(*)::int as value from saas_governance.manual_pilot_organizations"),0);
    assert.equal((await currentPlan(user)).state,'free');
    await db.query("alter table public.saas_organization_subscriptions drop constraint fixture_activation_failure");
    const contract=await atomic();
    assert.equal(await atomic(),contract);
    assert.equal(await activate(),contract);
    assert.equal(await scalar("select status as value from saas_governance.subscription_change_requests where id=$1",[request]),'activated');
    const active=await currentPlan(user);
    assert.equal(active.state,'manual_active');
    assert.equal(active.plan_code,'basic');
    assert.deepEqual(active.workspace_codes,['admin','sales']);
    const paid=await dashboard(user);
    assert.equal(paid.state,'manual_active');
    assert.equal(paid.named_user_limit,3);
    assert.equal(paid.lead_record_limit,4);
    assert.equal(await integration(org,'instagram'),true);
    assert.equal(await integration(org,'ga4'),false);
    assert.equal(await capability(org,'education_core'),false);
    assert.equal(await automation(org,'instagram'),false);
    assert.equal(await advanced(org,'ai_drafting'),false);
    await db.query("insert into public.leads(organization_id) values($1),($1),($1)",[org]);
    await assert.rejects(db.query("insert into public.leads(organization_id) values($1)",[org]),/Commercial usage limit reached: lead_records/);
    assert.equal(await scalar("select enabled as value from public.organization_workspaces where organization_id=$1 and workspace_code='sales'",[org]),true);
    assert.equal(await convert(),false);
    assert.equal(await scalar("select saas_governance.reconcile_expired_manual_contract($1) as value",[org]),false);
    // Simulate time passage only in disposable fixture by updating the
    // immutable row as database owner with its trigger temporarily disabled.
    await db.query("alter table saas_governance.manual_subscription_contracts disable trigger manual_contract_immutable");
    await db.query("update saas_governance.manual_subscription_contracts set started_at=now()-interval '21 days',ends_at=now()-interval '1 second' where id=$1",[contract]);
    await db.query("alter table saas_governance.manual_subscription_contracts enable trigger manual_contract_immutable");
    await db.query("update public.saas_organization_subscriptions set current_period_started_at=now()-interval '21 days',current_period_ends_at=(select ends_at from saas_governance.manual_subscription_contracts where id=$1) where organization_id=$2",[contract,org]);
    assert.equal((await currentPlan(user)).state,'free_pending_reconciliation');
    assert.equal((await dashboard(user)).lead_record_limit,1);
    assert.equal(await integration(org,'instagram'),false);
    await assert.rejects(db.query("insert into public.leads(organization_id) values($1)",[org]),/Commercial usage limit reached: lead_records/);
    assert.deepEqual(await scalar("select public.reconcile_expired_manual_contracts_v1(10) as value"),{checked:1,converted:1,failed:0});
    assert.deepEqual(await scalar("select public.reconcile_expired_manual_contracts_v1(10) as value"),{checked:0,converted:0,failed:0});
    await assert.rejects(scalar("select public.reconcile_expired_manual_contracts_v1(11) as value"),/Invalid manual reconciliation batch size/);
    assert.equal((await currentPlan(user)).state,'free');
    assert.equal(await scalar("select count(*)::int as value from public.leads where organization_id=$1",[org]),4);
    assert.equal(await scalar("select enabled as value from public.organization_workspaces where organization_id=$1 and workspace_code='sales'",[org]),false);
    // Customer requests Basic, admin independently chooses Growth.
    const growthProposal=await scalar("select public.commercial_create_plan_request_v1($1,'growth',0,$2::jsonb,'Synthetic Growth for override test') as value",[operator,JSON.stringify({...terms,display_name:'Synthetic Growth',amount_minor:23400,named_users:5,lead_records:8})]);
    const growthDigest=await scalar("select snapshot_sha256 as value from saas_governance.plan_requests where id=$1",[growthProposal]);
    assert.equal(await scalar("select public.commercial_transition_plan_request_v1($1,$2,1,$3,'submit','Synthetic submit') as value",[operator,growthProposal,growthDigest]),true);
    assert.equal(await scalar("select public.commercial_transition_plan_request_v1($1,$2,2,$3,'review','Synthetic review') as value",[reviewer,growthProposal,growthDigest]),true);
    await db.query("insert into saas_governance.publication_authorizations(request_id,snapshot_sha256,authorized_publisher,commercial_approval_ref,release_approval_ref,expires_at) values($1,$2,$3,'synthetic commercial approval','synthetic release approval',clock_timestamp()+interval '1 hour')",[growthProposal,growthDigest,publisher]);
    const growth=await scalar("select public.commercial_publish_initial_plan_v1($1,$2,3,$3) as value",[publisher,growthProposal,growthDigest]);
    assert.deepEqual((await readiness()).missing_plan_codes,['free','pro']);
    // Existing fixture Free/Pro rows predate governance. Attach synthetic
    // version evidence in this disposable database only to exercise equality.
    for(const [id,code,offer] of [
      [free,'free',{...terms,display_name:'Synthetic Free',amount_minor:0,named_users:1,lead_records:1,workspace_codes:['admin'],integration_codes:[]}],
      [plan,'pro',{...terms,display_name:'Synthetic Pro',amount_minor:34500,named_users:2,lead_records:3,workspace_codes:['admin','sales'],integration_codes:['instagram','ga4','google_ads']}]
    ]){
      const rq=await scalar("select public.commercial_create_plan_request_v1($1,$2,1,$3::jsonb,'Synthetic readiness fixture') as value",[operator,code,JSON.stringify(offer)]);
      const hash=await scalar("select snapshot_sha256 as value from saas_governance.plan_requests where id=$1",[rq]);
      assert.equal(await scalar("select public.commercial_transition_plan_request_v1($1,$2,1,$3,'submit','Synthetic submit') as value",[operator,rq,hash]),true);
      assert.equal(await scalar("select public.commercial_transition_plan_request_v1($1,$2,2,$3,'review','Synthetic review') as value",[reviewer,rq,hash]),true);
      await db.query("insert into saas_governance.published_plan_versions(plan_id,version,request_id,plan_code,snapshot,snapshot_sha256,currency,billing_period,amount_minor,setup_min_minor,setup_max_minor,setup_optional,tax_treatment,published_by,commercial_approval_ref,release_approval_ref) select $1,1,r.id,r.plan_code,r.snapshot,r.snapshot_sha256,p.currency,p.billing_period,p.amount_minor,p.setup_min_minor,p.setup_max_minor,p.setup_optional,p.tax_treatment,$3,'synthetic fixture only','synthetic fixture only' from saas_governance.plan_requests r join saas_governance.price_proposals p on p.request_id=r.id where r.id=$2",[id,rq,publisher]);
    }
    assert.equal((await readiness()).database_configuration_ready,true);
    await db.query("update public.signup_trial_policy set free_lead_records=2");
    assert.ok((await readiness()).blockers.includes('free_policy_mismatch'));
    await db.query("update public.signup_trial_policy set free_lead_records=1,enabled=false");
    assert.ok((await readiness()).blockers.includes('trial_policy_disabled'));
    await db.query("update public.signup_trial_policy set enabled=true");
    assert.equal((await readiness()).database_configuration_ready,true);
    await db.query("select set_config('request.jwt.claim.role','authenticated',false),set_config('request.jwt.claim.sub',$1,false)",[user]);
    const latest=await scalar("select public.get_current_plan_change_options_v1() as value");
    const original=await scalar("select public.request_current_plan_change_v1($1,$2,1,$3,$4) as value",[randomUUID(),basic,digest,latest.subscription_revision]);
    await db.query("select set_config('request.jwt.claim.role','service_role',false)");
    const assignmentEnd=await scalar("select (clock_timestamp()+interval '20 days')::text as value");
    const key=randomUUID();
    const assign=(revision=latest.subscription_revision,offerDigest=growthDigest)=>scalar("select public.commercial_assign_manual_plan_v1($1,$2,$3,$4,1,$5,$6,'complimentary',null,'Synthetic admin plan override',$7) as value",[operator,org,revision,growth,offerDigest,key,assignmentEnd]);
    await assert.rejects(assign('2000-01-01T00:00:00Z'),/Subscription changed/);
    await assert.rejects(assign(latest.subscription_revision,'0'.repeat(64)),/Published offer unavailable/);
    const assigned=await assign();
    assert.equal(await assign(),assigned);
    assert.equal(await scalar("select status as value from saas_governance.subscription_change_requests where id=$1",[original]),'superseded');
    assert.equal(await scalar("select target_plan_id as value from saas_governance.subscription_change_requests where id=$1",[original]),basic);
    assert.equal(await scalar("select request_origin as value from saas_governance.subscription_change_requests where supersedes_request_id=$1",[original]),'admin');
    assert.equal((await currentPlan(user)).plan_code,'growth');
    assert.equal((await dashboard(user)).lead_record_limit,8);
    assert.equal(await scalar("select count(*)::int as value from saas_governance.manual_pilot_organizations"),1);
    for(const role of ['anon','authenticated','service_role']){
      assert.equal(await scalar("select has_function_privilege($1,'public.commercial_assign_manual_plan_v1(uuid,uuid,timestamptz,uuid,integer,text,uuid,text,text,text,timestamptz)','EXECUTE') as value",[role]),role==='service_role');
      assert.equal(await scalar("select has_function_privilege($1,'saas_governance.activate_manual_pilot(uuid,uuid,text)','EXECUTE') as value",[role]),role==='service_role');
      assert.equal(await scalar("select has_function_privilege($1,'public.commercial_approve_activate_manual_pilot_v1(uuid,uuid,text,text,text,text,timestamptz)','EXECUTE') as value",[role]),role==='service_role');
      assert.equal(await scalar("select has_function_privilege($1,'public.reconcile_expired_manual_contracts_v1(integer)','EXECUTE') as value",[role]),role==='service_role');
    }
  } finally {
    if(db) await db.end().catch(()=>{});
    if(created) await admin.query('drop database "'+name+'" with (force)');
    for(const role of roles.reverse()) await admin.query('drop role if exists '+role);
    await admin.end();
  }
});
