begin;

-- ============================================================
-- SalsysOS
-- 043_paid_media_workspace_query_optimization.sql
--
-- Purpose:
--   - evaluate the organization-scoped paid-media dataset once
--   - derive rows, overview and selected lead from that dataset
--   - avoid rebuilding the expensive journey/read-model chain
--   - preserve tenant isolation introduced by migration 042
-- ============================================================

create or replace function public.get_paid_media_leads_workspace(
  p_organization_id uuid,
  p_query text default null,
  p_platform text default null,
  p_stage text default null,
  p_temperature text default null,
  p_payment text default null,
  p_match text default null,
  p_course text default null,
  p_country text default null,
  p_campaign text default null,
  p_from text default null,
  p_to text default null,
  p_selected_lead_id text default null,
  p_page integer default 1,
  p_page_size integer default 50
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, auth, pg_temp
as $function$
declare
  v_result jsonb;
begin
  if p_organization_id is null then
    raise exception 'organization_id is required';
  end if;

  if not public.is_organization_member(p_organization_id) then
    raise exception
      'Not authorized for organization %',
      p_organization_id;
  end if;

  with

  params as (
    select
      nullif(
        btrim(coalesce(p_query, '')),
        ''
      ) as query_text,

      nullif(
        btrim(coalesce(p_platform, '')),
        ''
      ) as platform_filter,

      nullif(
        btrim(coalesce(p_stage, '')),
        ''
      ) as stage_filter,

      nullif(
        btrim(coalesce(p_temperature, '')),
        ''
      ) as temperature_filter,

      nullif(
        btrim(coalesce(p_payment, '')),
        ''
      ) as payment_filter,

      nullif(
        btrim(coalesce(p_match, '')),
        ''
      ) as match_filter,

      nullif(
        btrim(coalesce(p_course, '')),
        ''
      ) as course_filter,

      nullif(
        btrim(coalesce(p_country, '')),
        ''
      ) as country_filter,

      nullif(
        btrim(coalesce(p_campaign, '')),
        ''
      ) as campaign_filter,

      case
        when p_from ~ '^\d{4}-\d{2}-\d{2}$'
          then p_from::date
        else null
      end as from_date,

      case
        when p_to ~ '^\d{4}-\d{2}-\d{2}$'
          then p_to::date
        else null
      end as to_date,

      nullif(
        btrim(coalesce(p_selected_lead_id, '')),
        ''
      ) as selected_lead_id,

      greatest(
        coalesce(p_page, 1),
        1
      ) as page_number,

      least(
        greatest(
          coalesce(p_page_size, 50),
          1
        ),
        100
      ) as page_size
  ),

  -- ----------------------------------------------------------
  -- Critical optimization:
  -- evaluate the expensive paid-media UI read model ONCE.
  -- Everything below reuses this materialized dataset.
  -- ----------------------------------------------------------

  workspace_rows as materialized (
    select v.*
    from public.v_paid_media_leads_ui v
    where v.organization_id = p_organization_id
  ),

  filtered as materialized (
    select v.*
    from workspace_rows v
    cross join params p
    where

      (
        p.platform_filter is null
        or p.platform_filter = 'all'
        or v.platform::text = p.platform_filter
      )

      and (
        p.stage_filter is null
        or p.stage_filter = 'all'
        or v.current_stage::text = p.stage_filter
      )

      and (
        p.temperature_filter is null
        or p.temperature_filter = 'all'
        or v.behaviour_temperature::text =
          p.temperature_filter
      )

      and (
        p.payment_filter is null
        or p.payment_filter = 'all'
        or v.payment_status::text =
          p.payment_filter
      )

      and (
        p.match_filter is null
        or p.match_filter = 'all'

        or (
          p.match_filter = 'matched'
          and v.campaign_matched is true
        )

        or (
          p.match_filter = 'unmatched'
          and v.campaign_matched is false
        )
      )

      and (
        p.course_filter is null
        or coalesce(
          v.course_name::text,
          ''
        ) ilike '%' || p.course_filter || '%'
      )

      and (
        p.country_filter is null
        or coalesce(
          v.country::text,
          ''
        ) ilike '%' || p.country_filter || '%'
      )

      and (
        p.campaign_filter is null
        or coalesce(
          v.campaign_name::text,
          ''
        ) ilike '%' || p.campaign_filter || '%'
      )

      and (
        p.from_date is null
        or v.first_paid_touch_at >= p.from_date
      )

      and (
        p.to_date is null
        or v.first_paid_touch_at < (p.to_date + 1)
      )

      and (
        p.query_text is null

        or coalesce(
          v.lead_name::text,
          ''
        ) ilike '%' || p.query_text || '%'

        or coalesce(
          v.lead_code::text,
          ''
        ) ilike '%' || p.query_text || '%'

        or coalesce(
          v.campaign_name::text,
          ''
        ) ilike '%' || p.query_text || '%'

        or coalesce(
          v.course_name::text,
          ''
        ) ilike '%' || p.query_text || '%'

        or coalesce(
          v.email::text,
          ''
        ) ilike '%' || p.query_text || '%'

        or coalesce(
          v.phone::text,
          ''
        ) ilike '%' || p.query_text || '%'
      )
  ),

  filtered_count as (
    select
      count(*)::integer as total
    from filtered
  ),

  paged as (
    select f.*
    from filtered f
    cross join params p
    order by
      f.first_paid_touch_at desc nulls last,
      f.lead_id
    limit (
      select page_size
      from params
    )
    offset (
      select
        (page_number - 1) * page_size
      from params
    )
  ),

  -- ----------------------------------------------------------
  -- Selected lead now reuses workspace_rows instead of
  -- executing v_paid_media_leads_ui again.
  -- ----------------------------------------------------------

  selected_lead as (
    select v.*
    from workspace_rows v
    cross join params p
    where
      p.selected_lead_id is not null
      and v.lead_id::text =
        p.selected_lead_id
    limit 1
  ),

  selected_touchpoints as (
    select
      t.id,
      t.event_type,
      t.source,
      t.medium,
      t.campaign_name,
      t.landing_page,
      t.occurred_at
    from public.touchpoints t
    cross join params p
    where
      p.selected_lead_id is not null
      and t.organization_id =
        p_organization_id
      and t.lead_id::text =
        p.selected_lead_id
    order by
      t.occurred_at desc
    limit 8
  ),

  -- ----------------------------------------------------------
  -- Same semantics as v_paid_media_leads_overview,
  -- but calculated from workspace_rows so the expensive
  -- paid-media/journey stack is not evaluated a second time.
  --
  -- GROUP BY preserves the previous empty-workspace behaviour:
  -- if there are no paid-media rows, overview returns no row
  -- and the payload below becomes {}.
  -- ----------------------------------------------------------

  overview as (
    select
      count(*) as paid_media_leads,

      count(*) filter (
        where platform = 'google'
      ) as google_leads,

      count(*) filter (
        where platform = 'instagram'
      ) as instagram_leads,

      count(*) filter (
        where platform = 'facebook'
      ) as facebook_leads,

      count(*) filter (
        where platform = 'meta'
      ) as meta_unspecified_leads,

      count(*) filter (
        where current_stage = any (
          array[
            'qualified'::lead_stage,
            'high_intent'::lead_stage,
            'payment_pending'::lead_stage,
            'enrolled'::lead_stage
          ]
        )
      ) as qualified_leads,

      count(*) filter (
        where behaviour_temperature = 'hot'
      ) as hot_leads,

      count(*) filter (
        where has_payment
      ) as paid_leads,

      count(*) filter (
        where is_enrolled
      ) as enrolled_leads,

      count(*) filter (
        where campaign_matched
      ) as campaign_matched_leads,

      count(*) filter (
        where allocated_acquisition_cost
          is not null
      ) as leads_with_allocated_cost,

      coalesce(
        sum(revenue_inr),
        0::numeric
      )::numeric(14,2) as revenue_inr,

      coalesce(
        sum(revenue_usd),
        0::numeric
      )::numeric(14,2) as revenue_usd,

      organization_id

    from workspace_rows
    group by organization_id
  )

  select jsonb_build_object(

    'overview',
    coalesce(
      (
        select to_jsonb(o)
        from overview o
      ),
      '{}'::jsonb
    ),

    'rows',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(

            'lead_id',
              x.lead_id,

            'lead_code',
              x.lead_code,

            'lead_name',
              x.lead_name,

            'email',
              x.email,

            'platform',
              x.platform,

            'platform_label',
              x.platform_label,

            'campaign_id',
              x.campaign_id,

            'campaign_name',
              x.campaign_name,

            'current_stage',
              x.current_stage,

            'behaviour_temperature',
              x.behaviour_temperature,

            'payment_status',
              x.payment_status,

            'revenue_inr',
              x.revenue_inr,

            'revenue_usd',
              x.revenue_usd,

            'allocated_acquisition_cost',
              x.allocated_acquisition_cost,

            'acquisition_currency',
              x.acquisition_currency,

            'course_name',
              x.course_name,

            'country',
              x.country,

            'preferred_location',
              x.preferred_location,

            'first_paid_touch_at',
              x.first_paid_touch_at,

            'campaign_matched',
              x.campaign_matched
          )
          order by
            x.first_paid_touch_at desc nulls last,
            x.lead_id
        )
        from paged x
      ),
      '[]'::jsonb
    ),

    'pagination',
    (
      select jsonb_build_object(

        'page',
          p.page_number,

        'page_size',
          p.page_size,

        'total',
          c.total,

        'total_pages',
          greatest(
            1,
            ceil(
              c.total::numeric /
              p.page_size
            )::integer
          ),

        'from',
          case
            when c.total = 0
              then 0
            else
              (
                (p.page_number - 1) *
                p.page_size
              ) + 1
          end,

        'to',
          least(
            p.page_number * p.page_size,
            c.total
          )
      )
      from params p
      cross join filtered_count c
    ),

    'selected_lead',
    (
      select to_jsonb(s)
      from selected_lead s
    ),

    'selected_touchpoints',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(

            'id',
              t.id,

            'event_type',
              t.event_type,

            'source',
              t.source,

            'medium',
              t.medium,

            'campaign_name',
              t.campaign_name,

            'landing_page',
              t.landing_page,

            'occurred_at',
              t.occurred_at
          )
          order by
            t.occurred_at desc
        )
        from selected_touchpoints t
      ),
      '[]'::jsonb
    )
  )
  into v_result;

  return v_result;
end;
$function$;


-- ------------------------------------------------------------
-- Preserve the hardened execution boundary from migration 042.
-- ------------------------------------------------------------

revoke all on function public.get_paid_media_leads_workspace(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  integer
)
from public, anon, authenticated, service_role;

grant execute on function public.get_paid_media_leads_workspace(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  integer
)
to authenticated, service_role;

commit;