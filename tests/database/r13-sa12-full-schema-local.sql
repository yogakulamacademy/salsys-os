-- Run only inside the disposable CI Supabase database, after the draft DDL
-- has been installed in the surrounding rollback-only transaction.
-- Real schema and real RPCs; SQL-injected claims are not signed Auth sessions.
do $check$
declare
 v_role text; v_fn record;
 v_platform uuid; v_target uuid; v_actor uuid:=gen_random_uuid();
 v_rule uuid; v_run uuid:=gen_random_uuid(); v_fresh uuid:=gen_random_uuid();
 v_result jsonb; v_denied boolean;
begin
 foreach v_role in array array['anon','authenticated','service_role'] loop
   if has_schema_privilege(v_role,'saas_lifecycle','USAGE') then
     raise exception 'Unexpected lifecycle schema usage: %',v_role;
   end if;
   for v_fn in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='saas_lifecycle' loop
     if has_function_privilege(v_role,v_fn.oid,'EXECUTE') then raise exception 'Unexpected private lifecycle execute: %',v_role; end if;
   end loop;
 end loop;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='saas_lifecycle' and c.relkind='r' and not c.relrowsecurity) then
   raise exception 'Lifecycle table without RLS';
 end if;
 if has_column_privilege('authenticated','public.organizations','status','UPDATE')
    or not has_column_privilege('authenticated','public.organizations','name','UPDATE') then
   raise exception 'Organization update boundary mismatch';
 end if;
 select id into v_platform from public.organizations where slug='salsysos';
 if not found then insert into public.organizations(name,slug,status) values('Synthetic platform','salsysos','active') returning id into v_platform; end if;
 insert into public.organizations(name,slug,status) values('Synthetic lifecycle customer','sa12-replay-'||gen_random_uuid()::text,'active') returning id into v_target;
 insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,created_at)
 values(v_actor,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',v_actor::text||'@example.invalid',now(),now());
 insert into public.profiles(id,full_name,role,active) values(v_actor,'Synthetic operator','admin',true)
 on conflict(id) do update set active=true,role='admin';
 -- No operator seed or session authorization is needed for these denial checks.
 perform set_config('request.jwt.claim.role','service_role',true);
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 v_denied:=false;
 begin perform saas_lifecycle.require_operator(v_platform,v_target,'suspend');
 exception when insufficient_privilege then v_denied:=true; end;
 if not v_denied then raise exception 'Service claim authorized lifecycle mutation'; end if;
 if saas_governance.platform_effective_quota_preview(v_target)->>'state' is distinct from 'managed_separately' then
   raise exception 'Actual resolver legacy quota state mismatch';
 end if;
 if saas_governance.platform_effective_quota_preview(v_platform)->>'state' is distinct from 'unavailable' then
   raise exception 'Internal platform quota exposed';
 end if;
 insert into public.instagram_automation_rules(organization_id,name,trigger_type,response_text)
 values(v_target,'Synthetic rule','dm_keyword','Synthetic reply') returning id into v_rule;
 insert into public.instagram_automation_runs(id,organization_id,rule_id,source_event_id,trigger_type,instagram_account_id,instagram_user_id,response_text,status,idempotency_key)
 values(v_run,v_target,v_rule,'synthetic-event','dm_keyword','synthetic-account','synthetic-user','Synthetic reply','pending_approval','synthetic-replay-'||v_run);
 if not saas_lifecycle.work_revision_allowed(v_target,'instagram',v_run) then raise exception 'Actual queue insert did not bind'; end if;
 v_result:=saas_lifecycle.claim_instagram_work_preview(v_target,v_run,now());
 if v_result->>'claimed' is distinct from 'false' or v_result->>'reason' is distinct from 'instagram_run_not_claimable' then
   raise exception 'Actual claim did not preserve pending approval denial: %',v_result;
 end if;
 -- Model a status transition and corresponding ledger records as DB owner.
 -- Actual transition authorization/concurrency are covered by separate fixtures.
 update public.organizations set status='suspended' where id=v_target;
 insert into saas_lifecycle.events(request_id,organization_id,platform_organization_id,actor_user_id,revision,action,previous_status,new_status,reason)
 values(gen_random_uuid(),v_target,v_platform,v_actor,1,'suspend','active','suspended','Synthetic replay transition');
 if saas_lifecycle.work_revision_allowed(v_target,'instagram',v_run) then raise exception 'Suspended work allowed'; end if;
 update public.organizations set status='active' where id=v_target;
 insert into saas_lifecycle.events(request_id,organization_id,platform_organization_id,actor_user_id,revision,action,previous_status,new_status,reason)
 values(gen_random_uuid(),v_target,v_platform,v_actor,2,'restore','suspended','active','Synthetic replay transition');
 v_denied:=false;
 begin update public.instagram_automation_runs set status='approved',approved_by=v_actor,approved_at=now(),human_approved=true where id=v_run;
 exception when insufficient_privilege then v_denied:=true; end;
 if not v_denied then raise exception 'Actual stale queue approval succeeded'; end if;
 if saas_lifecycle.claim_instagram_work_preview(v_target,v_run,now())->>'reason' is distinct from 'lifecycle_work_revision_blocked' then
   raise exception 'Actual stale claim not blocked';
 end if;
 insert into public.instagram_automation_runs(id,organization_id,rule_id,source_event_id,trigger_type,instagram_account_id,instagram_user_id,response_text,status,idempotency_key)
 values(v_fresh,v_target,v_rule,'synthetic-fresh-event','dm_keyword','synthetic-account','synthetic-user','Synthetic reply','pending_approval','synthetic-replay-'||v_fresh);
 if not saas_lifecycle.work_revision_allowed(v_target,'instagram',v_fresh) then raise exception 'Restored fresh work not bound'; end if;
 if saas_lifecycle.prepare_whatsapp_broadcast_preview(v_target,gen_random_uuid(),gen_random_uuid(),now())->>'provider_call_allowed' is distinct from 'false'
    or saas_lifecycle.claim_whatsapp_broadcast_preview(v_target,gen_random_uuid(),now())->>'provider_call_allowed' is distinct from 'false' then
   raise exception 'Unknown WhatsApp work allowed';
 end if;
end;
$check$;
