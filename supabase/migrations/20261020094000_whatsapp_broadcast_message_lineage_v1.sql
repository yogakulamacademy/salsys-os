-- Preserve human-approval and campaign lineage on canonical WhatsApp messages.

create or replace function public.enrich_whatsapp_broadcast_provider_audit_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.broadcast_campaign_id is null and new.broadcast_recipient_id is null then
    return new;
  end if;

  if new.broadcast_campaign_id is null or new.broadcast_recipient_id is null then
    raise exception 'Broadcast provider audit requires both campaign and recipient lineage';
  end if;

  if not exists (
    select 1
    from public.whatsapp_broadcast_campaigns c
    join public.whatsapp_broadcast_recipients r
      on r.campaign_id=c.id
     and r.organization_id=c.organization_id
    where c.id=new.broadcast_campaign_id
      and c.organization_id=new.organization_id
      and r.id=new.broadcast_recipient_id
      and r.lead_id=new.lead_id
      and c.approved_at is not null
      and c.approved_by is not null
  ) then
    raise exception 'Broadcast provider audit requires approved same-tenant campaign/recipient lineage';
  end if;

  new.request_payload := coalesce(new.request_payload,'{}'::jsonb) || jsonb_build_object(
    'human_approved',true,
    'broadcast_campaign_id',new.broadcast_campaign_id,
    'broadcast_recipient_id',new.broadcast_recipient_id
  );

  return new;
end;
$$;

drop trigger if exists automation_provider_send_audits_broadcast_enrich on public.automation_provider_send_audits;
create trigger automation_provider_send_audits_broadcast_enrich
before insert or update of broadcast_campaign_id,broadcast_recipient_id,request_payload
on public.automation_provider_send_audits
for each row
when (new.broadcast_campaign_id is not null or new.broadcast_recipient_id is not null)
execute function public.enrich_whatsapp_broadcast_provider_audit_v1();

create or replace function public.enrich_whatsapp_broadcast_message_lineage_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_audit_id uuid;
  v_campaign_id uuid;
  v_recipient_id uuid;
begin
  if new.direction::text <> 'outbound' then
    return new;
  end if;

  begin
    v_audit_id := nullif(new.metadata->>'provider_send_audit_id','')::uuid;
  exception when others then
    v_audit_id := null;
  end;

  if v_audit_id is null then
    return new;
  end if;

  select a.broadcast_campaign_id,a.broadcast_recipient_id
  into v_campaign_id,v_recipient_id
  from public.automation_provider_send_audits a
  where a.id=v_audit_id
    and a.organization_id=new.organization_id
    and a.lead_id=new.lead_id
  limit 1;

  if v_campaign_id is null or v_recipient_id is null then
    return new;
  end if;

  update public.messages
  set human_approved=true,
      metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
        'broadcast_campaign_id',v_campaign_id,
        'broadcast_recipient_id',v_recipient_id,
        'broadcast_attribution','direct_provider_send_lineage'
      )
  where id=new.id and organization_id=new.organization_id;

  return new;
end;
$$;

drop trigger if exists messages_whatsapp_broadcast_lineage_enrich on public.messages;
create trigger messages_whatsapp_broadcast_lineage_enrich
after insert on public.messages
for each row
execute function public.enrich_whatsapp_broadcast_message_lineage_v1();
