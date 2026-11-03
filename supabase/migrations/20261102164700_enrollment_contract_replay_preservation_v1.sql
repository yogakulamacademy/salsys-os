-- C1 replay preservation: once an approved contract adjustment exists, trusted
-- source replays may refresh non-contract enrollment evidence but must preserve
-- the governed total_value/currency instead of failing or overwriting it.

-- Patch only the reviewed enrollment processor shape after the payment-evidence
-- migration. Exact anchors make source drift fail closed.
do $patch$
declare
  v_oid oid := to_regprocedure('public.process_enrollment_raw_event_v1(uuid,uuid)');
  v_source text;
  v_anchor text := $anchor$      total_value=coalesce(v_total_value,e.total_value),
      currency=coalesce(v_currency,e.currency),$anchor$;
  v_replacement text := $replacement$      total_value=case
        when exists (
          select 1
          from public.enrollment_contract_adjustments a
          where a.organization_id=p_organization_id
            and a.enrollment_id=e.id
        ) then e.total_value
        else coalesce(v_total_value,e.total_value)
      end,
      currency=case
        when exists (
          select 1
          from public.enrollment_contract_adjustments a
          where a.organization_id=p_organization_id
            and a.enrollment_id=e.id
        ) then e.currency
        else coalesce(v_currency,e.currency)
      end,$replacement$;
begin
  if v_oid is null then
    raise exception 'Reviewed enrollment processor baseline is required before contract replay preservation';
  end if;

  if to_regclass('public.enrollment_contract_adjustments') is null then
    raise exception 'Enrollment contract-adjustment ledger is required before replay preservation';
  end if;

  if (select proowner from pg_proc where oid=v_oid) is distinct from
       (select relowner from pg_class where oid='public.enrollment_contract_adjustments'::regclass) then
    raise exception 'Enrollment processor and contract-adjustment ledger ownership must match';
  end if;

  v_source := pg_get_functiondef(v_oid);

  if (length(v_source)-length(replace(v_source,v_anchor,'')))/length(v_anchor) <> 1
     or position('perform app_private.assert_verified_payment_enrollment_v1(' in v_source) = 0
     or position('perform public.associate_booking_payments_enrollment_v1(' in v_source) = 0
     or position('perform 1 from public.leads where id=v_lead_id and organization_id=p_organization_id for update;' in v_source) = 0 then
    raise exception 'Expected reviewed enrollment association/payment-evidence baseline before contract replay preservation';
  end if;

  execute replace(v_source,v_anchor,v_replacement);
end;
$patch$;

-- CREATE OR REPLACE preserves ownership but resets no intended API boundary;
-- restate it explicitly so the trusted processor remains server-only.
revoke all on function public.process_enrollment_raw_event_v1(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.process_enrollment_raw_event_v1(uuid,uuid)
  to service_role;
