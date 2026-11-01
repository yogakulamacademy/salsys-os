begin;

create or replace function public.get_system_intelligence_recommendation_effectiveness_v1()
returns table (
  signal_id text,
  role_scope text,
  category text,
  recommendation_count bigint,
  shown_count bigint,
  accepted_count bigint,
  dismissed_count bigint,
  acted_count bigint,
  outcome_observed_count bigint,
  positive_count bigint,
  negative_count bigint,
  mixed_count bigint,
  inconclusive_count bigint,
  action_rate numeric,
  positive_resolved_rate numeric,
  negative_resolved_rate numeric,
  sample_band text
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_organization_id uuid := public.current_tenant_organization_id();
begin
  if auth.uid() is null or v_organization_id is null then
    raise exception 'AUTHENTICATED_TENANT_REQUIRED';
  end if;

  if not public.session_is_bound_to_organization(v_organization_id)
     or not public.is_organization_member(v_organization_id) then
    raise exception 'TENANT_ACCESS_DENIED';
  end if;

  return query
  with grouped as (
    select
      r.signal_id,
      r.role_scope,
      r.category,
      count(*)::bigint as recommendation_count,
      coalesce(sum(r.shown_count), 0)::bigint as shown_count,
      count(*) filter (where r.accepted_at is not null)::bigint as accepted_count,
      count(*) filter (where r.dismissed_at is not null)::bigint as dismissed_count,
      count(*) filter (where r.acted_at is not null)::bigint as acted_count,
      count(*) filter (where r.last_business_outcome_class is not null)::bigint as outcome_observed_count,
      count(*) filter (where r.last_business_outcome_class = 'positive')::bigint as positive_count,
      count(*) filter (where r.last_business_outcome_class = 'negative')::bigint as negative_count,
      count(*) filter (where r.last_business_outcome_class = 'mixed')::bigint as mixed_count,
      count(*) filter (where r.last_business_outcome_class = 'inconclusive')::bigint as inconclusive_count
    from public.system_intelligence_recommendations r
    where r.organization_id = v_organization_id
      and r.source_version = 'v2'
    group by r.signal_id, r.role_scope, r.category
  ), scored as (
    select
      g.*,
      (g.positive_count + g.negative_count + g.mixed_count) as resolved_count
    from grouped g
  )
  select
    s.signal_id,
    s.role_scope,
    s.category,
    s.recommendation_count,
    s.shown_count,
    s.accepted_count,
    s.dismissed_count,
    s.acted_count,
    s.outcome_observed_count,
    s.positive_count,
    s.negative_count,
    s.mixed_count,
    s.inconclusive_count,
    case
      when s.recommendation_count = 0 then null
      else round(s.acted_count::numeric / s.recommendation_count::numeric, 4)
    end as action_rate,
    case
      when s.resolved_count = 0 then null
      else round(s.positive_count::numeric / s.resolved_count::numeric, 4)
    end as positive_resolved_rate,
    case
      when s.resolved_count = 0 then null
      else round(s.negative_count::numeric / s.resolved_count::numeric, 4)
    end as negative_resolved_rate,
    case
      when s.outcome_observed_count < 5 then 'insufficient'
      when s.outcome_observed_count < 20 then 'emerging'
      when s.outcome_observed_count < 50 then 'established'
      else 'mature'
    end as sample_band
  from scored s
  order by
    s.outcome_observed_count desc,
    s.acted_count desc,
    s.shown_count desc,
    s.signal_id asc;
end;
$$;

revoke all on function public.get_system_intelligence_recommendation_effectiveness_v1() from public, anon;
grant execute on function public.get_system_intelligence_recommendation_effectiveness_v1() to authenticated;

comment on function public.get_system_intelligence_recommendation_effectiveness_v1()
is 'Tenant-safe recommendation effectiveness summary grouped by signal and role. Rates summarize observed operating history only and do not imply causal impact.';

commit;