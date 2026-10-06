-- 019_leads_workspace_tenant_scope.sql
-- Phase 5G: make the optimized Leads workspace RPC explicitly tenant-aware.

begin;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'v_leads_overview'
      and column_name = 'organization_id'
  ) then
    raise exception 'v_leads_overview.organization_id is required';
  end if;

end
$$;

drop function if exists public.get_leads_workspace_page(
  integer, integer, text, text, text, text, text, text, text, text, text
);

create function public.get_leads_workspace_page(
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
language sql
stable
security invoker
set search_path to 'public'
as $function$
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
base as materialized (
  select
    l.id,
    l.j ->> 'lead_code' as lead_code,
    l.j ->> 'lead_name' as lead_name,
    l.j ->> 'display_name' as display_name,
    l.j ->> 'email' as email,
    l.j ->> 'phone' as phone,
    l.j ->> 'course_name' as course_name,
    l.j ->> 'preferred_location' as preferred_location,
    l.j ->> 'country' as country,
    l.j ->> 'current_stage' as current_stage,
    l.j ->> 'intent' as intent,
    l.j ->> 'first_touch_source' as first_touch_source,
    l.j ->> 'first_touch_medium' as first_touch_medium,
    l.j ->> 'first_touch_campaign' as first_touch_campaign,
    l.j ->> 'lead_creation_channel' as lead_creation_channel,
    l.j ->> 'current_contact_channel' as current_contact_channel,
    coalesce(a.owner_user_id::text, l.j ->> 'owner_user_id') as owner_user_id,
    coalesce(a.owner_name, l.j ->> 'owner_name') as owner_name,
    nullif(l.j ->> 'last_contacted_at','')::timestamptz as last_contacted_at,
    nullif(l.j ->> 'next_followup_at','')::timestamptz as next_followup_at,
    nullif(l.j ->> 'created_at','')::timestamptz as created_at,
    l.j ->> 'enrollment_value' as enrollment_value,
    l.j ->> 'enrollment_currency' as enrollment_currency,
    a.aging_status,
    a.stage_entered_at,
    a.stage_age_hours,
    a.stage_age_days,
    a.warning_after_days,
    a.stuck_after_days,
    a.days_over_stuck_threshold,
    a.days_since_last_contact,
    a.preferred_batch_id,
    a.batch_code,
    a.batch_location,
    a.batch_start_date,
    a.batch_end_date
  from (
    select
      v.id,
      v.organization_id,
      to_jsonb(v) as j
    from public.v_leads_overview v
    where v.organization_id = p_organization_id
  ) l
  left join public.v_pipeline_stage_aging a
    on a.lead_id = l.id
),
filtered as materialized (
  select b.*
  from base b
  cross join params p
  where
    (p.stage_filter is null or b.current_stage = p.stage_filter)
    and (p.source_filter is null or coalesce(b.first_touch_source, '') = p.source_filter)
    and (p.channel_filter is null or b.current_contact_channel = p.channel_filter)
    and (
      p.owner_filter is null
      or (p.owner_filter = '__unassigned__' and b.owner_user_id is null)
      or (p.owner_filter <> '__unassigned__' and coalesce(b.owner_name, '') = p.owner_filter)
    )
    and (p.course_filter is null or coalesce(b.course_name, '') = p.course_filter)
    and (
      p.aging_filter is null
      or coalesce(b.aging_status::text, 'untracked') = p.aging_filter
    )
    and (
      p.quick_view = 'all'
      or (p.quick_view = 'unassigned' and b.owner_user_id is null)
      or (p.quick_view = 'stuck' and b.aging_status::text = 'stuck')
      or (
        p.quick_view = 'followup_overdue'
        and b.next_followup_at is not null
        and b.next_followup_at < now()
      )
      or (p.quick_view = 'payment_pending' and b.current_stage = 'payment_pending')
    )
    and (
      p.query_text is null
      or concat_ws(
        ' ',
        b.lead_name,
        b.display_name,
        b.lead_code,
        b.country,
        b.preferred_location,
        b.course_name,
        b.first_touch_source,
        b.first_touch_campaign,
        b.current_contact_channel,
        b.owner_name,
        b.batch_code,
        b.batch_location
      ) ilike '%' || p.query_text || '%'
    )
),
filtered_count as (
  select count(*)::bigint as total
  from filtered
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
        case when p.sort_mode = 'followup_asc'
          then f.next_followup_at
        end asc nulls last,
        case when p.sort_mode = 'stage_age_desc'
          then f.stage_age_days
        end desc nulls last,
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
    count(*) filter (where aging_status::text = 'stuck')::bigint as stuck_count,
    count(*) filter (
      where next_followup_at is not null and next_followup_at < now()
    )::bigint as followup_overdue_count,
    count(*) filter (
      where current_stage = 'payment_pending'
    )::bigint as payment_pending_count
  from base
)
select jsonb_build_object(
  'rows',
  coalesce(
    (
      select jsonb_agg(to_jsonb(r) - 'sort_position' order by r.sort_position)
      from page_rows r
    ),
    '[]'::jsonb
  ),
  'summary',
  (
    select jsonb_build_object(
      'all', s.all_count,
      'unassigned', s.unassigned_count,
      'stuck', s.stuck_count,
      'followup_overdue', s.followup_overdue_count,
      'payment_pending', s.payment_pending_count
    )
    from summary s
  ),
  'pagination',
  (
    select jsonb_build_object(
      'page', m.page_no,
      'page_size', m.page_size,
      'total', m.total,
      'total_pages',
        greatest(1, ceil(m.total::numeric / m.page_size::numeric)::integer),
      'from',
        case
          when m.total = 0 then 0
          else ((m.page_no - 1) * m.page_size) + 1
        end,
      'to',
        least(m.total, (m.page_no * m.page_size)::bigint)
    )
    from page_meta m
  ),
  'options',
  jsonb_build_object(
    'stages',
    coalesce(
      (
        select jsonb_agg(x.value order by x.value)
        from (
          select distinct current_stage as value
          from base
          where current_stage is not null
        ) x
      ),
      '[]'::jsonb
    ),
    'sources',
    coalesce(
      (
        select jsonb_agg(x.value order by x.value)
        from (
          select distinct first_touch_source as value
          from base
          where nullif(btrim(first_touch_source), '') is not null
        ) x
      ),
      '[]'::jsonb
    ),
    'channels',
    coalesce(
      (
        select jsonb_agg(x.value order by x.value)
        from (
          select distinct current_contact_channel as value
          from base
          where current_contact_channel is not null
        ) x
      ),
      '[]'::jsonb
    ),
    'owners',
    coalesce(
      (
        select jsonb_agg(x.value order by x.value)
        from (
          select distinct owner_name as value
          from base
          where nullif(btrim(owner_name), '') is not null
        ) x
      ),
      '[]'::jsonb
    ),
    'courses',
    coalesce(
      (
        select jsonb_agg(x.value order by x.value)
        from (
          select distinct course_name as value
          from base
          where nullif(btrim(course_name), '') is not null
        ) x
      ),
      '[]'::jsonb
    )
  )
);
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
  'Tenant-scoped optimized Leads workspace read model. All rows, summaries, options, and pagination are scoped to p_organization_id.';

commit;
