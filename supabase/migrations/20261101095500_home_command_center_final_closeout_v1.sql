-- Home / Command Center final closeout v1
--
-- Keep the existing tenant-authorized dashboard snapshot and all metric formulas,
-- but align its "upcoming demand" cohort with the canonical future-capacity
-- boundary already enforced by Admissions and Operations: batch start_date must
-- be today or later. Already-started batches must not re-enter Home merely
-- because their recorded end_date is still in the future.

begin;

do $migration$
declare
  v_oid oid;
  v_def text;
  v_updated text;
  v_legacy_pattern text := 'and\s+b\.end_date\s+>=\s+current_date';
begin
  select p.oid, pg_get_functiondef(p.oid)
    into v_oid, v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_dashboard_snapshot_internal_v1'
    and pg_get_function_identity_arguments(p.oid) = 'p_organization_id uuid';

  if v_oid is null then
    raise exception 'Home closeout: get_dashboard_snapshot_internal_v1(uuid) not found';
  end if;

  if regexp_count(v_def, v_legacy_pattern, 1, 'i') <> 1 then
    raise exception 'Home closeout: expected exactly one legacy end-date upcoming boundary';
  end if;

  if regexp_count(v_def, 'and\s+b\.start_date\s+>=\s+current_date', 1, 'i') <> 0 then
    raise exception 'Home closeout: future-start boundary already present unexpectedly';
  end if;

  v_updated := regexp_replace(
    v_def,
    v_legacy_pattern,
    'and b.start_date >= current_date',
    'i'
  );

  execute v_updated;
end;
$migration$;

comment on function public.get_dashboard_snapshot_internal_v1(uuid) is
  'Internal compact dashboard snapshot. Upcoming batch demand uses the canonical future-start boundary start_date >= current_date; already-started batches do not enter future operational demand.';

commit;
