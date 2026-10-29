create or replace function public.get_pipeline_snapshot_v2(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
  v_org_role text;
  v_workspace_role text;
  v_can_view_all boolean := false;
begin
  if p_organization_id is null then
    raise exception 'Organization ID is required';
  end if;

  if not public.is_organization_member(p_organization_id) then
    raise exception 'Not authorized for organization %', p_organization_id;
  end if;

  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    v_can_view_all := true;
  else
    if v_uid is null then
      raise exception 'Authenticated user is required';
    end if;

    select om.role
      into v_org_role
    from public.organization_members om
    join public.organizations o
      on o.id = om.organization_id
     and o.status = 'active'
    where om.organization_id = p_organization_id
      and om.user_id = v_uid
      and om.active = true
    limit 1;

    if v_org_role in ('owner', 'admin') then
      v_can_view_all := true;
    else
      select wm.role
        into v_workspace_role
      from public.workspace_memberships wm
      join public.organization_workspaces ow
        on ow.organization_id = wm.organization_id
       and ow.workspace_code = wm.workspace_code
       and ow.enabled = true
      where wm.organization_id = p_organization_id
        and wm.workspace_code = 'sales'
        and wm.user_id = v_uid
        and wm.active = true
      limit 1;

      if v_workspace_role = 'manager' then
        v_can_view_all := true;
      elsif v_workspace_role <> 'member' then
        raise exception 'Not authorized for Sales pipeline';
      end if;
    end if;
  end if;

  return (
    with
    active_stages(stage, sort_order) as (
      values
        ('new'::text, 1),
        ('contacted'::text, 2),
        ('engaged'::text, 3),
        ('qualified'::text, 4),
        ('high_intent'::text, 5),
        ('payment_pending'::text, 6),
        ('closed_won'::text, 7)
    ),
    accessible_leads as materialized (
      select l.id, l.current_stage
      from public.leads l
      where l.organization_id = p_organization_id
        and l.status <> 'archived'::public.lead_status
        and (v_can_view_all or l.owner_user_id = v_uid)
    ),
    all_stage_counts as materialized (
      select al.current_stage::text as stage,
             count(*)::bigint as leads
      from accessible_leads al
      group by al.current_stage::text
    ),
    tenant_aging as materialized (
      select a.*
      from public.v_pipeline_stage_aging a
      join accessible_leads al on al.id = a.lead_id
    ),
    active_stage_counts as (
      select s.stage,s.sort_order,coalesce(c.leads,0)::bigint as leads
      from active_stages s
      left join all_stage_counts c on c.stage=s.stage
    ),
    board as materialized (
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
      join accessible_leads al on al.id = v.id
      join active_stages s on s.stage=v.current_stage::text
      left join tenant_aging a on a.lead_id=v.id
      where v.organization_id = p_organization_id
    ),
    aging_summary as (
      select
        s.stage,
        s.sort_order,
        count(a.lead_id)::bigint as total_leads,
        count(*) filter (where a.aging_status='healthy')::bigint as healthy,
        count(*) filter (where a.aging_status='warning')::bigint as warning,
        count(*) filter (where a.aging_status='stuck')::bigint as stuck,
        coalesce(round((percentile_cont(0.5) within group (order by a.stage_age_days::double precision))::numeric,2),0) as median_days,
        coalesce(round(max(a.stage_age_days),2),0) as oldest_days
      from active_stages s
      left join tenant_aging a on a.current_stage::text=s.stage
      group by s.stage,s.sort_order
    ),
    aging_metrics as (
      select
        count(*) filter (where a.aging_status::text='stuck')::bigint as stuck_leads,
        count(*) filter (where a.aging_status::text='warning')::bigint as warning_leads,
        coalesce(percentile_cont(0.5) within group (order by a.stage_age_days::double precision),0)::numeric as median_stage_age_days
      from tenant_aging a
      join active_stages s on s.stage=a.current_stage::text
    ),
    top_stuck as (
      select a.lead_id,a.lead_code,a.lead_name,a.current_stage::text as current_stage,
             coalesce(a.stage_age_days::numeric,0) as stage_age_days,
             coalesce(a.days_over_stuck_threshold::numeric,0) as days_over_stuck_threshold,
             a.course_name
      from tenant_aging a
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
    )
  );
end;
$fn$;

revoke all on function public.get_pipeline_snapshot_v2(uuid) from public, anon;
grant execute on function public.get_pipeline_snapshot_v2(uuid) to authenticated, service_role;
