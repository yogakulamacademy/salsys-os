-- Payment-backed enrollment confirmation must be supported by canonical paid
-- payment evidence. This does not invent a deposit amount or percentage.
-- Non-commerce enrollment sources remain unaffected unless they explicitly
-- declare confirmation_basis=verified_payment.

create schema if not exists app_private authorization postgres;
revoke all on schema app_private from public, anon;
grant usage on schema app_private to authenticated, service_role;

create or replace function app_private.assert_verified_payment_enrollment_v1(
  p_organization_id uuid,
  p_lead_id uuid,
  p_booking_reference text,
  p_payment_reference text,
  p_provider text,
  p_currency text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_payment_id uuid;
  v_booking_reference text := nullif(btrim(p_booking_reference), '');
  v_payment_reference text := nullif(btrim(p_payment_reference), '');
  v_provider text := lower(nullif(btrim(p_provider), ''));
  v_currency text := upper(nullif(btrim(p_currency), ''));
begin
  if p_organization_id is null or p_lead_id is null
     or v_booking_reference is null
     or v_payment_reference is null
     or v_provider is null then
    raise exception 'Verified payment-backed enrollment requires booking, payment reference and provider evidence';
  end if;

  select p.id
  into v_payment_id
  from public.payments p
  where p.organization_id = p_organization_id
    and p.lead_id = p_lead_id
    and lower(coalesce(p.provider, '')) = v_provider
    and p.external_payment_id = v_payment_reference
    and p.payment_kind <> 'refund'::public.payment_kind
    and p.status = 'paid'::public.payment_status
    and p.amount > 0
    and p.metadata->>'booking_reference' = v_booking_reference
    and (v_currency is null or upper(p.currency) = v_currency)
  limit 1;

  if v_payment_id is null then
    raise exception 'Verified paid payment evidence is not available for this enrollment yet';
  end if;

  return v_payment_id;
end;
$function$;

revoke all on function app_private.assert_verified_payment_enrollment_v1(uuid,uuid,text,text,text,text)
  from public, anon, authenticated, service_role;

-- Patch only the already-reviewed enrollment processor shape produced by the
-- preceding association migration. The exact source anchor makes drift fail
-- closed rather than silently weakening the payment prerequisite.
do $patch$
declare
  v_oid oid := to_regprocedure('public.process_enrollment_raw_event_v1(uuid,uuid)');
  v_source text;
  v_anchor text := $anchor$  v_currency := upper(nullif(btrim(v_payload->>'currency'),''));

  perform pg_advisory_xact_lock(hashtextextended('enrollment-ref:'||p_organization_id::text||':'||v_source.source_system||':'||v_enrollment_reference,0));$anchor$;
  v_replacement text := $replacement$  v_currency := upper(nullif(btrim(v_payload->>'currency'),''));

  if lower(coalesce(v_raw.metadata->>'confirmation_basis','')) = 'verified_payment' then
    perform app_private.assert_verified_payment_enrollment_v1(
      p_organization_id,
      v_lead_id,
      v_booking_reference,
      nullif(v_raw.metadata->>'payment_reference',''),
      nullif(v_raw.metadata->>'payment_provider',''),
      v_currency
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended('enrollment-ref:'||p_organization_id::text||':'||v_source.source_system||':'||v_enrollment_reference,0));$replacement$;
begin
  if v_oid is null then
    raise exception 'Reviewed enrollment processor baseline is required before verified-payment enforcement';
  end if;

  if (select proowner from pg_proc where oid = v_oid) is distinct from
       (select proowner from pg_proc where oid = 'app_private.assert_verified_payment_enrollment_v1(uuid,uuid,text,text,text,text)'::regprocedure) then
    raise exception 'Enrollment processor and verified-payment helper ownership must match';
  end if;

  v_source := pg_get_functiondef(v_oid);

  if (length(v_source)-length(replace(v_source,v_anchor,'')))/length(v_anchor) <> 1
     or position('perform public.associate_booking_payments_enrollment_v1(' in v_source) = 0
     or position('perform 1 from public.leads where id=v_lead_id and organization_id=p_organization_id for update;' in v_source) = 0 then
    raise exception 'Expected reviewed enrollment payment-association and lead-lock baseline';
  end if;

  execute replace(v_source, v_anchor, v_replacement);
end;
$patch$;

-- Keep the trusted processor server-only after CREATE OR REPLACE.
revoke all on function public.process_enrollment_raw_event_v1(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.process_enrollment_raw_event_v1(uuid,uuid)
  to service_role;
