-- Patch only the reviewed association statement and add the shared first lock.
-- Do not silently skip an absent/unrecognized deployed processor. Its complete
-- reproducible baseline remains a separate rollout prerequisite.
do $patch$
declare
  v_oid oid := to_regprocedure('public.process_enrollment_raw_event_v1(uuid,uuid)');
  v_source text;
  v_anchor text := '  if v_enrollment_reference is null then raise exception ''enrollment_reference is required''; end if;';
  v_update text := $old$    update public.payments p set enrollment_id=v_enrollment_id,updated_at=now()
    where p.organization_id=p_organization_id and p.lead_id=v_lead_id and p.enrollment_id is null
      and p.metadata->>'booking_reference'=v_booking_reference;$old$;
  v_replacement text := $new$    perform public.associate_booking_payments_enrollment_v1(
      p_organization_id,v_lead_id,v_enrollment_id,v_booking_reference,p_raw_event_id
    );$new$;
begin
  if v_oid is null or to_regprocedure('public.process_tracking_raw_event_v1(uuid,uuid)') is null then
    raise exception 'Reviewed enrollment/dispatcher processor baseline is required before this migration';
  end if;
  if (select proowner from pg_proc where oid = v_oid) is distinct from
       (select proowner from pg_proc where oid = 'public.associate_booking_payments_enrollment_v1(uuid,uuid,uuid,text,uuid)'::regprocedure)
     or (select proowner from pg_proc where oid = 'public.process_tracking_raw_event_v1(uuid,uuid)'::regprocedure) is distinct from
       (select proowner from pg_proc where oid = v_oid) then
    raise exception 'Trusted processor ownership must match the private association helper owner';
  end if;
  v_source := pg_get_functiondef(v_oid);
  if (length(v_source)-length(replace(v_source,v_update,'')))/length(v_update) <> 1
     or (length(v_source)-length(replace(v_source,v_anchor,'')))/length(v_anchor) <> 1 then
    raise exception 'Expected exactly one reviewed enrollment association and lead-lock anchor';
  end if;
  v_source := replace(v_source,v_anchor,v_anchor || E'\n\n'
    || '  perform 1 from public.leads where id=v_lead_id and organization_id=p_organization_id for update;'
    || E'\n' || '  if not found then raise exception ''enrollment lead tenant mismatch''; end if;');
  execute replace(v_source,v_update,v_replacement);
end;
$patch$;

-- Trusted event processors are server-side entry points, not browser RPCs.
revoke all on function public.process_enrollment_raw_event_v1(uuid,uuid) from public,anon,authenticated;
revoke all on function public.process_tracking_raw_event_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.process_enrollment_raw_event_v1(uuid,uuid) to service_role;
grant execute on function public.process_tracking_raw_event_v1(uuid,uuid) to service_role;
