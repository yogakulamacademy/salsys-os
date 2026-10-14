begin;

-- W5B-2: organization owner/admin control realized payment mutations.

drop policy if exists payments_insert on public.payments;
create policy payments_insert on public.payments for insert to authenticated
with check (
  public.has_organization_role(organization_id, array['owner','admin']::text[])
  and exists (
    select 1 from public.leads l
    where l.id = payments.lead_id
      and l.organization_id = payments.organization_id
  )
  and (
    enrollment_id is null
    or exists (
      select 1 from public.enrollments e
      where e.id = payments.enrollment_id
        and e.organization_id = payments.organization_id
        and e.lead_id = payments.lead_id
    )
  )
);

drop policy if exists payments_update on public.payments;
create policy payments_update on public.payments for update to authenticated
using (
  public.has_organization_role(organization_id, array['owner','admin']::text[])
  and exists (
    select 1 from public.leads l
    where l.id = payments.lead_id
      and l.organization_id = payments.organization_id
  )
  and (
    enrollment_id is null
    or exists (
      select 1 from public.enrollments e
      where e.id = payments.enrollment_id
        and e.organization_id = payments.organization_id
        and e.lead_id = payments.lead_id
    )
  )
)
with check (
  public.has_organization_role(organization_id, array['owner','admin']::text[])
  and exists (
    select 1 from public.leads l
    where l.id = payments.lead_id
      and l.organization_id = payments.organization_id
  )
  and (
    enrollment_id is null
    or exists (
      select 1 from public.enrollments e
      where e.id = payments.enrollment_id
        and e.organization_id = payments.organization_id
        and e.lead_id = payments.lead_id
    )
  )
);

drop policy if exists payments_delete on public.payments;
create policy payments_delete on public.payments for delete to authenticated
using (
  public.has_organization_role(organization_id, array['owner','admin']::text[])
  and exists (
    select 1 from public.leads l
    where l.id = payments.lead_id
      and l.organization_id = payments.organization_id
  )
  and (
    enrollment_id is null
    or exists (
      select 1 from public.enrollments e
      where e.id = payments.enrollment_id
        and e.organization_id = payments.organization_id
        and e.lead_id = payments.lead_id
    )
  )
);

create or replace function public.set_payment_activity_actor_id()
returns trigger
language plpgsql
set search_path = public, auth, pg_temp
as $function$
begin
  if new.actor_type::text = 'human'
     and new.actor_id is null
     and new.activity_type in ('payment_recorded', 'refund_recorded')
     and auth.uid() is not null
  then
    new.actor_id := auth.uid()::text;
  end if;

  return new;
end;
$function$;

revoke all on function public.set_payment_activity_actor_id()
  from public, anon, authenticated;

drop trigger if exists set_payment_activity_actor_id_before_insert
  on public.activities;

create trigger set_payment_activity_actor_id_before_insert
before insert on public.activities
for each row
execute function public.set_payment_activity_actor_id();

commit;
