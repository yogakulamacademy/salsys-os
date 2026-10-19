begin;

-- A feature may be fresh when a prediction is generated but become stale before
-- the requested prediction TTL ends. Cap prediction lifetime at the feature's
-- own freshness deadline and evaluate active-health against CURRENT evidence age.

create or replace function public.record_event_intelligence_prediction_v1(
  p_organization_id uuid,
  p_subject_type text,
  p_subject_key text,
  p_subject_id uuid,
  p_prediction_type text,
  p_model_key text,
  p_model_version text,
  p_model_mode text,
  p_feature_state_id uuid,
  p_score numeric,
  p_probability numeric,
  p_confidence_low numeric,
  p_confidence_high numeric,
  p_confidence_band text,
  p_reason_codes text[],
  p_explanation jsonb,
  p_evidence jsonb,
  p_generated_at timestamptz default now(),
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public,pg_temp
as $function$
declare
  v_id uuid;
  v_feature_observed_at timestamptz;
  v_max_feature_age interval;
  v_generated_at timestamptz := coalesce(p_generated_at,now());
  v_expires_at timestamptz := p_expires_at;
  v_feature_fresh_until timestamptz;
  v_feature_age_seconds numeric;
  v_remaining_fresh_seconds numeric;
  v_evidence jsonb := coalesce(p_evidence,'{}'::jsonb);
begin
  if p_organization_id is null then raise exception 'organization_id is required'; end if;
  if nullif(btrim(coalesce(p_subject_type,'')),'') is null or nullif(btrim(coalesce(p_subject_key,'')),'') is null then raise exception 'prediction subject is required'; end if;
  if nullif(btrim(coalesce(p_prediction_type,'')),'') is null then raise exception 'prediction_type is required'; end if;
  if p_model_mode not in ('deterministic','statistical','ml','ai_synthesis') then raise exception 'invalid model_mode'; end if;

  if v_expires_at is not null and v_expires_at <= v_generated_at then
    return null;
  end if;

  if p_feature_state_id is not null then
    select observed_at
      into v_feature_observed_at
    from public.event_intelligence_feature_state
    where id=p_feature_state_id
      and organization_id=p_organization_id;

    if not found then raise exception 'feature_state tenant mismatch'; end if;

    v_max_feature_age := public.event_intelligence_prediction_max_feature_age_v1(p_prediction_type);

    if v_feature_observed_at is null then
      return null;
    end if;

    if v_feature_observed_at > v_generated_at + interval '5 minutes' then
      return null;
    end if;

    v_feature_age_seconds := greatest(0,extract(epoch from (v_generated_at-v_feature_observed_at)));

    if v_max_feature_age is not null then
      v_feature_fresh_until := v_feature_observed_at + v_max_feature_age;

      if v_feature_fresh_until <= v_generated_at then
        return null;
      end if;

      if v_expires_at is null or v_expires_at > v_feature_fresh_until then
        v_expires_at := v_feature_fresh_until;
      end if;

      v_remaining_fresh_seconds := greatest(0,extract(epoch from (v_feature_fresh_until-v_generated_at)));
    end if;

    if v_expires_at is not null and v_expires_at <= v_generated_at then
      return null;
    end if;

    v_evidence := v_evidence || jsonb_build_object(
      'feature_freshness',jsonb_strip_nulls(jsonb_build_object(
        'feature_observed_at',v_feature_observed_at,
        'prediction_generated_at',v_generated_at,
        'feature_age_seconds',round(v_feature_age_seconds),
        'max_feature_age_seconds',case when v_max_feature_age is null then null else extract(epoch from v_max_feature_age)::bigint end,
        'feature_fresh_until',v_feature_fresh_until,
        'remaining_fresh_seconds_at_generation',case when v_remaining_fresh_seconds is null then null else round(v_remaining_fresh_seconds) end,
        'prediction_expires_at',v_expires_at,
        'fresh',true
      ))
    );
  end if;

  update public.event_intelligence_predictions
  set status='superseded',updated_at=now()
  where organization_id=p_organization_id
    and subject_type=lower(btrim(p_subject_type))
    and subject_key=btrim(p_subject_key)
    and prediction_type=lower(btrim(p_prediction_type))
    and model_key=btrim(p_model_key)
    and status='active';

  insert into public.event_intelligence_predictions(
    organization_id,subject_type,subject_key,subject_id,prediction_type,model_key,model_version,model_mode,feature_state_id,score,probability,
    confidence_low,confidence_high,confidence_band,reason_codes,explanation,evidence,status,generated_at,expires_at
  ) values (
    p_organization_id,lower(btrim(p_subject_type)),btrim(p_subject_key),p_subject_id,lower(btrim(p_prediction_type)),btrim(p_model_key),btrim(p_model_version),p_model_mode,
    p_feature_state_id,p_score,p_probability,p_confidence_low,p_confidence_high,nullif(btrim(coalesce(p_confidence_band,'')),''),coalesce(p_reason_codes,'{}'::text[]),
    coalesce(p_explanation,'{}'::jsonb),v_evidence,'active',v_generated_at,v_expires_at
  ) returning id into v_id;

  return v_id;
end;
$function$;

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
            or f.observed_at>now()+interval '5 minutes'
            or (
              public.event_intelligence_prediction_max_feature_age_v1(p.prediction_type) is not null
              and now()-f.observed_at>public.event_intelligence_prediction_max_feature_age_v1(p.prediction_type)
            )
          )
      )
    );

  get diagnostics v_expired = row_count;
  return v_expired;
end;
$function$;

-- Re-run the sweep using action-time freshness after replacing the function.
do $block$
declare
  r record;
begin
  for r in select id from public.organizations loop
    perform public.expire_event_intelligence_predictions_v1(r.id);
  end loop;
end;
$block$;

create or replace view public.v_event_intelligence_prediction_freshness_health_v1
with (security_invoker = true)
as
with base as (
  select
    p.organization_id,
    p.prediction_type,
    p.status,
    p.generated_at,
    p.expires_at,
    f.observed_at as feature_observed_at,
    public.event_intelligence_prediction_max_feature_age_v1(p.prediction_type) as max_feature_age,
    case
      when f.id is null or f.observed_at is null then null
      else greatest(0,extract(epoch from (now()-f.observed_at)))
    end as current_feature_age_seconds,
    case
      when p.status<>'active' then false
      when p.expires_at is not null and p.expires_at<=now() then true
      when f.id is null then false
      when f.observed_at is null then true
      when f.observed_at>now()+interval '5 minutes' then true
      when public.event_intelligence_prediction_max_feature_age_v1(p.prediction_type) is not null
       and now()-f.observed_at>public.event_intelligence_prediction_max_feature_age_v1(p.prediction_type) then true
      else false
    end as stale_active
  from public.event_intelligence_predictions p
  left join public.event_intelligence_feature_state f
    on f.id=p.feature_state_id
   and f.organization_id=p.organization_id
)
select
  organization_id,
  prediction_type,
  count(*)::bigint as total_predictions,
  count(*) filter (where status='active')::bigint as active_predictions,
  count(*) filter (where status='active' and not stale_active)::bigint as fresh_active_predictions,
  count(*) filter (where stale_active)::bigint as stale_active_predictions,
  count(*) filter (where status='expired')::bigint as expired_predictions,
  count(*) filter (where status='observed')::bigint as observed_predictions,
  round(avg(current_feature_age_seconds) filter (where status='active' and current_feature_age_seconds is not null)::numeric,2) as avg_active_feature_age_seconds,
  round(max(current_feature_age_seconds) filter (where status='active' and current_feature_age_seconds is not null)::numeric,2) as max_active_feature_age_seconds,
  extract(epoch from max(max_feature_age))::bigint as configured_max_feature_age_seconds,
  case
    when count(*) filter (where stale_active)>0 then 'stale_active_predictions_present'
    when count(*) filter (where status='active')=0 then 'no_active_predictions'
    else 'healthy'
  end as freshness_status,
  now() as checked_at
from base
group by organization_id,prediction_type;

revoke all on function public.record_event_intelligence_prediction_v1(uuid,text,text,uuid,text,text,text,text,uuid,numeric,numeric,numeric,numeric,text,text[],jsonb,jsonb,timestamptz,timestamptz) from public,anon,authenticated;
revoke all on function public.expire_event_intelligence_predictions_v1(uuid) from public,anon,authenticated;
grant execute on function public.record_event_intelligence_prediction_v1(uuid,text,text,uuid,text,text,text,text,uuid,numeric,numeric,numeric,numeric,text,text[],jsonb,jsonb,timestamptz,timestamptz) to service_role;
grant execute on function public.expire_event_intelligence_predictions_v1(uuid) to service_role;
grant select on public.v_event_intelligence_prediction_freshness_health_v1 to authenticated,service_role;

commit;
