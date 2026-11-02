-- Record an already-settled manual refund; this command never sends money.
-- Existing unlinked refunds are preserved and require reconciliation, not inference.
alter table public.payments
  add column original_payment_id uuid references public.payments(id) on delete restrict,
  add column refund_request_id uuid,
  add constraint payments_refund_link_shape check (
    (original_payment_id is null and refund_request_id is null)
    or (payment_kind = 'refund' and original_payment_id is not null and refund_request_id is not null
        and original_payment_id <> id)
  );

create unique index uq_payments_refund_request
  on public.payments (organization_id, refund_request_id)
  where refund_request_id is not null;
create index idx_payments_original_refund
  on public.payments (original_payment_id) where original_payment_id is not null;

-- Ordinary browser/API writes cannot bypass the atomic refund command.
create policy payments_refund_insert_command_only on public.payments
  as restrictive for insert to authenticated with check (payment_kind <> 'refund');
create policy payments_refund_update_command_only on public.payments
  as restrictive for update to authenticated
  using (payment_kind <> 'refund') with check (payment_kind <> 'refund');
create policy payments_refund_delete_command_only on public.payments
  as restrictive for delete to authenticated using (payment_kind <> 'refund');

create or replace function public.protect_linked_refund_ledger_v1()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  if old.original_payment_id is not null then
    raise exception 'Linked refunds are immutable; use an audited correction workflow';
  end if;
  if exists (select 1 from public.payments r where r.original_payment_id = old.id) then
    if tg_op = 'DELETE' then
      raise exception 'A refunded original payment cannot be deleted';
    end if;
    if row(new.id, new.organization_id, new.lead_id, new.enrollment_id, new.amount,
           new.currency, new.payment_kind, new.status, new.provider, new.external_payment_id, new.paid_at)
       is distinct from
       row(old.id, old.organization_id, old.lead_id, old.enrollment_id, old.amount,
           old.currency, old.payment_kind, old.status, old.provider, old.external_payment_id, old.paid_at) then
      raise exception 'Financial fields of a refunded original payment are immutable';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;
revoke all on function public.protect_linked_refund_ledger_v1() from public, anon, authenticated;
create trigger protect_linked_refund_ledger_v1 before update or delete on public.payments
  for each row execute function public.protect_linked_refund_ledger_v1();

create or replace function public.record_refund_v1(
  p_lead_id uuid,
  p_original_payment_id uuid,
  p_amount numeric,
  p_currency text,
  p_request_id uuid,
  p_provider text default null,
  p_reference text default null,
  p_paid_at timestamptz default null,
  p_note text default null
)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  v_org uuid;
  v_original public.payments;
  v_existing public.payments;
  v_refund public.payments;
  v_total numeric;
  v_currency text := upper(nullif(btrim(p_currency), ''));
  v_provider text := lower(nullif(btrim(p_provider), ''));
  v_reference text := nullif(btrim(p_reference), '');
  v_note text := nullif(btrim(p_note), '');
begin
  if auth.uid() is null or not public.is_crm_user() then
    raise exception 'Authentication required';
  end if;
  select organization_id into v_org from public.leads where id = p_lead_id;
  if v_org is null or not public.can_mutate_organization(v_org)
     or not public.has_organization_role(v_org, array['owner','admin']) then
    raise exception 'Not authorized to record a refund for this lead';
  end if;
  if p_request_id is null or p_original_payment_id is null then
    raise exception 'Original payment and refund request ID are required';
  end if;
  if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity')
     or p_amount <= 0 or p_amount > 999999999999.99 or p_amount <> round(p_amount, 2) then
    raise exception 'Refund amount must be positive with at most two decimal places';
  end if;
  if v_currency is null or v_currency not in ('INR','USD') then
    raise exception 'Unsupported currency';
  end if;
  if v_provider is null or length(v_provider) > 80 or length(v_reference) > 240
     or v_note is null or length(v_note) > 2000 then
    raise exception 'Refund method and a reason with verification evidence are required';
  end if;
  if p_paid_at is not null and not isfinite(p_paid_at) then
    raise exception 'Invalid refund date';
  end if;

  -- Same lock order as payment verification: lead first, then original payment.
  -- All manual refunds on this lead serialize, including retries on another payment.
  perform 1 from public.leads where id = p_lead_id and organization_id = v_org for update;
  select * into v_original from public.payments
    where id = p_original_payment_id and lead_id = p_lead_id and organization_id = v_org for update;
  if not found or v_original.payment_kind = 'refund' or v_original.status <> 'paid'
     or v_original.currency <> v_currency or v_original.amount <= 0
     or v_original.amount::text in ('NaN','Infinity','-Infinity') then
    raise exception 'Select an original paid transaction in the same lead, workspace and currency';
  end if;

  select * into v_existing from public.payments
    where organization_id = v_org and refund_request_id = p_request_id;
  if not found and v_reference is not null then
    select * into v_existing from public.payments
      where organization_id = v_org and coalesce(provider,'') = v_provider
        and external_payment_id = v_reference;
  end if;
  if v_existing.id is not null then
    if v_existing.lead_id is distinct from p_lead_id
       or v_existing.original_payment_id is distinct from p_original_payment_id
       or v_existing.payment_kind <> 'refund' or v_existing.status <> 'refunded'
       or v_existing.amount is distinct from p_amount or v_existing.currency is distinct from v_currency
       or v_existing.provider is distinct from v_provider or v_existing.external_payment_id is distinct from v_reference
       or v_existing.metadata->>'notes' is distinct from v_note
       or (p_paid_at is not null and v_existing.paid_at is distinct from p_paid_at) then
      raise exception 'Refund request or reference conflicts with an existing transaction';
    end if;
    return jsonb_build_object('ok',true,'payment_id',v_existing.id,'replayed',true);
  end if;

  if exists (select 1 from public.payments where organization_id = v_org and lead_id = p_lead_id
      and currency = v_currency and payment_kind = 'refund' and status in ('paid','refunded')
      and original_payment_id is null) then
    raise exception 'Reconcile existing unlinked refunds in this currency before recording another refund';
  end if;
  -- Create a new parent row version as well as holding its lock. Concurrent
  -- repeatable-read callers must retry rather than sum an older refund snapshot.
  -- Financial fields remain unchanged; audit failures roll this update back too.
  update public.payments set updated_at = now() where id = v_original.id;
  select coalesce(sum(amount),0) into v_total from public.payments
    where organization_id = v_org and lead_id = p_lead_id and original_payment_id = p_original_payment_id
      and payment_kind = 'refund' and status in ('paid','refunded');
  if v_total + p_amount > v_original.amount then
    raise exception 'Refund exceeds the remaining refundable amount';
  end if;

  insert into public.payments(organization_id,lead_id,enrollment_id,provider,external_payment_id,
    payment_kind,status,amount,currency,paid_at,original_payment_id,refund_request_id,metadata)
  values(v_org,p_lead_id,v_original.enrollment_id,v_provider,v_reference,'refund','refunded',p_amount,
    v_currency,coalesce(p_paid_at,now()),p_original_payment_id,p_request_id,
    jsonb_build_object('source','crm_manual_refund_v1','recorded_by',auth.uid(),'recorded_at',now(),
      'notes',v_note,'original_payment_id',p_original_payment_id,'refund_request_id',p_request_id))
  returning * into v_refund;
  insert into public.activities(lead_id,activity_type,actor_type,actor_id,title,details,metadata)
  values(p_lead_id,'refund_recorded','human',auth.uid()::text,'Refund recorded',
    v_currency || ' ' || p_amount::text,
    jsonb_build_object('payment_id',v_refund.id,'original_payment_id',p_original_payment_id,
      'refund_request_id',p_request_id,'payment_kind','refund','currency',v_currency,'amount',p_amount,
      'reference',v_reference,'notes',v_note));
  -- Exceptions from either insert abort the entire command. Do not swallow them.
  -- Original paid amount/status and enrollment/stage remain unchanged; reports subtract the refund row.
  return jsonb_build_object('ok',true,'payment_id',v_refund.id,'replayed',false,
    'refunded_total',v_total + p_amount,'remaining_refundable',v_original.amount - v_total - p_amount);
end;
$function$;
revoke all on function public.record_refund_v1(uuid,uuid,numeric,text,uuid,text,text,timestamptz,text)
  from public, anon;
grant execute on function public.record_refund_v1(uuid,uuid,numeric,text,uuid,text,text,timestamptz,text)
  to authenticated, service_role;


-- Enforce verification evidence and precision at the database boundary too.
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
  if auth.uid() is null or not public.is_crm_user() then
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

  if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity')
     or p_amount <= 0 or p_amount > 999999999999.99 or p_amount <> round(p_amount,2) then
    raise exception 'Payment amount must be positive with at most two decimal places';
  end if;

  if v_currency is null or v_currency not in ('USD','INR') then
    raise exception 'Unsupported currency';
  end if;

  if v_reference is null and v_evidence is null then
    raise exception 'A transaction reference or independent verification evidence is required';
  end if;

  if p_payment_check_task_id is not null then
    perform 1 from public.tasks where id = p_payment_check_task_id
      and organization_id = v_org_id and lead_id = p_lead_id
      and task_type = 'payment_check' and status in ('open','snoozed') for update;
    if not found then raise exception 'Select an open payment verification task for this lead'; end if;
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

revoke all on function public.verify_payment_v1(uuid,numeric,text,public.payment_kind,text,text,timestamptz,text,uuid) from public, anon;
grant execute on function public.verify_payment_v1(uuid,numeric,text,public.payment_kind,text,text,timestamptz,text,uuid) to authenticated, service_role;
