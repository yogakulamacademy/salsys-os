-- Marketing › Google search › "Searches and pages", "Content ideas" and
-- "Site health and AI answers" (owner-approved prototype "Google search inner
-- pages", 26 Nov 2026). Read-only, service role only.
create or replace function public.marketing_search_detail_v1(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_token text;
  v_run record;
  v_out jsonb;
begin
  select nullif(regexp_replace(lower(coalesce(o.name, '')), '[^a-z0-9]', '', 'g'), '') into v_token
  from public.organizations o where o.id = p_organization_id;
  -- "Yogakulam Academy" -> also match "yogakulam" on its own.
  v_token := coalesce(regexp_replace(v_token, '(academy|institute|school|ltd|pvtltd|private|limited|opc)+$', ''), v_token);

  select r.id, r.site_id, r.started_at, r.completed_at, r.status, r.pages_fetched, r.pages_discovered, s.hostname
  into v_run
  from public.seo_crawl_runs r left join public.organization_sites s on s.id = r.site_id
  where r.organization_id = p_organization_id and r.status in ('completed', 'partial')
    and exists (select 1 from public.seo_page_snapshots ps where ps.crawl_run_id = r.id)
  order by r.started_at desc limit 1;

  with
  q as (
    select lower(query) as query, sum(clicks) as clicks, sum(impressions) as views,
           sum(avg_position * impressions) as wpos,
           coalesce(length(v_token) >= 4 and regexp_replace(lower(query), '[^a-z0-9]', '', 'g') like '%' || v_token || '%', false) as brand,
           sum(impressions) filter (where avg_position <= 10) as page1
    from public.gsc_query_daily
    where organization_id = p_organization_id and date >= current_date - 30
    group by 1
  ),
  pq as (
    select regexp_replace(split_part(regexp_replace(page, '^https?://[^/]+', ''), '?', 1), '(.)/$', '\1') as path,
           lower(query) as query, sum(clicks) as clicks, sum(impressions) as views,
           round((sum(avg_position * impressions) / nullif(sum(impressions), 0))::numeric, 1) as position
    from public.gsc_page_query_daily
    where organization_id = p_organization_id and date >= current_date - 30
      and not (length(coalesce(v_token, '')) >= 4 and regexp_replace(lower(query), '[^a-z0-9]', '', 'g') like '%' || v_token || '%')
    group by 1, 2
  ),
  snaps as (
    select distinct on (ps.page_id)
           regexp_replace(split_part(regexp_replace(coalesce(ps.final_url, ps.fetched_url), '^https?://[^/]+', ''), '?', 1), '(.)/$', '\1') as path,
           ps.http_status, ps.response_time_ms, ps.title, ps.meta_description, cardinality(coalesce(ps.h1s, '{}'::text[])) as h1,
           ps.word_count, ps.is_indexable, ps.indexability_reason
    from public.seo_page_snapshots ps
    where ps.organization_id = p_organization_id and ps.crawl_run_id = v_run.id
    order by ps.page_id, ps.fetched_at desc
  )
  select jsonb_build_object(
    'brandToken', v_token,
    'views', (select coalesce(sum(impressions), 0) from public.gsc_daily where organization_id = p_organization_id and date >= current_date - 30),
    'clicks', (select coalesce(sum(clicks), 0) from public.gsc_daily where organization_id = p_organization_id and date >= current_date - 30),
    'viewsBefore', (select coalesce(sum(impressions), 0) from public.gsc_daily where organization_id = p_organization_id and date between current_date - 60 and current_date - 31),
    'clicksBefore', (select coalesce(sum(clicks), 0) from public.gsc_daily where organization_id = p_organization_id and date between current_date - 60 and current_date - 31),
    'queryClicks', (select coalesce(sum(clicks), 0) from q),
    'brandClicks', (select coalesce(sum(clicks), 0) from q where brand),
    'nonBrandViews', (select coalesce(sum(views), 0) from q where not brand),
    'nonBrandPage1Views', (select coalesce(sum(page1), 0) from q where not brand),
    'dataTo', (select max(date) from public.gsc_daily where organization_id = p_organization_id),
    'pageQueries', coalesce((select jsonb_agg(jsonb_build_object('path', path, 'query', query, 'views', views, 'clicks', clicks, 'position', position)) from (
        select * from pq order by views desc limit 800) x), '[]'::jsonb),
    'courses', coalesce((select jsonb_agg(jsonb_build_object('name', c.name,
        'next', (select min(b.start_date) from public.course_batches b where b.course_id = c.id and b.organization_id = p_organization_id and b.active and b.start_date >= current_date)))
        from public.courses c where c.organization_id = p_organization_id and c.active), '[]'::jsonb),
    'places', coalesce((select jsonb_agg(distinct b.location) from public.course_batches b
        where b.organization_id = p_organization_id and b.active and b.start_date >= current_date and b.location is not null), '[]'::jsonb),
    'crawl', case when v_run.id is null then null else jsonb_build_object(
        'at', coalesce(v_run.completed_at, v_run.started_at), 'fetched', v_run.pages_fetched, 'discovered', v_run.pages_discovered, 'host', v_run.hostname,
        'known', (select count(*) from public.seo_pages sp where sp.organization_id = p_organization_id),
        'pages', coalesce((select jsonb_agg(jsonb_build_object('path', path, 'status', http_status, 'ms', response_time_ms, 'title', left(title, 200),
            'titleLength', coalesce(length(title), 0), 'descLength', coalesce(length(meta_description), 0),
            'descShared', (select count(*) from snaps s2 where s2.meta_description is not null and s2.meta_description = s.meta_description) - 1,
            'h1', h1, 'words', word_count, 'indexable', is_indexable, 'reason', indexability_reason)) from snaps s), '[]'::jsonb)) end,
    'sites', coalesce((select jsonb_agg(jsonb_build_object('host', hostname, 'active', status = 'active')) from public.organization_sites where organization_id = p_organization_id), '[]'::jsonb),
    'webHost', (select lower(regexp_replace(context ->> 'origin', '^https?://', '')) from public.raw_events
        where organization_id = p_organization_id and source_system = 'website' and occurred_at >= now() - interval '30 days' and context ->> 'origin' is not null
        group by 1 order by count(*) desc limit 1),
    'ai', coalesce((select jsonb_agg(jsonb_build_object('at', r.completed_at, 'question', r.prompt_text, 'provider', r.provider, 'host', s.hostname,
        'mentioned', o.brand_mentioned, 'recommended', o.brand_recommended,
        'others', coalesce((select jsonb_agg(x ->> 'name') from jsonb_array_elements(coalesce(o.evidence_payload -> 'recommendations', '[]'::jsonb)) x), '[]'::jsonb))
        order by r.completed_at desc)
        from public.seo_ai_visibility_probe_runs r
        left join public.organization_sites s on s.id = r.site_id
        left join lateral (select * from public.seo_ai_visibility_observations ob where ob.run_id = r.id order by ob.observed_at desc limit 1) o on true
        where r.organization_id = p_organization_id and r.status = 'completed'), '[]'::jsonb),
    'aiVisits', (select coalesce(sum(sessions), 0) from public.ga4_source_medium_daily
        where organization_id = p_organization_id and analytics_date >= current_date - 30
          and (lower(medium) = 'ai-assistant' or lower(source) ~ 'chatgpt|gemini|perplexity|claude\.ai|copilot')),
    'aiEnquiries', (select count(*) from public.leads l where l.organization_id = p_organization_id and l.created_at >= now() - interval '30 days'
        and lower(coalesce(l.first_touch_source, '')) ~ 'chatgpt|gemini|perplexity|claude\.ai|copilot'
        and not coalesce((l.metadata ->> 'test_lead')::boolean, false)),
    'googleEnquiries', (select count(*) from public.leads l where l.organization_id = p_organization_id and l.created_at >= now() - interval '30 days'
        and lower(coalesce(l.first_touch_source, '')) ~ '(^|\.)google\.|googlequicksearchbox|^google$'
        and not coalesce((l.metadata ->> 'test_lead')::boolean, false)),
    'generatedAt', now()
  ) into v_out;
  return v_out;
end;
$$;

revoke all on function public.marketing_search_detail_v1(uuid) from public, anon, authenticated;
grant execute on function public.marketing_search_detail_v1(uuid) to service_role;
