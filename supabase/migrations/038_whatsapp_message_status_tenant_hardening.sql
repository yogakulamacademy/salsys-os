begin;

-- =============================================================================
-- MIGRATION 038
-- WHATSAPP MESSAGE STATUS TENANT HARDENING
--
-- Adds the missing canonical RPC used by the WhatsApp webhook status path.
--
-- Security model:
--   1. organization_id is mandatory and authoritative
--   2. external_message_id is resolved only inside that organization
--   3. only outbound messages may receive WhatsApp delivery statuses
--   4. public / anon / authenticated cannot execute this function
--   5. service_role is the only executable role
--
-- Status handling:
--   - sent does not regress delivered/read/failed
--   - delivered may supersede queued/sent/failed
--   - read is strongest successful state
--   - failed does not regress delivered/read
--   - provider status metadata is preserved
-- =============================================================================

create or replace function public.apply_whatsapp_message_status(
  p_organization_id uuid,
  p_external_message_id text,
  p_status text,
  p_status_at timestamptz default null,
  p_event_metadata jsonb default '{}'::jsonb
)
returns table (
  message_id uuid,
  organization_id uuid,
  external_message_id text,
  status public.message_status
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_external_message_id text :=
    nullif(
      btrim(
        coalesce(
          p_external_message_id,
          ''
        )
      ),
      ''
    );

  v_status text :=
    lower(
      nullif(
        btrim(
          coalesce(
            p_status,
            ''
          )
        ),
        ''
      )
    );

  v_status_at timestamptz :=
    coalesce(
      p_status_at,
      now()
    );

  v_event_metadata jsonb :=
    coalesce(
      p_event_metadata,
      '{}'::jsonb
    );

begin

  if p_organization_id is null then
    raise exception
      'organization_id is required';
  end if;


  if v_external_message_id is null then
    raise exception
      'external_message_id is required';
  end if;


  if v_status is null then
    raise exception
      'status is required';
  end if;


  if v_status not in (
    'sent',
    'delivered',
    'read',
    'failed'
  ) then

    raise exception
      'unsupported WhatsApp message status: %',
      v_status;

  end if;


  if jsonb_typeof(v_event_metadata) <> 'object' then
    raise exception
      'event metadata must be a JSON object';
  end if;


  return query

  update public.messages m

  set

    status =
      case

        -- A read receipt proves successful delivery and is the
        -- strongest successful WhatsApp state.
        when v_status = 'read' then
          'read'::public.message_status


        -- Do not regress an already-read message.
        when v_status = 'delivered'
             and m.status <> 'read'::public.message_status then
          'delivered'::public.message_status


        -- A later failure must not regress a message that Meta
        -- already confirmed as delivered/read.
        when v_status = 'failed'
             and m.status not in (
               'delivered'::public.message_status,
               'read'::public.message_status
             ) then
          'failed'::public.message_status


        -- A delayed sent webhook must not regress failed,
        -- delivered, or read.
        when v_status = 'sent'
             and m.status = 'queued'::public.message_status then
          'sent'::public.message_status


        else
          m.status

      end,


    sent_at =
      case
        when v_status = 'sent' then
          coalesce(
            m.sent_at,
            v_status_at
          )
        else
          m.sent_at
      end,


    delivered_at =
      case
        when v_status = 'delivered' then
          coalesce(
            m.delivered_at,
            v_status_at
          )
        else
          m.delivered_at
      end,


    read_at =
      case
        when v_status = 'read' then
          coalesce(
            m.read_at,
            v_status_at
          )
        else
          m.read_at
      end,


    metadata =
      coalesce(
        m.metadata,
        '{}'::jsonb
      )
      ||
      jsonb_build_object(
        'whatsapp_delivery_status',
        jsonb_build_object(
          'status',
            v_status,

          'status_at',
            v_status_at,

          'event',
            v_event_metadata
        )
      )


  where m.organization_id =
        p_organization_id

    and m.external_message_id =
        v_external_message_id

    and m.direction =
        'outbound'::public.message_direction


  returning
    m.id,
    m.organization_id,
    m.external_message_id,
    m.status;

end;
$function$;


revoke all
on function public.apply_whatsapp_message_status(
  uuid,
  text,
  text,
  timestamptz,
  jsonb
)
from public, anon, authenticated;


grant execute
on function public.apply_whatsapp_message_status(
  uuid,
  text,
  text,
  timestamptz,
  jsonb
)
to service_role;


comment on function public.apply_whatsapp_message_status(
  uuid,
  text,
  text,
  timestamptz,
  jsonb
) is
  'Applies WhatsApp delivery status to an outbound CRM message using organization-scoped external message identity. Service-role only.';


commit;