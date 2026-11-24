create or replace function public.bind_current_tenant_session_for_current_user()
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_user_id uuid;
  v_organization_id uuid;
  v_membership_count integer;
begin
  if auth.role() <> 'authenticated' then
    raise exception 'Authenticated user session required';
  end if;

  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authenticated user identity is incomplete';
  end if;

  select
    count(distinct om.organization_id)::integer,
    min(om.organization_id::text)::uuid
  into
    v_membership_count,
    v_organization_id
  from public.organization_members om
  join public.organizations o
    on o.id = om.organization_id
  where om.user_id = v_user_id
    and om.active = true
    and o.status = 'active';

  if coalesce(v_membership_count, 0) = 0 then
    raise exception 'No active organization membership was found';
  end if;

  if v_membership_count > 1 then
    raise exception 'Multiple active organization memberships require account resolution before customer login';
  end if;

  perform public.bind_current_tenant_session(v_organization_id);

  return v_organization_id;
end;
$function$;

revoke all on function public.bind_current_tenant_session_for_current_user() from public;
revoke all on function public.bind_current_tenant_session_for_current_user() from anon;
grant execute on function public.bind_current_tenant_session_for_current_user() to authenticated;
grant execute on function public.bind_current_tenant_session_for_current_user() to service_role;

comment on function public.bind_current_tenant_session_for_current_user() is
'Binds the authenticated Supabase session to the caller''s sole active customer organization. Fails closed when membership is missing or ambiguous. Intended for the canonical /login flow without accepting tenant IDs or slugs from the browser.';
