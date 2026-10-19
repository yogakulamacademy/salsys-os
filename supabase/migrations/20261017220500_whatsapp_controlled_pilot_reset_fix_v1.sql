create or replace function public.reset_whatsapp_controlled_pilot_v1(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_settings public.automation_provider_send_settings%rowtype;
  v_contact public.lead_contacts%rowtype;
  v_previous_primary boolean;
begin
  if auth.role() <> 'service_role' then
    return jsonb_build_object('ok',false,'reset',false,'reason','service_role_required');
  end if;

  select * into v_settings
  from public.automation_provider_send_settings s
  where s.organization_id=p_organization_id
    and s.channel='whatsapp'
    and s.provider='meta_cloud_api'
  limit 1
  for update;

  if v_settings.id is null then
    return jsonb_build_object('ok',false,'reset',false,'reason','provider_send_settings_missing');
  end if;

  if v_settings.pilot_lead_id is not null then
    select * into v_contact
    from public.lead_contacts lc
    where lc.organization_id=p_organization_id
      and lc.lead_id=v_settings.pilot_lead_id
      and lc.contact_type='whatsapp'
      and coalesce(lc.metadata->>'controlled_pilot','')='whatsapp_single_message_v1'
    order by lc.created_at desc
    limit 1
    for update;

    if v_contact.id is not null then
      v_previous_primary := coalesce((v_contact.metadata->>'pilot_previous_is_primary')::boolean,v_contact.is_primary);
      update public.lead_contacts
      set is_primary=v_previous_primary,
          metadata=(coalesce(metadata,'{}'::jsonb)-'pilot_previous_is_primary') || jsonb_build_object('pilot_reset_at',now())
      where id=v_contact.id and organization_id=p_organization_id;
    end if;

    update public.leads
    set metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object('pilot_reset_at',now())
    where id=v_settings.pilot_lead_id and organization_id=p_organization_id;
  end if;

  update public.automation_provider_send_settings
  set provider_send_enabled=false,
      pilot_mode_enabled=true,
      pilot_lead_id=null,
      pilot_started_at=null,
      pilot_max_messages=1,
      pilot_require_verified_primary_whatsapp=true,
      updated_at=now()
  where id=v_settings.id;

  return jsonb_build_object(
    'ok',true,
    'reset',true,
    'previous_pilot_lead_id',v_settings.pilot_lead_id,
    'provider_send_enabled',false,
    'pilot_mode_enabled',true,
    'pilot_started',false,
    'pilot_max_messages',1
  );
end;
$function$;

revoke all on function public.reset_whatsapp_controlled_pilot_v1(uuid) from public,anon,authenticated;
grant execute on function public.reset_whatsapp_controlled_pilot_v1(uuid) to service_role;
