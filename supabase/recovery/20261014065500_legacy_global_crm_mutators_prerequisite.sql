begin;

-- CI-only historical recovery prerequisite.
-- These global CRM-setting mutators existed out-of-band before
-- 20261014065535_legacy_global_crm_settings_mutator_hardening.sql revoked
-- authenticated EXECUTE. Production already contains their hardened forms.
-- Do not promote this file into the normal migration ledger.

create or replace function public.update_crm_stage_probability(
  p_stage text,
  p_probability numeric
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  previous_probability numeric;
  updated_probability numeric;
begin
  if not public.can_manage_crm_settings() then
    raise exception 'Only CRM administrators/managers can change forecast probabilities';
  end if;

  p_stage := lower(trim(p_stage));

  if p_stage is null or p_stage = '' then
    raise exception 'Stage is required';
  end if;

  if p_probability is null
     or p_probability < 0
     or p_probability > 1
  then
    raise exception 'Probability must be between 0 and 1';
  end if;

  select probability
  into previous_probability
  from public.lead_stage_probabilities
  where stage = p_stage
  for update;

  if not found then
    raise exception 'Unknown forecast stage: %', p_stage;
  end if;

  update public.lead_stage_probabilities
  set
    probability = round(p_probability, 4),
    updated_at = now()
  where stage = p_stage
  returning probability
  into updated_probability;

  insert into public.crm_settings_audit (
    setting_group,
    setting_key,
    previous_value,
    new_value,
    changed_by
  )
  values (
    'revenue_forecast',
    p_stage,
    jsonb_build_object(
      'probability', previous_probability
    ),
    jsonb_build_object(
      'probability', updated_probability
    ),
    auth.uid()
  );

  return jsonb_build_object(
    'ok', true,
    'stage', p_stage,
    'probability', updated_probability,
    'probability_percent',
      round(updated_probability * 100, 2)
  );
end;
$function$;

create or replace function public.update_crm_pipeline_aging_rule(
  p_stage text,
  p_warning_hours numeric,
  p_stuck_hours numeric
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  stage_col text;
  warning_col text;
  stuck_col text;

  warning_is_days boolean := false;
  stuck_is_days boolean := false;

  warning_value numeric;
  stuck_value numeric;

  previous_row jsonb;
  updated_rows integer := 0;
begin
  if not public.can_manage_crm_settings() then
    raise exception 'Only CRM administrators/managers can change pipeline aging rules';
  end if;

  p_stage := lower(trim(p_stage));

  if p_stage is null or p_stage = '' then
    raise exception 'Stage is required';
  end if;

  if p_warning_hours is null
     or p_warning_hours < 0
  then
    raise exception 'Warning threshold must be 0 hours or greater';
  end if;

  if p_stuck_hours is null
     or p_stuck_hours <= p_warning_hours
  then
    raise exception 'Stuck threshold must be greater than warning threshold';
  end if;

  if to_regclass('public.pipeline_stage_aging_rules') is null then
    raise exception 'pipeline_stage_aging_rules table does not exist';
  end if;

  select c.column_name
  into stage_col
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'pipeline_stage_aging_rules'
    and c.column_name in (
      'stage',
      'current_stage',
      'lead_stage'
    )
  order by
    case c.column_name
      when 'stage' then 1
      when 'current_stage' then 2
      when 'lead_stage' then 3
      else 99
    end
  limit 1;

  select c.column_name
  into warning_col
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'pipeline_stage_aging_rules'
    and c.column_name in (
      'warning_after_hours',
      'warning_hours',
      'warning_age_hours',
      'warning_threshold_hours',
      'warning_after_days',
      'warning_days',
      'warning_threshold_days'
    )
  order by
    case c.column_name
      when 'warning_after_hours' then 1
      when 'warning_hours' then 2
      when 'warning_age_hours' then 3
      when 'warning_threshold_hours' then 4
      when 'warning_after_days' then 5
      when 'warning_days' then 6
      when 'warning_threshold_days' then 7
      else 99
    end
  limit 1;

  select c.column_name
  into stuck_col
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'pipeline_stage_aging_rules'
    and c.column_name in (
      'stuck_after_hours',
      'stuck_hours',
      'stuck_age_hours',
      'stuck_threshold_hours',
      'stuck_after_days',
      'stuck_days',
      'stuck_threshold_days'
    )
  order by
    case c.column_name
      when 'stuck_after_hours' then 1
      when 'stuck_hours' then 2
      when 'stuck_age_hours' then 3
      when 'stuck_threshold_hours' then 4
      when 'stuck_after_days' then 5
      when 'stuck_days' then 6
      when 'stuck_threshold_days' then 7
      else 99
    end
  limit 1;

  if stage_col is null
     or warning_col is null
     or stuck_col is null
  then
    raise exception
      'Unable to detect pipeline aging columns. stage=%, warning=%, stuck=%',
      stage_col,
      warning_col,
      stuck_col;
  end if;

  warning_is_days := warning_col like '%days%';
  stuck_is_days := stuck_col like '%days%';

  warning_value :=
    case
      when warning_is_days then p_warning_hours / 24.0
      else p_warning_hours
    end;

  stuck_value :=
    case
      when stuck_is_days then p_stuck_hours / 24.0
      else p_stuck_hours
    end;

  execute format(
    'select to_jsonb(r)
       from public.pipeline_stage_aging_rules r
      where %I::text = $1
      limit 1',
    stage_col
  )
  into previous_row
  using p_stage;

  if previous_row is null then
    raise exception 'No pipeline aging rule exists for stage: %', p_stage;
  end if;

  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'pipeline_stage_aging_rules'
      and c.column_name = 'updated_at'
  ) then
    execute format(
      'update public.pipeline_stage_aging_rules
          set %I = $1,
              %I = $2,
              updated_at = now()
        where %I::text = $3',
      warning_col,
      stuck_col,
      stage_col
    )
    using warning_value, stuck_value, p_stage;
  else
    execute format(
      'update public.pipeline_stage_aging_rules
          set %I = $1,
              %I = $2
        where %I::text = $3',
      warning_col,
      stuck_col,
      stage_col
    )
    using warning_value, stuck_value, p_stage;
  end if;

  get diagnostics updated_rows = row_count;

  if updated_rows <> 1 then
    raise exception
      'Expected to update 1 pipeline aging row for %, updated %',
      p_stage,
      updated_rows;
  end if;

  insert into public.crm_settings_audit (
    setting_group,
    setting_key,
    previous_value,
    new_value,
    changed_by
  )
  values (
    'pipeline_aging',
    p_stage,
    previous_row,
    jsonb_build_object(
      'warning_hours', p_warning_hours,
      'stuck_hours', p_stuck_hours
    ),
    auth.uid()
  );

  return jsonb_build_object(
    'ok', true,
    'stage', p_stage,
    'warning_hours', p_warning_hours,
    'stuck_hours', p_stuck_hours,
    'storage',
      jsonb_build_object(
        'stage_column', stage_col,
        'warning_column', warning_col,
        'stuck_column', stuck_col,
        'warning_unit',
          case
            when warning_is_days then 'days'
            else 'hours'
          end,
        'stuck_unit',
          case
            when stuck_is_days then 'days'
            else 'hours'
          end
      )
  );
end;
$function$;

commit;
