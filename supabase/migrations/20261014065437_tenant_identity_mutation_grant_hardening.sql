begin;

-- W5D Tenant Isolation: keep only the authenticated table capabilities that
-- current RLS policies intentionally expose. Organizations support member reads
-- and administrator updates, but not client-side creation/deletion. Profiles are
-- client-readable through tenant-aware RLS and are mutated only by trusted
-- server/auth flows.

revoke insert, delete on table public.organizations
  from authenticated;

revoke insert, update, delete on table public.profiles
  from authenticated;

commit;
