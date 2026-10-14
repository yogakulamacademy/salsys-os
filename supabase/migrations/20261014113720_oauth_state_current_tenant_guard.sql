create or replace function public.oauth_state_matches_current_tenant(
  p_provider text,
  p_state text
)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth', 'extensions', 'pg_temp'
as $$
  select
    auth.role() = 'authenticated'
    and auth.uid() is not null
    and nullif(btrim(p_provider), '') is not null
    and nullif(btrim(p_state), '') is not null
    and public.current_tenant_organization_id() is not null
    and exists (
      select 1
      from public.integration_oauth_states s
      where s.provider = lower(btrim(p_provider))
        and s.state_hash = encode(extensions.digest(p_state, 'sha256'), 'hex')
        and s.created_by = auth.uid()
        and s.organization_id = public.current_tenant_organization_id()
        and s.used_at is null
        and s.expires_at > now()
    );
$$;

revoke all on function public.oauth_state_matches_current_tenant(text,text) from public;
revoke execute on function public.oauth_state_matches_current_tenant(text,text) from anon;
grant execute on function public.oauth_state_matches_current_tenant(text,text) to authenticated;
grant execute on function public.oauth_state_matches_current_tenant(text,text) to service_role;
