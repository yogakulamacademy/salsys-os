-- WhatsApp Growth Operations V1
-- Completes explicit template-variable bindings, A/B variants, safe reply routing
-- and operational conversion/revenue attribution without changing the existing
-- fail-closed messaging/provider gates.

alter table public.whatsapp_broadcast_campaigns
  add column if not exists template_parameter_bindings jsonb not null default '{"header":[],"body":[]}'::jsonb,
  add column if not exists reply_routing_mode text not null default 'preserve_owner',
  add column if not exists reply_routing_user_ids uuid[] not null default '{}'::uuid[],
  add column if not exists conversion_window_days integer not null default 30;

alter table public.whatsapp_broadcast_recipients
  add column if not exists variant_id uuid;

create table if not exists public.whatsapp_campaign_variants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.whatsapp_broadcast_campaigns(id) on delete cascade,
  label text not null,
  whatsapp_template_id uuid not null references public.automation_whatsapp_templates(id) on delete restrict,
  parameter_bindings jsonb not null default '{"header":[],"body":[]}'::jsonb,
  allocation_weight integer not null default 50,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_campaign_variants_label_nonempty check (length(trim(label)) between 1 and 80),
  constraint whatsapp_campaign_variants_weight_check check (allocation_weight between 1 and 100),
  constraint whatsapp_campaign_variants_bindings_object check (jsonb_typeof(parameter_bindings)='object'),
  unique (organization_id, campaign_id, label)
);

alter table public.whatsapp_broadcast_recipients
  drop constraint if exists whatsapp_broadcast_recipients_variant_id_fkey;
alter table public.whatsapp_broadcast_recipients
  add constraint whatsapp_broadcast_recipients_variant_id_fkey
  foreign key (variant_id) references public.whatsapp_campaign_variants(id) on delete set null;

create index if not exists whatsapp_campaign_variants_campaign_idx
  on public.whatsapp_campaign_variants (organization_id,campaign_id,active,created_at,id);
create index if not exists whatsapp_broadcast_recipients_variant_idx
  on public.whatsapp_broadcast_recipients (organization_id,campaign_id,variant_id,status);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.whatsapp_broadcast_campaigns'::regclass
      AND conname='whatsapp_broadcast_campaigns_bindings_object'
  ) THEN
    ALTER TABLE public.whatsapp_broadcast_campaigns
      ADD CONSTRAINT whatsapp_broadcast_campaigns_bindings_object
      CHECK (jsonb_typeof(template_parameter_bindings)='object');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.whatsapp_broadcast_campaigns'::regclass
      AND conname='whatsapp_broadcast_campaigns_reply_routing_mode_check'
  ) THEN
    ALTER TABLE public.whatsapp_broadcast_campaigns
      ADD CONSTRAINT whatsapp_broadcast_campaigns_reply_routing_mode_check
      CHECK (reply_routing_mode in ('preserve_owner','campaign_creator_if_unassigned','round_robin_if_unassigned'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.whatsapp_broadcast_campaigns'::regclass
      AND conname='whatsapp_broadcast_campaigns_conversion_window_check'
  ) THEN
    ALTER TABLE public.whatsapp_broadcast_campaigns
      ADD CONSTRAINT whatsapp_broadcast_campaigns_conversion_window_check
      CHECK (conversion_window_days between 1 and 90);
  END IF;
END $$;

alter table public.whatsapp_campaign_variants enable row level security;

create policy whatsapp_campaign_variants_select_members
  on public.whatsapp_campaign_variants for select
  using (public.is_organization_member(organization_id));
create policy whatsapp_campaign_variants_manage_admins
  on public.whatsapp_campaign_variants for all
  using (public.can_manage_organization(organization_id))
  with check (public.can_manage_organization(organization_id));

drop trigger if exists whatsapp_campaign_variants_set_updated_at on public.whatsapp_campaign_variants;
create trigger whatsapp_campaign_variants_set_updated_at
before update on public.whatsapp_campaign_variants
for each row execute function public.set_updated_at();

grant select,insert,update,delete on public.whatsapp_campaign_variants to authenticated,service_role;

create or replace function public.validate_whatsapp_template_bindings_v1(
  p_organization_id uuid,
  p_template_id uuid,
  p_bindings jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_template public.automation_whatsapp_templates%rowtype;
  v_bindings jsonb := coalesce(p_bindings,'{}'::jsonb);
  v_header jsonb;
  v_body jsonb;
  v_header_expected integer := 0;
  v_body_expected integer := 0;
  v_binding jsonb;
  v_source text;
  v_reasons jsonb := '[]'::jsonb;
begin
  select * into v_template
  from public.automation_whatsapp_templates t
  where t.id=p_template_id and t.organization_id=p_organization_id;

  if v_template.id is null then
    return jsonb_build_object('ok',false,'valid',false,'reasons',jsonb_build_array('template_not_found'));
  end if;

  if v_template.active is not true or v_template.approval_status <> 'approved' then
    v_reasons := v_reasons || jsonb_build_array('approved_template_required');
  end if;

  if jsonb_typeof(v_bindings) <> 'object' then
    return jsonb_build_object('ok',true,'valid',false,'reasons',v_reasons || jsonb_build_array('template_bindings_must_be_object'));
  end if;

  v_header := coalesce(v_bindings->'header','[]'::jsonb);
  v_body := coalesce(v_bindings->'body','[]'::jsonb);

  if jsonb_typeof(v_header) <> 'array' or jsonb_typeof(v_body) <> 'array' then
    return jsonb_build_object('ok',true,'valid',false,'reasons',v_reasons || jsonb_build_array('template_binding_sections_must_be_arrays'));
  end if;

  v_header_expected := coalesce((v_template.parameter_schema->>'header_variable_count')::integer,0);
  v_body_expected := coalesce((v_template.parameter_schema->>'body_variable_count')::integer,0);

  if jsonb_array_length(v_header) <> v_header_expected then
    v_reasons := v_reasons || jsonb_build_array('header_template_binding_count_mismatch');
  end if;
  if jsonb_array_length(v_body) <> v_body_expected then
    v_reasons := v_reasons || jsonb_build_array('body_template_binding_count_mismatch');
  end if;

  for v_binding in
    select value from jsonb_array_elements(v_header || v_body)
  loop
    if jsonb_typeof(v_binding) <> 'object' then
      v_reasons := v_reasons || jsonb_build_array('template_binding_must_be_object');
      continue;
    end if;

    v_source := nullif(btrim(v_binding->>'source'),'');
    if v_source is null then
      v_reasons := v_reasons || jsonb_build_array('template_binding_source_required');
    elsif v_source='constant' then
      if nullif(btrim(v_binding->>'value'),'') is null then
        v_reasons := v_reasons || jsonb_build_array('template_constant_value_required');
      elsif length(v_binding->>'value') > 500 then
        v_reasons := v_reasons || jsonb_build_array('template_constant_value_too_long');
      end if;
    elsif v_source not in (
      'lead.first_name','lead.last_name','lead.display_name','lead.lead_code','lead.country',
      'lead.preferred_location','lead.preferred_mode','lead.preferred_month','course.name','campaign.name'
    ) then
      v_reasons := v_reasons || jsonb_build_array('unsupported_template_binding_source');
    end if;
  end loop;

  return jsonb_build_object(
    'ok',true,
    'valid',jsonb_array_length(v_reasons)=0,
    'reasons',v_reasons,
    'header_variable_count',v_header_expected,
    'body_variable_count',v_body_expected
  );
end;
$$;

create or replace function public.resolve_whatsapp_binding_value_v1(
  p_organization_id uuid,
  p_campaign_id uuid,
  p_lead_id uuid,
  p_binding jsonb
)
returns text
language plpgsql
security definer
set search_path=public
as $$
declare
  v_source text := nullif(btrim(coalesce(p_binding->>'source','')),'');
  v_lead public.leads%rowtype;
  v_campaign public.whatsapp_broadcast_campaigns%rowtype;
  v_course_name text;
  v_value text;
begin
  if p_organization_id is null or p_campaign_id is null or p_lead_id is null or v_source is null then
    return null;
  end if;

  select * into v_lead
  from public.leads l
  where l.id=p_lead_id and l.organization_id=p_organization_id;

  select * into v_campaign
  from public.whatsapp_broadcast_campaigns c
  where c.id=p_campaign_id and c.organization_id=p_organization_id;

  if v_lead.id is null or v_campaign.id is null then
    return null;
  end if;

  if v_lead.interested_course_id is not null then
    select c.name into v_course_name
    from public.courses c
    where c.id=v_lead.interested_course_id
      and c.organization_id=p_organization_id
    limit 1;
  end if;

  v_value := case v_source
    when 'constant' then p_binding->>'value'
    when 'lead.first_name' then v_lead.first_name
    when 'lead.last_name' then v_lead.last_name
    when 'lead.display_name' then v_lead.display_name
    when 'lead.lead_code' then v_lead.lead_code
    when 'lead.country' then v_lead.country
    when 'lead.preferred_location' then v_lead.preferred_location
    when 'lead.preferred_mode' then v_lead.preferred_mode
    when 'lead.preferred_month' then v_lead.preferred_month::text
    when 'course.name' then v_course_name
    when 'campaign.name' then v_campaign.name
    else null
  end;

  return nullif(left(btrim(coalesce(v_value,'')),1024),'');
end;
$$;

create or replace function public.resolve_whatsapp_template_components_for_lead_v1(
  p_organization_id uuid,
  p_campaign_id uuid,
  p_lead_id uuid,
  p_variant_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_campaign public.whatsapp_broadcast_campaigns%rowtype;
  v_variant public.whatsapp_campaign_variants%rowtype;
  v_template_id uuid;
  v_bindings jsonb;
  v_validation jsonb;
  v_components jsonb := '[]'::jsonb;
  v_parameters jsonb;
  v_binding jsonb;
  v_value text;
  v_source text;
  v_section text;
begin
  select * into v_campaign
  from public.whatsapp_broadcast_campaigns c
  where c.id=p_campaign_id and c.organization_id=p_organization_id;

  if v_campaign.id is null then
    return jsonb_build_object('ok',false,'reason','campaign_not_found');
  end if;

  if p_variant_id is not null then
    select * into v_variant
    from public.whatsapp_campaign_variants v
    where v.id=p_variant_id
      and v.organization_id=p_organization_id
      and v.campaign_id=p_campaign_id
      and v.active=true;

    if v_variant.id is null then
      return jsonb_build_object('ok',false,'reason','campaign_variant_not_found');
    end if;

    v_template_id := v_variant.whatsapp_template_id;
    v_bindings := v_variant.parameter_bindings;
  else
    v_template_id := v_campaign.whatsapp_template_id;
    v_bindings := v_campaign.template_parameter_bindings;
  end if;

  v_validation := public.validate_whatsapp_template_bindings_v1(
    p_organization_id,v_template_id,v_bindings
  );

  if coalesce((v_validation->>'valid')::boolean,false) is not true then
    return jsonb_build_object(
      'ok',false,
      'reason','template_binding_configuration_invalid',
      'validation',v_validation,
      'template_id',v_template_id,
      'variant_id',p_variant_id
    );
  end if;

  foreach v_section in array array['header','body']
  loop
    v_parameters := '[]'::jsonb;
    for v_binding in
      select value from jsonb_array_elements(coalesce(v_bindings->v_section,'[]'::jsonb))
    loop
      v_source := coalesce(v_binding->>'source','');
      v_value := public.resolve_whatsapp_binding_value_v1(
        p_organization_id,p_campaign_id,p_lead_id,v_binding
      );

      if v_value is null then
        return jsonb_build_object(
          'ok',false,
          'reason','template_parameter_value_missing',
          'source',v_source,
          'section',v_section,
          'template_id',v_template_id,
          'variant_id',p_variant_id
        );
      end if;

      v_parameters := v_parameters || jsonb_build_array(
        jsonb_build_object('type','text','text',v_value)
      );
    end loop;

    if jsonb_array_length(v_parameters) > 0 then
      v_components := v_components || jsonb_build_array(
        jsonb_build_object('type',v_section,'parameters',v_parameters)
      );
    end if;
  end loop;

  return jsonb_build_object(
    'ok',true,
    'template_id',v_template_id,
    'variant_id',p_variant_id,
    'components',v_components,
    'customer_message_sent',false
  );
end;
$$;

create or replace function public.assign_whatsapp_campaign_variant_v1(
  p_organization_id uuid,
  p_campaign_id uuid,
  p_lead_id uuid
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_total integer := 0;
  v_slot integer := 0;
  v_variant_id uuid;
begin
  select coalesce(sum(allocation_weight),0)::integer into v_total
  from public.whatsapp_campaign_variants
  where organization_id=p_organization_id and campaign_id=p_campaign_id and active=true;

  if v_total <= 0 then return null; end if;

  v_slot := mod(
    ('x'||substr(md5(p_campaign_id::text||':'||p_lead_id::text),1,8))::bit(32)::bigint,
    v_total
  )::integer + 1;

  select ranked.id into v_variant_id
  from (
    select v.id,
           sum(v.allocation_weight) over(order by v.created_at,v.id) as upper_bound
    from public.whatsapp_campaign_variants v
    where v.organization_id=p_organization_id
      and v.campaign_id=p_campaign_id
      and v.active=true
  ) ranked
  where ranked.upper_bound >= v_slot
  order by ranked.upper_bound
  limit 1;

  return v_variant_id;
end;
$$;

create or replace function public.prepare_whatsapp_broadcast_recipient_snapshot_v1()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_resolution jsonb;
  v_variant_label text;
begin
  if new.variant_id is null then
    new.variant_id := public.assign_whatsapp_campaign_variant_v1(
      new.organization_id,new.campaign_id,new.lead_id
    );
  end if;

  if new.variant_id is not null then
    select v.label into v_variant_label
    from public.whatsapp_campaign_variants v
    where v.id=new.variant_id
      and v.organization_id=new.organization_id
      and v.campaign_id=new.campaign_id;
  end if;

  if new.status='eligible' then
    v_resolution := public.resolve_whatsapp_template_components_for_lead_v1(
      new.organization_id,new.campaign_id,new.lead_id,new.variant_id
    );

    if coalesce((v_resolution->>'ok')::boolean,false) is not true then
      new.status := 'excluded';
      new.exclusion_reason := coalesce(v_resolution->>'reason','template_binding_unavailable');
    end if;

    new.metadata := coalesce(new.metadata,'{}'::jsonb) || jsonb_build_object(
      'variant_id',new.variant_id,
      'variant_label',v_variant_label,
      'template_binding_ready',coalesce((v_resolution->>'ok')::boolean,false),
      'resolved_template_id',v_resolution->>'template_id'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists whatsapp_broadcast_recipients_prepare_snapshot on public.whatsapp_broadcast_recipients;
create trigger whatsapp_broadcast_recipients_prepare_snapshot
before insert on public.whatsapp_broadcast_recipients
for each row execute function public.prepare_whatsapp_broadcast_recipient_snapshot_v1();

create or replace function public.validate_whatsapp_broadcast_campaign_config_v1(
  p_organization_id uuid,
  p_campaign_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_campaign public.whatsapp_broadcast_campaigns%rowtype;
  v_variant public.whatsapp_campaign_variants%rowtype;
  v_variant_count integer := 0;
  v_weight_total integer := 0;
  v_validation jsonb;
  v_reasons jsonb := '[]'::jsonb;
  v_user_id uuid;
begin
  select * into v_campaign
  from public.whatsapp_broadcast_campaigns c
  where c.id=p_campaign_id and c.organization_id=p_organization_id;

  if v_campaign.id is null then
    return jsonb_build_object('ok',false,'valid',false,'reasons',jsonb_build_array('campaign_not_found'));
  end if;

  select count(*),coalesce(sum(allocation_weight),0)::integer
  into v_variant_count,v_weight_total
  from public.whatsapp_campaign_variants
  where organization_id=p_organization_id and campaign_id=p_campaign_id and active=true;

  if v_variant_count=1 then
    v_reasons := v_reasons || jsonb_build_array('experiment_requires_at_least_two_variants');
  elsif v_variant_count>1 and v_weight_total<>100 then
    v_reasons := v_reasons || jsonb_build_array('experiment_allocation_must_total_100');
  end if;

  if v_variant_count=0 then
    v_validation := public.validate_whatsapp_template_bindings_v1(
      p_organization_id,v_campaign.whatsapp_template_id,v_campaign.template_parameter_bindings
    );
    if coalesce((v_validation->>'valid')::boolean,false) is not true then
      v_reasons := v_reasons || coalesce(v_validation->'reasons',jsonb_build_array('template_binding_configuration_invalid'));
    end if;
  else
    for v_variant in
      select * from public.whatsapp_campaign_variants
      where organization_id=p_organization_id and campaign_id=p_campaign_id and active=true
      order by created_at,id
    loop
      v_validation := public.validate_whatsapp_template_bindings_v1(
        p_organization_id,v_variant.whatsapp_template_id,v_variant.parameter_bindings
      );
      if coalesce((v_validation->>'valid')::boolean,false) is not true then
        v_reasons := v_reasons || jsonb_build_array('variant_template_binding_configuration_invalid');
      end if;
    end loop;
  end if;

  if v_campaign.reply_routing_mode='round_robin_if_unassigned' then
    if coalesce(array_length(v_campaign.reply_routing_user_ids,1),0)=0 then
      v_reasons := v_reasons || jsonb_build_array('round_robin_reply_routing_requires_team_members');
    else
      foreach v_user_id in array v_campaign.reply_routing_user_ids
      loop
        if not exists(
          select 1
          from public.organization_members om
          join public.profiles p on p.id=om.user_id and p.active=true
          where om.organization_id=p_organization_id
            and om.user_id=v_user_id
            and om.active=true
            and om.role in ('owner','admin','admissions')
        ) then
          v_reasons := v_reasons || jsonb_build_array('reply_routing_user_not_active_tenant_member');
        end if;
      end loop;
    end if;
  end if;

  return jsonb_build_object(
    'ok',true,
    'valid',jsonb_array_length(v_reasons)=0,
    'reasons',v_reasons,
    'variant_count',v_variant_count,
    'allocation_weight_total',v_weight_total,
    'reply_routing_mode',v_campaign.reply_routing_mode,
    'conversion_window_days',v_campaign.conversion_window_days
  );
end;
$$;

-- Replace broadcast policy evaluation so explicitly configured variable templates
-- are valid. Missing per-lead values remain a hard recipient-level blocker.
create or replace function public.evaluate_whatsapp_broadcast_send_policy_v1(
  p_organization_id uuid,
  p_campaign_id uuid,
  p_recipient_id uuid,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_now timestamptz := coalesce(p_now,now());
  v_campaign public.whatsapp_broadcast_campaigns%rowtype;
  v_recipient public.whatsapp_broadcast_recipients%rowtype;
  v_template public.automation_whatsapp_templates%rowtype;
  v_resolution jsonb := '{}'::jsonb;
  v_base jsonb := '{}'::jsonb;
  v_template_policy jsonb := '{}'::jsonb;
  v_reasons jsonb := '[]'::jsonb;
  v_reason text;
  v_contact_ok boolean := false;
  v_send_allowed boolean := false;
begin
  if p_organization_id is null or p_campaign_id is null or p_recipient_id is null then
    return jsonb_build_object('ok',false,'send_allowed',false,'block_reasons',jsonb_build_array('organization_campaign_and_recipient_required'),'customer_message_sent',false);
  end if;

  select * into v_campaign
  from public.whatsapp_broadcast_campaigns c
  where c.id=p_campaign_id and c.organization_id=p_organization_id;
  select * into v_recipient
  from public.whatsapp_broadcast_recipients r
  where r.id=p_recipient_id and r.organization_id=p_organization_id and r.campaign_id=p_campaign_id;

  if v_campaign.id is null then return jsonb_build_object('ok',false,'send_allowed',false,'block_reasons',jsonb_build_array('campaign_not_found'),'customer_message_sent',false); end if;
  if v_recipient.id is null then return jsonb_build_object('ok',false,'send_allowed',false,'block_reasons',jsonb_build_array('recipient_not_found'),'customer_message_sent',false); end if;

  if v_campaign.status<>'running' then v_reasons:=v_reasons||jsonb_build_array('campaign_not_running'); end if;
  if v_campaign.approved_at is null or v_campaign.approved_by is null then v_reasons:=v_reasons||jsonb_build_array('campaign_human_approval_required'); end if;
  if v_campaign.scheduled_at is not null and v_campaign.scheduled_at>v_now then v_reasons:=v_reasons||jsonb_build_array('campaign_not_due'); end if;
  if v_recipient.status not in ('eligible','queued') then v_reasons:=v_reasons||jsonb_build_array('recipient_not_executable'); end if;

  v_resolution := public.resolve_whatsapp_template_components_for_lead_v1(
    p_organization_id,p_campaign_id,v_recipient.lead_id,v_recipient.variant_id
  );

  if coalesce((v_resolution->>'ok')::boolean,false) is not true then
    v_reasons := v_reasons || jsonb_build_array(coalesce(v_resolution->>'reason','template_binding_unavailable'));
  else
    select * into v_template
    from public.automation_whatsapp_templates t
    where t.id=(v_resolution->>'template_id')::uuid
      and t.organization_id=p_organization_id
      and t.approval_status='approved'
      and t.active=true
    limit 1;

    if v_template.id is null then
      v_reasons := v_reasons || jsonb_build_array('approved_template_required');
    else
      v_template_policy := public.evaluate_whatsapp_template_v1(
        p_organization_id,v_template.template_name,v_template.language_code,v_template.whatsapp_account_id
      );
      if coalesce((v_template_policy->>'template_eligible')::boolean,false) is not true then
        v_reasons := v_reasons || coalesce(v_template_policy->'block_reasons',jsonb_build_array('template_not_eligible'));
      end if;
    end if;
  end if;

  select exists(
    select 1 from public.lead_contacts lc
    where lc.organization_id=p_organization_id
      and lc.lead_id=v_recipient.lead_id
      and lc.contact_type='whatsapp'
      and lc.verified=true
      and lc.is_primary=true
      and nullif(btrim(coalesce(lc.normalized_value,lc.value,'')),'') is not null
  ) into v_contact_ok;
  if not v_contact_ok then v_reasons:=v_reasons||jsonb_build_array('verified_primary_whatsapp_required'); end if;

  v_base := public.evaluate_automation_send_policy_v1(
    p_organization_id,v_recipient.lead_id,'whatsapp',null,v_now
  );

  for v_reason in
    select value from jsonb_array_elements_text(coalesce(v_base->'block_reasons','[]'::jsonb))
  loop
    if v_reason not in ('autonomous_send_disabled','human_approval_required') then
      v_reasons := v_reasons || jsonb_build_array(v_reason);
    end if;
  end loop;

  v_send_allowed :=
    jsonb_array_length(v_reasons)=0
    and coalesce((v_base->>'suppressed')::boolean,false)=false
    and coalesce((v_base->>'policy_missing')::boolean,true)=false
    and coalesce((v_base->>'policy_enabled')::boolean,false)=true
    and coalesce((v_base->>'frequency_limited')::boolean,true)=false
    and v_contact_ok=true
    and v_template.id is not null;

  return jsonb_build_object(
    'ok',true,'send_allowed',v_send_allowed,'campaign_id',v_campaign.id,'recipient_id',v_recipient.id,
    'lead_id',v_recipient.lead_id,'variant_id',v_recipient.variant_id,'template_id',v_template.id,
    'template_resolution',v_resolution,'base_policy',v_base,'template_policy',v_template_policy,
    'block_reasons',v_reasons,'customer_message_sent',false
  );
end;
$$;

create or replace function public.prepare_whatsapp_broadcast_provider_send_v1(
  p_organization_id uuid,
  p_campaign_id uuid,
  p_recipient_id uuid,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_now timestamptz := coalesce(p_now,now());
  v_campaign public.whatsapp_broadcast_campaigns%rowtype;
  v_recipient public.whatsapp_broadcast_recipients%rowtype;
  v_template public.automation_whatsapp_templates%rowtype;
  v_settings public.automation_provider_send_settings%rowtype;
  v_policy jsonb := '{}'::jsonb;
  v_resolution jsonb := '{}'::jsonb;
  v_reasons jsonb := '[]'::jsonb;
  v_key text;
  v_existing public.automation_provider_send_audits%rowtype;
  v_audit_id uuid;
begin
  select * into v_campaign
  from public.whatsapp_broadcast_campaigns c
  where c.id=p_campaign_id and c.organization_id=p_organization_id
  for update;
  select * into v_recipient
  from public.whatsapp_broadcast_recipients r
  where r.id=p_recipient_id and r.organization_id=p_organization_id and r.campaign_id=p_campaign_id
  for update;

  if v_campaign.id is null or v_recipient.id is null then
    return jsonb_build_object('ok',false,'prepared',false,'reason','campaign_or_recipient_not_found');
  end if;

  v_key := 'whatsapp-broadcast:'||p_campaign_id::text||':'||p_recipient_id::text;
  select * into v_existing
  from public.automation_provider_send_audits a
  where a.organization_id=p_organization_id and a.idempotency_key=v_key
  limit 1;

  if v_existing.id is not null then
    return jsonb_build_object(
      'ok',true,'prepared',false,'idempotent_reuse',true,'audit_id',v_existing.id,
      'status',v_existing.status,'customer_message_sent',v_existing.customer_message_sent,
      'provider_call_allowed',(v_existing.status='ready')
    );
  end if;

  v_policy := public.evaluate_whatsapp_broadcast_send_policy_v1(
    p_organization_id,p_campaign_id,p_recipient_id,v_now
  );
  v_reasons := coalesce(v_policy->'block_reasons','[]'::jsonb);

  if coalesce((v_policy->>'send_allowed')::boolean,false) is not true then
    if coalesce((v_policy->'base_policy'->>'suppressed')::boolean,false)=true then
      update public.whatsapp_broadcast_recipients
      set status='suppressed',exclusion_reason='suppressed_at_execution',updated_at=v_now
      where id=p_recipient_id and organization_id=p_organization_id;
    elsif v_reasons @> '["verified_primary_whatsapp_required"]'::jsonb
       or v_reasons @> '["approved_template_required"]'::jsonb
       or v_reasons @> '["template_binding_configuration_invalid"]'::jsonb
       or v_reasons @> '["template_parameter_value_missing"]'::jsonb then
      update public.whatsapp_broadcast_recipients
      set status='excluded',exclusion_reason=coalesce(v_reasons->>0,'execution_policy_blocked'),updated_at=v_now
      where id=p_recipient_id and organization_id=p_organization_id;
    end if;

    return jsonb_build_object(
      'ok',true,'prepared',false,'status','blocked','provider_call_allowed',false,
      'policy_snapshot',v_policy,'block_reasons',v_reasons,
      'retryable',not (
        coalesce((v_policy->'base_policy'->>'suppressed')::boolean,false)=true
        or v_reasons @> '["verified_primary_whatsapp_required"]'::jsonb
        or v_reasons @> '["approved_template_required"]'::jsonb
        or v_reasons @> '["template_binding_configuration_invalid"]'::jsonb
        or v_reasons @> '["template_parameter_value_missing"]'::jsonb
      ),
      'customer_message_sent',false
    );
  end if;

  v_resolution := coalesce(v_policy->'template_resolution','{}'::jsonb);
  select * into v_template
  from public.automation_whatsapp_templates t
  where t.id=(v_resolution->>'template_id')::uuid
    and t.organization_id=p_organization_id
    and t.approval_status='approved'
    and t.active=true
  limit 1;

  select * into v_settings
  from public.automation_provider_send_settings s
  where s.organization_id=p_organization_id
    and s.channel='whatsapp'
    and s.provider='meta_cloud_api'
  limit 1;

  if v_template.id is null then
    return jsonb_build_object('ok',true,'prepared',false,'status','blocked','provider_call_allowed',false,'block_reasons',jsonb_build_array('approved_template_required'),'retryable',false,'customer_message_sent',false);
  end if;
  if v_settings.id is null or v_settings.provider_send_enabled is not true then
    return jsonb_build_object('ok',true,'prepared',false,'status','blocked','provider_call_allowed',false,'block_reasons',jsonb_build_array('provider_send_disabled'),'retryable',true,'customer_message_sent',false);
  end if;

  insert into public.automation_provider_send_audits(
    organization_id,workflow_id,enrollment_id,action_run_id,lead_id,channel,provider,
    whatsapp_account_id,whatsapp_template_id,request_mode,idempotency_key,status,
    policy_snapshot,request_payload,block_reasons,customer_message_sent,prepared_at,
    broadcast_campaign_id,broadcast_recipient_id
  ) values (
    p_organization_id,null,null,null,v_recipient.lead_id,'whatsapp','meta_cloud_api',
    v_template.whatsapp_account_id,v_template.id,'live',v_key,'ready',v_policy,
    jsonb_build_object(
      'message_type','template',
      'template',jsonb_build_object('components',coalesce(v_resolution->'components','[]'::jsonb)),
      'variant_id',v_recipient.variant_id,
      'template_parameter_binding_mode','explicit_snapshot'
    ),
    '[]'::jsonb,false,v_now,p_campaign_id,p_recipient_id
  ) returning id into v_audit_id;

  update public.whatsapp_broadcast_recipients
  set status='queued',provider_send_audit_id=v_audit_id,queued_at=v_now,updated_at=v_now
  where id=p_recipient_id and organization_id=p_organization_id;

  return jsonb_build_object(
    'ok',true,'prepared',true,'audit_id',v_audit_id,'status','ready','provider_call_allowed',true,
    'variant_id',v_recipient.variant_id,'template_id',v_template.id,'policy_snapshot',v_policy,
    'block_reasons','[]'::jsonb,'customer_message_sent',false
  );
end;
$$;

create or replace function public.route_whatsapp_broadcast_reply_v1(
  p_organization_id uuid,
  p_campaign_id uuid,
  p_recipient_id uuid,
  p_lead_id uuid
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_campaign public.whatsapp_broadcast_campaigns%rowtype;
  v_owner uuid;
  v_pool uuid[] := '{}'::uuid[];
  v_index integer;
begin
  select * into v_campaign
  from public.whatsapp_broadcast_campaigns c
  where c.id=p_campaign_id and c.organization_id=p_organization_id;

  if v_campaign.id is null or v_campaign.reply_routing_mode='preserve_owner' then return null; end if;
  if exists(select 1 from public.leads l where l.id=p_lead_id and l.organization_id=p_organization_id and l.owner_user_id is not null) then return null; end if;

  if v_campaign.reply_routing_mode='campaign_creator_if_unassigned' then
    if exists(
      select 1 from public.organization_members om
      join public.profiles p on p.id=om.user_id and p.active=true
      where om.organization_id=p_organization_id and om.user_id=v_campaign.created_by
        and om.active=true and om.role in ('owner','admin','admissions')
    ) then
      v_owner := v_campaign.created_by;
    end if;
  elsif v_campaign.reply_routing_mode='round_robin_if_unassigned' then
    select coalesce(array_agg(x.user_id order by x.user_id),'{}'::uuid[]) into v_pool
    from (
      select distinct u.user_id
      from unnest(v_campaign.reply_routing_user_ids) as u(user_id)
      join public.organization_members om
        on om.organization_id=p_organization_id and om.user_id=u.user_id and om.active=true
      join public.profiles p on p.id=u.user_id and p.active=true
      where om.role in ('owner','admin','admissions')
    ) x;

    if coalesce(array_length(v_pool,1),0)>0 then
      v_index := mod(
        ('x'||substr(md5(p_campaign_id::text||':'||p_recipient_id::text),1,8))::bit(32)::bigint,
        array_length(v_pool,1)
      )::integer + 1;
      v_owner := v_pool[v_index];
    end if;
  end if;

  if v_owner is not null then
    update public.leads
    set owner_user_id=v_owner,updated_at=now()
    where id=p_lead_id and organization_id=p_organization_id and owner_user_id is null;

    if found then
      insert into public.whatsapp_campaign_events(organization_id,campaign_id,event_type,actor_user_id,metadata)
      values(p_organization_id,p_campaign_id,'reply.routed',null,jsonb_build_object('lead_id',p_lead_id,'recipient_id',p_recipient_id,'assigned_user_id',v_owner,'routing_mode',v_campaign.reply_routing_mode));
      return v_owner;
    end if;
  end if;

  return null;
end;
$$;

create or replace function public.mark_whatsapp_broadcast_reply_v1()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_recipient_id uuid;
  v_campaign_id uuid;
  v_message_at timestamptz := coalesce(new.received_at,new.created_at,now());
begin
  if new.organization_id is null or new.lead_id is null or new.direction::text<>'inbound' then return new; end if;

  if not exists(
    select 1 from public.conversations c
    where c.id=new.conversation_id and c.organization_id=new.organization_id
      and c.lead_id=new.lead_id and c.channel::text='whatsapp'
  ) then return new; end if;

  select r.id,r.campaign_id into v_recipient_id,v_campaign_id
  from public.whatsapp_broadcast_recipients r
  where r.organization_id=new.organization_id
    and r.lead_id=new.lead_id
    and r.status in ('sent','delivered','read')
    and r.sent_at is not null
    and r.sent_at<=v_message_at
    and r.sent_at>=v_message_at-interval '7 days'
  order by r.sent_at desc
  limit 1;

  if v_recipient_id is not null then
    update public.whatsapp_broadcast_recipients
    set status='replied',replied_at=v_message_at,updated_at=now()
    where id=v_recipient_id and organization_id=new.organization_id;

    perform public.route_whatsapp_broadcast_reply_v1(new.organization_id,v_campaign_id,v_recipient_id,new.lead_id);
    perform public.refresh_whatsapp_broadcast_campaign_counts_v1(new.organization_id,v_campaign_id,now());
  end if;

  return new;
end;
$$;

-- Operational attribution: a conversion is associated with the most recent
-- successfully sent WhatsApp campaign for the same lead inside that campaign's
-- configured window. This is last-sent operational attribution, not causal proof.
create or replace view public.v_whatsapp_campaign_conversion_attribution_v1
with (security_invoker=true)
as
select
  f.organization_id,
  f.conversion_fact_key,
  f.lead_id,
  f.conversion_type,
  f.conversion_at,
  f.amount,
  f.currency,
  f.is_revenue_conversion,
  f.is_refund,
  f.is_enrollment_conversion,
  attributed.campaign_id,
  attributed.variant_id,
  attributed.sent_at as whatsapp_sent_at,
  'last_sent_whatsapp_campaign_within_window'::text as attribution_method
from public.v_lead_conversion_facts f
join lateral (
  select r.campaign_id,r.variant_id,r.sent_at
  from public.whatsapp_broadcast_recipients r
  join public.whatsapp_broadcast_campaigns c
    on c.id=r.campaign_id and c.organization_id=r.organization_id
  where r.organization_id=f.organization_id
    and r.lead_id=f.lead_id
    and r.sent_at is not null
    and r.sent_at<=f.conversion_at
    and f.conversion_at<=r.sent_at+make_interval(days=>c.conversion_window_days)
  order by r.sent_at desc,r.id desc
  limit 1
) attributed on true
where f.is_revenue_conversion=true or f.is_enrollment_conversion=true;

create or replace view public.v_whatsapp_campaign_revenue_v1
with (security_invoker=true)
as
with counts as (
  select
    organization_id,campaign_id,
    count(distinct conversion_fact_key) as attributed_conversion_count,
    count(distinct conversion_fact_key) filter (where is_revenue_conversion=true and coalesce(is_refund,false)=false) as attributed_payment_count,
    count(distinct conversion_fact_key) filter (where is_enrollment_conversion=true) as attributed_enrollment_count,
    count(distinct conversion_fact_key) filter (where coalesce(is_refund,false)=true) as attributed_refund_count
  from public.v_whatsapp_campaign_conversion_attribution_v1
  group by organization_id,campaign_id
), currency_totals as (
  select organization_id,campaign_id,currency,
         sum(case when coalesce(is_refund,false) then -abs(coalesce(amount,0)) else coalesce(amount,0) end) as net_amount
  from public.v_whatsapp_campaign_conversion_attribution_v1
  where is_revenue_conversion=true and currency is not null and amount is not null
  group by organization_id,campaign_id,currency
), revenue as (
  select organization_id,campaign_id,jsonb_object_agg(currency,net_amount order by currency) as revenue_by_currency
  from currency_totals
  group by organization_id,campaign_id
)
select c.organization_id,c.id as campaign_id,
       coalesce(x.attributed_conversion_count,0) as attributed_conversion_count,
       coalesce(x.attributed_payment_count,0) as attributed_payment_count,
       coalesce(x.attributed_enrollment_count,0) as attributed_enrollment_count,
       coalesce(x.attributed_refund_count,0) as attributed_refund_count,
       coalesce(r.revenue_by_currency,'{}'::jsonb) as revenue_by_currency,
       'last_sent_whatsapp_campaign_within_window'::text as attribution_method
from public.whatsapp_broadcast_campaigns c
left join counts x on x.organization_id=c.organization_id and x.campaign_id=c.id
left join revenue r on r.organization_id=c.organization_id and r.campaign_id=c.id;

create or replace view public.v_whatsapp_campaign_performance_v2
with (security_invoker=true)
as
select
  p.*,
  (select count(*) from public.whatsapp_campaign_variants v where v.organization_id=p.organization_id and v.campaign_id=p.campaign_id and v.active=true) as active_variant_count,
  c.reply_routing_mode,
  c.conversion_window_days,
  coalesce(r.attributed_conversion_count,0) as attributed_conversion_count,
  coalesce(r.attributed_payment_count,0) as attributed_payment_count,
  coalesce(r.attributed_enrollment_count,0) as attributed_enrollment_count,
  coalesce(r.attributed_refund_count,0) as attributed_refund_count,
  coalesce(r.revenue_by_currency,'{}'::jsonb) as revenue_by_currency,
  r.attribution_method
from public.v_whatsapp_campaign_performance_v1 p
join public.whatsapp_broadcast_campaigns c
  on c.id=p.campaign_id and c.organization_id=p.organization_id
left join public.v_whatsapp_campaign_revenue_v1 r
  on r.campaign_id=p.campaign_id and r.organization_id=p.organization_id;

create or replace view public.v_whatsapp_campaign_variant_performance_v1
with (security_invoker=true)
as
with recipient_stats as (
  select
    r.organization_id,r.campaign_id,r.variant_id,
    count(*) as audience_count,
    count(*) filter (where r.status not in ('excluded','suppressed','cancelled')) as eligible_or_processed_count,
    count(*) filter (where r.status in ('sent','delivered','read','replied')) as sent_count,
    count(*) filter (where r.status in ('delivered','read','replied')) as delivered_count,
    count(*) filter (where r.status in ('read','replied')) as read_count,
    count(*) filter (where r.status='replied') as replied_count,
    count(*) filter (where r.status='failed') as failed_count
  from public.whatsapp_broadcast_recipients r
  group by r.organization_id,r.campaign_id,r.variant_id
), conversion_stats as (
  select
    organization_id,campaign_id,variant_id,
    count(distinct conversion_fact_key) as attributed_conversion_count,
    count(distinct conversion_fact_key) filter (where is_enrollment_conversion=true) as attributed_enrollment_count
  from public.v_whatsapp_campaign_conversion_attribution_v1
  group by organization_id,campaign_id,variant_id
), currency_totals as (
  select organization_id,campaign_id,variant_id,currency,
         sum(case when coalesce(is_refund,false) then -abs(coalesce(amount,0)) else coalesce(amount,0) end) as net_amount
  from public.v_whatsapp_campaign_conversion_attribution_v1
  where is_revenue_conversion=true and currency is not null and amount is not null
  group by organization_id,campaign_id,variant_id,currency
), revenue as (
  select organization_id,campaign_id,variant_id,jsonb_object_agg(currency,net_amount order by currency) as revenue_by_currency
  from currency_totals
  group by organization_id,campaign_id,variant_id
)
select
  v.organization_id,v.campaign_id,v.id as variant_id,v.label,v.whatsapp_template_id,v.allocation_weight,v.active,
  coalesce(s.audience_count,0) as audience_count,
  coalesce(s.eligible_or_processed_count,0) as eligible_or_processed_count,
  coalesce(s.sent_count,0) as sent_count,
  coalesce(s.delivered_count,0) as delivered_count,
  coalesce(s.read_count,0) as read_count,
  coalesce(s.replied_count,0) as replied_count,
  coalesce(s.failed_count,0) as failed_count,
  case when coalesce(s.sent_count,0)>0 then round((coalesce(s.read_count,0)::numeric/s.sent_count::numeric)*100,2) else 0 end as read_rate_pct,
  case when coalesce(s.sent_count,0)>0 then round((coalesce(s.replied_count,0)::numeric/s.sent_count::numeric)*100,2) else 0 end as reply_rate_pct,
  coalesce(x.attributed_conversion_count,0) as attributed_conversion_count,
  coalesce(x.attributed_enrollment_count,0) as attributed_enrollment_count,
  coalesce(r.revenue_by_currency,'{}'::jsonb) as revenue_by_currency,
  'last_sent_whatsapp_campaign_within_window'::text as attribution_method
from public.whatsapp_campaign_variants v
left join recipient_stats s
  on s.organization_id=v.organization_id and s.campaign_id=v.campaign_id and s.variant_id=v.id
left join conversion_stats x
  on x.organization_id=v.organization_id and x.campaign_id=v.campaign_id and x.variant_id=v.id
left join revenue r
  on r.organization_id=v.organization_id and r.campaign_id=v.campaign_id and r.variant_id=v.id;

grant execute on function public.validate_whatsapp_template_bindings_v1(uuid,uuid,jsonb) to service_role;
grant execute on function public.resolve_whatsapp_binding_value_v1(uuid,uuid,uuid,jsonb) to service_role;
grant execute on function public.resolve_whatsapp_template_components_for_lead_v1(uuid,uuid,uuid,uuid) to service_role;
grant execute on function public.assign_whatsapp_campaign_variant_v1(uuid,uuid,uuid) to service_role;
grant execute on function public.validate_whatsapp_broadcast_campaign_config_v1(uuid,uuid) to service_role;
grant execute on function public.route_whatsapp_broadcast_reply_v1(uuid,uuid,uuid,uuid) to service_role;
grant select on public.v_whatsapp_campaign_conversion_attribution_v1 to authenticated,service_role;
grant select on public.v_whatsapp_campaign_revenue_v1 to authenticated,service_role;
grant select on public.v_whatsapp_campaign_performance_v2 to authenticated,service_role;
grant select on public.v_whatsapp_campaign_variant_performance_v1 to authenticated,service_role;
