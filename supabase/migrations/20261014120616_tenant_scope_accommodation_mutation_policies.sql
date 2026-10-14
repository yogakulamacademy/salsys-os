alter policy accommodation_properties_insert
on public.accommodation_properties
with check (
  public.can_write_crm()
  and public.can_mutate_organization(organization_id)
);

alter policy accommodation_properties_update
on public.accommodation_properties
using (
  public.can_write_crm()
  and public.can_mutate_organization(organization_id)
)
with check (
  public.can_write_crm()
  and public.can_mutate_organization(organization_id)
);

alter policy accommodation_rooms_insert
on public.accommodation_rooms
with check (
  public.can_write_crm()
  and public.can_mutate_organization(organization_id)
);

alter policy accommodation_rooms_update
on public.accommodation_rooms
using (
  public.can_write_crm()
  and public.can_mutate_organization(organization_id)
)
with check (
  public.can_write_crm()
  and public.can_mutate_organization(organization_id)
);

alter policy batch_accommodation_types_insert
on public.batch_accommodation_types
with check (
  public.can_write_crm()
  and public.can_mutate_organization(organization_id)
);

alter policy batch_accommodation_types_update
on public.batch_accommodation_types
using (
  public.can_write_crm()
  and public.can_mutate_organization(organization_id)
)
with check (
  public.can_write_crm()
  and public.can_mutate_organization(organization_id)
);
