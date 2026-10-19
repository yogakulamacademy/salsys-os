-- SalsysOS canonical automation event emitter V1.
-- Additive only. This migration does NOT enable automation runtime or customer messaging.
-- PostgreSQL remains the source of truth; this creates one tenant-safe event boundary
-- that can be reused by CRM lifecycle triggers and future provider adapters.

create or replace function public.emit_automation_event_v1(
  p_organization_id uuid,
  p_event_name text,
  p_source_system text default 'salsysos',
  p_source_event_id text default null,
  p_lead_id uuid default null,
  p_conversation_id uuid default null,
  p_message_id uuid default null,
  p_occurred_at timestamptz default now(),
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_event_id uuid;
  v_event_name text := nullif(btrim(p_event_name), '');
  v_source_system text := coalesce(nullif(btrim(p_source_system), ''), 'salsysos');
  v_source_event_id text := nullif(btrim(p_source_event_id), '');
begin
  if p_organization_id is null then
    raise exception 'organization_id is required to emit an automation event';
  end if;

  if v_event_name is null then
    raise exception 'event_name is required to emit an automation event';
  end if;

  if not exists (
    select 1
    from public.organizations o
    where o.id = p_organization_id
  ) then
    raise exception 'Automation event organization % does not exist', p_organization_id;
  end if;

  -- A deterministic source_event_id makes provider retries and lifecycle trigger
  -- retries idempotent. The existing automation event tenant-alignment trigger
  -- validates lead/conversation/message references before insert.
  if v_source_event_id is not null then
    insert into public.automation_events (
      organization_id,
      event_name,
      source_system,
      source_event_id,
      lead_id,
      conversation_id,
      message_id,
      occurred_at,
      payload
    )
    values (
      p_organization_id,
      v_event_name,
      v_source_system,
      v_source_event_id,
      p_lead_id,
      p_conversation_id,
      p_message_id,
      coalesce(p_occurred_at, now()),
      coalesce(p_payload, '{}'::jsonb)
    )
    on conflict (organization_id, source_system, source_event_id)
      where source_event_id is not null
    do nothing
    returning id into v_event_id;

    if v_event_id is null then
      select ae.id
      into v_event_id
      from public.automation_events ae
      where ae.organization_id = p_organization_id
        and ae.source_system = v_source_system
        and ae.source_event_id = v_source_event_id
      limit 1;
    end if;
  else
    insert into public.automation_events (
      organization_id,
      event_name,
      source_system,
      source_event_id,
      lead_id,
      conversation_id,
      message_id,
      occurred_at,
      payload
    )
    values (
      p_organization_id,
      v_event_name,
      v_source_system,
      null,
      p_lead_id,
      p_conversation_id,
      p_message_id,
      coalesce(p_occurred_at, now()),
      coalesce(p_payload, '{}'::jsonb)
    )
    returning id into v_event_id;
  end if;

  return v_event_id;
end;
$function$;

-- The emitter is an internal runtime boundary. Browser roles do not call it
-- directly; authenticated CRM lead creation reaches it through the database
-- trigger below, while trusted provider adapters can use service_role later.
revoke all on function public.emit_automation_event_v1(
  uuid, text, text, text, uuid, uuid, uuid, timestamptz, jsonb
) from public;
revoke all on function public.emit_automation_event_v1(
  uuid, text, text, text, uuid, uuid, uuid, timestamptz, jsonb
) from anon;
revoke all on function public.emit_automation_event_v1(
  uuid, text, text, text, uuid, uuid, uuid, timestamptz, jsonb
) from authenticated;
grant execute on function public.emit_automation_event_v1(
  uuid, text, text, text, uuid, uuid, uuid, timestamptz, jsonb
) to service_role;

create or replace function public.emit_lead_created_automation_event_v1()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
begin
  perform public.emit_automation_event_v1(
    new.organization_id,
    'lead.created',
    'salsysos.crm',
    format('lead.created:%s:v1', new.id),
    new.id,
    null,
    null,
    coalesce(new.created_at, now()),
    jsonb_strip_nulls(
      jsonb_build_object(
        'schema_version', 1,
        'lifecycle_event', 'lead.created',
        'lead_code', new.lead_code,
        'lead_creation_channel', new.lead_creation_channel,
        'current_contact_channel', new.current_contact_channel,
        'lead_origin', new.lead_origin,
        'current_stage', new.current_stage,
        'status', new.status,
        'intent', new.intent,
        'interested_course_id', new.interested_course_id,
        'preferred_batch_id', new.preferred_batch_id,
        'preferred_location', new.preferred_location,
        'preferred_mode', new.preferred_mode,
        'first_touch_source', new.first_touch_source,
        'first_touch_medium', new.first_touch_medium,
        'first_touch_campaign', new.first_touch_campaign,
        'automatic_event', true,
        'customer_message_sent', false
      )
    )
  );

  return new;
end;
$function$;

revoke all on function public.emit_lead_created_automation_event_v1() from public;
revoke all on function public.emit_lead_created_automation_event_v1() from anon;
revoke all on function public.emit_lead_created_automation_event_v1() from authenticated;

-- Emit exactly once for every canonical lead row, regardless of whether the
-- lead originated from CRM UI, website ingestion, WhatsApp/Instagram, or a
-- future provider adapter. Existing historical leads are intentionally not
-- backfilled by this migration.
drop trigger if exists leads_emit_automation_lead_created_v1 on public.leads;
create trigger leads_emit_automation_lead_created_v1
after insert on public.leads
for each row execute function public.emit_lead_created_automation_event_v1();
