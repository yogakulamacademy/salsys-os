-- Bind every acknowledged request key, including reference-only retries.
-- No historical financial rows are rewritten or inferred.
create table public.payment_refund_requests (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  request_id uuid not null,
  payment_id uuid not null references public.payments(id) on delete restrict,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  primary key(organization_id,request_id)
);
create index idx_payment_refund_requests_payment on public.payment_refund_requests(payment_id);
alter table public.payment_refund_requests enable row level security;
revoke all on public.payment_refund_requests from public,anon,authenticated,service_role;
grant select on public.payment_refund_requests to service_role;
create policy payment_refund_requests_service_read on public.payment_refund_requests
  for select to service_role using (true);

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
  v_bound_payment_id uuid;
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

  select p.* into v_existing
    from public.payment_refund_requests r
    join public.payments p on p.id = r.payment_id and p.organization_id = r.organization_id
    where r.organization_id = v_org and r.request_id = p_request_id;
  if not found then
    -- Compatibility for canonical refunds created before request aliases existed.
    select * into v_existing from public.payments
      where organization_id = v_org and refund_request_id = p_request_id;
  end if;
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
  insert into public.payment_refund_requests(organization_id,request_id,payment_id,created_by)
    values(v_org,p_request_id,v_existing.id,auth.uid()) on conflict do nothing;
  select payment_id into v_bound_payment_id from public.payment_refund_requests
    where organization_id = v_org and request_id = p_request_id;
  if v_bound_payment_id is distinct from v_existing.id then
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
  insert into public.payment_refund_requests(organization_id,request_id,payment_id,created_by)
    values(v_org,p_request_id,v_refund.id,auth.uid()) on conflict do nothing;
  select payment_id into v_bound_payment_id from public.payment_refund_requests
    where organization_id = v_org and request_id = p_request_id;
  if v_bound_payment_id is distinct from v_refund.id then
    raise exception 'Refund request or reference conflicts with an existing transaction';
  end if;
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
