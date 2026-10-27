begin;

create table if not exists public.password_recovery_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint password_recovery_grants_expiry_check check (expires_at > created_at)
);

create index if not exists idx_password_recovery_grants_user_active
  on public.password_recovery_grants(user_id, expires_at desc)
  where consumed_at is null;

create index if not exists idx_password_recovery_grants_org_active
  on public.password_recovery_grants(organization_id, expires_at desc)
  where consumed_at is null;

alter table public.password_recovery_grants enable row level security;

revoke all on table public.password_recovery_grants from public, anon, authenticated;
grant select, insert, update, delete on table public.password_recovery_grants to service_role;

comment on table public.password_recovery_grants is
  'Service-only, short-lived, one-time grants proving that a password change originated from a verified recovery OTP flow.';

commit;
