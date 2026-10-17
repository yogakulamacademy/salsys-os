begin;

create table if not exists public.tracking_source_rate_windows (
  tracking_source_id uuid not null references public.tracking_sources(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  window_start timestamptz not null,
  event_count integer not null default 0 check (event_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (tracking_source_id, window_start)
);

create index if not exists idx_tracking_source_rate_windows_org_time
  on public.tracking_source_rate_windows(organization_id,window_start desc);

alter table public.tracking_source_rate_windows enable row level security;
revoke all on public.tracking_source_rate_windows from anon, authenticated;
grant select,insert,update,delete on public.tracking_source_rate_windows to service_role;

create or replace function public.consume_tracking_source_rate_limit_v1(
  p_organization_id uuid,
  p_tracking_source_id uuid,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source public.tracking_sources%rowtype;
  v_window timestamptz := date_trunc('minute',coalesce(p_now,now()));
  v_count integer;
  v_allowed boolean;
begin
  select * into v_source
  from public.tracking_sources s
  where s.id=p_tracking_source_id
    and s.organization_id=p_organization_id
    and s.status='active';

  if v_source.id is null then
    return jsonb_build_object('ok',false,'allowed',false,'reason','tracking_source_not_found_or_inactive');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('tracking-rate:' || p_tracking_source_id::text || ':' || v_window::text,0));

  insert into public.tracking_source_rate_windows(
    tracking_source_id,organization_id,window_start,event_count,updated_at
  ) values (
    p_tracking_source_id,p_organization_id,v_window,1,now()
  )
  on conflict (tracking_source_id,window_start)
  do update set event_count=public.tracking_source_rate_windows.event_count+1,
                updated_at=now()
  returning event_count into v_count;

  v_allowed := v_count <= v_source.rate_limit_per_minute;

  if not v_allowed then
    update public.tracking_sources
    set rejected_event_count=rejected_event_count+1,
        last_rejected_at=now(),
        updated_at=now()
    where id=v_source.id;
  end if;

  return jsonb_build_object(
    'ok',true,
    'allowed',v_allowed,
    'count',v_count,
    'limit',v_source.rate_limit_per_minute,
    'remaining',greatest(v_source.rate_limit_per_minute-v_count,0),
    'window_start',v_window,
    'reason',case when v_allowed then null else 'rate_limit_exceeded' end
  );
end;
$$;

grant execute on function public.consume_tracking_source_rate_limit_v1(uuid,uuid,timestamptz) to service_role;

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
  v_event_name text := lower(btrim(coalesce(p_event_name,'')));
  v_family jsonb;
  v_family_key text;
  v_contract_status text := 'family_fallback';
  v_raw jsonb;
  v_event_id uuid;
  v_created boolean;
  v_allowed boolean := true;
  v_reason text;
  v_payload_bytes integer;
  v_is_legacy_website_event boolean := false;
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

  if v_event_name = '' then
    raise exception 'event name is required';
  end if;

  if v_event_name ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$' then
    v_family := public.resolve_tracking_event_family_v1(v_event_name);
  elsif p_is_browser
        and v_source.source_type='website'
        and v_event_name ~ '^[a-z][a-z0-9_]{0,79}$' then
    v_is_legacy_website_event := true;
    v_family := jsonb_build_object(
      'ok',true,
      'family_key','web',
      'event_prefix','web.',
      'processor_name','website_event_processor',
      'default_schema_version',1,
      'allow_browser',true,
      'allow_server',true
    );
  else
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
       and not v_is_legacy_website_event
       and not exists (
         select 1 from unnest(v_source.allowed_event_prefixes) p(prefix)
         where v_event_name like lower(prefix) || '%'
       ) then
      v_allowed := false;
      v_reason := 'event_prefix_not_allowed_for_source';
    end if;

    if exists (
      select 1 from public.tracking_event_contracts c
      where c.event_name=v_event_name
        and c.schema_version=p_schema_version
        and c.status='active'
        and (c.organization_id=p_organization_id or c.organization_id is null)
    ) then
      v_contract_status := 'explicit_contract';
    elsif v_is_legacy_website_event then
      v_contract_status := 'legacy_web_family_compat';
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
    v_event_name,
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
      'accepted_for_processing',v_allowed,
      'legacy_website_event',v_is_legacy_website_event
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
          'event_name',v_event_name,
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
    'legacy_website_event',v_is_legacy_website_event,
    'tracking_source_id',v_source.id
  );
end;
$$;

commit;
