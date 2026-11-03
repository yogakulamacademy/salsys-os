-- Governed Sales Asset course-scope normalization V1
--
-- Scope values are intentionally human-entered metadata, while CRM course
-- context is canonical code/name data. Normalize conservative, deterministic
-- aliases at comparison time so equivalent 200h/YTT formatting does not fail
-- solely because of punctuation or common abbreviations. Missing context still
-- fails closed, and all other governance checks remain unchanged.

create or replace function public.sales_asset_course_scope_key_v1(p_value text)
returns text
language sql
immutable
set search_path = pg_catalog
as $function$
  select nullif(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            lower(btrim(coalesce(p_value, ''))),
            'yoga[[:space:]_-]+teacher[[:space:]_-]+training',
            'ytt',
            'g'
          ),
          'yttc',
          'ytt',
          'g'
        ),
        'hours?|hrs?',
        'h',
        'g'
      ),
      '[^a-z0-9]+',
      '',
      'g'
    ),
    ''
  );
$function$;

revoke all on function public.sales_asset_course_scope_key_v1(text)
  from public, anon;
grant execute on function public.sales_asset_course_scope_key_v1(text)
  to authenticated, service_role;

create or replace function public.resolve_sales_asset_for_dispatch_v1(
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
  v_course_key text := public.sales_asset_course_scope_key_v1(p_course);
  v_location text := lower(btrim(coalesce(p_location, '')));
begin
  if auth.role() <> 'service_role' then
    raise exception 'Sales asset dispatch resolution is server-only';
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
     or v_asset.revoked_at is not null
     or not v_asset.auto_send_allowed then
    raise exception 'Sales asset is not approved for automatic dispatch';
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

  if cardinality(v_asset.channel_scope) = 0 or not (v_channel = any(v_asset.channel_scope)) then
    raise exception 'Sales asset does not support the requested channel';
  end if;

  if cardinality(v_asset.language_scope) > 0
     and (v_language = '' or not (v_language = any(v_asset.language_scope))) then
    raise exception 'Sales asset does not match the requested language';
  end if;

  if cardinality(v_asset.course_scope) > 0
     and (
       v_course_key is null
       or not exists (
         select 1
         from unnest(v_asset.course_scope) as scope(value)
         where public.sales_asset_course_scope_key_v1(scope.value) = v_course_key
       )
     ) then
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
    'accessibility_alt_text', v_asset.accessibility_alt_text,
    'accessibility_caption', v_asset.accessibility_caption,
    'safe_reference', jsonb_build_object(
      'bucket', v_asset.storage_bucket,
      'path', v_asset.storage_path
    )
  );
end;
$function$;

revoke all on function public.resolve_sales_asset_for_dispatch_v1(uuid,uuid,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.resolve_sales_asset_for_dispatch_v1(uuid,uuid,text,text,text,text)
  to service_role;

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
  v_course_key text := public.sales_asset_course_scope_key_v1(p_course);
  v_location text := lower(nullif(btrim(coalesce(p_location, '')), ''));
  v_language text := lower(nullif(btrim(coalesce(p_language, '')), ''));
  v_limit integer := greatest(1, least(coalesce(p_limit, 5), 8));
  v_now timestamptz := now();
  v_query_expression text;
  v_tsquery tsquery;
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

  if v_query is null then
    return;
  end if;

  select string_agg(token, ' | ' order by token)
  into v_query_expression
  from (
    select distinct token
    from regexp_split_to_table(
      lower(regexp_replace(v_query, '[^[:alnum:]]+', ' ', 'g')),
      '[[:space:]]+'
    ) as token
    where length(token) >= 2
      and token not in (
        'a','an','and','any','are','about','can','could','do','for','from','has','have',
        'i','is','me','more','my','need','of','or','please','see','send','share','show',
        'some','that','the','this','to','want','we','would','you','your'
      )
    order by token
    limit 24
  ) terms;

  if v_query_expression is null then
    return;
  end if;

  v_tsquery := to_tsquery('simple', v_query_expression);

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
    scored.relevance
  from public.sales_assets asset
  cross join lateral (
    select ts_rank_cd(
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
      v_tsquery
    )::numeric as relevance
  ) scored
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
      cardinality(asset.course_scope) = 0
      or (
        v_course_key is not null
        and exists (
          select 1
          from unnest(asset.course_scope) as scope(value)
          where public.sales_asset_course_scope_key_v1(scope.value) = v_course_key
        )
      )
    )
    and (
      cardinality(asset.location_scope) = 0
      or (v_location is not null and v_location = any(asset.location_scope))
    )
    and (
      cardinality(asset.language_scope) = 0
      or (v_language is not null and v_language = any(asset.language_scope))
    )
    and scored.relevance > 0
  order by
    scored.relevance desc,
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
  v_course_key text := public.sales_asset_course_scope_key_v1(p_course);
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
     and (
       v_course_key is null
       or not exists (
         select 1
         from unnest(v_asset.course_scope) as scope(value)
         where public.sales_asset_course_scope_key_v1(scope.value) = v_course_key
       )
     ) then
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

comment on function public.sales_asset_course_scope_key_v1(text) is
  'Deterministic Sales Asset course-scope comparison key. Normalizes punctuation and common hour/YTT aliases only; it is not fuzzy matching.';
comment on function public.resolve_sales_asset_for_dispatch_v1(uuid,uuid,text,text,text,text) is
  'Server-only dispatch-time revalidation with deterministic course-scope normalization. Missing context, revocation, expiry, rights or scope mismatch still fail closed.';
comment on function public.search_sales_assets_for_copilot_v1(uuid,text,text,text,text,text,integer) is
  'Human-review discovery for approved current sales assets with deterministic course-scope normalization. Missing scoped context still fails closed; returns safe metadata only.';
comment on function public.resolve_sales_asset_for_human_dispatch_v1(uuid,uuid,text,text,text,text) is
  'Server-only human-dispatch revalidation with deterministic course-scope normalization. Manual use still requires current rights, validity, tenant, scope and private object existence.';
