-- PH-0: enforce Sales workspace and per-lead authorization in Conversations.
--
-- The prior SECURITY DEFINER workspace checked tenant binding but could return
-- Sales conversations to users without Sales workspace access. Preserve the
-- working implementation as an internal function and expose a filtered wrapper.

alter function public.get_conversations_workspace(uuid, uuid, integer)
  rename to get_conversations_workspace_unscoped_legacy_v1;

revoke all on function public.get_conversations_workspace_unscoped_legacy_v1(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.get_conversations_workspace_unscoped_legacy_v1(uuid, uuid, integer)
  to service_role;

create or replace function public.get_conversations_workspace(
  p_organization_id uuid,
  p_selected_lead_id uuid default null,
  p_limit integer default 300
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_payload jsonb;
  v_detail_payload jsonb;
  v_filtered_inbox jsonb := '[]'::jsonb;
  v_selected_id uuid;
  v_first_accessible_id uuid;
  v_selected jsonb;
  v_whatsapp jsonb;
  v_metrics jsonb;
begin
  if p_organization_id is null
     or not public.has_workspace_access(p_organization_id, 'sales') then
    return jsonb_build_object(
      'inbox', '[]'::jsonb,
      'selectedId', null,
      'selected', null,
      'whatsapp', jsonb_build_object('hasConversation', false, 'lastInboundAt', null),
      'metrics', jsonb_build_object('activeConversations', 0, 'whatsappCount', 0, 'highIntentCount', 0),
      'team', jsonb_build_object(
        'currentUserId', auth.uid(),
        'canManageAssignments', false,
        'assignmentCandidates', '[]'::jsonb
      )
    );
  end if;

  if p_selected_lead_id is not null
     and not public.can_access_lead(p_selected_lead_id) then
    p_selected_lead_id := null;
  end if;

  v_payload := public.get_conversations_workspace_unscoped_legacy_v1(
    p_organization_id,
    p_selected_lead_id,
    p_limit
  );

  select coalesce(jsonb_agg(e.item order by e.ordinality), '[]'::jsonb)
    into v_filtered_inbox
  from jsonb_array_elements(coalesce(v_payload -> 'inbox', '[]'::jsonb))
    with ordinality as e(item, ordinality)
  where nullif(e.item ->> 'id', '') is not null
    and public.can_access_lead((e.item ->> 'id')::uuid);

  v_selected_id := nullif(v_payload ->> 'selectedId', '')::uuid;
  if v_selected_id is not null and not public.can_access_lead(v_selected_id) then
    v_selected_id := null;
  end if;

  if v_selected_id is null then
    select nullif(e.item ->> 'id', '')::uuid
      into v_first_accessible_id
    from jsonb_array_elements(v_filtered_inbox) with ordinality as e(item, ordinality)
    order by e.ordinality
    limit 1;

    v_selected_id := v_first_accessible_id;
  end if;

  if v_selected_id is not null then
    if nullif(v_payload ->> 'selectedId', '')::uuid is distinct from v_selected_id then
      v_detail_payload := public.get_conversations_workspace_unscoped_legacy_v1(
        p_organization_id,
        v_selected_id,
        p_limit
      );
    else
      v_detail_payload := v_payload;
    end if;

    if public.can_access_lead(v_selected_id) then
      v_selected := coalesce(v_detail_payload -> 'selected', 'null'::jsonb);
      if jsonb_typeof(v_selected) = 'object' then
        v_selected := v_selected - 'phone';
      end if;
      v_whatsapp := coalesce(
        v_detail_payload -> 'whatsapp',
        jsonb_build_object('hasConversation', false, 'lastInboundAt', null)
      );
    else
      v_selected_id := null;
      v_selected := null;
      v_whatsapp := jsonb_build_object('hasConversation', false, 'lastInboundAt', null);
    end if;
  else
    v_selected := null;
    v_whatsapp := jsonb_build_object('hasConversation', false, 'lastInboundAt', null);
  end if;

  select jsonb_build_object(
    'activeConversations', count(*)::integer,
    'whatsappCount', count(*) filter (
      where lower(coalesce(e.item ->> 'currentContactChannel', '')) = 'whatsapp'
    )::integer,
    'highIntentCount', count(*) filter (
      where lower(coalesce(e.item ->> 'stage', '')) in ('high_intent', 'payment_pending')
    )::integer
  )
  into v_metrics
  from jsonb_array_elements(v_filtered_inbox) as e(item);

  return jsonb_build_object(
    'inbox', v_filtered_inbox,
    'selectedId', v_selected_id,
    'selected', v_selected,
    'whatsapp', v_whatsapp,
    'metrics', coalesce(v_metrics, jsonb_build_object(
      'activeConversations', 0,
      'whatsappCount', 0,
      'highIntentCount', 0
    )),
    'team', coalesce(v_payload -> 'team', jsonb_build_object(
      'currentUserId', auth.uid(),
      'canManageAssignments', false,
      'assignmentCandidates', '[]'::jsonb
    ))
  );
end;
$function$;

revoke all on function public.get_conversations_workspace(uuid, uuid, integer)
  from public, anon;
grant execute on function public.get_conversations_workspace(uuid, uuid, integer)
  to authenticated, service_role;

comment on function public.get_conversations_workspace(uuid, uuid, integer) is
  'Sales-workspace authorized Conversations read model. Enforces can_access_lead for every returned lead and omits raw phone data from the browser payload.';
