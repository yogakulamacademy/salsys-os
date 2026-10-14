begin;

-- =============================================================================
-- 061_sales_conversation_contact_capability.sql
--
-- Expose only a boolean telephone-contact capability to the Sales conversation
-- workspace. Raw phone/WhatsApp values remain server-side and continue to be
-- loaded only after can_work_lead() succeeds in the sending action.
-- =============================================================================

create or replace function public.has_lead_telephone_contact(
  p_lead_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
  select
    public.can_access_lead(p_lead_id)
    and exists (
      select 1
      from public.lead_contacts lc
      join public.leads l
        on l.id = lc.lead_id
       and l.organization_id = lc.organization_id
      where lc.lead_id = p_lead_id
        and lc.contact_type::text in ('phone', 'whatsapp')
        and nullif(
          regexp_replace(
            coalesce(lc.normalized_value, lc.value, ''),
            '\D',
            '',
            'g'
          ),
          ''
        ) is not null
    );
$function$;

revoke all on function public.has_lead_telephone_contact(uuid)
  from public, anon;

grant execute on function public.has_lead_telephone_contact(uuid)
  to authenticated, service_role;

comment on function public.has_lead_telephone_contact(uuid) is
  'Returns only whether an accessible lead has a usable phone/WhatsApp contact. Does not expose the contact value.';

create or replace function public.get_conversations_workspace(
  p_organization_id uuid,
  p_selected_lead_id uuid default null::uuid,
  p_limit integer default 300
)
returns jsonb
language sql
stable
set search_path = public, auth, pg_temp
as $function$
with
settings as (
  select
    least(greatest(coalesce(p_limit, 300), 1), 500) as row_limit,
    (
      p_organization_id is not null
      and (
        auth.role() = 'service_role'
        or exists (
          select 1
          from public.organization_members om
          where om.organization_id = p_organization_id
            and om.user_id = auth.uid()
            and om.active = true
        )
      )
    ) as authorized
),

recent_candidates as (
  select
    o.id,
    o.lead_code,
    coalesce(
      nullif(l.display_name, ''),
      nullif(trim(concat_ws(' ', l.first_name, l.last_name)), ''),
      o.lead_code,
      'Lead'
    ) as lead_name,
    coalesce(o.course_name, 'Not selected') as course_name,
    coalesce(o.country, '—') as country,
    o.current_stage::text as current_stage,
    coalesce(o.current_contact_channel::text, 'other') as current_contact_channel,
    coalesce(o.lead_creation_channel::text, 'other') as lead_creation_channel,
    o.last_contacted_at,
    o.created_at
  from public.v_leads_overview o
  left join public.leads l
    on l.id = o.id
   and l.organization_id = p_organization_id
  where
    (select authorized from settings)
    and o.organization_id = p_organization_id
    and (
      o.last_contacted_at is not null
      or o.lead_creation_channel::text = 'website'
      or o.current_contact_channel::text = 'website'
    )
  order by o.created_at desc
  limit (select row_limit from settings)
),

inbox_base as (
  select
    r.*,
    latest.created_at as latest_message_at,
    latest.direction as latest_direction,
    latest.channel as latest_channel,
    last_inbound.created_at as last_inbound_at,
    (latest.direction = 'inbound') as needs_reply,
    reads.last_read_at,
    (
      last_inbound.created_at is not null
      and (
        reads.last_read_at is null
        or last_inbound.created_at > reads.last_read_at
      )
    ) as unread,
    (
      latest.created_at is null
      and r.last_contacted_at is null
    ) as needs_first_contact,
    case
      when latest.direction = 'inbound'
        then coalesce(last_inbound.created_at, latest.created_at)
      when latest.created_at is null and r.last_contacted_at is null
        then r.created_at
      else null
    end as waiting_since
  from recent_candidates r

  left join lateral (
    select
      m.created_at,
      m.direction::text as direction,
      coalesce(c.channel::text, 'other') as channel
    from public.messages m
    left join public.conversations c
      on c.id = m.conversation_id
     and c.organization_id = p_organization_id
    where m.lead_id = r.id
      and m.organization_id = p_organization_id
    order by m.created_at desc, m.id desc
    limit 1
  ) latest on true

  left join lateral (
    select m.created_at
    from public.messages m
    where m.lead_id = r.id
      and m.organization_id = p_organization_id
      and m.direction::text = 'inbound'
    order by m.created_at desc, m.id desc
    limit 1
  ) last_inbound on true

  left join public.lead_inbox_reads reads
    on reads.lead_id = r.id
   and reads.user_id = auth.uid()
),

inbox_scored as (
  select
    b.*,
    greatest(
      0,
      floor(
        extract(
          epoch from (
            now() - coalesce(b.waiting_since, now())
          )
        ) / 60
      )
    )::bigint as waiting_minutes
  from inbox_base b
),

inbox_ranked as (
  select
    s.*,
    case
      when not (s.needs_reply or s.needs_first_contact)
        then 'waiting'
      when
        s.waiting_minutes >= 240
        or (
          s.current_stage in ('payment_pending', 'high_intent')
          and s.waiting_minutes >= 60
        )
        then 'urgent'
      when
        s.waiting_minutes >= 60
        or s.current_stage in ('payment_pending', 'high_intent', 'qualified')
        or s.needs_first_contact
        then 'high'
      else 'normal'
    end as priority,
    row_number() over (
      order by
        (s.needs_reply or s.needs_first_contact) desc,
        case
          when not (s.needs_reply or s.needs_first_contact) then 0
          when
            s.waiting_minutes >= 240
            or (
              s.current_stage in ('payment_pending', 'high_intent')
              and s.waiting_minutes >= 60
            )
            then 3
          when
            s.waiting_minutes >= 60
            or s.current_stage in ('payment_pending', 'high_intent', 'qualified')
            or s.needs_first_contact
            then 2
          else 1
        end desc,
        s.unread desc,
        case
          when s.needs_reply or s.needs_first_contact
            then s.waiting_minutes
          else 0
        end desc,
        coalesce(
          s.latest_message_at,
          s.last_contacted_at,
          s.created_at
        ) desc
    ) as sort_order
  from inbox_scored s
),

selected_id as (
  select coalesce(
    (
      select o.id
      from public.v_leads_overview o
      where p_selected_lead_id is not null
        and (select authorized from settings)
        and o.organization_id = p_organization_id
        and o.id = p_selected_lead_id
      limit 1
    ),
    (
      select i.id
      from inbox_ranked i
      order by i.sort_order
      limit 1
    )
  ) as id
),

selected_lead as (
  select
    o.id,
    coalesce(
      nullif(l.display_name, ''),
      nullif(trim(concat_ws(' ', l.first_name, l.last_name)), ''),
      o.lead_code,
      'Lead'
    ) as lead_name,
    coalesce(o.course_name, 'Not selected') as course_name,
    coalesce(o.country, '—') as country,
    o.current_stage::text as current_stage,
    coalesce(o.current_contact_channel::text, 'other') as current_contact_channel,
    coalesce(o.lead_creation_channel::text, 'other') as lead_creation_channel,
    o.last_contacted_at,
    o.created_at,
    public.has_lead_telephone_contact(o.id) as has_telephone_contact,
    l.interested_course_id
  from selected_id sid
  join public.v_leads_overview o
    on o.id = sid.id
   and o.organization_id = p_organization_id
  left join public.leads l
    on l.id = o.id
   and l.organization_id = p_organization_id
),

selected_messages as (
  select
    m.id,
    m.direction::text as direction,
    m.sender_type::text as sender_type,
    coalesce(m.body, '[Non-text message]') as body,
    m.created_at,
    coalesce(c.channel::text, 'other') as channel,
    m.status::text as status,
    m.external_message_id,
    m.sent_at,
    m.delivered_at,
    m.read_at
  from selected_id sid
  join lateral (
    select m.*
    from public.messages m
    where m.lead_id = sid.id
      and m.organization_id = p_organization_id
    order by m.created_at desc
    limit 12
  ) m on true
  left join public.conversations c
    on c.id = m.conversation_id
   and c.organization_id = p_organization_id
),

latest_whatsapp_conversation as (
  select c.id
  from selected_id sid
  join lateral (
    select c.id
    from public.conversations c
    where c.lead_id = sid.id
      and c.organization_id = p_organization_id
      and c.channel::text = 'whatsapp'
    order by c.last_message_at desc nulls last, c.id desc
    limit 1
  ) c on true
),

last_whatsapp_inbound as (
  select m.created_at
  from latest_whatsapp_conversation wc
  join lateral (
    select m.created_at
    from public.messages m
    where m.conversation_id = wc.id
      and m.organization_id = p_organization_id
      and m.direction::text = 'inbound'
    order by m.created_at desc, m.id desc
    limit 1
  ) m on true
),

metrics as (
  select
    count(*)::integer as active_conversations,
    count(*) filter (
      where current_contact_channel = 'whatsapp'
    )::integer as whatsapp_count,
    count(*) filter (
      where current_stage in ('high_intent', 'payment_pending')
    )::integer as high_intent_count
  from inbox_ranked
)

select jsonb_build_object(
  'inbox',
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'name', i.lead_name,
          'course', i.course_name,
          'country', i.country,
          'stage', i.current_stage,
          'currentContactChannel', i.current_contact_channel,
          'lastContactedAt', coalesce(
            i.latest_message_at,
            i.last_contacted_at,
            i.created_at
          ),
          'unread', i.unread,
          'needsReply', i.needs_reply,
          'needsFirstContact', i.needs_first_contact,
          'priority', i.priority,
          'waitingSince', i.waiting_since
        )
        order by i.sort_order
      )
      from inbox_ranked i
    ),
    '[]'::jsonb
  ),

  'selectedId',
  (
    select id
    from selected_id
  ),

  'selected',
  (
    select jsonb_build_object(
      'id', s.id,
      'name', s.lead_name,
      'course', s.course_name,
      'country', s.country,
      'stage', s.current_stage,
      'currentContactChannel', s.current_contact_channel,
      'leadCreationChannel', s.lead_creation_channel,
      'lastContactedAt', s.last_contacted_at,
      'createdAt', s.created_at,
      'hasTelephoneContact', s.has_telephone_contact,
      'interestedCourseId', s.interested_course_id,
      'lastMessages',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', x.id,
              'direction', x.direction,
              'sender',
                case
                  when x.sender_type = 'lead' then s.lead_name
                  when x.sender_type = 'ai' then 'AI Agent'
                  else 'Admissions'
                end,
              'body', x.body,
              'timestamp', x.created_at,
              'channel', x.channel,
              'status', x.status,
              'externalMessageId', x.external_message_id,
              'sentAt', x.sent_at,
              'deliveredAt', x.delivered_at,
              'readAt', x.read_at
            )
            order by x.created_at asc
          )
          from selected_messages x
        ),
        '[]'::jsonb
      )
    )
    from selected_lead s
  ),

  'whatsapp',
  jsonb_build_object(
    'hasConversation',
    exists(
      select 1
      from latest_whatsapp_conversation
    ),
    'lastInboundAt',
    (
      select created_at
      from last_whatsapp_inbound
      limit 1
    )
  ),

  'metrics',
  (
    select jsonb_build_object(
      'activeConversations', m.active_conversations,
      'whatsappCount', m.whatsapp_count,
      'highIntentCount', m.high_intent_count
    )
    from metrics m
  )
);
$function$;

commit;
