update public.tracking_sources s
set metadata = coalesce(s.metadata,'{}'::jsonb) || jsonb_build_object(
  'organization_site_id', os.id,
  'public_site_id', os.public_site_id,
  'environment', os.environment,
  'managed_by', 'organization_sites'
),
updated_at = now()
from public.organization_sites os
where s.organization_site_id = os.id
  and s.organization_id = os.organization_id
  and s.source_type = 'website'
  and s.auth_mode = 'origin';