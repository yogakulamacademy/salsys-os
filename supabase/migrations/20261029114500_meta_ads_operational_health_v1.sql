-- PH-3 reliability/observability:
-- Classify Meta Ads operational readiness separately from raw connection state
-- and sync freshness. This view is read-only and intentionally does not mutate
-- credentials, connections, selected assets, or existing system-health views.

create or replace view public.v_meta_ads_operational_health_v1
with (security_invoker = true)
as
with organizations_base as (
  select o.id as organization_id
  from public.organizations o
),
latest_connection as (
  select distinct on (ic.organization_id)
    ic.organization_id,
    ic.id as connection_id,
    ic.status as connection_status,
    ic.auth_mode,
    ic.connected_at,
    ic.last_verified_at,
    ic.last_error as connection_last_error,
    (
      coalesce(ic.scopes, array[]::text[]) && array['ads_read','ads_management']::text[]
      or exists (
        select 1
        from jsonb_array_elements(
          coalesce(ic.provider_metadata->'granular_scopes', '[]'::jsonb)
        ) as scope_row
        where scope_row->>'scope' in ('ads_read','ads_management')
      )
    ) as ads_permission_present
  from public.integration_connections ic
  where ic.provider = 'meta'
  order by
    ic.organization_id,
    coalesce(ic.updated_at, ic.connected_at, ic.created_at) desc,
    ic.id desc
),
asset_rollup as (
  select
    ia.organization_id,
    ia.connection_id,
    count(*) filter (
      where ia.asset_type = 'meta_ad_account'
        and ia.is_selected = true
        and coalesce(ia.status, '') <> 'unavailable'
    )::bigint as selected_asset_count,
    count(*) filter (
      where ia.asset_type = 'meta_ad_account'
    )::bigint as discovered_asset_count
  from public.integration_assets ia
  group by ia.organization_id, ia.connection_id
),
joined as (
  select
    o.organization_id,
    c.connection_id,
    c.connection_status,
    c.auth_mode,
    c.connected_at,
    c.last_verified_at,
    c.connection_last_error,
    coalesce(c.ads_permission_present, false) as ads_permission_present,
    coalesce(a.selected_asset_count, 0::bigint) as selected_asset_count,
    coalesce(a.discovered_asset_count, 0::bigint) as discovered_asset_count,
    s.latest_data_date,
    s.last_sync_status,
    s.last_sync_completed_at,
    s.last_sync_error
  from organizations_base o
  left join latest_connection c
    on c.organization_id = o.organization_id
  left join asset_rollup a
    on a.organization_id = o.organization_id
   and a.connection_id = c.connection_id
  left join public.v_meta_ads_sync_health s
    on s.organization_id = o.organization_id
),
classified as (
  select
    j.*,
    case
      when j.connection_id is null then 'not_configured'::text
      when coalesce(j.connection_status, '') <> 'connected' then 'configuration_blocked'::text
      when j.ads_permission_present = false then 'configuration_blocked'::text
      when j.selected_asset_count = 0 then 'configuration_blocked'::text
      when lower(coalesce(j.last_sync_status, '')) in ('failed','error') then 'runtime_failure'::text
      when j.last_sync_completed_at is null
        or j.last_sync_completed_at < now() - interval '30 hours'
        then 'stale'::text
      else 'healthy'::text
    end as operational_state,
    case
      when j.connection_id is null then 'inactive'::text
      when coalesce(j.connection_status, '') <> 'connected' then 'warning'::text
      when j.ads_permission_present = false then 'warning'::text
      when j.selected_asset_count = 0 then 'warning'::text
      when lower(coalesce(j.last_sync_status, '')) in ('failed','error') then 'critical'::text
      when j.last_sync_completed_at is null
        or j.last_sync_completed_at < now() - interval '30 hours'
        then 'warning'::text
      else 'healthy'::text
    end as health_status,
    case
      when j.connection_id is null then 'meta_not_configured'::text
      when coalesce(j.connection_status, '') <> 'connected' then 'meta_connection_not_connected'::text
      when j.ads_permission_present = false then 'meta_ads_permission_missing'::text
      when j.selected_asset_count = 0 then 'meta_ad_account_not_selected'::text
      when lower(coalesce(j.last_sync_status, '')) in ('failed','error') then 'meta_sync_runtime_failure'::text
      when j.last_sync_completed_at is null
        or j.last_sync_completed_at < now() - interval '30 hours'
        then 'meta_sync_stale'::text
      else null::text
    end as blocker_code,
    case
      when j.connection_id is null then 'Meta Ads is not configured for this organization.'::text
      when coalesce(j.connection_status, '') <> 'connected' then 'Meta connection is not currently connected.'::text
      when j.ads_permission_present = false then 'Meta Ads permission is missing. Grant ads_read or ads_management, reconnect Meta, then discover and select the ad account.'::text
      when j.selected_asset_count = 0 then 'No Meta ad account is selected. Discover available ad accounts and select the account to sync.'::text
      when lower(coalesce(j.last_sync_status, '')) in ('failed','error') then coalesce(j.last_sync_error, 'Latest Meta Ads sync failed.')
      when j.last_sync_completed_at is null
        or j.last_sync_completed_at < now() - interval '30 hours'
        then 'Meta Ads is configured, but the latest successful sync is stale.'::text
      else null::text
    end as blocker_message
  from joined j
)
select
  c.organization_id,
  'meta_ads'::text as provider_key,
  c.connection_id,
  c.connection_status,
  c.auth_mode,
  c.ads_permission_present,
  c.selected_asset_count,
  c.discovered_asset_count,
  c.latest_data_date,
  c.last_sync_status,
  c.last_sync_completed_at,
  c.last_sync_error,
  c.connection_last_error,
  c.operational_state,
  c.health_status,
  c.blocker_code,
  c.blocker_message,
  c.connected_at,
  c.last_verified_at,
  now() as checked_at
from classified c;

revoke all on public.v_meta_ads_operational_health_v1
  from public, anon, authenticated;
grant select on public.v_meta_ads_operational_health_v1
  to service_role;

comment on view public.v_meta_ads_operational_health_v1 is
  'PH-3 tenant-scoped Meta Ads operational readiness. Distinguishes not configured, configuration blocked, runtime failure, stale, and healthy without changing raw connection or sync state.';
