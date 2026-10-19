begin;

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
      and pilot_mode_enabled=true
  ) then
    return jsonb_build_object('ok',false,'reason','controlled_pilot_must_be_staged_and_indexing_disabled');
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

  update public.search_index_settings
  set pilot_seeded_at=case when v_features+v_predictions>0 then now() else pilot_seeded_at end,
      updated_at=now()
  where organization_id=p_organization_id;

  return jsonb_build_object(
    'ok',true,
    'organization_id',p_organization_id,
    'indexing_enabled',false,
    'pilot_seeded',v_features+v_predictions>0,
    'features_staged',v_features,
    'predictions_staged',v_predictions,
    'total_staged',v_features+v_predictions
  );
end;
$function$;

revoke all on function public.stage_event_intelligence_search_sample_v1(uuid,integer)
  from public,anon,authenticated;
grant execute on function public.stage_event_intelligence_search_sample_v1(uuid,integer)
  to service_role;

commit;
