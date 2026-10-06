-- ============================================================
-- MIGRATION 028
-- CAPTURE-VALUE COURSE ALIASES
--
-- Adds deterministic server-side course capture resolution.
--
-- IMPORTANT:
-- - Does not modify leads.interested_course_id.
-- - Does not fuzzy-match course names.
-- - Online 300H remains intentionally unresolved because no
--   canonical Online 300H course currently exists.
-- ============================================================

begin;


-- ============================================================
-- 1. EXTEND ALIAS TYPE
-- ============================================================

alter table public.course_tracking_aliases
drop constraint if exists
  course_tracking_aliases_type_check;


alter table public.course_tracking_aliases
add constraint course_tracking_aliases_type_check
check (
  alias_type in (
    'tracking_key',
    'page_path',
    'capture_value'
  )
);


-- ============================================================
-- 2. EXTEND NORMALIZATION
-- ============================================================

create or replace function public.normalize_course_tracking_alias(
  p_alias_type text,
  p_alias_value text
)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $function$
declare
  v_type text;
  v_value text;
begin

  v_type :=
    lower(
      btrim(
        coalesce(
          p_alias_type,
          ''
        )
      )
    );

  v_value :=
    btrim(
      coalesce(
        p_alias_value,
        ''
      )
    );


  if v_value = '' then
    return null;
  end if;


  if v_type = 'tracking_key' then

    return lower(v_value);


  elsif v_type = 'capture_value' then

    return lower(
      regexp_replace(
        v_value,
        '\s+',
        ' ',
        'g'
      )
    );


  elsif v_type = 'page_path' then

    v_value :=
      regexp_replace(
        v_value,
        '^[a-z][a-z0-9+.-]*://[^/]+',
        '',
        'i'
      );

    v_value :=
      split_part(
        v_value,
        '?',
        1
      );

    v_value :=
      split_part(
        v_value,
        '#',
        1
      );

    v_value :=
      lower(
        btrim(v_value)
      );


    if v_value = '' then
      return null;
    end if;


    if left(v_value, 1) <> '/' then
      v_value :=
        '/' || v_value;
    end if;


    if length(v_value) > 1 then
      v_value :=
        regexp_replace(
          v_value,
          '/+$',
          ''
        );
    end if;


    return v_value;

  end if;


  return null;

end;
$function$;


-- ============================================================
-- 3. CAPTURE-VALUE RESOLVER
--
-- Resolution order:
--
-- 1. explicit capture_value alias
-- 2. exact canonical course code
-- 3. unique external_course_id
-- 4. exact canonical course name
--
-- Never fuzzy-matches.
-- ============================================================

create or replace function public.resolve_course_capture_value(
  p_organization_id uuid,
  p_source_system text default 'website',
  p_capture_value text default null
)
returns table (
  organization_id uuid,
  course_id uuid,
  course_code text,
  course_name text,
  resolution_method text,
  matched_alias_type text,
  matched_alias_value text,
  priority integer
)
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_source_system text;
  v_capture_value text;

  v_direct_course_id uuid;
  v_direct_matches integer;

  v_request_role text;
begin

  if p_organization_id is null then
    return;
  end if;


  -- ========================================================
  -- TENANT AUTHORIZATION
  -- ========================================================

  v_request_role :=
    nullif(
      current_setting(
        'request.jwt.claim.role',
        true
      ),
      ''
    );


  if v_request_role is null then

    -- Direct DB/admin execution.
    null;

  elsif v_request_role = 'service_role' then

    null;

  elsif v_request_role = 'authenticated' then

    if auth.uid() is null
       or not public.is_organization_member(
         p_organization_id
       )
    then
      raise exception
        'Not authorized for organization';
    end if;

  else

    raise exception
      'Not authorized for organization';

  end if;


  v_source_system :=
    lower(
      btrim(
        coalesce(
          p_source_system,
          'website'
        )
      )
    );


  v_capture_value :=
    public.normalize_course_tracking_alias(
      'capture_value',
      p_capture_value
    );


  if v_capture_value is null then
    return;
  end if;


  -- ========================================================
  -- 1. CAPTURE-VALUE ALIAS
  -- ========================================================

  return query

  select
    a.organization_id,
    c.id,
    c.code,
    c.name,
    'alias_capture_value'::text,
    a.alias_type,
    a.alias_value,
    a.priority

  from public.course_tracking_aliases a

  join public.courses c
    on c.id = a.course_id
   and c.organization_id =
       a.organization_id

  where a.organization_id =
        p_organization_id

    and a.source_system =
        v_source_system

    and a.alias_type =
        'capture_value'

    and a.normalized_alias_value =
        v_capture_value

    and a.active = true

    and c.active = true

  order by
    a.priority asc,
    a.id asc

  limit 1;


  if found then
    return;
  end if;


  -- ========================================================
  -- 2. EXACT CANONICAL COURSE CODE
  -- ========================================================

  select c.id
  into v_direct_course_id

  from public.courses c

  where c.organization_id =
        p_organization_id

    and c.active = true

    and lower(
          btrim(c.code)
        ) =
        v_capture_value

  limit 1;


  if v_direct_course_id is not null then

    return query

    select
      c.organization_id,
      c.id,
      c.code,
      c.name,
      'catalog_code'::text,
      null::text,
      p_capture_value,
      900

    from public.courses c

    where c.id =
          v_direct_course_id

      and c.organization_id =
          p_organization_id;

    return;

  end if;


  -- ========================================================
  -- 3. UNIQUE EXTERNAL COURSE ID
  -- ========================================================

  select
    count(*),
    min(c.id::text)::uuid

  into
    v_direct_matches,
    v_direct_course_id

  from public.courses c

  where c.organization_id =
        p_organization_id

    and c.active = true

    and c.external_course_id
        is not null

    and lower(
          btrim(
            c.external_course_id
          )
        ) =
        v_capture_value;


  if v_direct_matches = 1
     and v_direct_course_id is not null
  then

    return query

    select
      c.organization_id,
      c.id,
      c.code,
      c.name,
      'external_course_id'::text,
      null::text,
      p_capture_value,
      950

    from public.courses c

    where c.id =
          v_direct_course_id

      and c.organization_id =
          p_organization_id;

    return;

  end if;


  -- ========================================================
  -- 4. EXACT CANONICAL COURSE NAME
  -- ========================================================

  select
    count(*),
    min(c.id::text)::uuid

  into
    v_direct_matches,
    v_direct_course_id

  from public.courses c

  where c.organization_id =
        p_organization_id

    and c.active = true

    and lower(
          regexp_replace(
            btrim(c.name),
            '\s+',
            ' ',
            'g'
          )
        ) =
        v_capture_value;


  if v_direct_matches = 1
     and v_direct_course_id is not null
  then

    return query

    select
      c.organization_id,
      c.id,
      c.code,
      c.name,
      'catalog_name'::text,
      null::text,
      p_capture_value,
      975

    from public.courses c

    where c.id =
          v_direct_course_id

      and c.organization_id =
          p_organization_id;

    return;

  end if;


  return;

end;
$function$;


-- ============================================================
-- 4. FUNCTION PERMISSIONS
-- ============================================================

revoke all
on function public.resolve_course_capture_value(
  uuid,
  text,
  text
)
from public, anon;


grant execute
on function public.resolve_course_capture_value(
  uuid,
  text,
  text
)
to authenticated, service_role;


-- ============================================================
-- 5. VERIFIED YOGAKULAM CAPTURE ALIASES
-- ============================================================

with target_org as (
  select id
  from public.organizations
  where slug = 'yogakulam-academy'
  limit 1
),

seed (
  capture_value,
  course_code
) as (

  values

  (
    '100 Hour Yoga Teacher Training Kerala',
    '100H-YTT'
  ),

  (
    '200 Hour Yoga Teacher Training Kerala',
    '200H-YTT'
  ),

  (
    '200 Hour Yoga Teacher Training Mysore',
    '200H-YTT'
  ),

  (
    '300 Hour Yoga Teacher Training Kerala',
    '300H-YTT'
  ),

  (
    '300 Hour Yoga Teacher Training Mysore',
    '300H-YTT'
  ),

  (
    '500 Hour Yoga Teacher Training Mysore',
    '500H-YTT'
  ),

  (
    'Prenatal & Postnatal Yoga Teacher Training Kerala',
    '85H-PRENATAL'
  ),

  (
    'Online Prenatal & Postnatal Yoga Teacher Training',
    'ONLINE-PRENATAL'
  ),

  (
    'Online Face Yoga Teacher Training',
    'FACE-YOGA'
  ),

  (
    'Online Kids Yoga Teacher Training',
    'KIDS-YOGA'
  ),

  (
    'Online Nutrition Programme',
    'NUTRITION'
  ),

  (
    'Sound Healing Meditation Yoga Teacher Training Level-1 Mysore',
    'SOUND-L1'
  )
)

insert into public.course_tracking_aliases (
  organization_id,
  course_id,
  source_system,
  alias_type,
  alias_value,
  normalized_alias_value,
  priority,
  active,
  metadata
)

select
  o.id,

  c.id,

  'website',

  'capture_value',

  s.capture_value,

  public.normalize_course_tracking_alias(
    'capture_value',
    s.capture_value
  ),

  20,

  true,

  jsonb_build_object(
    'seed',
    'migration_028',
    'verified',
    true
  )

from seed s

cross join target_org o

join public.courses c
  on c.organization_id = o.id
 and lower(c.code) =
     lower(s.course_code)

on conflict (
  organization_id,
  source_system,
  alias_type,
  normalized_alias_value
)

do update set

  course_id =
    excluded.course_id,

  alias_value =
    excluded.alias_value,

  priority =
    excluded.priority,

  active =
    true,

  metadata =
    excluded.metadata,

  updated_at =
    now();


commit;