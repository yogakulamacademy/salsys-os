-- CI-only historical recovery prerequisite.
-- These trigger-only SECURITY DEFINER functions existed in production before
-- 20261014053539_trigger_function_execute_hardening, but their creator DDL was
-- applied out-of-band and is absent from schema_migrations.
-- Definitions are recovered from the live production schema.

CREATE OR REPLACE FUNCTION public.enforce_admissions_auto_task_event_org()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lead_organization_id uuid;
begin
  select l.organization_id
  into v_lead_organization_id
  from public.leads l
  where l.id = new.lead_id;

  if v_lead_organization_id is null then
    raise exception
      'Lead % does not exist or has no organization',
      new.lead_id;
  end if;

  if new.organization_id is null then
    raise exception
      'Organization is required for admissions auto task event';
  end if;

  if new.organization_id <> v_lead_organization_id then
    raise exception
      'Organization mismatch for admissions auto task event: event organization %, lead organization %',
      new.organization_id,
      v_lead_organization_id;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_integration_connection_parent_org()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_parent_organization_id uuid;
begin
  if new.parent_connection_id is null then
    return new;
  end if;

  select organization_id
    into v_parent_organization_id
  from public.integration_connections
  where id = new.parent_connection_id;

  if not found then
    raise exception
      'Parent integration connection % does not exist',
      new.parent_connection_id;
  end if;

  if v_parent_organization_id is distinct from new.organization_id then
    raise exception
      'Parent integration connection must belong to the same organization';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_task_organization()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lead_organization_id uuid;
begin
  select l.organization_id
  into v_lead_organization_id
  from public.leads l
  where l.id = new.lead_id;

  if v_lead_organization_id is null then
    raise exception
      'Lead % does not exist or has no organization',
      new.lead_id;
  end if;

  if new.organization_id is null then
    raise exception
      'Organization is required for task';
  end if;

  if new.organization_id <> v_lead_organization_id then
    raise exception
      'Organization mismatch for task: task organization %, lead organization %',
      new.organization_id,
      v_lead_organization_id;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.release_physical_room_with_accommodation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if
    old.status in ('reserved','confirmed')
    and new.status in ('released','cancelled')
  then
    update public.enrollment_room_assignments
    set
      status = new.status,
      released_at = coalesce(released_at, now())
    where
      accommodation_assignment_id = new.id
      and status in ('reserved','confirmed');
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_course_batch_admin_event_organization()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_organization_id uuid;
begin
  select cb.organization_id
  into v_organization_id
  from public.course_batches cb
  where cb.id = new.batch_id;

  if v_organization_id is null then
    raise exception
      'Unable to create batch audit event: batch not found';
  end if;

  if new.organization_id is not null
     and new.organization_id <> v_organization_id then
    raise exception
      'Audit event organization does not match batch organization';
  end if;

  new.organization_id := v_organization_id;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_integration_child_organization()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_organization_id uuid;
begin
  if new.connection_id is null then
    return new;
  end if;

  select organization_id
  into v_organization_id
  from public.integration_connections
  where id = new.connection_id;

  if not found then
    raise exception
      'Integration connection % does not exist',
      new.connection_id;
  end if;

  if v_organization_id is null then
    raise exception
      'Integration connection % has no organization',
      new.connection_id;
  end if;

  new.organization_id := v_organization_id;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_batch_changes_to_leads()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
    update public.leads
    set
        interested_course_id = new.course_id,
        preferred_location = new.location,
        preferred_month = new.start_date,
        preferred_mode = new.mode,
        expected_close_date =
            case
                when expected_close_date is null
                    or expected_close_date = old.start_date
                then new.start_date
                else expected_close_date
            end,
        potential_value =
            case
                when potential_value_source is null
                    or potential_value_source = 'batch_default'
                then new.expected_value
                else potential_value
            end,
        potential_currency =
            case
                when potential_value_source is null
                    or potential_value_source = 'batch_default'
                then upper(new.currency)
                else potential_currency
            end,
        potential_value_source =
            case
                when
                    (potential_value_source is null
                     or potential_value_source = 'batch_default')
                    and new.expected_value is not null
                then 'batch_default'
                when
                    (potential_value_source is null
                     or potential_value_source = 'batch_default')
                    and new.expected_value is null
                then null
                else potential_value_source
            end
    where preferred_batch_id = new.id;

    return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_lead_from_preferred_batch()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    batch_record record;
begin
    if new.preferred_batch_id is null then
        return new;
    end if;

    select
        cb.id,
        cb.organization_id,
        cb.course_id,
        cb.location,
        cb.mode,
        cb.start_date,
        cb.end_date,
        cb.expected_value,
        cb.currency
    into batch_record
    from public.course_batches cb
    where cb.id = new.preferred_batch_id;

    if not found then
        return new;
    end if;

    if new.organization_id is null then
        raise exception
            'Lead organization is required when selecting a preferred batch';
    end if;

    if batch_record.organization_id is distinct from new.organization_id then
        raise exception
            'Preferred batch belongs to a different organization';
    end if;

    new.interested_course_id := batch_record.course_id;
    new.preferred_location := batch_record.location;
    new.preferred_month := batch_record.start_date;
    new.preferred_mode := batch_record.mode;

    if
        new.expected_close_date is null
        or new.preferred_batch_id is distinct from old.preferred_batch_id
    then
        new.expected_close_date := batch_record.start_date;
    end if;

    if
        new.potential_value is null
        or new.potential_value_source is null
        or new.potential_value_source = 'batch_default'
    then
        new.potential_value := batch_record.expected_value;

        new.potential_currency :=
            case
                when batch_record.currency is not null
                then upper(batch_record.currency)
                else null
            end;

        new.potential_value_source :=
            case
                when batch_record.expected_value is not null
                then 'batch_default'
                else null
            end;
    end if;

    return new;
end;
$function$;
