-- Governed Sales Asset Human Dispatch Preflight V1
--
-- Human-selected media needs the same current-state checks as automation, but
-- manual use must not require auto_send_allowed. This server-only resolver
-- returns a private Storage reference for server transport preparation only.
-- The browser must receive sanitized metadata, never safe_reference.

create or replace function public.resolve_sales_asset_for_human_dispatch_v1(
  p_organization_id uuid,
  p_asset_id uuid,
  p_channel text,
  p_language text default null,
  p_course text default null,
  p_location text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, storage, pg_temp
as $function$
declare
  v_asset public.sales_assets%rowtype;
  v_now timestamptz := now();
  v_channel text := lower(btrim(coalesce(p_channel, '')));
  v_language text := lower(btrim(coalesce(p_language, '')));
  v_course text := lower(btrim(coalesce(p_course, '')));
  v_location text := lower(btrim(coalesce(p_location, '')));
begin
  if auth.role() <> 'service_role' then
    raise exception 'Human sales asset dispatch resolution is server-only';
  end if;

  if p_organization_id is null or p_asset_id is null or v_channel = '' then
    raise exception 'Organization, asset and channel are required';
  end if;

  select * into v_asset
  from public.sales_assets
  where organization_id = p_organization_id
    and id = p_asset_id;

  if not found then
    raise exception 'Sales asset was not found';
  end if;

  if v_asset.state <> 'approved'
     or v_asset.revoked_at is not null then
    raise exception 'Sales asset is not approved for human dispatch';
  end if;

  if v_asset.rights_status <> 'cleared'
     or (v_asset.rights_valid_until is not null and v_asset.rights_valid_until <= v_now) then
    raise exception 'Sales asset rights clearance is not current';
  end if;

  if v_asset.valid_from is not null and v_asset.valid_from > v_now then
    raise exception 'Sales asset is not valid yet';
  end if;

  if v_asset.valid_until is not null and v_asset.valid_until <= v_now then
    raise exception 'Sales asset validity has expired';
  end if;

  if cardinality(v_asset.channel_scope) > 0
     and not (v_channel = any(v_asset.channel_scope)) then
    raise exception 'Sales asset does not support the requested channel';
  end if;

  if cardinality(v_asset.language_scope) > 0
     and (v_language = '' or not (v_language = any(v_asset.language_scope))) then
    raise exception 'Sales asset does not match the requested language';
  end if;

  if cardinality(v_asset.course_scope) > 0
     and (v_course = '' or not (v_course = any(v_asset.course_scope))) then
    raise exception 'Sales asset does not match the requested course';
  end if;

  if cardinality(v_asset.location_scope) > 0
     and (v_location = '' or not (v_location = any(v_asset.location_scope))) then
    raise exception 'Sales asset does not match the requested location';
  end if;

  if not exists (
    select 1
    from storage.objects object
    where object.bucket_id = v_asset.storage_bucket
      and object.name = v_asset.storage_path
  ) then
    raise exception 'Private sales asset object was not found';
  end if;

  return jsonb_build_object(
    'asset_id', v_asset.id,
    'organization_id', v_asset.organization_id,
    'version', v_asset.version,
    'title', v_asset.title,
    'asset_kind', v_asset.asset_kind,
    'mime_type', v_asset.mime_type,
    'size_bytes', v_asset.size_bytes,
    'auto_send_allowed', v_asset.auto_send_allowed,
    'accessibility_alt_text', v_asset.accessibility_alt_text,
    'accessibility_caption', v_asset.accessibility_caption,
    'safe_reference', jsonb_build_object(
      'bucket', v_asset.storage_bucket,
      'path', v_asset.storage_path
    )
  );
end;
$function$;

revoke all on function public.resolve_sales_asset_for_human_dispatch_v1(uuid,uuid,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.resolve_sales_asset_for_human_dispatch_v1(uuid,uuid,text,text,text,text)
  to service_role;

comment on function public.resolve_sales_asset_for_human_dispatch_v1(uuid,uuid,text,text,text,text) is
  'Server-only current-state resolver for a human-selected sales asset. Manual use does not require auto_send_allowed; rights, validity, tenant, scope and private-object existence still fail closed.';
