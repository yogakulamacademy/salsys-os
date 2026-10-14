begin;

-- =============================================================================
-- 052_messaging_lineage_hardening.sql
--
-- Preserve deterministic provider -> raw event -> CRM message/touchpoint lineage
-- for WhatsApp and Instagram messaging without rewriting raw provider evidence.
--
-- Design:
-- - WhatsApp keeps the existing webhook + CRM ingestion path unchanged.
-- - A deferred trigger enriches the CRM message after log_lead_interaction()
--   has created it in the same transaction.
-- - Instagram already enriches CRM messages in migration 049; this migration
--   adds missing first-touchpoint lineage for Instagram-created leads.
-- - Existing deterministic WhatsApp rows are backfilled only after ambiguity
--   and uniqueness guards pass.
-- =============================================================================


-- =============================================================================
-- 1. WHATSAPP FUTURE LINEAGE ENRICHMENT
-- =============================================================================

create or replace function public.apply_whatsapp_crm_lineage_from_link()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_webhook public.whatsapp_webhook_events%rowtype;
  v_raw public.raw_events%rowtype;
  v_message_id uuid;
  v_message_type text;
  v_provider_message_at timestamptz;
begin
  select *
  into v_webhook
  from public.whatsapp_webhook_events
  where id = new.webhook_event_id
    and organization_id = new.organization_id;

  if not found then
    return new;
  end if;


  select *
  into v_raw
  from public.raw_events
  where organization_id = new.organization_id
    and source_system = 'whatsapp'
    and source_event_id = v_webhook.event_key
  limit 1;

  -- Canonical raw-event dual-write is intentionally non-blocking in the
  -- existing webhook adapter. Preserve that behavior if a raw row is absent.
  if not found then
    return new;
  end if;


  v_message_type :=
    coalesce(
      nullif(v_webhook.payload -> 'message' ->> 'type', ''),
      nullif(split_part(coalesce(v_webhook.event_type, ''), ':', 2), ''),
      'unknown'
    );


  v_provider_message_at :=
    case
      when coalesce(v_webhook.payload -> 'message' ->> 'timestamp', '') ~ '^[0-9]+$'
        then to_timestamp(
          (v_webhook.payload -> 'message' ->> 'timestamp')::double precision
        )
      else null
    end;


  -- log_lead_interaction() and whatsapp_crm_message_links use transaction-time
  -- now(), so the corresponding inbound message has the exact same created_at.
  select m.id
  into v_message_id
  from public.messages m
  where m.organization_id = new.organization_id
    and m.lead_id = new.lead_id
    and m.conversation_id = new.conversation_id
    and m.direction = 'inbound'::public.message_direction
    and m.created_at = new.created_at
  order by m.id
  limit 1;


  if v_message_id is not null then
    update public.messages
    set
      external_message_id =
        coalesce(
          external_message_id,
          new.external_message_id
        ),

      message_type =
        case
          when v_message_type <> 'unknown'
            then v_message_type
          else message_type
        end,

      received_at =
        coalesce(
          v_provider_message_at,
          received_at
        ),

      metadata =
        coalesce(metadata, '{}'::jsonb)
        || jsonb_strip_nulls(
          jsonb_build_object(
            'provider', 'whatsapp',
            'raw_event_id', v_raw.id,
            'source_event_id', v_raw.source_event_id,
            'webhook_event_id', new.webhook_event_id,
            'external_message_id', new.external_message_id,
            'whatsapp_phone_number_id', v_webhook.phone_number_id,
            'whatsapp_user_id', v_webhook.contact_wa_id
          )
        )
    where id = v_message_id
      and organization_id = new.organization_id;
  end if;


  -- Only WhatsApp-created leads have this lead_created messaging touchpoint.
  -- Once event_id is populated, later messages for the same lead cannot rewrite
  -- the original first-touch lineage.
  update public.touchpoints t
  set
    event_id =
      coalesce(
        t.event_id,
        v_raw.source_event_id
      ),

    metadata =
      coalesce(t.metadata, '{}'::jsonb)
      || jsonb_strip_nulls(
        jsonb_build_object(
          'provider', 'whatsapp',
          'raw_event_id', v_raw.id,
          'source_event_id', v_raw.source_event_id,
          'webhook_event_id', new.webhook_event_id,
          'external_message_id', new.external_message_id,
          'whatsapp_phone_number_id', v_webhook.phone_number_id,
          'whatsapp_user_id', v_webhook.contact_wa_id
        )
      )
  where t.organization_id = new.organization_id
    and t.lead_id = new.lead_id
    and t.source = 'whatsapp'
    and t.channel = 'whatsapp'::public.contact_channel
    and t.event_type = 'lead_created'
    and t.event_id is null;


  return new;
end;
$function$;

revoke execute
on function public.apply_whatsapp_crm_lineage_from_link()
from public, anon, authenticated;

grant execute
on function public.apply_whatsapp_crm_lineage_from_link()
to service_role;

comment on function public.apply_whatsapp_crm_lineage_from_link() is
  'Deferred internal trigger that enriches WhatsApp CRM messages and first touchpoints with canonical raw-event/provider lineage.';


drop trigger if exists whatsapp_crm_message_lineage_enrichment
on public.whatsapp_crm_message_links;

create constraint trigger whatsapp_crm_message_lineage_enrichment
after insert
on public.whatsapp_crm_message_links
deferrable initially deferred
for each row
execute function public.apply_whatsapp_crm_lineage_from_link();


-- =============================================================================
-- 2. INSTAGRAM FUTURE FIRST-TOUCHPOINT LINEAGE
--
-- Migration 049 already enriches Instagram CRM messages with external message
-- identity and raw_event_id. The remaining gap is the lead_created touchpoint.
-- =============================================================================

create or replace function public.apply_instagram_touchpoint_lineage_from_link()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_raw public.raw_events%rowtype;
begin
  select *
  into v_raw
  from public.raw_events
  where id = new.raw_event_id
    and organization_id = new.organization_id
    and source_system = 'instagram';

  if not found then
    return new;
  end if;


  update public.touchpoints t
  set
    event_id =
      coalesce(
        t.event_id,
        v_raw.source_event_id
      ),

    metadata =
      coalesce(t.metadata, '{}'::jsonb)
      || jsonb_strip_nulls(
        jsonb_build_object(
          'provider', 'instagram',
          'raw_event_id', v_raw.id,
          'source_event_id', v_raw.source_event_id,
          'external_message_id', new.external_message_id,
          'instagram_account_id', v_raw.source_account_id,
          'instagram_user_id', v_raw.source_subject_id
        )
      )
  where t.organization_id = new.organization_id
    and t.lead_id = new.lead_id
    and t.source = 'instagram'
    and t.channel = 'instagram'::public.contact_channel
    and t.event_type = 'lead_created'
    and t.event_id is null;


  return new;
end;
$function$;

revoke execute
on function public.apply_instagram_touchpoint_lineage_from_link()
from public, anon, authenticated;

grant execute
on function public.apply_instagram_touchpoint_lineage_from_link()
to service_role;

comment on function public.apply_instagram_touchpoint_lineage_from_link() is
  'Deferred internal trigger that attaches canonical raw-event/provider lineage to Instagram-created lead touchpoints.';


drop trigger if exists instagram_touchpoint_lineage_enrichment
on public.instagram_crm_message_links;

create constraint trigger instagram_touchpoint_lineage_enrichment
after insert
on public.instagram_crm_message_links
deferrable initially deferred
for each row
execute function public.apply_instagram_touchpoint_lineage_from_link();


-- =============================================================================
-- 3. BACKFILL SAFETY GUARDS
--
-- Existing WhatsApp CRM message links were audited before this migration:
-- every link resolved to exactly one inbound CRM message at the exact same
-- transaction timestamp, with no external-message-ID collision.
-- Re-check those properties at migration time so changing live data cannot make
-- the backfill ambiguous.
-- =============================================================================

do $guard$
declare
  v_missing_raw integer;
  v_bad_message_matches integer;
  v_external_id_conflicts integer;
begin
  select count(*)
  into v_missing_raw
  from public.whatsapp_crm_message_links l
  join public.whatsapp_webhook_events w
    on w.id = l.webhook_event_id
   and w.organization_id = l.organization_id
  left join public.raw_events r
    on r.organization_id = l.organization_id
   and r.source_system = 'whatsapp'
   and r.source_event_id = w.event_key
  where r.id is null;

  if v_missing_raw > 0 then
    raise exception
      '052 WhatsApp lineage backfill aborted: % CRM link(s) have no canonical raw event',
      v_missing_raw;
  end if;


  with link_message_counts as (
    select
      l.organization_id,
      l.external_message_id,
      count(m.id) as message_matches
    from public.whatsapp_crm_message_links l
    left join public.messages m
      on m.organization_id = l.organization_id
     and m.lead_id = l.lead_id
     and m.conversation_id = l.conversation_id
     and m.direction = 'inbound'::public.message_direction
     and m.created_at = l.created_at
    group by
      l.organization_id,
      l.external_message_id
  )
  select count(*)
  into v_bad_message_matches
  from link_message_counts
  where message_matches <> 1;

  if v_bad_message_matches > 0 then
    raise exception
      '052 WhatsApp lineage backfill aborted: % CRM link(s) do not resolve to exactly one inbound message',
      v_bad_message_matches;
  end if;


  with candidates as (
    select
      l.organization_id,
      l.external_message_id,
      m.id as candidate_message_id
    from public.whatsapp_crm_message_links l
    join public.messages m
      on m.organization_id = l.organization_id
     and m.lead_id = l.lead_id
     and m.conversation_id = l.conversation_id
     and m.direction = 'inbound'::public.message_direction
     and m.created_at = l.created_at
  )
  select count(*)
  into v_external_id_conflicts
  from candidates c
  join public.messages existing
    on existing.organization_id = c.organization_id
   and existing.external_message_id = c.external_message_id
   and existing.id <> c.candidate_message_id;

  if v_external_id_conflicts > 0 then
    raise exception
      '052 WhatsApp lineage backfill aborted: % external message ID collision(s) detected',
      v_external_id_conflicts;
  end if;
end;
$guard$;


-- =============================================================================
-- 4. BACKFILL EXISTING WHATSAPP CRM MESSAGES
-- =============================================================================

with lineage as (
  select
    l.organization_id,
    l.external_message_id,
    l.webhook_event_id,
    l.lead_id,
    l.conversation_id,
    l.created_at as link_created_at,
    w.event_key,
    w.event_type,
    w.phone_number_id,
    w.contact_wa_id,
    w.payload,
    r.id as raw_event_id,
    r.source_event_id,
    m.id as message_id
  from public.whatsapp_crm_message_links l
  join public.whatsapp_webhook_events w
    on w.id = l.webhook_event_id
   and w.organization_id = l.organization_id
  join public.raw_events r
    on r.organization_id = l.organization_id
   and r.source_system = 'whatsapp'
   and r.source_event_id = w.event_key
  join public.messages m
    on m.organization_id = l.organization_id
   and m.lead_id = l.lead_id
   and m.conversation_id = l.conversation_id
   and m.direction = 'inbound'::public.message_direction
   and m.created_at = l.created_at
)
update public.messages m
set
  external_message_id =
    coalesce(
      m.external_message_id,
      x.external_message_id
    ),

  message_type =
    coalesce(
      nullif(x.payload -> 'message' ->> 'type', ''),
      nullif(split_part(coalesce(x.event_type, ''), ':', 2), ''),
      m.message_type
    ),

  received_at =
    case
      when coalesce(x.payload -> 'message' ->> 'timestamp', '') ~ '^[0-9]+$'
        then to_timestamp(
          (x.payload -> 'message' ->> 'timestamp')::double precision
        )
      else m.received_at
    end,

  metadata =
    coalesce(m.metadata, '{}'::jsonb)
    || jsonb_strip_nulls(
      jsonb_build_object(
        'provider', 'whatsapp',
        'raw_event_id', x.raw_event_id,
        'source_event_id', x.source_event_id,
        'webhook_event_id', x.webhook_event_id,
        'external_message_id', x.external_message_id,
        'whatsapp_phone_number_id', x.phone_number_id,
        'whatsapp_user_id', x.contact_wa_id
      )
    )
from lineage x
where m.id = x.message_id
  and m.organization_id = x.organization_id;


-- =============================================================================
-- 5. BACKFILL EXISTING WHATSAPP FIRST TOUCHPOINTS
-- =============================================================================

with first_link as (
  select distinct on (
    l.organization_id,
    l.lead_id
  )
    l.organization_id,
    l.lead_id,
    l.external_message_id,
    l.webhook_event_id,
    w.phone_number_id,
    w.contact_wa_id,
    r.id as raw_event_id,
    r.source_event_id
  from public.whatsapp_crm_message_links l
  join public.whatsapp_webhook_events w
    on w.id = l.webhook_event_id
   and w.organization_id = l.organization_id
  join public.raw_events r
    on r.organization_id = l.organization_id
   and r.source_system = 'whatsapp'
   and r.source_event_id = w.event_key
  order by
    l.organization_id,
    l.lead_id,
    l.created_at asc,
    l.external_message_id asc
)
update public.touchpoints t
set
  event_id =
    coalesce(
      t.event_id,
      x.source_event_id
    ),

  metadata =
    coalesce(t.metadata, '{}'::jsonb)
    || jsonb_strip_nulls(
      jsonb_build_object(
        'provider', 'whatsapp',
        'raw_event_id', x.raw_event_id,
        'source_event_id', x.source_event_id,
        'webhook_event_id', x.webhook_event_id,
        'external_message_id', x.external_message_id,
        'whatsapp_phone_number_id', x.phone_number_id,
        'whatsapp_user_id', x.contact_wa_id
      )
    )
from first_link x
where t.organization_id = x.organization_id
  and t.lead_id = x.lead_id
  and t.source = 'whatsapp'
  and t.channel = 'whatsapp'::public.contact_channel
  and t.event_type = 'lead_created'
  and t.event_id is null;


-- =============================================================================
-- 6. BACKFILL ANY EXISTING INSTAGRAM FIRST TOUCHPOINTS
--
-- There were no live Instagram raw events during the pre-migration audit, but
-- this handles any that arrive before migration 052 is deployed.
-- =============================================================================

with first_link as (
  select distinct on (
    l.organization_id,
    l.lead_id
  )
    l.organization_id,
    l.lead_id,
    l.external_message_id,
    l.raw_event_id,
    r.source_event_id,
    r.source_account_id,
    r.source_subject_id
  from public.instagram_crm_message_links l
  join public.raw_events r
    on r.id = l.raw_event_id
   and r.organization_id = l.organization_id
   and r.source_system = 'instagram'
  order by
    l.organization_id,
    l.lead_id,
    l.created_at asc,
    l.external_message_id asc
)
update public.touchpoints t
set
  event_id =
    coalesce(
      t.event_id,
      x.source_event_id
    ),

  metadata =
    coalesce(t.metadata, '{}'::jsonb)
    || jsonb_strip_nulls(
      jsonb_build_object(
        'provider', 'instagram',
        'raw_event_id', x.raw_event_id,
        'source_event_id', x.source_event_id,
        'external_message_id', x.external_message_id,
        'instagram_account_id', x.source_account_id,
        'instagram_user_id', x.source_subject_id
      )
    )
from first_link x
where t.organization_id = x.organization_id
  and t.lead_id = x.lead_id
  and t.source = 'instagram'
  and t.channel = 'instagram'::public.contact_channel
  and t.event_type = 'lead_created'
  and t.event_id is null;


commit;
