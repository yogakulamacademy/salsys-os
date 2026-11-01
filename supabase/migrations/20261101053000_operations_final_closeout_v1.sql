-- Operations final closeout v1
--
-- Keep the existing tenant-authorized Course Management RPC and metric formulas,
-- but make every "upcoming" / future-capacity cohort use the authoritative
-- batch start date. Missing or zero capacity remains missing evidence rather
-- than a configured zero-seat batch.

begin;

do $migration$
declare
  v_oid oid;
  v_def text;
  v_updated text;
  v_end_boundary_pattern text := 'b\.end_date\s+is\s+null\s+or\s+b\.end_date\s+>=\s+p\.today_date';
begin
  select p.oid, pg_get_functiondef(p.oid)
    into v_oid, v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_course_management_workspace_v2'
    and pg_get_function_identity_arguments(p.oid) = 'p_organization_id uuid, p_query text, p_location text, p_state text';

  if v_oid is null then
    raise exception 'Operations closeout: get_course_management_workspace_v2(uuid,text,text,text) not found';
  end if;

  if regexp_count(v_def, v_end_boundary_pattern, 1, 'i') <> 3 then
    raise exception 'Operations closeout: expected three legacy end-date upcoming boundaries in Course Management RPC';
  end if;

  if regexp_count(v_def, 'where\s+capacity\s+is\s+null', 1, 'i') <> 1 then
    raise exception 'Operations closeout: expected one legacy missing-capacity summary predicate';
  end if;

  v_updated := regexp_replace(
    v_def,
    v_end_boundary_pattern,
    'b.start_date >= p.today_date',
    'gi'
  );

  v_updated := regexp_replace(
    v_updated,
    'where\s+capacity\s+is\s+null',
    'where capacity is null or capacity <= 0',
    'i'
  );

  execute v_updated;
end;
$migration$;

comment on function public.get_course_management_workspace_v2(uuid, text, text, text) is
  'Tenant-scoped Course Management workspace. Upcoming/open capacity cohorts use batch start_date >= current_date; missing or non-positive capacity remains incomplete setup rather than known availability.';

commit;
