begin;

-- =============================================================================
-- 064_integration_oauth_active_tenant_guard.sql
--
-- W8G: provide a narrow authenticated check that lets request middleware verify
-- that an OAuth callback state belongs to the tenant bound to the current
-- browser session. The function returns only a boolean and never exposes OAuth
-- state rows, provider tokens, or another tenant's identifiers.
-- =============================================================================

create or replace function public.integration_oauth_state_matches_tenant(
  p_provider text,
  p_state text,
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, auth, extensions, pg_temp
as $function$
  select
    auth.uid() is not null
    and nullif(btrim(p_provider), '') is not null
    and nullif(btrim(p_state), '') is not null
    and public.is_organization_member(p_organization_id)
    and exists (
      select 1
      from public.integration_oauth_states s
      where s.provider = lower(btrim(p_provider))
        and s.state_hash = encode(extensions.digest(p_state, 'sha256'), 'hex')
        and s.created_by = auth.uid()
        and s.organization_id = p_organization_id
        and s.used_at is null
        and s.expires_at > now()
    );
$function$;

revoke all on function public.integration_oauth_state_matches_tenant(text, text, uuid)
  from public, anon;

grant execute on function public.integration_oauth_state_matches_tenant(text, text, uuid)
  to authenticated, service_role;

commit;
