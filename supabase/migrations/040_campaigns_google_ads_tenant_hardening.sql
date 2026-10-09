begin;

-- =============================================================================
-- MIGRATION 040
-- CAMPAIGNS + GOOGLE ADS TENANT HARDENING
--
-- Canonicalizes production Campaigns / Google Ads reporting objects that were
-- previously present only in the live database.
--
-- Security model:
--   1. Google Ads reporting views preserve organization_id.
--   2. Views remain SECURITY INVOKER so underlying RLS remains enforced.
--   3. Campaigns workspace RPC requires an explicit organization_id.
--   4. Campaigns RPC verifies organization membership before reading data.
--   5. Old non-tenant Campaigns RPC signature is removed.
--   6. PUBLIC / anon cannot execute the Campaigns workspace RPC.
--   7. Google Ads reporting views are SELECT-only for authenticated/service_role.
-- =============================================================================


-- =============================================================================
-- GOOGLE ADS 30-DAY OVERVIEW
-- Existing columns are preserved in their existing order.
-- organization_id is appended for backward-compatible view replacement.
-- =============================================================================

create or replace view public.v_google_ads_30d_overview
with (security_invoker = true)
as
select
  g.customer_id,
  max(g.date) as latest_data_date,
  max(g.currency_code) as currency_code,
  sum(g.impressions)::bigint as impressions,
  sum(g.clicks)::bigint as clicks,
  sum(g.cost_micros)::bigint as cost_micros,
  round(
    sum(g.cost_micros) / 1000000::numeric,
    2
  ) as spend,
  sum(g.conversions)::numeric(18,2) as conversions,
  sum(g.conversions_value)::numeric(18,2) as google_conversion_value,
  case
    when sum(g.impressions) > 0::numeric then
      round(
        sum(g.clicks) / sum(g.impressions) * 100::numeric,
        2
      )
    else 0::numeric
  end as ctr_percent,
  case
    when sum(g.clicks) > 0::numeric then
      round(
        sum(g.cost_micros) / 1000000::numeric / sum(g.clicks),
        2
      )
    else 0::numeric
  end as avg_cpc,
  case
    when sum(g.conversions) > 0::numeric then
      round(
        sum(g.cost_micros) / 1000000::numeric / sum(g.conversions),
        2
      )
    else 0::numeric
  end as cost_per_conversion,
  g.organization_id
from public.google_ads_campaign_daily g
where g.date >= (current_date - 29)
group by
  g.customer_id,
  g.organization_id;


-- =============================================================================
-- GOOGLE ADS CAMPAIGNS
-- =============================================================================

create or replace view public.v_google_ads_campaign_30d
with (security_invoker = true)
as
select
  g.customer_id,
  g.campaign_id,
  max(g.campaign_name) as campaign_name,
  max(g.campaign_status) as campaign_status,
  max(g.advertising_channel_type) as advertising_channel_type,
  max(g.currency_code) as currency_code,
  sum(g.impressions)::bigint as impressions,
  sum(g.clicks)::bigint as clicks,
  round(
    sum(g.cost_micros) / 1000000::numeric,
    2
  ) as spend,
  sum(g.conversions)::numeric(18,2) as conversions,
  sum(g.conversions_value)::numeric(18,2) as google_conversion_value,
  case
    when sum(g.impressions) > 0::numeric then
      round(
        sum(g.clicks) / sum(g.impressions) * 100::numeric,
        2
      )
    else 0::numeric
  end as ctr_percent,
  case
    when sum(g.clicks) > 0::numeric then
      round(
        sum(g.cost_micros) / 1000000::numeric / sum(g.clicks),
        2
      )
    else 0::numeric
  end as avg_cpc,
  case
    when sum(g.conversions) > 0::numeric then
      round(
        sum(g.cost_micros) / 1000000::numeric / sum(g.conversions),
        2
      )
    else 0::numeric
  end as cost_per_conversion,
  g.organization_id
from public.google_ads_campaign_daily g
where g.date >= (current_date - 29)
group by
  g.customer_id,
  g.campaign_id,
  g.organization_id;


-- =============================================================================
-- GOOGLE ADS KEYWORDS
-- =============================================================================

create or replace view public.v_google_ads_keyword_30d
with (security_invoker = true)
as
select
  g.customer_id,
  g.campaign_id,
  max(g.campaign_name) as campaign_name,
  g.ad_group_id,
  max(g.ad_group_name) as ad_group_name,
  g.criterion_id,
  max(g.keyword_text) as keyword_text,
  max(g.match_type) as match_type,
  max(g.currency_code) as currency_code,
  sum(g.impressions)::bigint as impressions,
  sum(g.clicks)::bigint as clicks,
  round(
    sum(g.cost_micros) / 1000000::numeric,
    2
  ) as spend,
  sum(g.conversions)::numeric(18,2) as conversions,
  sum(g.conversions_value)::numeric(18,2) as google_conversion_value,
  g.organization_id
from public.google_ads_keyword_daily g
where g.date >= (current_date - 29)
group by
  g.customer_id,
  g.campaign_id,
  g.ad_group_id,
  g.criterion_id,
  g.organization_id;


-- =============================================================================
-- GOOGLE ADS SEARCH TERMS
-- =============================================================================

create or replace view public.v_google_ads_search_term_30d
with (security_invoker = true)
as
select
  g.customer_id,
  g.campaign_id,
  max(g.campaign_name) as campaign_name,
  g.ad_group_id,
  max(g.ad_group_name) as ad_group_name,
  g.search_term,
  max(g.search_term_status) as search_term_status,
  max(g.currency_code) as currency_code,
  sum(g.impressions)::bigint as impressions,
  sum(g.clicks)::bigint as clicks,
  round(
    sum(g.cost_micros) / 1000000::numeric,
    2
  ) as spend,
  sum(g.conversions)::numeric(18,2) as conversions,
  sum(g.conversions_value)::numeric(18,2) as google_conversion_value,
  g.organization_id
from public.google_ads_search_term_daily g
where g.date >= (current_date - 29)
group by
  g.customer_id,
  g.campaign_id,
  g.ad_group_id,
  g.search_term,
  g.organization_id;


-- =============================================================================
-- GOOGLE ADS COUNTRY
-- =============================================================================

create or replace view public.v_google_ads_country_30d
with (security_invoker = true)
as
select
  g.customer_id,
  g.country_criterion_id,
  coalesce(
    max(g.country_name),
    g.country_criterion_id
  ) as country_name,
  max(g.currency_code) as currency_code,
  sum(g.impressions)::bigint as impressions,
  sum(g.clicks)::bigint as clicks,
  round(
    sum(g.cost_micros) / 1000000::numeric,
    2
  ) as spend,
  sum(g.conversions)::numeric(18,2) as conversions,
  sum(g.conversions_value)::numeric(18,2) as google_conversion_value,
  g.organization_id
from public.google_ads_geo_daily g
where g.date >= (current_date - 29)
group by
  g.customer_id,
  g.country_criterion_id,
  g.organization_id;


-- =============================================================================
-- GOOGLE ADS DEVICE
-- =============================================================================

create or replace view public.v_google_ads_device_30d
with (security_invoker = true)
as
select
  g.customer_id,
  g.device,
  max(g.currency_code) as currency_code,
  sum(g.impressions)::bigint as impressions,
  sum(g.clicks)::bigint as clicks,
  round(
    sum(g.cost_micros) / 1000000::numeric,
    2
  ) as spend,
  sum(g.conversions)::numeric(18,2) as conversions,
  sum(g.conversions_value)::numeric(18,2) as google_conversion_value,
  g.organization_id
from public.google_ads_device_daily g
where g.date >= (current_date - 29)
group by
  g.customer_id,
  g.device,
  g.organization_id;


-- =============================================================================
-- GOOGLE ADS SYNC HEALTH
-- One row per organization instead of one global row.
-- =============================================================================

create or replace view public.v_google_ads_sync_health
with (security_invoker = true)
as
with tenant_orgs as (
  select organization_id
  from public.google_ads_campaign_daily

  union

  select organization_id
  from public.google_ads_sync_runs
),
campaign_health as (
  select
    organization_id,
    max(date) as latest_data_date,
    max(updated_at) as latest_cache_update_at
  from public.google_ads_campaign_daily
  group by organization_id
),
latest_runs as (
  select distinct on (organization_id)
    organization_id,
    started_at,
    completed_at,
    status,
    total_rows,
    error_message
  from public.google_ads_sync_runs
  order by
    organization_id,
    started_at desc
)
select
  ch.latest_data_date,
  ch.latest_cache_update_at,
  lr.started_at as last_sync_started_at,
  lr.completed_at as last_sync_completed_at,
  lr.status as last_sync_status,
  lr.total_rows as last_sync_total_rows,
  lr.error_message as last_sync_error,
  o.organization_id
from tenant_orgs o
left join campaign_health ch
  on ch.organization_id = o.organization_id
left join latest_runs lr
  on lr.organization_id = o.organization_id;


-- =============================================================================
-- GOOGLE ADS REPORTING VIEW LEAST PRIVILEGE
-- =============================================================================

revoke all privileges on table
  public.v_google_ads_30d_overview,
  public.v_google_ads_campaign_30d,
  public.v_google_ads_keyword_30d,
  public.v_google_ads_search_term_30d,
  public.v_google_ads_country_30d,
  public.v_google_ads_device_30d,
  public.v_google_ads_sync_health
from public, anon, authenticated, service_role;


grant select on table
  public.v_google_ads_30d_overview,
  public.v_google_ads_campaign_30d,
  public.v_google_ads_keyword_30d,
  public.v_google_ads_search_term_30d,
  public.v_google_ads_country_30d,
  public.v_google_ads_device_30d,
  public.v_google_ads_sync_health
to authenticated, service_role;


-- =============================================================================
-- CAMPAIGNS WORKSPACE RPC
-- =============================================================================

drop function if exists public.get_campaigns_workspace(
  text,
  text,
  text,
  text,
  integer,
  integer
);


create function public.get_campaigns_workspace(
  p_organization_id uuid,
  p_query text default null::text,
  p_platform text default 'all'::text,
  p_outcome text default 'all'::text,
  p_sort text default 'spend_desc'::text,
  p_page integer default 1,
  p_page_size integer default 50
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, auth, pg_temp
as $function$
begin

  if p_organization_id is null then
    raise exception
      'Organization ID is required';
  end if;

  if not public.is_organization_member(
    p_organization_id
  ) then
    raise exception
      'Not authorized for organization %',
      p_organization_id;
  end if;

  return (
with
params as (
  select
    nullif(lower(btrim(coalesce(p_query, ''))), '') as query_text,
    coalesce(nullif(btrim(p_platform), ''), 'all') as platform_filter,
    case
      when p_outcome in (
        'all',
        'with_leads',
        'no_leads',
        'qualified',
        'enrolled',
        'revenue'
      )
      then p_outcome
      else 'all'
    end as outcome_filter,
    case
      when p_sort in (
        'spend_desc',
        'leads_desc',
        'qualified_desc',
        'enrolled_desc',
        'roas_desc',
        'cac_asc',
        'name'
      )
      then p_sort
      else 'spend_desc'
    end as sort_mode,
    greatest(coalesce(p_page, 1), 1) as page_number,
    least(greatest(coalesce(p_page_size, 50), 1), 100) as page_size
),
raw as (
  select
    'Google Ads'::text as platform,
    to_jsonb(g) as payload
  from public.v_google_ads_campaign_crm_30d g
  where g.organization_id = p_organization_id

  union all

  select
    'Meta Ads'::text as platform,
    to_jsonb(m) as payload
  from public.v_meta_ads_campaign_crm_30d m
  where m.organization_id = p_organization_id
),
normalized_base as (
  select
    r.platform,

    coalesce(
      public.campaign_workspace_json_text(
        r.payload,
        array[
          'campaign_id',
          'external_campaign_id',
          'id'
        ]
      ),
      md5(r.platform || ':' || r.payload::text)
    ) as external_id,

    coalesce(
      public.campaign_workspace_json_text(
        r.payload,
        array[
          'campaign_name',
          'name'
        ]
      ),
      public.campaign_workspace_json_text(
        r.payload,
        array[
          'campaign_id',
          'external_campaign_id',
          'id'
        ]
      ),
      'Campaign'
    ) as name,

    coalesce(
      public.campaign_workspace_json_numeric(
        r.payload,
        array[
          'spend',
          'cost',
          'ad_spend',
          'spend_amount'
        ]
      ),
      0
    ) as spend,

    upper(
      coalesce(
        public.campaign_workspace_json_text(
          r.payload,
          array[
            'account_currency',
            'currency',
            'spend_currency'
          ]
        ),
        'INR'
      )
    ) as spend_currency,

    coalesce(
      public.campaign_workspace_json_numeric(
        r.payload,
        array['impressions']
      ),
      0
    ) as impressions,

    coalesce(
      public.campaign_workspace_json_numeric(
        r.payload,
        array[
          'clicks',
          'link_clicks'
        ]
      ),
      0
    ) as clicks,

    coalesce(
      public.campaign_workspace_json_numeric(
        r.payload,
        array[
          'crm_leads',
          'leads',
          'lead_count',
          'attributed_leads'
        ]
      ),
      0
    ) as leads,

    coalesce(
      public.campaign_workspace_json_numeric(
        r.payload,
        array[
          'qualified_leads',
          'qualified',
          'qualified_count'
        ]
      ),
      0
    ) as qualified,

    coalesce(
      public.campaign_workspace_json_numeric(
        r.payload,
        array[
          'high_intent_leads',
          'high_intent'
        ]
      ),
      0
    ) as high_intent,

    coalesce(
      public.campaign_workspace_json_numeric(
        r.payload,
        array[
          'payment_pending_leads',
          'payment_pending'
        ]
      ),
      0
    ) as payment_pending,

    coalesce(
      public.campaign_workspace_json_numeric(
        r.payload,
        array[
          'paid_leads',
          'paid',
          'paid_count'
        ]
      ),
      0
    ) as paid,

    coalesce(
      public.campaign_workspace_json_numeric(
        r.payload,
        array[
          'enrolled_leads',
          'enrolled',
          'enrollment_count'
        ]
      ),
      0
    ) as enrolled,

    coalesce(
      public.campaign_workspace_json_numeric(
        r.payload,
        array[
          'revenue_inr',
          'inr_revenue',
          'crm_revenue_inr'
        ]
      ),
      0
    ) as revenue_inr,

    coalesce(
      public.campaign_workspace_json_numeric(
        r.payload,
        array[
          'revenue_usd',
          'usd_revenue',
          'crm_revenue_usd'
        ]
      ),
      0
    ) as revenue_usd,

    public.campaign_workspace_json_numeric(
      r.payload,
      array[
        'cpl',
        'cost_per_lead'
      ]
    ) as view_cpl,

    public.campaign_workspace_json_numeric(
      r.payload,
      array[
        'cost_per_qualified_lead',
        'cost_per_qualified',
        'cpql'
      ]
    ) as view_cpql,

    public.campaign_workspace_json_numeric(
      r.payload,
      array[
        'cac',
        'cost_per_enrollment',
        'cost_per_enrolled_lead'
      ]
    ) as view_cac,

    public.campaign_workspace_json_numeric(
      r.payload,
      array[
        'roas',
        'crm_roas'
      ]
    ) as view_roas
  from raw r
),
normalized as (
  select
    platform,
    external_id,
    name,
    spend,
    spend_currency,
    impressions,
    clicks,
    leads,
    qualified,
    high_intent,
    payment_pending,
    paid,
    enrolled,
    revenue_inr,
    revenue_usd,

    coalesce(
      view_cpl,
      case
        when leads > 0
        then spend / leads
        else null
      end
    ) as cpl,

    coalesce(
      view_cpql,
      case
        when qualified > 0
        then spend / qualified
        else null
      end
    ) as cpql,

    coalesce(
      view_cac,
      case
        when enrolled > 0
        then spend / enrolled
        else null
      end
    ) as cac,

    coalesce(
      view_roas,
      case
        when spend_currency = 'INR'
          and spend > 0
        then revenue_inr / spend
        else null
      end
    ) as roas
  from normalized_base
),
platform_counts as (
  select
    platform,
    count(*)::integer as campaign_count
  from normalized
  group by platform
),
filtered as (
  select n.*
  from normalized n
  cross join params p
  where
    (
      p.platform_filter = 'all'
      or n.platform = p.platform_filter
    )
    and (
      p.outcome_filter = 'all'
      or (
        p.outcome_filter = 'with_leads'
        and n.leads > 0
      )
      or (
        p.outcome_filter = 'no_leads'
        and n.leads <= 0
      )
      or (
        p.outcome_filter = 'qualified'
        and n.qualified > 0
      )
      or (
        p.outcome_filter = 'enrolled'
        and n.enrolled > 0
      )
      or (
        p.outcome_filter = 'revenue'
        and (
          n.revenue_inr > 0
          or n.revenue_usd > 0
        )
      )
    )
    and (
      p.query_text is null
      or lower(
        concat_ws(
          ' ',
          n.name,
          n.external_id,
          n.platform
        )
      ) like '%' || p.query_text || '%'
    )
),
summary as (
  select
    count(*)::integer as campaign_count,
    coalesce(sum(clicks), 0) as clicks,
    coalesce(sum(leads), 0) as leads,
    coalesce(sum(qualified), 0) as qualified,
    coalesce(sum(enrolled), 0) as enrolled,
    coalesce(sum(revenue_inr), 0) as revenue_inr,
    coalesce(sum(revenue_usd), 0) as revenue_usd
  from filtered
),
spend_summary as (
  select
    spend_currency,
    coalesce(sum(spend), 0) as amount
  from filtered
  group by spend_currency
),
ordered as (
  select f.*
  from filtered f
  cross join params p
  order by
    case when p.sort_mode = 'name'
      then lower(f.name)
    end asc nulls last,

    case when p.sort_mode = 'leads_desc'
      then f.leads
    end desc nulls last,

    case when p.sort_mode = 'qualified_desc'
      then f.qualified
    end desc nulls last,

    case when p.sort_mode = 'enrolled_desc'
      then f.enrolled
    end desc nulls last,

    case when p.sort_mode = 'roas_desc'
      then f.roas
    end desc nulls last,

    case when p.sort_mode = 'cac_asc'
      then f.cac
    end asc nulls last,

    case when p.sort_mode = 'spend_desc'
      then f.spend
    end desc nulls last,

    lower(f.name) asc,
    f.external_id asc
),
paged as (
  select o.*
  from ordered o
  cross join params p
  limit (select page_size from params)
  offset (
    select
      (page_number - 1) * page_size
    from params
  )
),
pagination as (
  select
    p.page_number as page,
    p.page_size,
    s.campaign_count as total,
    case
      when s.campaign_count = 0 then 1
      else ceil(
        s.campaign_count::numeric
        / p.page_size
      )::integer
    end as total_pages,
    case
      when s.campaign_count = 0 then 0
      else
        ((p.page_number - 1) * p.page_size) + 1
    end as from_row,
    least(
      p.page_number * p.page_size,
      s.campaign_count
    )::integer as to_row
  from params p
  cross join summary s
)
select jsonb_build_object(
  'rows',
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id',
            x.platform || ':' || x.external_id,
          'external_id',
            x.external_id,
          'name',
            x.name,
          'platform',
            x.platform,
          'spend',
            x.spend,
          'spend_currency',
            x.spend_currency,
          'impressions',
            x.impressions,
          'clicks',
            x.clicks,
          'leads',
            x.leads,
          'qualified',
            x.qualified,
          'high_intent',
            x.high_intent,
          'payment_pending',
            x.payment_pending,
          'paid',
            x.paid,
          'enrolled',
            x.enrolled,
          'revenue_inr',
            x.revenue_inr,
          'revenue_usd',
            x.revenue_usd,
          'cpl',
            x.cpl,
          'cpql',
            x.cpql,
          'cac',
            x.cac,
          'roas',
            x.roas,
          'source',
            'live'
        )
      )
      from paged x
    ),
    '[]'::jsonb
  ),

  'summary',
  (
    select jsonb_build_object(
      'campaigns',
        s.campaign_count,
      'clicks',
        s.clicks,
      'leads',
        s.leads,
      'qualified',
        s.qualified,
      'enrolled',
        s.enrolled,
      'revenue_inr',
        s.revenue_inr,
      'revenue_usd',
        s.revenue_usd,
      'spend_by_currency',
        coalesce(
          (
            select jsonb_object_agg(
              ss.spend_currency,
              ss.amount
            )
            from spend_summary ss
          ),
          '{}'::jsonb
        )
    )
    from summary s
  ),

  'platforms',
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'platform',
            pc.platform,
          'count',
            pc.campaign_count
        )
        order by pc.platform
      )
      from platform_counts pc
    ),
    '[]'::jsonb
  ),

  'pagination',
  (
    select jsonb_build_object(
      'page',
        pg.page,
      'page_size',
        pg.page_size,
      'total',
        pg.total,
      'total_pages',
        pg.total_pages,
      'from',
        pg.from_row,
      'to',
        pg.to_row
    )
    from pagination pg
  )
)
  );

end;
$function$;



revoke all
on function public.get_campaigns_workspace(
  uuid,
  text,
  text,
  text,
  text,
  integer,
  integer
)
from public, anon, authenticated, service_role;


grant execute
on function public.get_campaigns_workspace(
  uuid,
  text,
  text,
  text,
  text,
  integer,
  integer
)
to authenticated, service_role;


comment on function public.get_campaigns_workspace(
  uuid,
  text,
  text,
  text,
  text,
  integer,
  integer
) is
  'Returns Campaigns workspace data for one authorized organization. SECURITY INVOKER; underlying RLS remains enforced.';


commit;
