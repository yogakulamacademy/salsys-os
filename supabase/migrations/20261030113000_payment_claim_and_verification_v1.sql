-- Separate customer-reported payment claims from authoritative financial truth.
-- Claims create review work only. Verified payments remain owner/admin-only and
-- deliberately flow through the existing paid-payment -> closed_won trigger.

create or replace function public.report_payment_claim_v1(
  p_lead_id uuid,
  p_claimed_amount numeric default null,
  p_currency text default null,
  p_reference text default null,
  p_note text default null,
  p_message_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_org_id uuid;
  v_task public.tasks;
  v_currency text := upper(nullif(btrim(coalesce(p_currency,'')),''));
  v_reference text := nullif(btrim(coalesce(p_reference,'')),'');
  v_note text := nullif(btrim(coalesce(p_note,'')),'');
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.can_work_lead(p_lead_id) then
    raise exception 'Not authorized to report payment for this lead';
  end if;

  select organization_id into v_org_id
  from public.leads
  where id = p_lead_id;

  if v_org_id is null then
    raise exception 'Lead not found or has no organization';
  end if;

  if p_claimed_amount is not null and p_claimed_amount <= 0 then
    raise exception 'Claimed amount must be greater than zero';
  end if;

  if v_currency is not null and v_currency not in ('USD','INR') then
    raise exception 'Unsupported currency';
  end if;

  insert into public.tasks (
    organization_id, lead_id, task_type, title, description, status,
    due_at, assigned_to, created_by_type, created_by_id, metadata
  ) values (
    v_org_id,
    p_lead_id,
    'payment_check'::public.task_type,
    'Verify reported payment',
    coalesce(v_note, 'Customer reported a payment. Verify against provider/bank evidence before marking paid.'),
    'open'::public.task_status,
    now(),
    auth.uid(),
    'human'::public.actor_type,
    auth.uid()::text,
    jsonb_strip_nulls(jsonb_build_object(
      'payment_claim', true,
      'claimed_amount', p_claimed_amount,
      'currency', v_currency,
      'reference', v_reference,
      'message_id', p_message_id,
      'reported_by', auth.uid(),
      'reported_at', now()
    ))
  ) returning * into v_task;

  insert into public.activities (
    lead_id, activity_type, actor_type, actor_id, title, details, metadata
  ) values (
    p_lead_id,
    'payment_claim_reported',
    'human'::public.actor_type,
    auth.uid()::text,
    'Payment reported — verification required',
    concat_ws(' · ',
      case when p_claimed_amount is not null then coalesce(v_currency,'') || ' ' || p_claimed_amount::text end,
      v_reference,
      v_note
    ),
    jsonb_strip_nulls(jsonb_build_object(
      'task_id', v_task.id,
      'claimed_amount', p_claimed_amount,
      'currency', v_currency,
      'reference', v_reference,
      'message_id', p_message_id,
      'verification_required', true
    ))
  );

  return jsonb_build_object(
    'ok', true,
    'task_id', v_task.id,
    'payment_status_changed', false,
    'verification_required', true
  );
end;
$function$;

revoke all on function public.report_payment_claim_v1(uuid,numeric,text,text,text,uuid) from public;
grant execute on function public.report_payment_claim_v1(uuid,numeric,text,text,text,uuid) to authenticated, service_role;

create or replace function public.verify_payment_v1(
  p_lead_id uuid,
  p_amount numeric,
  p_currency text,
  p_payment_kind public.payment_kind default 'deposit'::public.payment_kind,
  p_provider text default null,
  p_reference text default null,
  p_paid_at timestamptz default now(),
  p_evidence_note text default null,
  p_payment_check_task_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_org_id uuid;
  v_stage_before public.lead_stage;
  v_stage_after public.lead_stage;
  v_payment public.payments;
  v_currency text := upper(nullif(btrim(coalesce(p_currency,'')),''));
  v_provider text := nullif(btrim(coalesce(p_provider,'')),'');
  v_reference text := nullif(btrim(coalesce(p_reference,'')),'');
  v_evidence text := nullif(btrim(coalesce(p_evidence_note,'')),'');
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select organization_id, current_stage
    into v_org_id, v_stage_before
  from public.leads
  where id = p_lead_id
  for update;

  if v_org_id is null then
    raise exception 'Lead not found or has no organization';
  end if;

  if not public.can_mutate_organization(v_org_id)
     or not public.has_organization_role(v_org_id, array['owner','admin']) then
    raise exception 'Only an owner or admin can verify a payment';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  if v_currency not in ('USD','INR') then
    raise exception 'Unsupported currency';
  end if;

  if p_payment_kind = 'refund'::public.payment_kind then
    raise exception 'Refunds must use the refund workflow';
  end if;

  if v_reference is not null and exists (
    select 1 from public.payments p
    where p.organization_id = v_org_id
      and p.external_payment_id = v_reference
      and coalesce(p.provider,'') = coalesce(v_provider,'')
      and p.status = 'paid'::public.payment_status
  ) then
    raise exception 'A verified payment with this provider/reference already exists';
  end if;

  insert into public.payments (
    organization_id, lead_id, provider, external_payment_id, payment_kind,
    status, amount, currency, paid_at, metadata
  ) values (
    v_org_id,
    p_lead_id,
    v_provider,
    v_reference,
    p_payment_kind,
    'paid'::public.payment_status,
    p_amount,
    v_currency,
    coalesce(p_paid_at, now()),
    jsonb_strip_nulls(jsonb_build_object(
      'source', 'crm_manual_verified',
      'verified_by', auth.uid(),
      'verified_at', now(),
      'evidence_note', v_evidence,
      'payment_check_task_id', p_payment_check_task_id
    ))
  ) returning * into v_payment;

  insert into public.activities (
    lead_id, activity_type, actor_type, actor_id, title, details, metadata
  ) values (
    p_lead_id,
    'payment_recorded',
    'human'::public.actor_type,
    auth.uid()::text,
    'Verified payment recorded',
    concat_ws(' · ', v_currency || ' ' || p_amount::text, v_provider, v_reference),
    jsonb_strip_nulls(jsonb_build_object(
      'payment_id', v_payment.id,
      'payment_kind', p_payment_kind,
      'currency', v_currency,
      'amount', p_amount,
      'reference', v_reference,
      'verified', true,
      'evidence_note', v_evidence,
      'payment_check_task_id', p_payment_check_task_id
    ))
  );

  if p_payment_check_task_id is not null then
    update public.tasks
    set status = 'completed'::public.task_status,
        completed_at = now(),
        metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
          'verified_payment_id', v_payment.id,
          'verified_by', auth.uid(),
          'verified_at', now()
        )
    where id = p_payment_check_task_id
      and organization_id = v_org_id
      and lead_id = p_lead_id
      and task_type = 'payment_check'::public.task_type
      and status in ('open'::public.task_status,'snoozed'::public.task_status);
  end if;

  select current_stage into v_stage_after
  from public.leads
  where id = p_lead_id;

  return jsonb_build_object(
    'ok', true,
    'payment_id', v_payment.id,
    'status', v_payment.status,
    'stage_before', v_stage_before,
    'stage_after', v_stage_after,
    'closed_won_triggered', v_stage_before is distinct from v_stage_after and v_stage_after = 'closed_won'::public.lead_stage,
    'payment_check_completed', p_payment_check_task_id is not null
  );
end;
$function$;

revoke all on function public.verify_payment_v1(uuid,numeric,text,public.payment_kind,text,text,timestamptz,text,uuid) from public;
grant execute on function public.verify_payment_v1(uuid,numeric,text,public.payment_kind,text,text,timestamptz,text,uuid) to authenticated, service_role;
