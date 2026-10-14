begin;

-- W8 Tenant Isolation: move mutable CRM forecasting/aging configuration onto
-- organization-scoped override tables while retaining the existing global rows
-- as immutable defaults. Existing organizations receive explicit copies so
-- behavior is unchanged at cutover; future organizations can fall back to the
-- global defaults until they customize their own settings.

create table if not exists public.organization_lead_stage_probabilities (
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  stage text not null,
  probability numeric not null
    check (probability >= 0 and probability <= 1),
  updated_at timestamptz not null default now(),
  primary key (organization_id, stage)
);

create table if not exists public.organization_pipeline_stage_aging_rules (
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  stage text not null,
  warning_after_days numeric not null
    check (warning_after_days >= 0),
  stuck_after_days numeric not null,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, stage),
  check (stuck_after_days >= warning_after_days)
);

create table if not exists public.organization_crm_settings_audit (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  setting_group text not null,
  setting_key text not null,
  previous_value jsonb,
  new_value jsonb not null,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index if not exists idx_org_crm_settings_audit_org_changed
  on public.organization_crm_settings_audit (organization_id, changed_at desc);

insert into public.organization_lead_stage_probabilities (
  organization_id, stage, probability, updated_at
)
select o.id, p.stage, p.probability, p.updated_at
from public.organizations o
cross join public.lead_stage_probabilities p
on conflict (organization_id, stage) do nothing;

insert into public.organization_pipeline_stage_aging_rules (
  organization_id,
  stage,
  warning_after_days,
  stuck_after_days,
  active,
  notes,
  created_at,
  updated_at
)
select
  o.id,
  r.stage,
  r.warning_after_days,
  r.stuck_after_days,
  r.active,
  r.notes,
  r.created_at,
  r.updated_at
from public.organizations o
cross join public.pipeline_stage_aging_rules r
on conflict (organization_id, stage) do nothing;

alter table public.organization_lead_stage_probabilities enable row level security;
alter table public.organization_pipeline_stage_aging_rules enable row level security;
alter table public.organization_crm_settings_audit enable row level security;

revoke all on table public.organization_lead_stage_probabilities from public, anon, authenticated;
revoke all on table public.organization_pipeline_stage_aging_rules from public, anon, authenticated;
revoke all on table public.organization_crm_settings_audit from public, anon, authenticated;

grant select on table public.organization_lead_stage_probabilities to authenticated;
grant select on table public.organization_pipeline_stage_aging_rules to authenticated;
grant select on table public.organization_crm_settings_audit to authenticated;
grant all on table public.organization_lead_stage_probabilities to service_role;
grant all on table public.organization_pipeline_stage_aging_rules to service_role;
grant all on table public.organization_crm_settings_audit to service_role;

drop policy if exists organization_lead_stage_probabilities_select
  on public.organization_lead_stage_probabilities;
create policy organization_lead_stage_probabilities_select
  on public.organization_lead_stage_probabilities
  for select to authenticated
  using (public.is_organization_member(organization_id));

drop policy if exists organization_pipeline_stage_aging_rules_select
  on public.organization_pipeline_stage_aging_rules;
create policy organization_pipeline_stage_aging_rules_select
  on public.organization_pipeline_stage_aging_rules
  for select to authenticated
  using (public.is_organization_member(organization_id));

drop policy if exists organization_crm_settings_audit_select
  on public.organization_crm_settings_audit;
create policy organization_crm_settings_audit_select
  on public.organization_crm_settings_audit
  for select to authenticated
  using (public.is_organization_member(organization_id));

create or replace function public.get_crm_stage_settings_v2(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  probability_rows jsonb := '[]'::jsonb;
  aging_rows jsonb := '[]'::jsonb;
begin
  if p_organization_id is null then
    raise exception 'Organization ID is required';
  end if;

  if auth.role() <> 'service_role'
     and not public.is_organization_member(p_organization_id)
  then
    raise exception 'Not authorized for organization';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'stage', x.stage,
        'probability', x.probability,
        'probability_percent', round(x.probability * 100, 2),
        'updated_at', x.updated_at
      )
      order by
        case x.stage
          when 'new' then 10
          when 'contacted' then 20
          when 'engaged' then 30
          when 'qualified' then 40
          when 'high_intent' then 50
          when 'payment_pending' then 60
          when 'enrolled' then 70
          when 'nurture' then 80
          when 'not_now' then 90
          when 'lost' then 100
          when 'unqualified' then 110
          when 'duplicate' then 120
          else 999
        end,
        x.stage
    ),
    '[]'::jsonb
  )
  into probability_rows
  from (
    select
      g.stage,
      coalesce(t.probability, g.probability) as probability,
      coalesce(t.updated_at, g.updated_at) as updated_at
    from public.lead_stage_probabilities g
    left join public.organization_lead_stage_probabilities t
      on t.organization_id = p_organization_id
     and t.stage = g.stage

    union all

    select t.stage, t.probability, t.updated_at
    from public.organization_lead_stage_probabilities t
    where t.organization_id = p_organization_id
      and not exists (
        select 1
        from public.lead_stage_probabilities g
        where g.stage = t.stage
      )
  ) x;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'stage', x.stage,
        'warning_hours', x.warning_after_days * 24,
        'stuck_hours', x.stuck_after_days * 24
      )
      order by
        case x.stage
          when 'new' then 10
          when 'contacted' then 20
          when 'engaged' then 30
          when 'qualified' then 40
          when 'high_intent' then 50
          when 'payment_pending' then 60
          when 'enrolled' then 70
          when 'nurture' then 80
          when 'not_now' then 90
          when 'lost' then 100
          when 'unqualified' then 110
          when 'duplicate' then 120
          else 999
        end,
        x.stage
    ),
    '[]'::jsonb
  )
  into aging_rows
  from (
    select
      g.stage,
      coalesce(t.warning_after_days, g.warning_after_days) as warning_after_days,
      coalesce(t.stuck_after_days, g.stuck_after_days) as stuck_after_days
    from public.pipeline_stage_aging_rules g
    left join public.organization_pipeline_stage_aging_rules t
      on t.organization_id = p_organization_id
     and t.stage = g.stage

    union all

    select t.stage, t.warning_after_days, t.stuck_after_days
    from public.organization_pipeline_stage_aging_rules t
    where t.organization_id = p_organization_id
      and not exists (
        select 1
        from public.pipeline_stage_aging_rules g
        where g.stage = t.stage
      )
  ) x;

  return jsonb_build_object(
    'forecast_probabilities', probability_rows,
    'pipeline_aging', aging_rows,
    'pipeline_aging_schema', jsonb_build_object(
      'table_exists', true,
      'stage_column', 'stage',
      'warning_column', 'warning_after_days',
      'stuck_column', 'stuck_after_days',
      'warning_unit', 'days',
      'stuck_unit', 'days'
    ),
    'permissions', jsonb_build_object(
      'can_manage', public.can_administer_organization_crm(p_organization_id)
    )
  );
end;
$function$;

create or replace function public.get_crm_settings_audit_v2(
  p_organization_id uuid,
  p_limit integer default 30
)
returns table (
  id uuid,
  setting_group text,
  setting_key text,
  previous_value jsonb,
  new_value jsonb,
  changed_by uuid,
  changed_by_name text,
  changed_at timestamptz
)
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
  select
    a.id,
    a.setting_group,
    a.setting_key,
    a.previous_value,
    a.new_value,
    a.changed_by,
    p.full_name as changed_by_name,
    a.changed_at
  from public.organization_crm_settings_audit a
  left join public.profiles p on p.id = a.changed_by
  where a.organization_id = p_organization_id
    and (
      auth.role() = 'service_role'
      or public.is_organization_member(p_organization_id)
    )
  order by a.changed_at desc
  limit greatest(1, least(coalesce(p_limit, 30), 100));
$function$;

create or replace function public.update_crm_stage_probability_v2(
  p_organization_id uuid,
  p_stage text,
  p_probability numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_stage text;
  previous_probability numeric;
  updated_probability numeric;
begin
  if p_organization_id is null then
    raise exception 'Organization ID is required';
  end if;

  if auth.role() <> 'service_role'
     and not public.can_administer_organization_crm(p_organization_id)
  then
    raise exception 'Only organization CRM administrators/managers can change forecast probabilities';
  end if;

  v_stage := lower(trim(p_stage));
  if v_stage is null or v_stage = '' then
    raise exception 'Stage is required';
  end if;

  if p_probability is null or p_probability < 0 or p_probability > 1 then
    raise exception 'Probability must be between 0 and 1';
  end if;

  select coalesce(t.probability, g.probability)
  into previous_probability
  from public.lead_stage_probabilities g
  left join public.organization_lead_stage_probabilities t
    on t.organization_id = p_organization_id
   and t.stage = g.stage
  where g.stage = v_stage;

  if previous_probability is null then
    select t.probability
    into previous_probability
    from public.organization_lead_stage_probabilities t
    where t.organization_id = p_organization_id
      and t.stage = v_stage;
  end if;

  if previous_probability is null then
    raise exception 'Unknown forecast stage: %', v_stage;
  end if;

  insert into public.organization_lead_stage_probabilities (
    organization_id, stage, probability, updated_at
  ) values (
    p_organization_id, v_stage, round(p_probability, 4), now()
  )
  on conflict (organization_id, stage)
  do update set
    probability = excluded.probability,
    updated_at = now()
  returning probability into updated_probability;

  insert into public.organization_crm_settings_audit (
    organization_id,
    setting_group,
    setting_key,
    previous_value,
    new_value,
    changed_by
  ) values (
    p_organization_id,
    'revenue_forecast',
    v_stage,
    jsonb_build_object('probability', previous_probability),
    jsonb_build_object('probability', updated_probability),
    auth.uid()
  );

  return jsonb_build_object(
    'ok', true,
    'stage', v_stage,
    'probability', updated_probability,
    'probability_percent', round(updated_probability * 100, 2)
  );
end;
$function$;

create or replace function public.update_crm_pipeline_aging_rule_v2(
  p_organization_id uuid,
  p_stage text,
  p_warning_hours numeric,
  p_stuck_hours numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_stage text;
  v_warning_days numeric;
  v_stuck_days numeric;
  v_previous jsonb;
  v_active boolean := true;
  v_notes text;
begin
  if p_organization_id is null then
    raise exception 'Organization ID is required';
  end if;

  if auth.role() <> 'service_role'
     and not public.can_administer_organization_crm(p_organization_id)
  then
    raise exception 'Only organization CRM administrators/managers can change pipeline aging rules';
  end if;

  v_stage := lower(trim(p_stage));
  if v_stage is null or v_stage = '' then
    raise exception 'Stage is required';
  end if;

  if p_warning_hours is null or p_warning_hours < 0 then
    raise exception 'Warning threshold must be 0 hours or greater';
  end if;

  if p_stuck_hours is null or p_stuck_hours <= p_warning_hours then
    raise exception 'Stuck threshold must be greater than warning threshold';
  end if;

  select jsonb_build_object(
           'warning_hours', coalesce(t.warning_after_days, g.warning_after_days) * 24,
           'stuck_hours', coalesce(t.stuck_after_days, g.stuck_after_days) * 24
         ),
         coalesce(t.active, g.active),
         coalesce(t.notes, g.notes)
  into v_previous, v_active, v_notes
  from public.pipeline_stage_aging_rules g
  left join public.organization_pipeline_stage_aging_rules t
    on t.organization_id = p_organization_id
   and t.stage = g.stage
  where g.stage = v_stage;

  if v_previous is null then
    select jsonb_build_object(
             'warning_hours', t.warning_after_days * 24,
             'stuck_hours', t.stuck_after_days * 24
           ),
           t.active,
           t.notes
    into v_previous, v_active, v_notes
    from public.organization_pipeline_stage_aging_rules t
    where t.organization_id = p_organization_id
      and t.stage = v_stage;
  end if;

  if v_previous is null then
    raise exception 'No pipeline aging rule exists for stage: %', v_stage;
  end if;

  v_warning_days := p_warning_hours / 24.0;
  v_stuck_days := p_stuck_hours / 24.0;

  insert into public.organization_pipeline_stage_aging_rules (
    organization_id,
    stage,
    warning_after_days,
    stuck_after_days,
    active,
    notes,
    created_at,
    updated_at
  ) values (
    p_organization_id,
    v_stage,
    v_warning_days,
    v_stuck_days,
    coalesce(v_active, true),
    v_notes,
    now(),
    now()
  )
  on conflict (organization_id, stage)
  do update set
    warning_after_days = excluded.warning_after_days,
    stuck_after_days = excluded.stuck_after_days,
    updated_at = now();

  insert into public.organization_crm_settings_audit (
    organization_id,
    setting_group,
    setting_key,
    previous_value,
    new_value,
    changed_by
  ) values (
    p_organization_id,
    'pipeline_aging',
    v_stage,
    v_previous,
    jsonb_build_object(
      'warning_hours', p_warning_hours,
      'stuck_hours', p_stuck_hours
    ),
    auth.uid()
  );

  return jsonb_build_object(
    'ok', true,
    'stage', v_stage,
    'warning_hours', p_warning_hours,
    'stuck_hours', p_stuck_hours
  );
end;
$function$;

revoke all on function public.get_crm_stage_settings_v2(uuid) from public, anon;
revoke all on function public.get_crm_settings_audit_v2(uuid, integer) from public, anon;
revoke all on function public.update_crm_stage_probability_v2(uuid, text, numeric) from public, anon;
revoke all on function public.update_crm_pipeline_aging_rule_v2(uuid, text, numeric, numeric) from public, anon;

grant execute on function public.get_crm_stage_settings_v2(uuid) to authenticated, service_role;
grant execute on function public.get_crm_settings_audit_v2(uuid, integer) to authenticated, service_role;
grant execute on function public.update_crm_stage_probability_v2(uuid, text, numeric) to authenticated, service_role;
grant execute on function public.update_crm_pipeline_aging_rule_v2(uuid, text, numeric, numeric) to authenticated, service_role;

create or replace view public.v_revenue_forecast
with (security_invoker = true)
as
select
  l.id,
  l.lead_code,
  trim(both from concat_ws(' ', l.first_name, l.last_name)) as lead_name,
  l.current_stage,
  l.preferred_location,
  l.preferred_month,
  l.preferred_mode,
  l.first_touch_source,
  l.first_touch_medium,
  l.first_touch_campaign,
  l.lead_creation_channel,
  l.expected_close_date,
  l.created_at,
  coalesce(l.potential_value, latest_enrollment.total_value) as potential_value,
  coalesce(l.potential_currency, latest_enrollment.currency, 'INR'::text) as currency,
  coalesce(tenant_probability.probability, default_probability.probability, 0::numeric) as probability,
  round(
    coalesce(l.potential_value, latest_enrollment.total_value, 0::numeric)
    * coalesce(tenant_probability.probability, default_probability.probability, 0::numeric),
    2
  ) as weighted_value,
  case
    when l.current_stage = 'enrolled'::public.lead_stage
      then coalesce(latest_enrollment.total_value, l.potential_value, 0::numeric)
    else 0::numeric
  end as actual_revenue,
  date_trunc('month', coalesce(l.expected_close_date, l.created_at::date)::timestamptz)::date as forecast_month,
  l.organization_id
from public.leads l
left join public.organization_lead_stage_probabilities tenant_probability
  on tenant_probability.organization_id = l.organization_id
 and tenant_probability.stage = l.current_stage::text
left join public.lead_stage_probabilities default_probability
  on default_probability.stage = l.current_stage::text
left join lateral (
  select e.total_value, e.currency
  from public.enrollments e
  where e.lead_id = l.id
    and e.organization_id = l.organization_id
  order by e.created_at desc
  limit 1
) latest_enrollment on true;

create or replace view public.v_pipeline_stage_aging
with (security_invoker = true)
as
with current_stage_entry as (
  select
    l0.id as lead_id,
    coalesce(
      (
        select lsh.changed_at
        from public.lead_stage_history lsh
        where lsh.lead_id = l0.id
          and lsh.to_stage::text = l0.current_stage::text
        order by lsh.changed_at desc, lsh.id desc
        limit 1
      ),
      l0.created_at
    ) as stage_entered_at
  from public.leads l0
)
select
  l.id as lead_id,
  l.lead_code,
  coalesce(
    nullif(btrim(l.display_name), ''),
    nullif(btrim(concat_ws(' ', l.first_name, l.last_name)), ''),
    l.lead_code
  ) as lead_name,
  l.current_stage::text as current_stage,
  l.status::text as lead_status,
  l.intent::text as intent,
  l.owner_user_id,
  p.full_name as owner_name,
  l.interested_course_id,
  c.code as course_code,
  c.name as course_name,
  l.preferred_batch_id,
  cb.batch_code,
  cb.location as batch_location,
  cb.start_date as batch_start_date,
  cb.end_date as batch_end_date,
  l.preferred_location,
  l.preferred_month,
  l.preferred_mode,
  l.lead_creation_channel::text as lead_creation_channel,
  l.current_contact_channel::text as current_contact_channel,
  l.last_contacted_at,
  l.next_followup_at,
  l.last_inbound_at,
  l.last_outbound_at,
  l.created_at as lead_created_at,
  cse.stage_entered_at,
  greatest(extract(epoch from (now() - cse.stage_entered_at)) / 3600.0, 0::numeric)::numeric(12,2) as stage_age_hours,
  greatest(extract(epoch from (now() - cse.stage_entered_at)) / 86400.0, 0::numeric)::numeric(12,2) as stage_age_days,
  coalesce(tenant_rule.warning_after_days, default_rule.warning_after_days) as warning_after_days,
  coalesce(tenant_rule.stuck_after_days, default_rule.stuck_after_days) as stuck_after_days,
  case
    when coalesce(tenant_rule.stage, default_rule.stage) is null
      or coalesce(tenant_rule.active, default_rule.active) is not true
      then 'untracked'::text
    when (extract(epoch from (now() - cse.stage_entered_at)) / 86400.0)
      >= coalesce(tenant_rule.stuck_after_days, default_rule.stuck_after_days)
      then 'stuck'::text
    when (extract(epoch from (now() - cse.stage_entered_at)) / 86400.0)
      >= coalesce(tenant_rule.warning_after_days, default_rule.warning_after_days)
      then 'warning'::text
    else 'healthy'::text
  end as aging_status,
  case
    when coalesce(tenant_rule.stage, default_rule.stage) is null
      or coalesce(tenant_rule.active, default_rule.active) is not true
      then null::numeric
    when (extract(epoch from (now() - cse.stage_entered_at)) / 86400.0)
      >= coalesce(tenant_rule.stuck_after_days, default_rule.stuck_after_days)
      then greatest(
        (extract(epoch from (now() - cse.stage_entered_at)) / 86400.0)
        - coalesce(tenant_rule.stuck_after_days, default_rule.stuck_after_days),
        0::numeric
      )::numeric(12,2)
    else 0::numeric(12,2)
  end as days_over_stuck_threshold,
  case
    when l.last_contacted_at is null then null::numeric
    else greatest(extract(epoch from (now() - l.last_contacted_at)) / 86400.0, 0::numeric)::numeric(12,2)
  end as days_since_last_contact
from public.leads l
join current_stage_entry cse on cse.lead_id = l.id
left join public.organization_pipeline_stage_aging_rules tenant_rule
  on tenant_rule.organization_id = l.organization_id
 and tenant_rule.stage = l.current_stage::text
left join public.pipeline_stage_aging_rules default_rule
  on default_rule.stage = l.current_stage::text
left join public.profiles p on p.id = l.owner_user_id
left join public.courses c on c.id = l.interested_course_id
left join public.course_batches cb on cb.id = l.preferred_batch_id;

commit;
