-- Governed Sales Asset Co-Pilot Discovery V1
--
-- Human-review discovery only. This function intentionally returns metadata
-- and asset IDs, never Storage bucket/path references or signed URLs.
-- Provider delivery must still re-resolve the selected asset through
-- resolve_sales_asset_for_dispatch_v1 immediately before sending.

create or replace function public.search_sales_assets_for_copilot_v1(
  p_organization_id uuid,
  p_query text,
  p_channel text,
  p_course text default null,
  p_location text default null,
  p_language text default null,
  p_limit integer default 5
)
returns table (
  asset_id uuid,
  title text,
  description text,
  asset_kind text,
  version integer,
  course_scope text[],
  location_scope text[],
  language_scope text[],
  channel_scope text[],
  auto_send_allowed boolean,
  valid_until timestamptz,
  rights_valid_until timestamptz,
  accessibility_alt_text text,
  accessibility_caption text,
  relevance numeric
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_query text := nullif(btrim(coalesce(p_query, '')), '');
  v_channel text := lower(btrim(coalesce(p_channel, '')));
  v_course text := lower(nullif(btrim(coalesce(p_course, '')), ''));
  v_location text := lower(nullif(btrim(coalesce(p_location, '')), ''));
  v_language text := lower(nullif(btrim(coalesce(p_language, '')), ''));
  v_limit integer := greatest(1, least(coalesce(p_limit, 5), 8));
  v_now timestamptz := now();
begin
  if auth.uid() is null or not public.is_crm_user() then
    raise exception 'Authentication required';
  end if;

  if p_organization_id is null or not public.is_organization_member(p_organization_id) then
    raise exception 'Not authorized to discover sales assets for this workspace';
  end if;

  if v_channel not in ('whatsapp','instagram','email','webchat','sms','other') then
    raise exception 'A supported conversation channel is required';
  end if;

  return query
  select
    asset.id as asset_id,
    asset.title,
    asset.description,
    asset.asset_kind,
    asset.version,
    asset.course_scope,
    asset.location_scope,
    asset.language_scope,
    asset.channel_scope,
    asset.auto_send_allowed,
    asset.valid_until,
    asset.rights_valid_until,
    asset.accessibility_alt_text,
    asset.accessibility_caption,
    case
      when v_query is null then 0::numeric
      else ts_rank_cd(
        to_tsvector(
          'simple',
          concat_ws(
            ' ',
            coalesce(asset.title, ''),
            coalesce(asset.description, ''),
            coalesce(asset.accessibility_alt_text, ''),
            coalesce(asset.accessibility_caption, ''),
            array_to_string(asset.course_scope, ' '),
            array_to_string(asset.location_scope, ' '),
            array_to_string(asset.language_scope, ' '),
            array_to_string(asset.channel_scope, ' ')
          )
        ),
        plainto_tsquery('simple', v_query)
      )::numeric
    end as relevance
  from public.sales_assets asset
  where asset.organization_id = p_organization_id
    and asset.state = 'approved'
    and asset.revoked_at is null
    and asset.rights_status = 'cleared'
    and (asset.rights_valid_until is null or asset.rights_valid_until > v_now)
    and (asset.valid_from is null or asset.valid_from <= v_now)
    and (asset.valid_until is null or asset.valid_until > v_now)
    and (
      cardinality(asset.channel_scope) = 0
      or v_channel = any(asset.channel_scope)
    )
    and (
      v_course is null
      or cardinality(asset.course_scope) = 0
      or v_course = any(asset.course_scope)
    )
    and (
      v_location is null
      or cardinality(asset.location_scope) = 0
      or v_location = any(asset.location_scope)
    )
    and (
      v_language is null
      or cardinality(asset.language_scope) = 0
      or v_language = any(asset.language_scope)
    )
  order by
    relevance desc,
    asset.auto_send_allowed desc,
    asset.updated_at desc,
    asset.id
  limit v_limit;
end;
$function$;

revoke all on function public.search_sales_assets_for_copilot_v1(uuid,text,text,text,text,text,integer)
  from public, anon;
grant execute on function public.search_sales_assets_for_copilot_v1(uuid,text,text,text,text,text,integer)
  to authenticated;

comment on function public.search_sales_assets_for_copilot_v1(uuid,text,text,text,text,text,integer) is
  'Human-review discovery for approved current sales assets. Returns safe metadata only; never Storage references. Provider delivery must use resolve_sales_asset_for_dispatch_v1 immediately before send.';
