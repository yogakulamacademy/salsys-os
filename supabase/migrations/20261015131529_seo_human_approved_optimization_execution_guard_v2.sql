-- OG9 v2: baseline capture + running-experiment gate before execution.

create or replace function public.start_seo_experiment_with_baseline(
  p_organization_id uuid,
  p_experiment_id uuid,
  p_baseline_days integer default 14
)
returns public.seo_experiments
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_experiment public.seo_experiments;
  v_end date;
  v_start date;
begin
  if p_organization_id is null or not public.is_organization_admin(p_organization_id) then raise exception 'Not authorized for organization'; end if;
  if p_baseline_days < 1 or p_baseline_days > 90 then raise exception 'Baseline days must be between 1 and 90'; end if;

  select * into v_experiment from public.seo_experiments
  where id=p_experiment_id and organization_id=p_organization_id for update;
  if not found then raise exception 'Experiment not found'; end if;
  if v_experiment.status <> 'approved' then raise exception 'Experiment must be approved before it can start'; end if;

  select max(date) into v_end from public.gsc_page_daily where organization_id=p_organization_id;
  if v_end is null then raise exception 'No finalized Search Console evidence is available for baseline capture'; end if;
  v_start := v_end - (p_baseline_days - 1);

  perform public.capture_seo_experiment_measurement(p_organization_id,p_experiment_id,'baseline',v_start,v_end);
  select * into v_experiment from public.transition_seo_experiment(p_organization_id,p_experiment_id,'running');
  return v_experiment;
end;
$$;

create or replace function public.transition_seo_optimization_action(
  p_organization_id uuid,
  p_action_id uuid,
  p_new_status text,
  p_evidence jsonb default '{}'::jsonb,
  p_after_state jsonb default '{}'::jsonb,
  p_error text default null
)
returns public.seo_optimization_actions
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_row public.seo_optimization_actions;
  v_experiment public.seo_experiments;
  v_is_service boolean := coalesce(auth.role(),'')='service_role';
  v_actor_kind text := case when coalesce(auth.role(),'')='service_role' then 'service' else 'user' end;
begin
  if p_organization_id is null then raise exception 'Organization is required'; end if;
  if not v_is_service and not public.is_organization_admin(p_organization_id) then raise exception 'Not authorized for organization'; end if;
  if p_new_status not in ('ready','queued','running','applied','failed','rolled_back') then raise exception 'Invalid execution status'; end if;

  select * into v_row from public.seo_optimization_actions
  where id=p_action_id and organization_id=p_organization_id for update;
  if not found then raise exception 'Optimization action not found'; end if;
  if v_row.approval_status <> 'approved' then raise exception 'Human approval is required before execution'; end if;
  if v_row.automatic_publish_enabled then raise exception 'Automatic publish must remain disabled in OG9 v1'; end if;

  if p_new_status in ('queued','running','applied') then
    select * into v_experiment from public.seo_experiments
    where id=v_row.experiment_id and organization_id=p_organization_id;
    if not found then raise exception 'Experiment not found'; end if;
    if v_experiment.status <> 'running' then raise exception 'Experiment must be running before optimization execution'; end if;
    if not exists (
      select 1 from public.seo_experiment_measurements
      where organization_id=p_organization_id and experiment_id=v_row.experiment_id and phase='baseline'
    ) then raise exception 'Baseline measurement is required before optimization execution'; end if;
  end if;

  if not (
    (v_row.execution_status='ready' and p_new_status in ('queued','running','applied')) or
    (v_row.execution_status='queued' and p_new_status in ('running','failed')) or
    (v_row.execution_status='running' and p_new_status in ('applied','failed')) or
    (v_row.execution_status='failed' and p_new_status='ready') or
    (v_row.execution_status='applied' and p_new_status='rolled_back')
  ) then raise exception 'Invalid optimization execution transition: % -> %',v_row.execution_status,p_new_status; end if;

  update public.seo_optimization_actions
  set execution_status=p_new_status,
      after_state=case when p_new_status='applied' and coalesce(p_after_state,'{}'::jsonb) <> '{}'::jsonb then p_after_state else after_state end,
      execution_evidence=case when coalesce(p_evidence,'{}'::jsonb) <> '{}'::jsonb then execution_evidence || p_evidence else execution_evidence end,
      last_error=case when p_new_status='failed' then nullif(btrim(p_error),'') when p_new_status in ('ready','running','applied') then null else last_error end,
      applied_at=case when p_new_status='applied' then coalesce(applied_at,now()) else applied_at end,
      rolled_back_at=case when p_new_status='rolled_back' then now() else rolled_back_at end,
      updated_at=now()
  where id=p_action_id and organization_id=p_organization_id returning * into v_row;

  insert into public.seo_optimization_action_events(organization_id,action_id,event_type,actor_user_id,actor_kind,event_payload)
  values (
    p_organization_id,p_action_id,'execution_'||p_new_status,
    case when v_is_service then null else auth.uid() end,v_actor_kind,
    jsonb_build_object('evidence',coalesce(p_evidence,'{}'::jsonb),'error',p_error)
  );
  return v_row;
end;
$$;
