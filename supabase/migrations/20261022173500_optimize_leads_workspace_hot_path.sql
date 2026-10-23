-- Optimize the hottest authenticated CRM read path without weakening tenant isolation.
--
-- Goals:
-- 1. Authorize organization + Sales workspace once per RPC instead of once per lead row.
-- 2. Preserve Sales visibility semantics:
--      owner/admin/manager -> all organization leads
--      member              -> only assigned leads
--      viewer/no access    -> denied
-- 3. Avoid joining the full v_pipeline_stage_aging view for every request.
-- 4. Match the stage-history lookup with a covering index.
-- 5. Preserve the existing JSON response contract used by lib/leads-data.ts.

create index if not exists idx_lead_stage_history_lead_stage_time
  on public.lead_stage_history (lead_id, to_stage, changed_at desc, id desc);

create or replace function public.get_leads_workspace_page(
  p_organization_id uuid,
  p_page integer default 1,
  p_page_size integer default 50,
  p_query text default null::text,
  p_stage text default null::text,
  p_source text default null::text,
  p_channel text default null::text,
  p_owner text default null::text,
  p_course text default null::text,
  p_aging text default null::text,
  p_quick_view text default 'all'::text,
  p_sort text default 'stage_age_desc'::text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_auth_role text := auth.role();
  v_sales_role text;
  v_can_view_pii boolean := false;
  v_result jsonb;
begin
  if p_organization_id is null then
    raise exception 'Organization ID is required';
  end if;

  if v_auth_role = 'service_role' then
    v_sales_role := 'service_role';
    v_can_view_pii := true;
  else
    if v_uid is null then
      raise exception 'Not authenticated';
    end if;

    if not public.is_organization_member(p_organization_id) then
      raise exception 'Not authorized for this organization';
    end if;

    v_sales_role := public.workspace_role(p_organization_id, 'sales');

    if v_sales_role not in ('owner', 'admin', 'manager', 'member') then
      raise exception 'Not authorized for Sales workspace';
    end if;

    v_can_view_pii := public.can_view_lead_pii();
  end if;

  with params as (
    select
      greatest(coalesce(p_page, 1), 1) as requested_page,
      least(greatest(coalesce(p_page_size, 50), 10), 100) as page_size,
      nullif(btrim(coalesce(p_query, '')), '') as query_text,
      nullif(btrim(coalesce(p_stage, '')), '') as stage_filter,
      nullif(btrim(coalesce(p_source, '')), '') as source_filter,
      nullif(btrim(coalesce(p_channel, '')), '') as channel_filter,
      nullif(btrim(coalesce(p_owner, '')), '') as owner_filter,
      nullif(btrim(coalesce(p_course, '')), '') as course_filter,
      nullif(btrim(coalesce(p_aging, '')), '') as aging_filter,
      case
        when p_quick_view in ('all','unassigned','stuck','followup_overdue','payment_pending')
          then p_quick_view
        else 'all'
      end as quick_view,
      case
        when p_sort in ('name','stage_age_desc','followup_asc')
          then p_sort
        else 'stage_age_desc'
      end as sort_mode
  ),
  visible_leads as materialized (
    select
      v.id,
      v.organization_id,
      v.owner_user_id,
      v.current_stage::text as current_stage,
      v.created_at,
      v.next_followup_at,
      v.last_contacted_at,
      to_jsonb(v) as j
    from public.v_leads_overview v
    where v.organization_id = p_organization_id
      and (
        v_sales_role in ('service_role', 'owner', 'admin', 'manager')
        or (
          v_sales_role = 'member'
          and v.owner_user_id = v_uid
        )
      )
  ),
  enriched as materialized (
    select
      l.id,
      l.j ->> 'lead_code' as lead_code,
      l.j ->> 'lead_name' as lead_name,
      l.j ->> 'display_name' as display_name,
      case
        when v_can_view_pii then l.j ->> 'email'
        else public.mask_email(l.j ->> 'email')
      end as email,
      case
        when v_can_view_pii then l.j ->> 'phone'
        else public.mask_phone(l.j ->> 'phone')
      end as phone,
      l.j ->> 'course_name' as course_name,
      l.j ->> 'preferred_location' as preferred_location,
      l.j ->> 'country' as country,
      l.current_stage,
      l.j ->> 'intent' as intent,
      l.j ->> 'first_touch_source' as first_touch_source,
      l.j ->> 'first_touch_medium' as first_touch_medium,
      l.j ->> 'first_touch_campaign' as first_touch_campaign,
      l.j ->> 'lead_creation_channel' as lead_creation_channel,
      l.j ->> 'current_contact_channel' as current_contact_channel,
      l.owner_user_id::text as owner_user_id,
      l.j ->> 'owner_name' as owner_name,
      l.last_contacted_at,
      l.next_followup_at,
      l.created_at,
      l.j ->> 'enrollment_value' as enrollment_value,
      l.j ->> 'enrollment_currency' as enrollment_currency,
      aging.aging_status,
      aging.stage_entered_at,
      aging.stage_age_hours,
      aging.stage_age_days,
      aging.warning_after_days,
      aging.stuck_after_days,
      aging.days_over_stuck_threshold,
      case
        when l.last_contacted_at is null then null::numeric
        else greatest(
          extract(epoch from (now() - l.last_contacted_at)) / 86400.0,
          0::numeric
        )::numeric(12,2)
      end as days_since_last_contact,
      l.j ->> 'preferred_batch_id' as preferred_batch_id,
      cb.batch_code,
      cb.location as batch_location,
      cb.start_date as batch_start_date,
      cb.end_date as batch_end_date
    from visible_leads l
    left join public.course_batches cb
      on cb.id = nullif(l.j ->> 'preferred_batch_id', '')::uuid
     and cb.organization_id = p_organization_id
    left join lateral (
      with stage_entry as (
        select coalesce(
          (
            select h.changed_at
            from public.lead_stage_history h
            where h.lead_id = l.id
              and h.to_stage::text = l.current_stage
            order by h.changed_at desc, h.id desc
            limit 1
          ),
          l.created_at
        ) as entered_at
      ), rules as (
        select
          se.entered_at,
          coalesce(tr.warning_after_days, dr.warning_after_days)::numeric(8,2) as warning_after_days,
          coalesce(tr.stuck_after_days, dr.stuck_after_days)::numeric(8,2) as stuck_after_days,
          coalesce(tr.active, dr.active) as active,
          coalesce(tr.stage, dr.stage) as matched_stage
        from stage_entry se
        left join public.organization_pipeline_stage_aging_rules tr
          on tr.organization_id = p_organization_id
         and tr.stage = l.current_stage
        left join public.pipeline_stage_aging_rules dr
          on dr.stage = l.current_stage
      )
      select
        r.entered_at as stage_entered_at,
        greatest(
          extract(epoch from (now() - r.entered_at)) / 3600.0,
          0::numeric
        )::numeric(12,2) as stage_age_hours,
        greatest(
          extract(epoch from (now() - r.entered_at)) / 86400.0,
          0::numeric
        )::numeric(12,2) as stage_age_days,
        r.warning_after_days,
        r.stuck_after_days,
        case
          when r.matched_stage is null or r.active is not true then 'untracked'::text
          when extract(epoch from (now() - r.entered_at)) / 86400.0 >= r.stuck_after_days then 'stuck'::text
          when extract(epoch from (now() - r.entered_at)) / 86400.0 >= r.warning_after_days then 'warning'::text
          else 'healthy'::text
        end as aging_status,
        case
          when r.matched_stage is null or r.active is not true then null::numeric
          when extract(epoch from (now() - r.entered_at)) / 86400.0 >= r.stuck_after_days
            then greatest(
              extract(epoch from (now() - r.entered_at)) / 86400.0 - r.stuck_after_days,
              0::numeric
            )::numeric(12,2)
          else 0::numeric(12,2)
        end as days_over_stuck_threshold
      from rules r
    ) aging on true
  ),
  filtered as materialized (
    select e.*
    from enriched e
    cross join params p
    where
      (p.stage_filter is null or e.current_stage = p.stage_filter)
      and (p.source_filter is null or coalesce(e.first_touch_source, '') = p.source_filter)
      and (p.channel_filter is null or e.current_contact_channel = p.channel_filter)
      and (
        p.owner_filter is null
        or (p.owner_filter = '__unassigned__' and e.owner_user_id is null)
        or (p.owner_filter <> '__unassigned__' and coalesce(e.owner_name, '') = p.owner_filter)
      )
      and (p.course_filter is null or coalesce(e.course_name, '') = p.course_filter)
      and (p.aging_filter is null or coalesce(e.aging_status, 'untracked') = p.aging_filter)
      and (
        p.quick_view = 'all'
        or (p.quick_view = 'unassigned' and e.owner_user_id is null)
        or (p.quick_view = 'stuck' and e.aging_status = 'stuck')
        or (
          p.quick_view = 'followup_overdue'
          and e.next_followup_at is not null
          and e.next_followup_at < now()
        )
        or (p.quick_view = 'payment_pending' and e.current_stage = 'payment_pending')
      )
      and (
        p.query_text is null
        or concat_ws(
          ' ',
          e.lead_name,
          e.display_name,
          e.lead_code,
          e.country,
          e.preferred_location,
          e.course_name,
          e.first_touch_source,
          e.first_touch_campaign,
          e.current_contact_channel,
          e.owner_name,
          e.batch_code,
          e.batch_location
        ) ilike '%' || p.query_text || '%'
      )
  ),
  filtered_count as (
    select count(*)::bigint as total from filtered
  ),
  page_meta as (
    select
      least(
        p.requested_page,
        greatest(1, ceil(c.total::numeric / p.page_size::numeric)::integer)
      ) as page_no,
      p.page_size,
      c.total
    from params p
    cross join filtered_count c
  ),
  ranked as materialized (
    select
      f.*,
      row_number() over (
        order by
          case when p.sort_mode = 'name'
            then lower(coalesce(f.lead_name, f.display_name, f.lead_code, ''))
          end asc nulls last,
          case when p.sort_mode = 'followup_asc' then f.next_followup_at end asc nulls last,
          case when p.sort_mode = 'stage_age_desc' then f.stage_age_days end desc nulls last,
          f.created_at desc nulls last,
          f.id desc
      ) as sort_position
    from filtered f
    cross join params p
  ),
  page_rows as (
    select r.*
    from ranked r
    cross join page_meta m
    where r.sort_position > ((m.page_no - 1) * m.page_size)
      and r.sort_position <= (m.page_no * m.page_size)
    order by r.sort_position
  ),
  summary as (
    select
      count(*)::bigint as all_count,
      count(*) filter (where owner_user_id is null)::bigint as unassigned_count,
      count(*) filter (where aging_status = 'stuck')::bigint as stuck_count,
      count(*) filter (
        where next_followup_at is not null and next_followup_at < now()
      )::bigint as followup_overdue_count,
      count(*) filter (where current_stage = 'payment_pending')::bigint as payment_pending_count
    from enriched
  )
  select jsonb_build_object(
    'rows', coalesce(
      (
        select jsonb_agg(to_jsonb(r) - 'sort_position' order by r.sort_position)
        from page_rows r
      ),
      '[]'::jsonb
    ),
    'summary', (
      select jsonb_build_object(
        'all', s.all_count,
        'unassigned', s.unassigned_count,
        'stuck', s.stuck_count,
        'followup_overdue', s.followup_overdue_count,
        'payment_pending', s.payment_pending_count
      )
      from summary s
    ),
    'pagination', (
      select jsonb_build_object(
        'page', m.page_no,
        'page_size', m.page_size,
        'total', m.total,
        'total_pages', greatest(1, ceil(m.total::numeric / m.page_size::numeric)::integer),
        'from', case when m.total = 0 then 0 else ((m.page_no - 1) * m.page_size) + 1 end,
        'to', least(m.total, (m.page_no * m.page_size)::bigint)
      )
      from page_meta m
    ),
    'options', jsonb_build_object(
      'stages', coalesce((
        select jsonb_agg(x.value order by x.value)
        from (select distinct current_stage as value from enriched where current_stage is not null) x
      ), '[]'::jsonb),
      'sources', coalesce((
        select jsonb_agg(x.value order by x.value)
        from (select distinct first_touch_source as value from enriched where nullif(btrim(first_touch_source), '') is not null) x
      ), '[]'::jsonb),
      'channels', coalesce((
        select jsonb_agg(x.value order by x.value)
        from (select distinct current_contact_channel as value from enriched where current_contact_channel is not null) x
      ), '[]'::jsonb),
      'owners', coalesce((
        select jsonb_agg(x.value order by x.value)
        from (select distinct owner_name as value from enriched where nullif(btrim(owner_name), '') is not null) x
      ), '[]'::jsonb),
      'courses', coalesce((
        select jsonb_agg(x.value order by x.value)
        from (select distinct course_name as value from enriched where nullif(btrim(course_name), '') is not null) x
      ), '[]'::jsonb)
    )
  )
  into v_result;

  return v_result;
end;
$function$;

revoke all on function public.get_leads_workspace_page(
  uuid, integer, integer, text, text, text, text, text, text, text, text, text
) from public, anon;

grant execute on function public.get_leads_workspace_page(
  uuid, integer, integer, text, text, text, text, text, text, text, text, text
) to authenticated, service_role;

comment on function public.get_leads_workspace_page(
  uuid, integer, integer, text, text, text, text, text, text, text, text, text
) is
  'Tenant-scoped Leads workspace read model optimized for one-time Sales authorization and per-visible-lead aging lookup.';
