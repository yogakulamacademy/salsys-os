-- Inbox list v2: "What people are asking" topics and channel counts.
-- Additive: get_current_conversations_page_v1 and its engine are unchanged.
-- The v2 engine is generated from the v1 engine (20261104185000) with only:
--   * p_topic filter on the topic of the lead's latest inbound message;
--   * 'topic' on each row;
--   * counts.channels (within scope + tab) and counts.topics (waiting conversations).
-- Authorization is identical: authenticated session, verified tenant binding,
-- sales workspace access and can_access_lead() per lead.

-- Topic of a lead's latest inbound message, for "What people are asking".
-- Order matters: the first matching topic wins.
create or replace function app_private.inbox_topic_v1(p_body text)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $topic$
  select case
    when p_body is null or btrim(p_body) = '' then null
    when p_body ~* '\m(fees?|cost|price|prices|charges?|how much|kitna|discount|installments?|payment plan|emi)\M' then 'fee'
    when p_body ~* '\m(register|registration|enrol+|enroll|apply|application|admission|book|booking)\M' then 'register'
    when p_body ~* '\m(duration|dates?|batch|batches|schedule|timings?|when|next month)\M' then 'dates'
    when p_body ~* '\m(accommodation|accomodation|stay|room|rooms|twin|sharing|food|meals?)\M' then 'accommodation'
    when p_body ~* '\m(online|offline|recorded|recordings?|zoom|live)\M' then 'online_offline'
    when p_body ~* '\m(location|where|address|located|bangalore|bengaluru)\M' then 'location'
    when p_body ~* '\m(certificate|certification|certified|alliance|rys|eligib\w*)\M' then 'certification'
    else 'other'
  end;
$topic$;

revoke all on function app_private.inbox_topic_v1(text) from public, anon;
grant execute on function app_private.inbox_topic_v1(text) to authenticated;

create or replace function app_private.get_current_conversations_page_engine_v2(
  p_page integer default 1,
  p_page_size integer default 50,
  p_search text default '',
  p_sort text default 'created_desc',
  p_scope text default 'team',
  p_filter text default 'all',
  p_channel text default 'all',
  p_priority text default 'all',
  p_topic text default 'all'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth, pg_temp
as $fn2$
declare
  v_organization_id uuid;
  v_context jsonb;
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 50), 1), 100);
  v_query text := left(lower(btrim(coalesce(p_search, ''))), 120);
  v_sort text := case when p_sort = 'activity_desc' then 'activity_desc' else 'created_desc' end;
  v_scope text := case when p_scope in ('mine','unassigned') then p_scope when coalesce(lower(p_scope),'') ~ '^owner:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then lower(p_scope) else 'team' end;
  v_filter text := case when p_filter in ('reply', 'unread', 'snoozed') then p_filter else 'all' end;
  v_channel text := case when p_channel in ('website', 'whatsapp', 'instagram') then p_channel else 'all' end;
  v_priority text := case when p_priority in ('urgent', 'high', 'normal', 'waiting') then p_priority else 'all' end;
  v_topic text := case when p_topic in ('fee', 'dates', 'register', 'accommodation', 'online_offline', 'location', 'certification', 'other') then p_topic else 'all' end;
  v_result jsonb;
begin
  if auth.role() <> 'authenticated' or auth.uid() is null then
    raise exception 'Authenticated user session required';
  end if;

  -- The authenticated workspace-context RPC exposes enabled workspace codes
  -- with session/tenant validation. The private has_workspace_access helper
  -- intentionally cannot be executed by an authenticated SECURITY INVOKER RPC.
  v_context := public.get_current_workspace_context_v1();
  v_organization_id := nullif(v_context->>'organization_id', '')::uuid;
  if v_organization_id is null or v_organization_id is distinct from public.current_tenant_organization_id() then
    raise exception 'Active tenant binding could not be verified';
  end if;
  if not (coalesce(v_context->'workspace_codes', '[]'::jsonb) ? 'sales') then
    raise exception 'Sales workspace access required';
  end if;

  with lead_base as (
    select
      o.id,
      coalesce(nullif(o.lead_name, ''), o.lead_code, 'Lead') as name,
      coalesce(o.course_name, 'Not selected') as course,
      coalesce(o.country, '—') as country,
      o.current_stage::text as stage,
      coalesce(o.current_contact_channel::text, 'other') as channel,
      o.owner_user_id,
      o.owner_name,
      resolution.resolved_at,
      o.created_at,
      o.last_contacted_at,
      latest.occurred_at as latest_message_at,
      latest.direction as latest_direction,
      inbound.occurred_at as last_inbound_at,
      app_private.inbox_topic_v1(inbound.body) as topic,
      reads.last_read_at,
      snooze.snoozed_until
    from public.v_leads_overview o
    left join lateral (
      select
        case when m.direction::text = 'outbound'
          then coalesce(m.sent_at, m.created_at)
          else coalesce(m.received_at, m.created_at)
        end as occurred_at,
        m.direction::text as direction
      from public.messages m
      where m.organization_id = v_organization_id and m.lead_id = o.id
      order by
        case when m.direction::text = 'outbound'
          then coalesce(m.sent_at, m.created_at)
          else coalesce(m.received_at, m.created_at)
        end desc, m.id desc
      limit 1
    ) latest on true
    left join lateral (
      select coalesce(m.received_at, m.created_at) as occurred_at, m.body
      from public.messages m
      where m.organization_id = v_organization_id
        and m.lead_id = o.id and m.direction::text = 'inbound'
      order by coalesce(m.received_at, m.created_at) desc, m.id desc
      limit 1
    ) inbound on true
    left join public.lead_inbox_resolutions_v1 resolution on resolution.lead_id = o.id and resolution.organization_id = v_organization_id
    left join public.lead_inbox_reads reads
      on reads.lead_id = o.id and reads.user_id = auth.uid()
    left join public.lead_inbox_snoozes snooze
      on snooze.lead_id = o.id and snooze.user_id = auth.uid()
        and snooze.snoozed_until > now()
    where o.organization_id = v_organization_id
      and public.can_access_lead(o.id)
  ),
  inbox_state as (
    select
      b.*,
      (b.latest_direction = 'inbound' and not (b.resolved_at is not null and (b.last_inbound_at is null or b.last_inbound_at <= b.resolved_at))) as needs_reply,
      (b.latest_message_at is null and b.last_contacted_at is null and b.resolved_at is null) as needs_first_contact,
      (b.resolved_at is not null and (b.last_inbound_at is null or b.last_inbound_at <= b.resolved_at)) as resolved,
      (b.last_inbound_at is not null
        and (b.last_read_at is null or b.last_inbound_at > b.last_read_at)) as unread,
      case
        when b.resolved_at is not null and (b.last_inbound_at is null or b.last_inbound_at <= b.resolved_at) then null
        when b.latest_direction = 'inbound' then coalesce(b.last_inbound_at, b.latest_message_at)
        when b.latest_message_at is null and b.last_contacted_at is null then b.created_at
        else null
      end as waiting_since,
      coalesce(b.latest_message_at, b.last_contacted_at, b.created_at) as activity_at
    from lead_base b
  ),
  scored as (
    select
      s.*,
      case
        when not (coalesce(s.needs_reply, false) or s.needs_first_contact) then 'waiting'
        when extract(epoch from now() - coalesce(s.waiting_since, now())) / 60 >= 240
          or (s.stage in ('payment_pending', 'high_intent')
            and extract(epoch from now() - coalesce(s.waiting_since, now())) / 60 >= 60)
          then 'urgent'
        when extract(epoch from now() - coalesce(s.waiting_since, now())) / 60 >= 60
          or s.stage in ('payment_pending', 'high_intent', 'qualified')
          or s.needs_first_contact then 'high'
        else 'normal'
      end as priority
    from inbox_state s
  ),
  matched as (
    select *
    from scored s
    where (v_scope = 'team'
       or (v_scope = 'mine' and s.owner_user_id = auth.uid())
       or (v_scope = 'unassigned' and s.owner_user_id is null) or (v_scope like 'owner:%' and s.owner_user_id = substring(v_scope from 7)::uuid))
      and (v_filter = 'all' and s.snoozed_until is null
        or v_filter = 'snoozed' and s.snoozed_until is not null
        or v_filter = 'reply' and s.snoozed_until is null
          and (coalesce(s.needs_reply, false) or s.needs_first_contact)
        or v_filter = 'unread' and s.snoozed_until is null and coalesce(s.unread, false))
      and (v_channel = 'all' or s.channel = v_channel)
      and (v_topic = 'all' or s.topic = v_topic)
      and (v_priority = 'all' or s.priority = v_priority)
      and (v_query = '' or position(v_query in lower(concat_ws(' ', s.name, s.course, s.country,
        s.stage, s.channel, s.priority, s.owner_name))) > 0)
  ),
  page_rows as (
    select *
    from matched
    order by
      case when v_sort = 'activity_desc' then activity_at end desc nulls last,
      created_at desc, id desc
    limit v_page_size
    offset ((v_page::bigint - 1) * v_page_size)
  )
  select jsonb_build_object(
    'inbox', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id,
        'name', name,
        'course', course,
        'country', country,
        'stage', stage,
        'currentContactChannel', channel,
        'lastContactedAt', activity_at,
        'createdAt', created_at,
        'unread', coalesce(unread, false),
        'needsReply', coalesce(needs_reply, false),
        'needsFirstContact', needs_first_contact,
        'resolved', coalesce(resolved, false),
        'priority', priority,
        'waitingSince', waiting_since,
        'ownerUserId', owner_user_id,
        'ownerName', owner_name,
        'snoozedUntil', snoozed_until,
        'topic', topic
      ) order by
        case when v_sort = 'activity_desc' then activity_at end desc nulls last,
        created_at desc, id desc)
      from page_rows
    ), '[]'::jsonb),
    'page', v_page,
    'pageSize', v_page_size,
    'totalMatching', (select count(*) from matched),
    'owners', coalesce((select jsonb_agg(jsonb_build_object('id', o.owner_user_id, 'name', o.owner_name) order by lower(o.owner_name), o.owner_user_id) from (select distinct owner_user_id, owner_name from scored where owner_user_id is not null and nullif(owner_name,'') is not null) o), '[]'::jsonb),
    'counts', jsonb_build_object(
      'scope', (select count(*) from scored
        where snoozed_until is null and
          (v_scope = 'team' or
           (v_scope = 'mine' and owner_user_id = auth.uid()) or
           (v_scope = 'unassigned' and owner_user_id is null) or
           (v_scope like 'owner:%' and owner_user_id = substring(v_scope from 7)::uuid))),
      'team', (select count(*) from scored where snoozed_until is null),
      'mine', (select count(*) from scored
        where snoozed_until is null and owner_user_id = auth.uid()),
      'unassigned', (select count(*) from scored
        where snoozed_until is null and owner_user_id is null),
      'reply', (select count(*) from scored
        where snoozed_until is null and (v_scope = 'team' or
          (v_scope = 'mine' and owner_user_id = auth.uid()) or
          (v_scope = 'unassigned' and owner_user_id is null) or (v_scope like 'owner:%' and owner_user_id = substring(v_scope from 7)::uuid))
          and (coalesce(needs_reply, false) or needs_first_contact)),
      'unread', (select count(*) from scored
        where snoozed_until is null and (v_scope = 'team' or
          (v_scope = 'mine' and owner_user_id = auth.uid()) or
          (v_scope = 'unassigned' and owner_user_id is null) or (v_scope like 'owner:%' and owner_user_id = substring(v_scope from 7)::uuid))
          and coalesce(unread, false)),
      'snoozed', (select count(*) from scored where snoozed_until is not null and (v_scope = 'team' or
          (v_scope = 'mine' and owner_user_id = auth.uid()) or
          (v_scope = 'unassigned' and owner_user_id is null) or (v_scope like 'owner:%' and owner_user_id = substring(v_scope from 7)::uuid)))
    ),
    'channels', (select jsonb_build_object(
        'all', count(*),
        'whatsapp', count(*) filter (where channel = 'whatsapp'),
        'instagram', count(*) filter (where channel = 'instagram'),
        'website', count(*) filter (where channel = 'website'))
      from scored where (v_scope = 'team' or (v_scope = 'mine' and owner_user_id = auth.uid()) or (v_scope = 'unassigned' and owner_user_id is null) or (v_scope like 'owner:%' and owner_user_id = substring(v_scope from 7)::uuid)) and (v_filter = 'all' and snoozed_until is null or v_filter = 'snoozed' and snoozed_until is not null or v_filter = 'reply' and snoozed_until is null and (coalesce(needs_reply, false) or needs_first_contact) or v_filter = 'unread' and snoozed_until is null and coalesce(unread, false))),
    'topics', coalesce((select jsonb_object_agg(topic, n) from (
        select topic, count(*) as n from scored
        where snoozed_until is null and (v_scope = 'team' or (v_scope = 'mine' and owner_user_id = auth.uid()) or (v_scope = 'unassigned' and owner_user_id is null) or (v_scope like 'owner:%' and owner_user_id = substring(v_scope from 7)::uuid))
          and (coalesce(needs_reply, false) or needs_first_contact)
          and topic is not null and (v_channel = 'all' or channel = v_channel)
        group by topic) t), '{}'::jsonb),
    'topic', v_topic
  )
  into v_result;

  return v_result;
end;
$fn2$;

revoke all on function app_private.get_current_conversations_page_engine_v2(
  integer, integer, text, text, text, text, text, text, text
) from public, anon;
grant execute on function app_private.get_current_conversations_page_engine_v2(
  integer, integer, text, text, text, text, text, text, text
) to authenticated;

create or replace function public.get_current_conversations_page_v2(
  p_page integer default 1,
  p_page_size integer default 50,
  p_search text default '',
  p_sort text default 'created_desc',
  p_scope text default 'team',
  p_filter text default 'all',
  p_channel text default 'all',
  p_priority text default 'all',
  p_topic text default 'all'
)
returns jsonb
language sql
volatile
security invoker
set search_path = public, auth, pg_temp
as $wrapper$
  select app_private.get_current_conversations_page_engine_v2(
    p_page, p_page_size, p_search, p_sort,
    p_scope, p_filter, p_channel, p_priority, p_topic
  );
$wrapper$;

revoke all on function public.get_current_conversations_page_v2(
  integer, integer, text, text, text, text, text, text, text
) from public, anon;
grant execute on function public.get_current_conversations_page_v2(
  integer, integer, text, text, text, text, text, text, text
) to authenticated;

comment on function public.get_current_conversations_page_v2(
  integer, integer, text, text, text, text, text, text, text
) is 'Inbox page v2: v1 plus topic filter (latest inbound message), per-topic and per-channel counts. Same session/tenant/sales/lead authorization as v1.';
