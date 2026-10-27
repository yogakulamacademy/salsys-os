do $$
declare
  t text;
  tables text[] := array[
    'automation_actions','automation_conditions','automation_enrollments',
    'automation_suppressions','automation_triggers','automation_workflows'
  ];
begin
  foreach t in array tables loop
    execute format('drop policy if exists %I on public.%I', t || '_manage', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);

    execute format(
      'create policy %I on public.%I for select to authenticated using (((public.is_crm_user() and public.is_organization_member(organization_id)) or public.can_manage_organization(organization_id)))',
      t || '_read', t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.can_manage_organization(organization_id))',
      t || '_manage_insert', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.can_manage_organization(organization_id)) with check (public.can_manage_organization(organization_id))',
      t || '_manage_update', t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.can_manage_organization(organization_id))',
      t || '_manage_delete', t
    );
  end loop;
end $$;
