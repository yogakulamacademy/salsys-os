-- OpenSearch SEO Intelligence v1
-- Adds privacy-safe SEO pages/topics/entities/experiments/actions to the existing
-- tenant-bound OpenSearch outbox without enabling indexing for any organization.

alter table public.search_index_outbox
  drop constraint if exists search_index_outbox_entity_type_check;

alter table public.search_index_outbox
  add constraint search_index_outbox_entity_type_check
  check (entity_type = any (array[
    'lead'::text,
    'conversation'::text,
    'message'::text,
    'knowledge_chunk'::text,
    'person'::text,
    'seo_page'::text,
    'seo_topic'::text,
    'seo_entity'::text,
    'seo_experiment'::text,
    'seo_action'::text
  ]));

create or replace function public.enqueue_search_index_v1(
  p_organization_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_operation text default 'upsert'::text,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare v_id uuid;
begin
  if p_organization_id is null or p_entity_id is null then
    raise exception 'organization and entity required';
  end if;

  if p_entity_type not in (
    'lead','conversation','message','knowledge_chunk','person',
    'seo_page','seo_topic','seo_entity','seo_experiment','seo_action'
  ) then
    raise exception 'unsupported search entity';
  end if;

  if p_operation not in ('upsert','delete') then
    raise exception 'unsupported search operation';
  end if;

  insert into public.search_index_outbox(
    organization_id,entity_type,entity_id,operation,status,revision,attempt_count,next_retry_at,
    lease_token,lease_expires_at,claimed_revision,last_error,metadata,updated_at
  ) values(
    p_organization_id,p_entity_type,p_entity_id,p_operation,'pending',1,0,null,
    null,null,null,null,coalesce(p_metadata,'{}'::jsonb),now()
  )
  on conflict (organization_id,entity_type,entity_id) do update
  set operation=excluded.operation,
      revision=public.search_index_outbox.revision+1,
      status='pending',
      attempt_count=0,
      next_retry_at=null,
      lease_token=null,
      lease_expires_at=null,
      claimed_revision=null,
      last_error=null,
      metadata=public.search_index_outbox.metadata||excluded.metadata,
      updated_at=now()
  returning id into v_id;

  return v_id;
end;
$$;

-- Preserve the already-hardened CRM/knowledge document builder as the core path,
-- then wrap it with an SEO dispatcher. The worker continues calling the same
-- build_search_document_v1 contract.
do $$
begin
  if to_regprocedure('public.build_search_document_core_v1(uuid,text,uuid)') is null
     and to_regprocedure('public.build_search_document_v1(uuid,text,uuid)') is not null then
    alter function public.build_search_document_v1(uuid,text,uuid)
      rename to build_search_document_core_v1;
  end if;
end;
$$;

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
    select jsonb_strip_nulls(jsonb_build_object(
      'organization_id',p.organization_id,
      'entity_type','seo_page',
      'entity_id',p.id,
      'site_id',p.site_id,
      'normalized_url',p.normalized_url,
      'canonical_url',p.canonical_url,
      'url_path',p.url_path,
      'page_type',p.page_type,
      'lifecycle_status',p.lifecycle_status,
      'title',c.title,
      'meta_description',c.meta_description,
      'word_count',c.word_count,
      'is_indexable',c.is_indexable,
      'indexability_reason',c.indexability_reason,
      'schema_types',c.schema_types,
      'technical_issue_types',c.technical_issue_types,
      'technical_issue_count',c.technical_issue_count,
      'gsc_clicks',c.gsc_clicks,
      'gsc_impressions',c.gsc_impressions,
      'gsc_ctr',c.gsc_ctr,
      'gsc_avg_position',c.gsc_avg_position,
      'semantic_coverage_score',c.semantic_coverage_score_v1,
      'semantic_topic_count',c.semantic_topic_count,
      'semantic_entity_count',c.semantic_entity_count,
      'internal_link_opportunities',c.internal_link_opportunities,
      'opportunity_score',c.opportunity_score_v1,
      'opportunity_reasons',c.opportunity_reasons,
      'content_state',c.content_state,
      'recommended_action',coalesce(r.recommended_action,c.recommended_action),
      'action_priority_score',c.action_priority_score,
      'action_reason',c.action_reason,
      'organic_leads',r.organic_leads,
      'organic_qualified_leads',r.organic_qualified_leads,
      'organic_enrolled_leads',r.organic_enrolled_leads,
      'organic_revenue_inr',r.organic_revenue_inr,
      'organic_revenue_usd',r.organic_revenue_usd,
      'business_value_signal',r.business_value_signal,
      'revenue_priority_score',r.revenue_priority_score_v1,
      'answer_readiness_score',a.answer_readiness_score_v1,
      'answer_state',a.answer_state,
      'answer_query_count',a.answer_query_count,
      'high_opportunity_answer_queries',a.high_opportunity_query_count,
      'generative_readiness_score',g.generative_readiness_score_v1,
      'geo_state',g.geo_state,
      'ai_referral_sessions',g.ai_referral_sessions,
      'ai_linked_leads',g.ai_linked_leads,
      'observed_ai_providers',g.observed_ai_providers,
      'first_seen_at',p.first_seen_at,
      'last_seen_at',p.last_seen_at,
      'last_crawled_at',p.last_crawled_at,
      'created_at',p.created_at,
      'updated_at',greatest(
        p.updated_at,
        coalesce(c.fetched_at,p.updated_at),
        coalesce(g.fetched_at,p.updated_at)
      )
    )) into v_doc
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
    where p.organization_id=p_organization_id and p.id=p_entity_id;

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

create or replace function public.seo_search_enqueue_row_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_org uuid;
  v_id uuid;
  v_type text := tg_argv[0];
  v_operation text := case when tg_op='DELETE' then 'delete' else 'upsert' end;
begin
  v_org := case when tg_op='DELETE' then old.organization_id else new.organization_id end;
  v_id := case when tg_op='DELETE' then old.id else new.id end;

  -- Do not accumulate SEO work while external indexing is disabled. A controlled
  -- seed is performed when an organization is intentionally enabled/piloted.
  if not exists(
    select 1 from public.search_index_settings s
    where s.organization_id=v_org and s.indexing_enabled=true
  ) then
    return case when tg_op='DELETE' then old else new end;
  end if;

  perform public.enqueue_search_index_v1(
    v_org,
    v_type,
    v_id,
    v_operation,
    jsonb_build_object('source','seo_live_trigger_v1')
  );

  return case when tg_op='DELETE' then old else new end;
end;
$$;

drop trigger if exists seo_pages_search_outbox_v1 on public.seo_pages;
create trigger seo_pages_search_outbox_v1
after insert or update or delete on public.seo_pages
for each row execute function public.seo_search_enqueue_row_trigger_v1('seo_page');

drop trigger if exists seo_topics_search_outbox_v1 on public.seo_semantic_topics;
create trigger seo_topics_search_outbox_v1
after insert or update or delete on public.seo_semantic_topics
for each row execute function public.seo_search_enqueue_row_trigger_v1('seo_topic');

drop trigger if exists seo_entities_search_outbox_v1 on public.seo_semantic_entities;
create trigger seo_entities_search_outbox_v1
after insert or update or delete on public.seo_semantic_entities
for each row execute function public.seo_search_enqueue_row_trigger_v1('seo_entity');

drop trigger if exists seo_experiments_search_outbox_v1 on public.seo_experiments;
create trigger seo_experiments_search_outbox_v1
after insert or update or delete on public.seo_experiments
for each row execute function public.seo_search_enqueue_row_trigger_v1('seo_experiment');

drop trigger if exists seo_actions_search_outbox_v1 on public.seo_optimization_actions;
create trigger seo_actions_search_outbox_v1
after insert or update or delete on public.seo_optimization_actions
for each row execute function public.seo_search_enqueue_row_trigger_v1('seo_action');

create or replace function public.refresh_seo_search_index_v1(
  p_organization_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_pages integer:=0;
  v_topics integer:=0;
  v_entities integer:=0;
  v_experiments integer:=0;
  v_actions integer:=0;
begin
  if not exists(
    select 1 from public.search_index_settings s
    where s.organization_id=p_organization_id and s.indexing_enabled=true
  ) then
    return jsonb_build_object('ok',true,'skipped',true,'reason','indexing_disabled');
  end if;

  insert into public.search_index_outbox(organization_id,entity_type,entity_id,operation,status,metadata)
  select p_organization_id,'seo_page',p.id,'upsert','pending',jsonb_build_object('source','seo_refresh_v1')
  from public.seo_pages p
  where p.organization_id=p_organization_id
  on conflict (organization_id,entity_type,entity_id) do update
  set operation='upsert',status='pending',revision=public.search_index_outbox.revision+1,
      attempt_count=0,next_retry_at=null,lease_token=null,lease_expires_at=null,
      claimed_revision=null,last_error=null,metadata=public.search_index_outbox.metadata||excluded.metadata,updated_at=now();
  get diagnostics v_pages=row_count;

  insert into public.search_index_outbox(organization_id,entity_type,entity_id,operation,status,metadata)
  select p_organization_id,'seo_topic',t.id,'upsert','pending',jsonb_build_object('source','seo_refresh_v1')
  from public.seo_semantic_topics t
  where t.organization_id=p_organization_id and t.status<>'archived'
  on conflict (organization_id,entity_type,entity_id) do update
  set operation='upsert',status='pending',revision=public.search_index_outbox.revision+1,
      attempt_count=0,next_retry_at=null,lease_token=null,lease_expires_at=null,
      claimed_revision=null,last_error=null,metadata=public.search_index_outbox.metadata||excluded.metadata,updated_at=now();
  get diagnostics v_topics=row_count;

  insert into public.search_index_outbox(organization_id,entity_type,entity_id,operation,status,metadata)
  select p_organization_id,'seo_entity',e.id,'upsert','pending',jsonb_build_object('source','seo_refresh_v1')
  from public.seo_semantic_entities e
  where e.organization_id=p_organization_id and e.status<>'archived'
  on conflict (organization_id,entity_type,entity_id) do update
  set operation='upsert',status='pending',revision=public.search_index_outbox.revision+1,
      attempt_count=0,next_retry_at=null,lease_token=null,lease_expires_at=null,
      claimed_revision=null,last_error=null,metadata=public.search_index_outbox.metadata||excluded.metadata,updated_at=now();
  get diagnostics v_entities=row_count;

  insert into public.search_index_outbox(organization_id,entity_type,entity_id,operation,status,metadata)
  select p_organization_id,'seo_experiment',x.id,'upsert','pending',jsonb_build_object('source','seo_refresh_v1')
  from public.seo_experiments x
  where x.organization_id=p_organization_id
  on conflict (organization_id,entity_type,entity_id) do update
  set operation='upsert',status='pending',revision=public.search_index_outbox.revision+1,
      attempt_count=0,next_retry_at=null,lease_token=null,lease_expires_at=null,
      claimed_revision=null,last_error=null,metadata=public.search_index_outbox.metadata||excluded.metadata,updated_at=now();
  get diagnostics v_experiments=row_count;

  insert into public.search_index_outbox(organization_id,entity_type,entity_id,operation,status,metadata)
  select p_organization_id,'seo_action',a.id,'upsert','pending',jsonb_build_object('source','seo_refresh_v1')
  from public.seo_optimization_actions a
  where a.organization_id=p_organization_id
  on conflict (organization_id,entity_type,entity_id) do update
  set operation='upsert',status='pending',revision=public.search_index_outbox.revision+1,
      attempt_count=0,next_retry_at=null,lease_token=null,lease_expires_at=null,
      claimed_revision=null,last_error=null,metadata=public.search_index_outbox.metadata||excluded.metadata,updated_at=now();
  get diagnostics v_actions=row_count;

  return jsonb_build_object(
    'ok',true,'skipped',false,
    'seo_pages',v_pages,
    'seo_topics',v_topics,
    'seo_entities',v_entities,
    'seo_experiments',v_experiments,
    'seo_actions',v_actions
  );
end;
$$;

create or replace function public.refresh_enabled_seo_search_indexes_v1()
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_org record;
  v_runs integer:=0;
begin
  for v_org in
    select organization_id from public.search_index_settings where indexing_enabled=true
  loop
    perform public.refresh_seo_search_index_v1(v_org.organization_id);
    v_runs:=v_runs+1;
  end loop;

  return jsonb_build_object('ok',true,'organizations_refreshed',v_runs);
end;
$$;

create or replace function public.seed_seo_search_index_pilot_v1(
  p_organization_id uuid,
  p_limit integer default 15
) returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_count integer:=0;
  v_limit integer:=greatest(1,least(coalesce(p_limit,15),25));
begin
  if not exists(
    select 1 from public.search_index_settings s
    where s.organization_id=p_organization_id
      and coalesce(s.pilot_mode_enabled,false)=true
      and coalesce(s.indexing_enabled,false)=false
  ) then
    return jsonb_build_object('ok',false,'reason','pilot_not_staged_or_already_armed');
  end if;

  insert into public.search_index_outbox(organization_id,entity_type,entity_id,operation,status,metadata)
  select p_organization_id,'seo_page',p.id,'upsert','pending',
         jsonb_build_object('seed','pilot_v1','domain','seo','source','seo_pilot_v1')
  from public.seo_pages p
  left join public.v_seo_content_page_intelligence_v1 c
    on c.organization_id=p.organization_id and c.page_id=p.id
  where p.organization_id=p_organization_id
  order by coalesce(c.action_priority_score,c.opportunity_score_v1,0) desc, p.updated_at desc
  limit v_limit
  on conflict (organization_id,entity_type,entity_id) do update
  set operation='upsert',status='pending',revision=public.search_index_outbox.revision+1,
      attempt_count=0,next_retry_at=null,lease_token=null,lease_expires_at=null,
      claimed_revision=null,last_error=null,
      metadata=public.search_index_outbox.metadata||excluded.metadata,updated_at=now();
  get diagnostics v_count=row_count;

  return jsonb_build_object('ok',true,'seeded',v_count,'entity_type','seo_page');
end;
$$;

-- Derived GSC/crawl/CRM metrics can change without updating seo_pages directly.
-- A periodic refresh keeps OpenSearch current, but is a no-op for organizations
-- whose external indexing remains disabled.
do $$
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname='salsys-seo-search-refresh-v1';

    perform cron.schedule(
      'salsys-seo-search-refresh-v1',
      '*/30 * * * *',
      'select public.refresh_enabled_seo_search_indexes_v1();'
    );
  end if;
end;
$$;

revoke all on function public.enqueue_search_index_v1(uuid,text,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.build_search_document_v1(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.build_search_document_core_v1(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.refresh_seo_search_index_v1(uuid) from public,anon,authenticated;
revoke all on function public.refresh_enabled_seo_search_indexes_v1() from public,anon,authenticated;
revoke all on function public.seed_seo_search_index_pilot_v1(uuid,integer) from public,anon,authenticated;
revoke all on function public.seo_search_enqueue_row_trigger_v1() from public,anon,authenticated;

grant execute on function public.enqueue_search_index_v1(uuid,text,uuid,text,jsonb) to service_role;
grant execute on function public.build_search_document_v1(uuid,text,uuid) to service_role;
grant execute on function public.refresh_seo_search_index_v1(uuid) to service_role;
grant execute on function public.refresh_enabled_seo_search_indexes_v1() to service_role;
grant execute on function public.seed_seo_search_index_pilot_v1(uuid,integer) to service_role;
