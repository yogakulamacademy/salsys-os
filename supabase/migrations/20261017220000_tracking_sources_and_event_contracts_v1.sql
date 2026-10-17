begin;

create table if not exists public.tracking_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  source_type text not null check (source_type in ('website','api','webhook','system')),
  source_system text not null,
  source_key text not null unique default ('src_' || replace(gen_random_uuid()::text,'-','')),
  auth_mode text not null check (auth_mode in ('origin','secret','hmac','internal')),
  hostname text,
  secret_hash text,
  secret_version integer not null default 1 check (secret_version >= 1),
  status text not null default 'active' check (status in ('active','paused','revoked')),
  allowed_event_prefixes text[] not null default '{}'::text[],
  max_payload_bytes integer not null default 32768 check (max_payload_bytes between 1024 and 1048576),
  rate_limit_per_minute integer not null default 600 check (rate_limit_per_minute between 1 and 100000),
  accepted_event_count bigint not null default 0,
  duplicate_event_count bigint not null default 0,
  rejected_event_count bigint not null default 0,
  last_seen_at timestamptz,
  last_rejected_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((auth_mode = 'origin' and hostname is not null and secret_hash is null)
      or (auth_mode in ('secret','hmac') and secret_hash is not null)
      or (auth_mode = 'internal'))
);

create unique index if not exists uq_tracking_sources_org_hostname
  on public.tracking_sources(organization_id, hostname)
  where hostname is not null;
create index if not exists idx_tracking_sources_org_status
  on public.tracking_sources(organization_id, status, source_type);
create index if not exists idx_tracking_sources_hostname
  on public.tracking_sources(lower(hostname))
  where hostname is not null;

create table if not exists public.tracking_event_families (
  id uuid primary key default gen_random_uuid(),
  family_key text not null unique,
  event_prefix text not null unique,
  processor_name text not null,
  default_schema_version integer not null default 1 check (default_schema_version >= 1),
  allow_browser boolean not null default false,
  allow_server boolean not null default true,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (event_prefix ~ '^[a-z][a-z0-9_]*\.$')
);

insert into public.tracking_event_families
  (family_key,event_prefix,processor_name,allow_browser,allow_server,metadata)
values
  ('web','web.','website_event_processor',true,true,jsonb_build_object('purpose','browser/session behavior')),
  ('lead','lead.','lead_event_processor',false,true,jsonb_build_object('purpose','lead lifecycle')),
  ('conversation','conversation.','conversation_event_processor',false,true,jsonb_build_object('purpose','conversation lifecycle')),
  ('message','message.','message_event_processor',false,true,jsonb_build_object('purpose','message lifecycle')),
  ('booking','booking.','booking_event_processor',false,true,jsonb_build_object('purpose','booking lifecycle')),
  ('payment','payment.','payment_event_processor',false,true,jsonb_build_object('purpose','payment lifecycle')),
  ('enrollment','enrollment.','enrollment_event_processor',false,true,jsonb_build_object('purpose','enrollment lifecycle'))
on conflict (family_key) do update
set event_prefix=excluded.event_prefix,
    processor_name=excluded.processor_name,
    allow_browser=excluded.allow_browser,
    allow_server=excluded.allow_server,
    active=true,
    updated_at=now();

create table if not exists public.tracking_event_contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  event_name text not null,
  schema_version integer not null default 1 check (schema_version >= 1),
  family_key text not null references public.tracking_event_families(family_key),
  status text not null default 'active' check (status in ('active','deprecated','blocked')),
  required_fields text[] not null default '{}'::text[],
  pii_policy jsonb not null default '{}'::jsonb,
  processing_config jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (event_name ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$')
);

create unique index if not exists uq_tracking_event_contract_global
  on public.tracking_event_contracts(event_name,schema_version)
  where organization_id is null;
create unique index if not exists uq_tracking_event_contract_org
  on public.tracking_event_contracts(organization_id,event_name,schema_version)
  where organization_id is not null;
create index if not exists idx_tracking_event_contract_lookup
  on public.tracking_event_contracts(event_name,schema_version,status);

insert into public.tracking_event_contracts
  (organization_id,event_name,schema_version,family_key,required_fields,processing_config,metadata)
values
  (null,'web.session_started',1,'web',array['anonymousVisitorId','sessionKey'],jsonb_build_object('canonical_processor','process_website_raw_event'),jsonb_build_object('system_contract',true)),
  (null,'web.page_viewed',1,'web',array['anonymousVisitorId','sessionKey'],jsonb_build_object('canonical_processor','process_website_raw_event'),jsonb_build_object('system_contract',true)),
  (null,'web.cta_clicked',1,'web',array['anonymousVisitorId','sessionKey'],jsonb_build_object('canonical_processor','process_website_raw_event'),jsonb_build_object('system_contract',true)),
  (null,'web.form_started',1,'web',array['anonymousVisitorId','sessionKey'],jsonb_build_object('canonical_processor','process_website_raw_event'),jsonb_build_object('system_contract',true)),
  (null,'web.form_submitted',1,'web',array['anonymousVisitorId','sessionKey'],jsonb_build_object('canonical_processor','process_website_raw_event'),jsonb_build_object('system_contract',true)),
  (null,'lead.created',1,'lead',array[]::text[],jsonb_build_object('canonical',true),jsonb_build_object('system_contract',true)),
  (null,'lead.updated',1,'lead',array[]::text[],jsonb_build_object('canonical',true),jsonb_build_object('system_contract',true)),
  (null,'lead.stage_changed',1,'lead',array[]::text[],jsonb_build_object('canonical',true),jsonb_build_object('system_contract',true)),
  (null,'conversation.started',1,'conversation',array[]::text[],jsonb_build_object('canonical',true),jsonb_build_object('system_contract',true)),
  (null,'message.received',1,'message',array[]::text[],jsonb_build_object('canonical',true),jsonb_build_object('system_contract',true)),
  (null,'message.sent',1,'message',array[]::text[],jsonb_build_object('canonical',true),jsonb_build_object('system_contract',true)),
  (null,'booking.started',1,'booking',array[]::text[],jsonb_build_object('canonical',true),jsonb_build_object('system_contract',true)),
  (null,'booking.completed',1,'booking',array[]::text[],jsonb_build_object('canonical',true),jsonb_build_object('system_contract',true)),
  (null,'payment.started',1,'payment',array[]::text[],jsonb_build_object('canonical',true),jsonb_build_object('system_contract',true)),
  (null,'payment.completed',1,'payment',array[]::text[],jsonb_build_object('canonical',true),jsonb_build_object('system_contract',true)),
  (null,'payment.failed',1,'payment',array[]::text[],jsonb_build_object('canonical',true),jsonb_build_object('system_contract',true)),
  (null,'enrollment.completed',1,'enrollment',array[]::text[],jsonb_build_object('canonical',true),jsonb_build_object('system_contract',true))
on conflict do nothing;

alter table public.raw_events
  add column if not exists tracking_source_id uuid references public.tracking_sources(id),
  add column if not exists event_family text,
  add column if not exists contract_version integer;

create index if not exists idx_raw_events_tracking_source
  on public.raw_events(organization_id,tracking_source_id,received_at desc)
  where tracking_source_id is not null;
create index if not exists idx_raw_events_family
  on public.raw_events(organization_id,event_family,received_at desc)
  where event_family is not null;

create or replace function public.normalize_tracking_hostname_v1(p_value text)
returns text
language sql
immutable
as $$
  select nullif(lower(regexp_replace(regexp_replace(btrim(coalesce(p_value,'')),'^https?://','','i'),'/.*$','','g')), '');
$$;

create or replace function public.resolve_tracking_event_family_v1(p_event_name text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_family public.tracking_event_families%rowtype;
begin
  if nullif(btrim(coalesce(p_event_name,'')),'') is null then
    return jsonb_build_object('ok',false,'reason','event_name_required');
  end if;

  select f.* into v_family
  from public.tracking_event_families f
  where f.active=true
    and lower(p_event_name) like f.event_prefix || '%'
  order by length(f.event_prefix) desc
  limit 1;

  if v_family.id is null then
    return jsonb_build_object('ok',false,'reason','unregistered_event_family');
  end if;

  return jsonb_build_object(
    'ok',true,
    'family_key',v_family.family_key,
    'event_prefix',v_family.event_prefix,
    'processor_name',v_family.processor_name,
    'default_schema_version',v_family.default_schema_version,
    'allow_browser',v_family.allow_browser,
    'allow_server',v_family.allow_server
  );
end;
$$;

create or replace function public.resolve_tracking_source_by_origin_v1(p_origin text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_hostname text := public.normalize_tracking_hostname_v1(p_origin);
  v_source public.tracking_sources%rowtype;
begin
  if v_hostname is null then
    return jsonb_build_object('ok',false,'reason','invalid_origin');
  end if;

  select s.* into v_source
  from public.tracking_sources s
  where s.status='active'
    and s.auth_mode='origin'
    and lower(s.hostname)=v_hostname
  limit 1;

  if v_source.id is null then
    return jsonb_build_object('ok',false,'reason','tracking_source_not_found','hostname',v_hostname);
  end if;

  return jsonb_build_object(
    'ok',true,
    'tracking_source_id',v_source.id,
    'organization_id',v_source.organization_id,
    'source_key',v_source.source_key,
    'source_system',v_source.source_system,
    'hostname',v_source.hostname,
    'max_payload_bytes',v_source.max_payload_bytes,
    'rate_limit_per_minute',v_source.rate_limit_per_minute
  );
end;
$$;

create or replace function public.ingest_tracking_event_v1(
  p_organization_id uuid,
  p_tracking_source_id uuid,
  p_source_event_id text,
  p_event_name text,
  p_ingestion_method text default 'server',
  p_occurred_at timestamptz default null,
  p_anonymous_visitor_id text default null,
  p_session_key text default null,
  p_external_message_id text default null,
  p_site text default null,
  p_payload jsonb default '{}'::jsonb,
  p_context jsonb default '{}'::jsonb,
  p_metadata jsonb default '{}'::jsonb,
  p_schema_version integer default 1,
  p_is_browser boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source public.tracking_sources%rowtype;
  v_family jsonb;
  v_family_key text;
  v_contract_status text := 'family_fallback';
  v_raw jsonb;
  v_event_id uuid;
  v_created boolean;
  v_allowed boolean := true;
  v_reason text;
  v_payload_bytes integer;
begin
  if p_organization_id is null or p_tracking_source_id is null then
    raise exception 'organization_id and tracking_source_id are required';
  end if;

  select * into v_source
  from public.tracking_sources s
  where s.id=p_tracking_source_id
    and s.organization_id=p_organization_id
    and s.status='active';

  if v_source.id is null then
    raise exception 'tracking source not found or inactive';
  end if;

  if nullif(btrim(coalesce(p_source_event_id,'')),'') is null then
    raise exception 'source_event_id is required';
  end if;

  if nullif(btrim(coalesce(p_event_name,'')),'') is null
     or lower(btrim(p_event_name)) !~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$' then
    raise exception 'invalid event name';
  end if;

  if coalesce(p_schema_version,0) < 1 then
    raise exception 'schema_version must be >= 1';
  end if;

  v_payload_bytes := octet_length(coalesce(p_payload,'{}'::jsonb)::text)
                   + octet_length(coalesce(p_context,'{}'::jsonb)::text)
                   + octet_length(coalesce(p_metadata,'{}'::jsonb)::text);

  if v_payload_bytes > v_source.max_payload_bytes then
    update public.tracking_sources
    set rejected_event_count=rejected_event_count+1,
        last_rejected_at=now(),
        updated_at=now()
    where id=v_source.id;
    raise exception 'payload exceeds source limit';
  end if;

  v_family := public.resolve_tracking_event_family_v1(lower(btrim(p_event_name)));

  if coalesce((v_family->>'ok')::boolean,false) then
    v_family_key := v_family->>'family_key';

    if p_is_browser and not coalesce((v_family->>'allow_browser')::boolean,false) then
      v_allowed := false;
      v_reason := 'event_family_not_allowed_for_browser';
    elsif not p_is_browser and not coalesce((v_family->>'allow_server')::boolean,false) then
      v_allowed := false;
      v_reason := 'event_family_not_allowed_for_server';
    end if;

    if coalesce(array_length(v_source.allowed_event_prefixes,1),0) > 0
       and not exists (
         select 1
         from unnest(v_source.allowed_event_prefixes) p(prefix)
         where lower(btrim(p_event_name)) like lower(prefix) || '%'
       ) then
      v_allowed := false;
      v_reason := 'event_prefix_not_allowed_for_source';
    end if;

    if exists (
      select 1 from public.tracking_event_contracts c
      where c.event_name=lower(btrim(p_event_name))
        and c.schema_version=p_schema_version
        and c.status='active'
        and (c.organization_id=p_organization_id or c.organization_id is null)
    ) then
      v_contract_status := 'explicit_contract';
    end if;
  else
    v_allowed := false;
    v_reason := coalesce(v_family->>'reason','unregistered_event_family');
    v_family_key := null;
    v_contract_status := 'unregistered';
  end if;

  v_raw := public.ingest_raw_event(
    p_organization_id,
    v_source.source_system,
    btrim(p_source_event_id),
    lower(btrim(p_event_name)),
    coalesce(nullif(btrim(p_ingestion_method),''),'server'),
    p_occurred_at,
    v_source.source_key,
    null,
    nullif(btrim(coalesce(p_anonymous_visitor_id,'')),''),
    nullif(btrim(coalesce(p_session_key,'')),''),
    nullif(btrim(coalesce(p_external_message_id,'')),''),
    coalesce(nullif(btrim(coalesce(p_site,'')),''),v_source.hostname),
    coalesce(p_payload,'{}'::jsonb),
    coalesce(p_context,'{}'::jsonb),
    coalesce(p_metadata,'{}'::jsonb) || jsonb_build_object(
      'tracking_source_id',v_source.id,
      'tracking_source_key',v_source.source_key,
      'event_family',v_family_key,
      'contract_status',v_contract_status,
      'accepted_for_processing',v_allowed
    ),
    p_schema_version
  );

  v_event_id := (v_raw->>'event_id')::uuid;
  v_created := coalesce((v_raw->>'created')::boolean,false);

  update public.raw_events
  set tracking_source_id=v_source.id,
      event_family=v_family_key,
      contract_version=p_schema_version
  where id=v_event_id
    and organization_id=p_organization_id
    and (tracking_source_id is null or tracking_source_id=v_source.id);

  if not v_allowed then
    update public.raw_event_processing
    set status='ignored',
        processor_name='tracking_contract_guard_v1',
        processor_version='v1',
        processing_error=v_reason,
        processing_metadata=coalesce(processing_metadata,'{}'::jsonb) || jsonb_build_object(
          'reason',v_reason,
          'event_name',lower(btrim(p_event_name)),
          'tracking_source_id',v_source.id
        ),
        processed_at=coalesce(processed_at,now()),
        updated_at=now()
    where raw_event_id=v_event_id;
  end if;

  update public.tracking_sources
  set accepted_event_count=accepted_event_count + case when v_allowed and v_created then 1 else 0 end,
      duplicate_event_count=duplicate_event_count + case when not v_created then 1 else 0 end,
      rejected_event_count=rejected_event_count + case when not v_allowed and v_created then 1 else 0 end,
      last_seen_at=now(),
      last_rejected_at=case when not v_allowed then now() else last_rejected_at end,
      updated_at=now()
  where id=v_source.id;

  return jsonb_build_object(
    'ok',true,
    'accepted',v_allowed,
    'processable',v_allowed,
    'reason',v_reason,
    'event_id',v_event_id,
    'created',v_created,
    'duplicate',not v_created,
    'event_family',v_family_key,
    'contract_status',v_contract_status,
    'tracking_source_id',v_source.id
  );
end;
$$;

create or replace function public.sync_tracking_source_from_organization_site_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hostname text := public.normalize_tracking_hostname_v1(new.hostname);
  v_status text := case when new.status='active' then 'active' else 'paused' end;
begin
  if v_hostname is null then
    return new;
  end if;

  insert into public.tracking_sources(
    organization_id,name,source_type,source_system,source_key,auth_mode,hostname,status,
    allowed_event_prefixes,max_payload_bytes,rate_limit_per_minute,metadata
  ) values (
    new.organization_id,
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
    jsonb_build_object('managed_by','organization_sites','organization_site_id',new.id)
  )
  on conflict (organization_id,hostname) where hostname is not null
  do update set
    name=excluded.name,
    status=excluded.status,
    allowed_event_prefixes=excluded.allowed_event_prefixes,
    metadata=coalesce(public.tracking_sources.metadata,'{}'::jsonb) || excluded.metadata,
    updated_at=now();

  return new;
end;
$$;

drop trigger if exists trg_sync_tracking_source_from_organization_site_v1 on public.organization_sites;
create trigger trg_sync_tracking_source_from_organization_site_v1
after insert or update of hostname,status,organization_id on public.organization_sites
for each row execute function public.sync_tracking_source_from_organization_site_v1();

insert into public.tracking_sources(
  organization_id,name,source_type,source_system,source_key,auth_mode,hostname,status,
  allowed_event_prefixes,max_payload_bytes,rate_limit_per_minute,metadata
)
select
  os.organization_id,
  'Website: ' || public.normalize_tracking_hostname_v1(os.hostname),
  'website',
  'website',
  'web_' || substr(encode(extensions.digest(os.organization_id::text || ':' || public.normalize_tracking_hostname_v1(os.hostname),'sha256'),'hex'),1,32),
  'origin',
  public.normalize_tracking_hostname_v1(os.hostname),
  case when os.status='active' then 'active' else 'paused' end,
  array['web.']::text[],
  32768,
  1200,
  jsonb_build_object('managed_by','organization_sites','organization_site_id',os.id)
from public.organization_sites os
where public.normalize_tracking_hostname_v1(os.hostname) is not null
on conflict (organization_id,hostname) where hostname is not null
  do update set status=excluded.status,
                metadata=coalesce(public.tracking_sources.metadata,'{}'::jsonb) || excluded.metadata,
                updated_at=now();

alter table public.tracking_sources enable row level security;
alter table public.tracking_event_families enable row level security;
alter table public.tracking_event_contracts enable row level security;

revoke all on public.tracking_sources from anon, authenticated;
revoke all on public.tracking_event_families from anon, authenticated;
revoke all on public.tracking_event_contracts from anon, authenticated;

grant select,insert,update,delete on public.tracking_sources to service_role;
grant select,insert,update,delete on public.tracking_event_families to service_role;
grant select,insert,update,delete on public.tracking_event_contracts to service_role;

grant execute on function public.resolve_tracking_source_by_origin_v1(text) to service_role;
grant execute on function public.resolve_tracking_event_family_v1(text) to service_role;
grant execute on function public.ingest_tracking_event_v1(uuid,uuid,text,text,text,timestamptz,text,text,text,text,jsonb,jsonb,jsonb,integer,boolean) to service_role;

commit;
