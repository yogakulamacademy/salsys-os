begin;

create view public.v_ad_activation_health_v1
with (security_invoker = true)
as
select
  o.id as organization_id,
  (select count(*) from public.ad_audience_destinations d where d.organization_id=o.id and d.status='active') as active_destinations,
  (select count(*) from public.ad_audience_memberships m where m.organization_id=o.id and m.status='active') as active_memberships,
  (select count(*) from public.ad_activation_outbox q where q.organization_id=o.id and q.status in ('queued','retry')) as pending_deliveries,
  (select count(*) from public.ad_activation_outbox q where q.organization_id=o.id and q.status='processing') as processing_deliveries,
  (select count(*) from public.ad_activation_outbox q where q.organization_id=o.id and q.status='failed') as failed_deliveries,
  (select count(*) from public.ad_activation_outbox q where q.organization_id=o.id and q.status='skipped') as skipped_deliveries,
  (select max(q.delivered_at) from public.ad_activation_outbox q where q.organization_id=o.id) as last_delivered_at,
  now() as checked_at
from public.organizations o;

revoke all on public.v_ad_activation_health_v1 from public, anon, authenticated;
grant select on public.v_ad_activation_health_v1 to authenticated, service_role;

comment on column public.ad_audience_memberships.safe_snapshot is
'Allowlisted non-sensitive rule/membership metadata only. Never copy CRM notes, messages, health data, pregnancy-related data, financial data, documents, or raw contact identifiers.';

comment on table public.ad_activation_outbox is
'PII-minimized provider-neutral audience activation queue. Stores canonical IDs and safe business metadata only; raw contact identifiers are resolved at send time.';
comment on column public.ad_activation_outbox.safe_metadata is
'Allowlisted non-sensitive campaign/course/stage metadata only. Never store CRM notes, message content, health data, payment data, documents, or raw contact identifiers here.';

commit;
