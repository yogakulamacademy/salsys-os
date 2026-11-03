-- Cold-recovery compatibility only.
--
-- The original OpenSearch foundation (20261017180156+) was applied in
-- production but is absent from Git history. Search indexing is derived,
-- rebuildable, and intentionally inactive in the current product. Restore the
-- durable queue/settings contract required by later Event Intelligence
-- migrations, while keeping legacy search fail-closed instead of fabricating
-- an unavailable historical implementation.
--
-- This file is staged only by Migration Replay; never apply it to production.

begin;

create table if not exists public.search_index_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  provider text not null default 'opensearch',
  indexing_enabled boolean not null default false,
  index_prefix text not null default 'salsys',
  batch_size integer not null default 50,
  max_attempts integer not null default 8,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  pilot_mode_enabled boolean not null default true,
  pilot_started_at timestamptz,
  pilot_max_documents integer not null default 25,
  pilot_seeded_at timestamptz,
  pilot_completed_at timestamptz,
  constraint search_index_settings_provider_nonempty check (nullif(btrim(provider),'') is not null),
  constraint search_index_settings_batch_size_check check (batch_size between 1 and 500),
  constraint search_index_settings_max_attempts_check check (max_attempts between 1 and 50),
  constraint search_index_settings_pilot_max_documents_check check (pilot_max_documents between 1 and 500)
);

create table if not exists public.search_index_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  operation text not null default 'upsert',
  revision bigint not null default 1,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  next_retry_at timestamptz,
  lease_token uuid,
  lease_expires_at timestamptz,
  claimed_revision bigint,
  last_error text,
  last_completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint search_index_outbox_operation_check check (operation in ('upsert','delete')),
  constraint search_index_outbox_status_check check (status in ('pending','processing','completed','failed','dead_letter')),
  constraint search_index_outbox_attempt_count_check check (attempt_count >= 0),
  constraint search_index_outbox_entity_key unique (organization_id,entity_type,entity_id)
);

create index if not exists search_index_outbox_claim_idx
  on public.search_index_outbox (status,next_retry_at,updated_at);
create index if not exists search_index_outbox_org_idx
  on public.search_index_outbox (organization_id,status,updated_at desc);

alter table public.search_index_settings enable row level security;
alter table public.search_index_outbox enable row level security;
revoke all on table public.search_index_settings from public, anon, authenticated;
revoke all on table public.search_index_outbox from public, anon, authenticated;
grant select, insert, update, delete on table public.search_index_settings to service_role;
grant select, insert, update, delete on table public.search_index_outbox to service_role;

-- Compatibility contract consumed by the later Event Intelligence router.
-- Deliberately fail closed for the legacy search entity families because the
-- original Oct-17 builder implementation is not present in source control.
create or replace function public.build_search_document_v1(
  p_organization_id uuid,
  p_entity_type text,
  p_entity_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
begin
  return jsonb_build_object(
    'indexable', false,
    'operation', 'delete',
    'reason', 'legacy_search_builder_not_recovered',
    'organization_id', p_organization_id,
    'entity_type', p_entity_type,
    'entity_id', p_entity_id
  );
end;
$function$;

revoke all on function public.build_search_document_v1(uuid,text,uuid)
  from public, anon, authenticated;
grant execute on function public.build_search_document_v1(uuid,text,uuid)
  to service_role;

commit;
