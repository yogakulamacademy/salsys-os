-- Performance final closeout v1
--
-- Team Performance and Assignment Fairness must use the canonical tenant role
-- from organization_members, not the legacy global profiles.role field.
-- The migration edits only the role projection/filter clauses in the existing
-- RPC definitions and fails closed if the expected definitions have drifted.

begin;

do $migration$
declare
  v_oid oid;
  v_def text;
  v_updated text;
  v_team_filter_pattern text := 'and\s+p\.role\s+in\s*\(\s*''admin''\s*,\s*''manager''\s*,\s*''admissions''\s*\)';
begin
  select p.oid, pg_get_functiondef(p.oid)
    into v_oid, v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_team_performance_snapshot'
    and pg_get_function_identity_arguments(p.oid) = 'p_organization_id uuid, p_start_date date, p_end_date date';

  if v_oid is null then
    raise exception 'Performance closeout: get_team_performance_snapshot(uuid,date,date) not found';
  end if;

  if regexp_count(v_def, 'p\.role::text\s+as\s+role', 1, 'i') <> 1 then
    raise exception 'Performance closeout: expected one legacy role projection in get_team_performance_snapshot';
  end if;

  if regexp_count(v_def, v_team_filter_pattern, 1, 'i') <> 1 then
    raise exception 'Performance closeout: expected one legacy team role filter in get_team_performance_snapshot';
  end if;

  v_updated := regexp_replace(
    v_def,
    'p\.role::text\s+as\s+role',
    'om.role::text as role',
    'i'
  );

  v_updated := regexp_replace(
    v_updated,
    v_team_filter_pattern,
    'and om.role in (''owner'', ''admin'', ''admissions'')',
    'i'
  );

  execute v_updated;
end;
$migration$;

do $migration$
declare
  v_oid oid;
  v_def text;
  v_updated text;
begin
  select p.oid, pg_get_functiondef(p.oid)
    into v_oid, v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_team_assignment_fairness_snapshot'
    and pg_get_function_identity_arguments(p.oid) = 'p_organization_id uuid, p_start_date date, p_end_date date';

  if v_oid is null then
    raise exception 'Performance closeout: get_team_assignment_fairness_snapshot(uuid,date,date) not found';
  end if;

  if regexp_count(v_def, 'p\.role\s*=\s*''admissions''', 1, 'i') <> 1 then
    raise exception 'Performance closeout: expected one legacy Admissions role filter in get_team_assignment_fairness_snapshot';
  end if;

  v_updated := regexp_replace(
    v_def,
    'p\.role\s*=\s*''admissions''',
    'om.role = ''admissions''',
    'i'
  );

  execute v_updated;
end;
$migration$;

comment on function public.get_team_performance_snapshot(uuid, date, date) is
  'Tenant-scoped team performance snapshot. Team membership and returned role are sourced from organization_members; operational metrics remain unchanged.';

comment on function public.get_team_assignment_fairness_snapshot(uuid, date, date) is
  'Tenant-scoped assignment fairness snapshot. Admissions comparison membership is sourced from organization_members; historical assignment evidence remains activity-based and is never reconstructed.';

commit;
