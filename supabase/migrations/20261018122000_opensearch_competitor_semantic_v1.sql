-- Semantic competitor intelligence v1
-- Extends the SEO embedding pipeline with privacy-minimized competitor/ranking subjects.

alter table public.seo_embedding_outbox
  drop constraint if exists seo_embedding_outbox_entity_type_check;

alter table public.seo_embedding_outbox
  add constraint seo_embedding_outbox_entity_type_check
  check (entity_type = any (array[
    'seo_page'::text,'seo_topic'::text,'seo_entity'::text,'seo_experiment'::text,'seo_action'::text,
    'seo_competitor'::text,'seo_rank_target'::text,'seo_competitor_analysis'::text
  ]));

do $$
begin
  if to_regprocedure('public.build_seo_embedding_subject_base_v1(uuid,text,uuid)') is null then
    alter function public.build_seo_embedding_subject_v1(uuid,text,uuid)
      rename to build_seo_embedding_subject_base_v1;
  end if;
end $$;

create or replace function public.build_seo_embedding_subject_v1(
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
  v_search jsonb;
  v_doc jsonb;
  v_text text;
begin
  if p_entity_type not in ('seo_competitor','seo_rank_target','seo_competitor_analysis') then
    return public.build_seo_embedding_subject_base_v1(p_organization_id,p_entity_type,p_entity_id);
  end if;

  v_search:=public.build_search_document_v1(p_organization_id,p_entity_type,p_entity_id);
  if not coalesce((v_search->>'indexable')::boolean,false) then
    return jsonb_build_object(
      'indexable',false,
      'operation',coalesce(v_search->>'operation','delete'),
      'reason',coalesce(v_search->>'reason','not_indexable')
    );
  end if;

  v_doc:=v_search->'document';

  -- Explicit allowlist only. Never embed raw provider payloads, arbitrary metadata or credentials.
  v_text:=concat_ws(E'\n',
    nullif(v_doc->>'competitor_name',''),
    nullif(v_doc->>'competitor_domain',''),
    nullif(v_doc->>'competitor_type',''),
    nullif(v_doc->>'rank_query',''),
    nullif(v_doc->>'rank_surface',''),
    nullif(v_doc->>'rank_country_code',''),
    nullif(v_doc->>'rank_locale',''),
    nullif(v_doc->>'rank_device',''),
    nullif(v_doc->>'rank_engine',''),
    nullif(v_doc->>'rank_own_title',''),
    nullif(v_doc->>'rank_own_url',''),
    nullif(v_doc->>'rank_competitor_domains',''),
    nullif(v_doc->>'rank_competitor_text',''),
    nullif(v_doc->>'rank_serp_feature_text',''),
    nullif(v_doc->>'analysis_summary_text',''),
    nullif(v_doc->>'analysis_gap_text',''),
    nullif(v_doc->>'analysis_recommendation_text',''),
    nullif(v_doc->>'analysis_surfaces',''),
    nullif(v_doc->>'analysis_target_queries',''),
    nullif(v_doc->>'analysis_target_urls','')
  );

  v_text:=left(regexp_replace(coalesce(v_text,''), E'[\\t\\r ]+', ' ', 'g'),12000);
  if length(trim(v_text))<2 then
    return jsonb_build_object('indexable',false,'operation','delete','reason','empty_embedding_subject');
  end if;

  return jsonb_build_object(
    'indexable',true,
    'operation','upsert',
    'entity_type',p_entity_type,
    'entity_id',p_entity_id,
    'text',v_text,
    'content_hash',md5(v_text),
    'document_id',p_organization_id::text||':'||p_entity_type||':'||p_entity_id::text
  );
end;
$$;

create or replace function public.seo_competitor_embedding_enqueue_row_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $$
declare
  v_org uuid;
  v_id uuid;
  v_type text;
begin
  if tg_op='DELETE' then
    v_org:=old.organization_id;
    v_id:=old.id;
  else
    v_org:=new.organization_id;
    v_id:=new.id;
  end if;

  v_type:=case tg_table_name
    when 'seo_competitors' then 'seo_competitor'
    when 'seo_rank_targets' then 'seo_rank_target'
    when 'seo_competitor_analysis_runs' then 'seo_competitor_analysis'
    else null
  end;

  if v_type is not null then
    perform public.enqueue_seo_embedding_v1(
      v_org,v_type,v_id,
      jsonb_build_object('source','competitor_semantic_trigger_v1')
    );
  end if;

  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;

create or replace function public.seo_rank_snapshot_embedding_enqueue_trigger_v1()
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

  perform public.enqueue_seo_embedding_v1(
    v_org,'seo_rank_target',v_target,
    jsonb_build_object('source','rank_snapshot_semantic_trigger_v1')
  );

  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists seo_competitors_embedding_outbox_v1 on public.seo_competitors;
create trigger seo_competitors_embedding_outbox_v1
after insert or update or delete on public.seo_competitors
for each row execute function public.seo_competitor_embedding_enqueue_row_trigger_v1();

drop trigger if exists seo_rank_targets_embedding_outbox_v1 on public.seo_rank_targets;
create trigger seo_rank_targets_embedding_outbox_v1
after insert or update or delete on public.seo_rank_targets
for each row execute function public.seo_competitor_embedding_enqueue_row_trigger_v1();

drop trigger if exists seo_competitor_analysis_embedding_outbox_v1 on public.seo_competitor_analysis_runs;
create trigger seo_competitor_analysis_embedding_outbox_v1
after insert or update or delete on public.seo_competitor_analysis_runs
for each row execute function public.seo_competitor_embedding_enqueue_row_trigger_v1();

drop trigger if exists seo_rank_snapshots_embedding_outbox_v1 on public.seo_rank_snapshots;
create trigger seo_rank_snapshots_embedding_outbox_v1
after insert or update or delete on public.seo_rank_snapshots
for each row execute function public.seo_rank_snapshot_embedding_enqueue_trigger_v1();

create or replace function public.refresh_seo_embedding_outbox_v1(p_limit_per_type integer default 500)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $$
declare
  r record;
  x record;
  v_orgs integer:=0;
  v_seen integer:=0;
  v_limit integer:=greatest(1,least(p_limit_per_type,2000));
begin
  for r in
    select s.organization_id
    from public.seo_embedding_settings s
    join public.search_index_settings si on si.organization_id=s.organization_id
    where s.enabled=true and si.indexing_enabled=true
  loop
    v_orgs:=v_orgs+1;
    for x in select id from public.seo_pages where organization_id=r.organization_id limit v_limit loop perform public.enqueue_seo_embedding_v1(r.organization_id,'seo_page',x.id,jsonb_build_object('source','semantic_refresh_v1')); v_seen:=v_seen+1; end loop;
    for x in select id from public.seo_semantic_topics where organization_id=r.organization_id and status<>'archived' limit v_limit loop perform public.enqueue_seo_embedding_v1(r.organization_id,'seo_topic',x.id,jsonb_build_object('source','semantic_refresh_v1')); v_seen:=v_seen+1; end loop;
    for x in select id from public.seo_semantic_entities where organization_id=r.organization_id and status<>'archived' limit v_limit loop perform public.enqueue_seo_embedding_v1(r.organization_id,'seo_entity',x.id,jsonb_build_object('source','semantic_refresh_v1')); v_seen:=v_seen+1; end loop;
    for x in select id from public.seo_experiments where organization_id=r.organization_id limit v_limit loop perform public.enqueue_seo_embedding_v1(r.organization_id,'seo_experiment',x.id,jsonb_build_object('source','semantic_refresh_v1')); v_seen:=v_seen+1; end loop;
    for x in select id from public.seo_optimization_actions where organization_id=r.organization_id limit v_limit loop perform public.enqueue_seo_embedding_v1(r.organization_id,'seo_action',x.id,jsonb_build_object('source','semantic_refresh_v1')); v_seen:=v_seen+1; end loop;
    for x in select id from public.seo_competitors where organization_id=r.organization_id and is_active=true limit v_limit loop perform public.enqueue_seo_embedding_v1(r.organization_id,'seo_competitor',x.id,jsonb_build_object('source','semantic_refresh_v1')); v_seen:=v_seen+1; end loop;
    for x in select id from public.seo_rank_targets where organization_id=r.organization_id and is_active=true limit v_limit loop perform public.enqueue_seo_embedding_v1(r.organization_id,'seo_rank_target',x.id,jsonb_build_object('source','semantic_refresh_v1')); v_seen:=v_seen+1; end loop;
    for x in select id from public.seo_competitor_analysis_runs where organization_id=r.organization_id and status='completed' limit v_limit loop perform public.enqueue_seo_embedding_v1(r.organization_id,'seo_competitor_analysis',x.id,jsonb_build_object('source','semantic_refresh_v1')); v_seen:=v_seen+1; end loop;
  end loop;

  return jsonb_build_object('ok',true,'organizations_refreshed',v_orgs,'entities_examined',v_seen);
end;
$$;

revoke all on function public.build_seo_embedding_subject_base_v1(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.build_seo_embedding_subject_v1(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.refresh_seo_embedding_outbox_v1(integer) from public,anon,authenticated;
revoke all on function public.seo_competitor_embedding_enqueue_row_trigger_v1() from public,anon,authenticated;
revoke all on function public.seo_rank_snapshot_embedding_enqueue_trigger_v1() from public,anon,authenticated;

grant execute on function public.build_seo_embedding_subject_v1(uuid,text,uuid) to service_role;
grant execute on function public.refresh_seo_embedding_outbox_v1(integer) to service_role;
