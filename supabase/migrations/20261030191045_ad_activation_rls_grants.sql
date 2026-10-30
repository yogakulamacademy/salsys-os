begin;

alter table public.ad_audience_definitions enable row level security;
alter table public.ad_audience_destinations enable row level security;
alter table public.ad_audience_memberships enable row level security;
alter table public.ad_activation_outbox enable row level security;
alter table public.ad_activation_attempts enable row level security;

create policy ad_audience_definitions_member_read
on public.ad_audience_definitions for select to authenticated
using (public.is_organization_member(organization_id));
create policy ad_audience_definitions_admin_insert
on public.ad_audience_definitions for insert to authenticated
with check (public.can_manage_organization(organization_id));
create policy ad_audience_definitions_admin_update
on public.ad_audience_definitions for update to authenticated
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));
create policy ad_audience_definitions_admin_delete
on public.ad_audience_definitions for delete to authenticated
using (public.can_manage_organization(organization_id));

create policy ad_audience_destinations_member_read
on public.ad_audience_destinations for select to authenticated
using (public.is_organization_member(organization_id));
create policy ad_audience_destinations_admin_insert
on public.ad_audience_destinations for insert to authenticated
with check (public.can_manage_organization(organization_id));
create policy ad_audience_destinations_admin_update
on public.ad_audience_destinations for update to authenticated
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));
create policy ad_audience_destinations_admin_delete
on public.ad_audience_destinations for delete to authenticated
using (public.can_manage_organization(organization_id));

create policy ad_audience_memberships_member_read
on public.ad_audience_memberships for select to authenticated
using (public.is_organization_member(organization_id));
create policy ad_activation_outbox_admin_read
on public.ad_activation_outbox for select to authenticated
using (public.can_manage_organization(organization_id));
create policy ad_activation_attempts_admin_read
on public.ad_activation_attempts for select to authenticated
using (public.can_manage_organization(organization_id));

revoke all on public.ad_audience_definitions from public, anon, authenticated;
revoke all on public.ad_audience_destinations from public, anon, authenticated;
revoke all on public.ad_audience_memberships from public, anon, authenticated;
revoke all on public.ad_activation_outbox from public, anon, authenticated;
revoke all on public.ad_activation_attempts from public, anon, authenticated;

grant select, insert, update, delete on public.ad_audience_definitions to authenticated;
grant select, insert, update, delete on public.ad_audience_destinations to authenticated;
grant select on public.ad_audience_memberships to authenticated;
grant select on public.ad_activation_outbox to authenticated;
grant select on public.ad_activation_attempts to authenticated;
grant all on public.ad_audience_definitions to service_role;
grant all on public.ad_audience_destinations to service_role;
grant all on public.ad_audience_memberships to service_role;
grant all on public.ad_activation_outbox to service_role;
grant all on public.ad_activation_attempts to service_role;

revoke all on function public.guard_ad_activation_tenant_v1() from public, anon, authenticated;
grant execute on function public.guard_ad_activation_tenant_v1() to service_role;

commit;
