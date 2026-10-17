-- Privacy erasure planner v1
-- Non-destructive planning only. Actual erasure execution remains disabled and must be implemented separately.

alter table public.privacy_automation_settings
  add column if not exists erasure_execution_enabled boolean not null default false,
  add column if not exists erasure_dry_run boolean not null default true,
  add column if not exists max_erasure_jobs_per_run integer not null default 20;

alter table public.privacy_automation_settings
  drop constraint if exists privacy_automation_settings_erasure_limit_check;
alter table public.privacy_automation_settings
  add constraint privacy_automation_settings_erasure_limit_check
  check (max_erasure_jobs_per_run between 1 and 200);

create table if not exists public.privacy_erasure_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_id uuid not null references public.privacy_data_subject_requests(id) on delete cascade,
  person_id uuid references public.persons(id) on delete set null,
  status text not null default 'planned',
  preserve_financial_records boolean not null default true,
  held_reason text,
  plan jsonb not null default '{}'::jsonb,
  planned_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (organization_id, request_id),
  check (status in ('planned','held','ready','completed','cancelled'))
);

create table if not exists public.privacy_erasure_plan_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  erasure_job_id uuid not null references public.privacy_erasure_jobs(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  planned_action text not null,
  preserve_reason text,
  created_at timestamptz not null default now(),
  unique (organization_id, erasure_job_id, entity_type, entity_id),
  check (planned_action in ('anonymize','delete_from_search','preserve','review'))
);

create table if not exists public.privacy_search_tombstones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_id uuid not null references public.privacy_data_subject_requests(id) on delete cascade,
  person_id uuid references public.persons(id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  operation text not null default 'delete',
  reason text not null default 'data_subject_erasure',
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique (organization_id, request_id, entity_type, entity_id),
  check (operation='delete')
);

create index if not exists idx_privacy_erasure_jobs_pending
  on public.privacy_erasure_jobs(organization_id,status,planned_at)
  where status in ('planned','held','ready');
create index if not exists idx_privacy_search_tombstones_pending
  on public.privacy_search_tombstones(organization_id,created_at)
  where processed_at is null;

alter table public.privacy_erasure_jobs enable row level security;
alter table public.privacy_erasure_plan_items enable row level security;
alter table public.privacy_search_tombstones enable row level security;

drop policy if exists privacy_erasure_jobs_member_read on public.privacy_erasure_jobs;
create policy privacy_erasure_jobs_member_read on public.privacy_erasure_jobs
for select using (
  exists (
    select 1 from public.organization_members m
    where m.organization_id=privacy_erasure_jobs.organization_id
      and m.user_id=auth.uid() and m.active
  )
);

drop policy if exists privacy_erasure_plan_items_member_read on public.privacy_erasure_plan_items;
create policy privacy_erasure_plan_items_member_read on public.privacy_erasure_plan_items
for select using (
  exists (
    select 1 from public.organization_members m
    where m.organization_id=privacy_erasure_plan_items.organization_id
      and m.user_id=auth.uid() and m.active
  )
);

drop policy if exists privacy_search_tombstones_member_read on public.privacy_search_tombstones;
create policy privacy_search_tombstones_member_read on public.privacy_search_tombstones
for select using (
  exists (
    select 1 from public.organization_members m
    where m.organization_id=privacy_search_tombstones.organization_id
      and m.user_id=auth.uid() and m.active
  )
);

create or replace function public.plan_privacy_erasure_v1(
  p_organization_id uuid,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_req public.privacy_data_subject_requests%rowtype;
  v_person uuid;
  v_hold boolean;
  v_job uuid;
  v_status text;
  v_leads integer:=0;
  v_contacts integer:=0;
  v_conversations integer:=0;
  v_messages integer:=0;
  v_sessions integer:=0;
  v_payments integer:=0;
  v_enrollments integer:=0;
  v_automations integer:=0;
begin
  select * into v_req
  from public.privacy_data_subject_requests
  where id=p_request_id and organization_id=p_organization_id
  for update;
  if not found then return jsonb_build_object('ok',false,'reason','request_not_found'); end if;
  if v_req.request_type<>'deletion' then return jsonb_build_object('ok',false,'reason','not_deletion_request'); end if;
  if v_req.verification_status<>'verified' or v_req.verified_at is null then
    return jsonb_build_object('ok',false,'reason','identity_not_verified');
  end if;
  if v_req.status in ('denied','cancelled','completed') then return jsonb_build_object('ok',false,'reason','request_closed'); end if;

  v_person:=v_req.person_id;
  if v_person is null and v_req.lead_id is not null then
    select pl.person_id into v_person
    from public.person_leads pl
    where pl.organization_id=p_organization_id and pl.lead_id=v_req.lead_id;
  end if;
  if v_person is null then return jsonb_build_object('ok',false,'reason','subject_identity_unresolved'); end if;

  v_hold:=public.privacy_retention_has_hold_v1(p_organization_id,v_person,v_req.lead_id,v_req.anonymous_visitor_id);
  v_status:=case when v_hold then 'held' else 'ready' end;

  select count(*) into v_leads from public.person_leads where organization_id=p_organization_id and person_id=v_person;
  select count(*) into v_contacts from public.lead_contacts lc where lc.organization_id=p_organization_id and lc.lead_id in (
    select lead_id from public.person_leads where organization_id=p_organization_id and person_id=v_person
  );
  select count(*) into v_conversations from public.conversations c where c.organization_id=p_organization_id and c.lead_id in (
    select lead_id from public.person_leads where organization_id=p_organization_id and person_id=v_person
  );
  select count(*) into v_messages from public.messages m where m.organization_id=p_organization_id and m.lead_id in (
    select lead_id from public.person_leads where organization_id=p_organization_id and person_id=v_person
  );
  select count(*) into v_sessions from public.web_sessions ws
  left join public.person_sessions ps on ps.organization_id=ws.organization_id and ps.web_session_id=ws.id
  left join public.person_leads pl on pl.organization_id=ws.organization_id and pl.lead_id=ws.lead_id
  where ws.organization_id=p_organization_id and coalesce(ps.person_id,pl.person_id)=v_person;
  select count(*) into v_payments from public.payments p where p.organization_id=p_organization_id and p.lead_id in (
    select lead_id from public.person_leads where organization_id=p_organization_id and person_id=v_person
  );
  select count(*) into v_enrollments from public.enrollments e where e.organization_id=p_organization_id and e.lead_id in (
    select lead_id from public.person_leads where organization_id=p_organization_id and person_id=v_person
  );
  select count(*) into v_automations from public.automation_enrollments a where a.organization_id=p_organization_id and a.lead_id in (
    select lead_id from public.person_leads where organization_id=p_organization_id and person_id=v_person
  );

  insert into public.privacy_erasure_jobs(
    organization_id,request_id,person_id,status,held_reason,plan
  ) values (
    p_organization_id,p_request_id,v_person,v_status,
    case when v_hold then 'active_legal_hold' end,
    jsonb_build_object(
      'version','privacy-erasure-plan-v1',
      'financial_records_preserved',true,
      'counts',jsonb_build_object(
        'leads',v_leads,'contacts',v_contacts,'conversations',v_conversations,'messages',v_messages,
        'web_sessions',v_sessions,'payments',v_payments,'enrollments',v_enrollments,'automation_enrollments',v_automations
      )
    )
  )
  on conflict (organization_id,request_id) do update
    set person_id=excluded.person_id,
        status=case when public.privacy_erasure_jobs.status='completed' then public.privacy_erasure_jobs.status else excluded.status end,
        held_reason=excluded.held_reason,
        plan=excluded.plan,
        updated_at=now()
  returning id into v_job;

  insert into public.privacy_erasure_plan_items(organization_id,erasure_job_id,entity_type,entity_id,planned_action)
  values(p_organization_id,v_job,'person',v_person,'anonymize')
  on conflict do nothing;

  insert into public.privacy_erasure_plan_items(organization_id,erasure_job_id,entity_type,entity_id,planned_action)
  select p_organization_id,v_job,'lead',pl.lead_id,'anonymize'
  from public.person_leads pl
  where pl.organization_id=p_organization_id and pl.person_id=v_person
  on conflict do nothing;

  insert into public.privacy_erasure_plan_items(organization_id,erasure_job_id,entity_type,entity_id,planned_action)
  select p_organization_id,v_job,'conversation',c.id,'anonymize'
  from public.conversations c
  where c.organization_id=p_organization_id and c.lead_id in (
    select lead_id from public.person_leads where organization_id=p_organization_id and person_id=v_person
  )
  on conflict do nothing;

  insert into public.privacy_erasure_plan_items(organization_id,erasure_job_id,entity_type,entity_id,planned_action)
  select p_organization_id,v_job,'message',m.id,'anonymize'
  from public.messages m
  where m.organization_id=p_organization_id and m.lead_id in (
    select lead_id from public.person_leads where organization_id=p_organization_id and person_id=v_person
  )
  on conflict do nothing;

  insert into public.privacy_erasure_plan_items(organization_id,erasure_job_id,entity_type,entity_id,planned_action,preserve_reason)
  select p_organization_id,v_job,'payment',p.id,'preserve','financial_record'
  from public.payments p
  where p.organization_id=p_organization_id and p.lead_id in (
    select lead_id from public.person_leads where organization_id=p_organization_id and person_id=v_person
  )
  on conflict do nothing;

  insert into public.privacy_erasure_plan_items(organization_id,erasure_job_id,entity_type,entity_id,planned_action,preserve_reason)
  select p_organization_id,v_job,'enrollment',e.id,'preserve','transactional_record'
  from public.enrollments e
  where e.organization_id=p_organization_id and e.lead_id in (
    select lead_id from public.person_leads where organization_id=p_organization_id and person_id=v_person
  )
  on conflict do nothing;

  -- Search tombstones are safe to create at planning time; an indexer can consume them later.
  insert into public.privacy_search_tombstones(organization_id,request_id,person_id,entity_type,entity_id)
  values(p_organization_id,p_request_id,v_person,'person',v_person)
  on conflict do nothing;

  insert into public.privacy_search_tombstones(organization_id,request_id,person_id,entity_type,entity_id)
  select p_organization_id,p_request_id,v_person,'lead',pl.lead_id
  from public.person_leads pl
  where pl.organization_id=p_organization_id and pl.person_id=v_person
  on conflict do nothing;

  insert into public.privacy_search_tombstones(organization_id,request_id,person_id,entity_type,entity_id)
  select p_organization_id,p_request_id,v_person,'conversation',c.id
  from public.conversations c
  where c.organization_id=p_organization_id and c.lead_id in (
    select lead_id from public.person_leads where organization_id=p_organization_id and person_id=v_person
  )
  on conflict do nothing;

  insert into public.privacy_search_tombstones(organization_id,request_id,person_id,entity_type,entity_id)
  select p_organization_id,p_request_id,v_person,'message',m.id
  from public.messages m
  where m.organization_id=p_organization_id and m.lead_id in (
    select lead_id from public.person_leads where organization_id=p_organization_id and person_id=v_person
  )
  on conflict do nothing;

  return jsonb_build_object(
    'ok',true,'job_id',v_job,'status',v_status,'held',v_hold,
    'plan',(select plan from public.privacy_erasure_jobs where id=v_job)
  );
end;
$$;

create or replace function public.plan_verified_privacy_erasure_sweep_v1(
  p_limit integer default 50
) returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_req record;
  v_result jsonb;
  v_planned integer:=0;
  v_held integer:=0;
begin
  for v_req in
    select d.organization_id,d.id
    from public.privacy_data_subject_requests d
    where d.request_type='deletion'
      and d.verification_status='verified'
      and d.verified_at is not null
      and d.status not in ('completed','denied','cancelled')
      and not exists(
        select 1 from public.privacy_erasure_jobs j
        where j.organization_id=d.organization_id and j.request_id=d.id
      )
    order by d.received_at
    limit greatest(1,least(coalesce(p_limit,50),200))
  loop
    v_result:=public.plan_privacy_erasure_v1(v_req.organization_id,v_req.id);
    if v_result->>'status'='held' then v_held:=v_held+1;
    elsif coalesce((v_result->>'ok')::boolean,false) then v_planned:=v_planned+1;
    end if;
  end loop;
  return jsonb_build_object('ok',true,'planned',v_planned,'held',v_held);
end;
$$;

create or replace view public.v_privacy_erasure_health with (security_invoker=true) as
select o.id organization_id,
  coalesce(s.erasure_execution_enabled,false) execution_enabled,
  coalesce(s.erasure_dry_run,true) dry_run,
  count(j.id) filter(where j.status='ready') ready_jobs,
  count(j.id) filter(where j.status='held') held_jobs,
  count(j.id) filter(where j.status='planned') planned_jobs,
  (select count(*) from public.privacy_search_tombstones t where t.organization_id=o.id and t.processed_at is null) pending_search_tombstones,
  now() checked_at
from public.organizations o
left join public.privacy_automation_settings s on s.organization_id=o.id
left join public.privacy_erasure_jobs j on j.organization_id=o.id
group by o.id,s.erasure_execution_enabled,s.erasure_dry_run;

revoke all on function public.plan_privacy_erasure_v1(uuid,uuid) from public,anon,authenticated;
revoke all on function public.plan_verified_privacy_erasure_sweep_v1(integer) from public,anon,authenticated;
grant execute on function public.plan_privacy_erasure_v1(uuid,uuid) to service_role;
grant execute on function public.plan_verified_privacy_erasure_sweep_v1(integer) to service_role;

do $$
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname='salsys-privacy-erasure-planner-v1';
    perform cron.schedule(
      'salsys-privacy-erasure-planner-v1',
      '23 * * * *',
      $cron$select public.plan_verified_privacy_erasure_sweep_v1(50);$cron$
    );
  end if;
end;
$$;
