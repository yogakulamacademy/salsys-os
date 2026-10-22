create or replace function public.generate_salsys_public_site_id_v1()
returns text
language plpgsql
volatile
set search_path to 'public','pg_temp'
as $$
declare
  v_id text;
begin
  loop
    v_id := 'SAL-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    exit when not exists (
      select 1 from public.organization_sites where public_site_id = v_id
    );
  end loop;
  return v_id;
end;
$$;

alter table public.organization_sites
  add column if not exists public_site_id text;

update public.organization_sites
set public_site_id = public.generate_salsys_public_site_id_v1()
where public_site_id is null;

alter table public.organization_sites
  alter column public_site_id set default public.generate_salsys_public_site_id_v1(),
  alter column public_site_id set not null;

create unique index if not exists organization_sites_public_site_id_uidx
  on public.organization_sites (public_site_id);

alter table public.organization_sites
  drop constraint if exists organization_sites_public_site_id_format_chk;

alter table public.organization_sites
  add constraint organization_sites_public_site_id_format_chk
  check (public_site_id ~ '^SAL-[A-F0-9]{10}$');

create or replace function public.resolve_tracking_source_by_site_v1(
  p_origin text,
  p_public_site_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_hostname text := public.normalize_tracking_hostname_v1(p_origin);
  v_site_code text := nullif(upper(trim(coalesce(p_public_site_id,''))), '');
  v_source_id uuid;
  v_organization_id uuid;
  v_site_id uuid;
  v_public_site_id text;
  v_site_environment text;
  v_source_key text;
  v_source_system text;
  v_site_hostname text;
  v_max_payload_bytes integer;
  v_rate_limit_per_minute integer;
begin
  if v_hostname is null then
    return jsonb_build_object('ok',false,'reason','invalid_origin');
  end if;

  if v_site_code is not null and v_site_code !~ '^SAL-[A-F0-9]{10}$' then
    return jsonb_build_object('ok',false,'reason','invalid_public_site_id');
  end if;

  select
    s.id,
    s.organization_id,
    os.id,
    os.public_site_id,
    os.environment,
    s.source_key,
    s.source_system,
    os.hostname,
    s.max_payload_bytes,
    s.rate_limit_per_minute
  into
    v_source_id,
    v_organization_id,
    v_site_id,
    v_public_site_id,
    v_site_environment,
    v_source_key,
    v_source_system,
    v_site_hostname,
    v_max_payload_bytes,
    v_rate_limit_per_minute
  from public.tracking_sources s
  join public.organization_sites os
    on os.id = s.organization_site_id
   and os.organization_id = s.organization_id
  join public.organizations o
    on o.id = s.organization_id
  where s.status = 'active'
    and s.source_type = 'website'
    and s.auth_mode = 'origin'
    and os.status = 'active'
    and o.status = 'active'
    and lower(os.hostname) = v_hostname
    and lower(s.hostname) = v_hostname
    and (v_site_code is null or os.public_site_id = v_site_code)
  limit 1;

  if v_source_id is null then
    return jsonb_build_object(
      'ok',false,
      'reason',case when v_site_code is null then 'tracking_source_not_found' else 'site_id_origin_mismatch' end,
      'hostname',v_hostname
    );
  end if;

  return jsonb_build_object(
    'ok',true,
    'tracking_source_id',v_source_id,
    'organization_id',v_organization_id,
    'organization_site_id',v_site_id,
    'public_site_id',v_public_site_id,
    'site_id_verified',v_site_code is not null,
    'site_environment',v_site_environment,
    'source_key',v_source_key,
    'source_system',v_source_system,
    'hostname',v_site_hostname,
    'max_payload_bytes',v_max_payload_bytes,
    'rate_limit_per_minute',v_rate_limit_per_minute
  );
end;
$$;

revoke all on function public.resolve_tracking_source_by_site_v1(text,text) from public;
revoke all on function public.resolve_tracking_source_by_site_v1(text,text) from anon;
revoke all on function public.resolve_tracking_source_by_site_v1(text,text) from authenticated;
grant execute on function public.resolve_tracking_source_by_site_v1(text,text) to service_role;

create or replace function public.provision_browser_tracking_source_v1(
  p_organization_id uuid,
  p_name text,
  p_hostname text,
  p_source_key text,
  p_source_system text,
  p_platform text,
  p_max_payload_bytes integer,
  p_rate_limit_per_minute integer,
  p_privacy_notice_version text,
  p_provisioned_by uuid,
  p_environment text default 'production'
)
returns jsonb
language plpgsql
set search_path to 'public','pg_temp'
as $$
declare
  v_hostname text := public.normalize_tracking_hostname_v1(p_hostname);
  v_site public.organization_sites%rowtype;
  v_source public.tracking_sources%rowtype;
  v_org_status text;
begin
  if v_hostname is null then
    raise exception 'Invalid website hostname.' using errcode = '22023';
  end if;

  if coalesce(p_environment,'') not in ('production','staging','development') then
    raise exception 'Invalid site environment.' using errcode = '22023';
  end if;

  select status into v_org_status from public.organizations where id = p_organization_id;
  if v_org_status is distinct from 'active' then
    raise exception 'Organization is not active.' using errcode = '42501';
  end if;

  select * into v_site
  from public.organization_sites
  where lower(hostname) = v_hostname
  limit 1;

  if v_site.id is not null and v_site.organization_id <> p_organization_id then
    raise exception 'Hostname is already registered to another organization.' using errcode = '23505';
  end if;

  if v_site.id is null then
    insert into public.organization_sites (
      organization_id, hostname, status, environment, settings, updated_at
    ) values (
      p_organization_id, v_hostname, 'active', p_environment,
      jsonb_build_object('tracking_managed', true), now()
    ) returning * into v_site;
  else
    update public.organization_sites
    set status = 'active',
        environment = p_environment,
        settings = coalesce(settings,'{}'::jsonb) || jsonb_build_object('tracking_managed', true),
        updated_at = now()
    where id = v_site.id
    returning * into v_site;
  end if;

  select * into v_source
  from public.tracking_sources
  where organization_id = p_organization_id
    and organization_site_id = v_site.id
    and source_type = 'website'
    and auth_mode = 'origin'
  limit 1;

  if v_source.id is null then
    insert into public.tracking_sources (
      organization_id, organization_site_id, name, source_type, source_system,
      source_key, auth_mode, hostname, secret_hash, status, allowed_event_prefixes,
      max_payload_bytes, rate_limit_per_minute, privacy_mode, honor_gpc,
      require_consent_for_optional, privacy_notice_version, metadata
    ) values (
      p_organization_id, v_site.id,
      left(coalesce(nullif(trim(p_name),''),'Website: ' || v_hostname),120),
      'website', coalesce(nullif(trim(p_source_system),''),'website'), p_source_key,
      'origin', v_hostname, null, 'active', array['web.']::text[],
      greatest(1024, least(coalesce(p_max_payload_bytes,32768),1048576)),
      greatest(1, least(coalesce(p_rate_limit_per_minute,600),100000)),
      'strict', true, true, nullif(trim(p_privacy_notice_version),''),
      jsonb_build_object(
        'provisioned_by', p_provisioned_by,
        'provisioned_via', 'provision_browser_tracking_source_v1',
        'platform', coalesce(nullif(trim(p_platform),''),'custom_web'),
        'credential_class', 'origin_bound_browser',
        'authority', 'non_authoritative_client_telemetry',
        'managed_by', 'organization_sites',
        'organization_site_id', v_site.id,
        'public_site_id', v_site.public_site_id,
        'environment', v_site.environment
      )
    ) returning * into v_source;
  else
    update public.tracking_sources
    set name = left(coalesce(nullif(trim(p_name),''),name),120),
        source_system = coalesce(nullif(trim(p_source_system),''),source_system),
        hostname = v_hostname,
        status = 'active',
        allowed_event_prefixes = array['web.']::text[],
        max_payload_bytes = greatest(1024, least(coalesce(p_max_payload_bytes,max_payload_bytes),1048576)),
        rate_limit_per_minute = greatest(1, least(coalesce(p_rate_limit_per_minute,rate_limit_per_minute),100000)),
        privacy_notice_version = coalesce(nullif(trim(p_privacy_notice_version),''),privacy_notice_version),
        metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
          'platform', coalesce(nullif(trim(p_platform),''),'custom_web'),
          'managed_by', 'organization_sites',
          'organization_site_id', v_site.id,
          'public_site_id', v_site.public_site_id,
          'environment', v_site.environment
        ),
        updated_at = now()
    where id = v_source.id
    returning * into v_source;
  end if;

  return jsonb_build_object(
    'ok', true,
    'organization_id', p_organization_id,
    'organization_site_id', v_site.id,
    'public_site_id', v_site.public_site_id,
    'hostname', v_site.hostname,
    'environment', v_site.environment,
    'tracking_source_id', v_source.id,
    'source_key', v_source.source_key,
    'status', v_source.status
  );
end;
$$;