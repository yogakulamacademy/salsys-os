-- SalsysOS WhatsApp provider-send audit + dry-run preparation V1.
--
-- Purpose:
--   Add an idempotent audit boundary in front of any future provider send call.
--
-- Safety:
--   * provider execution is disabled by default for every organization
--   * this migration cannot call Meta or send any customer message
--   * all requests are tenant/account checked
--   * WhatsApp channel policy V2 is evaluated before a request can become ready
--   * dry_run records policy outcome without provider execution
--   * live requests fail closed unless provider execution is explicitly enabled later
--   * idempotency_key prevents duplicate provider-send preparation

create table if not exists public.automation_provider_send_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel text not null,
  provider text not null,
  provider_send_enabled boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint automation_provider_send_settings_channel_nonempty_check
    check (nullif(btrim(channel), '') is not null),
  constraint automation_provider_send_settings_provider_nonempty_check
    check (nullif(btrim(provider), '') is not null),
  constraint automation_provider_send_settings_org_channel_provider_key
    unique (organization_id, channel, provider)
);

alter table public.automation_provider_send_settings enable row level security;
revoke all on table public.automation_provider_send_settings from public;
revoke all on table public.automation_provider_send_settings from anon;
revoke all on table public.automation_provider_send_settings from authenticated;
grant select, insert, update, delete on table public.automation_provider_send_settings to service_role;

insert into public.automation_provider_send_settings (
  organization_id,
  channel,
  provider,
  provider_send_enabled,
  metadata
)
select
  o.id,
  'whatsapp',
  'meta_cloud_api',
  false,
  jsonb_build_object(
    'seeded_by', 'automation_whatsapp_provider_send_audit_v1',
    'customer_auto_send', false
  )
from public.organizations o
on conflict (organization_id, channel, provider) do nothing;

create table if not exists public.automation_provider_send_audits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_id uuid,
  enrollment_id uuid,
  action_run_id uuid,
  lead_id uuid not null references public.leads(id) on delete cascade,
  channel text not null,
  provider text not null,
  whatsapp_account_id uuid,
  whatsapp_template_id uuid,
  request_mode text not null default 'dry_run',
  idempotency_key text not null,
  status text not null,
  policy_snapshot jsonb not null default '{}'::jsonb,
  request_payload jsonb not null default '{}'::jsonb,
  block_reasons jsonb not null default '[]'::jsonb,
  provider_message_id text,
  provider_response jsonb not null default '{}'::jsonb,
  provider_error text,
  customer_message_sent boolean not null default false,
  prepared_at timestamptz not null default now(),
  sent_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint automation_provider_send_audits_mode_check
    check (request_mode in ('dry_run','live')),
  constraint automation_provider_send_audits_status_check
    check (status in ('blocked','dry_run','ready','sending','sent','failed','cancelled')),
  constraint automation_provider_send_audits_channel_nonempty_check
    check (nullif(btrim(channel), '') is not null),
  constraint automation_provider_send_audits_provider_nonempty_check
    check (nullif(btrim(provider), '') is not null),
  constraint automation_provider_send_audits_idempotency_nonempty_check
    check (nullif(btrim(idempotency_key), '') is not null),
  constraint automation_provider_send_audits_org_idempotency_key
    unique (organization_id, idempotency_key),
  constraint automation_provider_send_audits_workflow_fk
    foreign key (workflow_id, organization_id)
    references public.automation_workflows(id, organization_id)
    on delete set null,
  constraint automation_provider_send_audits_enrollment_fk
    foreign key (enrollment_id, organization_id)
    references public.automation_enrollments(id, organization_id)
    on delete set null,
  constraint automation_provider_send_audits_action_run_fk
    foreign key (action_run_id, organization_id)
    references public.automation_action_runs(id, organization_id)
    on delete set null,
  constraint automation_provider_send_audits_whatsapp_account_fk
    foreign key (whatsapp_account_id)
    references public.whatsapp_accounts(id)
    on delete set null,
  constraint automation_provider_send_audits_whatsapp_template_fk
    foreign key (whatsapp_template_id)
    references public.automation_whatsapp_templates(id)
    on delete set null
);

create index if not exists automation_provider_send_audits_org_status_idx
  on public.automation_provider_send_audits (organization_id, status, created_at desc);

create index if not exists automation_provider_send_audits_lead_idx
  on public.automation_provider_send_audits (organization_id, lead_id, created_at desc);

alter table public.automation_provider_send_audits enable row level security;
revoke all on table public.automation_provider_send_audits from public;
revoke all on table public.automation_provider_send_audits from anon;
revoke all on table public.automation_provider_send_audits from authenticated;
grant select, insert, update, delete on table public.automation_provider_send_audits to service_role;

create or replace function public.prepare_whatsapp_provider_send_v1(
  p_organization_id uuid,
  p_lead_id uuid,
  p_workflow_id uuid default null,
  p_enrollment_id uuid default null,
  p_action_run_id uuid default null,
  p_whatsapp_account_id uuid default null,
  p_template_name text default null,
  p_template_language text default null,
  p_request_payload jsonb default '{}'::jsonb,
  p_idempotency_key text default null,
  p_request_mode text default 'dry_run',
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_now timestamptz := coalesce(p_now, now());
  v_mode text := lower(coalesce(nullif(btrim(p_request_mode), ''), 'dry_run'));
  v_idempotency_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_policy jsonb;
  v_provider_enabled boolean := false;
  v_policy_send_allowed boolean := false;
  v_status text := 'blocked';
  v_reasons jsonb := '[]'::jsonb;
  v_template_id uuid;
  v_audit_id uuid;
  v_existing public.automation_provider_send_audits%rowtype;
begin
  if p_organization_id is null or p_lead_id is null or v_idempotency_key is null then
    return jsonb_build_object(
      'ok', false,
      'status', 'blocked',
      'provider_call_allowed', false,
      'customer_message_sent', false,
      'reason', 'organization_id, lead_id and idempotency_key are required'
    );
  end if;

  if v_mode not in ('dry_run','live') then
    return jsonb_build_object(
      'ok', false,
      'status', 'blocked',
      'provider_call_allowed', false,
      'customer_message_sent', false,
      'reason', 'unsupported_request_mode'
    );
  end if;

  if not exists (
    select 1 from public.leads l
    where l.id = p_lead_id
      and l.organization_id = p_organization_id
  ) then
    return jsonb_build_object(
      'ok', false,
      'status', 'blocked',
      'provider_call_allowed', false,
      'customer_message_sent', false,
      'reason', 'lead_tenant_mismatch'
    );
  end if;

  if p_workflow_id is not null and not exists (
    select 1 from public.automation_workflows w
    where w.id = p_workflow_id
      and w.organization_id = p_organization_id
  ) then
    return jsonb_build_object('ok', false, 'status', 'blocked', 'provider_call_allowed', false, 'customer_message_sent', false, 'reason', 'workflow_tenant_mismatch');
  end if;

  if p_enrollment_id is not null and not exists (
    select 1 from public.automation_enrollments e
    where e.id = p_enrollment_id
      and e.organization_id = p_organization_id
      and (p_workflow_id is null or e.workflow_id = p_workflow_id)
      and e.lead_id = p_lead_id
  ) then
    return jsonb_build_object('ok', false, 'status', 'blocked', 'provider_call_allowed', false, 'customer_message_sent', false, 'reason', 'enrollment_tenant_or_lead_mismatch');
  end if;

  if p_action_run_id is not null and not exists (
    select 1 from public.automation_action_runs ar
    where ar.id = p_action_run_id
      and ar.organization_id = p_organization_id
  ) then
    return jsonb_build_object('ok', false, 'status', 'blocked', 'provider_call_allowed', false, 'customer_message_sent', false, 'reason', 'action_run_tenant_mismatch');
  end if;

  if p_whatsapp_account_id is not null and not exists (
    select 1 from public.whatsapp_accounts wa
    where wa.id = p_whatsapp_account_id
      and wa.organization_id = p_organization_id
      and wa.active = true
  ) then
    return jsonb_build_object('ok', false, 'status', 'blocked', 'provider_call_allowed', false, 'customer_message_sent', false, 'reason', 'whatsapp_account_tenant_mismatch_or_inactive');
  end if;

  select * into v_existing
  from public.automation_provider_send_audits a
  where a.organization_id = p_organization_id
    and a.idempotency_key = v_idempotency_key
  limit 1;

  if v_existing.id is not null then
    return jsonb_build_object(
      'ok', true,
      'audit_id', v_existing.id,
      'status', v_existing.status,
      'idempotent_reuse', true,
      'provider_call_allowed', false,
      'customer_message_sent', v_existing.customer_message_sent,
      'policy_snapshot', v_existing.policy_snapshot,
      'block_reasons', v_existing.block_reasons
    );
  end if;

  v_policy := public.resolve_whatsapp_channel_policy_v2(
    p_organization_id,
    p_lead_id,
    p_workflow_id,
    p_template_name,
    p_template_language,
    p_whatsapp_account_id,
    v_now
  );

  v_policy_send_allowed := coalesce((v_policy ->> 'send_allowed')::boolean, false);

  select coalesce(s.provider_send_enabled, false)
  into v_provider_enabled
  from public.automation_provider_send_settings s
  where s.organization_id = p_organization_id
    and s.channel = 'whatsapp'
    and s.provider = 'meta_cloud_api'
  limit 1;

  v_provider_enabled := coalesce(v_provider_enabled, false);

  if not v_policy_send_allowed then
    v_reasons := coalesce(v_policy -> 'block_reasons', '[]'::jsonb);
  end if;

  if v_mode = 'live' and not v_provider_enabled then
    v_reasons := v_reasons || jsonb_build_array('provider_send_disabled');
  end if;

  if v_mode = 'dry_run' then
    if v_policy_send_allowed then
      v_status := 'dry_run';
    else
      v_status := 'blocked';
    end if;
  else
    if v_policy_send_allowed and v_provider_enabled then
      v_status := 'ready';
    else
      v_status := 'blocked';
    end if;
  end if;

  if coalesce((v_policy -> 'template_policy' ->> 'template_id')::uuid, null) is not null then
    v_template_id := (v_policy -> 'template_policy' ->> 'template_id')::uuid;
  end if;

  insert into public.automation_provider_send_audits (
    organization_id,
    workflow_id,
    enrollment_id,
    action_run_id,
    lead_id,
    channel,
    provider,
    whatsapp_account_id,
    whatsapp_template_id,
    request_mode,
    idempotency_key,
    status,
    policy_snapshot,
    request_payload,
    block_reasons,
    customer_message_sent,
    prepared_at
  ) values (
    p_organization_id,
    p_workflow_id,
    p_enrollment_id,
    p_action_run_id,
    p_lead_id,
    'whatsapp',
    'meta_cloud_api',
    p_whatsapp_account_id,
    v_template_id,
    v_mode,
    v_idempotency_key,
    v_status,
    v_policy,
    coalesce(p_request_payload, '{}'::jsonb),
    v_reasons,
    false,
    v_now
  )
  returning id into v_audit_id;

  return jsonb_build_object(
    'ok', true,
    'audit_id', v_audit_id,
    'status', v_status,
    'request_mode', v_mode,
    'idempotent_reuse', false,
    'policy_send_allowed', v_policy_send_allowed,
    'provider_send_enabled', v_provider_enabled,
    'provider_call_allowed', (v_mode = 'live' and v_status = 'ready'),
    'policy_snapshot', v_policy,
    'block_reasons', v_reasons,
    'customer_message_sent', false
  );
end;
$function$;

revoke all on function public.prepare_whatsapp_provider_send_v1(
  uuid,uuid,uuid,uuid,uuid,uuid,text,text,jsonb,text,text,timestamptz
) from public;
revoke all on function public.prepare_whatsapp_provider_send_v1(
  uuid,uuid,uuid,uuid,uuid,uuid,text,text,jsonb,text,text,timestamptz
) from anon;
revoke all on function public.prepare_whatsapp_provider_send_v1(
  uuid,uuid,uuid,uuid,uuid,uuid,text,text,jsonb,text,text,timestamptz
) from authenticated;
grant execute on function public.prepare_whatsapp_provider_send_v1(
  uuid,uuid,uuid,uuid,uuid,uuid,text,text,jsonb,text,text,timestamptz
) to service_role;
