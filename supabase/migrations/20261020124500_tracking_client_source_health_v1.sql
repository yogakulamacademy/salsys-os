begin;

create or replace view public.v_tracking_client_source_health_v1
with (security_invoker = true)
as
with event_rollup as (
  select
    s.organization_id,
    s.id as tracking_source_id,
    count(*) filter (where r.received_at >= now() - interval '24 hours')::bigint as events_24h,
    count(*) filter (where r.received_at >= now() - interval '7 days')::bigint as events_7d,
    count(distinct r.anonymous_visitor_id) filter (
      where r.received_at >= now() - interval '7 days'
        and r.anonymous_visitor_id is not null
    )::bigint as visitors_7d,
    count(distinct r.session_key) filter (
      where r.received_at >= now() - interval '7 days'
        and r.session_key is not null
    )::bigint as sessions_7d,
    count(*) filter (
      where r.received_at >= now() - interval '7 days'
        and r.metadata->>'accepted_for_processing' = 'false'
    )::bigint as contract_rejections_7d,
    max(r.received_at) as latest_event_at,
    (array_agg(r.metadata->'sdk'->>'name' order by r.received_at desc)
      filter (where nullif(r.metadata->'sdk'->>'name','') is not null))[1] as latest_sdk_name,
    (array_agg(r.metadata->'sdk'->>'version' order by r.received_at desc)
      filter (where nullif(r.metadata->'sdk'->>'version','') is not null))[1] as latest_sdk_version,
    (array_agg(r.metadata->'sdk'->>'integration' order by r.received_at desc)
      filter (where nullif(r.metadata->'sdk'->>'integration','') is not null))[1] as latest_sdk_integration
  from public.tracking_sources s
  left join public.raw_events r
    on r.organization_id = s.organization_id
   and r.tracking_source_id = s.id
  where s.source_type = 'client'
    and s.auth_mode = 'publishable'
  group by s.organization_id, s.id
),
processing_rollup as (
  select
    s.organization_id,
    s.id as tracking_source_id,
    count(*) filter (
      where r.received_at >= now() - interval '7 days'
        and p.status = 'dead_letter'
    )::bigint as dead_letters_7d,
    count(*) filter (
      where r.received_at >= now() - interval '24 hours'
        and p.status in ('received','processing')
        and coalesce(p.updated_at,p.created_at) < now() - interval '15 minutes'
    )::bigint as stuck_processing_24h
  from public.tracking_sources s
  left join public.raw_events r
    on r.organization_id = s.organization_id
   and r.tracking_source_id = s.id
  left join public.raw_event_processing p
    on p.organization_id = r.organization_id
   and p.raw_event_id = r.id
  where s.source_type = 'client'
    and s.auth_mode = 'publishable'
  group by s.organization_id, s.id
),
consent_rollup as (
  select
    s.organization_id,
    s.id as tracking_source_id,
    count(*) filter (where pr.received_at >= now() - interval '7 days')::bigint as privacy_receipts_7d,
    count(*) filter (
      where pr.received_at >= now() - interval '7 days'
        and pr.purpose_key = 'analytics'
        and pr.decision = 'granted'
    )::bigint as analytics_grants_7d,
    count(*) filter (
      where pr.received_at >= now() - interval '7 days'
        and pr.purpose_key = 'analytics'
        and pr.decision in ('denied','withdrawn','opted_out','limited')
    )::bigint as analytics_non_grants_7d,
    max(pr.received_at) as latest_privacy_receipt_at
  from public.tracking_sources s
  left join public.privacy_consent_receipts pr
    on pr.organization_id = s.organization_id
   and pr.metadata->>'tracking_source_id' = s.id::text
  where s.source_type = 'client'
    and s.auth_mode = 'publishable'
  group by s.organization_id, s.id
)
select
  s.organization_id,
  o.name as organization_name,
  s.id as tracking_source_id,
  s.name as source_name,
  nullif(s.metadata->>'platform','') as platform,
  s.source_system,
  s.auth_mode,
  s.status,
  s.allowed_event_prefixes,
  s.privacy_mode,
  s.honor_gpc,
  s.require_consent_for_optional,
  s.privacy_notice_version,
  s.max_payload_bytes,
  s.rate_limit_per_minute,
  s.accepted_event_count,
  s.duplicate_event_count,
  s.rejected_event_count,
  s.last_seen_at,
  s.last_rejected_at,

  coalesce(e.events_24h,0)::bigint as events_24h,
  coalesce(e.events_7d,0)::bigint as events_7d,
  coalesce(e.visitors_7d,0)::bigint as visitors_7d,
  coalesce(e.sessions_7d,0)::bigint as sessions_7d,
  coalesce(e.contract_rejections_7d,0)::bigint as contract_rejections_7d,
  e.latest_event_at,
  e.latest_sdk_name,
  e.latest_sdk_version,
  e.latest_sdk_integration,

  coalesce(p.dead_letters_7d,0)::bigint as dead_letters_7d,
  coalesce(p.stuck_processing_24h,0)::bigint as stuck_processing_24h,

  coalesce(c.privacy_receipts_7d,0)::bigint as privacy_receipts_7d,
  coalesce(c.analytics_grants_7d,0)::bigint as analytics_grants_7d,
  coalesce(c.analytics_non_grants_7d,0)::bigint as analytics_non_grants_7d,
  c.latest_privacy_receipt_at,

  case
    when s.status <> 'active' then 'inactive'
    when s.auth_mode <> 'publishable'
      or s.privacy_mode <> 'strict'
      or coalesce(s.require_consent_for_optional,false) = false
      or nullif(btrim(s.privacy_notice_version),'') is null
      or nullif(btrim(s.metadata->>'platform'),'') is null
      then 'misconfigured'
    when coalesce(e.contract_rejections_7d,0) > 0
      or coalesce(p.dead_letters_7d,0) > 0
      or coalesce(p.stuck_processing_24h,0) > 0
      then 'degraded'
    when coalesce(e.events_7d,0) = 0 then 'not_live'
    when coalesce(e.events_24h,0) = 0 then 'idle'
    else 'healthy'
  end as health_status,

  now() as checked_at
from public.tracking_sources s
join public.organizations o on o.id = s.organization_id
left join event_rollup e
  on e.organization_id = s.organization_id
 and e.tracking_source_id = s.id
left join processing_rollup p
  on p.organization_id = s.organization_id
 and p.tracking_source_id = s.id
left join consent_rollup c
  on c.organization_id = s.organization_id
 and c.tracking_source_id = s.id
where s.source_type = 'client'
  and s.auth_mode = 'publishable';

comment on view public.v_tracking_client_source_health_v1 is
  'Service-role health for publishable Android/iOS/Shopify/web client sources, including event freshness, SDK provenance, privacy receipts and processing failures.';

revoke all on public.v_tracking_client_source_health_v1 from public, anon, authenticated;
grant select on public.v_tracking_client_source_health_v1 to service_role;

commit;
