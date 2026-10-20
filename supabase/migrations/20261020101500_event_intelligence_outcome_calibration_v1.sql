begin;

-- ============================================================
-- EVENT INTELLIGENCE REALIZED OUTCOME + CALIBRATION V1
--
-- Goals:
-- 1. Observe authoritative realized outcomes after predictions.
-- 2. Keep prediction rows immutable as historical model decisions.
-- 3. Evaluate true probability predictions separately from deterministic scores.
-- 4. Respect profiling restrictions during outcome evaluation.
-- 5. Measure calibration and distribution drift without claiming accuracy
--    before enough realized outcomes exist.
-- ============================================================

create unique index if not exists uq_event_intelligence_lead_resolution_v1
  on public.event_intelligence_prediction_outcomes(
    organization_id,
    prediction_id,
    outcome_key
  )
  where outcome_key='lead_conversion_resolution_v1';

create or replace function public.observe_event_intelligence_lead_outcomes_v1(
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
  v_positive record;
  v_negative record;
  v_outcome_at timestamptz;
  v_label text;
  v_binary integer;
  v_resolution_kind text;
  v_source text;
  v_source_key text;
  v_authority text;
  v_inserted integer := 0;
  v_positive_count integer := 0;
  v_negative_count integer := 0;
  v_restricted_skips integer := 0;
  v_unresolved integer := 0;
begin
  if p_organization_id is null then
    raise exception 'organization_id is required';
  end if;

  if not exists (select 1 from public.organizations where id=p_organization_id) then
    raise exception 'organization not found';
  end if;

  for r in
    select
      p.id,
      p.organization_id,
      p.subject_id as lead_id,
      p.subject_key,
      p.prediction_type,
      p.model_key,
      p.model_version,
      p.model_mode,
      p.probability,
      p.generated_at,
      q.profiling_allowed
    from public.event_intelligence_predictions p
    left join public.v_r10_lead_signal_quality_v1 q
      on q.organization_id=p.organization_id
     and q.lead_id=p.subject_id
    where p.organization_id=p_organization_id
      and p.subject_type='lead'
      and p.subject_id is not null
      and p.prediction_type='lead_conversion_probability'
      and p.probability is not null
      and not exists (
        select 1
        from public.event_intelligence_prediction_outcomes o
        where o.organization_id=p.organization_id
          and o.prediction_id=p.id
          and o.outcome_key='lead_conversion_resolution_v1'
      )
    order by p.generated_at asc,p.id asc
    limit greatest(1,least(coalesce(p_limit,1000),10000))
  loop
    if coalesce(r.profiling_allowed,false)=false then
      v_restricted_skips := v_restricted_skips + 1;
      continue;
    end if;

    select
      f.conversion_at,
      f.conversion_type,
      f.authority_level,
      f.source_table,
      f.conversion_fact_key
    into v_positive
    from public.v_lead_conversion_facts f
    where f.organization_id=p_organization_id
      and f.lead_id=r.lead_id
      and f.conversion_at>=r.generated_at
      and f.conversion_type in ('payment_success','enrollment_confirmed','crm_won')
    order by
      f.conversion_at asc,
      case when f.authority_level='transactional' then 0 else 1 end,
      f.conversion_fact_key asc
    limit 1;

    select
      h.changed_at as resolution_at,
      h.to_stage::text as terminal_stage,
      h.id as history_id
    into v_negative
    from public.lead_stage_history h
    join public.leads l
      on l.id=h.lead_id
     and l.organization_id=p_organization_id
    where h.lead_id=r.lead_id
      and h.changed_at>=r.generated_at
      and h.to_stage::text in ('lost','unqualified')
    order by h.changed_at asc,h.id asc
    limit 1;

    if v_positive.conversion_at is null and v_negative.resolution_at is null then
      v_unresolved := v_unresolved + 1;
      continue;
    end if;

    if v_positive.conversion_at is not null
       and (
         v_negative.resolution_at is null
         or v_positive.conversion_at<=v_negative.resolution_at
       ) then
      v_outcome_at := v_positive.conversion_at;
      v_label := 'positive';
      v_binary := 1;
      v_resolution_kind := v_positive.conversion_type;
      v_source := v_positive.source_table;
      v_source_key := v_positive.conversion_fact_key;
      v_authority := v_positive.authority_level;
    else
      v_outcome_at := v_negative.resolution_at;
      v_label := 'negative';
      v_binary := 0;
      v_resolution_kind := v_negative.terminal_stage;
      v_source := 'lead_stage_history';
      v_source_key := 'lead_stage_history:'||v_negative.history_id::text;
      v_authority := 'operational';
    end if;

    perform pg_advisory_xact_lock(
      hashtextextended('event-intelligence-outcome:'||p_organization_id::text||':'||r.id::text,0)
    );

    insert into public.event_intelligence_prediction_outcomes(
      organization_id,
      prediction_id,
      outcome_key,
      outcome_value,
      raw_event_id,
      occurred_at,
      source,
      metadata
    ) values (
      p_organization_id,
      r.id,
      'lead_conversion_resolution_v1',
      jsonb_build_object(
        'label',v_label,
        'binary_outcome',v_binary,
        'target_definition','first_authoritative_sales_resolution_after_prediction',
        'resolution_kind',v_resolution_kind,
        'authority_level',v_authority,
        'source_key',v_source_key
      ),
      null,
      v_outcome_at,
      'canonical_business_fact',
      jsonb_build_object(
        'source_table',v_source,
        'prediction_generated_at',r.generated_at,
        'prediction_probability',r.probability,
        'model_key',r.model_key,
        'model_version',r.model_version,
        'model_mode',r.model_mode,
        'profiling_allowed_at_observation',true
      )
    )
    on conflict do nothing;

    if found then
      v_inserted := v_inserted + 1;
      if v_binary=1 then
        v_positive_count := v_positive_count + 1;
      else
        v_negative_count := v_negative_count + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'ok',true,
    'organization_id',p_organization_id,
    'outcomes_inserted',v_inserted,
    'positive_outcomes',v_positive_count,
    'negative_outcomes',v_negative_count,
    'restricted_skips',v_restricted_skips,
    'unresolved_predictions',v_unresolved,
    'target_definition','first_authoritative_sales_resolution_after_prediction',
    'predictions_mutated',false,
    'observed_at',now()
  );
end;
$function$;

revoke all on function public.observe_event_intelligence_lead_outcomes_v1(uuid,integer)
from public,anon,authenticated;
grant execute on function public.observe_event_intelligence_lead_outcomes_v1(uuid,integer)
to service_role;

-- One row per observed probabilistic prediction. Deterministic score-only
-- predictions are deliberately excluded from probability metrics.
create or replace view public.v_event_intelligence_probability_evaluation_v1
with (security_invoker = true)
as
select
  p.organization_id,
  p.id as prediction_id,
  p.subject_type,
  p.subject_key,
  p.subject_id,
  p.prediction_type,
  p.model_key,
  p.model_version,
  p.model_mode,
  p.probability,
  p.confidence_low,
  p.confidence_high,
  p.confidence_band,
  p.generated_at,
  o.id as outcome_id,
  o.occurred_at as outcome_at,
  nullif(o.outcome_value->>'label','') as outcome_label,
  nullif(o.outcome_value->>'binary_outcome','')::integer as actual_binary,
  nullif(o.outcome_value->>'resolution_kind','') as resolution_kind,
  nullif(o.outcome_value->>'authority_level','') as authority_level,
  extract(epoch from (o.occurred_at-p.generated_at))/3600.0 as hours_to_resolution,
  (p.probability-nullif(o.outcome_value->>'binary_outcome','')::numeric) as probability_error,
  abs(p.probability-nullif(o.outcome_value->>'binary_outcome','')::numeric) as absolute_error,
  power(p.probability-nullif(o.outcome_value->>'binary_outcome','')::numeric,2) as squared_error,
  -(
    nullif(o.outcome_value->>'binary_outcome','')::numeric
      * ln(greatest(0.000001,least(0.999999,p.probability)))
    + (1-nullif(o.outcome_value->>'binary_outcome','')::numeric)
      * ln(greatest(0.000001,least(0.999999,1-p.probability)))
  ) as log_loss,
  o.metadata as outcome_metadata
from public.event_intelligence_predictions p
join public.event_intelligence_prediction_outcomes o
  on o.organization_id=p.organization_id
 and o.prediction_id=p.id
 and o.outcome_key='lead_conversion_resolution_v1'
where p.probability is not null
  and p.prediction_type='lead_conversion_probability'
  and nullif(o.outcome_value->>'binary_outcome','') in ('0','1');

create or replace view public.v_event_intelligence_calibration_bins_v1
with (security_invoker = true)
as
with bucketed as (
  select
    e.*,
    least(9,greatest(0,floor(e.probability*10)::integer)) as calibration_bin
  from public.v_event_intelligence_probability_evaluation_v1 e
)
select
  organization_id,
  prediction_type,
  model_key,
  model_version,
  model_mode,
  calibration_bin,
  (calibration_bin::numeric/10.0) as bin_lower_bound,
  ((calibration_bin+1)::numeric/10.0) as bin_upper_bound,
  count(*)::bigint as observed_predictions,
  count(*) filter (where actual_binary=1)::bigint as positive_outcomes,
  count(*) filter (where actual_binary=0)::bigint as negative_outcomes,
  round(avg(probability),6) as mean_predicted_probability,
  round(avg(actual_binary::numeric),6) as observed_outcome_rate,
  round(abs(avg(probability)-avg(actual_binary::numeric)),6) as calibration_gap,
  round(avg(squared_error),6) as brier_component,
  min(generated_at) as first_prediction_at,
  max(generated_at) as last_prediction_at,
  max(outcome_at) as latest_outcome_at
from bucketed
group by
  organization_id,prediction_type,model_key,model_version,model_mode,calibration_bin;

create or replace view public.v_event_intelligence_probability_health_v1
with (security_invoker = true)
as
with eligible as (
  select
    p.organization_id,
    p.prediction_type,
    p.model_key,
    p.model_version,
    count(*)::bigint as eligible_predictions
  from public.event_intelligence_predictions p
  join public.v_r10_lead_signal_quality_v1 q
    on q.organization_id=p.organization_id
   and q.lead_id=p.subject_id
  where p.subject_type='lead'
    and p.prediction_type='lead_conversion_probability'
    and p.probability is not null
    and q.profiling_allowed=true
  group by p.organization_id,p.prediction_type,p.model_key,p.model_version
),
observed as (
  select
    e.organization_id,
    e.prediction_type,
    e.model_key,
    e.model_version,
    count(*)::bigint as observed_predictions,
    count(*) filter (where e.actual_binary=1)::bigint as positive_outcomes,
    count(*) filter (where e.actual_binary=0)::bigint as negative_outcomes,
    avg(e.squared_error) as brier_score,
    avg(e.absolute_error) as mean_absolute_probability_error,
    avg(e.log_loss) as mean_log_loss,
    avg(e.probability) as mean_predicted_probability,
    avg(e.actual_binary::numeric) as observed_outcome_rate,
    avg(e.hours_to_resolution) as mean_hours_to_resolution,
    max(e.outcome_at) as latest_outcome_at
  from public.v_event_intelligence_probability_evaluation_v1 e
  group by e.organization_id,e.prediction_type,e.model_key,e.model_version
),
ece as (
  select
    b.organization_id,
    b.prediction_type,
    b.model_key,
    b.model_version,
    sum(b.observed_predictions*b.calibration_gap)
      / nullif(sum(b.observed_predictions),0) as expected_calibration_error
  from public.v_event_intelligence_calibration_bins_v1 b
  group by b.organization_id,b.prediction_type,b.model_key,b.model_version
)
select
  el.organization_id,
  el.prediction_type,
  el.model_key,
  el.model_version,
  el.eligible_predictions,
  coalesce(o.observed_predictions,0) as observed_predictions,
  greatest(el.eligible_predictions-coalesce(o.observed_predictions,0),0) as unresolved_predictions,
  coalesce(o.positive_outcomes,0) as positive_outcomes,
  coalesce(o.negative_outcomes,0) as negative_outcomes,
  case
    when el.eligible_predictions=0 then null
    else round(coalesce(o.observed_predictions,0)::numeric/el.eligible_predictions::numeric,6)
  end as outcome_coverage,
  round(o.brier_score,6) as brier_score,
  round(o.mean_absolute_probability_error,6) as mean_absolute_probability_error,
  round(o.mean_log_loss,6) as mean_log_loss,
  round(e.expected_calibration_error,6) as expected_calibration_error,
  round(o.mean_predicted_probability,6) as mean_predicted_probability,
  round(o.observed_outcome_rate,6) as observed_outcome_rate,
  round(o.mean_hours_to_resolution,2) as mean_hours_to_resolution,
  o.latest_outcome_at,
  100::bigint as minimum_observed_for_calibration_claim,
  20::bigint as minimum_positive_outcomes,
  20::bigint as minimum_negative_outcomes,
  (
    coalesce(o.observed_predictions,0)>=100
    and coalesce(o.positive_outcomes,0)>=20
    and coalesce(o.negative_outcomes,0)>=20
  ) as calibration_ready,
  case
    when coalesce(o.observed_predictions,0)=0 then 'collecting_outcomes'
    when coalesce(o.observed_predictions,0)<30 then 'early_sample'
    when coalesce(o.observed_predictions,0)<100
      or coalesce(o.positive_outcomes,0)<20
      or coalesce(o.negative_outcomes,0)<20 then 'directional_only'
    else 'measurable'
  end as calibration_status,
  case
    when coalesce(o.observed_predictions,0)<100 then
      'Metrics are observational only; sample is too small for an accuracy claim.'
    when coalesce(o.positive_outcomes,0)<20 or coalesce(o.negative_outcomes,0)<20 then
      'Metrics are observational only; outcome classes are not sufficiently represented.'
    else
      'Calibration metrics are measurable; they still require ongoing drift monitoring and external validation.'
  end as interpretation
from eligible el
left join observed o
  on o.organization_id=el.organization_id
 and o.prediction_type=el.prediction_type
 and o.model_key=el.model_key
 and o.model_version=el.model_version
left join ece e
  on e.organization_id=el.organization_id
 and e.prediction_type=el.prediction_type
 and e.model_key=el.model_key
 and e.model_version=el.model_version;

-- Population Stability Index over predicted probabilities. This is a
-- distribution-shift warning, not a model-performance or causality claim.
create or replace view public.v_event_intelligence_probability_drift_v1
with (security_invoker = true)
as
with scoped as (
  select
    p.organization_id,
    p.prediction_type,
    p.model_key,
    p.model_version,
    p.generated_at,
    least(9,greatest(0,floor(p.probability*10)::integer)) as probability_bin,
    case
      when p.generated_at>=now()-interval '30 days' then 'current'
      when p.generated_at>=now()-interval '120 days'
       and p.generated_at<now()-interval '30 days' then 'baseline'
      else null
    end as cohort
  from public.event_intelligence_predictions p
  join public.v_r10_lead_signal_quality_v1 q
    on q.organization_id=p.organization_id
   and q.lead_id=p.subject_id
  where p.subject_type='lead'
    and p.prediction_type='lead_conversion_probability'
    and p.probability is not null
    and q.profiling_allowed=true
    and p.generated_at>=now()-interval '120 days'
),
counts as (
  select
    organization_id,prediction_type,model_key,model_version,probability_bin,cohort,
    count(*)::numeric as n
  from scoped
  where cohort is not null
  group by organization_id,prediction_type,model_key,model_version,probability_bin,cohort
),
totals as (
  select
    organization_id,prediction_type,model_key,model_version,cohort,
    sum(n)::numeric as total_n
  from counts
  group by organization_id,prediction_type,model_key,model_version,cohort
),
models as (
  select distinct organization_id,prediction_type,model_key,model_version
  from scoped
),
bins as (
  select generate_series(0,9) as probability_bin
),
shares as (
  select
    m.organization_id,m.prediction_type,m.model_key,m.model_version,b.probability_bin,
    coalesce(cc.n,0) as current_n,
    coalesce(cb.n,0) as baseline_n,
    coalesce(tc.total_n,0) as current_total,
    coalesce(tb.total_n,0) as baseline_total,
    case when coalesce(tc.total_n,0)>0 then coalesce(cc.n,0)/tc.total_n else 0 end as current_share,
    case when coalesce(tb.total_n,0)>0 then coalesce(cb.n,0)/tb.total_n else 0 end as baseline_share
  from models m
  cross join bins b
  left join counts cc
    on cc.organization_id=m.organization_id
   and cc.prediction_type=m.prediction_type
   and cc.model_key=m.model_key
   and cc.model_version=m.model_version
   and cc.probability_bin=b.probability_bin
   and cc.cohort='current'
  left join counts cb
    on cb.organization_id=m.organization_id
   and cb.prediction_type=m.prediction_type
   and cb.model_key=m.model_key
   and cb.model_version=m.model_version
   and cb.probability_bin=b.probability_bin
   and cb.cohort='baseline'
  left join totals tc
    on tc.organization_id=m.organization_id
   and tc.prediction_type=m.prediction_type
   and tc.model_key=m.model_key
   and tc.model_version=m.model_version
   and tc.cohort='current'
  left join totals tb
    on tb.organization_id=m.organization_id
   and tb.prediction_type=m.prediction_type
   and tb.model_key=m.model_key
   and tb.model_version=m.model_version
   and tb.cohort='baseline'
),
psi as (
  select
    organization_id,prediction_type,model_key,model_version,
    max(current_total)::bigint as current_predictions_30d,
    max(baseline_total)::bigint as baseline_predictions_prior_90d,
    sum(
      (greatest(current_share,0.0001)-greatest(baseline_share,0.0001))
      * ln(greatest(current_share,0.0001)/greatest(baseline_share,0.0001))
    ) as population_stability_index
  from shares
  group by organization_id,prediction_type,model_key,model_version
)
select
  organization_id,prediction_type,model_key,model_version,
  current_predictions_30d,
  baseline_predictions_prior_90d,
  round(population_stability_index,6) as population_stability_index,
  (current_predictions_30d>=30 and baseline_predictions_prior_90d>=50) as drift_measurable,
  case
    when current_predictions_30d<30 or baseline_predictions_prior_90d<50 then 'insufficient_sample'
    when population_stability_index<0.10 then 'stable'
    when population_stability_index<0.25 then 'watch'
    else 'material_shift'
  end as drift_status,
  'PSI measures prediction-distribution shift; it does not prove model accuracy or causality.'::text as interpretation
from psi;

revoke all on public.v_event_intelligence_probability_evaluation_v1 from public,anon;
revoke all on public.v_event_intelligence_calibration_bins_v1 from public,anon;
revoke all on public.v_event_intelligence_probability_health_v1 from public,anon;
revoke all on public.v_event_intelligence_probability_drift_v1 from public,anon;

grant select on public.v_event_intelligence_probability_evaluation_v1 to authenticated,service_role;
grant select on public.v_event_intelligence_calibration_bins_v1 to authenticated,service_role;
grant select on public.v_event_intelligence_probability_health_v1 to authenticated,service_role;
grant select on public.v_event_intelligence_probability_drift_v1 to authenticated,service_role;

commit;
