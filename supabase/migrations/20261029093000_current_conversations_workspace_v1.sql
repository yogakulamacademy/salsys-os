-- PH-2: collapse authenticated workspace binding + Conversations read model into one RPC.
-- Reuses the existing guarded workspace-context and Conversations functions so tenant,
-- Sales-workspace and per-lead authorization semantics remain centralized and unchanged.

create or replace function public.get_current_conversations_workspace_v1(
  p_selected_lead_id uuid default null,
  p_limit integer default 300
)
returns jsonb
language plpgsql
security invoker
set search_path = public, auth, pg_temp
as $function$
declare
  v_context jsonb;
  v_organization_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authenticated user session required';
  end if;

  -- Resolve/bind the active tenant first. Failures here intentionally bubble so
  -- authentication/tenant problems never fall through to the legacy loader.
  v_context := public.get_current_workspace_context_v1();
  v_organization_id := nullif(v_context->>'organization_id', '')::uuid;

  if v_organization_id is null then
    raise exception 'Active organization could not be resolved';
  end if;

  -- Only genuine failures inside the mature Conversations read model are
  -- converted to a fallback marker. The application may then use its existing
  -- legacy loader without weakening auth/tenant failure semantics.
  begin
    return public.get_conversations_workspace(
      v_organization_id,
      p_selected_lead_id,
      p_limit
    );
  exception
    when others then
      return jsonb_build_object(
        '__legacyFallbackRequired', true,
        '__workspaceError', sqlerrm
      );
  end;
end;
$function$;

revoke all on function public.get_current_conversations_workspace_v1(uuid, integer)
  from public, anon;
grant execute on function public.get_current_conversations_workspace_v1(uuid, integer)
  to authenticated;

comment on function public.get_current_conversations_workspace_v1(uuid, integer) is
  'Authenticated single-RPC Conversations loader. Resolves the caller tenant from the bound session and delegates to the existing Sales-workspace/per-lead authorized Conversations read model; only inner workspace failures are marked for legacy fallback.';
