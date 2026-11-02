-- Internal, transaction-scoped authority for a null -> enrollment association.
-- Browser/API roles cannot mint this authority, even by setting custom GUCs.
create index if not exists idx_payments_enrollment_association
  on public.payments(enrollment_id) where enrollment_id is not null;
create table public.payment_enrollment_link_authorizations (
  transaction_id bigint not null,
  backend_pid integer not null,
  payment_id uuid not null,
  organization_id uuid not null,
  lead_id uuid not null,
  enrollment_id uuid not null,
  primary key (transaction_id, backend_pid, payment_id)
);
alter table public.payment_enrollment_link_authorizations enable row level security;
revoke all on public.payment_enrollment_link_authorizations from public, anon, authenticated, service_role;

create or replace function public.protect_linked_refund_ledger_v1()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE' and old.enrollment_id is null and new.enrollment_id is not null
     and (to_jsonb(new) - array['enrollment_id','updated_at'])
         = (to_jsonb(old) - array['enrollment_id','updated_at'])
     and exists (
       select 1 from public.payment_enrollment_link_authorizations a
       where a.transaction_id = txid_current() and a.backend_pid = pg_backend_pid()
         and a.payment_id = old.id and a.organization_id = old.organization_id
         and a.lead_id = old.lead_id and a.enrollment_id = new.enrollment_id
     )
     and exists (select 1 from public.enrollments e where e.id = new.enrollment_id
       and e.organization_id = new.organization_id and e.lead_id = new.lead_id)
     and (old.original_payment_id is null or exists (
       select 1 from public.payments p where p.id = old.original_payment_id
         and p.organization_id = old.organization_id and p.lead_id = old.lead_id
         and p.currency = old.currency and p.enrollment_id = new.enrollment_id
     )) then
    return new;
  end if;
  if old.original_payment_id is not null then
    raise exception 'Linked refunds are immutable; use an audited correction workflow';
  end if;
  if exists (select 1 from public.payments r where r.original_payment_id = old.id) then
    if tg_op = 'DELETE' then raise exception 'A refunded original payment cannot be deleted'; end if;
    if row(new.id, new.organization_id, new.lead_id, new.enrollment_id, new.amount,
           new.currency, new.payment_kind, new.status, new.provider, new.external_payment_id,
           new.paid_at, new.metadata->>'booking_reference')
       is distinct from
       row(old.id, old.organization_id, old.lead_id, old.enrollment_id, old.amount,
           old.currency, old.payment_kind, old.status, old.provider, old.external_payment_id,
           old.paid_at, old.metadata->>'booking_reference') then
      raise exception 'Financial fields of a refunded original payment are immutable';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;
revoke all on function public.protect_linked_refund_ledger_v1() from public, anon, authenticated, service_role;

-- Only an owner-owned trusted processor may invoke this internal helper.
-- It associates existing records; it neither verifies cash nor confirms a seat.
create or replace function public.associate_booking_payments_enrollment_v1(
  p_organization_id uuid, p_lead_id uuid, p_enrollment_id uuid,
  p_booking_reference text, p_raw_event_id uuid
)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  v_enrollment public.enrollments;
  v_parent public.payments;
  v_refund public.payments;
  v_changed uuid[] := array[]::uuid[];
  v_count integer := 0;
  v_scanned integer := 0;
begin
  if p_organization_id is null or p_lead_id is null or p_enrollment_id is null
     or p_raw_event_id is null or nullif(btrim(p_booking_reference),'') is null
     or length(p_booking_reference) > 240 then
    raise exception 'Tenant, lead, enrollment, booking reference and raw event are required';
  end if;
  -- Same first lock as refund and verification commands. The processor also
  -- takes it before its enrollment upsert, avoiding enrollment/lead lock inversion.
  perform 1 from public.leads where id = p_lead_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Enrollment association lead scope mismatch'; end if;
  select * into v_enrollment from public.enrollments
    where id = p_enrollment_id and organization_id = p_organization_id and lead_id = p_lead_id
    for no key update;
  if not found then raise exception 'Enrollment association tenant or lead mismatch'; end if;
  if v_enrollment.metadata->>'booking_reference' is distinct from p_booking_reference
     or v_enrollment.metadata->>'trusted_server_event' is distinct from 'true'
     or (v_enrollment.metadata->>'raw_event_id' = p_raw_event_id::text
       or v_enrollment.metadata->>'latest_raw_event_id' = p_raw_event_id::text) is not true then
    raise exception 'Enrollment association lacks matching recorded event evidence';
  end if;

  if exists (select 1 from public.payments r where r.organization_id = p_organization_id
      and r.lead_id = p_lead_id and r.payment_kind = 'refund' and r.status in ('paid','refunded')
      and r.original_payment_id is null and r.currency in (
        select p.currency from public.payments p where p.organization_id = p_organization_id
          and p.lead_id = p_lead_id and p.payment_kind <> 'refund'
          and p.metadata->>'booking_reference' = p_booking_reference
      )) then
    raise exception 'Reconcile existing unlinked refunds before enrollment association';
  end if;

  for v_parent in select p.* from public.payments p
    where p.organization_id = p_organization_id and p.lead_id = p_lead_id
      and p.payment_kind <> 'refund' and p.metadata->>'booking_reference' = p_booking_reference
    order by p.id for update
  loop
    v_scanned := v_scanned + 1;
    if v_scanned > 1000 then raise exception 'Enrollment association exceeds the bounded payment family limit'; end if;
    if v_parent.enrollment_id is not null and v_parent.enrollment_id <> p_enrollment_id then
      raise exception 'Payment is already associated with another enrollment';
    end if;
    if v_parent.currency is distinct from v_enrollment.currency then
      raise exception 'Enrollment and payment currencies must match; no exchange rate is inferred';
    end if;
    if exists (select 1 from public.payments r where r.original_payment_id = v_parent.id
      and (r.organization_id is distinct from p_organization_id or r.lead_id is distinct from p_lead_id
        or r.currency is distinct from v_parent.currency or r.payment_kind <> 'refund'
        or (r.enrollment_id is not null and r.enrollment_id <> p_enrollment_id))) then
      raise exception 'Linked refund association conflicts with the original payment';
    end if;
    if v_parent.enrollment_id is null then
      insert into public.payment_enrollment_link_authorizations
      values(txid_current(),pg_backend_pid(),v_parent.id,p_organization_id,p_lead_id,p_enrollment_id);
      update public.payments set enrollment_id = p_enrollment_id, updated_at = now() where id = v_parent.id;
      v_changed := array_append(v_changed,v_parent.id);
    end if;
    for v_refund in select r.* from public.payments r where r.original_payment_id = v_parent.id
      order by r.id for update
    loop
      v_scanned := v_scanned + 1;
      if v_scanned > 1000 then raise exception 'Enrollment association exceeds the bounded payment family limit'; end if;
      if v_refund.enrollment_id is null then
        insert into public.payment_enrollment_link_authorizations
        values(txid_current(),pg_backend_pid(),v_refund.id,p_organization_id,p_lead_id,p_enrollment_id);
        update public.payments set enrollment_id = p_enrollment_id, updated_at = now() where id = v_refund.id;
        v_changed := array_append(v_changed,v_refund.id);
      end if;
    end loop;
  end loop;
  v_count := cardinality(v_changed);
  if v_count > 0 then
    insert into public.activities(lead_id,activity_type,actor_type,actor_id,title,metadata)
    values(p_lead_id,'payment_enrollment_linked','system',p_raw_event_id::text,
      'Existing payment records associated with enrollment',
      jsonb_build_object('organization_id',p_organization_id,'enrollment_id',p_enrollment_id,
        'raw_event_id',p_raw_event_id,'payment_ids',to_jsonb(v_changed),'source','enrollment_association_v1'));
  end if;
  delete from public.payment_enrollment_link_authorizations
    where transaction_id = txid_current() and backend_pid = pg_backend_pid()
      and payment_id = any(v_changed);
  return jsonb_build_object('ok',true,'linked_records',v_count,'replayed',v_count=0);
end;
$function$;
revoke all on function public.associate_booking_payments_enrollment_v1(uuid,uuid,uuid,text,uuid)
  from public, anon, authenticated, service_role;

create or replace function public.protect_payment_enrollment_identity_v1()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' then
    if exists(select 1 from public.payments p where p.enrollment_id = old.id) then
      raise exception 'An enrollment with payment allocations cannot be deleted';
    end if;
    return old;
  end if;
  if row(new.id,new.organization_id,new.lead_id,new.currency,new.metadata->>'booking_reference')
     is distinct from row(old.id,old.organization_id,old.lead_id,old.currency,old.metadata->>'booking_reference')
     and exists(select 1 from public.payments p where p.enrollment_id = old.id) then
    raise exception 'An enrollment with payment allocations cannot change tenant, lead, currency or booking identity';
  end if;
  return new;
end;
$function$;
revoke all on function public.protect_payment_enrollment_identity_v1() from public, anon, authenticated, service_role;
create trigger protect_payment_enrollment_identity_v1 before update or delete on public.enrollments
  for each row execute function public.protect_payment_enrollment_identity_v1();
