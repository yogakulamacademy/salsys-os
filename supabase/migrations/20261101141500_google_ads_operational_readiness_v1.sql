-- Production Acceptance — Provider Readiness Parity V1.
--
-- Google Ads raw sync health must remain truthful: a provider rejection is still
-- a failed sync. This companion readiness view classifies known configuration /
-- provider-access blockers separately so operators do not mistake them for an
-- internal SalsysOS runtime defect.
--
-- This migration is read-only. It does not mutate credentials, connections,
-- selected assets, sync history, campaigns, or the existing System Health view.

create or replace view public.v_google_ads_operational_readiness_v1
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
    coalesce(ic.scopes, array[]::text[]) @> array[
      'https://www.googleapis.com/auth/adwords'
    ]::text[] as adwords_scope_present
  from public.integration_connections ic
  where ic.provider = 'google'
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
      where ia.asset_type = 'google_ads_customer'
        and ia.is_selected = true
        and coalesce(ia.status, '') <> 'unavailable'
    )::bigint as selected_asset_count,
    count(*) filter (
      where ia.asset_type = 'google_ads_customer'
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
    coalesce(c.adwords_scope_present, false) as adwords_scope_present,
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
  left join public.v_google_ads_sync_health s
    on s.organization_id = o.organization_id
),
classified as (
  select
    j.*,
    case
      when j.connection_id is null then 'not_configured'::text
      when coalesce(j.connection_status, '') <> 'connected' then 'configuration_blocked'::text
      when j.adwords_scope_present = false then 'configuration_blocked'::text
      when j.selected_asset_count = 0 then 'configuration_blocked'::text
      when lower(coalesce(j.last_sync_status, '')) in ('failed', 'error')
        and (
          position(
            'CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION'
            in coalesce(j.last_sync_error, '')
          ) > 0
          or position(
            'only approved for use with test accounts'
            in lower(coalesce(j.last_sync_error, ''))
          ) > 0
        ) then 'configuration_blocked'::text
      when lower(coalesce(j.last_sync_status, '')) in ('failed', 'error') then 'runtime_failure'::text
      when j.last_sync_completed_at is null
        or j.last_sync_completed_at < now() - interval '30 hours'
        then 'stale'::text
      else 'healthy'::text
    end as operational_state,
    case
      when j.connection_id is null then 'inactive'::text
      when coalesce(j.connection_status, '') <> 'connected' then 'configuration_blocked'::text
      when j.adwords_scope_present = false then 'configuration_blocked'::text
      when j.selected_asset_count = 0 then 'configuration_blocked'::text
      when lower(coalesce(j.last_sync_status, '')) in ('failed', 'error')
        and (
          position(
            'CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION'
            in coalesce(j.last_sync_error, '')
          ) > 0
          or position(
            'only approved for use with test accounts'
            in lower(coalesce(j.last_sync_error, ''))
          ) > 0
        ) then 'configuration_blocked'::text
      when lower(coalesce(j.last_sync_status, '')) in ('failed', 'error') then 'critical'::text
      when j.last_sync_completed_at is null
        or j.last_sync_completed_at < now() - interval '30 hours'
        then 'warning'::text
      else 'healthy'::text
    end as health_status,
    case
      when j.connection_id is null then 'google_ads_not_configured'::text
      when coalesce(j.connection_status, '') <> 'connected' then 'google_connection_not_connected'::text
      when j.adwords_scope_present = false then 'google_ads_scope_missing'::text
      when j.selected_asset_count = 0 then 'google_ads_customer_not_selected'::text
      when lower(coalesce(j.last_sync_status, '')) in ('failed', 'error')
        and (
          position(
            'CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION'
            in coalesce(j.last_sync_error, '')
          ) > 0
          or position(
            'only approved for use with test accounts'
            in lower(coalesce(j.last_sync_error, ''))
          ) > 0
        ) then 'google_cloud_project_test_access'::text
      when lower(coalesce(j.last_sync_status, '')) in ('failed', 'error') then 'google_ads_sync_runtime_failure'::text
      when j.last_sync_completed_at is null
        or j.last_sync_completed_at < now() - interval '30 hours'
        then 'google_ads_sync_stale'::text
      else null::text
    end as blocker_code,
    case
      when j.connection_id is null then 'Google Ads is not configured for this organization.'::text
      when coalesce(j.connection_status, '') <> 'connected' then 'Google connection is not currently connected.'::text
      when j.adwords_scope_present = false then 'Google Ads OAuth scope is missing. Reconnect Google with the adwords scope before discovering or syncing Ads customers.'::text
      when j.selected_asset_count = 0 then 'No Google Ads customer is selected. Discover available Ads customers and select the production account to sync.'::text
      when lower(coalesce(j.last_sync_status, '')) in ('failed', 'error')
        and (
          position(
            'CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION'
            in coalesce(j.last_sync_error, '')
          ) > 0
          or position(
            'only approved for use with test accounts'
            in lower(coalesce(j.last_sync_error, ''))
          ) > 0
        ) then 'Google Ads API access is limited to test accounts for the OAuth Cloud project. Apply for Explorer, Basic, or Standard production access in Google Cloud; no SalsysOS credential or customer-selection change is required.'::text
      when lower(coalesce(j.last_sync_status, '')) in ('failed', 'error') then coalesce(j.last_sync_error, 'Latest Google Ads sync failed.')
      when j.last_sync_completed_at is null
        or j.last_sync_completed_at < now() - interval '30 hours'
        then 'Google Ads is configured, but the latest completed sync is stale.'::text
      else null::text
    end as blocker_message
  from joined j
)
select
  c.organization_id,
  'google_ads_readiness'::text as readiness_key,
  'Google Ads Readiness'::text as readiness_name,
  'integrations'::text as readiness_group,
  c.health_status,
  c.operational_state as operational_status,
  c.connection_id is not null as active,
  case when c.blocker_code is null then 0 else 1 end::bigint as issue_count,
  jsonb_build_object(
    'blocker_code', c.blocker_code,
    'blocker_message', c.blocker_message,
    'connection_status', c.connection_status,
    'auth_mode', c.auth_mode,
    'adwords_scope_present', c.adwords_scope_present,
    'selected_asset_count', c.selected_asset_count,
    'discovered_asset_count', c.discovered_asset_count,
    'latest_data_date', c.latest_data_date,
    'last_sync_status', c.last_sync_status,
    'last_sync_completed_at', c.last_sync_completed_at,
    'connection_last_error', c.connection_last_error
  ) as details,
  now() as checked_at
from classified c;

revoke all on public.v_google_ads_operational_readiness_v1
  from public, anon, authenticated;
grant select on public.v_google_ads_operational_readiness_v1
  to service_role;

comment on view public.v_google_ads_operational_readiness_v1 is
  'Tenant-scoped Google Ads operational readiness. Preserves raw failed-sync evidence while distinguishing configuration/provider access blockers from internal runtime failures.';
