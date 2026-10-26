create or replace function public.set_lead_stage(
  p_lead_id uuid,
  p_new_stage public.lead_stage,
  p_changed_by_type public.actor_type default 'system'::public.actor_type,
  p_changed_by_id text default null,
  p_reason text default null
)
returns public.leads
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_old public.lead_stage;
  v_row public.leads;
  v_actor_type public.actor_type;
  v_actor_id text;
begin
  if not public.can_work_lead(p_lead_id) then
    raise exception 'Not authorized to update this lead';
  end if;

  if auth.role() = 'service_role' then
    v_actor_type := p_changed_by_type;
    v_actor_id := p_changed_by_id;
  else
    v_actor_type := 'human'::public.actor_type;
    v_actor_id := auth.uid()::text;
  end if;

  select current_stage
  into v_old
  from public.leads
  where id = p_lead_id
  for update;

  if not found then
    raise exception 'Lead not found';
  end if;

  if v_old is distinct from p_new_stage then
    update public.leads
    set
      current_stage = p_new_stage,
      status = case
        when p_new_stage in ('closed_won'::public.lead_stage, 'enrolled'::public.lead_stage)
          then 'won'::public.lead_status
        when p_new_stage in (
          'lost'::public.lead_stage,
          'unqualified'::public.lead_stage,
          'duplicate'::public.lead_stage
        ) then 'lost'::public.lead_status
        else 'open'::public.lead_status
      end
    where id = p_lead_id
    returning * into v_row;

    insert into public.lead_stage_history (
      lead_id,
      from_stage,
      to_stage,
      changed_by_type,
      changed_by_id,
      reason
    ) values (
      p_lead_id,
      v_old,
      p_new_stage,
      v_actor_type,
      v_actor_id,
      p_reason
    );
  else
    select * into v_row from public.leads where id = p_lead_id;
  end if;

  return v_row;
end;
$function$;

create or replace function public.promote_paid_payment_to_closed_won_v1()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_old_stage public.lead_stage;
begin
  if new.lead_id is null or new.organization_id is null then
    return new;
  end if;

  if new.status = 'paid'::public.payment_status
     and (tg_op = 'INSERT' or old.status is distinct from 'paid'::public.payment_status)
  then
    select l.current_stage
    into v_old_stage
    from public.leads l
    where l.id = new.lead_id
      and l.organization_id = new.organization_id
    for update;

    if v_old_stage is null then
      return new;
    end if;

    if v_old_stage is distinct from 'closed_won'::public.lead_stage then
      update public.leads
      set
        current_stage = 'closed_won'::public.lead_stage,
        status = 'won'::public.lead_status,
        metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
          'closed_won_at', coalesce(new.paid_at, now()),
          'closed_won_source', 'payment_paid',
          'closed_won_payment_id', new.id
        )
      where id = new.lead_id
        and organization_id = new.organization_id;

      insert into public.lead_stage_history (
        lead_id,
        from_stage,
        to_stage,
        changed_by_type,
        changed_by_id,
        reason,
        changed_at
      ) values (
        new.lead_id,
        v_old_stage,
        'closed_won'::public.lead_stage,
        'system'::public.actor_type,
        'payment:' || new.id::text,
        'Authoritative payment received',
        coalesce(new.paid_at, now())
      );
    else
      update public.leads
      set
        status = 'won'::public.lead_status,
        metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
          'closed_won_at', coalesce(metadata->>'closed_won_at', new.paid_at::text, now()::text),
          'closed_won_source', 'payment_paid',
          'closed_won_payment_id', new.id
        )
      where id = new.lead_id
        and organization_id = new.organization_id;
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function public.promote_paid_payment_to_closed_won_v1() from public;

drop trigger if exists payments_promote_closed_won_v1 on public.payments;
create trigger payments_promote_closed_won_v1
after insert or update of status on public.payments
for each row
execute function public.promote_paid_payment_to_closed_won_v1();

create or replace function public.archive_closed_won_leads_v1(p_limit integer default 500)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_archived integer := 0;
begin
  if p_limit is null or p_limit < 1 or p_limit > 5000 then
    raise exception 'p_limit must be between 1 and 5000';
  end if;

  with eligible as (
    select l.id
    from public.leads l
    join lateral (
      select h.changed_at
      from public.lead_stage_history h
      where h.lead_id = l.id
        and h.to_stage = 'closed_won'::public.lead_stage
      order by h.changed_at desc, h.id desc
      limit 1
    ) stage_entry on true
    where l.current_stage = 'closed_won'::public.lead_stage
      and l.status = 'won'::public.lead_status
      and stage_entry.changed_at <= now() - interval '1 day'
    order by stage_entry.changed_at, l.id
    for update of l skip locked
    limit p_limit
  )
  update public.leads l
  set
    status = 'archived'::public.lead_status,
    next_followup_at = null,
    metadata = coalesce(l.metadata,'{}'::jsonb) || jsonb_build_object(
      'archived_at', now(),
      'archived_reason', 'closed_won_24h_auto_archive'
    )
  from eligible e
  where l.id = e.id;

  get diagnostics v_archived = row_count;

  return jsonb_build_object('ok',true,'archived',v_archived,'ran_at',now());
end;
$function$;

revoke all on function public.archive_closed_won_leads_v1(integer) from public, anon, authenticated;
grant execute on function public.archive_closed_won_leads_v1(integer) to service_role;

create or replace function public.get_pipeline_snapshot()
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
with
active_stages(stage, sort_order) as (
  values
    ('new'::text,1),
    ('contacted'::text,2),
    ('engaged'::text,3),
    ('qualified'::text,4),
    ('high_intent'::text,5),
    ('payment_pending'::text,6),
    ('closed_won'::text,7)
),
all_stage_counts as (
  select pc.current_stage::text as stage,
         coalesce(pc.lead_count,0)::bigint as leads
  from public.v_pipeline_counts pc
),
active_stage_counts as (
  select s.stage,s.sort_order,coalesce(c.leads,0)::bigint as leads
  from active_stages s
  left join all_stage_counts c on c.stage=s.stage
),
board as (
  select
    s.sort_order as stage_sort_order,
    v.id,
    coalesce(nullif(v.lead_name,''),nullif(v.display_name,''),nullif(v.lead_code,''),'Lead') as name,
    v.current_stage::text as stage,
    coalesce(v.country,'') as country,
    coalesce(v.preferred_location,'') as location,
    coalesce(v.course_name,'') as course,
    coalesce(v.current_contact_channel::text,'unknown') as current_contact_channel,
    coalesce(a.aging_status::text,'untracked') as aging_status,
    a.stage_entered_at,
    coalesce(a.stage_age_hours::numeric,0) as stage_age_hours,
    coalesce(a.stage_age_days::numeric,0) as stage_age_days,
    a.warning_after_days::numeric as warning_after_days,
    a.stuck_after_days::numeric as stuck_after_days,
    coalesce(a.days_over_stuck_threshold::numeric,0) as days_over_stuck_threshold,
    a.days_since_last_contact::numeric as days_since_last_contact
  from public.v_leads_overview v
  join active_stages s on s.stage=v.current_stage::text
  left join public.v_pipeline_stage_aging a on a.lead_id=v.id
  where v.status <> 'archived'::public.lead_status
),
aging_summary as (
  select s.stage,s.sort_order,
         coalesce(a.total_leads,0)::bigint as total_leads,
         coalesce(a.healthy_leads,0)::bigint as healthy,
         coalesce(a.warning_leads,0)::bigint as warning,
         coalesce(a.stuck_leads,0)::bigint as stuck,
         coalesce(a.median_stage_age_days::numeric,0) as median_days,
         coalesce(a.oldest_stage_age_days::numeric,0) as oldest_days
  from active_stages s
  left join public.v_pipeline_stage_aging_summary a on a.current_stage::text=s.stage
),
aging_metrics as (
  select
    count(*) filter (where a.aging_status::text='stuck')::bigint as stuck_leads,
    count(*) filter (where a.aging_status::text='warning')::bigint as warning_leads,
    coalesce(percentile_cont(0.5) within group (order by a.stage_age_days::double precision),0)::numeric as median_stage_age_days
  from public.v_pipeline_stage_aging a
  join active_stages s on s.stage=a.current_stage::text
),
top_stuck as (
  select a.lead_id,a.lead_code,a.lead_name,a.current_stage::text as current_stage,
         coalesce(a.stage_age_days::numeric,0) as stage_age_days,
         coalesce(a.days_over_stuck_threshold::numeric,0) as days_over_stuck_threshold,
         a.course_name
  from public.v_pipeline_stage_aging a
  join active_stages s on s.stage=a.current_stage::text
  where a.aging_status::text='stuck'
  order by a.stage_age_days desc nulls last,a.lead_name asc nulls last
  limit 6
)
select jsonb_build_object(
  'board_leads',coalesce((select jsonb_agg(jsonb_build_object(
    'id',b.id,'name',b.name,'stage',b.stage,'country',b.country,'location',b.location,'course',b.course,
    'current_contact_channel',b.current_contact_channel,'aging_status',b.aging_status,'stage_entered_at',b.stage_entered_at,
    'stage_age_hours',b.stage_age_hours,'stage_age_days',b.stage_age_days,'warning_after_days',b.warning_after_days,
    'stuck_after_days',b.stuck_after_days,'days_over_stuck_threshold',b.days_over_stuck_threshold,
    'days_since_last_contact',b.days_since_last_contact
  ) order by b.stage_sort_order,b.stage_age_days desc,b.name) from board b),'[]'::jsonb),
  'stage_counts',coalesce((select jsonb_agg(jsonb_build_object('stage',c.stage,'leads',c.leads) order by c.sort_order) from active_stage_counts c),'[]'::jsonb),
  'aging_summary',coalesce((select jsonb_agg(jsonb_build_object('stage',a.stage,'total_leads',a.total_leads,'healthy',a.healthy,'warning',a.warning,'stuck',a.stuck,'median_days',a.median_days,'oldest_days',a.oldest_days) order by a.sort_order) from aging_summary a),'[]'::jsonb),
  'stuck_leads',coalesce((select jsonb_agg(jsonb_build_object('lead_id',s.lead_id,'lead_code',s.lead_code,'lead_name',s.lead_name,'current_stage',s.current_stage,'stage_age_days',s.stage_age_days,'days_over_stuck_threshold',s.days_over_stuck_threshold,'course_name',s.course_name) order by s.stage_age_days desc) from top_stuck s),'[]'::jsonb),
  'metrics',jsonb_build_object(
    'active_pipeline',(select coalesce(sum(c.leads),0)::bigint from active_stage_counts c),
    'qualified_plus',(select coalesce(sum(c.leads),0)::bigint from all_stage_counts c where c.stage in ('qualified','high_intent','payment_pending','closed_won','enrolled')),
    'high_intent',(select coalesce(max(c.leads),0)::bigint from all_stage_counts c where c.stage='high_intent'),
    'payment_pending',(select coalesce(max(c.leads),0)::bigint from all_stage_counts c where c.stage='payment_pending'),
    'closed_won',(select coalesce(max(c.leads),0)::bigint from all_stage_counts c where c.stage='closed_won'),
    'enrolled',(select coalesce(max(c.leads),0)::bigint from all_stage_counts c where c.stage='enrolled'),
    'stuck_leads',(select coalesce(m.stuck_leads,0)::bigint from aging_metrics m),
    'warning_leads',(select coalesce(m.warning_leads,0)::bigint from aging_metrics m),
    'median_stage_age_days',(select coalesce(m.median_stage_age_days,0) from aging_metrics m)
  )
);
$function$;

do $block$
begin
  if not exists (
    select 1 from cron.job where jobname='salsys-closed-won-auto-archive-v1'
  ) then
    perform cron.schedule(
      'salsys-closed-won-auto-archive-v1',
      '7 * * * *',
      'select public.archive_closed_won_leads_v1(500);'
    );
  end if;
end;
$block$;
