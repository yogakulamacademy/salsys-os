-- Inbox load (owner report, 25 Nov 2026: 522s and "unable to verify your
-- workspace"). get_current_conversations_page_v2 used ~70% of all database
-- time: each call ran can_access_lead() for every lead (~1,700 calls, five
-- lookups each, ~330 ms of a ~530 ms call).
--
-- Inside the engine every lead already belongs to the verified tenant, so
-- can_access_lead() only varies by the lead's owner. Work out the user's
-- sales access once per call and apply the identical rule per row:
--   owner/admin (organisation) or owner/admin/manager (sales workspace): all
--   leads; sales member: own leads; anything else: none.
-- Read-only. The rule is the same as can_access_lead(); a check below proves
-- it for every member of every business before the engines are patched.

create or replace function app_private.current_sales_access_role_v1(p_organization_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
           when om.role::text in ('owner', 'admin') then om.role::text
           else (
             select wm.role::text
             from public.workspace_memberships wm
             where wm.organization_id = p_organization_id
               and wm.workspace_code = 'sales'
               and wm.user_id = auth.uid()
               and wm.active = true
             limit 1
           )
         end
  from public.organization_members om
  join public.organizations o on o.id = om.organization_id and o.status = 'active'
  where om.organization_id = p_organization_id
    and om.user_id = auth.uid()
    and om.active = true
    and auth.role() = 'authenticated'
    and p_organization_id = public.current_tenant_organization_id()
    and exists (
      select 1 from public.organization_workspaces ow
      where ow.organization_id = p_organization_id and ow.workspace_code = 'sales' and ow.enabled = true
    )
  limit 1;
$$;

revoke all on function app_private.current_sales_access_role_v1(uuid) from public, anon;
grant execute on function app_private.current_sales_access_role_v1(uuid) to authenticated;

do $patch$
declare
  v_name text;
  v_def text;
  v_decl_old text := '  v_result jsonb;' || chr(10) || 'begin';
  v_decl_new text := '  v_result jsonb;' || chr(10) || '  v_access_role text;' || chr(10) || 'begin';
  v_anchor text := 'raise exception ''Sales workspace access required'';' || chr(10) || '  end if;' || chr(10);
  v_anchor_new text := 'raise exception ''Sales workspace access required'';' || chr(10) || '  end if;' || chr(10)
    || '  -- Same rule as can_access_lead(), worked out once per call (inbox_access_once_per_call_v1).' || chr(10)
    || '  v_access_role := app_private.current_sales_access_role_v1(v_organization_id);' || chr(10);
  v_row_old text := 'and public.can_access_lead(o.id)';
  v_row_new text := 'and (v_access_role in (''owner'', ''admin'', ''manager'') or (v_access_role = ''member'' and o.owner_user_id = auth.uid()))';
begin
  foreach v_name in array array['get_current_conversations_page_engine_v2', 'get_current_conversations_page_engine_v1'] loop
    select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app_private' and p.proname = v_name;
    if v_def is null then
      raise notice '% not present; skipping', v_name;
      continue;
    end if;
    if position('v_access_role' in v_def) > 0 then
      continue;
    end if;
    if position(v_decl_old in v_def) = 0 or position(v_anchor in v_def) = 0 or position(v_row_old in v_def) = 0 then
      raise exception '% does not have the expected shape; patch by hand', v_name;
    end if;
    v_def := replace(v_def, v_decl_old, v_decl_new);
    v_def := replace(v_def, v_anchor, v_anchor_new);
    v_def := replace(v_def, v_row_old, v_row_new);
    execute v_def;
  end loop;
end;
$patch$;
