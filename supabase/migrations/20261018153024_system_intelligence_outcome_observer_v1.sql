begin;

create or replace function public.observe_system_intelligence_recommendation_outcomes_v1(
  p_limit integer default 50
)
returns table (
  observed_count integer,
  positive_count integer,
  negative_count integer,
  mixed_count integer,
  inconclusive_count integer
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_organization_id uuid := public.current_tenant_organization_id();
  v_recommendation record;
  v_positive_leads integer;
  v_negative_leads integer;
  v_latest_evidence_at timestamptz;
  v_outcome_class text;
  v_outcome_delta numeric;
  v_summary text;
  v_observed integer := 0;
  v_positive integer := 0;
  v_negative integer := 0;
  v_mixed integer := 0;
  v_inconclusive integer := 0;
begin
  if auth.uid() is null or v_organization_id is null then
    raise exception 'AUTHENTICATED_TENANT_REQUIRED';
  end if;

  if not public.session_is_bound_to_organization(v_organization_id)
     or not public.is_organization_member(v_organization_id) then
    raise exception 'TENANT_ACCESS_DENIED';
  end if;

  for v_recommendation in
    select r.*
    from public.system_intelligence_recommendations r
    where r.organization_id = v_organization_id
      and r.acted_at is not null
      and r.target_lead_count > 0
      and cardinality(r.target_lead_ids) > 0
      and r.acted_at <= now() - interval '15 minutes'
    order by coalesce(r.last_business_outcome_at, r.acted_at) asc
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  loop
    select
      count(*) filter (where evidence.has_positive)::integer,
      count(*) filter (where evidence.has_negative)::integer,
      max(evidence.latest_evidence_at)
    into
      v_positive_leads,
      v_negative_leads,
      v_latest_evidence_at
    from (
      select
        target.lead_id,
        (
          exists (
            select 1
            from public.payments p
            where p.organization_id = v_organization_id
              and p.lead_id = target.lead_id
              and p.status = 'paid'
              and coalesce(p.paid_at, p.updated_at, p.created_at) >= v_recommendation.acted_at
          )
          or exists (
            select 1
            from public.enrollments e
            where e.organization_id = v_organization_id
              and e.lead_id = target.lead_id
              and e.status in ('confirmed','completed')
              and coalesce(e.enrolled_at, e.updated_at, e.created_at) >= v_recommendation.acted_at
          )
          or exists (
            select 1
            from public.lead_stage_history h
            where h.lead_id = target.lead_id
              and h.changed_at >= v_recommendation.acted_at
              and h.to_stage in ('contacted','engaged','qualified','high_intent','payment_pending','enrolled')
              and (
                case h.to_stage
                  when 'contacted' then 2
                  when 'engaged' then 3
                  when 'qualified' then 4
                  when 'high_intent' then 5
                  when 'payment_pending' then 6
                  when 'enrolled' then 7
                  else 0
                end
              ) > (
                case h.from_stage
                  when 'new' then 1
                  when 'contacted' then 2
                  when 'engaged' then 3
                  when 'qualified' then 4
                  when 'high_intent' then 5
                  when 'payment_pending' then 6
                  when 'enrolled' then 7
                  else 0
                end
              )
          )
        ) as has_positive,
        (
          exists (
            select 1
            from public.lead_stage_history h
            where h.lead_id = target.lead_id
              and h.changed_at >= v_recommendation.acted_at
              and h.to_stage in ('lost','unqualified')
          )
          or exists (
            select 1
            from public.enrollments e
            where e.organization_id = v_organization_id
              and e.lead_id = target.lead_id
              and e.status = 'cancelled'
              and coalesce(e.updated_at, e.created_at) >= v_recommendation.acted_at
          )
          or exists (
            select 1
            from public.payments p
            where p.organization_id = v_organization_id
              and p.lead_id = target.lead_id
              and p.status in ('refunded','partially_refunded')
              and coalesce(p.updated_at, p.created_at) >= v_recommendation.acted_at
          )
        ) as has_negative,
        greatest(
          coalesce((
            select max(coalesce(p.paid_at, p.updated_at, p.created_at))
            from public.payments p
            where p.organization_id = v_organization_id
              and p.lead_id = target.lead_id
              and p.status in ('paid','refunded','partially_refunded')
              and coalesce(p.paid_at, p.updated_at, p.created_at) >= v_recommendation.acted_at
          ), '-infinity'::timestamptz),
          coalesce((
            select max(coalesce(e.enrolled_at, e.updated_at, e.created_at))
            from public.enrollments e
            where e.organization_id = v_organization_id
              and e.lead_id = target.lead_id
              and e.status in ('confirmed','completed','cancelled')
              and coalesce(e.enrolled_at, e.updated_at, e.created_at) >= v_recommendation.acted_at
          ), '-infinity'::timestamptz),
          coalesce((
            select max(h.changed_at)
            from public.lead_stage_history h
            where h.lead_id = target.lead_id
              and h.changed_at >= v_recommendation.acted_at
              and h.to_stage in ('contacted','engaged','qualified','high_intent','payment_pending','enrolled','lost','unqualified')
          ), '-infinity'::timestamptz)
        ) as latest_evidence_at
      from unnest(v_recommendation.target_lead_ids) as target(lead_id)
    ) evidence;

    if v_latest_evidence_at = '-infinity'::timestamptz then
      v_latest_evidence_at := null;
    end if;

    if v_latest_evidence_at is not null
       and v_recommendation.last_business_outcome_at is not null
       and v_latest_evidence_at <= v_recommendation.last_business_outcome_at then
      continue;
    end if;

    if coalesce(v_positive_leads, 0) > 0 and coalesce(v_negative_leads, 0) > 0 then
      v_outcome_class := 'mixed';
    elsif coalesce(v_positive_leads, 0) > 0 then
      v_outcome_class := 'positive';
    elsif coalesce(v_negative_leads, 0) > 0 then
      v_outcome_class := 'negative';
    elsif now() >= v_recommendation.acted_at + interval '72 hours'
          and v_recommendation.last_business_outcome_at is null then
      v_outcome_class := 'inconclusive';
    else
      continue;
    end if;

    v_outcome_delta := coalesce(v_positive_leads, 0) - coalesce(v_negative_leads, 0);
    v_summary := left(
      format(
        'After action start, %s target lead(s) showed positive downstream movement and %s showed negative downstream movement. This is temporal outcome evidence, not causal attribution.',
        coalesce(v_positive_leads, 0),
        coalesce(v_negative_leads, 0)
      ),
      800
    );

    insert into public.system_intelligence_recommendation_events (
      organization_id,
      recommendation_id,
      event_type,
      actor_user_id,
      outcome_class,
      outcome_metric,
      outcome_delta,
      note
    ) values (
      v_organization_id,
      v_recommendation.id,
      'outcome_observed',
      null,
      v_outcome_class,
      'target_lead_business_outcome',
      v_outcome_delta,
      left(v_summary, 500)
    );

    update public.system_intelligence_recommendations
    set
      last_outcome_at = now(),
      last_outcome_class = v_outcome_class,
      last_outcome_value = v_outcome_delta,
      last_business_outcome_at = now(),
      last_business_outcome_class = v_outcome_class,
      last_business_outcome_summary = v_summary,
      updated_at = now()
    where id = v_recommendation.id
      and organization_id = v_organization_id;

    v_observed := v_observed + 1;
    if v_outcome_class = 'positive' then v_positive := v_positive + 1; end if;
    if v_outcome_class = 'negative' then v_negative := v_negative + 1; end if;
    if v_outcome_class = 'mixed' then v_mixed := v_mixed + 1; end if;
    if v_outcome_class = 'inconclusive' then v_inconclusive := v_inconclusive + 1; end if;
  end loop;

  return query
  select v_observed, v_positive, v_negative, v_mixed, v_inconclusive;
end;
$$;

revoke all on function public.observe_system_intelligence_recommendation_outcomes_v1(integer) from public, anon;
grant execute on function public.observe_system_intelligence_recommendation_outcomes_v1(integer) to authenticated;

comment on function public.observe_system_intelligence_recommendation_outcomes_v1(integer)
is 'Tenant-safe observer that records temporally associated downstream lead outcomes for acted System Intelligence recommendations without claiming causal attribution.';

commit;