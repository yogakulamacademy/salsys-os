-- R11-P3 follow-up — maintenance-safe residential batch trigger context.
--
-- organization_has_capability(...) intentionally depends on auth.role() and is
-- correct for product/RLS paths. A table trigger can also run from trusted raw
-- PostgreSQL maintenance where no JWT claim exists, so resolve capability state
-- directly from canonical organization/capability tables inside the trigger.

begin;

create or replace function public.enforce_course_batch_residential_capability_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_residential_enabled boolean := false;
begin
  if new.organization_id is null then
    return new;
  end if;

  select exists (
    select 1
    from public.organizations o
    join public.organization_capabilities oc
      on oc.organization_id = o.id
     and oc.capability_code = 'wellness_residential'
     and oc.enabled = true
    join public.capability_catalog cc
      on cc.code = oc.capability_code
     and cc.status = 'active'
    where o.id = new.organization_id
      and o.status = 'active'
  )
  into v_residential_enabled;

  if v_residential_enabled then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.price_private := null;
    new.price_shared := null;
    new.price_course_only := null;
    new.accommodation_capacity := null;
    new.accommodation_remaining := null;
    new.accommodation_note := null;
  else
    new.price_private := old.price_private;
    new.price_shared := old.price_shared;
    new.price_course_only := old.price_course_only;
    new.accommodation_capacity := old.accommodation_capacity;
    new.accommodation_remaining := old.accommodation_remaining;
    new.accommodation_note := old.accommodation_note;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_course_batch_residential_capability_v1()
  from public, anon, authenticated;

comment on function public.enforce_course_batch_residential_capability_v1() is
'R11-P3 canonical mixed-row guard. Resolves wellness_residential directly from canonical tables so trusted PostgreSQL maintenance and product writes share the same capability result.';

commit;
