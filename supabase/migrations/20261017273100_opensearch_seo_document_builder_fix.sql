-- Fix PostgreSQL jsonb_build_object's 100-argument limit for rich SEO page docs.
-- Uses a typed row -> jsonb conversion while preserving the v1 document contract.

create or replace function public.build_search_document_v1(
  p_organization_id uuid,
  p_entity_type text,
  p_entity_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_doc jsonb;
begin
  if p_entity_type not in ('seo_page','seo_topic','seo_entity','seo_experiment','seo_action') then
    return public.build_search_document_core_v1(
      p_organization_id,
      p_entity_type,
      p_entity_id
    );
  end if;

  if p_entity_type='seo_page' then
    select jsonb_strip_nulls(to_jsonb(d)) into v_doc
    from (
      select
        p.organization_id,
        'seo_page'::text as entity_type,
        p.id as entity_id,
        p.site_id,
        p.normalized_url,
        p.canonical_url,
        p.url_path,
        p.page_type,
        p.lifecycle_status,
        c.title,
        c.meta_description,
        c.word_count,
        c.is_indexable,
        c.indexability_reason,
        c.schema_types,
        c.technical_issue_types,
        c.technical_issue_count,
        c.gsc_clicks,
        c.gsc_impressions,
        c.gsc_ctr,
        c.gsc_avg_position,
        c.semantic_coverage_score_v1 as semantic_coverage_score,
        c.semantic_topic_count,
        c.semantic_entity_count,
        c.internal_link_opportunities,
        c.opportunity_score_v1 as opportunity_score,
        c.opportunity_reasons,
        c.content_state,
        coalesce(r.recommended_action,c.recommended_action) as recommended_action,
        c.action_priority_score,
        c.action_reason,
        r.organic_leads,
        r.organic_qualified_leads,
        r.organic_enrolled_leads,
        r.organic_revenue_inr,
        r.organic_revenue_usd,
        r.business_value_signal,
        r.revenue_priority_score_v1 as revenue_priority_score,
        a.answer_readiness_score_v1 as answer_readiness_score,
        a.answer_state,
        a.answer_query_count,
        a.high_opportunity_query_count as high_opportunity_answer_queries,
        g.generative_readiness_score_v1 as generative_readiness_score,
        g.geo_state,
        g.ai_referral_sessions,
        g.ai_linked_leads,
        g.observed_ai_providers,
        p.first_seen_at,
        p.last_seen_at,
        p.last_crawled_at,
        p.created_at,
        greatest(
          p.updated_at,
          coalesce(c.fetched_at,p.updated_at),
          coalesce(g.fetched_at,p.updated_at)
        ) as updated_at
      from public.seo_pages p
      left join lateral (
        select * from public.v_seo_content_page_intelligence_v1 c0
        where c0.organization_id=p.organization_id and c0.page_id=p.id
        limit 1
      ) c on true
      left join lateral (
        select * from public.v_seo_organic_value_page_30d r0
        where r0.organization_id=p.organization_id and r0.page_id=p.id
        limit 1
      ) r on true
      left join lateral (
        select * from public.v_seo_aeo_page_readiness_v1 a0
        where a0.organization_id=p.organization_id and a0.page_id=p.id
        limit 1
      ) a on true
      left join lateral (
        select * from public.v_seo_geo_page_intelligence_v1 g0
        where g0.organization_id=p.organization_id and g0.page_id=p.id
        limit 1
      ) g on true
      where p.organization_id=p_organization_id and p.id=p_entity_id
    ) d;

  elsif p_entity_type='seo_topic' then
    select jsonb_strip_nulls(jsonb_build_object(
      'organization_id',t.organization_id,
      'entity_type','seo_topic',
      'entity_id',t.id,
      'site_id',t.site_id,
      'canonical_key',t.canonical_key,
      'topic_name',t.name,
      'topic_type',t.topic_type,
      'description',t.description,
      'status',t.status,
      'gap_type',g.gap_type,
      'query_count',g.query_count,
      'gsc_clicks',g.gsc_clicks,
      'gsc_impressions',g.gsc_impressions,
      'gsc_avg_position',g.gsc_avg_position,
      'mapped_pages',g.mapped_pages,
      'indexable_pages',g.indexable_pages,
      'priority_score',g.priority_score_v1,
      'recommendation',g.recommendation,
      'created_at',t.created_at,
      'updated_at',t.updated_at
    )) into v_doc
    from public.seo_semantic_topics t
    left join lateral (
      select * from public.v_seo_content_gap_intelligence_v1 g0
      where g0.organization_id=t.organization_id and g0.topic_id=t.id
      limit 1
    ) g on true
    where t.organization_id=p_organization_id and t.id=p_entity_id and t.status<>'archived';

  elsif p_entity_type='seo_entity' then
    select jsonb_strip_nulls(jsonb_build_object(
      'organization_id',e.organization_id,
      'entity_type','seo_entity',
      'entity_id',e.id,
      'canonical_key',e.canonical_key,
      'semantic_entity_name',e.name,
      'semantic_entity_kind',e.entity_type,
      'description',e.description,
      'external_source',e.external_source,
      'source',e.source,
      'status',e.status,
      'created_at',e.created_at,
      'updated_at',e.updated_at
    )) into v_doc
    from public.seo_semantic_entities e
    where e.organization_id=p_organization_id and e.id=p_entity_id and e.status<>'archived';

  elsif p_entity_type='seo_experiment' then
    select jsonb_strip_nulls(jsonb_build_object(
      'organization_id',x.organization_id,
      'entity_type','seo_experiment',
      'entity_id',x.id,
      'experiment_title',x.title,
      'hypothesis',x.hypothesis,
      'target_kind',x.target_kind,
      'target_page_id',x.target_page_id,
      'target_url',x.target_url,
      'source_layer',x.source_layer,
      'source_action',x.source_action,
      'primary_metric',x.primary_metric,
      'status',x.status,
      'result_classification',x.result_classification,
      'result_confidence',x.result_confidence,
      'learning_summary',x.learning_summary,
      'started_at',x.started_at,
      'completed_at',x.completed_at,
      'created_at',x.created_at,
      'updated_at',x.updated_at
    )) into v_doc
    from public.seo_experiments x
    where x.organization_id=p_organization_id and x.id=p_entity_id;

  elsif p_entity_type='seo_action' then
    select jsonb_strip_nulls(jsonb_build_object(
      'organization_id',o.organization_id,
      'entity_type','seo_action',
      'entity_id',o.id,
      'experiment_id',o.experiment_id,
      'target_page_id',o.target_page_id,
      'target_url',o.target_url,
      'source_layer',o.source_layer,
      'source_action',o.source_action,
      'seo_action_kind',o.action_kind,
      'risk_level',o.risk_level,
      'executor_kind',o.executor_kind,
      'execution_gate',o.execution_gate,
      'approval_status',o.approval_status,
      'execution_status',o.execution_status,
      'created_at',o.created_at,
      'updated_at',o.updated_at
    )) into v_doc
    from public.seo_optimization_actions o
    where o.organization_id=p_organization_id and o.id=p_entity_id;
  end if;

  if v_doc is null then
    return jsonb_build_object(
      'indexable',false,
      'reason','seo_entity_missing_or_inactive',
      'operation','delete'
    );
  end if;

  return jsonb_build_object(
    'indexable',true,
    'operation','upsert',
    'document_id',p_organization_id::text||':'||p_entity_type||':'||p_entity_id::text,
    'document',v_doc
  );
end;
$$;

revoke all on function public.build_search_document_v1(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.build_search_document_v1(uuid,text,uuid) to service_role;
