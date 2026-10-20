begin;

-- =============================================================================
-- Universal Tracking + Consent live-closeout health V1
--
-- This is deliberately backend evidence only. It does not certify that a tenant
-- has removed duplicate browser tags or consent-gated every unrelated third-party
-- script. Those remain explicit live-browser acceptance checks.
-- =============================================================================

create or replace view public.v_tracking_live_closeout_health_v1
with (security_invoker = true)
as
with
browser_sources as (
  select
    s.organization_id,
    count(*) filter (where s.status = 'active')::bigint as active_browser_sources,
    count(*) filter (
      where s.status = 'active'
        and s.auth_mode = 'origin'
        and s.privacy_mode = 'strict'
    )::bigint as strict_origin_browser_sources,
    count(*) filter (
      where s.status = 'active'
        and nullif(btrim(s.privacy_notice_version), '') is null
    )::bigint as browser_sources_missing_notice_version,
    count(*) filter (
      where s.status = 'active'
        and coalesce(s.honor_gpc, false) = false
    )::bigint as browser_sources_without_gpc,
    count(*) filter (
      where s.status = 'active'
        and coalesce(s.require_consent_for_optional, false) = false
    )::bigint as browser_sources_without_required_consent,
    count(*) filter (
      where s.status = 'active'
        and s.last_seen_at is not null
    )::bigint as browser_sources_ever_seen,
    count(*) filter (
      where s.status = 'active'
        and s.last_seen_at >= now() - interval '24 hours'
    )::bigint as browser_sources_seen_24h,
    max(s.last_seen_at) filter (where s.status = 'active') as latest_browser_source_seen_at,
    coalesce(sum(s.accepted_event_count) filter (where s.status = 'active'), 0)::bigint
      as accepted_event_count_total,
    coalesce(sum(s.duplicate_event_count) filter (where s.status = 'active'), 0)::bigint
      as duplicate_event_count_total,
    coalesce(sum(s.rejected_event_count) filter (where s.status = 'active'), 0)::bigint
      as rejected_event_count_total
  from public.tracking_sources s
  where s.source_type = 'website'
    and s.auth_mode = 'origin'
  group by s.organization_id
),
universal_events as (
  select
    r.organization_id,
    count(*) filter (where r.received_at >= now() - interval '24 hours')::bigint
      as universal_events_24h,
    count(*) filter (where r.received_at >= now() - interval '7 days')::bigint
      as universal_events_7d,
    count(distinct r.anonymous_visitor_id) filter (
      where r.received_at >= now() - interval '7 days'
        and r.anonymous_visitor_id is not null
    )::bigint as universal_visitors_7d,
    count(distinct r.session_key) filter (
      where r.received_at >= now() - interval '7 days'
        and r.session_key is not null
    )::bigint as universal_sessions_7d,
    count(*) filter (
      where r.received_at >= now() - interval '7 days'
        and r.source_event_type = 'web.session_started'
    )::bigint as session_started_events_7d,
    count(*) filter (
      where r.received_at >= now() - interval '7 days'
        and r.source_event_type = 'web.page_viewed'
    )::bigint as page_view_events_7d,
    count(*) filter (
      where r.received_at >= now() - interval '7 days'
        and r.source_event_type = 'web.cta_clicked'
    )::bigint as cta_click_events_7d,
    count(*) filter (
      where r.received_at >= now() - interval '7 days'
        and r.source_event_type = 'web.form_started'
    )::bigint as form_started_events_7d,
    count(*) filter (
      where r.received_at >= now() - interval '7 days'
        and r.source_event_type in ('web.form_submitted', 'web.lead_submitted')
    )::bigint as form_submitted_events_7d,
    count(*) filter (
      where r.received_at >= now() - interval '7 days'
        and r.metadata->>'accepted_for_processing' = 'false'
    )::bigint as contract_rejected_events_7d,
    max(r.received_at) as latest_universal_event_at
  from public.raw_events r
  join public.tracking_sources s
    on s.id = r.tracking_source_id
   and s.organization_id = r.organization_id
   and s.source_type = 'website'
   and s.auth_mode = 'origin'
  where r.tracking_source_id is not null
  group by r.organization_id
),
processing_health as (
  select
    r.organization_id,
    count(*) filter (
      where r.received_at >= now() - interval '7 days'
        and p.status = 'dead_letter'
    )::bigint as dead_letter_events_7d,
    count(*) filter (
      where r.received_at >= now() - interval '24 hours'
        and p.status in ('received', 'processing')
        and coalesce(p.updated_at, p.created_at) < now() - interval '15 minutes'
    )::bigint as stuck_processing_events_24h
  from public.raw_events r
  join public.tracking_sources s
    on s.id = r.tracking_source_id
   and s.organization_id = r.organization_id
   and s.source_type = 'website'
   and s.auth_mode = 'origin'
  join public.raw_event_processing p
    on p.raw_event_id = r.id
   and p.organization_id = r.organization_id
  where r.tracking_source_id is not null
  group by r.organization_id
),
privacy_receipts as (
  select
    s.organization_id,
    count(*) filter (
      where pr.received_at >= now() - interval '7 days'
    )::bigint as browser_privacy_receipts_7d,
    count(*) filter (
      where pr.received_at >= now() - interval '7 days'
        and pr.purpose_key = 'analytics'
        and pr.decision = 'granted'
    )::bigint as analytics_grants_7d,
    count(*) filter (
      where pr.received_at >= now() - interval '7 days'
        and pr.purpose_key = 'analytics'
        and pr.decision = 'denied'
    )::bigint as analytics_denials_7d,
    count(*) filter (
      where pr.received_at >= now() - interval '7 days'
        and pr.purpose_key = 'analytics'
        and pr.decision = 'withdrawn'
    )::bigint as analytics_withdrawals_7d,
    count(*) filter (
      where pr.received_at >= now() - interval '7 days'
        and pr.purpose_key = 'sale_sharing'
        and pr.decision = 'opted_out'
        and coalesce(pr.evidence->>'gpc', 'false') = 'true'
    )::bigint as gpc_sale_sharing_opt_outs_7d,
    max(pr.received_at) as latest_browser_privacy_receipt_at
  from public.tracking_sources s
  join public.privacy_consent_receipts pr
    on pr.organization_id = s.organization_id
   and pr.metadata->>'tracking_source_id' = s.id::text
  where s.source_type = 'website'
    and s.auth_mode = 'origin'
  group by s.organization_id
),
identity_proof as (
  select
    o.id as organization_id,
    (select count(*)
     from public.visitor_identity_links vil
     where vil.organization_id = o.id
       and vil.linked_at >= now() - interval '7 days'
       and vil.source_system in ('events-identify-v1', 'tracking-identify'))::bigint
      as exact_session_identity_links_7d,
    (select count(*)
     from public.raw_events r
     join public.tracking_sources s
       on s.id = r.tracking_source_id
      and s.organization_id = r.organization_id
      and s.source_type = 'website'
      and s.auth_mode = 'origin'
     join public.web_sessions ws
       on ws.organization_id = r.organization_id
      and ws.session_key = r.session_key
     where r.organization_id = o.id
       and r.received_at >= now() - interval '7 days'
       and r.source_event_type in ('web.form_submitted', 'web.lead_submitted')
       and ws.lead_id is not null)::bigint
      as identified_form_submissions_7d
  from public.organizations o
)
select
  o.id as organization_id,
  o.name as organization_name,

  coalesce(bs.active_browser_sources, 0)::bigint as active_browser_sources,
  coalesce(bs.strict_origin_browser_sources, 0)::bigint as strict_origin_browser_sources,
  coalesce(bs.browser_sources_missing_notice_version, 0)::bigint
    as browser_sources_missing_notice_version,
  coalesce(bs.browser_sources_without_gpc, 0)::bigint
    as browser_sources_without_gpc,
  coalesce(bs.browser_sources_without_required_consent, 0)::bigint
    as browser_sources_without_required_consent,
  coalesce(bs.browser_sources_ever_seen, 0)::bigint as browser_sources_ever_seen,
  coalesce(bs.browser_sources_seen_24h, 0)::bigint as browser_sources_seen_24h,
  bs.latest_browser_source_seen_at,
  coalesce(bs.accepted_event_count_total, 0)::bigint as accepted_event_count_total,
  coalesce(bs.duplicate_event_count_total, 0)::bigint as duplicate_event_count_total,
  coalesce(bs.rejected_event_count_total, 0)::bigint as rejected_event_count_total,

  coalesce(ue.universal_events_24h, 0)::bigint as universal_events_24h,
  coalesce(ue.universal_events_7d, 0)::bigint as universal_events_7d,
  coalesce(ue.universal_visitors_7d, 0)::bigint as universal_visitors_7d,
  coalesce(ue.universal_sessions_7d, 0)::bigint as universal_sessions_7d,
  coalesce(ue.session_started_events_7d, 0)::bigint as session_started_events_7d,
  coalesce(ue.page_view_events_7d, 0)::bigint as page_view_events_7d,
  coalesce(ue.cta_click_events_7d, 0)::bigint as cta_click_events_7d,
  coalesce(ue.form_started_events_7d, 0)::bigint as form_started_events_7d,
  coalesce(ue.form_submitted_events_7d, 0)::bigint as form_submitted_events_7d,
  coalesce(ue.contract_rejected_events_7d, 0)::bigint as contract_rejected_events_7d,
  ue.latest_universal_event_at,

  coalesce(ph.dead_letter_events_7d, 0)::bigint as dead_letter_events_7d,
  coalesce(ph.stuck_processing_events_24h, 0)::bigint as stuck_processing_events_24h,

  coalesce(pr.browser_privacy_receipts_7d, 0)::bigint as browser_privacy_receipts_7d,
  coalesce(pr.analytics_grants_7d, 0)::bigint as analytics_grants_7d,
  coalesce(pr.analytics_denials_7d, 0)::bigint as analytics_denials_7d,
  coalesce(pr.analytics_withdrawals_7d, 0)::bigint as analytics_withdrawals_7d,
  coalesce(pr.gpc_sale_sharing_opt_outs_7d, 0)::bigint as gpc_sale_sharing_opt_outs_7d,
  pr.latest_browser_privacy_receipt_at,

  coalesce(ip.exact_session_identity_links_7d, 0)::bigint as exact_session_identity_links_7d,
  coalesce(ip.identified_form_submissions_7d, 0)::bigint as identified_form_submissions_7d,

  (
    coalesce(bs.active_browser_sources, 0) > 0
    and coalesce(bs.strict_origin_browser_sources, 0) = coalesce(bs.active_browser_sources, 0)
    and coalesce(bs.browser_sources_missing_notice_version, 0) = 0
    and coalesce(bs.browser_sources_without_gpc, 0) = 0
    and coalesce(bs.browser_sources_without_required_consent, 0) = 0
    and coalesce(ue.universal_events_7d, 0) > 0
    and coalesce(ue.session_started_events_7d, 0) > 0
    and coalesce(ue.page_view_events_7d, 0) > 0
    and coalesce(ue.form_submitted_events_7d, 0) > 0
    and coalesce(pr.analytics_grants_7d, 0) > 0
    and coalesce(pr.analytics_denials_7d, 0) > 0
    and coalesce(pr.analytics_withdrawals_7d, 0) > 0
    and coalesce(pr.gpc_sale_sharing_opt_outs_7d, 0) > 0
    and coalesce(ip.exact_session_identity_links_7d, 0) > 0
    and coalesce(ip.identified_form_submissions_7d, 0) > 0
    and coalesce(ue.contract_rejected_events_7d, 0) = 0
    and coalesce(ph.dead_letter_events_7d, 0) = 0
    and coalesce(ph.stuck_processing_events_24h, 0) = 0
  ) as backend_closeout_candidate,

  case
    when coalesce(bs.active_browser_sources, 0) = 0 then 'misconfigured'
    when coalesce(bs.strict_origin_browser_sources, 0) <> coalesce(bs.active_browser_sources, 0)
      or coalesce(bs.browser_sources_missing_notice_version, 0) > 0
      or coalesce(bs.browser_sources_without_gpc, 0) > 0
      or coalesce(bs.browser_sources_without_required_consent, 0) > 0
      then 'misconfigured'
    when coalesce(ue.universal_events_7d, 0) = 0 then 'not_live'
    when coalesce(ue.contract_rejected_events_7d, 0) > 0
      or coalesce(ph.dead_letter_events_7d, 0) > 0
      or coalesce(ph.stuck_processing_events_24h, 0) > 0
      then 'degraded'
    when coalesce(ue.session_started_events_7d, 0) > 0
      and coalesce(ue.page_view_events_7d, 0) > 0
      and coalesce(ue.form_submitted_events_7d, 0) > 0
      and coalesce(pr.analytics_grants_7d, 0) > 0
      and coalesce(pr.analytics_denials_7d, 0) > 0
      and coalesce(pr.analytics_withdrawals_7d, 0) > 0
      and coalesce(pr.gpc_sale_sharing_opt_outs_7d, 0) > 0
      and coalesce(ip.exact_session_identity_links_7d, 0) > 0
      and coalesce(ip.identified_form_submissions_7d, 0) > 0
      then 'backend_closeout_candidate'
    else 'collecting'
  end as backend_status,

  now() as checked_at
from public.organizations o
left join browser_sources bs on bs.organization_id = o.id
left join universal_events ue on ue.organization_id = o.id
left join processing_health ph on ph.organization_id = o.id
left join privacy_receipts pr on pr.organization_id = o.id
left join identity_proof ip on ip.organization_id = o.id;

comment on view public.v_tracking_live_closeout_health_v1 is
  'Service-role Universal Tracking + Consent live-closeout evidence. backend_closeout_candidate requires canonical browser events, grant/deny/withdraw/GPC receipts, exact-session form identity proof, strict source configuration, and no recent processing/contract failures. Browser tag uniqueness and unrelated third-party consent gating remain separate live-browser checks.';

revoke all on public.v_tracking_live_closeout_health_v1 from public, anon, authenticated;
grant select on public.v_tracking_live_closeout_health_v1 to service_role;

commit;
