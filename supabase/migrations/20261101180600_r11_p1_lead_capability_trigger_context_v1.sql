-- R11-P1 follow-up: canonical Lead capability enforcement must depend on
-- tenant capability truth, not on whether the caller has an auth JWT context.

begin;

create or replace function public.enforce_lead_education_capability_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_education_enabled boolean;
begin
  if new.organization_id is null then
    return new;
  end if;

  select exists (
    select 1
    from public.organization_capabilities oc
    join public.capability_catalog cc
      on cc.code = oc.capability_code
     and cc.status = 'active'
    join public.organizations o
      on o.id = oc.organization_id
     and o.status = 'active'
    where oc.organization_id = new.organization_id
      and oc.capability_code = 'education_core'
      and oc.enabled = true
  ) into v_education_enabled;

  if v_education_enabled then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.interested_course_id := null;
    new.preferred_batch_id := null;
    new.preferred_location := null;
    new.preferred_month := null;
    new.preferred_mode := null;
  else
    new.interested_course_id := old.interested_course_id;
    new.preferred_batch_id := old.preferred_batch_id;
    new.preferred_location := old.preferred_location;
    new.preferred_month := old.preferred_month;
    new.preferred_mode := old.preferred_mode;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_lead_education_capability_v1()
  from public, anon, authenticated;

comment on function public.enforce_lead_education_capability_v1() is
'R11-P1 canonical Lead capability guard. Reads tenant capability truth directly so browser, service-role and PostgreSQL maintenance contexts behave consistently.';

commit;
