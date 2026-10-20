-- Freeze the exact customer-facing WhatsApp campaign configuration after
-- human approval and invalidate stale audience snapshots when draft/ready
-- configuration changes.

create or replace function public.guard_whatsapp_campaign_approved_config_v1()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_sensitive_changed boolean := false;
begin
  v_sensitive_changed :=
    old.whatsapp_template_id is distinct from new.whatsapp_template_id
    or old.template_parameter_bindings is distinct from new.template_parameter_bindings
    or old.audience_segment_id is distinct from new.audience_segment_id
    or old.audience_filters is distinct from new.audience_filters
    or old.scheduled_at is distinct from new.scheduled_at
    or old.reply_routing_mode is distinct from new.reply_routing_mode
    or old.reply_routing_user_ids is distinct from new.reply_routing_user_ids
    or old.conversion_window_days is distinct from new.conversion_window_days;

  if not v_sensitive_changed then return new; end if;

  if old.approved_at is not null
     or old.status in ('approved','scheduled','running','paused','completed') then
    raise exception 'Approved WhatsApp campaign configuration is immutable. Create or return to a draft before changing customer-facing configuration.';
  end if;

  -- Any pre-approval configuration change invalidates the reviewed audience
  -- snapshot. The next snapshot will deterministically recalculate recipients,
  -- variants and personalization readiness.
  new.status := 'draft';
  new.approved_by := null;
  new.approved_at := null;
  return new;
end;
$$;

drop trigger if exists whatsapp_broadcast_campaigns_guard_approved_config on public.whatsapp_broadcast_campaigns;
create trigger whatsapp_broadcast_campaigns_guard_approved_config
before update of whatsapp_template_id,template_parameter_bindings,audience_segment_id,audience_filters,scheduled_at,reply_routing_mode,reply_routing_user_ids,conversion_window_days
on public.whatsapp_broadcast_campaigns
for each row execute function public.guard_whatsapp_campaign_approved_config_v1();

create or replace function public.guard_whatsapp_campaign_variant_mutation_v1()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_campaign_id uuid;
  v_organization_id uuid;
  v_campaign public.whatsapp_broadcast_campaigns%rowtype;
begin
  if tg_op='DELETE' then
    v_campaign_id := old.campaign_id;
    v_organization_id := old.organization_id;
  else
    v_campaign_id := new.campaign_id;
    v_organization_id := new.organization_id;
  end if;

  select * into v_campaign
  from public.whatsapp_broadcast_campaigns c
  where c.id=v_campaign_id and c.organization_id=v_organization_id
  for update;

  if v_campaign.id is null then
    raise exception 'WhatsApp campaign variant requires a same-tenant campaign.';
  end if;

  if v_campaign.approved_at is not null
     or v_campaign.status not in ('draft','ready') then
    raise exception 'WhatsApp campaign variants are immutable after human approval or execution starts.';
  end if;

  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists whatsapp_campaign_variants_guard_mutation on public.whatsapp_campaign_variants;
create trigger whatsapp_campaign_variants_guard_mutation
before insert or update or delete on public.whatsapp_campaign_variants
for each row execute function public.guard_whatsapp_campaign_variant_mutation_v1();

create or replace function public.invalidate_whatsapp_campaign_snapshot_from_variant_v1()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_campaign_id uuid;
  v_organization_id uuid;
begin
  if tg_op='DELETE' then
    v_campaign_id := old.campaign_id;
    v_organization_id := old.organization_id;
  else
    v_campaign_id := new.campaign_id;
    v_organization_id := new.organization_id;
  end if;

  update public.whatsapp_broadcast_campaigns
  set status='draft',approved_by=null,approved_at=null
  where id=v_campaign_id
    and organization_id=v_organization_id
    and status in ('draft','ready')
    and approved_at is null;

  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists whatsapp_campaign_variants_invalidate_snapshot on public.whatsapp_campaign_variants;
create trigger whatsapp_campaign_variants_invalidate_snapshot
after insert or update or delete on public.whatsapp_campaign_variants
for each row execute function public.invalidate_whatsapp_campaign_snapshot_from_variant_v1();

create or replace function public.guard_whatsapp_recipient_snapshot_lineage_v1()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_campaign_id uuid;
  v_organization_id uuid;
  v_campaign public.whatsapp_broadcast_campaigns%rowtype;
begin
  if tg_op='DELETE' then
    v_campaign_id := old.campaign_id;
    v_organization_id := old.organization_id;
  else
    v_campaign_id := new.campaign_id;
    v_organization_id := new.organization_id;
  end if;

  select * into v_campaign
  from public.whatsapp_broadcast_campaigns c
  where c.id=v_campaign_id and c.organization_id=v_organization_id;

  if v_campaign.id is null then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;

  if v_campaign.approved_at is not null
     or v_campaign.status in ('approved','scheduled','running','paused','completed') then
    raise exception 'Approved WhatsApp audience membership and experiment assignment are immutable.';
  end if;

  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists whatsapp_broadcast_recipients_guard_insert_delete on public.whatsapp_broadcast_recipients;
create trigger whatsapp_broadcast_recipients_guard_insert_delete
before insert or delete on public.whatsapp_broadcast_recipients
for each row execute function public.guard_whatsapp_recipient_snapshot_lineage_v1();

drop trigger if exists whatsapp_broadcast_recipients_guard_lineage_update on public.whatsapp_broadcast_recipients;
create trigger whatsapp_broadcast_recipients_guard_lineage_update
before update of lead_id,lead_contact_id,variant_id on public.whatsapp_broadcast_recipients
for each row execute function public.guard_whatsapp_recipient_snapshot_lineage_v1();

-- The simple WhatsApp Ops workspace and the advanced Growth workspace share the
-- same campaign table. Enforce the advanced configuration contract at the
-- database approval boundary so no UI or service path can approve stale or
-- variable-template recipients that were excluded by snapshot-time checks.
create or replace function public.guard_whatsapp_campaign_human_approval_v1()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_validation jsonb := '{}'::jsonb;
  v_actual_audience integer := 0;
  v_actual_eligible integer := 0;
  v_actual_excluded integer := 0;
begin
  if new.status not in ('approved','scheduled') then return new; end if;

  if new.approved_at is null or new.approved_by is null then
    raise exception 'WhatsApp campaign approval requires approved_at and approved_by.';
  end if;

  v_validation := public.validate_whatsapp_broadcast_campaign_config_v1(
    new.organization_id,new.id
  );

  if coalesce((v_validation->>'valid')::boolean,false) is not true then
    raise exception 'WhatsApp campaign configuration is invalid for approval: %',
      coalesce(v_validation->'reasons','[]'::jsonb)::text;
  end if;

  select
    count(*),
    count(*) filter (where r.status='eligible'),
    count(*) filter (where r.status in ('excluded','suppressed'))
  into v_actual_audience,v_actual_eligible,v_actual_excluded
  from public.whatsapp_broadcast_recipients r
  where r.organization_id=new.organization_id and r.campaign_id=new.id;

  if v_actual_eligible < 1 then
    raise exception 'WhatsApp campaign requires at least one persisted eligible recipient before approval.';
  end if;

  if new.audience_count is distinct from v_actual_audience
     or new.eligible_count is distinct from v_actual_eligible
     or new.excluded_count is distinct from v_actual_excluded then
    raise exception 'WhatsApp campaign audience counters do not match the persisted approval snapshot. Refresh the audience before approval.';
  end if;

  return new;
end;
$$;

drop trigger if exists whatsapp_broadcast_campaigns_guard_human_approval on public.whatsapp_broadcast_campaigns;
create trigger whatsapp_broadcast_campaigns_guard_human_approval
before update of status,approved_at,approved_by
on public.whatsapp_broadcast_campaigns
for each row execute function public.guard_whatsapp_campaign_human_approval_v1();

grant execute on function public.guard_whatsapp_campaign_approved_config_v1() to service_role;
grant execute on function public.guard_whatsapp_campaign_variant_mutation_v1() to service_role;
grant execute on function public.invalidate_whatsapp_campaign_snapshot_from_variant_v1() to service_role;
grant execute on function public.guard_whatsapp_recipient_snapshot_lineage_v1() to service_role;
grant execute on function public.guard_whatsapp_campaign_human_approval_v1() to service_role;
