begin;

do $$
declare
  v_lead record;
begin
  for v_lead in
    select l.id
    from public.leads l
    where exists (
      select 1
      from public.lead_attribution la
      where la.lead_id = l.id
    )
    order by l.created_at, l.id
  loop
    perform public.refresh_lead_attribution_internal(v_lead.id);
  end loop;
end;
$$;

commit;
