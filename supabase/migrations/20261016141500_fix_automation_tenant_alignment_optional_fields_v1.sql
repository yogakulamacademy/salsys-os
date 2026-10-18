-- Fix Smart Trigger tenant-alignment guard so it can be reused across
-- automation tables that do not all expose conversation_id/message_id.
-- The previous trigger function referenced NEW.conversation_id directly,
-- which fails on automation_runs because that table has no such field.

create or replace function public.enforce_automation_tenant_alignment_v1()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_org uuid;
  v_new jsonb := to_jsonb(new);
  v_lead_id uuid;
  v_conversation_id uuid;
  v_message_id uuid;
begin
  if new.organization_id is null then
    raise exception 'organization_id is required';
  end if;

  v_lead_id := nullif(v_new->>'lead_id', '')::uuid;
  v_conversation_id := nullif(v_new->>'conversation_id', '')::uuid;
  v_message_id := nullif(v_new->>'message_id', '')::uuid;

  if v_lead_id is not null then
    select organization_id into v_org
    from public.leads
    where id = v_lead_id;

    if v_org is null or v_org <> new.organization_id then
      raise exception 'Automation lead does not belong to organization %', new.organization_id;
    end if;
  end if;

  if v_conversation_id is not null then
    select organization_id into v_org
    from public.conversations
    where id = v_conversation_id;

    if v_org is null or v_org <> new.organization_id then
      raise exception 'Automation conversation does not belong to organization %', new.organization_id;
    end if;
  end if;

  if v_message_id is not null then
    select organization_id into v_org
    from public.messages
    where id = v_message_id;

    if v_org is null or v_org <> new.organization_id then
      raise exception 'Automation message does not belong to organization %', new.organization_id;
    end if;
  end if;

  return new;
end;
$function$;

comment on function public.enforce_automation_tenant_alignment_v1() is
  'Tenant-alignment guard for Smart Trigger rows. Uses JSON projection so optional foreign-key fields can be validated safely across different automation tables.';
