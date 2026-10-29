-- PH-2: collapse authenticated workspace binding + lead authorization + Person Journey V3 into one RPC.
-- Auth/session/tenant failures remain fatal. Only failures inside the mature V3 read model
-- are converted into an explicit fallback marker for the application to continue with V2/legacy.

create or replace function public.get_current_person_journey_workspace_v1(
  p_lead_id uuid,
  p_limit integer default 200
)
returns jsonb
language plpgsql
security invoker
set search_path = public, auth, pg_temp
as $function$
declare
  v_context jsonb;
  v_organization_id uuid;
  v_workspace jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authenticated user session required';
  end if;

  if p_lead_id is null then
    raise exception 'Lead ID is required';
  end if;

  -- Resolve/bind the active tenant outside the inner fallback boundary so
  -- authentication and tenant-session failures always remain fail-closed.
  v_context := public.get_current_workspace_context_v1();
  v_organization_id := nullif(v_context->>'organization_id', '')::uuid;

  if v_organization_id is null then
    raise exception 'Active organization could not be resolved';
  end if;

  -- Preserve the existing application behavior for inaccessible leads: return
  -- an empty payload rather than exposing whether a foreign lead exists.
  if not public.can_access_lead(p_lead_id) then
    return jsonb_build_object(
      'organization_id', v_organization_id,
      'access_granted', false,
      'person_id', null,
      'person', null,
      'journey', '[]'::jsonb,
      'journey_total', 0
    );
  end if;

  begin
    v_workspace := public.get_person_journey_workspace_v3(
      v_organization_id,
      p_lead_id,
      p_limit
    );

    return coalesce(v_workspace, '{}'::jsonb) || jsonb_build_object(
      'organization_id', v_organization_id,
      'access_granted', true
    );
  exception
    when others then
      return jsonb_build_object(
        'organization_id', v_organization_id,
        'access_granted', true,
        '__legacyFallbackRequired', true,
        '__workspaceError', sqlerrm
      );
  end;
end;
$function$;

revoke all on function public.get_current_person_journey_workspace_v1(uuid, integer)
  from public, anon;
grant execute on function public.get_current_person_journey_workspace_v1(uuid, integer)
  to authenticated;

comment on function public.get_current_person_journey_workspace_v1(uuid, integer) is
  'Authenticated single-RPC Person Journey loader. Resolves the current tenant and lead access server-side, delegates to V3, and emits an explicit fallback marker only for inner V3 failures.';
