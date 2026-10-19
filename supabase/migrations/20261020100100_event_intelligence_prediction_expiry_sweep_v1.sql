begin;

-- Keep the active prediction surface time-correct between refreshes.
-- The previous freshness migration rejects stale replacements, but an already
-- active prediction can naturally cross its expires_at later. This sweep runs
-- at the start of every prediction refresh and also performs a one-time cleanup
-- when this migration is applied.

create or replace function public.expire_event_intelligence_predictions_v1(
  p_organization_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public,pg_temp
as $function$
declare
  v_expired integer := 0;
begin
  if p_organization_id is null then raise exception 'organization_id is required'; end if;

  update public.event_intelligence_predictions p
  set status='expired',updated_at=now()
  where p.organization_id=p_organization_id
    and p.status='active'
    and (
      (p.expires_at is not null and p.expires_at<=now())
      or exists (
        select 1
        from public.event_intelligence_feature_state f
        where f.id=p.feature_state_id
          and f.organization_id=p.organization_id
          and (
            f.observed_at is null
            or f.observed_at>p.generated_at+interval '5 minutes'
            or (
              public.event_intelligence_prediction_max_feature_age_v1(p.prediction_type) is not null
              and p.generated_at-f.observed_at>public.event_intelligence_prediction_max_feature_age_v1(p.prediction_type)
            )
          )
      )
    );

  get diagnostics v_expired = row_count;
  return v_expired;
end;
$function$;

-- Preserve the freshness-aware implementation from the previous migration as
-- an internal callable, then keep the public function name as a sweeping wrapper.
alter function public.refresh_event_intelligence_predictions_v1(uuid,integer)
  rename to refresh_event_intelligence_predictions_freshness_inner_v1;

create or replace function public.refresh_event_intelligence_predictions_v1(
  p_organization_id uuid,
  p_limit_per_family integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = public,pg_temp
as $function$
declare
  v_expired_before integer := 0;
  v_result jsonb;
begin
  v_expired_before := public.expire_event_intelligence_predictions_v1(p_organization_id);
  v_result := public.refresh_event_intelligence_predictions_freshness_inner_v1(
    p_organization_id,
    p_limit_per_family
  );

  return coalesce(v_result,'{}'::jsonb) || jsonb_build_object(
    'expired_before_refresh',v_expired_before,
    'active_expiry_sweep',true
  );
end;
$function$;

-- One-time cleanup for every tenant. This includes active rows whose expires_at
-- has already elapsed even when their feature_state_id is NULL.
do $block$
declare
  r record;
begin
  for r in select id from public.organizations loop
    perform public.expire_event_intelligence_predictions_v1(r.id);
  end loop;
end;
$block$;

revoke all on function public.expire_event_intelligence_predictions_v1(uuid) from public,anon,authenticated;
revoke all on function public.refresh_event_intelligence_predictions_freshness_inner_v1(uuid,integer) from public,anon,authenticated;
revoke all on function public.refresh_event_intelligence_predictions_v1(uuid,integer) from public,anon,authenticated;

grant execute on function public.expire_event_intelligence_predictions_v1(uuid) to service_role;
grant execute on function public.refresh_event_intelligence_predictions_freshness_inner_v1(uuid,integer) to service_role;
grant execute on function public.refresh_event_intelligence_predictions_v1(uuid,integer) to service_role;

commit;
