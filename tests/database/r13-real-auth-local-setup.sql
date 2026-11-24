-- CI runner disposable local stack ONLY. Committed synthetic policy for Auth API smoke; never run on a linked or hosted database.
\set ON_ERROR_STOP on
do $test$
begin
 if exists(select 1 from public.signup_trial_policy) or exists(select 1 from public.signup_registration_intents)
 or exists(select 1 from saas_governance.operators) or exists(select 1 from saas_governance.manual_pilot_organizations)
 or exists(select 1 from saas_governance.published_plan_versions) then
 raise exception 'Commercial candidates must not seed policy, operators, plans or customers'; end if;
 if public.signup_trial_available_v1() then raise exception 'Unconfigured signup must stay unavailable'; end if;
 if has_function_privilege('authenticated','public.commercial_assign_manual_plan_v1(uuid,uuid,timestamptz,uuid,integer,text,uuid,text,text,text,timestamptz)','EXECUTE')
 or has_function_privilege('anon','public.get_current_subscription_dashboard_v1()','EXECUTE')
 or has_function_privilege('service_role','saas_governance.prepare_initial_trial_policy(text,text,text)','EXECUTE')
 or has_table_privilege('authenticated','saas_governance.manual_subscription_contracts','SELECT') then
 raise exception 'Unexpected commercial client or service privilege'; end if;
 if not has_function_privilege('service_role','public.reconcile_expired_manual_contracts_v1(integer)','EXECUTE')
 or not has_function_privilege('authenticated','public.get_current_subscription_dashboard_v1()','EXECUTE') then
 raise exception 'Required narrow RPC grant missing'; end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='saas_governance' and c.relkind='r' and not c.relrowsecurity) then
 raise exception 'Private commercial tables require RLS'; end if;
 if to_regclass('saas_governance.saas_payment_intents') is not null then raise exception 'Gateway candidate not required for manual launch'; end if;
end;
$test$;

begin;
update public.tenant_security_config set enforce_session_tenant=true where singleton;
do $rehearsal$
declare
 v_platform uuid; v_author uuid:=gen_random_uuid(); v_reviewer uuid:=gen_random_uuid();
 v_publisher uuid:=gen_random_uuid(); v_customer uuid:=gen_random_uuid();
 v_intent uuid:=gen_random_uuid(); v_session uuid:=gen_random_uuid();
 v_actor uuid; v_code text; v_request uuid; v_digest text; v_plan uuid;
 v_free uuid; v_pro uuid; v_basic uuid; v_growth uuid;
 v_free_digest text; v_pro_digest text; v_basic_digest text; v_growth_digest text;
 v_terms jsonb; v_org uuid; v_options jsonb; v_state jsonb;
 v_customer_request uuid; v_contract uuid; v_revision timestamptz;
 v_email text:='r13-local-'||gen_random_uuid()::text||'@example.invalid';
 v_denied boolean;
begin
 select id into v_platform from public.organizations where slug='salsysos' and status='active';
 if not found then
   insert into public.organizations(name,slug,status) values('Synthetic R13 platform','salsysos','active') returning id into v_platform;
 end if;
 foreach v_actor in array array[v_author,v_reviewer,v_publisher] loop
   insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,created_at)
   values(v_actor,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',v_actor::text||'@example.invalid',now(),now());
   insert into public.profiles(id,full_name,role,active) values(v_actor,'Synthetic operator','admin',true)
    on conflict(id) do update set active=true,role='admin';
   insert into public.organization_members(organization_id,user_id,role,active) values(v_platform,v_actor,'owner',true)
    on conflict(organization_id,user_id) do update set active=true,role='owner';
   insert into saas_governance.operators(user_id,platform_organization_id,may_author,may_review,may_publish,may_approve_pilot,active)
   values(v_actor,v_platform,v_actor=v_author,v_actor=v_reviewer,v_actor=v_publisher,v_actor=v_publisher,true);
 end loop;
 foreach v_code in array array['free','basic','growth','pro'] loop
   v_terms:=jsonb_build_object('display_name','Synthetic '||v_code,'amount_minor',case when v_code='free' then 0 else 100 end,
    'setup_min_minor',0,'setup_max_minor',0,'setup_optional',true,'tax_treatment','exclusive',
    'named_users',case when v_code='free' then 1 else 3 end,'lead_records',case when v_code='free' then 1 else 4 end,
    'workspace_codes',jsonb_build_array('admin','sales'),
    'integration_codes',jsonb_build_array('instagram'));
   execute 'set local role service_role';
   perform set_config('request.jwt.claim.role','service_role',true);
   v_request:=public.commercial_create_plan_request_v1(v_author,v_code,0,v_terms,'Synthetic local proposal');
   execute 'reset role';
   select snapshot_sha256 into v_digest from saas_governance.plan_requests where id=v_request;
   execute 'set local role service_role';
   if not public.commercial_transition_plan_request_v1(v_author,v_request,1,v_digest,'submit','Synthetic submit') then raise exception 'submit failed'; end if;
   if not public.commercial_transition_plan_request_v1(v_reviewer,v_request,2,v_digest,'review','Synthetic review') then raise exception 'review failed'; end if;
   execute 'reset role';
   insert into saas_governance.publication_authorizations(request_id,snapshot_sha256,authorized_publisher,commercial_approval_ref,release_approval_ref,expires_at)
   values(v_request,v_digest,v_publisher,'synthetic commercial approval','synthetic release approval',clock_timestamp()+interval '1 hour');
   execute 'set local role service_role';
   v_plan:=public.commercial_publish_initial_plan_v1(v_publisher,v_request,3,v_digest);
   execute 'reset role';
   case v_code when 'free' then v_free:=v_plan;v_free_digest:=v_digest;
    when 'pro' then v_pro:=v_plan;v_pro_digest:=v_digest;
    when 'basic' then v_basic:=v_plan;v_basic_digest:=v_digest;
    when 'growth' then v_growth:=v_plan;v_growth_digest:=v_digest; end case;
 end loop;
 if not saas_governance.prepare_initial_trial_policy(v_free_digest,v_pro_digest,'Synthetic local approval') then raise exception 'policy preparation failed'; end if;
 if public.signup_trial_available_v1() then raise exception 'Prepared policy enabled prematurely'; end if;
 -- Model approved policy within the local fixture; commit before any Auth request.
 update public.signup_trial_policy set enabled=true,approved_at=now();
 if not public.signup_trial_available_v1() then raise exception 'Enabled local policy not available'; end if;
end;
$rehearsal$;
commit;
