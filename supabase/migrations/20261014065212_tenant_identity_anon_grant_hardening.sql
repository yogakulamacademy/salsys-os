begin;

-- W5D Tenant Isolation: organization discovery and membership management are
-- authenticated/server concerns. Tenant login resolves the organization through
-- a SECURITY DEFINER binding RPC after authentication, so anon requires no
-- direct table privileges here. Removing these latent grants prevents future
-- policy changes from accidentally exposing tenant identity data pre-login.

revoke all privileges on table public.organizations
  from anon;

revoke all privileges on table public.organization_members
  from anon;

commit;
