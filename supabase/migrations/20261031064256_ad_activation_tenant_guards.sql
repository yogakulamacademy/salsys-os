begin;

-- Tenant / cross-table integrity guards.
create or replace function public.guard_ad_activation_tenant_v1()
returns trigger
language plpgsql
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_org uuid;
begin
  if tg_table_name = 'ad_audience_destinations' then
    select organization_id into v_org from public.ad_audience_definitions where id = new.audience_id;
    if v_org is distinct from new.organization_id then raise exception 'audience organization mismatch'; end if;
    select organization_id into v_org from public.integration_connections where id = new.connection_id;
    if v_org is distinct from new.organization_id then raise exception 'connection organization mismatch'; end if;
    if new.integration_asset_id is not null then
      select organization_id into v_org from public.integration_assets where id = new.integration_asset_id;
      if v_org is distinct from new.organization_id then raise exception 'integration asset organization mismatch'; end if;
    end if;
  elsif tg_table_name = 'ad_audience_memberships' then
    select organization_id into v_org from public.ad_audience_definitions where id = new.audience_id;
    if v_org is distinct from new.organization_id then raise exception 'audience organization mismatch'; end if;
    select organization_id into v_org from public.persons where id = new.person_id;
    if v_org is distinct from new.organization_id then raise exception 'person organization mismatch'; end if;
    if new.lead_id is not null then
      select organization_id into v_org from public.leads where id = new.lead_id;
      if v_org is distinct from new.organization_id then raise exception 'lead organization mismatch'; end if;
    end if;
  elsif tg_table_name = 'ad_activation_outbox' then
    select organization_id into v_org from public.ad_audience_destinations where id = new.destination_id;
    if v_org is distinct from new.organization_id then raise exception 'destination organization mismatch'; end if;
    select organization_id into v_org from public.ad_audience_definitions where id = new.audience_id;
    if v_org is distinct from new.organization_id then raise exception 'audience organization mismatch'; end if;
    select organization_id into v_org from public.persons where id = new.person_id;
    if v_org is distinct from new.organization_id then raise exception 'person organization mismatch'; end if;
    if new.lead_id is not null then
      select organization_id into v_org from public.leads where id = new.lead_id;
      if v_org is distinct from new.organization_id then raise exception 'lead organization mismatch'; end if;
    end if;
  elsif tg_table_name = 'ad_activation_attempts' then
    select organization_id into v_org from public.ad_activation_outbox where id = new.outbox_id;
    if v_org is distinct from new.organization_id then raise exception 'outbox organization mismatch'; end if;
  end if;
  return new;
end;
$function$;

create trigger ad_audience_destinations_tenant_guard
before insert or update on public.ad_audience_destinations
for each row execute function public.guard_ad_activation_tenant_v1();
create trigger ad_audience_memberships_tenant_guard
before insert or update on public.ad_audience_memberships
for each row execute function public.guard_ad_activation_tenant_v1();
create trigger ad_activation_outbox_tenant_guard
before insert or update on public.ad_activation_outbox
for each row execute function public.guard_ad_activation_tenant_v1();
create trigger ad_activation_attempts_tenant_guard
before insert or update on public.ad_activation_attempts
for each row execute function public.guard_ad_activation_tenant_v1();

commit;
