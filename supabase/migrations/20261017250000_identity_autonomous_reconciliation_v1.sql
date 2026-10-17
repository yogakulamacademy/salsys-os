begin;

create or replace function public.reconcile_person_after_contact_change_v1()
returns trigger
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_org uuid;
  v_lead uuid;
begin
  v_org := coalesce(new.organization_id,old.organization_id);
  v_lead := coalesce(new.lead_id,old.lead_id);

  if v_org is null or v_lead is null then
    return coalesce(new,old);
  end if;

  if exists(
    select 1 from public.person_leads pl
    where pl.organization_id=v_org and pl.lead_id=v_lead
  ) then
    perform public.resolve_person_for_lead(v_lead,'lead_contact_change');
  end if;

  return coalesce(new,old);
end;
$$;

create or replace function public.reconcile_person_after_session_link_v1()
returns trigger
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
begin
  if new.lead_id is null then
    return new;
  end if;

  if exists(
    select 1 from public.person_leads pl
    where pl.organization_id=new.organization_id and pl.lead_id=new.lead_id
  ) then
    perform public.resolve_person_for_lead(new.lead_id,'web_session_link');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_identity_reconcile_contact_change_v1 on public.lead_contacts;
create trigger trg_identity_reconcile_contact_change_v1
after insert or update of lead_id,contact_type,normalized_value,verified on public.lead_contacts
for each row execute function public.reconcile_person_after_contact_change_v1();

drop trigger if exists trg_identity_reconcile_session_link_v1 on public.web_sessions;
create trigger trg_identity_reconcile_session_link_v1
after insert or update of lead_id on public.web_sessions
for each row
when (new.lead_id is not null)
execute function public.reconcile_person_after_session_link_v1();

create or replace view public.v_identity_resolution_integrity
with (security_invoker=true)
as
select
  o.id organization_id,
  (select count(*) from public.leads l where l.organization_id=o.id and not exists(
    select 1 from public.person_leads pl where pl.organization_id=l.organization_id and pl.lead_id=l.id
  )) leads_without_person,
  (select count(*) from public.person_leads pl join public.persons p on p.id=pl.person_id where pl.organization_id=o.id and p.organization_id<>pl.organization_id) person_link_tenant_mismatches,
  (select count(*) from public.person_identifiers pi join public.persons p on p.id=pi.person_id where pi.organization_id=o.id and p.organization_id<>pi.organization_id) identifier_tenant_mismatches,
  (select count(*) from public.person_sessions ps join public.web_sessions ws on ws.id=ps.web_session_id where ps.organization_id=o.id and ws.organization_id<>ps.organization_id) session_tenant_mismatches,
  (select count(*) from public.identity_resolution_conflicts c where c.organization_id=o.id and c.status='open') open_conflicts,
  (select count(*) from public.identity_resolution_evaluations e where e.organization_id=o.id and e.decision='ambiguous_isolate' and e.created_at>=now()-interval '24 hours') ambiguous_isolations_24h,
  now() checked_at
from public.organizations o;

revoke all on public.v_identity_resolution_integrity from anon,authenticated;
grant select on public.v_identity_resolution_integrity to service_role;

commit;