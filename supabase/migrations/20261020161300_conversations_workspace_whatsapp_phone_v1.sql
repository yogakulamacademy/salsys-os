alter function public.get_conversations_workspace(uuid, uuid, integer)
  rename to get_conversations_workspace_base_v2;

revoke all on function public.get_conversations_workspace_base_v2(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.get_conversations_workspace_base_v2(uuid, uuid, integer)
  to service_role;

create function public.get_conversations_workspace(
  p_organization_id uuid,
  p_selected_lead_id uuid default null::uuid,
  p_limit integer default 300
)
returns jsonb
language plpgsql
stable
security definer
set search_path = 'public', 'auth', 'pg_temp'
as $$
declare
  payload jsonb;
  selected_lead_id uuid;
  selected_phone text;
begin
  if not public.session_is_bound_to_organization(p_organization_id) then
    return jsonb_build_object(
      'inbox', '[]'::jsonb,
      'selectedId', null,
      'selected', null,
      'whatsapp', jsonb_build_object(
        'hasConversation', false,
        'lastInboundAt', null
      ),
      'metrics', jsonb_build_object(
        'activeConversations', 0,
        'whatsappCount', 0,
        'highIntentCount', 0
      )
    );
  end if;

  payload := public.get_conversations_workspace_base_v2(
    p_organization_id,
    p_selected_lead_id,
    p_limit
  );

  selected_lead_id := nullif(payload ->> 'selectedId', '')::uuid;

  if selected_lead_id is null or payload -> 'selected' is null then
    return payload;
  end if;

  select coalesce(nullif(lc.value, ''), nullif(lc.normalized_value, ''))
    into selected_phone
  from public.lead_contacts lc
  where lc.organization_id = p_organization_id
    and lc.lead_id = selected_lead_id
    and lc.contact_type::text in ('whatsapp', 'phone')
  order by
    case when lc.contact_type::text = 'whatsapp' then 0 else 1 end,
    lc.is_primary desc,
    lc.verified desc,
    lc.created_at asc
  limit 1;

  if selected_phone is not null then
    payload := jsonb_set(
      payload,
      '{selected,phone}',
      to_jsonb(selected_phone),
      true
    );
  end if;

  return payload;
end;
$$;

revoke all on function public.get_conversations_workspace(uuid, uuid, integer)
  from public, anon;
grant execute on function public.get_conversations_workspace(uuid, uuid, integer)
  to authenticated, service_role;
