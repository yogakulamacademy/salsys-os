-- Disposable CI only; all test actors and catalog data roll back.
\set ON_ERROR_STOP on
begin;
do $test$
declare
 v_platform uuid; v_actor uuid; v_code text;
 v_catalog jsonb:='{}'::jsonb; v_digest text; v_bad jsonb;
 v_result jsonb; v_denied boolean; v_count integer;
begin
 if has_function_privilege('anon','saas_governance.bootstrap_initial_owner_catalog_v1(uuid,uuid,jsonb,text,text,text)','EXECUTE')
 or has_function_privilege('authenticated','saas_governance.bootstrap_initial_owner_catalog_v1(uuid,uuid,jsonb,text,text,text)','EXECUTE')
 or has_function_privilege('service_role','saas_governance.bootstrap_initial_owner_catalog_v1(uuid,uuid,jsonb,text,text,text)','EXECUTE')
 then raise exception 'Bootstrap is not private'; end if;
 select id into v_platform from public.organizations where slug='salsysos' and status='active';
 if not found then insert into public.organizations(name,slug,status) values('Synthetic platform','salsysos','active') returning id into v_platform; end if;
 select count(distinct m.user_id) into v_count from public.organization_members m
 join public.profiles p on p.id=m.user_id and p.active
 join auth.users u on u.id=m.user_id and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
 where m.organization_id=v_platform and m.active and m.role in ('owner','admin');
 if v_count=0 then
  v_actor:=gen_random_uuid();
  insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,created_at)
  values(v_actor,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',v_actor::text||'@example.invalid',now(),now());
  insert into public.profiles(id,full_name,role,active) values(v_actor,'Synthetic initial operator','admin',true) on conflict(id) do update set active=true,role='admin';
  insert into public.organization_members(organization_id,user_id,role,active) values(v_platform,v_actor,'admin',true);
 elsif v_count=1 then
  select m.user_id into strict v_actor from public.organization_members m join public.profiles p on p.id=m.user_id and p.active
  join auth.users u on u.id=m.user_id and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
  where m.organization_id=v_platform and m.active and m.role in ('owner','admin');
 else raise exception 'Unexpected multi-operator local fixture'; end if;
 foreach v_code in array array['free','basic','growth','pro'] loop
  v_catalog:=v_catalog||jsonb_build_object(v_code,jsonb_build_object(
  'display_name',initcap(v_code),'amount_minor',case v_code when 'free' then 0 when 'basic' then 149900 when 'growth' then 349900 else 699900 end,
  'setup_min_minor',0,'setup_max_minor',0,'setup_optional',true,'tax_treatment','exclusive',
  'named_users',case v_code when 'free' then 1 when 'basic' then 2 when 'growth' then 5 else 10 end,
  'lead_records',case v_code when 'free' then 250 when 'basic' then 2000 when 'growth' then 10000 else 50000 end,
  'workspace_codes',case v_code when 'free' then jsonb_build_array('admin','sales') when 'basic' then jsonb_build_array('admin','sales','reports') when 'growth' then jsonb_build_array('admin','sales','reports','marketing') else jsonb_build_array('admin','sales','reports','marketing','finance') end,
  'integration_codes',case v_code when 'free' then jsonb_build_array('instagram') when 'basic' then jsonb_build_array('instagram','whatsapp') when 'growth' then jsonb_build_array('instagram','whatsapp','meta_ads') else jsonb_build_array('instagram','whatsapp','meta_ads','ga4','gsc','google_ads') end));
 end loop;
 v_digest:=encode(sha256(convert_to(v_catalog::text,'UTF8')),'hex');
 v_denied:=false;
 begin perform saas_governance.bootstrap_initial_owner_catalog_v1(v_actor,v_platform,v_catalog,repeat('0',64),'Synthetic owner approval','Synthetic release approval');
 exception when others then if sqlerrm not like '%Exact owner-approved%' then raise; end if; v_denied:=true; end;
 if not v_denied then raise exception 'Wrong digest accepted'; end if;
 v_denied:=false;
 begin perform saas_governance.bootstrap_initial_owner_catalog_v1(gen_random_uuid(),v_platform,v_catalog,v_digest,'Synthetic owner approval','Synthetic release approval');
 exception when insufficient_privilege then v_denied:=true; end;
 if not v_denied then raise exception 'Non-operator accepted'; end if;
 v_bad:=jsonb_set(v_catalog,'{pro,integration_codes}','[]'::jsonb);
 v_denied:=false;
 begin perform saas_governance.bootstrap_initial_owner_catalog_v1(v_actor,v_platform,v_bad,encode(sha256(convert_to(v_bad::text,'UTF8')),'hex'),'Synthetic owner approval','Synthetic release approval');
 exception when others then if sqlerrm not like '%Sales and Instagram%' then raise; end if; v_denied:=true; end;
 if not v_denied or exists(select 1 from public.saas_plans) or exists(select 1 from saas_governance.operators) then raise exception 'Bad fourth plan failed atomic rollback'; end if;
 v_result:=saas_governance.bootstrap_initial_owner_catalog_v1(v_actor,v_platform,v_catalog,v_digest,'Synthetic owner approval','Synthetic release approval');
 if not(v_result ?& array['free','basic','growth','pro']) or (select count(*) from saas_governance.published_plan_versions)<>4 then raise exception 'Catalog bootstrap incomplete'; end if;
 if (select count(*) from saas_governance.plan_requests where status='owner_approved' and reviewer_user_id is null and revision=2)<>4
 or (select count(*) from saas_governance.review_events where action='owner_approved' and actor_user_id=v_actor)<>4
 or exists(select 1 from saas_governance.publication_authorizations)
 or not exists(select 1 from saas_governance.initial_catalog_owner_authorization where catalog_sha256=v_digest and actor_user_id=v_actor)
 then raise exception 'Incorrect approval provenance'; end if;
 if not exists(select 1 from public.signup_trial_policy where trial_days=30 and free_named_users=1 and free_lead_records=250 and pro_named_users=10 and pro_lead_records=50000 and 'instagram'=any(free_integration_codes) and not enabled)
 or public.signup_trial_available_v1() or exists(select 1 from public.saas_organization_subscriptions)
 then raise exception 'Trial policy not dormant or wrong exact limits'; end if;
 v_denied:=false;
 begin perform saas_governance.bootstrap_initial_owner_catalog_v1(v_actor,v_platform,v_catalog,v_digest,'Synthetic owner approval','Synthetic release approval');
 exception when others then if sqlerrm not like '%pristine commercial state%' then raise; end if; v_denied:=true; end;
 if not v_denied then raise exception 'Second bootstrap accepted'; end if;
 v_denied:=false;
 begin update saas_governance.initial_catalog_owner_authorization set owner_approval_ref='mutated evidence';
 exception when sqlstate '55000' then v_denied:=true; end;
 if not v_denied then raise exception 'Owner audit mutable'; end if;
 raise notice 'R13 owner bootstrap: denied invalid digest/actor, atomic rollback, four immutable published snapshots, no fictional reviewer, disabled 30-day policy and single-use guard PASS';
end;
$test$;
rollback;
