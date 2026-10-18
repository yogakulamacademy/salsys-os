-- R8 Content + SEO Intelligence: canonical health and completeness surface.
-- This view intentionally excludes AEO/GEO readiness so R8 can be assessed
-- independently from the R9 AI visibility roadmap.

create or replace view public.v_seo_r8_health_v1
with (security_invoker = true)
as
with tenant_set as (
  select organization_id from public.gsc_daily
  union
  select organization_id from public.seo_pages
  union
  select organization_id from public.seo_crawl_runs
  union
  select organization_id from public.seo_experiments
  union
  select organization_id from public.seo_optimization_actions
),
page_stats as (
  select
    p.organization_id,
    count(*)::integer as page_inventory_count,
    count(*) filter (where p.snapshot_id is not null)::integer as crawled_page_count,
    count(*) filter (where p.is_indexable is true)::integer as indexable_page_count
  from public.v_seo_page_inventory p
  group by p.organization_id
),
semantic_stats as (
  select
    s.organization_id,
    count(*)::integer as semantic_page_count,
    count(*) filter (where s.topic_count > 0)::integer as pages_with_topics,
    count(*) filter (where s.entity_count > 0)::integer as pages_with_entities,
    count(*) filter (where s.topic_count > 0 and s.entity_count > 0)::integer as pages_with_semantic_coverage
  from public.v_seo_semantic_page_coverage s
  group by s.organization_id
),
business_stats as (
  select
    b.organization_id,
    count(*) filter (where b.business_value_signal <> 'no_observed_value')::integer as pages_with_business_signal,
    count(*) filter (
      where b.business_value_signal in ('revenue_proven', 'enrollment_proven')
    )::integer as pages_with_revenue_or_enrollment_signal
  from public.v_seo_organic_value_page_30d b
  group by b.organization_id
),
action_candidates as (
  select
    c.organization_id,
    count(*) filter (
      where c.recommended_action not in ('monitor', 'crawl_page')
    )::integer as deterministic_action_candidates
  from public.v_seo_content_page_intelligence_v1 c
  group by c.organization_id
),
open_actions as (
  select
    a.organization_id,
    count(*) filter (
      where a.execution_status in ('ready', 'queued', 'running')
         or a.approval_status = 'pending'
    )::integer as open_optimization_actions
  from public.seo_optimization_actions a
  group by a.organization_id
),
experiment_stats as (
  select
    e.organization_id,
    count(*) filter (where e.status = 'running')::integer as active_experiments,
    count(*) filter (where e.status = 'completed')::integer as completed_experiments
  from public.seo_experiments e
  group by e.organization_id
),
crawl_frontier_stats as (
  select
    f.organization_id,
    count(*) filter (where f.status = 'queued')::integer as crawl_queue_count,
    count(*) filter (where f.status = 'done')::integer as crawl_done_count,
    count(*) filter (where f.status = 'skipped')::integer as crawl_skipped_count
  from public.seo_crawl_frontier f
  group by f.organization_id
),
base as (
  select
    t.organization_id,
    g.latest_gsc_date,
    g.last_successful_sync as last_successful_gsc_sync,
    case
      when g.latest_gsc_date is null then null
      else current_date - g.latest_gsc_date
    end as gsc_freshness_days,
    coalesce(p.page_inventory_count, 0) as page_inventory_count,
    coalesce(p.crawled_page_count, 0) as crawled_page_count,
    coalesce(p.indexable_page_count, 0) as indexable_page_count,
    case
      when coalesce(p.page_inventory_count, 0) > 0
        then round(100.0 * p.crawled_page_count / p.page_inventory_count, 1)
      else 0::numeric
    end as crawl_coverage_pct,
    coalesce(sf.crawl_queue_count, 0) as crawl_queue_count,
    coalesce(sf.crawl_done_count, 0) as crawl_done_count,
    coalesce(sf.crawl_skipped_count, 0) as crawl_skipped_count,
    coalesce(s.pages_with_topics, 0) as pages_with_topics,
    coalesce(s.pages_with_entities, 0) as pages_with_entities,
    coalesce(s.pages_with_semantic_coverage, 0) as pages_with_semantic_coverage,
    case
      when coalesce(s.semantic_page_count, 0) > 0
        then round(100.0 * s.pages_with_semantic_coverage / s.semantic_page_count, 1)
      else 0::numeric
    end as semantic_coverage_pct,
    coalesce(b.pages_with_business_signal, 0) as pages_with_business_signal,
    coalesce(b.pages_with_revenue_or_enrollment_signal, 0) as pages_with_revenue_or_enrollment_signal,
    coalesce(c.deterministic_action_candidates, 0) as deterministic_action_candidates,
    coalesce(a.open_optimization_actions, 0) as open_optimization_actions,
    coalesce(e.active_experiments, 0) as active_experiments,
    coalesce(e.completed_experiments, 0) as completed_experiments,
    coalesce(l.learning_events, 0) as learning_events,
    coalesce(l.outcomes_due, 0) as outcomes_due,
    coalesce(l.enabled, false) as learning_enabled,
    l.last_learning_at
  from tenant_set t
  left join public.v_gsc_sync_health g on g.organization_id = t.organization_id
  left join page_stats p on p.organization_id = t.organization_id
  left join semantic_stats s on s.organization_id = t.organization_id
  left join business_stats b on b.organization_id = t.organization_id
  left join action_candidates c on c.organization_id = t.organization_id
  left join open_actions a on a.organization_id = t.organization_id
  left join experiment_stats e on e.organization_id = t.organization_id
  left join crawl_frontier_stats sf on sf.organization_id = t.organization_id
  left join public.v_seo_learning_health_v1 l on l.organization_id = t.organization_id
)
select
  b.*,
  case
    when b.latest_gsc_date is null then 'missing'
    when b.gsc_freshness_days <= 3 then 'fresh'
    when b.gsc_freshness_days <= 7 then 'aging'
    else 'stale'
  end as gsc_status,
  case
    when b.page_inventory_count = 0 then 'missing'
    when b.crawled_page_count = 0 then 'not_started'
    when b.crawl_coverage_pct >= 80 then 'strong'
    when b.crawl_coverage_pct >= 50 then 'developing'
    else 'partial'
  end as crawl_status,
  case
    when b.crawled_page_count = 0 then 'not_available'
    when b.semantic_coverage_pct >= 70 then 'strong'
    when b.semantic_coverage_pct >= 50 then 'developing'
    else 'partial'
  end as semantic_status,
  case
    when not b.learning_enabled then 'disabled'
    when b.active_experiments > 0 and b.outcomes_due > 0 then 'outcomes_due'
    when b.active_experiments > 0 then 'observing'
    when b.completed_experiments > 0 or b.learning_events > 0 then 'learning'
    else 'ready_no_samples'
  end as learning_status,
  case
    when b.latest_gsc_date is null
      or b.page_inventory_count = 0
      or b.crawled_page_count = 0
      then 'incomplete'
    when b.gsc_freshness_days > 7
      or b.crawl_coverage_pct < 50
      or b.semantic_coverage_pct < 50
      or not b.learning_enabled
      then 'degraded'
    else 'ready'
  end as r8_data_readiness_band,
  case
    when b.latest_gsc_date is null then 'Search Console evidence is missing.'
    when b.page_inventory_count = 0 then 'No SEO page inventory is available.'
    when b.crawled_page_count = 0 then 'Page inventory exists but no crawl evidence is available.'
    when b.gsc_freshness_days > 7 then 'Search Console evidence is stale; refresh ingestion before relying on current SEO decisions.'
    when b.crawl_coverage_pct < 50 then 'Core R8 services are available, but current crawl coverage is partial; continue the crawl queue before treating site-wide content evidence as complete.'
    when b.semantic_coverage_pct < 50 then 'Crawl evidence exists, but topic/entity coverage is still partial.'
    when not b.learning_enabled then 'SEO experiment learning is disabled for this tenant.'
    else 'Core R8 evidence pipelines are operational. Continue monitoring freshness, crawl coverage, deterministic actions and measured experiments.'
  end as readiness_reason,
  now() as checked_at
from base b;

comment on view public.v_seo_r8_health_v1 is
  'Tenant-safe R8 Content + SEO Intelligence health surface. Measures evidence freshness, crawl/semantic coverage, deterministic actions, business-signal association and experiment learning. Revenue and enrollment associations are observational, not causal. AEO/GEO are intentionally excluded for R9.';
