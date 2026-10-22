create or replace function public.sync_tracking_source_from_organization_site_v1()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_hostname text := public.normalize_tracking_hostname_v1(new.hostname);
  v_status text := case when new.status='active' then 'active' else 'paused' end;
begin
  if v_hostname is null then
    return new;
  end if;

  insert into public.tracking_sources(
    organization_id,
    organization_site_id,
    name,
    source_type,
    source_system,
    source_key,
    auth_mode,
    hostname,
    status,
    allowed_event_prefixes,
    max_payload_bytes,
    rate_limit_per_minute,
    metadata
  ) values (
    new.organization_id,
    new.id,
    'Website: ' || v_hostname,
    'website',
    'website',
    'web_' || substr(encode(extensions.digest(new.organization_id::text || ':' || v_hostname,'sha256'),'hex'),1,32),
    'origin',
    v_hostname,
    v_status,
    array['web.']::text[],
    32768,
    1200,
    jsonb_build_object(
      'managed_by','organization_sites',
      'organization_site_id',new.id,
      'environment',coalesce(new.environment,'production')
    )
  )
  on conflict (organization_id,hostname) where hostname is not null
  do update set
    organization_site_id=excluded.organization_site_id,
    name=excluded.name,
    status=excluded.status,
    allowed_event_prefixes=excluded.allowed_event_prefixes,
    metadata=coalesce(public.tracking_sources.metadata,'{}'::jsonb) || excluded.metadata,
    updated_at=now();

  return new;
end;
$function$;

revoke all on function public.sync_tracking_source_from_organization_site_v1() from public, anon, authenticated;
grant execute on function public.sync_tracking_source_from_organization_site_v1() to service_role;
