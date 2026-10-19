-- SalsysOS WhatsApp template registry + provider approval policy V1.
--
-- Purpose:
--   Persist provider-synced WhatsApp template identity/state and provide a fail-closed
--   evaluator that can be combined with the existing 24-hour channel policy.
--
-- Safety:
--   * no customer message is sent by this migration
--   * template eligibility requires an active tenant-owned WhatsApp account
--   * only active + provider-approved templates are eligible outside the 24h window
--   * exact template name + language + account must match
--   * missing/unknown/pending/rejected templates fail closed
--   * provider sync metadata is retained for auditability

create table if not exists public.automation_whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  whatsapp_account_id uuid not null references public.whatsapp_accounts(id) on delete cascade,
  provider_template_id text,
  template_name text not null,
  language_code text not null,
  category text,
  approval_status text not null default 'unknown',
  provider_status_raw text,
  parameter_schema jsonb not null default '{}'::jsonb,
  components jsonb not null default '[]'::jsonb,
  provider_metadata jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  last_synced_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint automation_whatsapp_templates_name_nonempty_check
    check (nullif(btrim(template_name), '') is not null),
  constraint automation_whatsapp_templates_language_nonempty_check
    check (nullif(btrim(language_code), '') is not null),
  constraint automation_whatsapp_templates_status_check
    check (approval_status in ('unknown','pending','approved','rejected','paused','disabled')),
  constraint automation_whatsapp_templates_org_account_name_lang_key
    unique (organization_id, whatsapp_account_id, template_name, language_code)
);

create unique index if not exists automation_whatsapp_templates_provider_id_idx
  on public.automation_whatsapp_templates (organization_id, whatsapp_account_id, provider_template_id)
  where provider_template_id is not null;

create index if not exists automation_whatsapp_templates_lookup_idx
  on public.automation_whatsapp_templates (
    organization_id,
    whatsapp_account_id,
    template_name,
    language_code,
    active,
    approval_status
  );

alter table public.automation_whatsapp_templates enable row level security;

revoke all on table public.automation_whatsapp_templates from public;
revoke all on table public.automation_whatsapp_templates from anon;
revoke all on table public.automation_whatsapp_templates from authenticated;
grant select, insert, update, delete on table public.automation_whatsapp_templates to service_role;

create or replace function public.validate_automation_whatsapp_template_tenant_v1()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
begin
  if not exists (
    select 1
    from public.whatsapp_accounts wa
    where wa.id = new.whatsapp_account_id
      and wa.organization_id = new.organization_id
  ) then
    raise exception 'WhatsApp account does not belong to organization';
  end if;

  new.template_name := btrim(new.template_name);
  new.language_code := btrim(new.language_code);
  new.approval_status := lower(btrim(new.approval_status));
  new.updated_at := now();

  if new.approval_status = 'approved' and new.approved_at is null then
    new.approved_at := now();
  end if;

  if new.approval_status = 'rejected' and new.rejected_at is null then
    new.rejected_at := now();
  end if;

  return new;
end;
$function$;

revoke all on function public.validate_automation_whatsapp_template_tenant_v1() from public;
revoke all on function public.validate_automation_whatsapp_template_tenant_v1() from anon;
revoke all on function public.validate_automation_whatsapp_template_tenant_v1() from authenticated;

drop trigger if exists automation_whatsapp_templates_validate_tenant_v1
  on public.automation_whatsapp_templates;
create trigger automation_whatsapp_templates_validate_tenant_v1
before insert or update on public.automation_whatsapp_templates
for each row execute function public.validate_automation_whatsapp_template_tenant_v1();

create or replace function public.evaluate_whatsapp_template_v1(
  p_organization_id uuid,
  p_template_name text,
  p_language_code text,
  p_whatsapp_account_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_template_name text := nullif(btrim(coalesce(p_template_name, '')), '');
  v_language_code text := nullif(btrim(coalesce(p_language_code, '')), '');
  v_account public.whatsapp_accounts%rowtype;
  v_template public.automation_whatsapp_templates%rowtype;
  v_reasons jsonb := '[]'::jsonb;
  v_eligible boolean := false;
begin
  if p_organization_id is null or v_template_name is null or v_language_code is null then
    return jsonb_build_object(
      'ok', false,
      'template_eligible', false,
      'customer_message_sent', false,
      'reason', 'organization_id, template_name and language_code are required'
    );
  end if;

  if p_whatsapp_account_id is not null then
    select * into v_account
    from public.whatsapp_accounts wa
    where wa.id = p_whatsapp_account_id
      and wa.organization_id = p_organization_id
      and wa.active = true
    limit 1;
  else
    select * into v_account
    from public.whatsapp_accounts wa
    where wa.organization_id = p_organization_id
      and wa.active = true
    order by wa.is_default desc, wa.created_at asc
    limit 1;
  end if;

  if v_account.id is null then
    v_reasons := v_reasons || jsonb_build_array('whatsapp_account_missing_or_inactive');

    return jsonb_build_object(
      'ok', true,
      'organization_id', p_organization_id,
      'template_name', v_template_name,
      'language_code', v_language_code,
      'whatsapp_account_id', p_whatsapp_account_id,
      'template_eligible', false,
      'block_reasons', v_reasons,
      'customer_message_sent', false
    );
  end if;

  select * into v_template
  from public.automation_whatsapp_templates t
  where t.organization_id = p_organization_id
    and t.whatsapp_account_id = v_account.id
    and t.template_name = v_template_name
    and t.language_code = v_language_code
  limit 1;

  if v_template.id is null then
    v_reasons := v_reasons || jsonb_build_array('template_not_registered');
  else
    if v_template.active is not true then
      v_reasons := v_reasons || jsonb_build_array('template_inactive');
    end if;

    if v_template.approval_status <> 'approved' then
      v_reasons := v_reasons || jsonb_build_array('template_not_approved');
    end if;
  end if;

  v_eligible :=
    v_template.id is not null
    and v_template.active = true
    and v_template.approval_status = 'approved';

  return jsonb_build_object(
    'ok', true,
    'organization_id', p_organization_id,
    'whatsapp_account_id', v_account.id,
    'template_id', v_template.id,
    'provider_template_id', v_template.provider_template_id,
    'template_name', v_template_name,
    'language_code', v_language_code,
    'category', v_template.category,
    'approval_status', coalesce(v_template.approval_status, 'missing'),
    'active', coalesce(v_template.active, false),
    'last_synced_at', v_template.last_synced_at,
    'template_eligible', v_eligible,
    'block_reasons', v_reasons,
    'customer_message_sent', false
  );
end;
$function$;

revoke all on function public.evaluate_whatsapp_template_v1(uuid,text,text,uuid) from public;
revoke all on function public.evaluate_whatsapp_template_v1(uuid,text,text,uuid) from anon;
revoke all on function public.evaluate_whatsapp_template_v1(uuid,text,text,uuid) from authenticated;
grant execute on function public.evaluate_whatsapp_template_v1(uuid,text,text,uuid) to service_role;

create or replace function public.resolve_whatsapp_channel_policy_v2(
  p_organization_id uuid,
  p_lead_id uuid,
  p_workflow_id uuid default null,
  p_template_name text default null,
  p_template_language text default null,
  p_whatsapp_account_id uuid default null,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_now timestamptz := coalesce(p_now, now());
  v_template_name text := nullif(btrim(coalesce(p_template_name, '')), '');
  v_template_language text := nullif(btrim(coalesce(p_template_language, '')), '');
  v_base_policy jsonb;
  v_template_policy jsonb := null;
  v_last_inbound_at timestamptz;
  v_window_expires_at timestamptz;
  v_service_window_open boolean := false;
  v_freeform_allowed boolean := false;
  v_template_required boolean := true;
  v_template_eligible boolean := false;
  v_channel_policy_allowed boolean := false;
  v_final_send_allowed boolean := false;
  v_channel_route text := 'blocked';
  v_reasons jsonb := '[]'::jsonb;
begin
  if p_organization_id is null or p_lead_id is null then
    return jsonb_build_object(
      'ok', false,
      'send_allowed', false,
      'customer_message_sent', false,
      'reason', 'organization_id and lead_id are required'
    );
  end if;

  if not exists (
    select 1 from public.leads l
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

  v_base_policy := public.evaluate_automation_send_policy_v1(
    p_organization_id,
    p_lead_id,
    'whatsapp',
    p_workflow_id,
    v_now
  );

  select max(coalesce(m.received_at, m.created_at))
  into v_last_inbound_at
  from public.messages m
  join public.conversations c
    on c.id = m.conversation_id
   and c.organization_id = m.organization_id
   and c.lead_id = m.lead_id
  where m.organization_id = p_organization_id
    and m.lead_id = p_lead_id
    and m.direction::text = 'inbound'
    and c.channel::text = 'whatsapp'
    and coalesce(m.received_at, m.created_at) <= v_now;

  if v_last_inbound_at is not null then
    v_window_expires_at := v_last_inbound_at + interval '24 hours';
    v_service_window_open := v_now < v_window_expires_at;
  end if;

  if v_service_window_open then
    v_freeform_allowed := true;
    v_template_required := false;
    v_channel_route := 'freeform_or_template';
    v_channel_policy_allowed := true;

    if v_template_name is not null and v_template_language is not null then
      v_template_policy := public.evaluate_whatsapp_template_v1(
        p_organization_id,
        v_template_name,
        v_template_language,
        p_whatsapp_account_id
      );
      v_template_eligible := coalesce((v_template_policy ->> 'template_eligible')::boolean, false);
    end if;
  else
    v_freeform_allowed := false;
    v_template_required := true;
    v_channel_route := 'template_required';
    v_reasons := v_reasons || jsonb_build_array('whatsapp_template_required');

    if v_template_name is null then
      v_reasons := v_reasons || jsonb_build_array('template_not_supplied');
    elsif v_template_language is null then
      v_reasons := v_reasons || jsonb_build_array('template_language_not_supplied');
    else
      v_template_policy := public.evaluate_whatsapp_template_v1(
        p_organization_id,
        v_template_name,
        v_template_language,
        p_whatsapp_account_id
      );
      v_template_eligible := coalesce((v_template_policy ->> 'template_eligible')::boolean, false);

      if v_template_eligible is not true then
        v_reasons := v_reasons || jsonb_build_array('template_not_eligible');
      end if;
    end if;

    v_channel_policy_allowed := v_template_eligible;
  end if;

  if coalesce((v_base_policy ->> 'send_allowed')::boolean, false) is not true then
    v_reasons := v_reasons || jsonb_build_array('base_messaging_policy_blocked');
  end if;

  v_final_send_allowed :=
    coalesce((v_base_policy ->> 'send_allowed')::boolean, false)
    and v_channel_policy_allowed;

  return jsonb_build_object(
    'ok', true,
    'organization_id', p_organization_id,
    'lead_id', p_lead_id,
    'workflow_id', p_workflow_id,
    'channel', 'whatsapp',
    'evaluated_at', v_now,
    'service_window_hours', 24,
    'last_customer_message_at', v_last_inbound_at,
    'service_window_expires_at', v_window_expires_at,
    'service_window_open', v_service_window_open,
    'freeform_allowed', v_freeform_allowed,
    'template_required', v_template_required,
    'template_name', v_template_name,
    'template_language', v_template_language,
    'template_eligible', v_template_eligible,
    'template_policy', v_template_policy,
    'channel_route', v_channel_route,
    'channel_policy_allowed', v_channel_policy_allowed,
    'base_send_allowed', coalesce((v_base_policy ->> 'send_allowed')::boolean, false),
    'send_allowed', v_final_send_allowed,
    'block_reasons', v_reasons,
    'base_policy', v_base_policy,
    'customer_message_sent', false
  );
end;
$function$;

revoke all on function public.resolve_whatsapp_channel_policy_v2(uuid,uuid,uuid,text,text,uuid,timestamptz) from public;
revoke all on function public.resolve_whatsapp_channel_policy_v2(uuid,uuid,uuid,text,text,uuid,timestamptz) from anon;
revoke all on function public.resolve_whatsapp_channel_policy_v2(uuid,uuid,uuid,text,text,uuid,timestamptz) from authenticated;
grant execute on function public.resolve_whatsapp_channel_policy_v2(uuid,uuid,uuid,text,text,uuid,timestamptz) to service_role;
