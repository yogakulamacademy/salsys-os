-- Disposable Supabase migration-replay database only.
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
