begin;

create index if not exists idx_tracking_sources_site_org_fk
  on public.tracking_sources(organization_site_id, organization_id)
  where organization_site_id is not null;

revoke all on function public.resolve_tracking_event_family_v1(text) from public, anon, authenticated;
grant execute on function public.resolve_tracking_event_family_v1(text) to service_role;

alter function public.normalize_tracking_hostname_v1(text)
  set search_path = public, pg_temp;

commit;
