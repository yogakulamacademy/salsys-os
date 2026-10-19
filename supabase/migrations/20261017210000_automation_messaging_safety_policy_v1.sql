-- SalsysOS automation messaging safety policy V1.
--
-- Purpose:
--   Establish a fail-closed policy boundary before any automation send node exists.
--
-- Safety principles:
--   * customer auto-send remains disabled by default
--   * active suppressions block automation messaging
--   * exact customer opt-out commands create channel-level suppressions
--   * per-channel frequency caps are evaluated from canonical outbound messages
--   * missing/disabled policy blocks autonomous sending
--   * human approval remains required by default
--   * this migration does NOT send customer messages

alter table public.automation_suppressions
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists public.automation_messaging_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel text not null,
  policy_enabled boolean not null default false,
  autonomous_send_enabled boolean not null default false,
  requires_human_approval boolean not null default true,
  max_messages_24h integer not null default 3,
  max_messages_7d integer not null default 8,
  min_gap_minutes integer not null default 30,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint automation_messaging_policies_channel_nonempty_check
    check (nullif(btrim(channel), '') is not null),
  constraint automation_messaging_policies_max_24h_check
    check (max_messages_24h between 1 and 1000),
  constraint automation_messaging_policies_max_7d_check
    check (max_messages_7d between 1 and 5000),
  constraint automation_messaging_policies_gap_check
    check (min_gap_minutes between 0 and 10080),
  constraint automation_messaging_policies_org_channel_key
    unique (organization_id, channel)
);

create index if not exists automation_messaging_policies_org_enabled_idx
  on public.automation_messaging_policies (organization_id, policy_enabled, channel);

alter table public.automation_messaging_policies enable row level security;

revoke all on table public.automation_messaging_policies from public;
revoke all on table public.automation_messaging_policies from anon;
revoke all on table public.automation_messaging_policies from authenticated;
grant select, insert, update, delete on table public.automation_messaging_policies to service_role;

-- Seed existing organizations with deliberately disabled messaging policies.
-- No organization receives autonomous sending from this migration.
insert into public.automation_messaging_policies (
  organization_id,
  channel,
  policy_enabled,
  autonomous_send_enabled,
  requires_human_approval,
  max_messages_24h,
  max_messages_7d,
  min_gap_minutes,
  metadata
)
select
  o.id,
  c.channel,
  false,
  false,
  true,
  3,
  8,
  30,
  jsonb_build_object(
    'seeded_by', 'automation_messaging_safety_policy_v1',
    'customer_auto_send', false
  )
from public.organizations o
cross join (
  values ('whatsapp'::text), ('instagram'::text)
) as c(channel)
on conflict (organization_id, channel) do nothing;

create or replace function public.set_automation_suppression_v1(
  p_organization_id uuid,
  p_lead_id uuid,
  p_scope text default 'messaging',
  p_reason text default 'manual_suppression',
  p_channel text default null,
  p_workflow_id uuid default null,
  p_expires_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_id uuid;
  v_scope text := lower(coalesce(nullif(btrim(p_scope), ''), 'messaging'));
  v_channel text := nullif(lower(btrim(coalesce(p_channel, ''))), '');
  v_reason text := coalesce(nullif(btrim(p_reason), ''), 'manual_suppression');
begin
  if p_organization_id is null or p_lead_id is null then
    raise exception 'organization_id and lead_id are required';
  end if;

  if v_scope not in ('all', 'messaging', 'workflow') then
    raise exception 'Unsupported suppression scope: %', v_scope;
  end if;

  if v_scope = 'workflow' and p_workflow_id is null then
    raise exception 'workflow scope requires workflow_id';
  end if;

  if not exists (
    select 1
    from public.leads l
    where l.id = p_lead_id
      and l.organization_id = p_organization_id
  ) then
    raise exception 'Lead does not belong to organization';
  end if;

  if p_workflow_id is not null and not exists (
    select 1
    from public.automation_workflows w
    where w.id = p_workflow_id
      and w.organization_id = p_organization_id
  ) then
    raise exception 'Workflow does not belong to organization';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text || ':suppression:' || p_lead_id::text,
      0
    )
  );

  select s.id
  into v_id
  from public.automation_suppressions s
  where s.organization_id = p_organization_id
    and s.lead_id = p_lead_id
    and s.active = true
    and s.scope = v_scope
    and s.workflow_id is not distinct from p_workflow_id
    and s.channel is not distinct from v_channel
  limit 1;

  if v_id is not null then
    update public.automation_suppressions
    set
      reason = v_reason,
      expires_at = p_expires_at,
      metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb),
      updated_at = now()
    where id = v_id
      and organization_id = p_organization_id;
  else
    insert into public.automation_suppressions (
      organization_id,
      lead_id,
      workflow_id,
      channel,
      scope,
      reason,
      active,
      expires_at,
      metadata
    )
    values (
      p_organization_id,
      p_lead_id,
      p_workflow_id,
      v_channel,
      v_scope,
      v_reason,
      true,
      p_expires_at,
      coalesce(p_metadata, '{}'::jsonb)
    )
    returning id into v_id;
  end if;

  return v_id;
end;
$function$;

revoke all on function public.set_automation_suppression_v1(
  uuid, uuid, text, text, text, uuid, timestamptz, jsonb
) from public;
revoke all on function public.set_automation_suppression_v1(
  uuid, uuid, text, text, text, uuid, timestamptz, jsonb
) from anon;
revoke all on function public.set_automation_suppression_v1(
  uuid, uuid, text, text, text, uuid, timestamptz, jsonb
) from authenticated;
grant execute on function public.set_automation_suppression_v1(
  uuid, uuid, text, text, text, uuid, timestamptz, jsonb
) to service_role;

create or replace function public.capture_customer_opt_out_v1()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_channel text;
  v_command text;
begin
  if new.direction::text <> 'inbound' then
    return new;
  end if;

  v_command := lower(regexp_replace(btrim(coalesce(new.body, '')), '\s+', ' ', 'g'));

  if v_command not in (
    'stop',
    'unsubscribe',
    'opt out',
    'opt-out',
    'do not contact',
    'do not contact me',
    'cancel messages',
    'no more messages'
  ) then
    return new;
  end if;

  select c.channel::text
  into v_channel
  from public.conversations c
  where c.id = new.conversation_id
    and c.organization_id = new.organization_id
    and c.lead_id = new.lead_id
  limit 1;

  if v_channel is null then
    return new;
  end if;

  perform public.set_automation_suppression_v1(
    new.organization_id,
    new.lead_id,
    'messaging',
    'customer_opt_out',
    v_channel,
    null,
    null,
    jsonb_build_object(
      'source', 'inbound_message_opt_out_v1',
      'message_id', new.id,
      'conversation_id', new.conversation_id,
      'channel', v_channel,
      'command', v_command,
      'captured_at', now()
    )
  );

  return new;
end;
$function$;

revoke all on function public.capture_customer_opt_out_v1() from public;
revoke all on function public.capture_customer_opt_out_v1() from anon;
revoke all on function public.capture_customer_opt_out_v1() from authenticated;

drop trigger if exists messages_capture_customer_opt_out_v1 on public.messages;
create trigger messages_capture_customer_opt_out_v1
after insert on public.messages
for each row
when (new.direction::text = 'inbound')
execute function public.capture_customer_opt_out_v1();

create or replace function public.evaluate_automation_send_policy_v1(
  p_organization_id uuid,
  p_lead_id uuid,
  p_channel text,
  p_workflow_id uuid default null,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_channel text := nullif(lower(btrim(coalesce(p_channel, ''))), '');
  v_policy public.automation_messaging_policies%rowtype;
  v_suppression public.automation_suppressions%rowtype;
  v_count_24h integer := 0;
  v_count_7d integer := 0;
  v_last_outbound_at timestamptz;
  v_gap_ok boolean := true;
  v_frequency_limited boolean := false;
  v_policy_missing boolean := false;
  v_send_allowed boolean := false;
  v_requires_approval boolean := true;
  v_reasons jsonb := '[]'::jsonb;
begin
  if p_organization_id is null or p_lead_id is null or v_channel is null then
    return jsonb_build_object(
      'ok', false,
      'send_allowed', false,
      'customer_message_sent', false,
      'reason', 'organization_id, lead_id and channel are required'
    );
  end if;

  if not exists (
    select 1
    from public.leads l
    where l.id = p_lead_id
      and l.organization_id = p_organization_id
  ) then
    return jsonb_build_object(
      'ok', false,
      'send_allowed', false,
      'customer_message_sent', false,
      'reason', 'lead_tenant_mismatch'
    );
  end if;

  if p_workflow_id is not null and not exists (
    select 1
    from public.automation_workflows w
    where w.id = p_workflow_id
      and w.organization_id = p_organization_id
  ) then
    return jsonb_build_object(
      'ok', false,
      'send_allowed', false,
      'customer_message_sent', false,
      'reason', 'workflow_tenant_mismatch'
    );
  end if;

  select s.*
  into v_suppression
  from public.automation_suppressions s
  where s.organization_id = p_organization_id
    and s.lead_id = p_lead_id
    and s.active = true
    and (s.expires_at is null or s.expires_at > coalesce(p_now, now()))
    and (
      s.scope = 'all'
      or (
        s.scope = 'messaging'
        and (s.channel is null or lower(s.channel) = v_channel)
      )
      or (
        s.scope = 'workflow'
        and p_workflow_id is not null
        and s.workflow_id = p_workflow_id
        and (s.channel is null or lower(s.channel) = v_channel)
      )
    )
  order by
    case s.scope when 'all' then 0 when 'workflow' then 1 else 2 end,
    s.created_at asc
  limit 1;

  if found then
    v_reasons := v_reasons || jsonb_build_array('suppressed');
  end if;

  select p.*
  into v_policy
  from public.automation_messaging_policies p
  where p.organization_id = p_organization_id
    and lower(p.channel) = v_channel
  limit 1;

  if not found then
    v_policy_missing := true;
    v_reasons := v_reasons || jsonb_build_array('policy_missing');
  else
    if v_policy.policy_enabled is not true then
      v_reasons := v_reasons || jsonb_build_array('policy_disabled');
    end if;

    if v_policy.autonomous_send_enabled is not true then
      v_reasons := v_reasons || jsonb_build_array('autonomous_send_disabled');
    end if;

    v_requires_approval := coalesce(v_policy.requires_human_approval, true);
    if v_requires_approval then
      v_reasons := v_reasons || jsonb_build_array('human_approval_required');
    end if;

    select
      count(*) filter (
        where coalesce(m.sent_at, m.created_at) >= coalesce(p_now, now()) - interval '24 hours'
      )::integer,
      count(*) filter (
        where coalesce(m.sent_at, m.created_at) >= coalesce(p_now, now()) - interval '7 days'
      )::integer,
      max(coalesce(m.sent_at, m.created_at))
    into
      v_count_24h,
      v_count_7d,
      v_last_outbound_at
    from public.messages m
    join public.conversations c
      on c.id = m.conversation_id
     and c.organization_id = m.organization_id
     and c.lead_id = m.lead_id
    where m.organization_id = p_organization_id
      and m.lead_id = p_lead_id
      and m.direction::text = 'outbound'
      and m.status::text <> 'failed'
      and c.channel::text = v_channel
      and coalesce(m.sent_at, m.created_at) >= coalesce(p_now, now()) - interval '7 days';

    v_gap_ok :=
      v_last_outbound_at is null
      or v_policy.min_gap_minutes = 0
      or v_last_outbound_at <= coalesce(p_now, now()) - make_interval(mins => v_policy.min_gap_minutes);

    v_frequency_limited :=
      v_count_24h >= v_policy.max_messages_24h
      or v_count_7d >= v_policy.max_messages_7d
      or not v_gap_ok;

    if v_frequency_limited then
      v_reasons := v_reasons || jsonb_build_array('frequency_cap_reached');
    end if;
  end if;

  v_send_allowed :=
    v_suppression.id is null
    and not v_policy_missing
    and v_policy.policy_enabled = true
    and v_policy.autonomous_send_enabled = true
    and v_requires_approval = false
    and not v_frequency_limited;

  return jsonb_build_object(
    'ok', true,
    'organization_id', p_organization_id,
    'lead_id', p_lead_id,
    'workflow_id', p_workflow_id,
    'channel', v_channel,
    'send_allowed', v_send_allowed,
    'eligible_after_safety_checks',
      (v_suppression.id is null and not v_policy_missing and not v_frequency_limited),
    'suppressed', v_suppression.id is not null,
    'suppression_id', v_suppression.id,
    'suppression_scope', v_suppression.scope,
    'suppression_reason', v_suppression.reason,
    'policy_missing', v_policy_missing,
    'policy_enabled', coalesce(v_policy.policy_enabled, false),
    'autonomous_send_enabled', coalesce(v_policy.autonomous_send_enabled, false),
    'requires_human_approval', v_requires_approval,
    'frequency_limited', v_frequency_limited,
    'messages_24h', v_count_24h,
    'messages_7d', v_count_7d,
    'max_messages_24h', v_policy.max_messages_24h,
    'max_messages_7d', v_policy.max_messages_7d,
    'min_gap_minutes', v_policy.min_gap_minutes,
    'last_outbound_at', v_last_outbound_at,
    'gap_ok', v_gap_ok,
    'block_reasons', v_reasons,
    'customer_message_sent', false
  );
end;
$function$;

revoke all on function public.evaluate_automation_send_policy_v1(
  uuid, uuid, text, uuid, timestamptz
) from public;
revoke all on function public.evaluate_automation_send_policy_v1(
  uuid, uuid, text, uuid, timestamptz
) from anon;
revoke all on function public.evaluate_automation_send_policy_v1(
  uuid, uuid, text, uuid, timestamptz
) from authenticated;
grant execute on function public.evaluate_automation_send_policy_v1(
  uuid, uuid, text, uuid, timestamptz
) to service_role;
