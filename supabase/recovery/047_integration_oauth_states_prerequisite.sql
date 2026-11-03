-- CI-only historical recovery prerequisite.
-- public.integration_oauth_states exists in production but has no recorded
-- creator migration in supabase_migrations.schema_migrations.
-- Reconstructed from the live production table shape and security boundary.
-- Provider constraint is intentionally left to migration 047.

begin;

create table if not exists public.integration_oauth_states (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  state_hash text not null unique,
  pkce_verifier_ciphertext text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  return_to text not null default '/settings/integrations'::text,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  organization_id uuid not null references public.organizations(id) on delete cascade
);

create index if not exists integration_oauth_states_expiry_idx
  on public.integration_oauth_states(expires_at);

create index if not exists idx_integration_oauth_states_organization
  on public.integration_oauth_states(organization_id);

alter table public.integration_oauth_states enable row level security;

drop policy if exists deny_direct_client_access
  on public.integration_oauth_states;

create policy deny_direct_client_access
  on public.integration_oauth_states
  for all
  to public
  using (false)
  with check (false);

revoke all on public.integration_oauth_states from anon, authenticated;
grant select,insert,update,delete on public.integration_oauth_states to service_role;

commit;
