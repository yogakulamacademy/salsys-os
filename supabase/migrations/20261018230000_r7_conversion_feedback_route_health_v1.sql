begin;

create or replace view public.v_r7_conversion_feedback_route_health_v1
with (security_invoker = true)
as
with fact_counts as (
  select
    organization_id,
    conversion_type,
    count(*)::bigint as matching_fact_count,
    max(conversion_at) as latest_fact_at
  from public.v_lead_conversion_facts
  group by organization_id, conversion_type
), delivery_counts as (
  select
    route_id,
    count(*)::bigint as delivery_count,
    count(*) filter (where status = 'queued')::bigint as queued_count,
    count(*) filter (where status = 'processing')::bigint as processing_count,
    count(*) filter (where status = 'delivered')::bigint as delivered_count,
    count(*) filter (where status = 'retryable_failed')::bigint as retryable_failed_count,
    count(*) filter (where status = 'permanent_failed')::bigint as permanent_failed_count,
    count(*) filter (where status = 'skipped')::bigint as skipped_count,
    max(last_attempt_at) as last_attempt_at,
    max(delivered_at) as last_delivered_at
  from public.conversion_feedback_deliveries
  group by route_id
)
select
  r.organization_id,
  r.id as route_id,
  r.route_key,
  r.name as route_name,
  c.provider,
  r.conversion_type,
  r.destination_kind,
  r.destination_external_id,
  r.destination_event_name,
  r.status as route_status,
  c.id as connection_id,
  c.status as connection_status,
  c.last_verified_at,
  a.id as integration_asset_id,
  a.asset_type,
  a.external_id as asset_external_id,
  a.name as asset_name,
  a.status as asset_status,
  a.is_selected as asset_selected,
  coalesce(f.matching_fact_count, 0)::bigint as matching_fact_count,
  f.latest_fact_at,
  coalesce(d.delivery_count, 0)::bigint as delivery_count,
  coalesce(d.queued_count, 0)::bigint as queued_count,
  coalesce(d.processing_count, 0)::bigint as processing_count,
  coalesce(d.delivered_count, 0)::bigint as delivered_count,
  coalesce(d.retryable_failed_count, 0)::bigint as retryable_failed_count,
  coalesce(d.permanent_failed_count, 0)::bigint as permanent_failed_count,
  coalesce(d.skipped_count, 0)::bigint as skipped_count,
  d.last_attempt_at,
  d.last_delivered_at,
  case
    when c.status <> 'connected' then 'connection_not_connected'
    when a.is_selected is distinct from true then 'asset_not_selected'
    when a.status = 'unavailable' then 'asset_unavailable'
    when r.destination_external_id is null then 'destination_missing'
    when c.provider = 'google'
      and not ('https://www.googleapis.com/auth/datamanager' = any(coalesce(c.scopes, '{}'::text[])))
      then 'google_datamanager_scope_missing'
    when c.provider = 'meta' and r.destination_event_name is null then 'meta_event_name_missing'
    when coalesce(f.matching_fact_count, 0) = 0 then 'no_conversion_facts'
    when r.status = 'inactive' then 'ready_for_validation'
    else 'active'
  end::text as configuration_status
from public.conversion_feedback_routes r
join public.integration_connections c
  on c.id = r.connection_id
 and c.organization_id = r.organization_id
join public.integration_assets a
  on a.id = r.integration_asset_id
 and a.connection_id = r.connection_id
 and a.organization_id = r.organization_id
left join fact_counts f
  on f.organization_id = r.organization_id
 and f.conversion_type = r.conversion_type
left join delivery_counts d
  on d.route_id = r.id;

revoke all on public.v_r7_conversion_feedback_route_health_v1 from public, anon;
grant select on public.v_r7_conversion_feedback_route_health_v1 to authenticated, service_role;

comment on view public.v_r7_conversion_feedback_route_health_v1 is
'R7 tenant-safe conversion feedback route readiness and delivery health. This view reports configuration and observed queue state only; it does not claim provider delivery success before a real provider response exists.';

commit;
