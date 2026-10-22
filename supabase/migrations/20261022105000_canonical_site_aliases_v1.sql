create table if not exists public.organization_site_aliases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  organization_site_id uuid not null,
  hostname text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_site_aliases_site_org_fkey
    foreign key (organization_site_id, organization_id)
    references public.organization_sites(id, organization_id)
    on delete cascade
);

create unique index if not exists organization_site_aliases_hostname_lower_uidx
  on public.organization_site_aliases (lower(hostname));
create index if not exists organization_site_aliases_site_idx
  on public.organization_site_aliases (organization_site_id);

alter table public.organization_site_aliases enable row level security;

create or replace function public.canonical_tracking_hostname_v1(p_hostname text)
returns text
language plpgsql
immutable
set search_path to 'public','pg_temp'
as $$
declare
  v_hostname text := public.normalize_tracking_hostname_v1(p_hostname);
begin
  if v_hostname is null then return null; end if;
  if v_hostname like 'www.%' and length(v_hostname) > 4 then return substr(v_hostname,5); end if;
  return v_hostname;
end;
$$;

create or replace function public.guard_organization_site_alias_claim_v1()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_hostname text := public.normalize_tracking_hostname_v1(new.hostname);
begin
  if v_hostname is null then raise exception 'Invalid alias hostname.' using errcode='22023'; end if;
  new.hostname := v_hostname;
  new.updated_at := now();
  if exists (
    select 1 from public.organization_sites os
    where lower(os.hostname)=v_hostname and os.status='active' and os.id <> new.organization_site_id
  ) then
    raise exception 'Hostname is already registered to another active site.' using errcode='23505';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_organization_site_alias_claim_v1 on public.organization_site_aliases;
create trigger trg_guard_organization_site_alias_claim_v1
before insert or update of hostname, organization_site_id, organization_id
on public.organization_site_aliases
for each row execute function public.guard_organization_site_alias_claim_v1();

create or replace function public.guard_organization_site_primary_claim_v1()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_hostname text := public.normalize_tracking_hostname_v1(new.hostname);
begin
  if v_hostname is null then raise exception 'Invalid site hostname.' using errcode='22023'; end if;
  new.hostname := v_hostname;
  new.updated_at := now();
  if new.status='active' and exists (
    select 1 from public.organization_site_aliases a
    where lower(a.hostname)=v_hostname and a.organization_site_id <> new.id
  ) then
    raise exception 'Hostname is already registered as an alias of another site.' using errcode='23505';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_organization_site_primary_claim_v1 on public.organization_sites;
create trigger trg_guard_organization_site_primary_claim_v1
before insert or update of hostname, status
on public.organization_sites
for each row execute function public.guard_organization_site_primary_claim_v1();

with pairs as (
  select apex.id as canonical_id, apex.organization_id, www.id as duplicate_id,
         www.hostname as alias_hostname, www.public_site_id as legacy_site_id
  from public.organization_sites apex
  join public.organization_sites www
    on www.organization_id=apex.organization_id
   and lower(www.hostname)=lower('www.' || apex.hostname)
  where apex.hostname not like 'www.%' and apex.status='active' and www.status='active'
)
update public.organization_sites os
set status='inactive',
    settings=coalesce(os.settings,'{}'::jsonb) || jsonb_build_object('merged_alias_into_site_id',p.canonical_id),
    updated_at=now()
from pairs p
where os.id=p.duplicate_id;

with pairs as (
  select apex.id as canonical_id, apex.organization_id, www.hostname as alias_hostname
  from public.organization_sites apex
  join public.organization_sites www
    on www.organization_id=apex.organization_id
   and lower(www.hostname)=lower('www.' || apex.hostname)
  where apex.hostname not like 'www.%'
    and apex.status='active'
    and www.status='inactive'
    and coalesce(www.settings->>'merged_alias_into_site_id','')=apex.id::text
)
insert into public.organization_site_aliases(organization_id,organization_site_id,hostname)
select organization_id,canonical_id,alias_hostname from pairs
on conflict do nothing;

with pairs as (
  select apex.id as canonical_id, www.public_site_id as legacy_site_id
  from public.organization_sites apex
  join public.organization_sites www
    on www.organization_id=apex.organization_id
   and lower(www.hostname)=lower('www.' || apex.hostname)
  where apex.hostname not like 'www.%'
    and apex.status='active'
    and www.status='inactive'
    and coalesce(www.settings->>'merged_alias_into_site_id','')=apex.id::text
)
update public.organization_sites os
set settings=coalesce(os.settings,'{}'::jsonb) || jsonb_build_object(
      'legacy_public_site_ids',
      case
        when coalesce(os.settings->'legacy_public_site_ids','[]'::jsonb) @> jsonb_build_array(p.legacy_site_id)
          then coalesce(os.settings->'legacy_public_site_ids','[]'::jsonb)
        else coalesce(os.settings->'legacy_public_site_ids','[]'::jsonb) || jsonb_build_array(p.legacy_site_id)
      end
    ),
    updated_at=now()
from pairs p
where os.id=p.canonical_id;

with pairs as (
  select apex.id as canonical_id, www.id as duplicate_id, www.public_site_id as legacy_site_id
  from public.organization_sites apex
  join public.organization_sites www
    on www.organization_id=apex.organization_id
   and lower(www.hostname)=lower('www.' || apex.hostname)
  where apex.hostname not like 'www.%'
    and apex.status='active'
    and www.status='inactive'
    and coalesce(www.settings->>'merged_alias_into_site_id','')=apex.id::text
)
update public.tracking_sources s
set status='revoked',
    metadata=coalesce(s.metadata,'{}'::jsonb) || jsonb_build_object(
      'merged_alias',true,
      'merged_into_site_id',p.canonical_id,
      'legacy_public_site_id',p.legacy_site_id
    ),
    updated_at=now()
from pairs p
where s.organization_site_id=p.duplicate_id and s.source_type='website';

update public.tracking_sources s
set metadata=coalesce(s.metadata,'{}'::jsonb) || jsonb_build_object(
      'public_site_id',os.public_site_id,
      'environment',os.environment,
      'site_aliases',coalesce((select jsonb_agg(a.hostname order by a.hostname) from public.organization_site_aliases a where a.organization_site_id=os.id),'[]'::jsonb)
    ),
    updated_at=now()
from public.organization_sites os
where s.organization_site_id=os.id
  and s.organization_id=os.organization_id
  and s.source_type='website'
  and s.status='active';

create or replace function public.resolve_tracking_source_by_site_v1(p_origin text, p_public_site_id text default null)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_hostname text := public.normalize_tracking_hostname_v1(p_origin);
  v_site_code text := nullif(upper(trim(coalesce(p_public_site_id,''))), '');
  v_source_id uuid; v_organization_id uuid; v_site_id uuid; v_public_site_id text;
  v_site_environment text; v_source_key text; v_source_system text; v_site_hostname text;
  v_max_payload_bytes integer; v_rate_limit_per_minute integer;
begin
  if v_hostname is null then return jsonb_build_object('ok',false,'reason','invalid_origin'); end if;
  if v_site_code is not null and v_site_code !~ '^SAL-[A-F0-9]{10}$' then
    return jsonb_build_object('ok',false,'reason','invalid_public_site_id');
  end if;

  select s.id,s.organization_id,os.id,os.public_site_id,os.environment,
         s.source_key,s.source_system,os.hostname,s.max_payload_bytes,s.rate_limit_per_minute
  into v_source_id,v_organization_id,v_site_id,v_public_site_id,v_site_environment,
       v_source_key,v_source_system,v_site_hostname,v_max_payload_bytes,v_rate_limit_per_minute
  from public.tracking_sources s
  join public.organization_sites os on os.id=s.organization_site_id and os.organization_id=s.organization_id
  join public.organizations o on o.id=s.organization_id
  where s.status='active' and s.source_type='website' and s.auth_mode='origin'
    and os.status='active' and o.status='active'
    and (lower(os.hostname)=v_hostname or exists(
      select 1 from public.organization_site_aliases a
      where a.organization_site_id=os.id and lower(a.hostname)=v_hostname
    ))
    and (v_site_code is null or os.public_site_id=v_site_code or
      coalesce(os.settings->'legacy_public_site_ids','[]'::jsonb) @> jsonb_build_array(v_site_code))
  limit 1;

  if v_source_id is null then
    return jsonb_build_object('ok',false,'reason',case when v_site_code is null then 'tracking_source_not_found' else 'site_id_origin_mismatch' end,'hostname',v_hostname);
  end if;

  return jsonb_build_object(
    'ok',true,'tracking_source_id',v_source_id,'organization_id',v_organization_id,
    'organization_site_id',v_site_id,'public_site_id',v_public_site_id,
    'site_id_verified',v_site_code is not null,'site_environment',v_site_environment,
    'source_key',v_source_key,'source_system',v_source_system,'hostname',v_site_hostname,
    'observed_hostname',v_hostname,'max_payload_bytes',v_max_payload_bytes,
    'rate_limit_per_minute',v_rate_limit_per_minute
  );
end;
$$;

create or replace function public.resolve_tracking_source_by_origin_v1(p_origin text)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public','pg_temp'
as $$
begin
  return public.resolve_tracking_source_by_site_v1(p_origin,null);
end;
$$;

create or replace function public.provision_browser_tracking_source_v1(
  p_organization_id uuid, p_name text, p_hostname text, p_source_key text,
  p_source_system text, p_platform text, p_max_payload_bytes integer,
  p_rate_limit_per_minute integer, p_privacy_notice_version text,
  p_provisioned_by uuid, p_environment text default 'production'
)
returns jsonb
language plpgsql
set search_path to 'public','pg_temp'
as $$
declare
  v_input_hostname text := public.normalize_tracking_hostname_v1(p_hostname);
  v_canonical_hostname text := public.canonical_tracking_hostname_v1(p_hostname);
  v_site public.organization_sites%rowtype;
  v_source public.tracking_sources%rowtype;
  v_org_status text;
begin
  if v_input_hostname is null or v_canonical_hostname is null then raise exception 'Invalid website hostname.' using errcode='22023'; end if;
  if coalesce(p_environment,'') not in ('production','staging','development') then raise exception 'Invalid site environment.' using errcode='22023'; end if;
  select status into v_org_status from public.organizations where id=p_organization_id;
  if v_org_status is distinct from 'active' then raise exception 'Organization is not active.' using errcode='42501'; end if;

  select os.* into v_site
  from public.organization_sites os
  where os.status='active'
    and (lower(os.hostname)=v_canonical_hostname or exists(
      select 1 from public.organization_site_aliases a
      where a.organization_site_id=os.id and lower(a.hostname) in (v_input_hostname,v_canonical_hostname)
    ))
  limit 1;

  if v_site.id is not null and v_site.organization_id <> p_organization_id then
    raise exception 'Hostname is already registered to another organization.' using errcode='23505';
  end if;

  if v_site.id is null then
    if exists(select 1 from public.organization_sites os where os.status='active' and lower(os.hostname) in (v_input_hostname,v_canonical_hostname))
       or exists(select 1 from public.organization_site_aliases a where lower(a.hostname) in (v_input_hostname,v_canonical_hostname)) then
      raise exception 'Hostname is already registered to another organization.' using errcode='23505';
    end if;
    insert into public.organization_sites(organization_id,hostname,status,environment,settings,updated_at)
    values(p_organization_id,v_canonical_hostname,'active',p_environment,jsonb_build_object('tracking_managed',true),now())
    returning * into v_site;
  else
    update public.organization_sites
    set status='active',environment=p_environment,
        settings=coalesce(settings,'{}'::jsonb)||jsonb_build_object('tracking_managed',true),updated_at=now()
    where id=v_site.id returning * into v_site;
  end if;

  if v_input_hostname <> v_site.hostname then
    insert into public.organization_site_aliases(organization_id,organization_site_id,hostname)
    values(p_organization_id,v_site.id,v_input_hostname)
    on conflict (lower(hostname)) do nothing;
  end if;

  if v_site.hostname not like 'www.%'
     and not exists(select 1 from public.organization_sites os where os.status='active' and lower(os.hostname)=lower('www.'||v_site.hostname) and os.id<>v_site.id)
     and not exists(select 1 from public.organization_site_aliases a where lower(a.hostname)=lower('www.'||v_site.hostname) and a.organization_site_id<>v_site.id) then
    insert into public.organization_site_aliases(organization_id,organization_site_id,hostname)
    values(p_organization_id,v_site.id,'www.'||v_site.hostname)
    on conflict (lower(hostname)) do nothing;
  end if;

  select * into v_source from public.tracking_sources
  where organization_id=p_organization_id and organization_site_id=v_site.id
    and source_type='website' and auth_mode='origin'
  order by case when status='active' then 0 else 1 end, created_at
  limit 1;

  if v_source.id is null then
    insert into public.tracking_sources(
      organization_id,organization_site_id,name,source_type,source_system,source_key,auth_mode,hostname,
      secret_hash,status,allowed_event_prefixes,max_payload_bytes,rate_limit_per_minute,privacy_mode,honor_gpc,
      require_consent_for_optional,privacy_notice_version,metadata
    ) values(
      p_organization_id,v_site.id,left(coalesce(nullif(trim(p_name),''),'Website: '||v_site.hostname),120),
      'website',coalesce(nullif(trim(p_source_system),''),'website'),p_source_key,'origin',v_site.hostname,null,'active',array['web.']::text[],
      greatest(1024,least(coalesce(p_max_payload_bytes,32768),1048576)),
      greatest(1,least(coalesce(p_rate_limit_per_minute,600),100000)),
      'strict',true,true,nullif(trim(p_privacy_notice_version),''),
      jsonb_build_object('provisioned_by',p_provisioned_by,'provisioned_via','provision_browser_tracking_source_v1',
        'platform',coalesce(nullif(trim(p_platform),''),'custom_web'),'credential_class','origin_bound_browser',
        'authority','non_authoritative_client_telemetry','managed_by','organization_sites','organization_site_id',v_site.id,
        'public_site_id',v_site.public_site_id,'environment',v_site.environment,
        'site_aliases',coalesce((select jsonb_agg(a.hostname order by a.hostname) from public.organization_site_aliases a where a.organization_site_id=v_site.id),'[]'::jsonb))
    ) returning * into v_source;
  else
    update public.tracking_sources
    set name=left(coalesce(nullif(trim(p_name),''),name),120),
        source_system=coalesce(nullif(trim(p_source_system),''),source_system),hostname=v_site.hostname,status='active',
        allowed_event_prefixes=array['web.']::text[],
        max_payload_bytes=greatest(1024,least(coalesce(p_max_payload_bytes,max_payload_bytes),1048576)),
        rate_limit_per_minute=greatest(1,least(coalesce(p_rate_limit_per_minute,rate_limit_per_minute),100000)),
        privacy_notice_version=coalesce(nullif(trim(p_privacy_notice_version),''),privacy_notice_version),
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('platform',coalesce(nullif(trim(p_platform),''),'custom_web'),
          'managed_by','organization_sites','organization_site_id',v_site.id,'public_site_id',v_site.public_site_id,
          'environment',v_site.environment,'site_aliases',coalesce((select jsonb_agg(a.hostname order by a.hostname) from public.organization_site_aliases a where a.organization_site_id=v_site.id),'[]'::jsonb)),
        updated_at=now()
    where id=v_source.id returning * into v_source;
  end if;

  return jsonb_build_object('ok',true,'organization_id',p_organization_id,'organization_site_id',v_site.id,
    'public_site_id',v_site.public_site_id,'hostname',v_site.hostname,
    'aliases',coalesce((select jsonb_agg(a.hostname order by a.hostname) from public.organization_site_aliases a where a.organization_site_id=v_site.id),'[]'::jsonb),
    'environment',v_site.environment,'tracking_source_id',v_source.id,'source_key',v_source.source_key,'status',v_source.status);
end;
$$;

revoke all on function public.resolve_tracking_source_by_site_v1(text,text) from public, anon, authenticated;
revoke all on function public.resolve_tracking_source_by_origin_v1(text) from public, anon, authenticated;
grant execute on function public.resolve_tracking_source_by_site_v1(text,text) to service_role;
grant execute on function public.resolve_tracking_source_by_origin_v1(text) to service_role;
