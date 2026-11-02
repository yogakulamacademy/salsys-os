-- C1: audited enrollment contract-value adjustments.
--
-- Contract value is not cash. Scholarships, discounts and approved price changes
-- change the agreed enrollment value without creating, mutating or refunding any
-- payment row. Once a baseline contract value exists, all later value changes
-- must pass through this audited command so source replays cannot silently
-- overwrite an approved commercial adjustment.

create schema if not exists app_private authorization postgres;
revoke all on schema app_private from public, anon;
grant usage on schema app_private to authenticated, service_role;

create table public.enrollment_contract_adjustments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  enrollment_id uuid not null references public.enrollments(id) on delete restrict,
  lead_id uuid not null references public.leads(id) on delete restrict,
  adjustment_type text not null check (
    adjustment_type in (
      'scholarship',
      'discount',
      'fee_waiver',
      'price_change',
      'contract_correction',
      'other'
    )
  ),
  previous_total_value numeric(14,2) not null check (previous_total_value >= 0),
  new_total_value numeric(14,2) not null check (new_total_value >= 0),
  amount_delta numeric(14,2) generated always as (
    (new_total_value - previous_total_value)::numeric(14,2)
  ) stored,
  currency text not null check (length(btrim(currency)) between 1 and 12),
  reason text not null check (length(btrim(reason)) between 1 and 1000),
  idempotency_key text not null check (length(btrim(idempotency_key)) between 1 and 240),
  actor_user_id uuid not null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);

create index idx_enrollment_contract_adjustments_enrollment
  on public.enrollment_contract_adjustments(organization_id, enrollment_id, created_at desc);
create index idx_enrollment_contract_adjustments_lead
  on public.enrollment_contract_adjustments(organization_id, lead_id, created_at desc);

alter table public.enrollment_contract_adjustments enable row level security;
revoke all on table public.enrollment_contract_adjustments
  from public, anon, authenticated, service_role;
grant select on table public.enrollment_contract_adjustments
  to authenticated, service_role;

create policy enrollment_contract_adjustments_read
on public.enrollment_contract_adjustments
for select
to authenticated
using (
  public.organization_has_capability(organization_id, 'education_core')
  and public.is_organization_member(organization_id)
  and public.can_access_lead(lead_id)
  and exists (
    select 1
    from public.enrollments e
    where e.id = enrollment_contract_adjustments.enrollment_id
      and e.organization_id = enrollment_contract_adjustments.organization_id
      and e.lead_id = enrollment_contract_adjustments.lead_id
  )
);

-- Private, transaction-scoped authority for the one enrollment value update
-- performed by apply_enrollment_contract_adjustment_v1. Browser/API roles cannot
-- mint these rows directly.
create table app_private.enrollment_contract_value_authorizations (
  transaction_id bigint not null,
  backend_pid integer not null,
  adjustment_id uuid not null,
  organization_id uuid not null,
  enrollment_id uuid not null,
  previous_total_value numeric(14,2) not null,
  new_total_value numeric(14,2) not null,
  primary key (transaction_id, backend_pid, enrollment_id)
);
revoke all on table app_private.enrollment_contract_value_authorizations
  from public, anon, authenticated, service_role;

create or replace function app_private.prevent_enrollment_contract_adjustment_mutation_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  raise exception 'Enrollment contract adjustments are append-only';
end;
$function$;
revoke all on function app_private.prevent_enrollment_contract_adjustment_mutation_v1()
  from public, anon, authenticated, service_role;

create trigger enrollment_contract_adjustments_append_only_v1
before update or delete on public.enrollment_contract_adjustments
for each row execute function app_private.prevent_enrollment_contract_adjustment_mutation_v1();

create or replace function app_private.protect_enrollment_contract_value_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_has_adjustment boolean;
begin
  if new.currency is distinct from old.currency then
    -- Permit one-time source/manual initialization only. Once currency exists it
    -- is immutable through this C1 command; currency conversion is a different
    -- commercial event and must never be inferred.
    if old.currency is null
       and new.currency is not null
       and not exists (
         select 1
         from public.enrollment_contract_adjustments a
         where a.enrollment_id = old.id
           and a.organization_id = old.organization_id
       ) then
      null;
    else
      raise exception 'Enrollment contract currency is immutable once set';
    end if;
  end if;

  if new.total_value is distinct from old.total_value then
    if exists (
      select 1
      from app_private.enrollment_contract_value_authorizations a
      where a.transaction_id = txid_current()
        and a.backend_pid = pg_backend_pid()
        and a.organization_id = old.organization_id
        and a.enrollment_id = old.id
        and a.previous_total_value = old.total_value
        and a.new_total_value = new.total_value
    ) then
      return new;
    end if;

    select exists (
      select 1
      from public.enrollment_contract_adjustments a
      where a.enrollment_id = old.id
        and a.organization_id = old.organization_id
    ) into v_has_adjustment;

    -- A baseline value may be initialized exactly once from NULL. Every later
    -- change is contractual and must use the audited adjustment command.
    if old.total_value is null and not v_has_adjustment then
      return new;
    end if;

    raise exception 'Enrollment contract value is governed; use apply_enrollment_contract_adjustment_v1';
  end if;

  return new;
end;
$function$;
revoke all on function app_private.protect_enrollment_contract_value_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists protect_enrollment_contract_value_v1 on public.enrollments;
create trigger protect_enrollment_contract_value_v1
before update of total_value, currency on public.enrollments
for each row execute function app_private.protect_enrollment_contract_value_v1();

create or replace function public.apply_enrollment_contract_adjustment_v1(
  p_organization_id uuid,
  p_enrollment_id uuid,
  p_adjustment_type text,
  p_new_total_value numeric,
  p_reason text,
  p_idempotency_key text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid;
  v_lead_id uuid;
  v_enrollment public.enrollments;
  v_existing public.enrollment_contract_adjustments;
  v_adjustment_id uuid := gen_random_uuid();
  v_type text := lower(btrim(coalesce(p_adjustment_type, '')));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_new_total numeric(14,2);
  v_net_paid numeric(14,2) := 0;
  v_overpaid_by numeric(14,2) := 0;
begin
  v_actor := auth.uid();

  if v_actor is null then
    raise exception 'Authenticated human approval is required for contract adjustments';
  end if;

  if p_organization_id is null or p_enrollment_id is null then
    raise exception 'Organization and enrollment are required';
  end if;

  if not public.organization_has_capability(p_organization_id, 'education_core')
     or not public.can_mutate_organization(p_organization_id)
     or not public.is_organization_member(p_organization_id)
     or not public.has_organization_role(p_organization_id, array['owner'::text,'admin'::text]) then
    raise exception 'Not authorized to adjust enrollment contract value';
  end if;

  if v_type not in (
    'scholarship','discount','fee_waiver','price_change','contract_correction','other'
  ) then
    raise exception 'Unsupported contract adjustment type';
  end if;

  if p_new_total_value is null or p_new_total_value < 0 then
    raise exception 'New contract value must be zero or greater';
  end if;
  v_new_total := round(p_new_total_value::numeric, 2)::numeric(14,2);

  if length(v_reason) < 1 or length(v_reason) > 1000 then
    raise exception 'Adjustment reason is required and must be at most 1000 characters';
  end if;
  if length(v_key) < 1 or length(v_key) > 240 then
    raise exception 'Idempotency key is required and must be at most 240 characters';
  end if;
  if jsonb_typeof(v_metadata) is distinct from 'object' then
    raise exception 'Adjustment metadata must be a JSON object';
  end if;

  -- Resolve lead first, then use the same lead -> enrollment lock order as the
  -- payment/refund commands to avoid cross-workflow lock inversion.
  select e.lead_id
    into v_lead_id
  from public.enrollments e
  where e.id = p_enrollment_id
    and e.organization_id = p_organization_id;

  if v_lead_id is null then
    raise exception 'Enrollment not found for organization';
  end if;

  perform 1
  from public.leads l
  where l.id = v_lead_id
    and l.organization_id = p_organization_id
  for update;
  if not found then
    raise exception 'Enrollment lead scope mismatch';
  end if;

  select e.*
    into v_enrollment
  from public.enrollments e
  where e.id = p_enrollment_id
    and e.organization_id = p_organization_id
    and e.lead_id = v_lead_id
  for update;
  if not found then
    raise exception 'Enrollment not found after lock';
  end if;

  if not public.can_access_lead(v_lead_id) then
    raise exception 'Not authorized to access enrollment lead';
  end if;

  if v_enrollment.total_value is null then
    raise exception 'Set the baseline enrollment contract value before recording an adjustment';
  end if;
  if nullif(btrim(coalesce(v_enrollment.currency, '')), '') is null then
    raise exception 'Set the enrollment currency before recording an adjustment';
  end if;

  select a.*
    into v_existing
  from public.enrollment_contract_adjustments a
  where a.organization_id = p_organization_id
    and a.idempotency_key = v_key;

  if v_existing.id is not null then
    if v_existing.enrollment_id is distinct from p_enrollment_id
       or v_existing.adjustment_type is distinct from v_type
       or v_existing.new_total_value is distinct from v_new_total
       or v_existing.reason is distinct from v_reason
       or v_existing.metadata is distinct from v_metadata then
      raise exception 'Idempotency key is already bound to a different contract adjustment';
    end if;

    return jsonb_build_object(
      'ok', true,
      'replayed', true,
      'adjustment_id', v_existing.id,
      'enrollment_id', p_enrollment_id,
      'previous_total_value', v_existing.previous_total_value,
      'new_total_value', v_existing.new_total_value,
      'amount_delta', v_existing.amount_delta,
      'currency', v_existing.currency,
      'current_total_value', v_enrollment.total_value,
      'cash_changed', false
    );
  end if;

  if v_new_total = v_enrollment.total_value then
    raise exception 'New contract value must differ from the current contract value';
  end if;

  if v_type in ('scholarship','discount','fee_waiver')
     and v_new_total > v_enrollment.total_value then
    raise exception '% cannot increase the contract value', v_type;
  end if;

  insert into app_private.enrollment_contract_value_authorizations(
    transaction_id,
    backend_pid,
    adjustment_id,
    organization_id,
    enrollment_id,
    previous_total_value,
    new_total_value
  ) values (
    txid_current(),
    pg_backend_pid(),
    v_adjustment_id,
    p_organization_id,
    p_enrollment_id,
    v_enrollment.total_value,
    v_new_total
  );

  update public.enrollments
  set total_value = v_new_total,
      updated_at = now()
  where id = p_enrollment_id
    and organization_id = p_organization_id
    and lead_id = v_lead_id;

  if not found then
    raise exception 'Enrollment contract value update failed';
  end if;

  insert into public.enrollment_contract_adjustments(
    id,
    organization_id,
    enrollment_id,
    lead_id,
    adjustment_type,
    previous_total_value,
    new_total_value,
    currency,
    reason,
    idempotency_key,
    actor_user_id,
    metadata
  ) values (
    v_adjustment_id,
    p_organization_id,
    p_enrollment_id,
    v_lead_id,
    v_type,
    v_enrollment.total_value,
    v_new_total,
    upper(v_enrollment.currency),
    v_reason,
    v_key,
    v_actor,
    v_metadata
  );

  insert into public.activities(
    lead_id,
    activity_type,
    actor_type,
    actor_id,
    title,
    details,
    metadata
  ) values (
    v_lead_id,
    'contract_value_adjusted',
    'human'::public.actor_type,
    v_actor::text,
    'Enrollment contract value adjusted',
    v_reason,
    jsonb_build_object(
      'organization_id', p_organization_id,
      'enrollment_id', p_enrollment_id,
      'adjustment_id', v_adjustment_id,
      'adjustment_type', v_type,
      'previous_total_value', v_enrollment.total_value,
      'new_total_value', v_new_total,
      'amount_delta', v_new_total - v_enrollment.total_value,
      'currency', upper(v_enrollment.currency),
      'cash_changed', false
    ) || v_metadata
  );

  delete from app_private.enrollment_contract_value_authorizations
  where transaction_id = txid_current()
    and backend_pid = pg_backend_pid()
    and enrollment_id = p_enrollment_id;

  select coalesce(sum(
    case
      when p.payment_kind <> 'refund'::public.payment_kind
        and p.status = 'paid'::public.payment_status then p.amount
      when p.payment_kind = 'refund'::public.payment_kind
        and p.status in ('paid'::public.payment_status, 'refunded'::public.payment_status) then -p.amount
      else 0::numeric
    end
  ), 0)::numeric(14,2)
  into v_net_paid
  from public.payments p
  where p.organization_id = p_organization_id
    and p.enrollment_id = p_enrollment_id
    and upper(p.currency) = upper(v_enrollment.currency);

  v_overpaid_by := greatest(v_net_paid - v_new_total, 0)::numeric(14,2);

  return jsonb_build_object(
    'ok', true,
    'replayed', false,
    'adjustment_id', v_adjustment_id,
    'enrollment_id', p_enrollment_id,
    'previous_total_value', v_enrollment.total_value,
    'new_total_value', v_new_total,
    'amount_delta', v_new_total - v_enrollment.total_value,
    'currency', upper(v_enrollment.currency),
    'linked_net_paid', v_net_paid,
    'overpaid_by', v_overpaid_by,
    'overpayment_review_required', v_overpaid_by > 0,
    'cash_changed', false
  );
end;
$function$;

revoke all on function public.apply_enrollment_contract_adjustment_v1(
  uuid,uuid,text,numeric,text,text,jsonb
) from public, anon, service_role;
grant execute on function public.apply_enrollment_contract_adjustment_v1(
  uuid,uuid,text,numeric,text,text,jsonb
) to authenticated;

comment on table public.enrollment_contract_adjustments is
  'Append-only C1 ledger of approved enrollment contract-value changes. Never represents cash movement.';
comment on function public.apply_enrollment_contract_adjustment_v1(
  uuid,uuid,text,numeric,text,text,jsonb
) is
  'Human-approved owner/admin command for scholarship, discount, fee-waiver, approved price-change and contract-correction events. Updates enrollment contract value atomically without mutating payments.';
