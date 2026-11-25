-- Check who paid (owner-approved mockup, 25 Nov 2026).
--
-- 1) confirm_payment_and_enrol_v1: an admin confirms a payment from the
--    dashboard in one step. Uses a website checkout attempt when there is
--    one (marks it paid), otherwise records the payment; creates a confirmed
--    enrolment and moves the lead to Closed won. Never stores card or bank
--    account numbers: only a free-text reference.
-- 2) merge_people_by_lead_v1: a manager says two leads are the same person.
--    Records an identity conflict and runs the existing audited merge
--    (merge_identity_resolution_conflict_v1). Both enquiries stay, under one
--    person.

create or replace function public.confirm_payment_and_enrol_v1(
  p_lead_id uuid,
  p_amount numeric,
  p_currency text,
  p_paid_at timestamptz,
  p_method text,
  p_payment_kind text default 'full',
  p_reference text default null,
  p_course_id uuid default null,
  p_batch_id uuid default null,
  p_checkout_payment_id uuid default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lead record;
  v_course_id uuid;
  v_method text := lower(nullif(btrim(coalesce(p_method, '')), ''));
  v_kind text := lower(coalesce(nullif(btrim(p_payment_kind), ''), 'full'));
  v_currency text := upper(nullif(btrim(coalesce(p_currency, '')), ''));
  v_checkout record;
  v_enrollment_id uuid;
  v_payment_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to confirm a payment'; end if;

  select id, organization_id, interested_course_id, potential_value, current_stage
  into v_lead from public.leads where id = p_lead_id for update;
  if not found then raise exception 'Lead not found'; end if;
  if not public.can_manage_organization(v_lead.organization_id) then
    raise exception 'Only an admin can confirm payments';
  end if;

  if coalesce(p_amount, 0) <= 0 then raise exception 'Enter the amount paid'; end if;
  if v_currency is null or v_currency !~ '^[A-Z]{3}$' then raise exception 'Choose the currency'; end if;
  if v_method not in ('upi', 'bank_transfer', 'gateway', 'paypal', 'cash') then raise exception 'Choose how they paid'; end if;
  if v_kind not in ('full', 'deposit') then raise exception 'Choose full payment or deposit'; end if;
  if p_paid_at is null or p_paid_at > now() + interval '1 day' then raise exception 'Enter the date they paid'; end if;

  v_course_id := coalesce(p_course_id, v_lead.interested_course_id);
  if v_course_id is null then raise exception 'Choose the course they paid for'; end if;
  if not exists (select 1 from public.courses where id = v_course_id and organization_id = v_lead.organization_id) then
    raise exception 'Course not found';
  end if;
  if p_batch_id is not null and not exists (
    select 1 from public.course_batches where id = p_batch_id and organization_id = v_lead.organization_id and course_id = v_course_id
  ) then
    raise exception 'That batch is not for this course';
  end if;

  if p_checkout_payment_id is not null then
    select id, status into v_checkout from public.payments
    where id = p_checkout_payment_id and lead_id = p_lead_id and organization_id = v_lead.organization_id
    for update;
    if not found then raise exception 'That checkout does not belong to this lead'; end if;
    if v_checkout.status <> 'pending' then raise exception 'That checkout was already checked'; end if;
  end if;

  insert into public.enrollments (organization_id, lead_id, course_id, batch_id, status, total_value, currency, enrolled_at, metadata)
  values (v_lead.organization_id, p_lead_id, v_course_id, p_batch_id, 'confirmed',
    case when v_kind = 'full' then p_amount else null end, v_currency, now(),
    jsonb_strip_nulls(jsonb_build_object('source', 'payment_confirmed_v1', 'confirmed_by', auth.uid(),
      'verification', 'payment_verified', 'note', left(p_note, 500))))
  returning id into v_enrollment_id;

  if p_checkout_payment_id is not null then
    update public.payments set
      status = 'paid', enrollment_id = v_enrollment_id, paid_at = p_paid_at,
      metadata = metadata || jsonb_strip_nulls(jsonb_build_object(
        'awaiting_verification', false, 'verified_by', auth.uid(), 'verified_at', now(),
        'confirmed_amount', p_amount, 'confirmed_currency', v_currency, 'confirmed_method', v_method,
        'confirmed_reference', nullif(btrim(coalesce(p_reference, '')), '')))
    where id = p_checkout_payment_id
    returning id into v_payment_id;
  else
    insert into public.payments (organization_id, lead_id, enrollment_id, provider, external_payment_id, payment_kind, status, amount, currency, paid_at, metadata)
    values (v_lead.organization_id, p_lead_id, v_enrollment_id, 'team_confirmed:' || v_method,
      nullif(btrim(coalesce(p_reference, '')), ''), v_kind::public.payment_kind, 'paid', p_amount, v_currency, p_paid_at,
      jsonb_build_object('confirmed_by', auth.uid(), 'verified_at', now(), 'method', v_method))
    returning id into v_payment_id;
  end if;

  if v_lead.current_stage not in ('closed_won', 'enrolled') then
    update public.leads set current_stage = 'closed_won' where id = p_lead_id;
    insert into public.lead_stage_history (lead_id, from_stage, to_stage, changed_by_type, changed_by_id, reason, changed_at)
    values (p_lead_id, v_lead.current_stage, 'closed_won', 'human', auth.uid()::text, 'Payment confirmed by admin', now());
  end if;

  update public.ai_autopilot_leads set status = 'completed' where lead_id = p_lead_id and status in ('active', 'paused', 'handed_over');
  update public.tasks set status = 'completed', completed_at = now()
  where lead_id = p_lead_id and status = 'open'
    and (task_type = 'payment_check' or created_by_id in ('ai_followup_detection_v1', 'dm_link_no_open_v1', 'dm_link_opened_v1', 'ai_autopilot_v1', 'enrollment_marking_v1'));
  update public.lead_course_interests set status = 'enrolled', updated_at = now() where lead_id = p_lead_id and course_id = v_course_id;

  insert into public.activities (lead_id, activity_type, actor_type, actor_id, title, details, metadata)
  values (p_lead_id, 'payment_confirmed', 'human', auth.uid()::text, 'Payment confirmed and enrolled',
    left(coalesce(p_note, ''), 300),
    jsonb_build_object('enrollment_id', v_enrollment_id, 'payment_id', v_payment_id, 'from_checkout', p_checkout_payment_id is not null));

  return jsonb_build_object('ok', true, 'enrollment_id', v_enrollment_id, 'payment_id', v_payment_id);
end;
$$;

revoke all on function public.confirm_payment_and_enrol_v1(uuid, numeric, text, timestamptz, text, text, text, uuid, uuid, uuid, text) from public, anon;
grant execute on function public.confirm_payment_and_enrol_v1(uuid, numeric, text, timestamptz, text, text, text, uuid, uuid, uuid, text) to authenticated;

create or replace function public.merge_people_by_lead_v1(p_keep_lead_id uuid, p_merge_lead_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid;
  v_org_b uuid;
  v_keep_person uuid;
  v_merge_person uuid;
  v_conflict_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to merge people'; end if;
  if p_keep_lead_id is null or p_merge_lead_id is null or p_keep_lead_id = p_merge_lead_id then
    raise exception 'Choose two different leads';
  end if;

  select organization_id into v_org from public.leads where id = p_keep_lead_id;
  select organization_id into v_org_b from public.leads where id = p_merge_lead_id;
  if v_org is null or v_org_b is null or v_org <> v_org_b then raise exception 'Both leads must be in the same business'; end if;
  if not public.can_administer_organization_crm(v_org) then
    raise exception 'Manager or administrator access is required to merge people';
  end if;

  select person_id into v_keep_person from public.person_leads where organization_id = v_org and lead_id = p_keep_lead_id limit 1;
  select person_id into v_merge_person from public.person_leads where organization_id = v_org and lead_id = p_merge_lead_id limit 1;
  if v_keep_person is null or v_merge_person is null then
    raise exception 'One of these leads is not linked to a person yet';
  end if;
  if v_keep_person = v_merge_person then
    return jsonb_build_object('changed', false, 'reason', 'already_the_same_person', 'person_id', v_keep_person);
  end if;

  insert into public.identity_resolution_conflicts
    (organization_id, lead_id, person_id, conflict_type, candidate_person_ids, evidence, status, metadata)
  values (v_org, p_merge_lead_id, v_keep_person, 'manual_same_person', array[v_merge_person],
    jsonb_strip_nulls(jsonb_build_object('requested_by', auth.uid(), 'keep_lead_id', p_keep_lead_id,
      'merge_lead_id', p_merge_lead_id, 'reason', left(p_reason, 300))),
    'open', jsonb_build_object('source', 'manual_merge_v1'))
  returning id into v_conflict_id;

  return public.merge_identity_resolution_conflict_v1(v_conflict_id);
end;
$$;

revoke all on function public.merge_people_by_lead_v1(uuid, uuid, text) from public, anon;
grant execute on function public.merge_people_by_lead_v1(uuid, uuid, text) to authenticated;
