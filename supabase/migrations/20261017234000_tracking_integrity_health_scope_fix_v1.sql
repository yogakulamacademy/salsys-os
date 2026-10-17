begin;

create or replace view public.v_tracking_integrity_health_v1
with (security_invoker=true)
as
select
  o.id as organization_id,
  (
    select count(*)
    from public.raw_event_processing rp
    join public.raw_events re on re.id=rp.raw_event_id and re.organization_id=rp.organization_id
    where rp.organization_id=o.id
      and re.tracking_source_id is not null
      and rp.status='dead_letter'
  ) as dead_letter_total,
  (
    select count(*)
    from public.raw_event_processing rp
    join public.raw_events re on re.id=rp.raw_event_id and re.organization_id=rp.organization_id
    where rp.organization_id=o.id
      and re.tracking_source_id is not null
      and rp.status='failed'
      and (rp.next_retry_at is null or rp.next_retry_at<=now())
  ) as retry_due,
  (
    select count(*) from public.raw_events re
    where re.organization_id=o.id
      and re.tracking_source_id is not null
      and re.event_family is null
  ) as unclassified_events,
  (
    select count(*) from public.raw_events re
    where re.organization_id=o.id
      and re.tracking_source_id is not null
      and coalesce((re.metadata->>'accepted_for_processing')::boolean,true)=false
  ) as quarantined_events,
  (
    select count(*) from public.leads l
    where l.organization_id=o.id
      and l.lead_creation_channel is null
  ) as leads_without_creation_channel,
  (
    select count(*) from public.leads l
    where l.organization_id=o.id
      and not exists(
        select 1 from public.lead_contacts lc
        where lc.organization_id=o.id and lc.lead_id=l.id
      )
  ) as leads_without_contacts,
  (
    select count(*) from public.lead_ingest_events lie
    where lie.organization_id=o.id and lie.status='failed'
  ) as failed_lead_ingest_events,
  (
    select count(*) from public.web_sessions ws
    where ws.organization_id=o.id
      and ws.lead_id is not null
      and not exists(
        select 1 from public.leads l
        where l.id=ws.lead_id and l.organization_id=o.id
      )
  ) as broken_session_lead_links,
  now() as checked_at
from public.organizations o;

revoke all on public.v_tracking_integrity_health_v1 from anon,authenticated;
grant select on public.v_tracking_integrity_health_v1 to service_role;

commit;
