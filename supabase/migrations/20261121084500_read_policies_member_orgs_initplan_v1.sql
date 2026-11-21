-- Speed (owner-approved 21 Nov 2026, same read rules as the previous step):
-- is_organization_member(organization_id) ran for every row. The businesses
-- the user belongs to are now listed once per query; a row passes when its
-- organization is in that list, which is exactly when is_organization_member
-- returns true for an authenticated user (service role bypasses these rules).
create or replace function public.member_organization_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select om.organization_id
  from public.organization_members om
  where auth.role() = 'authenticated'
    and om.user_id = auth.uid()
    and om.active = true
    and om.organization_id is not null
    and public.session_is_bound_to_organization(om.organization_id);
$$;
revoke all on function public.member_organization_ids() from public, anon;
grant execute on function public.member_organization_ids() to authenticated, service_role;

do $$
declare
  p record;
  new_qual text;
  v_roles text;
begin
  for p in
    select schemaname, tablename, policyname, permissive, roles as role_list, qual
    from pg_policies
    where schemaname = 'public' and cmd = 'SELECT'
      and qual like '%visible_lead%'
      and qual like '%is_organization_member(organization_id)%'
  loop
    new_qual := replace(
      p.qual,
      'is_organization_member(organization_id)',
      '(organization_id IN (SELECT public.member_organization_ids()))'
    );
    select string_agg(quote_ident(r), ', ') into v_roles from unnest(p.role_list) r;
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    execute format('create policy %I on %I.%I as %s for select to %s using (%s)',
      p.policyname, p.schemaname, p.tablename, p.permissive, v_roles, new_qual);
  end loop;
end $$;
