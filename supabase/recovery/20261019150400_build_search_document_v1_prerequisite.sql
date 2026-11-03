-- Cold-recovery compatibility only.
--
-- Production's event-intelligence OpenSearch projection (20261019150500)
-- assumes a mature build_search_document_v1(uuid,text,uuid) already exists and
-- renames it to build_search_document_legacy_v1 before installing its router.
-- That mature pre-router builder was created/evolved out-of-band from the Git
-- history now available. This recovery prerequisite reconstructs the exact
-- current legacy body under its historical pre-router name so the authoritative
-- 20261019150500 migration can perform the rename itself.
--
-- CI only. Never apply this recovery file directly to current production.

begin;

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
declare
  v_doc jsonb;
begin
  if p_entity_type not in ('seo_competitor','seo_rank_target','seo_competitor_analysis') then
    return public.build_search_document_competitor_base_v1(
      p_organization_id,
      p_entity_type,
      p_entity_id
    );
  end if;

  if p_entity_type='seo_competitor' then
    select jsonb_strip_nulls(jsonb_build_object(
      'organization_id',c.organization_id,
      'entity_type','seo_competitor',
      'entity_id',c.id,
      'competitor_domain',c.domain,
      'competitor_name',c.display_name,
      'competitor_type',c.competitor_type,
      'competitor_source',c.source,
      'competitor_active',c.is_active,
      'created_at',c.created_at,
      'updated_at',c.updated_at
    )) into v_doc
    from public.seo_competitors c
    where c.organization_id=p_organization_id
      and c.id=p_entity_id
      and c.is_active=true;

  elsif p_entity_type='seo_rank_target' then
    select jsonb_strip_nulls(jsonb_build_object(
      'organization_id',t.organization_id,
      'entity_type','seo_rank_target',
      'entity_id',t.id,
      'site_id',t.site_id,
      'rank_query',t.query,
      'rank_surface',t.surface,
      'rank_locale',t.locale,
      'rank_country_code',t.country_code,
      'rank_device',t.device,
      'rank_engine',t.engine,
      'rank_priority',t.priority,
      'rank_check_interval_minutes',t.check_interval_minutes,
      'rank_last_checked_at',t.last_checked_at,
      'rank_next_check_at',t.next_check_at,
      'rank_failure_count',t.failure_count,
      'rank_last_error_category',t.last_error_category,
      'rank_own_position',s.own_position,
      'rank_own_url',s.own_url,
      'rank_own_title',s.own_title,
      'rank_answer_visibility',s.answer_visibility,
      'rank_ai_cited',s.ai_cited,
      'rank_ai_citation_position',s.ai_citation_position,
      'rank_ai_provider',s.ai_provider,
      'rank_source_provider',s.source_provider,
      'rank_observed_at',s.observed_at,
      'rank_competitor_count',s.competitor_count,
      'rank_competitor_domains',s.competitor_domains,
      'rank_competitor_text',s.competitor_text,
      'rank_serp_feature_text',s.serp_feature_text,
      'created_at',t.created_at,
      'updated_at',greatest(t.updated_at,coalesce(s.observed_at,t.updated_at))
    )) into v_doc
    from public.seo_rank_targets t
    left join lateral (
      select
        rs.source_provider,
        rs.own_position,
        rs.own_url,
        rs.own_title,
        rs.answer_visibility,
        rs.ai_cited,
        rs.ai_citation_position,
        rs.ai_provider,
        rs.observed_at,
        jsonb_array_length(case when jsonb_typeof(rs.competitor_results)='array' then rs.competitor_results else '[]'::jsonb end) as competitor_count,
        coalesce((
          select array_agg(distinct competitor_domain order by competitor_domain)
          from (
            select nullif(coalesce(r->>'domain',r->>'display_name',r->>'name'),'') as competitor_domain
            from jsonb_array_elements(case when jsonb_typeof(rs.competitor_results)='array' then rs.competitor_results else '[]'::jsonb end) r
          ) q
          where competitor_domain is not null
        ),array[]::text[]) as competitor_domains,
        coalesce((
          select string_agg(
            left(concat_ws(' ',
              nullif(r->>'domain',''),
              nullif(r->>'display_name',''),
              nullif(r->>'name',''),
              case when nullif(r->>'position','') is not null then 'position '||(r->>'position') else null end,
              nullif(r->>'title','')
            ),600),
            ' | '
          )
          from jsonb_array_elements(case when jsonb_typeof(rs.competitor_results)='array' then rs.competitor_results else '[]'::jsonb end) r
        ),'') as competitor_text,
        coalesce((
          select string_agg(
            left(coalesce(nullif(f->>'type',''),nullif(f->>'name',''),case when jsonb_typeof(f)='string' then f #>> '{}' else null end),200),
            ' | '
          )
          from jsonb_array_elements(case when jsonb_typeof(rs.serp_features)='array' then rs.serp_features else '[]'::jsonb end) f
        ),'') as serp_feature_text
      from public.seo_rank_snapshots rs
      where rs.organization_id=t.organization_id and rs.target_id=t.id
      order by rs.observed_at desc,rs.created_at desc
      limit 1
    ) s on true
    where t.organization_id=p_organization_id
      and t.id=p_entity_id
      and t.is_active=true;

  elsif p_entity_type='seo_competitor_analysis' then
    select jsonb_strip_nulls(jsonb_build_object(
      'organization_id',a.organization_id,
      'entity_type','seo_competitor_analysis',
      'entity_id',a.id,
      'site_id',a.site_id,
      'analysis_scope',a.scope,
      'analysis_provider',a.provider,
      'analysis_model',a.model,
      'analysis_status',a.status,
      'analysis_summary_text',x.summary_text,
      'analysis_gap_text',x.gap_text,
      'analysis_recommendation_text',x.recommendation_text,
      'analysis_surfaces',x.surfaces,
      'analysis_target_queries',x.target_queries,
      'analysis_target_urls',x.target_urls,
      'started_at',a.started_at,
      'completed_at',a.completed_at,
      'created_at',a.created_at,
      'updated_at',coalesce(a.completed_at,a.created_at)
    )) into v_doc
    from public.seo_competitor_analysis_runs a
    left join lateral (
      select
        coalesce((
          select string_agg(left(value #>> '{}',1000),' ')
          from jsonb_each(case when jsonb_typeof(a.summary)='object' then a.summary else '{}'::jsonb end)
          where jsonb_typeof(value) in ('string','number','boolean')
        ),'') as summary_text,
        coalesce((
          select string_agg(left(concat_ws(' ',
            nullif(g->>'surface',''),
            nullif(g->>'gap',''),
            nullif(g->>'type',''),
            nullif(g->>'description',''),
            nullif(g->>'why',''),
            nullif(g->>'evidence','')
          ),1200),' | ')
          from jsonb_array_elements(case when jsonb_typeof(a.gaps)='array' then a.gaps else '[]'::jsonb end) g
        ),'') as gap_text,
        coalesce((
          select string_agg(left(concat_ws(' ',
            nullif(r->>'surface',''),
            nullif(r->>'action',''),
            nullif(r->>'why',''),
            nullif(r->>'competitor_advantage',''),
            nullif(r->>'expected_signal',''),
            nullif(r->>'confidence',''),
            nullif(r->>'evidence',''),
            nullif(r->>'target_query',''),
            nullif(r->>'target_url','')
          ),1600),' | ')
          from jsonb_array_elements(case when jsonb_typeof(a.recommendations)='array' then a.recommendations else '[]'::jsonb end) r
        ),'') as recommendation_text,
        coalesce((
          select array_agg(distinct surface order by surface)
          from (
            select nullif(r->>'surface','') as surface
            from jsonb_array_elements(case when jsonb_typeof(a.recommendations)='array' then a.recommendations else '[]'::jsonb end) r
          ) z where surface is not null
        ),array[]::text[]) as surfaces,
        coalesce((
          select array_agg(distinct target_query order by target_query)
          from (
            select nullif(r->>'target_query','') as target_query
            from jsonb_array_elements(case when jsonb_typeof(a.recommendations)='array' then a.recommendations else '[]'::jsonb end) r
          ) z where target_query is not null
        ),array[]::text[]) as target_queries,
        coalesce((
          select array_agg(distinct target_url order by target_url)
          from (
            select nullif(r->>'target_url','') as target_url
            from jsonb_array_elements(case when jsonb_typeof(a.recommendations)='array' then a.recommendations else '[]'::jsonb end) r
          ) z where target_url is not null
        ),array[]::text[]) as target_urls
    ) x on true
    where a.organization_id=p_organization_id
      and a.id=p_entity_id
      and a.status='completed';
  end if;

  if v_doc is null then
    return jsonb_build_object(
      'indexable',false,
      'reason','competitor_entity_missing_or_inactive',
      'operation','delete'
    );
  end if;

  return jsonb_build_object(
    'indexable',true,
    'operation','upsert',
    'document_id',p_organization_id::text||':'||p_entity_type||':'||p_entity_id::text,
    'document',v_doc
  );
end;
$function$;

revoke all on function public.build_search_document_v1(uuid,text,uuid)
  from public, anon, authenticated;
grant execute on function public.build_search_document_v1(uuid,text,uuid)
  to service_role;

commit;

-- -----------------------------------------------------------------------------
-- Revenue workspace read models
-- -----------------------------------------------------------------------------
-- Production's canonical revenue workspace RPC existed out-of-band before the
-- Oct-27/Oct-28 Revenue workspace promotion. Its aggregate view dependencies
-- are likewise absent from the source migration ledger. Reconstruct the seven
-- production-equivalent security-invoker views here only for cold replay.

begin;

create or replace view public.v_actual_revenue_by_currency
with (security_invoker = true)
as
select
  upper(currency) as currency,
  coalesce(sum(case
    when payment_kind <> 'refund'::public.payment_kind
      and status = 'paid'::public.payment_status
    then amount else 0::numeric end), 0::numeric)::numeric(14,2) as gross_received,
  coalesce(sum(case
    when payment_kind = 'refund'::public.payment_kind
      and status = any(array['refunded'::public.payment_status,'paid'::public.payment_status])
    then amount else 0::numeric end), 0::numeric)::numeric(14,2) as refunds,
  coalesce(sum(case
    when payment_kind <> 'refund'::public.payment_kind
      and status = 'paid'::public.payment_status
    then amount
    when payment_kind = 'refund'::public.payment_kind
      and status = any(array['refunded'::public.payment_status,'paid'::public.payment_status])
    then -amount
    else 0::numeric end), 0::numeric)::numeric(14,2) as actual_revenue,
  count(*) filter (
    where payment_kind <> 'refund'::public.payment_kind
      and status = 'paid'::public.payment_status
  ) as successful_payments,
  count(*) filter (
    where payment_kind = 'refund'::public.payment_kind
      and status = any(array['refunded'::public.payment_status,'paid'::public.payment_status])
  ) as refund_transactions,
  organization_id
from public.payments
group by organization_id, upper(currency);

create or replace view public.v_actual_revenue_monthly
with (security_invoker = true)
as
select
  date_trunc('month', coalesce(paid_at, created_at))::date as revenue_month,
  upper(currency) as currency,
  coalesce(sum(case
    when payment_kind <> 'refund'::public.payment_kind
      and status = 'paid'::public.payment_status
    then amount else 0::numeric end), 0::numeric)::numeric(14,2) as gross_received,
  coalesce(sum(case
    when payment_kind = 'refund'::public.payment_kind
      and status = any(array['refunded'::public.payment_status,'paid'::public.payment_status])
    then amount else 0::numeric end), 0::numeric)::numeric(14,2) as refunds,
  coalesce(sum(case
    when payment_kind <> 'refund'::public.payment_kind
      and status = 'paid'::public.payment_status
    then amount
    when payment_kind = 'refund'::public.payment_kind
      and status = any(array['refunded'::public.payment_status,'paid'::public.payment_status])
    then -amount
    else 0::numeric end), 0::numeric)::numeric(14,2) as actual_revenue,
  count(*) filter (
    where payment_kind <> 'refund'::public.payment_kind
      and status = 'paid'::public.payment_status
  ) as successful_payments,
  organization_id
from public.payments
group by organization_id,
  date_trunc('month', coalesce(paid_at, created_at)),
  upper(currency);

create or replace view public.v_outstanding_revenue_by_currency
with (security_invoker = true)
as
select
  currency,
  count(*) filter (where outstanding_balance > 0::numeric) as leads_with_balance,
  coalesce(sum(outstanding_balance), 0::numeric)::numeric(14,2) as outstanding_revenue,
  organization_id
from public.v_lead_revenue_status
where currency is not null
group by organization_id, currency;

create or replace view public.v_revenue_forecast_by_stage
with (security_invoker = true)
as
select
  currency,
  current_stage,
  count(*) as lead_count,
  round(sum(coalesce(potential_value, 0::numeric)), 2) as pipeline_value,
  round(sum(coalesce(weighted_value, 0::numeric)), 2) as weighted_forecast,
  round(sum(coalesce(actual_revenue, 0::numeric)), 2) as actual_revenue,
  organization_id
from public.v_revenue_forecast
group by organization_id, currency, current_stage;

create or replace view public.v_revenue_forecast_monthly
with (security_invoker = true)
as
select
  forecast_month,
  currency,
  count(*) as lead_count,
  round(sum(coalesce(potential_value, 0::numeric)), 2) as pipeline_value,
  round(sum(coalesce(weighted_value, 0::numeric)), 2) as weighted_forecast,
  round(sum(coalesce(actual_revenue, 0::numeric)), 2) as actual_revenue,
  organization_id
from public.v_revenue_forecast
group by organization_id, forecast_month, currency
order by forecast_month;

create or replace view public.v_revenue_forecast_by_source
with (security_invoker = true)
as
select
  coalesce(first_touch_source, 'Unknown'::text) as source,
  currency,
  count(*) as lead_count,
  round(sum(coalesce(potential_value, 0::numeric)), 2) as pipeline_value,
  round(sum(coalesce(weighted_value, 0::numeric)), 2) as weighted_forecast,
  round(sum(coalesce(actual_revenue, 0::numeric)), 2) as actual_revenue,
  organization_id
from public.v_revenue_forecast
group by organization_id, coalesce(first_touch_source, 'Unknown'::text), currency;

create or replace view public.v_revenue_forecast_by_location
with (security_invoker = true)
as
select
  coalesce(preferred_location, 'Unknown'::text) as location,
  currency,
  count(*) as lead_count,
  round(sum(coalesce(potential_value, 0::numeric)), 2) as pipeline_value,
  round(sum(coalesce(weighted_value, 0::numeric)), 2) as weighted_forecast,
  round(sum(coalesce(actual_revenue, 0::numeric)), 2) as actual_revenue,
  organization_id
from public.v_revenue_forecast
group by organization_id, coalesce(preferred_location, 'Unknown'::text), currency;

commit;
