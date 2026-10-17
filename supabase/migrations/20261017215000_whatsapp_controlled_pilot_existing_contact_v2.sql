create or replace function public.stage_whatsapp_controlled_pilot_v1(
  p_organization_id uuid,
  p_workflow_id uuid,
  p_recipient_phone text,
  p_confirm_internal_recipient boolean,
  p_actor_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_digits text;
  v_sender_digits text;
  v_settings public.automation_provider_send_settings%rowtype;
  v_workflow public.automation_workflows%rowtype;
  v_lead_id uuid;
  v_contact_id uuid;
  v_policy public.automation_messaging_policies%rowtype;
  v_scheduler_enabled boolean := false;
  v_existing_contact public.lead_contacts%rowtype;
begin
  if auth.role() <> 'service_role' then
    return jsonb_build_object('ok',false,'staged',false,'reason','service_role_required');
  end if;
  if p_organization_id is null or p_workflow_id is null then
    return jsonb_build_object('ok',false,'staged',false,'reason','organization_and_workflow_required');
  end if;
  if p_confirm_internal_recipient is not true then
    return jsonb_build_object('ok',false,'staged',false,'reason','internal_recipient_confirmation_required');
  end if;

  v_digits := regexp_replace(coalesce(p_recipient_phone,''),'[^0-9]','','g');
  if length(v_digits) < 8 or length(v_digits) > 15 then
    return jsonb_build_object('ok',false,'staged',false,'reason','invalid_recipient_phone');
  end if;

  select * into v_workflow
  from public.automation_workflows w
  where w.id=p_workflow_id and w.organization_id=p_organization_id;
  if v_workflow.id is null then return jsonb_build_object('ok',false,'staged',false,'reason','workflow_not_found'); end if;
  if v_workflow.runtime_flow_enabled is true then return jsonb_build_object('ok',false,'staged',false,'reason','workflow_runtime_must_be_disabled'); end if;

  select * into v_settings
  from public.automation_provider_send_settings s
  where s.organization_id=p_organization_id and s.channel='whatsapp' and s.provider='meta_cloud_api'
  limit 1 for update;
  if v_settings.id is null then return jsonb_build_object('ok',false,'staged',false,'reason','provider_send_settings_missing'); end if;
  if v_settings.provider_send_enabled is true then return jsonb_build_object('ok',false,'staged',false,'reason','provider_send_must_be_disabled_before_staging'); end if;
  if v_settings.pilot_mode_enabled is not true then return jsonb_build_object('ok',false,'staged',false,'reason','pilot_mode_must_be_enabled'); end if;
  if v_settings.pilot_started_at is not null then return jsonb_build_object('ok',false,'staged',false,'reason','pilot_must_not_be_started_before_staging'); end if;

  select * into v_policy
  from public.automation_messaging_policies p
  where p.organization_id=p_organization_id and p.channel='whatsapp'
  limit 1;
  if v_policy.id is not null and (v_policy.policy_enabled is true or v_policy.autonomous_send_enabled is true) then
    return jsonb_build_object('ok',false,'staged',false,'reason','messaging_policy_must_be_disabled_before_staging');
  end if;

  select coalesce(s.enabled,false) into v_scheduler_enabled
  from public.automation_scheduler_settings s
  order by s.updated_at desc limit 1;
  if coalesce(v_scheduler_enabled,false) is true then
    return jsonb_build_object('ok',false,'staged',false,'reason','scheduler_must_be_disabled_before_staging');
  end if;

  select regexp_replace(coalesce(wa.display_phone_number,''),'[^0-9]','','g') into v_sender_digits
  from public.whatsapp_accounts wa
  where wa.organization_id=p_organization_id and wa.active=true and wa.is_default=true
  order by wa.updated_at desc limit 1;
  if nullif(v_sender_digits,'') is not null and v_sender_digits=v_digits then
    return jsonb_build_object('ok',false,'staged',false,'reason','recipient_cannot_be_sender_number');
  end if;

  select * into v_existing_contact
  from public.lead_contacts lc
  where lc.organization_id=p_organization_id
    and lc.contact_type='whatsapp'
    and regexp_replace(coalesce(lc.normalized_value,lc.value,''),'[^0-9]','','g')=v_digits
  limit 1 for update;

  if v_existing_contact.id is not null then
    if v_existing_contact.verified is not true then
      return jsonb_build_object('ok',false,'staged',false,'reason','existing_recipient_whatsapp_not_verified');
    end if;
    v_lead_id := v_existing_contact.lead_id;
    v_contact_id := v_existing_contact.id;
    update public.lead_contacts
    set is_primary=true,
        metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
          'controlled_pilot','whatsapp_single_message_v1',
          'internal_recipient_confirmed',true,
          'pilot_previous_is_primary',v_existing_contact.is_primary,
          'pilot_staged_at',now()
        )
    where id=v_contact_id and organization_id=p_organization_id;
    update public.leads
    set metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
      'controlled_pilot','whatsapp_single_message_v1',
      'internal_recipient_confirmed',true,
      'pilot_existing_lead',true,
      'pilot_staged_by',p_actor_user_id,
      'pilot_staged_at',now()
    )
    where id=v_lead_id and organization_id=p_organization_id;
  else
    insert into public.leads(organization_id,display_name,current_contact_channel,lead_origin,metadata)
    values (p_organization_id,'CONTROLLED WHATSAPP PILOT','whatsapp','internal_controlled_pilot',jsonb_build_object(
      'controlled_pilot','whatsapp_single_message_v1','internal_recipient_confirmed',true,'pilot_existing_lead',false,'pilot_staged_by',p_actor_user_id,'pilot_staged_at',now()
    )) returning id into v_lead_id;
    insert into public.lead_contacts(organization_id,lead_id,contact_type,value,normalized_value,is_primary,verified,metadata)
    values (p_organization_id,v_lead_id,'whatsapp','+'||v_digits,v_digits,true,true,jsonb_build_object(
      'controlled_pilot','whatsapp_single_message_v1','internal_recipient_confirmed',true,'verification_source','explicit_internal_pilot_confirmation','pilot_previous_is_primary',true,'pilot_staged_at',now()
    )) returning id into v_contact_id;
  end if;

  update public.automation_provider_send_settings
  set pilot_lead_id=v_lead_id,pilot_started_at=null,provider_send_enabled=false,pilot_max_messages=1,
      pilot_require_verified_primary_whatsapp=true,updated_at=now()
  where id=v_settings.id;

  return jsonb_build_object('ok',true,'staged',true,'lead_id',v_lead_id,'contact_id',v_contact_id,
    'recipient_last4',right(v_digits,4),'reused_existing_contact',v_existing_contact.id is not null,
    'pilot_mode_enabled',true,'pilot_started',false,'provider_send_enabled',false,'pilot_max_messages',1,
    'verified_primary_whatsapp',true,'customer_message_sent',false);
end;
$function$;

revoke all on function public.stage_whatsapp_controlled_pilot_v1(uuid,uuid,text,boolean,uuid) from public,anon,authenticated;
grant execute on function public.stage_whatsapp_controlled_pilot_v1(uuid,uuid,text,boolean,uuid) to service_role;

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
  if auth.role() <> 'service_role' then return jsonb_build_object('ok',false,'reset',false,'reason','service_role_required'); end if;
  select * into v_settings
  from public.automation_provider_send_settings s
  where s.organization_id=p_organization_id and s.channel='whatsapp' and s.provider='meta_cloud_api'
  limit 1 for update;
  if v_settings.id is null then return jsonb_build_object('ok',false,'reset',false,'reason','provider_send_settings_missing'); end if;

  if v_settings.pilot_lead_id is not null then
    select * into v_contact
    from public.lead_contacts lc
    where lc.organization_id=p_organization_id and lc.lead_id=v_settings.pilot_lead_id
      and lc.contact_type='whatsapp' and coalesce(lc.metadata->>'controlled_pilot','')='whatsapp_single_message_v1'
    order by lc.updated_at desc limit 1 for update;
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
  set provider_send_enabled=false,pilot_mode_enabled=true,pilot_lead_id=null,pilot_started_at=null,
      pilot_max_messages=1,pilot_require_verified_primary_whatsapp=true,updated_at=now()
  where id=v_settings.id;

  return jsonb_build_object('ok',true,'reset',true,'previous_pilot_lead_id',v_settings.pilot_lead_id,
    'provider_send_enabled',false,'pilot_mode_enabled',true,'pilot_started',false,'pilot_max_messages',1);
end;
$function$;

revoke all on function public.reset_whatsapp_controlled_pilot_v1(uuid) from public,anon,authenticated;
grant execute on function public.reset_whatsapp_controlled_pilot_v1(uuid) to service_role;
