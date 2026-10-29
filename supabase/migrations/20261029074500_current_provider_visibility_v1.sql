-- PH-2: collapse authenticated workspace binding + provider visibility into one RPC.
-- Reuses the existing guarded workspace-context and provider-visibility functions so
-- tenant/session authorization semantics stay centralized and unchanged.

create or replace function public.get_current_provider_visibility_v1()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_context jsonb;
  v_organization_id uuid;
begin
  if auth.role() <> 'authenticated' then
    raise exception 'Authenticated user session required';
  end if;

  v_context := public.get_current_workspace_context_v1();
  v_organization_id := nullif(v_context->>'organization_id', '')::uuid;

  if v_organization_id is null then
    raise exception 'Active organization could not be resolved';
  end if;

  return public.get_provider_visibility(v_organization_id);
end;
$function$;

revoke all on function public.get_current_provider_visibility_v1() from public, anon;
grant execute on function public.get_current_provider_visibility_v1() to authenticated;
