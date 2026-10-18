-- Keep block_reasons limited to actual blockers. The template_required route is
-- already expressed by template_required=true + channel_route=template_required.

create or replace function public.resolve_whatsapp_channel_policy_v2(
  p_organization_id uuid,
  p_lead_id uuid,
  p_workflow_id uuid default null,
  p_template_name text default null,
  p_template_language text default null,
  p_whatsapp_account_id uuid default null,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_now timestamptz := coalesce(p_now, now());
  v_template_name text := nullif(btrim(coalesce(p_template_name, '')), '');
  v_template_language text := nullif(btrim(coalesce(p_template_language, '')), '');
  v_base_policy jsonb;
  v_template_policy jsonb := null;
  v_last_inbound_at timestamptz;
  v_window_expires_at timestamptz;
  v_service_window_open boolean := false;
  v_freeform_allowed boolean := false;
  v_template_required boolean := true;
  v_template_eligible boolean := false;
  v_channel_policy_allowed boolean := false;
  v_final_send_allowed boolean := false;
  v_channel_route text := 'blocked';
  v_reasons jsonb := '[]'::jsonb;
begin
  if p_organization_id is null or p_lead_id is null then
    return jsonb_build_object('ok', false, 'send_allowed', false, 'customer_message_sent', false, 'reason', 'organization_id and lead_id are required');
  end if;

  if not exists (
    select 1 from public.leads l
    where l.id = p_lead_id
      and l.organization_id = p_organization_id
  ) then
    return jsonb_build_object('ok', false, 'send_allowed', false, 'customer_message_sent', false, 'reason', 'lead_tenant_mismatch');
  end if;

  v_base_policy := public.evaluate_automation_send_policy_v1(
    p_organization_id,
    p_lead_id,
    'whatsapp',
    p_workflow_id,
    v_now
  );

  select max(coalesce(m.received_at, m.created_at))
  into v_last_inbound_at
  from public.messages m
  join public.conversations c
    on c.id = m.conversation_id
   and c.organization_id = m.organization_id
   and c.lead_id = m.lead_id
  where m.organization_id = p_organization_id
    and m.lead_id = p_lead_id
    and m.direction::text = 'inbound'
    and c.channel::text = 'whatsapp'
    and coalesce(m.received_at, m.created_at) <= v_now;

  if v_last_inbound_at is not null then
    v_window_expires_at := v_last_inbound_at + interval '24 hours';
    v_service_window_open := v_now < v_window_expires_at;
  end if;

  if v_service_window_open then
    v_freeform_allowed := true;
    v_template_required := false;
    v_channel_route := 'freeform_or_template';
    v_channel_policy_allowed := true;

    if v_template_name is not null and v_template_language is not null then
      v_template_policy := public.evaluate_whatsapp_template_v1(
        p_organization_id,
        v_template_name,
        v_template_language,
        p_whatsapp_account_id
      );
      v_template_eligible := coalesce((v_template_policy ->> 'template_eligible')::boolean, false);
    end if;
  else
    v_freeform_allowed := false;
    v_template_required := true;
    v_channel_route := 'template_required';

    if v_template_name is null then
      v_reasons := v_reasons || jsonb_build_array('template_not_supplied');
    elsif v_template_language is null then
      v_reasons := v_reasons || jsonb_build_array('template_language_not_supplied');
    else
      v_template_policy := public.evaluate_whatsapp_template_v1(
        p_organization_id,
        v_template_name,
        v_template_language,
        p_whatsapp_account_id
      );
      v_template_eligible := coalesce((v_template_policy ->> 'template_eligible')::boolean, false);

      if v_template_eligible is not true then
        v_reasons := v_reasons || jsonb_build_array('template_not_eligible');
      end if;
    end if;

    v_channel_policy_allowed := v_template_eligible;
  end if;

  if coalesce((v_base_policy ->> 'send_allowed')::boolean, false) is not true then
    v_reasons := v_reasons || jsonb_build_array('base_messaging_policy_blocked');
  end if;

  v_final_send_allowed :=
    coalesce((v_base_policy ->> 'send_allowed')::boolean, false)
    and v_channel_policy_allowed;

  return jsonb_build_object(
    'ok', true,
    'organization_id', p_organization_id,
    'lead_id', p_lead_id,
    'workflow_id', p_workflow_id,
    'channel', 'whatsapp',
    'evaluated_at', v_now,
    'service_window_hours', 24,
    'last_customer_message_at', v_last_inbound_at,
    'service_window_expires_at', v_window_expires_at,
    'service_window_open', v_service_window_open,
    'freeform_allowed', v_freeform_allowed,
    'template_required', v_template_required,
    'template_name', v_template_name,
    'template_language', v_template_language,
    'template_eligible', v_template_eligible,
    'template_policy', v_template_policy,
    'channel_route', v_channel_route,
    'channel_policy_allowed', v_channel_policy_allowed,
    'base_send_allowed', coalesce((v_base_policy ->> 'send_allowed')::boolean, false),
    'send_allowed', v_final_send_allowed,
    'block_reasons', v_reasons,
    'base_policy', v_base_policy,
    'customer_message_sent', false
  );
end;
$function$;

revoke all on function public.resolve_whatsapp_channel_policy_v2(uuid,uuid,uuid,text,text,uuid,timestamptz) from public;
revoke all on function public.resolve_whatsapp_channel_policy_v2(uuid,uuid,uuid,text,text,uuid,timestamptz) from anon;
revoke all on function public.resolve_whatsapp_channel_policy_v2(uuid,uuid,uuid,text,text,uuid,timestamptz) from authenticated;
grant execute on function public.resolve_whatsapp_channel_policy_v2(uuid,uuid,uuid,text,text,uuid,timestamptz) to service_role;
