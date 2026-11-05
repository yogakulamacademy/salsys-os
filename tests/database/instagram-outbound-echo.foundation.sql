-- Disposable local PostgreSQL 17 fixture. Run inside a caller-managed
-- transaction that is ALWAYS rolled back. It installs only the reduced types,
-- tables, and helper signatures the exact outbound projector SQL consumes.
-- Do not run this on Supabase production or any nonempty application database.
create schema auth;

do $roles$
begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
end;
$roles$;

create function auth.role() returns text language sql stable
as $role$
  select current_setting('request.jwt.claims', true)::jsonb ->> 'role';
$role$;

create type public.contact_channel as enum ('instagram');
create type public.message_direction as enum ('inbound','outbound');

create table public.leads (
  id uuid primary key,
  organization_id uuid not null
);
create table public.integration_connections (
  organization_id uuid not null,
  provider text not null,
  status text not null,
  external_account_id text not null
);
create table public.conversations (
  id uuid primary key,
  organization_id uuid not null,
  lead_id uuid,
  channel public.contact_channel not null,
  external_account_id text not null,
  external_conversation_id text not null,
  started_at timestamptz not null default now(),
  last_message_at timestamptz
);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  lead_id uuid not null,
  conversation_id uuid not null,
  direction public.message_direction not null,
  body text,
  external_message_id text,
  message_type text,
  status text,
  sent_at timestamptz,
  metadata jsonb default '{}'::jsonb
);
create unique index fixture_instagram_mid_unique
  on public.messages(organization_id, external_message_id)
  where external_message_id is not null;

create table public.raw_events (
  id uuid primary key,
  organization_id uuid not null,
  source_system text not null,
  source_event_type text not null,
  source_event_id text not null,
  source_account_id text,
  source_subject_id text,
  external_message_id text,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz,
  received_at timestamptz not null default now()
);
create table public.fixture_processing (
  organization_id uuid not null,
  source_event_id text not null,
  status text not null,
  processor text,
  metadata jsonb,
  primary key (organization_id,source_event_id)
);

create function public.set_raw_event_processing_status(
  p_organization_id uuid,
  p_source_system text,
  p_source_event_id text,
  p_status text,
  p_processor_name text,
  p_processor_version text,
  p_error text,
  p_metadata jsonb
) returns void language plpgsql
as $status$
begin
  insert into public.fixture_processing
    (organization_id,source_event_id,status,processor,metadata)
  values (p_organization_id,p_source_event_id,p_status,p_processor_name,p_metadata)
  on conflict (organization_id,source_event_id)
  do update set status=excluded.status,processor=excluded.processor,metadata=excluded.metadata;
end;
$status$;

create function public.log_lead_interaction(
  p_lead_id uuid,
  p_channel public.contact_channel,
  p_direction public.message_direction,
  p_body text,
  p_conversation_id uuid
) returns setof public.messages
language sql
as $log$
  insert into public.messages
    (organization_id,lead_id,conversation_id,direction,body)
  select l.organization_id,l.id,p_conversation_id,p_direction,p_body
  from public.leads l
  where l.id=p_lead_id
    and exists (select 1 from public.conversations c
      where c.id=p_conversation_id and c.organization_id=l.organization_id and c.lead_id=l.id)
  returning *;
$log$;
