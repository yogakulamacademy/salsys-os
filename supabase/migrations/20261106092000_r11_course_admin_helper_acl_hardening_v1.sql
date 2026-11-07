-- R11 security closeout: prohibit unauthenticated calls to the course administration
-- authorization helper. The function itself and its role/tenant/capability checks stay
-- unchanged; existing authenticated and service-role callers continue to work.
-- This is an ACL-only migration: no data writes, tracking, new resources or RLS edits.

do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'can_administer_course_management'
      and pg_get_function_identity_arguments(p.oid) = 'p_organization_id uuid'
      and p.prosecdef
  ) then
    raise exception 'R11 course management helper signature/security changed; review before altering ACL';
  end if;
end;
$$;

-- Function privilege to PUBLIC is inherited by anon; revoking only from anon
-- would not eliminate the anonymous RPC permission.
revoke execute on function public.can_administer_course_management(uuid)
  from public, anon;

-- Explicitly retain the two known callers. No function body or policy changes.
grant execute on function public.can_administer_course_management(uuid)
  to authenticated, service_role;

do $$
begin
  if has_function_privilege('anon', 'public.can_administer_course_management(uuid)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.can_administer_course_management(uuid)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.can_administer_course_management(uuid)', 'EXECUTE')
  then
    raise exception 'R11 course management helper ACL is not least-privilege';
  end if;
end;
$$;
