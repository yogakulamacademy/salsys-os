-- AI offer proposals v1
-- The AI suggests whether an offer could convert a lead (confidence % with
-- factors) and drafts the offer. A person approves, edits or declines it.
-- This table is the audit trail of those decisions and their outcome.
-- Nothing here sends a message: an approved offer is placed in the reply box
-- and the person still presses Send.
--
-- Rules enforced in the database:
--   * only active members of the lead's organization can record a decision;
--   * discounts above 20% need an organization manager (can_manage_organization);
--   * an approved offer needs a positive base price, a currency and a validity;
--   * rows are written only through the RPCs below (no direct insert/update).

begin;

create table if not exists public.lead_offer_proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  status text not null check (status in ('approved', 'declined')),
  offer_kind text not null check (offer_kind in ('early_bird_and_deposit', 'package_price', 'limited_time_discount', 'pay_to_book', 'custom')),
  course_label text check (course_label is null or char_length(course_label) <= 200),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  base_price numeric(12,2) check (base_price is null or base_price > 0),
  discount_percent integer not null default 0 check (discount_percent between 0 and 50),
  offer_price numeric(12,2) check (offer_price is null or offer_price > 0),
  deposit_text text check (deposit_text is null or char_length(deposit_text) <= 80),
  valid_hours integer check (valid_hours is null or valid_hours between 1 and 720),
  valid_until timestamptz,
  ai_confidence integer not null check (ai_confidence between 0 and 100),
  ai_verdict text not null check (ai_verdict in ('likely', 'maybe', 'unlikely')),
  ai_factors jsonb not null default '[]'::jsonb check (jsonb_typeof(ai_factors) = 'array'),
  ai_suggested jsonb not null default '{}'::jsonb check (jsonb_typeof(ai_suggested) = 'object'),
  edited_by_person boolean not null default false,
  needed_manager boolean not null default false,
  decision_note text check (decision_note is null or char_length(decision_note) <= 500),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz not null default now(),
  outcome text check (outcome is null or outcome in ('enrolled', 'not_enrolled')),
  outcome_recorded_by uuid references auth.users(id) on delete set null,
  outcome_at timestamptz,
  created_at timestamptz not null default now(),
  constraint lead_offer_proposals_approved_complete check (
    status <> 'approved' or (base_price is not null and offer_price is not null and currency is not null and valid_hours is not null and valid_until is not null)
  )
);

create index if not exists lead_offer_proposals_lead_idx on public.lead_offer_proposals (organization_id, lead_id, decided_at desc);
create index if not exists lead_offer_proposals_outcome_idx on public.lead_offer_proposals (organization_id, status, outcome);

alter table public.lead_offer_proposals enable row level security;

drop policy if exists lead_offer_proposals_member_select on public.lead_offer_proposals;
create policy lead_offer_proposals_member_select
  on public.lead_offer_proposals for select to authenticated
  using (public.is_organization_member(organization_id));

revoke all on public.lead_offer_proposals from anon, authenticated;
grant select on public.lead_offer_proposals to authenticated;

create or replace function public.record_lead_offer_decision_v1(
  p_organization_id uuid,
  p_lead_id uuid,
  p_status text,
  p_offer_kind text,
  p_course_label text,
  p_currency text,
  p_base_price numeric,
  p_discount_percent integer,
  p_deposit_text text,
  p_valid_hours integer,
  p_ai_confidence integer,
  p_ai_verdict text,
  p_ai_factors jsonb,
  p_ai_suggested jsonb,
  p_decision_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_actor uuid := auth.uid();
  v_discount integer := coalesce(p_discount_percent, 0);
  v_needs_manager boolean := coalesce(p_discount_percent, 0) > 20;
  v_offer_price numeric(12,2);
  v_suggested_discount integer := nullif(p_ai_suggested ->> 'discountPercent', '')::integer;
  v_id uuid;
begin
  if v_actor is null then
    raise exception 'Sign in to record an offer decision';
  end if;
  if not public.is_organization_member(p_organization_id) then
    raise exception 'You do not have access to this organization';
  end if;
  if not exists (select 1 from public.leads l where l.id = p_lead_id and l.organization_id = p_organization_id) then
    raise exception 'Lead not found in this organization';
  end if;
  if p_status not in ('approved', 'declined') then
    raise exception 'Unsupported offer decision';
  end if;
  if v_discount < 0 or v_discount > 50 then
    raise exception 'Discount must be between 0 and 50 percent';
  end if;
  if p_status = 'approved' then
    if p_base_price is null or p_base_price <= 0 then
      raise exception 'Enter the course price before approving the offer';
    end if;
    if p_currency is null or p_currency !~ '^[A-Z]{3}$' then
      raise exception 'Choose the currency before approving the offer';
    end if;
    if p_valid_hours is null or p_valid_hours < 1 or p_valid_hours > 720 then
      raise exception 'Choose how long the offer is valid';
    end if;
    if v_needs_manager and not public.can_manage_organization(p_organization_id) then
      raise exception 'Discounts above 20%% need a manager to approve';
    end if;
    v_offer_price := round(p_base_price * (100 - v_discount) / 100.0, 2);
  end if;

  insert into public.lead_offer_proposals (
    organization_id, lead_id, status, offer_kind, course_label, currency, base_price,
    discount_percent, offer_price, deposit_text, valid_hours, valid_until,
    ai_confidence, ai_verdict, ai_factors, ai_suggested, edited_by_person,
    needed_manager, decision_note, decided_by
  ) values (
    p_organization_id, p_lead_id, p_status, p_offer_kind, left(p_course_label, 200),
    case when p_status = 'approved' then p_currency else null end,
    case when p_status = 'approved' then p_base_price else null end,
    v_discount, v_offer_price, left(p_deposit_text, 80),
    case when p_status = 'approved' then p_valid_hours else null end,
    case when p_status = 'approved' then now() + make_interval(hours => p_valid_hours) else null end,
    greatest(0, least(100, coalesce(p_ai_confidence, 0))), p_ai_verdict,
    coalesce(p_ai_factors, '[]'::jsonb), coalesce(p_ai_suggested, '{}'::jsonb),
    v_suggested_discount is distinct from v_discount
      or (p_ai_suggested ->> 'depositText') is distinct from p_deposit_text
      or nullif(p_ai_suggested ->> 'validHours', '')::integer is distinct from p_valid_hours,
    v_needs_manager, left(p_decision_note, 500), v_actor
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'status', p_status, 'offer_price', v_offer_price, 'needed_manager', v_needs_manager);
end;
$function$;

create or replace function public.record_lead_offer_outcome_v1(
  p_organization_id uuid,
  p_offer_id uuid,
  p_outcome text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
begin
  if auth.uid() is null or not public.is_organization_member(p_organization_id) then
    raise exception 'You do not have access to this organization';
  end if;
  if p_outcome not in ('enrolled', 'not_enrolled') then
    raise exception 'Unsupported outcome';
  end if;
  update public.lead_offer_proposals
     set outcome = p_outcome, outcome_recorded_by = auth.uid(), outcome_at = now()
   where id = p_offer_id and organization_id = p_organization_id and status = 'approved';
  if not found then
    raise exception 'Approved offer not found';
  end if;
  return jsonb_build_object('ok', true);
end;
$function$;

revoke all on function public.record_lead_offer_decision_v1(uuid, uuid, text, text, text, text, numeric, integer, text, integer, integer, text, jsonb, jsonb, text) from public, anon;
grant execute on function public.record_lead_offer_decision_v1(uuid, uuid, text, text, text, text, numeric, integer, text, integer, integer, text, jsonb, jsonb, text) to authenticated;
revoke all on function public.record_lead_offer_outcome_v1(uuid, uuid, text) from public, anon;
grant execute on function public.record_lead_offer_outcome_v1(uuid, uuid, text) to authenticated;

commit;
