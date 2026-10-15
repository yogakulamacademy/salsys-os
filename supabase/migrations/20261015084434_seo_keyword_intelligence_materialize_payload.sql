create or replace view public.v_seo_keyword_intelligence_30d
with (security_invoker = true)
as
with bounds as (
  select organization_id,
         max(date) as end_date,
         max(date) - 29 as start_date
  from public.gsc_page_query_daily
  group by organization_id
),
filtered as materialized (
  select d.*
  from public.gsc_page_query_daily d
  join bounds b
    on b.organization_id = d.organization_id
  where d.date >= b.start_date
    and d.date <= b.end_date
),
page_rollup as materialized (
  select
    organization_id,
    site_url,
    query,
    page,
    sum(clicks)::bigint as clicks,
    sum(impressions)::bigint as impressions,
    case
      when sum(impressions) > 0 then
        round(sum(avg_position * impressions::numeric) / sum(impressions)::numeric, 2)
      else 0::numeric
    end as avg_position,
    count(distinct date)::integer as active_days,
    case
      when page ~* '^https?://[^/]+/?$' then 'homepage'
      when page ~* '/blogs?/' then 'blog'
      when page ~* '/courses?/' then 'course'
      else 'other'
    end as page_surface
  from filtered
  group by organization_id, site_url, query, page
),
query_rollup as materialized (
  select
    organization_id,
    site_url,
    query,
    sum(clicks)::bigint as clicks,
    sum(impressions)::bigint as impressions,
    case
      when sum(impressions) > 0 then
        round(sum(avg_position * impressions::numeric) / sum(impressions)::numeric, 2)
      else 0::numeric
    end as avg_position,
    count(distinct page)::integer as page_count,
    count(distinct date)::integer as active_days
  from filtered
  group by organization_id, site_url, query
),
ranked_pages as materialized (
  select
    p.*,
    row_number() over (
      partition by organization_id, site_url, query
      order by impressions desc, clicks desc, avg_position asc, page asc
    ) as page_rank
  from page_rollup p
),
top_pages as materialized (
  select
    organization_id,
    site_url,
    query,
    max(page) filter (where page_rank = 1) as leader_page,
    max(page_surface) filter (where page_rank = 1) as leader_surface,
    max(impressions) filter (where page_rank = 1) as leader_impressions,
    max(clicks) filter (where page_rank = 1) as leader_clicks,
    max(avg_position) filter (where page_rank = 1) as leader_avg_position,
    max(active_days) filter (where page_rank = 1) as leader_active_days,
    max(page) filter (where page_rank = 2) as runner_up_page,
    max(page_surface) filter (where page_rank = 2) as runner_up_surface,
    max(impressions) filter (where page_rank = 2) as runner_up_impressions,
    max(clicks) filter (where page_rank = 2) as runner_up_clicks,
    max(avg_position) filter (where page_rank = 2) as runner_up_avg_position,
    max(active_days) filter (where page_rank = 2) as runner_up_active_days,
    count(distinct page_surface)::integer as surface_count
  from ranked_pages
  group by organization_id, site_url, query
),
page_payload as materialized (
  select
    organization_id,
    site_url,
    query,
    jsonb_agg(
      jsonb_build_object(
        'page', page,
        'surface', page_surface,
        'clicks', clicks,
        'impressions', impressions,
        'avg_position', avg_position,
        'active_days', active_days
      )
      order by impressions desc, clicks desc, avg_position asc, page asc
    ) as pages
  from page_rollup
  group by organization_id, site_url, query
),
base as (
  select
    q.organization_id,
    q.site_url,
    q.query,
    q.clicks,
    q.impressions,
    case when q.impressions > 0 then round(q.clicks::numeric / q.impressions::numeric, 8) else 0::numeric end as ctr,
    q.avg_position,
    q.page_count,
    q.active_days,
    t.leader_page,
    t.leader_surface,
    t.leader_impressions,
    t.leader_clicks,
    t.leader_avg_position,
    t.leader_active_days,
    t.runner_up_page,
    t.runner_up_surface,
    t.runner_up_impressions,
    t.runner_up_clicks,
    t.runner_up_avg_position,
    t.runner_up_active_days,
    t.surface_count,
    p.pages,
    regexp_replace(lower(q.query), '[^a-z0-9]+', '', 'g') as query_key,
    regexp_replace(
      split_part(
        split_part(regexp_replace(lower(q.site_url), '^https?://(www\\\\.)?', ''), '/', 1),
        '.', 1
      ),
      '[^a-z0-9]+', '', 'g'
    ) as brand_key
  from query_rollup q
  join top_pages t using (organization_id, site_url, query)
  join page_payload p using (organization_id, site_url, query)
  where q.page_count > 1
),
classified as (
  select
    b.*,
    public.seo_is_probable_brand_query(b.query_key, b.brand_key) as branded,
    coalesce(b.leader_surface,'') <> coalesce(b.runner_up_surface,'') as mixed_surface,
    case
      when public.seo_is_probable_brand_query(b.query_key, b.brand_key) then 'branded_coverage'
      when b.impressions >= 50
       and coalesce(b.runner_up_impressions,0) >= 15
       and (coalesce(b.runner_up_impressions,0)::numeric / nullif(b.leader_impressions,0)::numeric) >= 0.45
       and (
         abs(coalesce(b.leader_avg_position,0) - coalesce(b.runner_up_avg_position,0)) <= 8
         or coalesce(b.leader_surface,'') <> coalesce(b.runner_up_surface,'')
       ) then 'likely_cannibalization'
      when b.impressions >= 20
       and coalesce(b.runner_up_impressions,0)::numeric >= greatest(5::numeric, coalesce(b.leader_impressions,0)::numeric * 0.20)
       then 'needs_review'
      when (coalesce(b.leader_impressions,0)::numeric / nullif(b.impressions,0)::numeric) >= 0.75 then 'healthy_leader'
      else 'observed_overlap'
    end as signal_type
  from base b
)
select
  organization_id,
  site_url,
  query,
  clicks,
  impressions,
  ctr,
  avg_position,
  page_count,
  active_days,
  branded,
  mixed_surface,
  signal_type,
  leader_page,
  leader_surface,
  leader_impressions,
  leader_clicks,
  leader_avg_position,
  leader_active_days,
  case when impressions > 0 then round(leader_impressions::numeric / impressions::numeric, 4) else 0::numeric end as leader_share,
  runner_up_page,
  runner_up_surface,
  runner_up_impressions,
  runner_up_clicks,
  runner_up_avg_position,
  runner_up_active_days,
  case when impressions > 0 then round(coalesce(runner_up_impressions,0)::numeric / impressions::numeric, 4) else 0::numeric end as runner_up_share,
  surface_count,
  pages,
  case signal_type
    when 'branded_coverage' then 'Brand query surfaces multiple URLs. Treat this as navigational coverage unless an irrelevant page becomes the dominant result.'
    when 'likely_cannibalization' then case when mixed_surface
      then 'Visibility is materially split across different content types. Choose a primary intent page, differentiate or consolidate overlapping content, and strengthen internal links toward the preferred page.'
      else 'Visibility is materially split across multiple pages. Choose a primary target page, reduce overlapping targeting, and reinforce the preferred page with internal links and clearer on-page signals.' end
    when 'needs_review' then 'Multiple pages share meaningful visibility for this query. Review search intent, titles, headings, internal links and whether each page has a distinct purpose before consolidating anything.'
    when 'healthy_leader' then 'Multiple pages appear, but one URL clearly leads. Reinforce the leader and monitor the secondary URLs rather than consolidating immediately.'
    else 'Multiple pages appear for this query, but the evidence is not strong enough to call cannibalization. Monitor the split and only act if the overlap persists or grows.'
  end as recommendation
from classified;

revoke all on table public.v_seo_keyword_intelligence_30d from public, anon;
grant select on table public.v_seo_keyword_intelligence_30d to authenticated, service_role;
