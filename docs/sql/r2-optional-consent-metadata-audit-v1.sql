-- R2-P3: trusted-operator OPTIONAL CONSENT METADATA diagnostic, aggregate-only.
-- SELECT-ONLY; no browser/visitor/lead/session/source identifiers, URLs, PII,
-- consent receipts, event payloads, or customer records returned.
-- Operator must verify the organization ID independently (never commit it).
-- Example: psql "$AUTHORIZED_DB_CONNECTION" -X -q -A -t -P pager=off \
--   -v ON_ERROR_STOP=1 -v organization_id='<verified-authorized-uuid>' \
--   -v days=7 -f docs/sql/r2-optional-consent-metadata-audit-v1.sql
--
-- Purpose mapping uses actual server routine privacy_purpose_for_event_v1.
-- This audit checks SDK-reported metadata consistency, NOT actual consent legality,
-- third-party script blocking, privacy receipt authorization, or GPC acceptance.
-- Form submissions map to service_delivery and are NOT false-positive analytics
-- violations when no optional consent snapshot is present.
-- Only supported 7/14/30 UTC calendar-day windows, ending with incomplete today.
-- 50k+ event cap fails closed; no tenant row identifiers in result.

with params as (
  select :'organization_id'::uuid as organization_id,
    :'days'::integer as days,
    now() as sampled_at,
    (now() at time zone 'UTC')::date as today_utc
), permitted_types(event_name, expected_purpose) as (
  values
    ('web.session_started'::text, 'analytics'::text),
    ('web.page_viewed','analytics'),
    ('web.form_started','analytics'),
    ('web.form_submitted','service_delivery'),
    ('web.scroll_depth_reached','analytics'),
    ('web.cta_viewed','analytics'),
    ('web.pricing_viewed','analytics'),
    ('web.faq_expanded','analytics'),
    ('web.brochure_clicked','analytics'),
    ('web.form_validation_failed','analytics'),
    ('web.form_acknowledged','analytics')
), purpose_map as (
  select t.event_name,t.expected_purpose,
    public.privacy_purpose_for_event_v1(t.event_name) as actual_purpose
  from permitted_types t
), bounded as materialized (
  select (e.received_at at time zone 'UTC')::date as received_day_utc,
    e.source_event_type as event_name,
    e.metadata ->> 'consent_mode' as sdk_consent_mode,
    e.metadata -> 'consent_snapshot' ->> 'analytics' as analytics_snapshot
  from public.raw_events e
  join params p on e.organization_id=p.organization_id
  join permitted_types t on t.event_name=e.source_event_type
  where p.days in (7,14,30)
    and e.event_family='web'
    and e.received_at >= ((p.today_utc - (p.days-1))::timestamp at time zone 'UTC')
    and e.received_at < ((p.today_utc + 1)::timestamp at time zone 'UTC')
  limit 50001
), volume as (
  select count(*)::bigint as candidate_events from bounded
), aggregates as (
  select b.received_day_utc,b.event_name,m.actual_purpose,
    count(*)::bigint as received_events,
    count(*) filter (where b.sdk_consent_mode='required')::bigint as sdk_required,
    count(*) filter (where b.sdk_consent_mode='granted')::bigint as sdk_granted,
    count(*) filter (where coalesce(b.sdk_consent_mode,'') not in ('required','granted'))::bigint as sdk_other,
    count(*) filter (where b.analytics_snapshot='granted')::bigint as analytics_snapshot_granted,
    count(*) filter (where b.analytics_snapshot is distinct from 'granted')::bigint as analytics_snapshot_missing_or_not_granted
  from bounded b join purpose_map m on m.event_name=b.event_name
  group by b.received_day_utc,b.event_name,m.actual_purpose
), totals as (
  select
    coalesce(sum(received_events) filter (where actual_purpose='analytics'),0)::bigint as analytics_events,
    coalesce(sum(analytics_snapshot_missing_or_not_granted)
      filter (where actual_purpose='analytics'),0)::bigint as analytics_metadata_without_grant,
    coalesce(sum(analytics_snapshot_missing_or_not_granted)
      filter (where actual_purpose='service_delivery'),0)::bigint as service_delivery_metadata_without_grant
  from aggregates
)
select jsonb_build_object(
  'audit','r2_optional_consent_metadata_only_v1',
  'status',case
    when p.days not in (7,14,30) then 'invalid_window'
    when v.candidate_events>50000 then 'volume_limit'
    when exists(select 1 from purpose_map where expected_purpose is distinct from actual_purpose)
      then 'purpose_mapping_review_required'
    else 'aggregate_metadata_only'
  end,
  'window_days',p.days,
  'sampled_at_utc',to_char(p.sampled_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'first_day_utc',to_char(p.today_utc - (case when p.days in (7,14,30) then p.days else 1 end) + 1,'YYYY-MM-DD'),
  'last_day_utc',to_char(p.today_utc,'YYYY-MM-DD'),
  'last_day_incomplete',true,
  'candidate_events',v.candidate_events,
  'expected_purpose_mapping_matches',not exists(
    select 1 from purpose_map where expected_purpose is distinct from actual_purpose),
  'analytics_events',case when v.candidate_events<=50000 then t.analytics_events else null end,
  'analytics_metadata_without_grant',case when v.candidate_events<=50000
    then t.analytics_metadata_without_grant else null end,
  'service_delivery_metadata_without_grant',case when v.candidate_events<=50000
    then t.service_delivery_metadata_without_grant else null end,
  'rows',case when v.candidate_events<=50000 and p.days in (7,14,30)
        and not exists(select 1 from purpose_map where expected_purpose is distinct from actual_purpose)
    then (select coalesce(jsonb_agg(jsonb_build_object(
      'received_day_utc',to_char(received_day_utc,'YYYY-MM-DD'),
      'event_name',event_name,
      'mapped_purpose',actual_purpose,
      'received_events',received_events,
      'sdk_required',sdk_required,
      'sdk_granted',sdk_granted,
      'sdk_other',sdk_other,
      'analytics_snapshot_granted',analytics_snapshot_granted,
      'analytics_snapshot_missing_or_not_granted',analytics_snapshot_missing_or_not_granted
    ) order by received_day_utc,event_name),'[]'::jsonb) from aggregates)
    else '[]'::jsonb end,
  'is_consent_authority_test',false,
  'is_live_browser_test',false,
  'is_retention_kpi',false
) as r2_optional_consent_metadata_only
from params p cross join volume v cross join totals t;
