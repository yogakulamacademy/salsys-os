begin;

create or replace function public.get_system_intelligence_recommendation_calibration_v1()
returns table (
  signal_id text,
  role_scope text,
  category text,
  sample_band text,
  outcome_observed_count bigint,
  positive_count bigint,
  negative_count bigint,
  mixed_count bigint,
  inconclusive_count bigint,
  resolved_count bigint,
  net_evidence_rate numeric,
  calibration_ready boolean,
  calibration_points integer,
  max_adjustment_points integer,
  calibration_reason text
)
language sql
security invoker
set search_path = public
as $$
  with effectiveness as (
    select *
    from public.get_system_intelligence_recommendation_effectiveness_v1()
  ), prepared as (
    select
      e.*,
      (e.positive_count + e.negative_count + e.mixed_count)::bigint as resolved_count,
      case
        when (e.positive_count + e.negative_count + e.mixed_count) = 0 then 0::numeric
        else round(
          (e.positive_count - e.negative_count)::numeric /
          (e.positive_count + e.negative_count + e.mixed_count)::numeric,
          4
        )
      end as net_evidence_rate,
      case
        when e.sample_band = 'mature'
          and e.outcome_observed_count >= 50
          and (e.positive_count + e.negative_count + e.mixed_count) >= 25 then 5
        when e.sample_band = 'established'
          and e.outcome_observed_count >= 20
          and (e.positive_count + e.negative_count + e.mixed_count) >= 10 then 3
        else 0
      end as adjustment_cap
    from effectiveness e
  )
  select
    p.signal_id,
    p.role_scope,
    p.category,
    p.sample_band,
    p.outcome_observed_count,
    p.positive_count,
    p.negative_count,
    p.mixed_count,
    p.inconclusive_count,
    p.resolved_count,
    p.net_evidence_rate,
    (p.adjustment_cap > 0) as calibration_ready,
    case
      when p.adjustment_cap = 0 then 0
      else round(
        greatest(
          -p.adjustment_cap::numeric,
          least(p.adjustment_cap::numeric, p.net_evidence_rate * p.adjustment_cap::numeric)
        )
      )::integer
    end as calibration_points,
    p.adjustment_cap as max_adjustment_points,
    case
      when p.adjustment_cap = 0 then
        format(
          'Calibration locked: %s observed outcome(s), %s resolved. Established evidence requires at least 20 observed outcomes and 10 resolved; mature evidence requires at least 50 observed and 25 resolved.',
          p.outcome_observed_count,
          p.resolved_count
        )
      else
        format(
          'Bounded calibration from temporal outcome evidence only: net evidence rate %s, capped at +/- %s ranking point(s). This does not imply causal attribution.',
          p.net_evidence_rate,
          p.adjustment_cap
        )
    end as calibration_reason
  from prepared p
  order by
    (p.adjustment_cap > 0) desc,
    p.outcome_observed_count desc,
    p.signal_id asc;
$$;

revoke all on function public.get_system_intelligence_recommendation_calibration_v1() from public, anon;
grant execute on function public.get_system_intelligence_recommendation_calibration_v1() to authenticated;

comment on function public.get_system_intelligence_recommendation_calibration_v1()
is 'Tenant-safe bounded calibration readiness derived from recommendation effectiveness. Adjustments remain tightly capped and are based on observed temporal outcomes, not causal attribution.';

commit;