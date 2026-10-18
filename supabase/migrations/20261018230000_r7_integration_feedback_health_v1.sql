begin;

create or replace view public.v_r7_integration_feedback_health_v1
with (security_invoker = true)
as
with connection_rollup as (
  select
    ic.organization_id,
    ic.provider,
    count(*)::bigint as connection_count,
    count(*) filter (where ic.status = 'connected')::bigint as connected_count,
    count(*) filter (where ic.status in ('error','expired','revoked'))::bigint as unhealthy_connection_count,
    max(ic.last_verified_at) as last_verified_at,
    max(ic.updated_at) as last_connection_change_at
  from public.integration_connections ic
  group by ic.organization_id, ic.provider
),
asset_rollup as (
  select
    ic.organization_id,
    ic.provider,
    count(ia.id)::bigint as asset_count,
    count(ia.id) filter (where ia.is_selected = true)::bigint as selected_asset_count
  from public.integration_connections ic
  left join public.integration_assets ia
    on ia.organization_id = ic.organization_id
   and ia.connection_id = ic.id
  group by ic.organization_id, ic.provider
),
route_rollup as (
  select
    r.organization_id,
    ic.provider,
    count(*)::bigint as route_count,
    count(*) filter (where r.status = 'active')::bigint as active_route_count,
    count(*) filter (where r.status <> 'active')::bigint as inactive_route_count,
    max(r.updated_at) as last_route_change_at
  from public.conversion_feedback_routes r
  join public.integration_connections ic
    on ic.id = r.connection_id
   and ic.organization_id = r.organization_id
  group by r.organization_id, ic.provider
),
delivery_rollup as (
  select
    d.organization_id,
    ic.provider,
    count(*)::bigint as delivery_count,
    count(*) filter (where d.status = 'queued')::bigint as queued_count,
    count(*) filter (where d.status in ('leased','processing'))::bigint as in_flight_count,
    count(*) filter (where d.status = 'delivered')::bigint as delivered_count,
    count(*) filter (where d.status = 'failed')::bigint as failed_count,
    count(*) filter (where d.status = 'skipped')::bigint as skipped_count,
    max(d.delivered_at) as last_delivered_at,
    max(d.last_attempt_at) as last_attempt_at
  from public.conversion_feedback_deliveries d
  join public.conversion_feedback_routes r
    on r.id = d.route_id
   and r.organization_id = d.organization_id
  join public.integration_connections ic
    on ic.id = r.connection_id
   and ic.organization_id = d.organization_id
  group by d.organization_id, ic.provider
),
provider_keys as (
  select organization_id, provider from connection_rollup
  union
  select organization_id, provider from route_rollup
  union
  select organization_id, provider from delivery_rollup
)
select
  k.organization_id,
  k.provider,
  coalesce(c.connection_count, 0)::bigint as connection_count,
  coalesce(c.connected_count, 0)::bigint as connected_count,
  coalesce(c.unhealthy_connection_count, 0)::bigint as unhealthy_connection_count,
  c.last_verified_at,
  c.last_connection_change_at,
  coalesce(a.asset_count, 0)::bigint as asset_count,
  coalesce(a.selected_asset_count, 0)::bigint as selected_asset_count,
  coalesce(r.route_count, 0)::bigint as route_count,
  coalesce(r.active_route_count, 0)::bigint as active_route_count,
  coalesce(r.inactive_route_count, 0)::bigint as inactive_route_count,
  r.last_route_change_at,
  coalesce(d.delivery_count, 0)::bigint as delivery_count,
  coalesce(d.queued_count, 0)::bigint as queued_count,
  coalesce(d.in_flight_count, 0)::bigint as in_flight_count,
  coalesce(d.delivered_count, 0)::bigint as delivered_count,
  coalesce(d.failed_count, 0)::bigint as failed_count,
  coalesce(d.skipped_count, 0)::bigint as skipped_count,
  d.last_delivered_at,
  d.last_attempt_at,
  case
    when coalesce(c.connected_count, 0) = 0 then 'not_connected'
    when k.provider in ('google','meta') and coalesce(r.active_route_count, 0) = 0 then 'feedback_not_active'
    when coalesce(d.failed_count, 0) > 0 then 'delivery_attention'
    when coalesce(d.queued_count, 0) > 0 or coalesce(d.in_flight_count, 0) > 0 then 'delivery_pending'
    else 'healthy'
  end::text as operational_status
from provider_keys k
left join connection_rollup c
  on c.organization_id = k.organization_id
 and c.provider = k.provider
left join asset_rollup a
  on a.organization_id = k.organization_id
 and a.provider = k.provider
left join route_rollup r
  on r.organization_id = k.organization_id
 and r.provider = k.provider
left join delivery_rollup d
  on d.organization_id = k.organization_id
 and d.provider = k.provider;

revoke all on public.v_r7_integration_feedback_health_v1 from public, anon;
grant select on public.v_r7_integration_feedback_health_v1 to authenticated, service_role;

comment on view public.v_r7_integration_feedback_health_v1 is
'R7 operational health by tenant/provider. Separates account connectivity, selected assets, conversion-feedback route activation and delivery lifecycle without implying provider-side conversion acceptance beyond recorded delivery state.';

commit;
