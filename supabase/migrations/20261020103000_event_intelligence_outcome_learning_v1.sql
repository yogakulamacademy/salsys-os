begin;

-- ============================================================
-- EVENT INTELLIGENCE REALIZED OUTCOME LEARNING V1
--
-- This checkpoint closes the first honest prediction -> realized outcome loop.
-- It deliberately keeps deterministic ranking scores separate from calibrated
-- probabilities. No accuracy percentage is manufactured from sparse evidence.
-- ============================================================

create or replace function public.event_intelligence_outcome_horizon_v1(
  p_prediction_type text
)
returns interval
language sql
immutable
set search_path = public,pg_temp
as $function$
  select case lower(btrim(coalesce(p_prediction_type,'')))
    when 'session_conversion_intent' then interval '30 days'
    when 'lead_conversion_probability' then interval '30 days'
    when 'traffic_decline_risk' then interval '14 days'
    when 'seo_growth_opportunity' then interval '30 days'
    when 'paid_attribution_gap_risk' then interval '14 days'
    when 'paid_lead_quality' then interval '30 days'
    else null::interval
  end;
$function$;

create or replace function public.observe_session_conversion_intent_outcomes_v1(
  p_organization_id uuid,
  p_limit integer default 1000
)
returns jsonb
language plpgsql
security definer
set search_path = public,pg_temp
as $function$
declare
  r record;
  v_outcome_id uuid;
  v_positive integer := 0;
  v_negative integer := 0;
  v_pending integer := 0;
  v_identity_unresolved integer := 0;
  v_considered integer := 0;
  v_horizon interval := public.event_intelligence_outcome_horizon_v1('session_conversion_intent');
begin
  if p_organization_id is null then raise exception 'organization_id is required'; end if;
  if not exists (select 1 from public.organizations where id=p_organization_id) then raise exception 'organization not found'; end if;

  -- Prevent concurrent observers for the same tenant from double-recording an outcome.
  perform pg_advisory_xact_lock(hashtextextended('event-intelligence-outcome-observer:' || p_organization_id::text,0));

  for r in
    select
      p.id as prediction_id,
      p.subject_id as session_id,
      p.subject_key,
      p.score,
      p.generated_at,
      p.model_key,
      p.model_version,
      ws.lead_id,
      ws.anonymous_visitor_id,
      ws.started_at as session_started_at,
      cf.conversion_type,
      cf.conversion_at,
      cf.source_table as conversion_source_table,
      cf.source_id as conversion_source_id,
      cf.amount as conversion_amount,
      cf.currency as conversion_currency
    from public.event_intelligence_predictions p
    join public.web_sessions ws
      on ws.organization_id=p.organization_id
     and ws.id=p.subject_id
    left join lateral (
      select
        f.conversion_type,
        f.conversion_at,
        f.source_table,
        f.source_id,
        f.amount,
        f.currency
      from public.v_lead_conversion_facts f
      where ws.lead_id is not null
        and f.organization_id=p.organization_id
        and f.lead_id=ws.lead_id
        and f.authority_level='transactional'
        and f.conversion_type in ('payment_success','enrollment_confirmed')
        and f.conversion_at>p.generated_at
        and f.conversion_at<=p.generated_at+v_horizon
      order by f.conversion_at asc,f.source_id asc
      limit 1
    ) cf on true
    where p.organization_id=p_organization_id
      and p.prediction_type='session_conversion_intent'
      and p.subject_type='session'
      and p.subject_id is not null
      and p.model_mode='deterministic'
      -- Only learn from predictions created under the explicit freshness contract.
      -- Historical stale predictions are preserved for audit but not back-labeled.
      and p.evidence ? 'feature_freshness'
      and not exists (
        select 1
        from public.event_intelligence_prediction_outcomes o
        where o.organization_id=p.organization_id
          and o.prediction_id=p.id
      )
    order by p.generated_at asc,p.id asc
    limit greatest(1,least(coalesce(p_limit,1000),10000))
  loop
    v_considered := v_considered + 1;

    if r.lead_id is not null and r.conversion_at is not null then
      v_outcome_id := public.record_event_intelligence_outcome_v1(
        p_organization_id,
        r.prediction_id,
        'linked_transactional_conversion_within_30d',
        jsonb_strip_nulls(jsonb_build_object(
          'binary_outcome',1,
          'horizon_days',30,
          'outcome_observability','lead_linked_transactional',
          'conversion_type',r.conversion_type,
          'conversion_at',r.conversion_at,
          'conversion_source_table',r.conversion_source_table,
          'conversion_source_id',r.conversion_source_id,
          'amount',r.conversion_amount,
          'currency',r.conversion_currency,
          'session_id',r.session_id,
          'lead_id',r.lead_id
        )),
        r.conversion_at,
        null,
        'outcome_observer_session_conversion_v1',
        jsonb_build_object(
          'observer_version','v1',
          'prediction_type','session_conversion_intent',
          'authority_required','transactional',
          'identity_required_for_negative_label',true
        )
      );
      if v_outcome_id is not null then v_positive:=v_positive+1; end if;
      continue;
    end if;

    if now()<r.generated_at+v_horizon then
      v_pending:=v_pending+1;
      continue;
    end if;

    -- Accuracy over volume: do not manufacture a negative label for an anonymous
    -- session whose eventual customer identity is unresolved. Such a row remains
    -- unlabeled rather than being treated as a non-converter.
    if r.lead_id is null then
      v_identity_unresolved:=v_identity_unresolved+1;
      continue;
    end if;

    v_outcome_id := public.record_event_intelligence_outcome_v1(
      p_organization_id,
      r.prediction_id,
      'no_linked_transactional_conversion_within_30d',
      jsonb_build_object(
        'binary_outcome',0,
        'horizon_days',30,
        'outcome_observability','lead_linked_transactional',
        'session_id',r.session_id,
        'lead_id',r.lead_id,
        'matured_at',r.generated_at+v_horizon
      ),
      r.generated_at+v_horizon,
      null,
      'outcome_observer_session_conversion_v1',
      jsonb_build_object(
        'observer_version','v1',
        'prediction_type','session_conversion_intent',
        'authority_required','transactional',
        'identity_required_for_negative_label',true
      )
    );
    if v_outcome_id is not null then v_negative:=v_negative+1; end if;
  end loop;

  return jsonb_build_object(
    'ok',true,
    'organization_id',p_organization_id,
    'prediction_type','session_conversion_intent',
    'outcome_horizon_days',30,
    'considered',v_considered,
    'positive_observed',v_positive,
    'negative_observed',v_negative,
    'pending_horizon',v_pending,
    'matured_identity_unresolved',v_identity_unresolved,
    'historical_predictions_without_freshness_contract_excluded',true,
    'anonymous_unresolved_sessions_are_not_forced_negative',true,
    'observed_at',now()
  );
end;
$function$;

create or replace view public.v_session_conversion_intent_outcome_dataset_v1
with (security_invoker = true)
as
with eligible as (
  select
    p.organization_id,
    p.id as prediction_id,
    p.subject_id as session_id,
    p.subject_key,
    p.score,
    p.generated_at,
    p.model_key,
    p.model_version,
    p.confidence_band,
    p.reason_codes,
    p.evidence,
    p.actual_outcome,
    p.actual_outcome_value,
    p.outcome_at,
    (p.actual_outcome_value->>'binary_outcome')::int as binary_outcome,
    row_number() over (
      partition by p.organization_id,p.subject_key
      order by p.generated_at desc,p.id desc
    ) as rn
  from public.event_intelligence_predictions p
  where p.prediction_type='session_conversion_intent'
    and p.model_mode='deterministic'
    and p.probability is null
    and p.actual_outcome in (
      'linked_transactional_conversion_within_30d',
      'no_linked_transactional_conversion_within_30d'
    )
    and p.actual_outcome_value ? 'binary_outcome'
    and (p.actual_outcome_value->>'binary_outcome') in ('0','1')
    and p.evidence ? 'feature_freshness'
)
select
  organization_id,
  prediction_id,
  session_id,
  subject_key,
  score,
  generated_at,
  outcome_at,
  binary_outcome,
  model_key,
  model_version,
  confidence_band,
  reason_codes,
  evidence,
  actual_outcome,
  actual_outcome_value
from eligible
where rn=1;

create or replace view public.v_session_conversion_intent_ranking_quality_v1
with (security_invoker = true)
as
with banded as (
  select
    d.*,
    case
      when d.score<0.20 then 1
      when d.score<0.40 then 2
      when d.score<0.60 then 3
      when d.score<0.80 then 4
      else 5
    end as score_band_order,
    case
      when d.score<0.20 then '0.00-0.19'
      when d.score<0.40 then '0.20-0.39'
      when d.score<0.60 then '0.40-0.59'
      when d.score<0.80 then '0.60-0.79'
      else '0.80-1.00'
    end as score_band
  from public.v_session_conversion_intent_outcome_dataset_v1 d
  where d.score is not null
), baseline as (
  select organization_id,avg(binary_outcome::numeric) as baseline_conversion_rate
  from banded
  group by organization_id
)
select
  b.organization_id,
  b.score_band_order,
  b.score_band,
  count(*)::bigint as observed_predictions,
  count(*) filter (where b.binary_outcome=1)::bigint as positive_outcomes,
  count(*) filter (where b.binary_outcome=0)::bigint as negative_outcomes,
  round(avg(b.score),4) as avg_ranking_score,
  round(avg(b.binary_outcome::numeric),4) as observed_conversion_rate,
  round(base.baseline_conversion_rate,4) as baseline_conversion_rate,
  case
    when base.baseline_conversion_rate>0
      then round(avg(b.binary_outcome::numeric)/base.baseline_conversion_rate,3)
    else null
  end as lift_vs_baseline,
  now() as checked_at
from banded b
join baseline base using (organization_id)
group by b.organization_id,b.score_band_order,b.score_band,base.baseline_conversion_rate;

create or replace view public.v_session_conversion_intent_ranking_health_v1
with (security_invoker = true)
as
with totals as (
  select
    o.id as organization_id,
    count(d.prediction_id)::bigint as observed_predictions,
    count(d.prediction_id) filter (where d.binary_outcome=1)::bigint as positive_outcomes,
    count(d.prediction_id) filter (where d.binary_outcome=0)::bigint as negative_outcomes,
    avg(d.binary_outcome::numeric) as baseline_conversion_rate
  from public.organizations o
  left join public.v_session_conversion_intent_outcome_dataset_v1 d
    on d.organization_id=o.id
  group by o.id
), ordered_bands as (
  select
    q.*,
    lag(q.observed_conversion_rate) over (
      partition by q.organization_id
      order by q.score_band_order
    ) as prior_band_conversion_rate
  from public.v_session_conversion_intent_ranking_quality_v1 q
  where q.observed_predictions>=5
), monotonicity as (
  select
    organization_id,
    count(*) filter (
      where prior_band_conversion_rate is not null
        and observed_conversion_rate<prior_band_conversion_rate
    )::bigint as monotonicity_violations,
    count(*) filter (where prior_band_conversion_rate is not null)::bigint as comparable_band_steps
  from ordered_bands
  group by organization_id
)
select
  t.organization_id,
  t.observed_predictions,
  t.positive_outcomes,
  t.negative_outcomes,
  round(t.baseline_conversion_rate,4) as baseline_conversion_rate,
  coalesce(m.monotonicity_violations,0) as monotonicity_violations,
  coalesce(m.comparable_band_steps,0) as comparable_band_steps,
  case
    when t.observed_predictions<30 then 'collecting_outcomes'
    when t.positive_outcomes<5 then 'needs_positive_outcomes'
    when t.negative_outcomes<5 then 'needs_negative_outcomes'
    when coalesce(m.comparable_band_steps,0)<2 then 'needs_more_populated_score_bands'
    when coalesce(m.monotonicity_violations,0)=0 then 'early_ranking_signal_consistent'
    else 'ranking_order_needs_review'
  end as ranking_learning_status,
  case
    when t.observed_predictions<30 then 'At least 30 realized, identity-resolved outcomes are required before evaluating ranking usefulness.'
    when t.positive_outcomes<5 then 'More positive transactional conversions are required.'
    when t.negative_outcomes<5 then 'More matured negative outcomes are required.'
    when coalesce(m.comparable_band_steps,0)<2 then 'More score bands need at least five observed outcomes.'
    when coalesce(m.monotonicity_violations,0)=0 then 'Observed conversion rates are non-decreasing across sufficiently populated score bands. This is ranking evidence, not probability calibration.'
    else 'Observed conversion rates are not monotonic across sufficiently populated score bands; review rules/features before increasing automation.'
  end as ranking_learning_reason,
  false as calibrated_probability_claim,
  now() as checked_at
from totals t
left join monotonicity m using (organization_id);

create or replace view public.v_event_intelligence_probability_calibration_health_v1
with (security_invoker = true)
as
with base as (
  select
    p.organization_id,
    p.prediction_type,
    p.probability::numeric as probability,
    (p.actual_outcome_value->>'binary_outcome')::int as y,
    least(9,greatest(0,floor(p.probability*10)::int)) as calibration_bin
  from public.event_intelligence_predictions p
  where p.probability is not null
    and p.actual_outcome_value ? 'binary_outcome'
    and (p.actual_outcome_value->>'binary_outcome') in ('0','1')
), bins as (
  select
    organization_id,
    prediction_type,
    calibration_bin,
    count(*)::bigint as n,
    avg(probability) as avg_probability,
    avg(y::numeric) as observed_rate
  from base
  group by organization_id,prediction_type,calibration_bin
), metrics as (
  select
    b.organization_id,
    b.prediction_type,
    count(*)::bigint as observed_predictions,
    count(*) filter (where b.y=1)::bigint as positive_outcomes,
    count(*) filter (where b.y=0)::bigint as negative_outcomes,
    avg(power(b.probability-b.y::numeric,2)) as brier_score,
    avg(b.probability) as avg_predicted_probability,
    avg(b.y::numeric) as observed_positive_rate
  from base b
  group by b.organization_id,b.prediction_type
), ece as (
  select
    x.organization_id,
    x.prediction_type,
    sum((x.n::numeric/t.total_n::numeric)*abs(x.avg_probability-x.observed_rate)) as expected_calibration_error
  from bins x
  join (
    select organization_id,prediction_type,sum(n)::bigint as total_n
    from bins
    group by organization_id,prediction_type
  ) t using (organization_id,prediction_type)
  group by x.organization_id,x.prediction_type
), families as (
  select o.id as organization_id,p.prediction_type
  from public.organizations o
  cross join (values ('lead_conversion_probability'::text)) p(prediction_type)
)
select
  f.organization_id,
  f.prediction_type,
  coalesce(m.observed_predictions,0) as observed_predictions,
  coalesce(m.positive_outcomes,0) as positive_outcomes,
  coalesce(m.negative_outcomes,0) as negative_outcomes,
  case when coalesce(m.observed_predictions,0)>=50 and coalesce(m.positive_outcomes,0)>=10 and coalesce(m.negative_outcomes,0)>=10 then round(m.brier_score,6) else null end as brier_score,
  case when coalesce(m.observed_predictions,0)>=50 and coalesce(m.positive_outcomes,0)>=10 and coalesce(m.negative_outcomes,0)>=10 then round(e.expected_calibration_error,6) else null end as expected_calibration_error,
  case when m.avg_predicted_probability is null then null else round(m.avg_predicted_probability,4) end as avg_predicted_probability,
  case when m.observed_positive_rate is null then null else round(m.observed_positive_rate,4) end as observed_positive_rate,
  case
    when coalesce(m.observed_predictions,0)=0 then 'no_observed_probability_outcomes'
    when m.observed_predictions<50 then 'insufficient_outcomes'
    when m.positive_outcomes<10 then 'insufficient_positive_outcomes'
    when m.negative_outcomes<10 then 'insufficient_negative_outcomes'
    else 'calibration_measurement_ready'
  end as calibration_status,
  case
    when coalesce(m.observed_predictions,0)=0 then 'No realized binary outcomes exist for probability predictions.'
    when m.observed_predictions<50 then 'At least 50 observed probability predictions are required before exposing Brier/ECE metrics.'
    when m.positive_outcomes<10 or m.negative_outcomes<10 then 'Both classes need at least 10 observed outcomes before exposing calibration metrics.'
    else 'Brier score and expected calibration error are measurable. Promotion still follows model evaluation/promotion guardrails.'
  end as calibration_reason,
  now() as checked_at
from families f
left join metrics m using (organization_id,prediction_type)
left join ece e using (organization_id,prediction_type);

create or replace view public.v_event_intelligence_outcome_learning_health_v1
with (security_invoker = true)
as
select
  o.id as organization_id,
  r.observed_predictions as session_ranking_observed_predictions,
  r.positive_outcomes as session_ranking_positive_outcomes,
  r.negative_outcomes as session_ranking_negative_outcomes,
  r.ranking_learning_status,
  r.monotonicity_violations,
  c.observed_predictions as probability_observed_predictions,
  c.calibration_status,
  c.brier_score,
  c.expected_calibration_error,
  case
    when r.observed_predictions<30 and c.observed_predictions=0 then 'collecting_realized_outcomes'
    when r.observed_predictions>=30 and c.observed_predictions=0 then 'ranking_learning_active_probability_learning_not_started'
    when c.calibration_status='calibration_measurement_ready' then 'ranking_and_probability_learning_active'
    else 'outcome_learning_active'
  end as outcome_learning_status,
  now() as checked_at
from public.organizations o
left join public.v_session_conversion_intent_ranking_health_v1 r
  on r.organization_id=o.id
left join public.v_event_intelligence_probability_calibration_health_v1 c
  on c.organization_id=o.id
 and c.prediction_type='lead_conversion_probability';

revoke all on function public.event_intelligence_outcome_horizon_v1(text) from public,anon,authenticated;
revoke all on function public.observe_session_conversion_intent_outcomes_v1(uuid,integer) from public,anon,authenticated;
grant execute on function public.event_intelligence_outcome_horizon_v1(text) to service_role;
grant execute on function public.observe_session_conversion_intent_outcomes_v1(uuid,integer) to service_role;
grant select on public.v_session_conversion_intent_outcome_dataset_v1 to authenticated,service_role;
grant select on public.v_session_conversion_intent_ranking_quality_v1 to authenticated,service_role;
grant select on public.v_session_conversion_intent_ranking_health_v1 to authenticated,service_role;
grant select on public.v_event_intelligence_probability_calibration_health_v1 to authenticated,service_role;
grant select on public.v_event_intelligence_outcome_learning_health_v1 to authenticated,service_role;

commit;
