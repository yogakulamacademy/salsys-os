begin;

-- =============================================================================
-- 009_raw_event_platform.sql
--
-- Phase 2B: canonical raw-event platform foundation.
--
-- Design rules:
-- - raw_events is append-only source evidence, not a CRM/touchpoint table.
-- - provider/browser event semantics remain in source_event_type + payload.
-- - normalized business interpretation happens downstream.
-- - processing state is separated from the immutable event envelope.
-- - authenticated browser clients do not receive direct raw-event access.
-- - service-role ingestion is idempotent per tenant + source + source_event_id.
-- =============================================================================


-- =============================================================================
-- 1. RAW EVENT ENVELOPE
-- =============================================================================

create table public.raw_events (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null,

  source_system text not null,
  source_event_id text not null,
  source_event_type text not null,
  ingestion_method text not null default 'server',

  occurred_at timestamptz,
  received_at timestamptz not null default now(),

  source_account_id text,
  source_subject_id text,

  anonymous_visitor_id text,
  session_key text,
  external_message_id text,

  site text,

  payload jsonb not null default '{}'::jsonb,
  context jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,

  schema_version integer not null default 1,

  created_at timestamptz not null default now(),

  constraint raw_events_source_system_check
    check (nullif(btrim(source_system), '') is not null),

  constraint raw_events_source_event_id_check
    check (nullif(btrim(source_event_id), '') is not null),

  constraint raw_events_source_event_type_check
    check (nullif(btrim(source_event_type), '') is not null),

  constraint raw_events_ingestion_method_check
    check (nullif(btrim(ingestion_method), '') is not null),

  constraint raw_events_schema_version_check
    check (schema_version >= 1),

  constraint raw_events_organization_id_fkey
    foreign key (organization_id)
    references public.organizations(id)
    on delete restrict
);


-- Required for future composite tenant-safe foreign keys.
create unique index uq_raw_events_org_id
  on public.raw_events (
    organization_id,
    id
  );


-- Canonical idempotency boundary.
create unique index uq_raw_events_org_source_event
  on public.raw_events (
    organization_id,
    source_system,
    source_event_id
  );


-- Primary timeline access path.
create index idx_raw_events_org_received
  on public.raw_events (
    organization_id,
    received_at desc
  );


create index idx_raw_events_org_occurred
  on public.raw_events (
    organization_id,
    occurred_at desc
  )
  where occurred_at is not null;


create index idx_raw_events_org_source
  on public.raw_events (
    organization_id,
    source_system,
    received_at desc
  );


create index idx_raw_events_org_source_type
  on public.raw_events (
    organization_id,
    source_system,
    source_event_type,
    received_at desc
  );


create index idx_raw_events_org_session
  on public.raw_events (
    organization_id,
    session_key
  )
  where session_key is not null;


create index idx_raw_events_org_visitor
  on public.raw_events (
    organization_id,
    anonymous_visitor_id
  )
  where anonymous_visitor_id is not null;


create index idx_raw_events_org_external_message
  on public.raw_events (
    organization_id,
    external_message_id
  )
  where external_message_id is not null;


-- =============================================================================
-- 2. MUTABLE PROCESSING STATE
--
-- Raw source evidence stays append-only. Retry/status/error information lives
-- separately so processors can mutate state without rewriting the raw event.
-- =============================================================================

create table public.raw_event_processing (
  raw_event_id uuid primary key,

  organization_id uuid not null,

  status text not null default 'received',

  attempt_count integer not null default 0,
  last_attempt_at timestamptz,
  next_retry_at timestamptz,

  processed_at timestamptz,

  processor_name text,
  processor_version text,

  processing_error text,
  processing_metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint raw_event_processing_status_check
    check (
      status in (
        'received',
        'processing',
        'processed',
        'ignored',
        'failed',
        'dead_letter'
      )
    ),

  constraint raw_event_processing_attempt_count_check
    check (attempt_count >= 0),

  constraint raw_event_processing_raw_event_fkey
    foreign key (
      organization_id,
      raw_event_id
    )
    references public.raw_events (
      organization_id,
      id
    )
    on delete cascade
);


create index idx_raw_event_processing_org_status
  on public.raw_event_processing (
    organization_id,
    status,
    updated_at desc
  );


create index idx_raw_event_processing_retry
  on public.raw_event_processing (
    next_retry_at
  )
  where status = 'failed'
    and next_retry_at is not null;


drop trigger if exists raw_event_processing_set_updated_at
  on public.raw_event_processing;

create trigger raw_event_processing_set_updated_at
before update
on public.raw_event_processing
for each row
execute function public.set_updated_at();


-- =============================================================================
-- 3. CENTRAL IDEMPOTENT INGESTION RPC
--
-- Adapters should write through this function instead of duplicating
-- idempotency logic in every route.
-- =============================================================================

create or replace function public.ingest_raw_event(
  p_organization_id uuid,
  p_source_system text,
  p_source_event_id text,
  p_source_event_type text,
  p_ingestion_method text default 'server',
  p_occurred_at timestamptz default null,
  p_source_account_id text default null,
  p_source_subject_id text default null,
  p_anonymous_visitor_id text default null,
  p_session_key text default null,
  p_external_message_id text default null,
  p_site text default null,
  p_payload jsonb default '{}'::jsonb,
  p_context jsonb default '{}'::jsonb,
  p_metadata jsonb default '{}'::jsonb,
  p_schema_version integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_event_id uuid;
  v_created boolean := false;
begin
  if p_organization_id is null then
    raise exception 'organization_id is required';
  end if;

  if not exists (
    select 1
    from public.organizations o
    where o.id = p_organization_id
  ) then
    raise exception 'organization does not exist';
  end if;

  if nullif(btrim(p_source_system), '') is null then
    raise exception 'source_system is required';
  end if;

  if nullif(btrim(p_source_event_id), '') is null then
    raise exception 'source_event_id is required';
  end if;

  if nullif(btrim(p_source_event_type), '') is null then
    raise exception 'source_event_type is required';
  end if;

  if nullif(btrim(p_ingestion_method), '') is null then
    raise exception 'ingestion_method is required';
  end if;

  if coalesce(p_schema_version, 0) < 1 then
    raise exception 'schema_version must be >= 1';
  end if;

  insert into public.raw_events (
    organization_id,
    source_system,
    source_event_id,
    source_event_type,
    ingestion_method,
    occurred_at,
    source_account_id,
    source_subject_id,
    anonymous_visitor_id,
    session_key,
    external_message_id,
    site,
    payload,
    context,
    metadata,
    schema_version
  )
  values (
    p_organization_id,
    btrim(p_source_system),
    btrim(p_source_event_id),
    btrim(p_source_event_type),
    btrim(p_ingestion_method),
    p_occurred_at,
    nullif(btrim(p_source_account_id), ''),
    nullif(btrim(p_source_subject_id), ''),
    nullif(btrim(p_anonymous_visitor_id), ''),
    nullif(btrim(p_session_key), ''),
    nullif(btrim(p_external_message_id), ''),
    nullif(btrim(p_site), ''),
    coalesce(p_payload, '{}'::jsonb),
    coalesce(p_context, '{}'::jsonb),
    coalesce(p_metadata, '{}'::jsonb),
    p_schema_version
  )
  on conflict (
    organization_id,
    source_system,
    source_event_id
  )
  do nothing
  returning id
  into v_event_id;

  if v_event_id is not null then
    v_created := true;
  else
    select re.id
    into v_event_id
    from public.raw_events re
    where re.organization_id = p_organization_id
      and re.source_system = btrim(p_source_system)
      and re.source_event_id = btrim(p_source_event_id);

    if v_event_id is null then
      raise exception 'raw event idempotency lookup failed';
    end if;
  end if;

  insert into public.raw_event_processing (
    raw_event_id,
    organization_id,
    status
  )
  values (
    v_event_id,
    p_organization_id,
    'received'
  )
  on conflict (raw_event_id)
  do nothing;

  return jsonb_build_object(
    'event_id', v_event_id,
    'created', v_created
  );
end;
$function$;


revoke all
on function public.ingest_raw_event(
  uuid,
  text,
  text,
  text,
  text,
  timestamptz,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb,
  jsonb,
  integer
)
from public, anon, authenticated;

grant execute
on function public.ingest_raw_event(
  uuid,
  text,
  text,
  text,
  text,
  timestamptz,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb,
  jsonb,
  integer
)
to service_role;


-- =============================================================================
-- 4. RAW-EVENT SECURITY
--
-- These tables may contain provider payloads and PII. They are backend-owned.
-- Product/UI access should go through later purpose-built safe views/RPCs.
-- =============================================================================

alter table public.raw_events
enable row level security;

alter table public.raw_event_processing
enable row level security;


revoke all on public.raw_events
from public, anon, authenticated;

revoke all on public.raw_event_processing
from public, anon, authenticated;


-- Application service role may ingest/read raw events.
-- It intentionally does NOT receive UPDATE/DELETE on raw_events.
grant select, insert
on public.raw_events
to service_role;

grant select, insert, update, delete
on public.raw_event_processing
to service_role;


-- =============================================================================
-- 5. NO HISTORICAL BACKFILL IN THIS MIGRATION
--
-- touchpoints is a derived/normalized journey table, not raw source evidence.
-- lead_ingest_events is an ingestion receipt created after lead resolution.
-- whatsapp_webhook_events contains true raw provider events, but its historical
-- backfill will be performed only after the new adapter path is live-tested.
--
-- This migration therefore changes no existing event data.
-- =============================================================================


-- =============================================================================
-- 6. FINAL STRUCTURAL ASSERTIONS
-- =============================================================================

do $$
begin
  if to_regclass('public.raw_events') is null then
    raise exception '009 abort: raw_events was not created';
  end if;

  if to_regclass('public.raw_event_processing') is null then
    raise exception '009 abort: raw_event_processing was not created';
  end if;

  if to_regclass('public.uq_raw_events_org_source_event') is null then
    raise exception
      '009 abort: tenant/source event idempotency index is missing';
  end if;

  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'raw_events'
      and c.column_name = 'organization_id'
      and c.is_nullable <> 'NO'
  ) then
    raise exception
      '009 abort: raw_events.organization_id must be NOT NULL';
  end if;
end
$$;

commit;
