-- R2-P2 Behavior Explorer: repeatable LIVE METADATA-ONLY read-only security audit.
-- Intended for a trusted, authorized operator. No tenant IDs, user IDs, visitor
-- IDs, event rows, paths or credentials are read or returned by this query.
-- It is not a simulation of an authenticated owner/admin session.
-- Run: psql "$AUTHORIZED_DB_CONNECTION" -v ON_ERROR_STOP=1 \
--   -f docs/sql/r2-p2-behavior-metadata-audit-v1.sql
-- No INSERT/UPDATE/DELETE/DDL, no impersonation, no production configuration change.

with required(name) as (
  values ('get_native_behavior_workspace_v1'::text),
         ('get_native_behavior_event_trends_v1'::text),
         ('get_native_behavior_page_breakdown_v1'::text)
), functions as (
  select r.name, p.oid, p.prosecdef, p.provolatile,
    pg_get_functiondef(p.oid) as definition
  from required r left join pg_proc p on p.proname = r.name
    and p.pronamespace = 'public'::regnamespace
), checked as (
  select name, oid is not null as exists_in_database,
    coalesce(prosecdef,false) as uses_security_definer,
    coalesce(provolatile='s',false) as stable_read,
    case when oid is null then false
      else not has_function_privilege('anon',oid,'EXECUTE') end as anon_denied,
    case when oid is null then false
      else has_function_privilege('authenticated',oid,'EXECUTE') end as authenticated_allowed,
    coalesce(position('public.is_organization_member(p_organization_id)' in definition)>0,false) as has_membership_guard,
    coalesce(position('public.is_crm_user()' in definition)>0,false) as has_crm_guard,
    coalesce(position('auth.role()' in definition)>0,false) as has_auth_guard
  from functions
), protected_tables as (
  select c.relname, c.relrowsecurity,
    not has_table_privilege('anon',c.oid,'SELECT') as anon_denied,
    not has_table_privilege('authenticated',c.oid,'SELECT') as authenticated_denied
  from pg_class c
  where c.oid in ('public.raw_events'::regclass, 'public.tracking_sources'::regclass)
), session_guard as (
  select exists(select 1 from pg_proc p
    where p.oid = 'public.is_organization_member(uuid)'::regprocedure
      and pg_get_functiondef(p.oid) like '%session_is_bound_to_organization(p_organization_id)%'
  ) as checks_bound_session
)
select jsonb_build_object(
  'audit','r2_p2_behavior_metadata_readonly_v1',
  'overall_pass',
    (select count(*)=3 and bool_and(
       exists_in_database and uses_security_definer and stable_read and
       anon_denied and authenticated_allowed and has_membership_guard and
       has_crm_guard and has_auth_guard
     ) from checked)
    and (select count(*)=2 and bool_and(
      relrowsecurity and anon_denied and authenticated_denied
    ) from protected_tables)
    and (select checks_bound_session from session_guard),
  'functions',(select jsonb_agg(jsonb_build_object(
    'function',name, 'exists',exists_in_database,
    'security_definer',uses_security_definer, 'read_stable',stable_read,
    'anon_denied',anon_denied, 'authenticated_allowed',authenticated_allowed,
    'membership_guard',has_membership_guard,'crm_user_guard',has_crm_guard,
    'auth_role_guard',has_auth_guard
  ) order by name) from checked),
  'tables',(select jsonb_agg(jsonb_build_object(
    'table',relname, 'rls',relrowsecurity,
    'anon_denied',anon_denied, 'authenticated_denied',authenticated_denied
  ) order by relname) from protected_tables),
  'member_guard_checks_session_binding',(select checks_bound_session from session_guard),
  'is_live_role_acceptance',false
) as security_metadata_only;
