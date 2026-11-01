-- R11-P2 — Catalog Adapter Boundary V1
--
-- Scope:
-- - declare the Education Catalog Sync config schema as provider-aware;
-- - configure the existing Yogakulam production sync capability with its
--   non-secret provider key;
-- - no course, batch, enrollment, sync-run or customer business data changes.

begin;

update public.capability_catalog
set config_schema_version = 2
where code = 'education_catalog_sync';

do $$
declare
  v_organization_id uuid;
  v_existing_provider text;
  v_rows integer;
begin
  select o.id
  into v_organization_id
  from public.organizations o
  where o.slug = 'yogakulam-academy'
    and o.status = 'active'
  limit 1;

  if v_organization_id is null then
    raise exception 'R11_P2_YOGAKULAM_ORGANIZATION_NOT_FOUND';
  end if;

  select nullif(btrim(oc.config->>'provider'), '')
  into v_existing_provider
  from public.organization_capabilities oc
  where oc.organization_id = v_organization_id
    and oc.capability_code = 'education_catalog_sync'
    and oc.enabled = true;

  if not found then
    raise exception 'R11_P2_EDUCATION_CATALOG_SYNC_NOT_ENABLED';
  end if;

  if v_existing_provider is not null
     and v_existing_provider <> 'yogakulam_website' then
    raise exception 'R11_P2_UNEXPECTED_EXISTING_PROVIDER: %', v_existing_provider;
  end if;

  update public.organization_capabilities oc
  set config = jsonb_set(
        coalesce(oc.config, '{}'::jsonb),
        '{provider}',
        to_jsonb('yogakulam_website'::text),
        true
      )
  where oc.organization_id = v_organization_id
    and oc.capability_code = 'education_catalog_sync'
    and oc.enabled = true;

  get diagnostics v_rows = row_count;

  if v_rows <> 1 then
    raise exception 'R11_P2_PROVIDER_CONFIG_UPDATE_COUNT: %', v_rows;
  end if;
end;
$$;

commit;
