-- OpenSearch competitor intelligence v1
-- Adds safe, tenant-bound search documents for competitors, rank targets and grounded analyses.

alter table public.search_index_outbox
  drop constraint if exists search_index_outbox_entity_type_check;

alter table public.search_index_outbox
  add constraint search_index_outbox_entity_type_check
  check (entity_type = any (array[
    'lead'::text,'conversation'::text,'message'::text,'knowledge_chunk'::text,'person'::text,
    'seo_page'::text,'seo_topic'::text,'seo_entity'::text,'seo_experiment'::text,'seo_action'::text,
    'seo_competitor'::text,'seo_rank_target'::text,'seo_competitor_analysis'::text
  ]));

create or replace function public.enqueue_search_index_v1(
  p_organization_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_operation text default 'upsert',
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $$
declare v_id uuid;
begin
  if p_organization_id is null or p_entity_id is null then
    raise exception 'organization and entity required';
  end if;

  if p_entity_type not in (
    'lead','conversation','message','knowledge_chunk','person',
    'seo_page','seo_topic','seo_entity','seo_experiment','seo_action',
    'seo_competitor','seo_rank_target','seo_competitor_analysis'
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

-- Preserve the existing SEO/CRM document builder and wrap it with competitor intelligence.
do $$
begin
  if to_regprocedure('public.build_search_document_competitor_base_v1(uuid,text,uuid)') is null then
    alter function public.build_search_document_v1(uuid,text,uuid)
      rename to build_search_document_competitor_base_v1;
  end if;
end $$;

create or replace function public.build_search_document_v1(
  p_organization_id uuid,
  p_entity_type text,
  p_entity_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','auth','pg_temp'
as $$
declare
  v_doc jsonb;
begin
  if p_entity_type not in ('seo_competitor','seo_rank_target','seo_competitor_analysis') then
    return public.build_search_document_competitor_base_v1(
      p_organization_id,
      p_entity_type,
      p_entity_id
    );
  end if;

  if p_entity_type='seo_competitor' then
    select jsonb_strip_nulls(jsonb_build_object(
      'organization_id',c.organization_id,
      'entity_type','seo_competitor',
      'entity_id',c.id,
      'competitor_domain',c.domain,
      'competitor_name',c.display_name,
      'competitor_type',c.competitor_type,
      'competitor_source',c.source,
      'competitor_active',c.is_active,
      'created_at',c.created_at,
      'updated_at',c.updated_at
    )) into v_doc
    from public.seo_competitors c
    where c.organization_id=p_organization_id
      and c.id=p_entity_id
      and c.is_active=true;

  elsif p_entity_type='seo_rank_target' then
    select jsonb_strip_nulls(jsonb_build_object(
      'organization_id',t.organization_id,
      'entity_type','seo_rank_target',
      'entity_id',t.id,
      'site_id',t.site_id,
      'rank_query',t.query,
      'rank_surface',t.surface,
      'rank_locale',t.locale,
      'rank_country_code',t.country_code,
      'rank_device',t.device,
      'rank_engine',t.engine,
      'rank_priority',t.priority,
      'rank_check_interval_minutes',t.check_interval_minutes,
      'rank_last_checked_at',t.last_checked_at,
      'rank_next_check_at',t.next_check_at,
      'rank_failure_count',t.failure_count,
      'rank_last_error_category',t.last_error_category,
      'rank_own_position',s.own_position,
      'rank_own_url',s.own_url,
      'rank_own_title',s.own_title,
      'rank_answer_visibility',s.answer_visibility,
      'rank_ai_cited',s.ai_cited,
      'rank_ai_citation_position',s.ai_citation_position,
      'rank_ai_provider',s.ai_provider,
      'rank_source_provider',s.source_provider,
      'rank_observed_at',s.observed_at,
      'rank_competitor_count',s.competitor_count,
      'rank_competitor_domains',s.competitor_domains,
      'rank_competitor_text',s.competitor_text,
      'rank_serp_feature_text',s.serp_feature_text,
      'created_at',t.created_at,
      'updated_at',greatest(t.updated_at,coalesce(s.observed_at,t.updated_at))
    )) into v_doc
    from public.seo_rank_targets t
    left join lateral (
      select
        rs.source_provider,
        rs.own_position,
        rs.own_url,
        rs.own_title,
        rs.answer_visibility,
        rs.ai_cited,
        rs.ai_citation_position,
        rs.ai_provider,
        rs.observed_at,
        jsonb_array_length(case when jsonb_typeof(rs.competitor_results)='array' then rs.competitor_results else '[]'::jsonb end) as competitor_count,
        coalesce((
          select array_agg(distinct competitor_domain order by competitor_domain)
          from (
            select nullif(coalesce(r->>'domain',r->>'display_name',r->>'name'),'') as competitor_domain
            from jsonb_array_elements(case when jsonb_typeof(rs.competitor_results)='array' then rs.competitor_results else '[]'::jsonb end) r
          ) q
          where competitor_domain is not null
        ),array[]::text[]) as competitor_domains,
        coalesce((
          select string_agg(
            left(concat_ws(' ',
              nullif(r->>'domain',''),
              nullif(r->>'display_name',''),
              nullif(r->>'name',''),
              case when nullif(r->>'position','') is not null then 'position '||(r->>'position') else null end,
              nullif(r->>'title','')
            ),600),
            ' | '
          )
          from jsonb_array_elements(case when jsonb_typeof(rs.competitor_results)='array' then rs.competitor_results else '[]'::jsonb end) r
        ),'') as competitor_text,
        coalesce((
          select string_agg(
            left(coalesce(nullif(f->>'type',''),nullif(f->>'name',''),case when jsonb_typeof(f)='string' then f #>> '{}' else null end),200),
            ' | '
          )
          from jsonb_array_elements(case when jsonb_typeof(rs.serp_features)='array' then rs.serp_features else '[]'::jsonb end) f
        ),'') as serp_feature_text
      from public.seo_rank_snapshots rs
      where rs.organization_id=t.organization_id and rs.target_id=t.id
      order by rs.observed_at desc,rs.created_at desc
      limit 1
    ) s on true
    where t.organization_id=p_organization_id
      and t.id=p_entity_id
      and t.is_active=true;

  elsif p_entity_type='seo_competitor_analysis' then
    select jsonb_strip_nulls(jsonb_build_object(
      'organization_id',a.organization_id,
      'entity_type','seo_competitor_analysis',
      'entity_id',a.id,
      'site_id',a.site_id,
      'analysis_scope',a.scope,
      'analysis_provider',a.provider,
      'analysis_model',a.model,
      'analysis_status',a.status,
      'analysis_summary_text',x.summary_text,
      'analysis_gap_text',x.gap_text,
      'analysis_recommendation_text',x.recommendation_text,
      'analysis_surfaces',x.surfaces,
      'analysis_target_queries',x.target_queries,
      'analysis_target_urls',x.target_urls,
      'started_at',a.started_at,
      'completed_at',a.completed_at,
      'created_at',a.created_at,
      'updated_at',coalesce(a.completed_at,a.created_at)
    )) into v_doc
    from public.seo_competitor_analysis_runs a
    left join lateral (
      select
        coalesce((
          select string_agg(left(value #>> '{}',1000),' ')
          from jsonb_each(case when jsonb_typeof(a.summary)='object' then a.summary else '{}'::jsonb end)
          where jsonb_typeof(value) in ('string','number','boolean')
        ),'') as summary_text,
        coalesce((
          select string_agg(left(concat_ws(' ',
            nullif(g->>'surface',''),
            nullif(g->>'gap',''),
            nullif(g->>'type',''),
            nullif(g->>'description',''),
            nullif(g->>'why',''),
            nullif(g->>'evidence','')
          ),1200),' | ')
          from jsonb_array_elements(case when jsonb_typeof(a.gaps)='array' then a.gaps else '[]'::jsonb end) g
        ),'') as gap_text,
        coalesce((
          select string_agg(left(concat_ws(' ',
            nullif(r->>'surface',''),
            nullif(r->>'action',''),
            nullif(r->>'why',''),
            nullif(r->>'competitor_advantage',''),
            nullif(r->>'expected_signal',''),
            nullif(r->>'confidence',''),
            nullif(r->>'evidence',''),
            nullif(r->>'target_query',''),
            nullif(r->>'target_url','')
          ),1600),' | ')
          from jsonb_array_elements(case when jsonb_typeof(a.recommendations)='array' then a.recommendations else '[]'::jsonb end) r
        ),'') as recommendation_text,
        coalesce((
          select array_agg(distinct surface order by surface)
          from (
            select nullif(r->>'surface','') as surface
            from jsonb_array_elements(case when jsonb_typeof(a.recommendations)='array' then a.recommendations else '[]'::jsonb end) r
          ) z where surface is not null
        ),array[]::text[]) as surfaces,
        coalesce((
          select array_agg(distinct target_query order by target_query)
          from (
            select nullif(r->>'target_query','') as target_query
            from jsonb_array_elements(case when jsonb_typeof(a.recommendations)='array' then a.recommendations else '[]'::jsonb end) r
          ) z where target_query is not null
        ),array[]::text[]) as target_queries,
        coalesce((
          select array_agg(distinct target_url order by target_url)
          from (
            select nullif(r->>'target_url','') as target_url
            from jsonb_array_elements(case when jsonb_typeof(a.recommendations)='array' then a.recommendations else '[]'::jsonb end) r
          ) z where target_url is not null
        ),array[]::text[]) as target_urls
    ) x on true
    where a.organization_id=p_organization_id
      and a.id=p_entity_id
      and a.status='completed';
  end if;

  if v_doc is null then
    return jsonb_build_object(
      'indexable',false,
      'reason','competitor_entity_missing_or_inactive',
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

create or replace function public.seo_competitor_search_enqueue_row_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $$
declare
  v_org uuid;
  v_id uuid;
  v_type text;
  v_operation text;
begin
  if tg_op='DELETE' then
    v_org:=old.organization_id;
    v_id:=old.id;
    v_operation:='delete';
  else
    v_org:=new.organization_id;
    v_id:=new.id;
    v_operation:='upsert';
  end if;

  if not exists(
    select 1 from public.search_index_settings s
    where s.organization_id=v_org and s.indexing_enabled=true
  ) then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;

  v_type:=case tg_table_name
    when 'seo_competitors' then 'seo_competitor'
    when 'seo_rank_targets' then 'seo_rank_target'
    when 'seo_competitor_analysis_runs' then 'seo_competitor_analysis'
    else null
  end;

  if v_type is not null then
    perform public.enqueue_search_index_v1(
      v_org,v_type,v_id,v_operation,
      jsonb_build_object('source','competitor_live_trigger_v1')
    );
  end if;

  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;

create or replace function public.seo_rank_snapshot_search_enqueue_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $$
declare
  v_org uuid;
  v_target uuid;
begin
  if tg_op='DELETE' then
    v_org:=old.organization_id;
    v_target:=old.target_id;
  else
    v_org:=new.organization_id;
    v_target:=new.target_id;
  end if;

  if exists(
    select 1 from public.search_index_settings s
    where s.organization_id=v_org and s.indexing_enabled=true
  ) then
    perform public.enqueue_search_index_v1(
      v_org,'seo_rank_target',v_target,'upsert',
      jsonb_build_object('source','rank_snapshot_trigger_v1')
    );
  end if;

  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists seo_competitors_search_outbox_v1 on public.seo_competitors;
create trigger seo_competitors_search_outbox_v1
after insert or update or delete on public.seo_competitors
for each row execute function public.seo_competitor_search_enqueue_row_trigger_v1();

drop trigger if exists seo_rank_targets_search_outbox_v1 on public.seo_rank_targets;
create trigger seo_rank_targets_search_outbox_v1
after insert or update or delete on public.seo_rank_targets
for each row execute function public.seo_competitor_search_enqueue_row_trigger_v1();

drop trigger if exists seo_competitor_analysis_search_outbox_v1 on public.seo_competitor_analysis_runs;
create trigger seo_competitor_analysis_search_outbox_v1
after insert or update or delete on public.seo_competitor_analysis_runs
for each row execute function public.seo_competitor_search_enqueue_row_trigger_v1();

drop trigger if exists seo_rank_snapshots_search_outbox_v1 on public.seo_rank_snapshots;
create trigger seo_rank_snapshots_search_outbox_v1
after insert or update or delete on public.seo_rank_snapshots
for each row execute function public.seo_rank_snapshot_search_enqueue_trigger_v1();

-- Extend the existing derived SEO refresh without changing its prior behavior.
do $$
begin
  if to_regprocedure('public.refresh_seo_search_index_base_v1(uuid)') is null then
    alter function public.refresh_seo_search_index_v1(uuid)
      rename to refresh_seo_search_index_base_v1;
  end if;
end $$;

create or replace function public.refresh_seo_search_index_v1(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $$
declare
  v_base jsonb;
  v_competitors integer:=0;
  v_rank_targets integer:=0;
  v_analyses integer:=0;
  r record;
begin
  v_base:=public.refresh_seo_search_index_base_v1(p_organization_id);
  if coalesce((v_base->>'skipped')::boolean,false) then
    return v_base;
  end if;

  for r in select id from public.seo_competitors where organization_id=p_organization_id and is_active=true loop
    perform public.enqueue_search_index_v1(p_organization_id,'seo_competitor',r.id,'upsert',jsonb_build_object('source','seo_refresh_v1'));
    v_competitors:=v_competitors+1;
  end loop;

  for r in select id from public.seo_rank_targets where organization_id=p_organization_id and is_active=true loop
    perform public.enqueue_search_index_v1(p_organization_id,'seo_rank_target',r.id,'upsert',jsonb_build_object('source','seo_refresh_v1'));
    v_rank_targets:=v_rank_targets+1;
  end loop;

  for r in select id from public.seo_competitor_analysis_runs where organization_id=p_organization_id and status='completed' loop
    perform public.enqueue_search_index_v1(p_organization_id,'seo_competitor_analysis',r.id,'upsert',jsonb_build_object('source','seo_refresh_v1'));
    v_analyses:=v_analyses+1;
  end loop;

  return v_base || jsonb_build_object(
    'seo_competitors',v_competitors,
    'seo_rank_targets',v_rank_targets,
    'seo_competitor_analyses',v_analyses
  );
end;
$$;

revoke all on function public.enqueue_search_index_v1(uuid,text,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.build_search_document_competitor_base_v1(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.build_search_document_v1(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.refresh_seo_search_index_base_v1(uuid) from public,anon,authenticated;
revoke all on function public.refresh_seo_search_index_v1(uuid) from public,anon,authenticated;
revoke all on function public.seo_competitor_search_enqueue_row_trigger_v1() from public,anon,authenticated;
revoke all on function public.seo_rank_snapshot_search_enqueue_trigger_v1() from public,anon,authenticated;

grant execute on function public.enqueue_search_index_v1(uuid,text,uuid,text,jsonb) to service_role;
grant execute on function public.build_search_document_v1(uuid,text,uuid) to service_role;
grant execute on function public.refresh_seo_search_index_v1(uuid) to service_role;
