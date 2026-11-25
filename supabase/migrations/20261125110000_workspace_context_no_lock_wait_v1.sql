-- "SalsysOS is temporarily unable to verify your workspace" (owner report,
-- 25 Nov 2026). Every page request runs get_current_workspace_context_v1,
-- which updated tenant_session_bindings.last_seen_at on the same row. Parallel
-- requests (navigation, prefetch, RSC refresh) queued on that row lock for
-- 1-1.8 s, past the middleware's 1.4 s budget, so the page showed a 503.
--
-- last_seen_at is informational only. Now it is written at most once a minute
-- and never waits: a row another request is already updating is skipped.
-- Access checks are unchanged.
do $patch$
declare
  v_def text;
  v_old text := $$    update public.tenant_session_bindings
    set last_seen_at = now()
    where session_id = v_session_id
      and user_id = v_user_id
      and organization_id = v_organization_id;$$;
  v_new text := $$    update public.tenant_session_bindings
    set last_seen_at = now()
    where session_id in (
      select b2.session_id
      from public.tenant_session_bindings b2
      where b2.session_id = v_session_id
        and b2.user_id = v_user_id
        and b2.organization_id = v_organization_id
        and b2.last_seen_at < now() - interval '1 minute'
      for update skip locked
    );$$;
begin
  select pg_get_functiondef('public.get_current_workspace_context_v1()'::regprocedure) into v_def;
  if position('for update skip locked' in v_def) > 0 then return; end if;
  if position(v_old in v_def) = 0 then
    raise exception 'last_seen_at update not found in get_current_workspace_context_v1; patch by hand';
  end if;
  execute replace(v_def, v_old, v_new);
end;
$patch$;
