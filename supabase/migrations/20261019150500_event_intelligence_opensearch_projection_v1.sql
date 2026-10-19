begin;

-- Event Intelligence OpenSearch projection v1
-- PostgreSQL remains authoritative. Only derived/rebuildable feature and
-- prediction documents are projected into the existing search outbox.

create or replace function public.build_event_intelligence_search_document_v1(
  p_organization_id uuid,
  p_entity_type text,
  p_entity_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_doc jsonb;
  v_text text;
begin
  if p_entity_type = 'event_feature' then
    select
      jsonb_strip_nulls(jsonb_build_object(
        'organization_id', f.organization_id,
        'entity_type', 'event_feature',
        'entity_id', f.id,
        'document_category', f.feature_family,
        'document_version', f.revision,
        'status', 'active',
        'summary', left(concat_ws(' · ', f.subject_type, f.subject_key, f.feature_family, f.feature_version), 1000),
        'content', left(concat_ws(' ',
          f.subject_type,
          f.subject_key,
          f.feature_family,
          f.feature_version,
          coalesce(f.feature_payload::text,''),
          coalesce(f.evidence::text,'')
        ), 30000),
        'subject_type', f.subject_type,
        'subject_key', f.subject_key,
        'subject_id', f.subject_id,
        'feature_family', f.feature_family,
        'feature_version', f.feature_version,
        'feature_revision', f.revision,
        'feature_payload', f.feature_payload,
        'evidence', f.evidence,
        'observed_at', f.observed_at,
        'window_start', f.window_start,
        'window_end', f.window_end,
        'created_at', f.created_at,
        'updated_at', f.updated_at
      ))
    into v_doc
    from public.event_intelligence_feature_state f
    where f.organization_id = p_organization_id
      and f.id = p_entity_id;

  elsif p_entity_type = 'event_prediction' then
    select
      jsonb_strip_nulls(jsonb_build_object(
        'organization_id', p.organization_id,
        'entity_type', 'event_prediction',
        'entity_id', p.id,
        'document_category', p.prediction_type,
        'status', p.status,
        'intent', p.confidence_band,
        'summary', left(concat_ws(' · ', p.prediction_type, p.subject_type, p.subject_key, p.model_mode, p.confidence_band), 1000),
        'content', left(concat_ws(' ',
          p.prediction_type,
          p.subject_type,
          p.subject_key,
          p.model_key,
          p.model_version,
          p.model_mode,
          array_to_string(p.reason_codes,' '),
          coalesce(p.explanation::text,''),
          coalesce(p.evidence::text,''),
          coalesce(p.actual_outcome,''),
          coalesce(p.actual_outcome_value::text,'')
        ), 30000),
        'subject_type', p.subject_type,
        'subject_key', p.subject_key,
        'subject_id', p.subject_id,
        'prediction_type', p.prediction_type,
        'model_key', p.model_key,
        'model_version', p.model_version,
        'model_mode', p.model_mode,
        'feature_state_id', p.feature_state_id,
        'score', p.score,
        'probability', p.probability,
        'confidence_low', p.confidence_low,
        'confidence_high', p.confidence_high,
        'confidence_band', p.confidence_band,
        'reason_codes', p.reason_codes,
        'explanation', p.explanation,
        'evidence', p.evidence,
        'generated_at', p.generated_at,
        'expires_at', p.expires_at,
        'actual_outcome', p.actual_outcome,
        'actual_outcome_value', p.actual_outcome_value,
        'outcome_at', p.outcome_at,
        'created_at', p.created_at,
        'updated_at', p.updated_at
      ))
    into v_doc
    from public.event_intelligence_predictions p
    where p.organization_id = p_organization_id
      and p.id = p_entity_id;
  else
    return jsonb_build_object(
      'indexable', false,
      'reason', 'unsupported_event_intelligence_entity',
      'operation', 'delete'
    );
  end if;

  if v_doc is null then
    return jsonb_build_object(
      'indexable', false,
      'reason', 'event_intelligence_entity_missing',
      'operation', 'delete'
    );
  end if;

  return jsonb_build_object(
    'indexable', true,
    'operation', 'upsert',
    'document_id', p_organization_id::text || ':' || p_entity_type || ':' || p_entity_id::text,
    'document', v_doc
  );
end;
$function$;

revoke all on function public.build_event_intelligence_search_document_v1(uuid,text,uuid)
  from public, anon, authenticated;
grant execute on function public.build_event_intelligence_search_document_v1(uuid,text,uuid)
  to service_role;

-- Preserve the existing mature search-document builder without copying its
-- implementation into this migration. The public name becomes a router.
do $do$
begin
  if to_regprocedure('public.build_search_document_legacy_v1(uuid,text,uuid)') is null then
    if to_regprocedure('public.build_search_document_v1(uuid,text,uuid)') is null then
      raise exception 'build_search_document_v1(uuid,text,uuid) is required';
    end if;
    execute 'alter function public.build_search_document_v1(uuid,text,uuid) rename to build_search_document_legacy_v1';
  end if;
end
$do$;

create or replace function public.build_search_document_v1(
  p_organization_id uuid,
  p_entity_type text,
  p_entity_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
begin
  if p_entity_type in ('event_feature','event_prediction') then
    return public.build_event_intelligence_search_document_v1(
      p_organization_id,
      p_entity_type,
      p_entity_id
    );
  end if;

  return public.build_search_document_legacy_v1(
    p_organization_id,
    p_entity_type,
    p_entity_id
  );
end;
$function$;

revoke all on function public.build_search_document_v1(uuid,text,uuid)
  from public, anon, authenticated;
grant execute on function public.build_search_document_v1(uuid,text,uuid)
  to service_role;

create or replace function public.enqueue_event_intelligence_search_v1(
  p_organization_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_operation text default 'upsert',
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_id uuid;
begin
  if p_organization_id is null or p_entity_id is null then
    raise exception 'organization and entity required';
  end if;

  if p_entity_type not in ('event_feature','event_prediction') then
    raise exception 'unsupported event intelligence search entity';
  end if;

  if p_operation not in ('upsert','delete') then
    raise exception 'unsupported search operation';
  end if;

  insert into public.search_index_outbox(
    organization_id,entity_type,entity_id,operation,status,revision,
    attempt_count,next_retry_at,lease_token,lease_expires_at,claimed_revision,
    last_error,metadata,updated_at
  ) values (
    p_organization_id,p_entity_type,p_entity_id,p_operation,'pending',1,
    0,null,null,null,null,null,
    coalesce(p_metadata,'{}'::jsonb) || jsonb_build_object('projection','event_intelligence_v1'),
    now()
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
$function$;

revoke all on function public.enqueue_event_intelligence_search_v1(uuid,text,uuid,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.enqueue_event_intelligence_search_v1(uuid,text,uuid,text,jsonb)
  to service_role;

create or replace function public.enqueue_event_feature_search_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if tg_op = 'INSERT'
     or new.feature_hash is distinct from old.feature_hash
     or new.feature_version is distinct from old.feature_version
     or new.revision is distinct from old.revision then
    perform public.enqueue_event_intelligence_search_v1(
      new.organization_id,
      'event_feature',
      new.id,
      'upsert',
      jsonb_build_object(
        'feature_family',new.feature_family,
        'feature_revision',new.revision,
        'source','feature_state_trigger_v1'
      )
    );
  end if;
  return new;
end;
$function$;

create or replace function public.enqueue_event_prediction_search_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if tg_op = 'INSERT'
     or new.status is distinct from old.status
     or new.actual_outcome is distinct from old.actual_outcome
     or new.actual_outcome_value is distinct from old.actual_outcome_value
     or new.outcome_at is distinct from old.outcome_at then
    perform public.enqueue_event_intelligence_search_v1(
      new.organization_id,
      'event_prediction',
      new.id,
      'upsert',
      jsonb_build_object(
        'prediction_type',new.prediction_type,
        'model_mode',new.model_mode,
        'source','prediction_trigger_v1'
      )
    );
  end if;
  return new;
end;
$function$;

revoke all on function public.enqueue_event_feature_search_trigger_v1()
  from public, anon, authenticated;
revoke all on function public.enqueue_event_prediction_search_trigger_v1()
  from public, anon, authenticated;
grant execute on function public.enqueue_event_feature_search_trigger_v1() to service_role;
grant execute on function public.enqueue_event_prediction_search_trigger_v1() to service_role;

drop trigger if exists trg_enqueue_event_feature_search_v1
  on public.event_intelligence_feature_state;
create trigger trg_enqueue_event_feature_search_v1
after insert or update of feature_hash,feature_version,revision
on public.event_intelligence_feature_state
for each row execute function public.enqueue_event_feature_search_trigger_v1();

drop trigger if exists trg_enqueue_event_prediction_search_v1
  on public.event_intelligence_predictions;
create trigger trg_enqueue_event_prediction_search_v1
after insert or update of status,actual_outcome,actual_outcome_value,outcome_at
on public.event_intelligence_predictions
for each row execute function public.enqueue_event_prediction_search_trigger_v1();

-- Controlled, bounded staging helper. It queues a tiny rebuildable sample but
-- never enables indexing. The operator must separately arm the guarded pilot.
create or replace function public.stage_event_intelligence_search_sample_v1(
  p_organization_id uuid,
  p_max_documents integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_max integer := greatest(1,least(coalesce(p_max_documents,10),50));
  v_feature_limit integer;
  v_prediction_limit integer;
  r record;
  v_features integer := 0;
  v_predictions integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  if not exists (
    select 1 from public.search_index_settings
    where organization_id=p_organization_id
      and indexing_enabled=false
  ) then
    return jsonb_build_object('ok',false,'reason','indexing_must_be_disabled');
  end if;

  v_feature_limit := greatest(1,floor(v_max/2.0)::integer);
  v_prediction_limit := greatest(0,v_max-v_feature_limit);

  for r in
    select id,feature_family,revision
    from public.event_intelligence_feature_state
    where organization_id=p_organization_id
    order by observed_at desc,updated_at desc
    limit v_feature_limit
  loop
    perform public.enqueue_event_intelligence_search_v1(
      p_organization_id,'event_feature',r.id,'upsert',
      jsonb_build_object(
        'seed','pilot_v1',
        'pilot_scope','event_intelligence_v1',
        'feature_family',r.feature_family,
        'feature_revision',r.revision
      )
    );
    v_features:=v_features+1;
  end loop;

  for r in
    select id,prediction_type,model_mode
    from public.event_intelligence_predictions
    where organization_id=p_organization_id
      and status='active'
    order by generated_at desc,created_at desc
    limit v_prediction_limit
  loop
    perform public.enqueue_event_intelligence_search_v1(
      p_organization_id,'event_prediction',r.id,'upsert',
      jsonb_build_object(
        'seed','pilot_v1',
        'pilot_scope','event_intelligence_v1',
        'prediction_type',r.prediction_type,
        'model_mode',r.model_mode
      )
    );
    v_predictions:=v_predictions+1;
  end loop;

  return jsonb_build_object(
    'ok',true,
    'organization_id',p_organization_id,
    'indexing_enabled',false,
    'features_staged',v_features,
    'predictions_staged',v_predictions,
    'total_staged',v_features+v_predictions
  );
end;
$function$;

revoke all on function public.stage_event_intelligence_search_sample_v1(uuid,integer)
  from public, anon, authenticated;
grant execute on function public.stage_event_intelligence_search_sample_v1(uuid,integer)
  to service_role;

commit;
