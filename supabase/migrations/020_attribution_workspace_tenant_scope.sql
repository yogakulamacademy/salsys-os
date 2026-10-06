-- 020_attribution_workspace_tenant_scope.sql
-- Phase 6B: tenant-scope Attribution read models and optimized workspace RPC.
--
-- Deployment safety:
-- The existing 5-argument RPC is retained as a fail-closed compatibility shim.
-- New application code must call the 6-argument RPC with p_organization_id.

begin;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'leads'
      and column_name = 'organization_id'
  ) then
    raise exception 'public.leads.organization_id is required';
  end if;

  if to_regclass('public.v_attribution_lead_facts') is null then
    raise exception 'public.v_attribution_lead_facts is required';
  end if;

  if to_regclass('public.v_attribution_model_rows') is null then
    raise exception 'public.v_attribution_model_rows is required';
  end if;
end
$$;

create or replace view public.v_attribution_lead_facts as
with payment_totals as (
  select
    p.lead_id,
    coalesce(sum(
      case
        when upper(p.currency) = 'INR'
          and p.payment_kind::text <> 'refund'
          and p.status::text = 'paid'
          then p.amount
        when upper(p.currency) = 'INR'
          and p.payment_kind::text = 'refund'
          and p.status::text = any (array['refunded'::text, 'paid'::text])
          then -p.amount
        else 0::numeric
      end
    ), 0::numeric)::numeric(14,2) as revenue_inr,
    coalesce(sum(
      case
        when upper(p.currency) = 'USD'
          and p.payment_kind::text <> 'refund'
          and p.status::text = 'paid'
          then p.amount
        when upper(p.currency) = 'USD'
          and p.payment_kind::text = 'refund'
          and p.status::text = any (array['refunded'::text, 'paid'::text])
          then -p.amount
        else 0::numeric
      end
    ), 0::numeric)::numeric(14,2) as revenue_usd
  from public.payments p
  group by p.lead_id
),
latest_enrollment as (
  select distinct on (e.lead_id)
    e.lead_id,
    e.status::text as enrollment_status,
    e.enrolled_at,
    e.created_at
  from public.enrollments e
  order by e.lead_id, coalesce(e.enrolled_at, e.created_at) desc, e.created_at desc
)
select
  l.id as lead_id,
  l.lead_code,
  coalesce(
    nullif(btrim(l.display_name), ''),
    nullif(btrim(concat_ws(' ', l.first_name, l.last_name)), ''),
    l.lead_code
  ) as lead_name,
  l.created_at,
  l.current_stage::text as current_stage,
  l.status::text as lead_status,
  l.intent::text as intent,
  l.interested_course_id as course_id,
  c.name as course_name,
  l.preferred_location,
  l.country,
  coalesce(nullif(btrim(l.first_touch_source), ''), nullif(btrim(la.first_touch_source), '')) as first_touch_source,
  coalesce(nullif(btrim(l.first_touch_medium), ''), nullif(btrim(la.first_touch_medium), '')) as first_touch_medium,
  coalesce(nullif(btrim(l.first_touch_campaign), ''), nullif(btrim(la.first_touch_campaign), '')) as first_touch_campaign,
  l.lead_creation_channel::text as lead_creation_channel,
  l.current_contact_channel::text as current_contact_channel,
  coalesce(nullif(btrim(l.last_touch_source), ''), nullif(btrim(la.last_touch_source), '')) as last_touch_source,
  coalesce(nullif(btrim(l.last_touch_medium), ''), nullif(btrim(la.last_touch_medium), '')) as last_touch_medium,
  coalesce(nullif(btrim(l.last_touch_campaign), ''), nullif(btrim(la.last_touch_campaign), '')) as last_touch_campaign,
  la.conversion_touchpoint_id,
  conversion_tp.source as conversion_touch_source,
  conversion_tp.medium as conversion_touch_medium,
  conversion_tp.campaign_name as conversion_touch_campaign,
  conversion_tp.channel::text as conversion_touch_channel,
  conversion_tp.occurred_at as conversion_touch_at,
  l.current_stage::text = any (
    array['qualified'::text, 'high_intent'::text, 'payment_pending'::text, 'enrolled'::text]
  ) as is_qualified_plus,
  (
    l.current_stage::text = 'enrolled'::text
    or le.enrollment_status = any (array['confirmed'::text, 'completed'::text])
  ) as is_enrolled,
  le.enrollment_status,
  coalesce(pt.revenue_inr, 0::numeric)::numeric(14,2) as revenue_inr,
  coalesce(pt.revenue_usd, 0::numeric)::numeric(14,2) as revenue_usd,
  l.organization_id as organization_id
from public.leads l
left join public.courses c on c.id = l.interested_course_id
left join public.lead_attribution la on la.lead_id = l.id
left join public.touchpoints conversion_tp on conversion_tp.id = la.conversion_touchpoint_id
left join payment_totals pt on pt.lead_id = l.id
left join latest_enrollment le on le.lead_id = l.id;

alter view public.v_attribution_lead_facts
  set (security_invoker = true);

comment on view public.v_attribution_lead_facts is
  'Tenant-aware Attribution lead facts. Preserves existing attribution, enrollment and payment facts and appends organization_id.';

create or replace view public.v_attribution_model_rows as
select
  f.lead_id,
  f.lead_code,
  f.lead_name,
  f.created_at,
  f.current_stage,
  f.lead_status,
  f.intent,
  f.course_id,
  f.course_name,
  f.preferred_location,
  f.country,
  model.model_name,
  case
    when model.raw_value is null
      or btrim(model.raw_value) = ''
      or lower(btrim(model.raw_value)) = any (
        array['unknown'::text, 'unattributed'::text, '(not set)'::text, 'not set'::text]
      )
      then 'Unknown'::text
    else btrim(model.raw_value)
  end as attribution_value,
  model.medium,
  model.campaign,
  case
    when model.raw_value is null
      or btrim(model.raw_value) = ''
      or lower(btrim(model.raw_value)) = any (
        array['unknown'::text, 'unattributed'::text, '(not set)'::text, 'not set'::text]
      )
      then false
    else true
  end as is_known,
  f.is_qualified_plus,
  f.is_enrolled,
  f.revenue_inr,
  f.revenue_usd,
  f.organization_id as organization_id
from public.v_attribution_lead_facts f
cross join lateral (
  values
    ('first_touch'::text, f.first_touch_source, f.first_touch_medium, f.first_touch_campaign),
    ('lead_creation'::text, f.lead_creation_channel, null::text, null::text),
    ('last_touch'::text, f.last_touch_source, f.last_touch_medium, f.last_touch_campaign),
    ('current_channel'::text, f.current_contact_channel, null::text, null::text)
) model(model_name, raw_value, medium, campaign);

alter view public.v_attribution_model_rows
  set (security_invoker = true);

comment on view public.v_attribution_model_rows is
  'Tenant-aware Attribution model rows. Appends organization_id for explicit workspace scoping.';


create or replace function public.get_attribution_workspace(
  p_organization_id uuid,
  p_query text default null,
  p_course text default null,
  p_location text default null,
  p_country text default null,
  p_stage text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $function$
with
params as (
  select
    nullif(btrim(coalesce(p_query, '')), '') as query_text,
    nullif(btrim(coalesce(p_course, '')), '') as course_filter,
    nullif(btrim(coalesce(p_location, '')), '') as location_filter,
    nullif(btrim(coalesce(p_country, '')), '') as country_filter,
    nullif(btrim(coalesce(p_stage, '')), '') as stage_filter
),
model_values(model_name) as (
  values
    ('first_touch'::text),
    ('lead_creation'::text),
    ('last_touch'::text),
    ('current_channel'::text)
),
base as materialized (
  select
    v.lead_name,
    v.lead_code,
    v.current_stage::text as current_stage,
    v.course_name,
    v.preferred_location,
    v.country,
    v.model_name::text as model_name,
    coalesce(nullif(btrim(v.attribution_value::text), ''), 'Unknown') as attribution_value,
    v.medium,
    v.campaign,
    coalesce(v.is_known, false) as is_known,
    coalesce(v.is_qualified_plus, false) as is_qualified_plus,
    coalesce(v.is_enrolled, false) as is_enrolled,
    coalesce(v.revenue_inr, 0)::numeric as revenue_inr,
    coalesce(v.revenue_usd, 0)::numeric as revenue_usd
  from public.v_attribution_model_rows v
  where v.organization_id = p_organization_id
),
filtered as materialized (
  select b.*
  from base b
  cross join params p
  where
    (p.course_filter is null or p.course_filter = 'all' or b.course_name::text = p.course_filter)
    and (p.location_filter is null or p.location_filter = 'all' or b.preferred_location::text = p.location_filter)
    and (p.country_filter is null or p.country_filter = 'all' or b.country::text = p.country_filter)
    and (p.stage_filter is null or p.stage_filter = 'all' or b.current_stage = p.stage_filter)
    and (
      p.query_text is null
      or position(
        lower(p.query_text)
        in lower(
          concat_ws(
            ' ',
            b.lead_name,
            b.lead_code,
            b.attribution_value,
            b.medium,
            b.campaign,
            b.course_name,
            b.preferred_location,
            b.country
          )
        )
      ) > 0
    )
),
metric_agg as (
  select
    f.model_name,
    count(*)::integer as total,
    count(*) filter (where f.is_known)::integer as known,
    count(*) filter (where f.is_qualified_plus)::integer as qualified,
    count(*) filter (where f.is_enrolled)::integer as enrolled,
    coalesce(sum(f.revenue_inr), 0) as revenue_inr,
    coalesce(sum(f.revenue_usd), 0) as revenue_usd
  from filtered f
  group by f.model_name
),
metrics as (
  select
    m.model_name,
    coalesce(a.total, 0)::integer as total,
    coalesce(a.known, 0)::integer as known,
    (coalesce(a.total, 0) - coalesce(a.known, 0))::integer as unknown,
    case
      when coalesce(a.total, 0) > 0
      then (coalesce(a.known, 0)::numeric / a.total::numeric) * 100
      else 0
    end as coverage,
    coalesce(a.qualified, 0)::integer as qualified,
    coalesce(a.enrolled, 0)::integer as enrolled,
    coalesce(a.revenue_inr, 0) as revenue_inr,
    coalesce(a.revenue_usd, 0) as revenue_usd
  from model_values m
  left join metric_agg a on a.model_name = m.model_name
),
performance as (
  select
    f.model_name,
    f.attribution_value as value,
    count(*)::integer as leads,
    count(*) filter (where f.is_qualified_plus)::integer as qualified,
    count(*) filter (where f.is_enrolled)::integer as enrolled,
    coalesce(sum(f.revenue_inr), 0) as revenue_inr,
    coalesce(sum(f.revenue_usd), 0) as revenue_usd
  from filtered f
  group by f.model_name, f.attribution_value
),
comparison_base as (
  select
    f.attribution_value as value,
    count(*) filter (where f.model_name = 'first_touch')::integer as first_touch,
    count(*) filter (where f.model_name = 'lead_creation')::integer as lead_creation,
    count(*) filter (where f.model_name = 'last_touch')::integer as last_touch,
    count(*) filter (where f.model_name = 'current_channel')::integer as current_channel
  from filtered f
  group by f.attribution_value
),
comparison as (
  select c.*
  from comparison_base c
  order by
    greatest(c.first_touch, c.lead_creation, c.last_touch, c.current_channel) desc,
    lower(c.value) asc
  limit 16
),
course_options as (
  select distinct b.course_name::text as value
  from base b
  where b.course_name is not null
    and btrim(b.course_name::text) <> ''
),
location_options as (
  select distinct b.preferred_location::text as value
  from base b
  where b.preferred_location is not null
    and btrim(b.preferred_location::text) <> ''
),
country_options as (
  select distinct b.country::text as value
  from base b
  where b.country is not null
    and btrim(b.country::text) <> ''
),
stage_options as (
  select distinct b.current_stage as value
  from base b
  where b.current_stage is not null
    and btrim(b.current_stage) <> ''
)
select jsonb_build_object(
  'metrics_by_model',
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'model_name', m.model_name,
          'total', m.total,
          'known', m.known,
          'unknown', m.unknown,
          'coverage', m.coverage,
          'qualified', m.qualified,
          'enrolled', m.enrolled,
          'revenue_inr', m.revenue_inr,
          'revenue_usd', m.revenue_usd
        )
        order by
          case m.model_name
            when 'first_touch' then 1
            when 'lead_creation' then 2
            when 'last_touch' then 3
            when 'current_channel' then 4
            else 5
          end
      )
      from metrics m
    ),
    '[]'::jsonb
  ),
  'performance_rows',
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'model_name', p.model_name,
          'value', p.value,
          'leads', p.leads,
          'qualified', p.qualified,
          'enrolled', p.enrolled,
          'revenue_inr', p.revenue_inr,
          'revenue_usd', p.revenue_usd
        )
        order by p.model_name, p.leads desc, lower(p.value)
      )
      from performance p
    ),
    '[]'::jsonb
  ),
  'comparison',
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'value', c.value,
          'first_touch', c.first_touch,
          'lead_creation', c.lead_creation,
          'last_touch', c.last_touch,
          'current_channel', c.current_channel
        )
        order by
          greatest(c.first_touch, c.lead_creation, c.last_touch, c.current_channel) desc,
          lower(c.value)
      )
      from comparison c
    ),
    '[]'::jsonb
  ),
  'options',
  jsonb_build_object(
    'courses',
    coalesce(
      (select jsonb_agg(value order by lower(value)) from course_options),
      '[]'::jsonb
    ),
    'locations',
    coalesce(
      (select jsonb_agg(value order by lower(value)) from location_options),
      '[]'::jsonb
    ),
    'countries',
    coalesce(
      (select jsonb_agg(value order by lower(value)) from country_options),
      '[]'::jsonb
    ),
    'stages',
    coalesce(
      (select jsonb_agg(value order by lower(value)) from stage_options),
      '[]'::jsonb
    )
  )
);
$function$;

revoke all on function public.get_attribution_workspace(
  uuid, text, text, text, text, text
) from public;

revoke all on function public.get_attribution_workspace(
  uuid, text, text, text, text, text
) from anon;

grant execute on function public.get_attribution_workspace(
  uuid, text, text, text, text, text
) to authenticated;

grant execute on function public.get_attribution_workspace(
  uuid, text, text, text, text, text
) to service_role;

comment on function public.get_attribution_workspace(
  uuid, text, text, text, text, text
) is
  'Tenant-aware Attribution workspace. Requires explicit organization_id and scopes metrics, performance, comparison and options to that organization.';


create or replace function public.get_attribution_workspace(
  p_query text default null,
  p_course text default null,
  p_location text default null,
  p_country text default null,
  p_stage text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $function$
select jsonb_build_object(
  'metrics_by_model', '[]'::jsonb,
  'performance_rows', '[]'::jsonb,
  'comparison', '[]'::jsonb,
  'options', jsonb_build_object(
    'courses', '[]'::jsonb,
    'locations', '[]'::jsonb,
    'countries', '[]'::jsonb,
    'stages', '[]'::jsonb
  )
);
$function$;

revoke all on function public.get_attribution_workspace(
  text, text, text, text, text
) from public;

revoke all on function public.get_attribution_workspace(
  text, text, text, text, text
) from anon;

grant execute on function public.get_attribution_workspace(
  text, text, text, text, text
) to authenticated;

grant execute on function public.get_attribution_workspace(
  text, text, text, text, text
) to service_role;

comment on function public.get_attribution_workspace(
  text, text, text, text, text
) is
  'Deprecated fail-closed compatibility shim. Returns an empty Attribution workspace; callers must migrate to the organization-scoped 6-argument overload.';

commit;
