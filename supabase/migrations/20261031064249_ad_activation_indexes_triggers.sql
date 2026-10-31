begin;

create index ad_audience_definitions_org_status_idx
  on public.ad_audience_definitions (organization_id, status, updated_at desc);
create index ad_audience_destinations_org_status_idx
  on public.ad_audience_destinations (organization_id, status, updated_at desc);
create index ad_audience_memberships_org_audience_status_idx
  on public.ad_audience_memberships (organization_id, audience_id, status, updated_at desc);
create index ad_audience_memberships_person_idx
  on public.ad_audience_memberships (organization_id, person_id, status);
create index ad_activation_outbox_claim_idx
  on public.ad_activation_outbox (organization_id, status, next_attempt_at, created_at)
  where status in ('queued','retry');
create index ad_activation_outbox_person_idx
  on public.ad_activation_outbox (organization_id, person_id, created_at desc);
create index ad_activation_attempts_outbox_idx
  on public.ad_activation_attempts (outbox_id, attempt_number desc);

create trigger ad_audience_definitions_set_updated_at
before update on public.ad_audience_definitions
for each row execute function public.set_updated_at();

create trigger ad_audience_destinations_set_updated_at
before update on public.ad_audience_destinations
for each row execute function public.set_updated_at();

create trigger ad_audience_memberships_set_updated_at
before update on public.ad_audience_memberships
for each row execute function public.set_updated_at();

create trigger ad_activation_outbox_set_updated_at
before update on public.ad_activation_outbox
for each row execute function public.set_updated_at();

commit;
