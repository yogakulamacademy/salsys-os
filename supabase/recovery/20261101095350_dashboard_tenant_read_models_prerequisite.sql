-- Cold-recovery compatibility only.
--
-- The tenant-aware Dashboard snapshot depends on two read models that existed
-- in production before the strict Nov 1 Home closeout, but whose tenant-aware
-- definitions were never captured by a committed migration:
--   - v_pipeline_counts
--   - v_lead_inbox_attention
--
-- This file reconstructs only those read-model contracts for clean replay.
-- It copies no production data and must never be run against current production.

begin;

create or replace view public.v_pipeline_counts
with (security_invoker = true)
as
select
  l.current_stage,
  count(*) as lead_count,
  l.organization_id
from public.leads l
where l.status <> 'archived'::public.lead_status
group by l.organization_id, l.current_stage;

create or replace view public.v_lead_inbox_attention
with (security_invoker = true)
as
select
  l.id as lead_id,
  latest.id as latest_message_id,
  latest.conversation_id,
  latest.direction::text as latest_direction,
  latest.created_at as latest_message_at,
  latest.channel::text as latest_channel,
  last_inbound.created_at as last_inbound_at,
  last_outbound.created_at as last_outbound_at,
  case
    when latest.direction::text = 'inbound'::text then true
    else false
  end as needs_reply,
  l.organization_id
from public.leads l
left join lateral (
  select
    m.id,
    m.conversation_id,
    m.direction,
    m.created_at,
    c.channel
  from public.messages m
  left join public.conversations c
    on c.id = m.conversation_id
   and c.organization_id = l.organization_id
  where m.lead_id = l.id
    and m.organization_id = l.organization_id
  order by m.created_at desc, m.id desc
  limit 1
) latest on true
left join lateral (
  select m.created_at
  from public.messages m
  where m.lead_id = l.id
    and m.organization_id = l.organization_id
    and m.direction = 'inbound'::public.message_direction
  order by m.created_at desc, m.id desc
  limit 1
) last_inbound on true
left join lateral (
  select m.created_at
  from public.messages m
  where m.lead_id = l.id
    and m.organization_id = l.organization_id
    and m.direction = 'outbound'::public.message_direction
  order by m.created_at desc, m.id desc
  limit 1
) last_outbound on true;

revoke all on public.v_pipeline_counts from public, anon;
revoke all on public.v_lead_inbox_attention from public, anon;

grant select on public.v_pipeline_counts to authenticated, service_role;
grant select on public.v_lead_inbox_attention to authenticated, service_role;

commit;
