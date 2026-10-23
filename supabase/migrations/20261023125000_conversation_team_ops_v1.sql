create table if not exists public.lead_inbox_snoozes (
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  snoozed_until timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, lead_id)
);

alter table public.lead_inbox_snoozes enable row level security;

revoke all on table public.lead_inbox_snoozes from public, anon;
grant select, insert, update, delete on table public.lead_inbox_snoozes to authenticated;
grant all on table public.lead_inbox_snoozes to service_role;

create index if not exists lead_inbox_snoozes_user_until_idx
  on public.lead_inbox_snoozes (user_id, snoozed_until);

create policy "Users can create own inbox snooze"
  on public.lead_inbox_snoozes
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.can_access_lead(lead_id)
  );

create policy "Users can read own inbox snooze"
  on public.lead_inbox_snoozes
  for select
  to authenticated
  using (
    user_id = auth.uid()
    and public.can_access_lead(lead_id)
  );

create policy "Users can update own inbox snooze"
  on public.lead_inbox_snoozes
  for update
  to authenticated
  using (
    user_id = auth.uid()
    and public.can_access_lead(lead_id)
  )
  with check (
    user_id = auth.uid()
    and public.can_access_lead(lead_id)
  );

create policy "Users can delete own inbox snooze"
  on public.lead_inbox_snoozes
  for delete
  to authenticated
  using (
    user_id = auth.uid()
    and public.can_access_lead(lead_id)
  );

create or replace function public.get_conversations_workspace(
  p_organization_id uuid,
  p_selected_lead_id uuid default null::uuid,
  p_limit integer default 300
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $function$
declare
  payload jsonb;
  selected_lead_id uuid;
  selected_phone text;
  selected_owner_user_id uuid;
  selected_owner_name text;
  selected_snoozed_until timestamptz;
  can_manage_assignments boolean := false;
  assignment_candidates jsonb := '[]'::jsonb;
begin
  if not public.session_is_bound_to_organization(p_organization_id) then
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

  payload := public.get_conversations_workspace_base_v2(
    p_organization_id,
    p_selected_lead_id,
    p_limit
  );

  can_manage_assignments := public.can_manage_sales_workspace(p_organization_id);

  if can_manage_assignments then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', candidate.user_id,
          'name', candidate.full_name,
          'role', candidate.assignment_role
        )
        order by lower(candidate.full_name), candidate.user_id
      ),
      '[]'::jsonb
    )
    into assignment_candidates
    from (
      select distinct
        om.user_id,
        coalesce(nullif(btrim(p.full_name), ''), 'CRM User') as full_name,
        case
          when om.role in ('owner', 'admin') then om.role
          else coalesce((
            select wm.role
            from public.workspace_memberships wm
            where wm.organization_id = p_organization_id
              and wm.workspace_code = 'sales'
              and wm.user_id = om.user_id
              and wm.active = true
              and wm.role in ('manager', 'member')
            order by case wm.role when 'manager' then 0 else 1 end
            limit 1
          ), om.role)
        end as assignment_role
      from public.organization_members om
      join public.profiles p
        on p.id = om.user_id
       and p.active = true
      where om.organization_id = p_organization_id
        and om.active = true
        and (
          om.role in ('owner', 'admin')
          or exists (
            select 1
            from public.workspace_memberships wm
            where wm.organization_id = p_organization_id
              and wm.workspace_code = 'sales'
              and wm.user_id = om.user_id
              and wm.active = true
              and wm.role in ('manager', 'member')
          )
        )
    ) candidate;
  end if;

  payload := jsonb_set(
    payload,
    '{team}',
    jsonb_build_object(
      'currentUserId', auth.uid(),
      'canManageAssignments', can_manage_assignments,
      'assignmentCandidates', assignment_candidates
    ),
    true
  );

  payload := jsonb_set(
    payload,
    '{inbox}',
    coalesce((
      select jsonb_agg(
        e.item || jsonb_build_object(
          'ownerUserId', l.owner_user_id,
          'ownerName', nullif(btrim(p.full_name), ''),
          'snoozedUntil', s.snoozed_until
        )
        order by e.ordinality
      )
      from jsonb_array_elements(coalesce(payload -> 'inbox', '[]'::jsonb))
        with ordinality as e(item, ordinality)
      left join public.leads l
        on l.organization_id = p_organization_id
       and l.id = nullif(e.item ->> 'id', '')::uuid
      left join public.profiles p
        on p.id = l.owner_user_id
      left join public.lead_inbox_snoozes s
        on s.lead_id = l.id
       and s.user_id = auth.uid()
       and s.snoozed_until > now()
    ), '[]'::jsonb),
    true
  );

  selected_lead_id := nullif(payload ->> 'selectedId', '')::uuid;

  if selected_lead_id is null or payload -> 'selected' is null then
    return payload;
  end if;

  select
    l.owner_user_id,
    nullif(btrim(p.full_name), ''),
    s.snoozed_until
  into
    selected_owner_user_id,
    selected_owner_name,
    selected_snoozed_until
  from public.leads l
  left join public.profiles p
    on p.id = l.owner_user_id
  left join public.lead_inbox_snoozes s
    on s.lead_id = l.id
   and s.user_id = auth.uid()
   and s.snoozed_until > now()
  where l.organization_id = p_organization_id
    and l.id = selected_lead_id
  limit 1;

  payload := jsonb_set(
    payload,
    '{selected}',
    (payload -> 'selected') || jsonb_build_object(
      'ownerUserId', selected_owner_user_id,
      'ownerName', selected_owner_name,
      'snoozedUntil', selected_snoozed_until
    ),
    true
  );

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
$function$;

revoke all on function public.get_conversations_workspace(uuid, uuid, integer)
  from public, anon;
grant execute on function public.get_conversations_workspace(uuid, uuid, integer)
  to authenticated, service_role;
