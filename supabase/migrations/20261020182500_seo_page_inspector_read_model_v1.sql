-- SEO Page Inspector v1
-- Reusable, evidence-traceable read contract for a single SEO page.
-- Reuses existing SEO intelligence, experiment, optimization, and audit sources.
-- No scoring or workflow state is reimplemented here.

create or replace function public.get_seo_page_inspector_v1(
  p_organization_id uuid,
  p_page_id uuid,
  p_source_layer text default null,
  p_recommended_action text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_page public.seo_pages%rowtype;
  v_range_start date;
  v_range_end date;
  v_performance jsonb;
  v_daily jsonb;
  v_queries jsonb;
  v_snapshot jsonb;
  v_recommendations jsonb;
  v_selected_recommendation jsonb;
  v_content jsonb;
  v_revenue jsonb;
  v_aeo jsonb;
  v_geo jsonb;
  v_experiments jsonb;
  v_measurements jsonb;
  v_changes jsonb;
  v_learning jsonb;
  v_actions jsonb;
  v_action_events jsonb;
  v_gsc_state text;
  v_crawl_state text;
begin
  if p_organization_id is null or p_page_id is null then
    raise exception 'Organization and page are required';
  end if;

  -- Direct SQL maintenance sessions run as postgres. Application callers must
  -- be service_role or an authenticated member of the requested organization.
  if session_user <> 'postgres'
     and coalesce(auth.role(), '') <> 'service_role'
     and not public.is_organization_member(p_organization_id) then
    raise exception 'Not authorized for organization';
  end if;

  select *
  into v_page
  from public.seo_pages
  where id = p_page_id
    and organization_id = p_organization_id;

  if not found then
    raise exception 'SEO page is not available in this organization';
  end if;

  -- Canonical reporting window: latest finalized GSC date for this organization.
  -- This avoids CURRENT_DATE drift when Search Console finalization lags calendar time.
  select max(d.date)
  into v_range_end
  from public.gsc_daily d
  where d.organization_id = p_organization_id;

  if v_range_end is not null then
    v_range_start := v_range_end - 29;
  end if;

  if v_range_end is null then
    v_gsc_state := 'unavailable';
    v_performance := jsonb_build_object(
      'availability', 'unavailable',
      'clicks', null,
      'impressions', null,
      'ctr', null,
      'avg_position', null,
      'source_updated_at', null
    );
    v_daily := '[]'::jsonb;
    v_queries := '[]'::jsonb;
  else
    select jsonb_build_object(
      'availability', case when count(*) = 0 then 'no_observations' else 'available' end,
      'clicks', case when count(*) = 0 then null else sum(g.clicks) end,
      'impressions', case when count(*) = 0 then null else sum(g.impressions) end,
      'ctr', case
        when count(*) = 0 or coalesce(sum(g.impressions), 0) = 0 then null
        else round(sum(g.clicks)::numeric / sum(g.impressions)::numeric, 8)
      end,
      'avg_position', case
        when count(*) = 0 or coalesce(sum(g.impressions), 0) = 0 then null
        else round(sum(g.avg_position * g.impressions::numeric) / sum(g.impressions)::numeric, 2)
      end,
      'source_updated_at', max(g.updated_at)
    )
    into v_performance
    from public.gsc_page_daily g
    where g.organization_id = p_organization_id
      and g.date between v_range_start and v_range_end
      and lower(regexp_replace(regexp_replace(btrim(g.page), '[?#].*$', '', 'g'), '/+$', '', 'g')) =
          lower(regexp_replace(v_page.normalized_url, '/+$', '', 'g'));

    v_gsc_state := coalesce(v_performance->>'availability', 'unavailable');

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'date', x.date,
          'clicks', x.clicks,
          'impressions', x.impressions,
          'ctr', x.ctr,
          'avg_position', x.avg_position
        ) order by x.date
      ),
      '[]'::jsonb
    )
    into v_daily
    from (
      select
        g.date,
        sum(g.clicks) as clicks,
        sum(g.impressions) as impressions,
        case when sum(g.impressions) > 0
          then round(sum(g.clicks)::numeric / sum(g.impressions)::numeric, 8)
          else null
        end as ctr,
        case when sum(g.impressions) > 0
          then round(sum(g.avg_position * g.impressions::numeric) / sum(g.impressions)::numeric, 2)
          else null
        end as avg_position
      from public.gsc_page_daily g
      where g.organization_id = p_organization_id
        and g.date between v_range_start and v_range_end
        and lower(regexp_replace(regexp_replace(btrim(g.page), '[?#].*$', '', 'g'), '/+$', '', 'g')) =
            lower(regexp_replace(v_page.normalized_url, '/+$', '', 'g'))
      group by g.date
    ) x;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'query', q.query,
          'clicks', q.clicks,
          'impressions', q.impressions,
          'ctr', q.ctr,
          'avg_position', q.avg_position,
          'active_days', q.active_days
        ) order by q.impressions desc, q.clicks desc, q.query
      ),
      '[]'::jsonb
    )
    into v_queries
    from (
      select
        g.query,
        sum(g.clicks) as clicks,
        sum(g.impressions) as impressions,
        case when sum(g.impressions) > 0
          then round(sum(g.clicks)::numeric / sum(g.impressions)::numeric, 8)
          else null
        end as ctr,
        case when sum(g.impressions) > 0
          then round(sum(g.avg_position * g.impressions::numeric) / sum(g.impressions)::numeric, 2)
          else null
        end as avg_position,
        count(distinct g.date) as active_days
      from public.gsc_page_query_daily g
      where g.organization_id = p_organization_id
        and g.date between v_range_start and v_range_end
        and lower(regexp_replace(regexp_replace(btrim(g.page), '[?#].*$', '', 'g'), '/+$', '', 'g')) =
            lower(regexp_replace(v_page.normalized_url, '/+$', '', 'g'))
      group by g.query
      order by sum(g.impressions) desc, sum(g.clicks) desc
      limit 100
    ) q;
  end if;

  select jsonb_build_object(
    'availability', 'available',
    'snapshot_id', s.id,
    'fetched_url', s.fetched_url,
    'final_url', s.final_url,
    'fetched_at', s.fetched_at,
    'http_status', s.http_status,
    'response_time_ms', s.response_time_ms,
    'content_type', s.content_type,
    'language', s.language,
    'title', s.title,
    'meta_description', s.meta_description,
    'canonical_url', s.canonical_url,
    'robots_meta', s.robots_meta,
    'x_robots_tag', s.x_robots_tag,
    'is_indexable', s.is_indexable,
    'indexability_reason', s.indexability_reason,
    'h1s', coalesce(to_jsonb(s.h1s), '[]'::jsonb),
    'h2s', coalesce(to_jsonb(s.h2s), '[]'::jsonb),
    'h3s', coalesce(to_jsonb(s.h3s), '[]'::jsonb),
    'word_count', s.word_count,
    'schema_types', coalesce(to_jsonb(s.schema_types), '[]'::jsonb),
    'structured_data', coalesce(s.structured_data, '{}'::jsonb),
    'hreflang', coalesce(s.hreflang, '{}'::jsonb),
    'open_graph', coalesce(s.open_graph, '{}'::jsonb),
    'technical_flags', coalesce(s.technical_flags, '{}'::jsonb)
  )
  into v_snapshot
  from public.seo_page_snapshots s
  where s.organization_id = p_organization_id
    and s.page_id = p_page_id
  order by s.fetched_at desc
  limit 1;

  if v_snapshot is null then
    v_crawl_state := 'unavailable';
    v_snapshot := jsonb_build_object(
      'availability', 'unavailable',
      'snapshot_id', null,
      'fetched_at', null
    );
  else
    v_crawl_state := 'available';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'reference_key', concat_ws(':', c.source_layer, c.page_id::text, c.recommended_action),
        'source_layer', c.source_layer,
        'target_kind', c.target_kind,
        'recommended_action', c.recommended_action,
        'priority_score', c.priority_score,
        'recommendation', c.recommendation,
        'evidence', coalesce(c.evidence, '{}'::jsonb)
      ) order by c.priority_score desc, c.source_layer, c.recommended_action
    ),
    '[]'::jsonb
  )
  into v_recommendations
  from public.v_seo_experiment_candidates_v1 c
  where c.organization_id = p_organization_id
    and c.page_id = p_page_id;

  select jsonb_build_object(
    'reference_key', concat_ws(':', c.source_layer, c.page_id::text, c.recommended_action),
    'source_layer', c.source_layer,
    'target_kind', c.target_kind,
    'recommended_action', c.recommended_action,
    'priority_score', c.priority_score,
    'recommendation', c.recommendation,
    'evidence', coalesce(c.evidence, '{}'::jsonb)
  )
  into v_selected_recommendation
  from public.v_seo_experiment_candidates_v1 c
  where c.organization_id = p_organization_id
    and c.page_id = p_page_id
    and (p_source_layer is null or c.source_layer = p_source_layer)
    and (p_recommended_action is null or c.recommended_action = p_recommended_action)
  order by c.priority_score desc, c.source_layer, c.recommended_action
  limit 1;

  select to_jsonb(c) - 'organization_id'
  into v_content
  from public.v_seo_content_page_intelligence_v1 c
  where c.organization_id = p_organization_id
    and c.page_id = p_page_id
  limit 1;

  select to_jsonb(r) - 'organization_id'
  into v_revenue
  from public.v_seo_organic_value_page_30d r
  where r.organization_id = p_organization_id
    and r.page_id = p_page_id
  limit 1;

  select to_jsonb(a) - 'organization_id'
  into v_aeo
  from public.v_seo_aeo_page_readiness_v1 a
  where a.organization_id = p_organization_id
    and a.page_id = p_page_id
  limit 1;

  select to_jsonb(g) - 'organization_id'
  into v_geo
  from public.v_seo_geo_page_intelligence_v1 g
  where g.organization_id = p_organization_id
    and g.page_id = p_page_id
  limit 1;

  select coalesce(jsonb_agg(to_jsonb(e) - 'organization_id' order by e.created_at desc), '[]'::jsonb)
  into v_experiments
  from public.seo_experiments e
  where e.organization_id = p_organization_id
    and e.target_page_id = p_page_id;

  select coalesce(jsonb_agg(to_jsonb(m) - 'organization_id' order by m.captured_at desc), '[]'::jsonb)
  into v_measurements
  from public.seo_experiment_measurements m
  join public.seo_experiments e
    on e.id = m.experiment_id
   and e.organization_id = m.organization_id
  where m.organization_id = p_organization_id
    and e.target_page_id = p_page_id;

  select coalesce(jsonb_agg(to_jsonb(ch) - 'organization_id' order by ch.created_at desc), '[]'::jsonb)
  into v_changes
  from public.seo_experiment_changes ch
  join public.seo_experiments e
    on e.id = ch.experiment_id
   and e.organization_id = ch.organization_id
  where ch.organization_id = p_organization_id
    and e.target_page_id = p_page_id;

  select coalesce(jsonb_agg(to_jsonb(l) - 'organization_id' order by l.evaluated_at desc), '[]'::jsonb)
  into v_learning
  from public.seo_experiment_learning_events l
  join public.seo_experiments e
    on e.id = l.experiment_id
   and e.organization_id = l.organization_id
  where l.organization_id = p_organization_id
    and e.target_page_id = p_page_id;

  select coalesce(jsonb_agg(to_jsonb(a) - 'organization_id' order by a.created_at desc), '[]'::jsonb)
  into v_actions
  from public.seo_optimization_actions a
  where a.organization_id = p_organization_id
    and a.target_page_id = p_page_id;

  select coalesce(jsonb_agg(to_jsonb(ev) - 'organization_id' order by ev.created_at desc), '[]'::jsonb)
  into v_action_events
  from public.seo_optimization_action_events ev
  join public.seo_optimization_actions a
    on a.id = ev.action_id
   and a.organization_id = ev.organization_id
  where ev.organization_id = p_organization_id
    and a.target_page_id = p_page_id;

  return jsonb_build_object(
    'schema_version', 'seo_page_inspector_v1',
    'generated_at', now(),
    'page', jsonb_build_object(
      'page_id', v_page.id,
      'site_id', v_page.site_id,
      'canonical_url', v_page.canonical_url,
      'normalized_url', v_page.normalized_url,
      'display_url', v_page.url_path,
      'page_type', v_page.page_type,
      'lifecycle_status', v_page.lifecycle_status,
      'first_seen_at', v_page.first_seen_at,
      'last_seen_at', v_page.last_seen_at,
      'last_crawled_at', v_page.last_crawled_at,
      'page_title', coalesce(v_snapshot->>'title', v_page.url_path)
    ),
    'reporting', jsonb_build_object(
      'start_date', v_range_start,
      'end_date', v_range_end,
      'timezone', 'Asia/Kolkata',
      'reporting_source', 'Google Search Console',
      'data_status', v_gsc_state,
      'source_updated_at', v_performance->'source_updated_at',
      'window_rule', 'latest_finalized_gsc_date_30d'
    ),
    'performance', v_performance,
    'daily_trend', coalesce(v_daily, '[]'::jsonb),
    'query_evidence', coalesce(v_queries, '[]'::jsonb),
    'crawl', v_snapshot,
    'recommendations', coalesce(v_recommendations, '[]'::jsonb),
    'selected_recommendation', v_selected_recommendation,
    'evidence_quality', jsonb_build_object(
      'search_evidence', v_gsc_state,
      'crawl_evidence', v_crawl_state,
      'recommendation_evidence', case
        when jsonb_array_length(coalesce(v_recommendations, '[]'::jsonb)) > 0 then 'available'
        else 'unavailable'
      end,
      'confidence_state', case
        when v_gsc_state = 'available' and v_crawl_state = 'available' then 'evidence_available'
        else 'evidence_incomplete'
      end,
      'note', 'Priority and evidence completeness are separate. No numerical confidence is invented by this read model.'
    ),
    'intelligence', jsonb_build_object(
      'content', v_content,
      'revenue', v_revenue,
      'aeo', v_aeo,
      'geo', v_geo
    ),
    'workflow', jsonb_build_object(
      'experiments', coalesce(v_experiments, '[]'::jsonb),
      'measurements', coalesce(v_measurements, '[]'::jsonb),
      'changes', coalesce(v_changes, '[]'::jsonb),
      'learning_events', coalesce(v_learning, '[]'::jsonb),
      'optimization_actions', coalesce(v_actions, '[]'::jsonb),
      'optimization_events', coalesce(v_action_events, '[]'::jsonb)
    )
  );
end;
$function$;

revoke all on function public.get_seo_page_inspector_v1(uuid, uuid, text, text) from public, anon;
grant execute on function public.get_seo_page_inspector_v1(uuid, uuid, text, text) to authenticated, service_role;

comment on function public.get_seo_page_inspector_v1(uuid, uuid, text, text) is
  'Reusable SEO Page Inspector read contract. Uses latest finalized GSC window, verified crawl evidence, existing SEO intelligence, and existing experiment/optimization sources without introducing a second scoring or workflow engine.';
