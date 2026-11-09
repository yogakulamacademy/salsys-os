-- R2 staging post-install catalog privilege inventory v1.
-- Safe SELECT-only aggregate: no production data, identities, grant changes,
-- secrets, migrations, triggers, writes, outbound calls or DDL.
-- This may run on an EMPTY staging project (SCHEMA_NOT_INSTALLED).
-- CATALOG_GUARDS_PASS_NOT_ACCEPTANCE is NOT E2E / GDPR / backup approval.
with
  public_tables as (
    select c.oid, c.relrowsecurity
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  ),
  exposed_tables as (
    select
      t.oid, t.relrowsecurity,
      (pg_catalog.has_table_privilege('anon', t.oid, 'SELECT')
        or pg_catalog.has_table_privilege('anon', t.oid, 'INSERT')
        or pg_catalog.has_table_privilege('anon', t.oid, 'UPDATE')
        or pg_catalog.has_table_privilege('anon', t.oid, 'DELETE')) as anon_any,
      (pg_catalog.has_table_privilege('authenticated', t.oid, 'SELECT')
        or pg_catalog.has_table_privilege('authenticated', t.oid, 'INSERT')
        or pg_catalog.has_table_privilege('authenticated', t.oid, 'UPDATE')
        or pg_catalog.has_table_privilege('authenticated', t.oid, 'DELETE')) as authenticated_any
    from public_tables t
  ),
  table_counts as (
    select count(*)::integer as public_tables,
      count(*) filter (where not relrowsecurity)::integer as tables_rls_off,
      count(*) filter (where not relrowsecurity and anon_any)::integer as anon_reachable_rls_off,
      count(*) filter (where not relrowsecurity and authenticated_any)::integer as authenticated_reachable_rls_off
    from exposed_tables
  ),
  public_views as (
    select c.oid,
      coalesce('security_invoker=true' = any(c.reloptions), false) as security_invoker,
      pg_catalog.has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
      pg_catalog.has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_select
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname='public' and c.relkind = 'v'
  ),
  view_counts as (
    select count(*)::integer as public_views,
      count(*) filter (where anon_select and not security_invoker)::integer as anon_exposed_non_invoker_views,
      count(*) filter (where authenticated_select and not security_invoker)::integer as authenticated_exposed_non_invoker_views
    from public_views
  ),
  definer_functions as (
    select p.oid
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  ),
  function_counts as (
    select count(*)::integer as security_definer_functions,
      count(*) filter (where pg_catalog.has_function_privilege('anon', oid, 'EXECUTE'))::integer as anon_executable_definer_functions,
      count(*) filter (where pg_catalog.has_function_privilege('authenticated', oid, 'EXECUTE'))::integer as authenticated_executable_definer_functions
    from definer_functions
  )
select
  case
    when t.public_tables = 0 or f.security_definer_functions = 0
      then 'SCHEMA_NOT_INSTALLED_OR_INCOMPLETE'
    when t.anon_reachable_rls_off > 0
      or t.authenticated_reachable_rls_off > 0
      or v.anon_exposed_non_invoker_views > 0
      or v.authenticated_exposed_non_invoker_views > 0
      or f.anon_executable_definer_functions > 0
      then 'PRIVILEGE_CATALOG_REVIEW_REQUIRED'
    else 'CATALOG_GUARDS_PASS_NOT_ACCEPTANCE'
  end as catalog_gate,
  t.public_tables, t.tables_rls_off, t.anon_reachable_rls_off,
  t.authenticated_reachable_rls_off, v.public_views,
  v.anon_exposed_non_invoker_views, v.authenticated_exposed_non_invoker_views,
  f.security_definer_functions, f.anon_executable_definer_functions,
  f.authenticated_executable_definer_functions,
  false as authenticated_tenant_e2e_verified,
  false as privacy_consent_verified,
  false as backup_restore_verified,
  false as authorized_to_release
from table_counts t cross join view_counts v cross join function_counts f;
