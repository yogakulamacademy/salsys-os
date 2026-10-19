-- Automatically close the WhatsApp provider execution gate once a bounded
-- pilot reaches its configured claim/send cap. This only reduces capability;
-- it never starts a pilot or sends a message.

create or replace function public.auto_disarm_whatsapp_provider_pilot_v1()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_settings public.automation_provider_send_settings%rowtype;
  v_claimed_count integer := 0;
begin
  if new.channel is distinct from 'whatsapp'
     or new.provider is distinct from 'meta_cloud_api'
     or new.request_mode is distinct from 'live'
     or new.status is distinct from 'sent'
     or new.customer_message_sent is not true then
    return new;
  end if;

  select *
    into v_settings
  from public.automation_provider_send_settings s
  where s.organization_id = new.organization_id
    and s.channel = 'whatsapp'
    and s.provider = 'meta_cloud_api'
  for update;

  if v_settings.id is null
     or v_settings.provider_send_enabled is not true
     or v_settings.pilot_mode_enabled is not true
     or v_settings.pilot_started_at is null then
    return new;
  end if;

  if new.prepared_at < v_settings.pilot_started_at then
    return new;
  end if;

  select count(*)
    into v_claimed_count
  from public.automation_provider_send_audits a
  where a.organization_id = new.organization_id
    and a.channel = 'whatsapp'
    and a.provider = 'meta_cloud_api'
    and a.prepared_at >= v_settings.pilot_started_at
    and a.status in ('sending', 'sent');

  if v_claimed_count >= v_settings.pilot_max_messages then
    update public.automation_provider_send_settings s
    set provider_send_enabled = false,
        metadata = coalesce(s.metadata, '{}'::jsonb) || jsonb_build_object(
          'auto_disarmed', true,
          'auto_disarm_reason', 'pilot_send_cap_reached',
          'auto_disarmed_at', now(),
          'auto_disarm_audit_id', new.id,
          'pilot_claimed_count', v_claimed_count,
          'pilot_max_messages', v_settings.pilot_max_messages
        ),
        updated_at = now()
    where s.id = v_settings.id
      and s.organization_id = new.organization_id
      and s.provider_send_enabled = true;
  end if;

  return new;
end;
$$;

comment on function public.auto_disarm_whatsapp_provider_pilot_v1() is
  'Closes provider_send_enabled after a live WhatsApp pilot reaches its configured message cap.';

drop trigger if exists automation_provider_send_audit_auto_disarm_pilot
  on public.automation_provider_send_audits;

create trigger automation_provider_send_audit_auto_disarm_pilot
after update of status, customer_message_sent, sent_at
on public.automation_provider_send_audits
for each row
when (new.status = 'sent' and new.customer_message_sent = true)
execute function public.auto_disarm_whatsapp_provider_pilot_v1();

-- Safety backstop for any already-exhausted pilot that is still armed when
-- this migration is applied.
update public.automation_provider_send_settings s
set provider_send_enabled = false,
    metadata = coalesce(s.metadata, '{}'::jsonb) || jsonb_build_object(
      'auto_disarmed', true,
      'auto_disarm_reason', 'pilot_send_cap_already_reached_at_migration',
      'auto_disarmed_at', now()
    ),
    updated_at = now()
where s.channel = 'whatsapp'
  and s.provider = 'meta_cloud_api'
  and s.provider_send_enabled = true
  and s.pilot_mode_enabled = true
  and s.pilot_started_at is not null
  and (
    select count(*)
    from public.automation_provider_send_audits a
    where a.organization_id = s.organization_id
      and a.channel = 'whatsapp'
      and a.provider = 'meta_cloud_api'
      and a.prepared_at >= s.pilot_started_at
      and a.status in ('sending', 'sent')
  ) >= s.pilot_max_messages;
