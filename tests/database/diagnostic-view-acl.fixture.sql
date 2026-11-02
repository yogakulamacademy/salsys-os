-- Approved Recovery Rehearsal only. Synthetic view bodies test the exact grant
-- migration; this does not replay the production views' underlying datasets.
begin;
set local statement_timeout='15s';
do $guard$
begin
  if to_regclass('public.organizations') is not null or to_regclass('public.v_system_recent_failures') is not null or to_regclass('public.v_commerce_event_readiness_v1') is not null then raise exception 'Refusing a populated application project'; end if;
end;
$guard$;
create view public.v_system_recent_failures as select 'synthetic-a'::text as organization_id,'synthetic failure'::text as error_message;
create view public.v_commerce_event_readiness_v1 as select 'synthetic-a'::text as organization_id,'synthetic'::text as operational_status;
grant all on public.v_system_recent_failures,public.v_commerce_event_readiness_v1 to anon,authenticated,service_role;
-- __MIGRATION__
do $assert$
declare target text;
begin
  foreach target in array array['public.v_system_recent_failures','public.v_commerce_event_readiness_v1'] loop
    if has_table_privilege('anon',target,'SELECT') then raise exception 'Anonymous read remains on %',target; end if;
    if has_table_privilege('authenticated',target,'SELECT') then raise exception 'Direct signed-in read remains on %',target; end if;
    if not has_table_privilege('service_role',target,'SELECT') then raise exception 'Authorized service read broken on %',target; end if;
  end loop;
end;
$assert$;
rollback;
select 'diagnostic_view_acl_v1' as suite,6 as permission_assertions_completed,to_regclass('public.v_system_recent_failures') is null and to_regclass('public.v_commerce_event_readiness_v1') is null as rollback_verified;
