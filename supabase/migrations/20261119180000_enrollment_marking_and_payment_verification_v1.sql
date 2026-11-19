-- Mark a lead enrolled, log payments, and let an admin verify payments.
--
-- Owner decisions (19 Nov 2026):
--   * The lead's assigned team member marks it enrolled; admins can mark any lead
--     (unassigned leads: admins only, until owners are set up).
--   * Payment status is required. Course, batch and agreed total are optional:
--     they default to the lead's main course and estimated value and can be
--     changed.
--   * Admins verify payments only. Verifying a payment marks it paid (the
--     existing trigger then moves the lead to Won) and confirms the enrolment.
--     While verifying, an admin may optionally change the course or batch.
--
-- Payments logged by the team are 'pending' until an admin verifies them.
-- Instalments: the balance is due 7 days after the batch starts.

-- Who may record an enrolment / payment for a lead.
-- plpgsql (not sql) so the body is checked at call time: can_work_lead is
-- provisioned outside the migration history and is absent in a clean replay.
create or replace function app_private.can_record_enrollment_v1(p_lead_id uuid)
returns boolean language plpgsql stable security definer set search_path = ''
as $function$
begin
  return exists (
    select 1 from public.leads l
    where l.id = p_lead_id
      and (
        public.can_manage_organization(l.organization_id)
        or (l.owner_user_id = auth.uid() and public.can_work_lead(l.id))
      )
  );
end;
$function$;
revoke all on function app_private.can_record_enrollment_v1(uuid) from public, anon;
grant execute on function app_private.can_record_enrollment_v1(uuid) to authenticated;

create or replace function public.record_enrollment_v1(
  p_lead_id uuid,
  p_payment_plan text,                 -- 'full' | 'instalment' | 'unpaid'
  p_amount_paid numeric default null,
  p_paid_at timestamptz default null,
  p_payment_method text default null,  -- 'upi' | 'bank_transfer' | 'gateway' | 'paypal' | 'cash'
  p_payment_reference text default null,
  p_expected_payment_date date default null,
  p_course_id uuid default null,
  p_batch_id uuid default null,
  p_total_value numeric default null,
  p_currency text default null,
  p_note text default null
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $function$
declare
  v_lead record;
  v_course_id uuid;
  v_batch_start date;
  v_total numeric;
  v_currency text;
  v_enrollment_id uuid;
  v_payment_id uuid;
  v_balance_due date;
  v_method text := lower(nullif(btrim(coalesce(p_payment_method, '')), ''));
  v_old_stage public.lead_stage;
begin
  if auth.uid() is null then raise exception 'Sign in to record an enrolment'; end if;
  if not app_private.can_record_enrollment_v1(p_lead_id) then
    raise exception 'Only the lead''s assigned team member or an admin can mark it enrolled';
  end if;
  if p_payment_plan not in ('full', 'instalment', 'unpaid') then
    raise exception 'Choose the payment status: paid in full, first instalment paid, or not paid yet';
  end if;
  if p_payment_plan in ('full', 'instalment') then
    if coalesce(p_amount_paid, 0) <= 0 then raise exception 'Enter the amount paid'; end if;
    if v_method not in ('upi', 'bank_transfer', 'gateway', 'paypal', 'cash') then raise exception 'Choose how they paid'; end if;
  elsif p_expected_payment_date is null then
    raise exception 'Enter the date payment is expected';
  end if;

  select id, organization_id, owner_user_id, interested_course_id, potential_value, potential_currency, current_stage
  into v_lead from public.leads where id = p_lead_id for update;

  v_course_id := coalesce(p_course_id, v_lead.interested_course_id);
  if v_course_id is null then raise exception 'Choose the course they enrolled in'; end if;
  if not exists (select 1 from public.courses where id = v_course_id and organization_id = v_lead.organization_id) then
    raise exception 'Course not found';
  end if;
  if p_batch_id is not null then
    select start_date into v_batch_start from public.course_batches
    where id = p_batch_id and organization_id = v_lead.organization_id and course_id = v_course_id;
    if not found then raise exception 'That batch is not for this course'; end if;
  end if;

  v_total := coalesce(p_total_value, case when v_lead.interested_course_id = v_course_id then v_lead.potential_value end);
  v_currency := upper(coalesce(nullif(btrim(p_currency), ''), v_lead.potential_currency, 'INR'));
  if v_total is not null and v_total < coalesce(p_amount_paid, 0) and p_payment_plan <> 'full' then
    raise exception 'The amount paid is more than the agreed total';
  end if;
  if p_payment_plan = 'full' then v_total := coalesce(v_total, p_amount_paid); end if;
  if p_payment_plan = 'instalment' and v_batch_start is not null then
    v_balance_due := v_batch_start + 7;
  end if;

  insert into public.enrollments (organization_id, lead_id, course_id, batch_id, status, total_value, currency, enrolled_at, metadata)
  values (v_lead.organization_id, p_lead_id, v_course_id, p_batch_id, 'pending', v_total, v_currency, now(),
    jsonb_strip_nulls(jsonb_build_object(
      'source', 'team_marked_v1', 'marked_by', auth.uid(), 'payment_plan', p_payment_plan,
      'verification', 'awaiting_payment_verification',
      'balance_due_date', v_balance_due, 'expected_payment_date', p_expected_payment_date, 'note', left(p_note, 500))))
  returning id into v_enrollment_id;

  if p_payment_plan in ('full', 'instalment') then
    insert into public.payments (organization_id, lead_id, enrollment_id, provider, external_payment_id, payment_kind, status, amount, currency, paid_at, metadata)
    values (v_lead.organization_id, p_lead_id, v_enrollment_id, 'team_logged:' || v_method, nullif(btrim(coalesce(p_payment_reference, '')), ''),
      case when p_payment_plan = 'full' then 'full' else 'deposit' end::public.payment_kind, 'pending', p_amount_paid, v_currency,
      coalesce(p_paid_at, now()),
      jsonb_build_object('logged_by', auth.uid(), 'awaiting_verification', true, 'method', v_method))
    returning id into v_payment_id;
  end if;

  -- Payment is being checked: show the lead as payment pending.
  v_old_stage := v_lead.current_stage;
  if v_old_stage not in ('closed_won', 'enrolled', 'payment_pending') then
    update public.leads set current_stage = 'payment_pending' where id = p_lead_id;
    insert into public.lead_stage_history (lead_id, from_stage, to_stage, changed_by_type, changed_by_id, reason, changed_at)
    values (p_lead_id, v_old_stage, 'payment_pending', 'human', auth.uid()::text, 'Marked enrolled; payment awaiting verification', now());
  end if;

  -- The AI stops selling to this lead.
  update public.ai_autopilot_leads set status = 'completed' where lead_id = p_lead_id and status in ('active', 'paused', 'handed_over');
  update public.tasks set status = 'completed', completed_at = now()
  where lead_id = p_lead_id and status = 'open' and created_by_id in ('ai_followup_detection_v1', 'dm_link_no_open_v1', 'ai_autopilot_v1');
  update public.lead_course_interests set status = 'enrolled', updated_at = now() where lead_id = p_lead_id and course_id = v_course_id;

  -- Admins get a task to verify the payment.
  if v_payment_id is not null then
    insert into public.tasks (organization_id, lead_id, task_type, title, description, status, due_at, created_by_type, created_by_id, metadata)
    values (v_lead.organization_id, p_lead_id, 'payment_check', 'Verify payment for new enrolment',
      'A team member marked this lead enrolled and logged a payment. Check it against the bank or payment records.',
      'open', now(), 'human', 'enrollment_marking_v1', jsonb_build_object('enrollment_id', v_enrollment_id, 'payment_id', v_payment_id));
  end if;

  insert into public.activities (lead_id, activity_type, actor_type, actor_id, title, details, metadata)
  values (p_lead_id, 'enrollment_marked', 'human', auth.uid()::text, 'Marked enrolled (payment awaiting verification)',
    left(coalesce(p_note, ''), 300), jsonb_build_object('enrollment_id', v_enrollment_id, 'payment_id', v_payment_id, 'payment_plan', p_payment_plan));

  return jsonb_build_object('ok', true, 'enrollment_id', v_enrollment_id, 'payment_id', v_payment_id, 'balance_due_date', v_balance_due);
end;
$function$;

-- Log a further payment (e.g. the second instalment) on an enrolment.
create or replace function public.log_enrollment_payment_v1(
  p_enrollment_id uuid, p_amount numeric, p_paid_at timestamptz, p_payment_method text, p_payment_reference text default null
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $function$
declare
  v_enr record;
  v_payment_id uuid;
  v_method text := lower(nullif(btrim(coalesce(p_payment_method, '')), ''));
begin
  select id, organization_id, lead_id, currency into v_enr from public.enrollments where id = p_enrollment_id;
  if not found or not app_private.can_record_enrollment_v1(v_enr.lead_id) then
    raise exception 'Only the lead''s assigned team member or an admin can log payments';
  end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Enter the amount paid'; end if;
  if v_method not in ('upi', 'bank_transfer', 'gateway', 'paypal', 'cash') then raise exception 'Choose how they paid'; end if;

  insert into public.payments (organization_id, lead_id, enrollment_id, provider, external_payment_id, payment_kind, status, amount, currency, paid_at, metadata)
  values (v_enr.organization_id, v_enr.lead_id, p_enrollment_id, 'team_logged:' || v_method, nullif(btrim(coalesce(p_payment_reference, '')), ''),
    'balance', 'pending', p_amount, v_enr.currency, coalesce(p_paid_at, now()),
    jsonb_build_object('logged_by', auth.uid(), 'awaiting_verification', true, 'method', v_method))
  returning id into v_payment_id;

  insert into public.tasks (organization_id, lead_id, task_type, title, description, status, due_at, created_by_type, created_by_id, metadata)
  values (v_enr.organization_id, v_enr.lead_id, 'payment_check', 'Verify instalment payment',
    'A team member logged a payment on this enrolment. Check it against the bank or payment records.',
    'open', now(), 'human', 'enrollment_marking_v1', jsonb_build_object('enrollment_id', p_enrollment_id, 'payment_id', v_payment_id));
  insert into public.activities (lead_id, activity_type, actor_type, actor_id, title, metadata)
  values (v_enr.lead_id, 'enrollment_payment_logged', 'human', auth.uid()::text, 'Payment logged (awaiting verification)',
    jsonb_build_object('enrollment_id', p_enrollment_id, 'payment_id', v_payment_id, 'amount', p_amount));
  return jsonb_build_object('ok', true, 'payment_id', v_payment_id);
end;
$function$;

-- Admin verifies or rejects a team-logged payment. Optionally corrects course/batch.
create or replace function public.verify_enrollment_payment_v1(
  p_payment_id uuid, p_decision text, p_note text default null, p_course_id uuid default null, p_batch_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $function$
declare
  v_pay record;
  v_enr record;
begin
  select id, organization_id, lead_id, enrollment_id, status, metadata into v_pay from public.payments where id = p_payment_id for update;
  if not found or not public.can_manage_organization(v_pay.organization_id) then
    raise exception 'Only an admin can verify payments';
  end if;
  if p_decision not in ('verify', 'reject') then raise exception 'Choose verify or reject'; end if;
  if v_pay.status <> 'pending' then raise exception 'This payment was already checked'; end if;

  if p_decision = 'reject' then
    if nullif(btrim(coalesce(p_note, '')), '') is null then raise exception 'Say why the payment is rejected'; end if;
    update public.payments set status = 'failed',
      metadata = metadata || jsonb_build_object('awaiting_verification', false, 'rejected_by', auth.uid(), 'rejected_at', now(), 'reject_reason', left(p_note, 300))
    where id = p_payment_id;
  else
    update public.payments set status = 'paid',
      metadata = metadata || jsonb_build_object('awaiting_verification', false, 'verified_by', auth.uid(), 'verified_at', now())
    where id = p_payment_id;  -- existing trigger moves the lead to Won
    if v_pay.enrollment_id is not null then
      select id, course_id, batch_id, status, metadata into v_enr from public.enrollments where id = v_pay.enrollment_id for update;
      if p_course_id is not null and not exists (select 1 from public.courses where id = p_course_id and organization_id = v_pay.organization_id) then
        raise exception 'Course not found';
      end if;
      if p_batch_id is not null and not exists (select 1 from public.course_batches where id = p_batch_id and organization_id = v_pay.organization_id
          and course_id = coalesce(p_course_id, v_enr.course_id)) then
        raise exception 'That batch is not for this course';
      end if;
      update public.enrollments set
        status = case when status = 'pending' then 'confirmed' else status end,
        course_id = coalesce(p_course_id, course_id),
        batch_id = coalesce(p_batch_id, batch_id),
        metadata = metadata || jsonb_build_object('verification', 'payment_verified', 'verified_by', auth.uid(), 'verified_at', now())
      where id = v_pay.enrollment_id;
      update public.lead_course_interests set status = 'enrolled', updated_at = now()
      where lead_id = v_pay.lead_id and course_id = coalesce(p_course_id, v_enr.course_id);
    end if;
  end if;

  update public.tasks set status = 'completed', completed_at = now()
  where lead_id = v_pay.lead_id and status = 'open' and created_by_id = 'enrollment_marking_v1' and metadata->>'payment_id' = p_payment_id::text;
  insert into public.activities (lead_id, activity_type, actor_type, actor_id, title, details, metadata)
  values (v_pay.lead_id, case when p_decision = 'verify' then 'enrollment_payment_verified' else 'enrollment_payment_rejected' end, 'human', auth.uid()::text,
    case when p_decision = 'verify' then 'Payment verified by admin' else 'Payment rejected by admin' end,
    left(coalesce(p_note, ''), 300), jsonb_build_object('payment_id', p_payment_id, 'enrollment_id', v_pay.enrollment_id));
  return jsonb_build_object('ok', true, 'decision', p_decision);
end;
$function$;

revoke all on function public.record_enrollment_v1(uuid, text, numeric, timestamptz, text, text, date, uuid, uuid, numeric, text, text) from public, anon;
grant execute on function public.record_enrollment_v1(uuid, text, numeric, timestamptz, text, text, date, uuid, uuid, numeric, text, text) to authenticated;
revoke all on function public.log_enrollment_payment_v1(uuid, numeric, timestamptz, text, text) from public, anon;
grant execute on function public.log_enrollment_payment_v1(uuid, numeric, timestamptz, text, text) to authenticated;
revoke all on function public.verify_enrollment_payment_v1(uuid, text, text, uuid, uuid) from public, anon;
grant execute on function public.verify_enrollment_payment_v1(uuid, text, text, uuid, uuid) to authenticated;
