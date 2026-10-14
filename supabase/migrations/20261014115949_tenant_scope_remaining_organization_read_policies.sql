alter policy accommodation_properties_read
on public.accommodation_properties
using (public.is_crm_user() and public.is_organization_member(organization_id));

alter policy accommodation_rooms_read
on public.accommodation_rooms
using (public.is_crm_user() and public.is_organization_member(organization_id));

alter policy batch_accommodation_types_read
on public.batch_accommodation_types
using (public.is_crm_user() and public.is_organization_member(organization_id));

alter policy course_catalog_sync_runs_read
on public.course_catalog_sync_runs
using (public.is_crm_user() and public.is_organization_member(organization_id));
