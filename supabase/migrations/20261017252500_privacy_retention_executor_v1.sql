-- Privacy retention executor v1
-- Policy-driven, tenant-scoped, legal-hold-aware retention automation.
-- Enforcement defaults OFF per organization. Only explicitly enabled policies are considered.

create table if not exists public.privacy_automation_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  retention_execution_enabled boolean not null default false,
  retention_dry_run boolean not null default true,
  max_actions_per_run integer not null default 100,
  updated_at timestamptz not null default now(),
  check (max_actions_per_run between 1 and 1000)
);

insert into public.privacy_automation_settings (organization_id)
select id from public.organizations
on conflict (organization_id) do nothing;

create table if not exists public.privacy_retention_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  policy_id uuid not null references public.privacy_retention_policies(id) on delete cascade,
  data_category text not null,
  record_id uuid not null,
  requested_action text not null,
  status text not null default 'planned',
  eligible_at timestamptz not null,
  held_reason text,
  execution_error text,
  before_fingerprint text,
  executed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, policy_id, record_id),
  check (requested_action in ('review','delete','anonymize')),
  check (status in ('planned','held','executed','failed','skipped','review_required'))
);

create index if not exists idx_privacy_retention_actions_pending
  on public.privacy_retention_actions(organization_id,status,eligible_at)
  where status in ('planned','failed');

alter table public.privacy_automation_settings enable row level security;
alter table public.privacy_retention_actions enable row level security;

drop policy if exists privacy_automation_settings_member_read on public.privacy_automation_settings;
create policy privacy_automation_settings_member_read on public.privacy_automation_settings
for select using (
  exists (
    select 1 from public.organization_members m
    where m.organization_id=privacy_automation_settings.organization_id
      and m.user_id=auth.uid() and m.active
  )
);

drop policy if exists privacy_retention_actions_member_read on public.privacy_retention_actions;
create policy privacy_retention_actions_member_read on public.privacy_retention_actions
for select using (
  exists (
    select 1 from public.organization_members m
    where m.organization_id=privacy_retention_actions.organization_id
      and m.user_id=auth.uid() and m.active
  )
);

create or replace function public.privacy_retention_has_hold_v1(
  p_organization_id uuid,
  p_person_id uuid default null,
  p_lead_id uuid default null,
  p_anonymous_visitor_id text default null
) returns boolean
language sql
stable
security definer
set search_path=public,auth,pg_temp
as $$
select exists (
  select 1
  from public.privacy_legal_holds h
  where h.organization_id=p_organization_id
    and h.active
    and h.starts_at <= now()
    and (h.ends_at is null or h.ends_at > now())
    and (
      (p_person_id is not null and h.person_id=p_person_id)
      or (p_lead_id is not null and h.lead_id=p_lead_id)
      or (
        nullif(btrim(coalesce(p_anonymous_visitor_id,'')),'') is not null
        and exists (
          select 1
          from public.web_sessions ws
          left join public.person_sessions ps
            on ps.organization_id=ws.organization_id
           and ps.web_session_id=ws.id
          left join public.person_leads pl
            on pl.organization_id=ws.organization_id
           and pl.lead_id=ws.lead_id
          where ws.organization_id=p_organization_id
            and ws.anonymous_visitor_id=btrim(p_anonymous_visitor_id)
            and (
              (h.person_id is not null and h.person_id=coalesce(ps.person_id,pl.person_id))
              or (h.lead_id is not null and h.lead_id=ws.lead_id)
            )
        )
      )
    )
);
$$;

create or replace function public.plan_privacy_retention_v1(
  p_organization_id uuid,
  p_limit integer default 500
) returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_policy public.privacy_retention_policies%rowtype;
  v_row record;
  v_planned integer:=0;
  v_held integer:=0;
  v_status text;
  v_person uuid;
  v_hold boolean;
begin
  if not exists(select 1 from public.organizations where id=p_organization_id) then
    return jsonb_build_object('ok',false,'reason','organization_not_found');
  end if;

  for v_policy in
    select * from public.privacy_retention_policies
    where organization_id=p_organization_id
      and enabled
      and retention_days is not null
    order by created_at
  loop
    if v_planned+v_held >= greatest(1,least(coalesce(p_limit,500),2000)) then exit; end if;

    if v_policy.data_category='raw_events' then
      for v_row in
        select r.id,r.received_at,r.anonymous_visitor_id,
               nullif(r.metadata->>'lead_id','')::uuid as lead_id
        from public.raw_events r
        where r.organization_id=p_organization_id
          and r.received_at < now() - make_interval(days=>v_policy.retention_days)
          and not exists (
            select 1 from public.privacy_retention_actions a
            where a.organization_id=p_organization_id
              and a.policy_id=v_policy.id
              and a.record_id=r.id
          )
        order by r.received_at
        limit greatest(1,least(coalesce(p_limit,500),2000))
      loop
        v_person:=null;
        if v_row.lead_id is not null then
          select pl.person_id into v_person from public.person_leads pl
          where pl.organization_id=p_organization_id and pl.lead_id=v_row.lead_id;
        end if;
        v_hold:=v_policy.legal_hold_blocks_action and public.privacy_retention_has_hold_v1(
          p_organization_id,v_person,v_row.lead_id,v_row.anonymous_visitor_id
        );
        v_status:=case when v_hold then 'held'
                       when v_policy.action='review' then 'review_required'
                       else 'planned' end;
        insert into public.privacy_retention_actions(
          organization_id,policy_id,data_category,record_id,requested_action,status,eligible_at,held_reason,metadata
        ) values (
          p_organization_id,v_policy.id,'raw_events',v_row.id,v_policy.action,v_status,
          v_row.received_at + make_interval(days=>v_policy.retention_days),
          case when v_hold then 'active_legal_hold' end,
          jsonb_build_object('planner','v1')
        ) on conflict do nothing;
        if found then
          if v_hold then v_held:=v_held+1; else v_planned:=v_planned+1; end if;
        end if;
      end loop;

    elsif v_policy.data_category='web_sessions' then
      for v_row in
        select ws.id,ws.started_at,ws.lead_id,ws.anonymous_visitor_id,
               coalesce(ps.person_id,pl.person_id) as person_id
        from public.web_sessions ws
        left join public.person_sessions ps
          on ps.organization_id=ws.organization_id and ps.web_session_id=ws.id
        left join public.person_leads pl
          on pl.organization_id=ws.organization_id and pl.lead_id=ws.lead_id
        where ws.organization_id=p_organization_id
          and ws.started_at < now() - make_interval(days=>v_policy.retention_days)
          and not exists (
            select 1 from public.privacy_retention_actions a
            where a.organization_id=p_organization_id
              and a.policy_id=v_policy.id
              and a.record_id=ws.id
          )
        order by ws.started_at
        limit greatest(1,least(coalesce(p_limit,500),2000))
      loop
        v_hold:=v_policy.legal_hold_blocks_action and public.privacy_retention_has_hold_v1(
          p_organization_id,v_row.person_id,v_row.lead_id,v_row.anonymous_visitor_id
        );
        v_status:=case when v_hold then 'held'
                       when v_policy.action='review' then 'review_required'
                       else 'planned' end;
        insert into public.privacy_retention_actions(
          organization_id,policy_id,data_category,record_id,requested_action,status,eligible_at,held_reason,metadata
        ) values (
          p_organization_id,v_policy.id,'web_sessions',v_row.id,v_policy.action,v_status,
          v_row.started_at + make_interval(days=>v_policy.retention_days),
          case when v_hold then 'active_legal_hold' end,
          jsonb_build_object('planner','v1')
        ) on conflict do nothing;
        if found then
          if v_hold then v_held:=v_held+1; else v_planned:=v_planned+1; end if;
        end if;
      end loop;
    end if;
  end loop;

  return jsonb_build_object('ok',true,'planned',v_planned,'held',v_held);
end;
$$;

create or replace function public.execute_privacy_retention_action_v1(
  p_organization_id uuid,
  p_action_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_action public.privacy_retention_actions%rowtype;
  v_setting public.privacy_automation_settings%rowtype;
  v_raw public.raw_events%rowtype;
  v_ws public.web_sessions%rowtype;
  v_person uuid;
  v_hold boolean;
  v_fingerprint text;
begin
  select * into v_setting from public.privacy_automation_settings
  where organization_id=p_organization_id;
  if not found or not v_setting.retention_execution_enabled then
    return jsonb_build_object('ok',false,'reason','retention_execution_disabled');
  end if;
  if v_setting.retention_dry_run then
    return jsonb_build_object('ok',false,'reason','retention_dry_run_enabled');
  end if;

  select * into v_action
  from public.privacy_retention_actions
  where id=p_action_id and organization_id=p_organization_id
  for update;
  if not found then return jsonb_build_object('ok',false,'reason','action_not_found'); end if;
  if v_action.status not in ('planned','failed') then
    return jsonb_build_object('ok',false,'reason','action_not_executable','status',v_action.status);
  end if;
  if v_action.requested_action='review' then
    update public.privacy_retention_actions set status='review_required',updated_at=now() where id=v_action.id;
    return jsonb_build_object('ok',false,'reason','manual_review_policy');
  end if;

  if v_action.data_category='raw_events' then
    select * into v_raw from public.raw_events
    where id=v_action.record_id and organization_id=p_organization_id
    for update;
    if not found then
      update public.privacy_retention_actions set status='skipped',metadata=metadata||jsonb_build_object('reason','record_missing'),updated_at=now() where id=v_action.id;
      return jsonb_build_object('ok',true,'status','skipped');
    end if;
    if nullif(v_raw.metadata->>'lead_id','') is not null then
      select pl.person_id into v_person from public.person_leads pl
      where pl.organization_id=p_organization_id and pl.lead_id=(v_raw.metadata->>'lead_id')::uuid;
    end if;
    v_hold:=public.privacy_retention_has_hold_v1(
      p_organization_id,v_person,nullif(v_raw.metadata->>'lead_id','')::uuid,v_raw.anonymous_visitor_id
    );
    if v_hold then
      update public.privacy_retention_actions set status='held',held_reason='active_legal_hold',updated_at=now() where id=v_action.id;
      return jsonb_build_object('ok',false,'reason','active_legal_hold');
    end if;
    v_fingerprint:=encode(digest(coalesce(v_raw.payload,'{}'::jsonb)::text||coalesce(v_raw.context,'{}'::jsonb)::text,'sha256'),'hex');
    if v_action.requested_action='anonymize' then
      update public.raw_events set
        source_event_id='retained:'||id::text,
        source_subject_id=null,
        anonymous_visitor_id=null,
        session_key=null,
        external_message_id=null,
        payload='{}'::jsonb,
        context='{}'::jsonb,
        metadata=jsonb_build_object('retention_anonymized',true,'retention_action_id',v_action.id),
        updated_at=coalesce((select updated_at from public.raw_event_processing where raw_event_id=id),now())
      where id=v_action.record_id and organization_id=p_organization_id;
    elsif v_action.requested_action='delete' then
      delete from public.raw_events where id=v_action.record_id and organization_id=p_organization_id;
    end if;

  elsif v_action.data_category='web_sessions' then
    select * into v_ws from public.web_sessions
    where id=v_action.record_id and organization_id=p_organization_id
    for update;
    if not found then
      update public.privacy_retention_actions set status='skipped',metadata=metadata||jsonb_build_object('reason','record_missing'),updated_at=now() where id=v_action.id;
      return jsonb_build_object('ok',true,'status','skipped');
    end if;
    select coalesce(ps.person_id,pl.person_id) into v_person
    from public.web_sessions ws
    left join public.person_sessions ps on ps.organization_id=ws.organization_id and ps.web_session_id=ws.id
    left join public.person_leads pl on pl.organization_id=ws.organization_id and pl.lead_id=ws.lead_id
    where ws.id=v_ws.id;
    v_hold:=public.privacy_retention_has_hold_v1(p_organization_id,v_person,v_ws.lead_id,v_ws.anonymous_visitor_id);
    if v_hold then
      update public.privacy_retention_actions set status='held',held_reason='active_legal_hold',updated_at=now() where id=v_action.id;
      return jsonb_build_object('ok',false,'reason','active_legal_hold');
    end if;
    v_fingerprint:=encode(digest(to_jsonb(v_ws)::text,'sha256'),'hex');
    if v_action.requested_action='anonymize' then
      delete from public.person_sessions where organization_id=p_organization_id and web_session_id=v_ws.id;
      update public.web_sessions set
        anonymous_visitor_id='retained:'||id::text,
        lead_id=null,
        session_key=null,
        landing_page=null,
        referrer=null,
        utm_source=null,utm_medium=null,utm_campaign=null,utm_content=null,utm_term=null,
        gclid=null,gbraid=null,wbraid=null,fbclid=null,fbc=null,fbp=null,
        user_agent=null,ip_hash=null,
        geo_country=null,geo_region=null,geo_city=null,geo_timezone=null,
        source=null,medium=null,campaign_name=null,
        metadata=jsonb_build_object('retention_anonymized',true,'retention_action_id',v_action.id),
        updated_at=now()
      where id=v_action.record_id and organization_id=p_organization_id;
    elsif v_action.requested_action='delete' then
      delete from public.person_sessions where organization_id=p_organization_id and web_session_id=v_ws.id;
      delete from public.web_sessions where id=v_action.record_id and organization_id=p_organization_id;
    end if;
  else
    update public.privacy_retention_actions set status='skipped',metadata=metadata||jsonb_build_object('reason','unsupported_data_category'),updated_at=now() where id=v_action.id;
    return jsonb_build_object('ok',false,'reason','unsupported_data_category');
  end if;

  update public.privacy_retention_actions
  set status='executed',before_fingerprint=v_fingerprint,executed_at=now(),execution_error=null,updated_at=now()
  where id=v_action.id;

  return jsonb_build_object('ok',true,'status','executed','action',v_action.requested_action,'data_category',v_action.data_category);
exception when others then
  update public.privacy_retention_actions
  set status='failed',execution_error=left(sqlerrm,1000),updated_at=now()
  where id=p_action_id and organization_id=p_organization_id;
  return jsonb_build_object('ok',false,'reason','execution_failed');
end;
$$;

create or replace function public.run_privacy_retention_sweep_v1(
  p_organization_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_setting public.privacy_automation_settings%rowtype;
  v_action record;
  v_plan jsonb;
  v_executed integer:=0;
  v_failed integer:=0;
  v_result jsonb;
begin
  select * into v_setting from public.privacy_automation_settings where organization_id=p_organization_id;
  if not found then return jsonb_build_object('ok',false,'reason','settings_missing'); end if;

  v_plan:=public.plan_privacy_retention_v1(p_organization_id,v_setting.max_actions_per_run);

  if not v_setting.retention_execution_enabled or v_setting.retention_dry_run then
    return jsonb_build_object('ok',true,'mode','plan_only','plan',v_plan,'executed',0,'failed',0);
  end if;

  for v_action in
    select id from public.privacy_retention_actions
    where organization_id=p_organization_id and status='planned' and eligible_at<=now()
    order by eligible_at
    limit v_setting.max_actions_per_run
    for update skip locked
  loop
    v_result:=public.execute_privacy_retention_action_v1(p_organization_id,v_action.id);
    if coalesce((v_result->>'ok')::boolean,false) then v_executed:=v_executed+1; else v_failed:=v_failed+1; end if;
  end loop;

  return jsonb_build_object('ok',true,'mode','execute','plan',v_plan,'executed',v_executed,'failed',v_failed);
end;
$$;

create or replace function public.run_all_privacy_retention_sweeps_v1()
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_org record;
  v_results jsonb:='[]'::jsonb;
begin
  for v_org in
    select organization_id from public.privacy_automation_settings
  loop
    v_results:=v_results || jsonb_build_array(
      jsonb_build_object('organization_id',v_org.organization_id,'result',public.run_privacy_retention_sweep_v1(v_org.organization_id))
    );
  end loop;
  return jsonb_build_object('ok',true,'organizations',jsonb_array_length(v_results),'results',v_results);
end;
$$;

create or replace view public.v_privacy_retention_health with (security_invoker=true) as
select o.id as organization_id,
  coalesce(s.retention_execution_enabled,false) as execution_enabled,
  coalesce(s.retention_dry_run,true) as dry_run,
  count(a.id) filter(where a.status='planned') as planned_actions,
  count(a.id) filter(where a.status='held') as held_actions,
  count(a.id) filter(where a.status='failed') as failed_actions,
  count(a.id) filter(where a.status='review_required') as review_required_actions,
  count(a.id) filter(where a.status='executed' and a.executed_at>=now()-interval '24 hours') as executed_24h,
  now() as checked_at
from public.organizations o
left join public.privacy_automation_settings s on s.organization_id=o.id
left join public.privacy_retention_actions a on a.organization_id=o.id
group by o.id,s.retention_execution_enabled,s.retention_dry_run;

revoke all on function public.privacy_retention_has_hold_v1(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.plan_privacy_retention_v1(uuid,integer) from public,anon,authenticated;
revoke all on function public.execute_privacy_retention_action_v1(uuid,uuid) from public,anon,authenticated;
revoke all on function public.run_privacy_retention_sweep_v1(uuid) from public,anon,authenticated;
revoke all on function public.run_all_privacy_retention_sweeps_v1() from public,anon,authenticated;
grant execute on function public.privacy_retention_has_hold_v1(uuid,uuid,uuid,text) to service_role;
grant execute on function public.plan_privacy_retention_v1(uuid,integer) to service_role;
grant execute on function public.execute_privacy_retention_action_v1(uuid,uuid) to service_role;
grant execute on function public.run_privacy_retention_sweep_v1(uuid) to service_role;
grant execute on function public.run_all_privacy_retention_sweeps_v1() to service_role;

-- Run hourly. Enforcement remains inert because per-organization execution defaults OFF + dry-run ON.
do $$
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname='salsys-privacy-retention-v1';
    perform cron.schedule(
      'salsys-privacy-retention-v1',
      '17 * * * *',
      'select public.run_all_privacy_retention_sweeps_v1();'
    );
  end if;
exception when undefined_table or insufficient_privilege then
  null;
end;
$$;
