do $$
declare
  t text;
  tables text[] := array[
    'instagram_automation_rules','instagram_automation_runs','instagram_channel_policies',
    'instagram_channel_preferences','instagram_pilot_allowlist','instagram_quick_replies',
    'whatsapp_audience_segments','whatsapp_broadcast_campaigns','whatsapp_broadcast_recipients',
    'whatsapp_campaign_variants','whatsapp_quick_replies'
  ];
begin
  foreach t in array tables loop
    execute format('drop policy if exists %I on public.%I', t || '_manage_admins', t);
    execute format('drop policy if exists %I on public.%I', t || '_select_members', t);

    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_organization_member(organization_id))',
      t || '_select_members', t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.can_manage_organization(organization_id))',
      t || '_manage_admins_insert', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.can_manage_organization(organization_id)) with check (public.can_manage_organization(organization_id))',
      t || '_manage_admins_update', t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.can_manage_organization(organization_id))',
      t || '_manage_admins_delete', t
    );
  end loop;
end $$;
