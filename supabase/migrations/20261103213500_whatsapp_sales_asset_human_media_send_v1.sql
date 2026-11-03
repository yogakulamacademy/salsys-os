-- Human-controlled WhatsApp Sales Asset media delivery V1
-- Adds a provider audit + canonical CRM reconciliation path for approved
-- Sales Assets selected by a human. No autonomous dispatch is introduced.

create table if not exists public.sales_asset_dispatch_audits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  asset_id uuid not null,
  lead_id uuid not null references public.leads(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  channel text not null default 'whatsapp' check (channel = 'whatsapp'),
  provider text not null default 'meta_cloud_api' check (provider = 'meta_cloud_api'),
  actor_id uuid,
  caption text,
  asset_version integer not null check (asset_version > 0),
  asset_kind text not null check (asset_kind in ('image','pdf','document')),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  state text not null default 'prepared'
    check (state in ('prepared','uploading','sending','sent','failed','sent_unreconciled')),
  provider_media_id text,
  provider_message_id text,
  canonical_message_id uuid references public.messages(id) on delete set null,
  error text,
  prepared_at timestamptz not null default now(),
  provider_accepted_at timestamptz,
  reconciled_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  constraint sales_asset_dispatch_audits_asset_fk
    foreign key (asset_id, organization_id)
    references public.sales_assets(id, organization_id)
    on delete restrict
);

create index if not exists sales_asset_dispatch_audits_org_lead_idx
  on public.sales_asset_dispatch_audits (organization_id, lead_id, prepared_at desc);

create index if not exists sales_asset_dispatch_audits_asset_idx
  on public.sales_asset_dispatch_audits (organization_id, asset_id, prepared_at desc);

create unique index if not exists sales_asset_dispatch_audits_provider_message_unique
  on public.sales_asset_dispatch_audits (provider_message_id)
  where provider_message_id is not null;

drop trigger if exists sales_asset_dispatch_audits_set_updated_at
  on public.sales_asset_dispatch_audits;
create trigger sales_asset_dispatch_audits_set_updated_at
before update on public.sales_asset_dispatch_audits
for each row execute function public.set_updated_at();

alter table public.sales_asset_dispatch_audits enable row level security;

drop policy if exists sales_asset_dispatch_audits_read
  on public.sales_asset_dispatch_audits;
create policy sales_asset_dispatch_audits_read
on public.sales_asset_dispatch_audits
for select
to authenticated
using (
  public.is_crm_user()
  and public.is_organization_member(organization_id)
);

revoke all on table public.sales_asset_dispatch_audits from anon, authenticated;
grant select on table public.sales_asset_dispatch_audits to authenticated;

create or replace function public.record_whatsapp_sales_asset_send_success_v1(
  p_organization_id uuid,
  p_audit_id uuid,
  p_provider_message_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_audit public.sales_asset_dispatch_audits%rowtype;
  v_message public.messages%rowtype;
  v_existing public.messages%rowtype;
  v_now timestamptz := now();
  v_message_type text;
  v_stage public.lead_stage;
begin
  if auth.role() <> 'service_role' then
    raise exception 'record_whatsapp_sales_asset_send_success_v1 is service-role only';
  end if;

  if p_organization_id is null or p_audit_id is null then
    raise exception 'Organization and audit are required';
  end if;

  if nullif(btrim(coalesce(p_provider_message_id, '')), '') is null then
    raise exception 'Provider message ID is required';
  end if;

  select *
  into v_audit
  from public.sales_asset_dispatch_audits audit
  where audit.id = p_audit_id
    and audit.organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Sales Asset dispatch audit not found';
  end if;

  if v_audit.state = 'sent' and v_audit.canonical_message_id is not null then
    return jsonb_build_object(
      'ok', true,
      'recorded', true,
      'message_id', v_audit.canonical_message_id,
      'provider_message_id', v_audit.provider_message_id,
      'status', 'sent',
      'idempotent', true
    );
  end if;

  if v_audit.state not in ('sending', 'sent_unreconciled') then
    raise exception 'Sales Asset dispatch audit is not ready for reconciliation';
  end if;

  if not exists (
    select 1
    from public.conversations conversation
    where conversation.id = v_audit.conversation_id
      and conversation.organization_id = p_organization_id
      and conversation.lead_id = v_audit.lead_id
      and conversation.channel = 'whatsapp'
  ) then
    raise exception 'WhatsApp conversation no longer matches this audit';
  end if;

  select *
  into v_existing
  from public.messages message
  where message.external_message_id = btrim(p_provider_message_id)
  limit 1;

  if found then
    if v_existing.organization_id is distinct from p_organization_id
       or v_existing.lead_id is distinct from v_audit.lead_id
       or v_existing.conversation_id is distinct from v_audit.conversation_id then
      raise exception 'Provider message ID is already linked to a different CRM message';
    end if;

    update public.sales_asset_dispatch_audits
    set state = 'sent',
        provider_message_id = btrim(p_provider_message_id),
        canonical_message_id = v_existing.id,
        provider_accepted_at = coalesce(provider_accepted_at, v_now),
        reconciled_at = v_now,
        error = null
    where id = v_audit.id;

    return jsonb_build_object(
      'ok', true,
      'recorded', true,
      'message_id', v_existing.id,
      'provider_message_id', btrim(p_provider_message_id),
      'status', 'sent',
      'idempotent', true
    );
  end if;

  v_message_type := case
    when v_audit.asset_kind = 'image' then 'image'
    else 'document'
  end;

  insert into public.messages (
    organization_id,
    conversation_id,
    lead_id,
    external_message_id,
    direction,
    sender_type,
    sender_id,
    message_type,
    body,
    status,
    ai_generated,
    human_approved,
    sent_at,
    metadata
  ) values (
    p_organization_id,
    v_audit.conversation_id,
    v_audit.lead_id,
    btrim(p_provider_message_id),
    'outbound',
    'human',
    v_audit.actor_id::text,
    v_message_type,
    nullif(btrim(coalesce(v_audit.caption, '')), ''),
    'sent',
    false,
    true,
    v_now,
    jsonb_build_object(
      'sales_asset_id', v_audit.asset_id,
      'sales_asset_version', v_audit.asset_version,
      'sales_asset_dispatch_audit_id', v_audit.id,
      'provider', v_audit.provider,
      'provider_media_id', v_audit.provider_media_id,
      'mime_type', v_audit.mime_type,
      'size_bytes', v_audit.size_bytes
    )
  )
  returning * into v_message;

  update public.conversations
  set last_message_at = v_now,
      assigned_to = coalesce(assigned_to, v_audit.actor_id)
  where id = v_audit.conversation_id
    and organization_id = p_organization_id;

  select current_stage
  into v_stage
  from public.leads
  where id = v_audit.lead_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Lead no longer exists in this organization';
  end if;

  update public.leads
  set current_contact_channel = 'whatsapp',
      first_contacted_at = coalesce(first_contacted_at, v_now),
      last_contacted_at = v_now,
      last_outbound_at = v_now,
      current_stage = case when v_stage = 'new' then 'contacted'::public.lead_stage else current_stage end
  where id = v_audit.lead_id
    and organization_id = p_organization_id;

  if v_stage = 'new' then
    insert into public.lead_stage_history (
      organization_id,
      lead_id,
      from_stage,
      to_stage,
      changed_by_type,
      changed_by_id,
      reason,
      changed_at
    ) values (
      p_organization_id,
      v_audit.lead_id,
      'new',
      'contacted',
      'human',
      v_audit.actor_id::text,
      'First outbound WhatsApp Sales Asset message sent',
      v_now
    );
  end if;

  insert into public.activities (
    organization_id,
    lead_id,
    activity_type,
    channel,
    actor_type,
    actor_id,
    title,
    details,
    metadata,
    occurred_at
  ) values (
    p_organization_id,
    v_audit.lead_id,
    'outbound_interaction',
    'whatsapp',
    'human',
    v_audit.actor_id::text,
    'WhatsApp Sales Asset sent',
    left(coalesce(nullif(btrim(coalesce(v_audit.caption, '')), ''), 'Approved Sales Asset attachment'), 500),
    jsonb_build_object(
      'conversation_id', v_audit.conversation_id,
      'message_id', v_message.id,
      'sales_asset_id', v_audit.asset_id,
      'sales_asset_version', v_audit.asset_version,
      'sales_asset_dispatch_audit_id', v_audit.id,
      'provider_message_id', btrim(p_provider_message_id),
      'provider_media_id', v_audit.provider_media_id,
      'message_type', v_message_type
    ),
    v_now
  );

  update public.sales_asset_dispatch_audits
  set state = 'sent',
      provider_message_id = btrim(p_provider_message_id),
      canonical_message_id = v_message.id,
      provider_accepted_at = coalesce(provider_accepted_at, v_now),
      reconciled_at = v_now,
      error = null
  where id = v_audit.id;

  return jsonb_build_object(
    'ok', true,
    'recorded', true,
    'message_id', v_message.id,
    'provider_message_id', btrim(p_provider_message_id),
    'status', 'sent',
    'idempotent', false
  );
end;
$function$;

revoke all on function public.record_whatsapp_sales_asset_send_success_v1(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.record_whatsapp_sales_asset_send_success_v1(uuid,uuid,text)
  to service_role;
