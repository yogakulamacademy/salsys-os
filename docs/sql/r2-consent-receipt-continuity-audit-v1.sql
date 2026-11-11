-- R2: trusted-operator, aggregate-only consent receipt chronology audit.
-- RESEARCH / ACCEPTANCE SUPPORT ONLY. Not a CMP browser acceptance, policy
-- compliance certification, retention KPI or a public CRM RPC.
--
-- Example (authorized DB operator, verified tenant/source outside GitHub):
--   psql "$AUTHORIZED_DB_CONNECTION" -X -v ON_ERROR_STOP=1 \
--     -v organization_id='<authorized-tenant-uuid>' \
--     -v hostname='<approved-site-hostname>' -v hours=24 \
--     -f docs/sql/r2-consent-receipt-continuity-audit-v1.sql
--
-- All identifiers are used only inside the DB joins, never returned.
-- The receipt table is scoped to organization + anonymous visitor, not
-- necessarily tracking source. The audit separately checks the server-side
-- receipt metadata tracking_source_id against the event's tracking source.
-- This checks recorded source consistency, not original CMP choice provenance.
-- Event received_at and SDK occurred_at are distinct timestamps; potential
-- clock skew, retries and out-of-order arrival require separate review.
-- An existing receipt does NOT establish that original visitor choice was
-- collected lawfully by the website CMP. Suppressed events cannot be observed.
-- No INSERT, UPDATE, DELETE, roles, writes, sends or tracking configuration.
with params as (
  select :'organization_id'::uuid as organization_id,
    lower(btrim(:'hostname'))::text as hostname,
    :'hours'::integer as hours,
    now() as captured_at
), sources as (
  select t.id, t.organization_id
  from public.organization_sites os
  join public.tracking_sources t
    on t.organization_site_id=os.id
   and t.organization_id=os.organization_id
  join params p on os.organization_id=p.organization_id
  where os.hostname=p.hostname and os.status='active'
    and t.status='active'
), source_count as (
  select count(*)::integer as n from sources
), bounded as materialized (
  select e.organization_id,e.tracking_source_id,e.anonymous_visitor_id,
    e.occurred_at,e.received_at,
    e.metadata->>'consent_mode' as consent_mode,
    e.metadata->'consent_snapshot'->>'analytics' as analytics_claim
  from public.raw_events e
  join sources s on s.id=e.tracking_source_id
    and s.organization_id=e.organization_id
  join params p on p.organization_id=e.organization_id
  where (select n=1 from source_count)
    and p.hours between 1 and 72
    and e.event_family='web'
    and e.source_event_type='web.session_started'
    and e.received_at>=p.captured_at-(p.hours*interval '1 hour')
    and e.received_at<=p.captured_at
  order by e.received_at,e.id
  limit 50001
), volume as (
  select count(*)::integer as candidate_events from bounded
), latest_prior as (
  select s.consent_mode,s.analytics_claim,s.anonymous_visitor_id,s.tracking_source_id,
    r.decision as prior_decision,r.source as prior_source,
    r.notice_version as prior_notice_version,
    r.metadata->>'tracking_source_id' as prior_receipt_tracking_source_id
  from bounded s
  left join lateral (
    select r.decision,r.source,r.notice_version,r.metadata
    from public.privacy_consent_receipts r
    where r.organization_id=s.organization_id
      and r.anonymous_visitor_id=s.anonymous_visitor_id
      and r.purpose_key='analytics'
      and r.occurred_at<=s.occurred_at
      and r.received_at<=s.received_at
    order by r.occurred_at desc,r.received_at desc,r.id desc
    limit 1
  ) r on true
), aggregate as (
  select count(*)::bigint as counted_starts,
    count(*) filter(where consent_mode='required')::bigint as sdk_required_mode,
    count(*) filter(where consent_mode='granted')::bigint as sdk_granted_mode,
    count(*) filter(where consent_mode is null or consent_mode not in ('required','granted'))::bigint as sdk_other_or_missing_mode,
    count(*) filter(where analytics_claim='granted')::bigint as client_claims_analytics_granted,
    count(*) filter(where analytics_claim='granted' and prior_decision='granted')::bigint as client_grant_with_prior_server_grant,
    count(*) filter(where analytics_claim='granted' and prior_decision='granted' and prior_source='browser_sdk_v1'
      and nullif(btrim(prior_notice_version),'') is not null)::bigint as grant_with_browser_sdk_receipt_and_notice,
    count(*) filter(where analytics_claim='granted' and prior_decision='granted'
      and prior_source='browser_sdk_v1'
      and prior_receipt_tracking_source_id=tracking_source_id::text
      and nullif(btrim(prior_notice_version),'') is not null)::bigint
        as source_matched_browser_sdk_notice_grants,
    count(*) filter(where prior_decision='granted'
      and prior_receipt_tracking_source_id is distinct from tracking_source_id::text)::bigint
        as prior_grants_with_missing_or_other_source,
    count(*) filter(where prior_decision='denied')::bigint as latest_prior_analytics_denied,
    count(*) filter(where prior_decision is null)::bigint as no_prior_analytics_receipt,
    count(*) filter(where analytics_claim='granted' and prior_decision is distinct from 'granted')::bigint
      as client_grant_without_prior_grant,
    count(*) filter(where anonymous_visitor_id is null or btrim(anonymous_visitor_id)='')::bigint
      as missing_visitor_key
  from latest_prior
)
select jsonb_build_object(
  'audit','r2_consent_receipt_continuity_readonly_v1',
  'status',case
    when p.hours not between 1 and 72 then 'invalid_window'
    when c.n<>1 then 'invalid_source_scope'
    when v.candidate_events>50000 then 'volume_limit'
    when v.candidate_events=0 then 'no_observations'
    else 'observational_only'
  end,
  'lookback_hours',p.hours,
  'sampled_at_utc',to_char(p.captured_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'source_scope_count',c.n,
  'candidate_events',v.candidate_events,
  'metrics',case
    when p.hours between 1 and 72 and c.n=1 and v.candidate_events between 1 and 50000
      then jsonb_build_object(
        'counted_starts',a.counted_starts,
        'sdk_required_mode',a.sdk_required_mode,
        'sdk_granted_mode',a.sdk_granted_mode,
        'sdk_other_or_missing_mode',a.sdk_other_or_missing_mode,
        'client_claims_analytics_granted',a.client_claims_analytics_granted,
        'client_grant_with_prior_server_grant',a.client_grant_with_prior_server_grant,
        'grant_with_browser_sdk_receipt_and_notice',a.grant_with_browser_sdk_receipt_and_notice,
        'source_matched_browser_sdk_notice_grants',a.source_matched_browser_sdk_notice_grants,
        'prior_grants_with_missing_or_other_source',a.prior_grants_with_missing_or_other_source,
        'latest_prior_analytics_denied',a.latest_prior_analytics_denied,
        'no_prior_analytics_receipt',a.no_prior_analytics_receipt,
        'client_grant_without_prior_grant',a.client_grant_without_prior_grant,
        'missing_visitor_key',a.missing_visitor_key
      ) else '{}'::jsonb end,
  'verifies_cmp_user_choice',false,
  'verifies_third_party_suppression',false,
  'verifies_staging_consent_acceptance',false,
  'is_authenticated_role_test',false
) as aggregate_evidence_only
from params p cross join source_count c cross join volume v cross join aggregate a;
