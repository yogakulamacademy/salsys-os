-- ============================================================
-- MIGRATION 027
-- CANONICAL COURSE TRACKING ALIASES + TENANT-SAFE RESOLVER
-- ============================================================

begin;


-- ============================================================
-- 1. COURSE TRACKING ALIASES
-- ============================================================

create table if not exists public.course_tracking_aliases (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id)
    on delete restrict,

  course_id uuid not null
    references public.courses(id)
    on delete cascade,

  source_system text not null default 'website',

  alias_type text not null,

  alias_value text not null,

  normalized_alias_value text not null,

  priority integer not null default 100,

  active boolean not null default true,

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  constraint course_tracking_aliases_source_check
    check (
      nullif(btrim(source_system), '') is not null
    ),

  constraint course_tracking_aliases_type_check
    check (
      alias_type in (
        'tracking_key',
        'page_path'
      )
    ),

  constraint course_tracking_aliases_value_check
    check (
      nullif(btrim(alias_value), '') is not null
    ),

  constraint course_tracking_aliases_normalized_value_check
    check (
      nullif(btrim(normalized_alias_value), '') is not null
    ),

  constraint course_tracking_aliases_priority_check
    check (
      priority >= 0
    ),

  constraint course_tracking_aliases_metadata_check
    check (
      jsonb_typeof(metadata) = 'object'
    )
);


create unique index if not exists
  uq_course_tracking_aliases_org_source_type_value
on public.course_tracking_aliases (
  organization_id,
  source_system,
  alias_type,
  normalized_alias_value
);


create index if not exists
  idx_course_tracking_aliases_course
on public.course_tracking_aliases (
  organization_id,
  course_id
);


create index if not exists
  idx_course_tracking_aliases_lookup
on public.course_tracking_aliases (
  organization_id,
  source_system,
  alias_type,
  normalized_alias_value,
  active,
  priority
);


-- ============================================================
-- 2. ALIAS NORMALIZATION
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
-- 3. SAME-TENANT INTEGRITY
-- ============================================================

create or replace function public.enforce_course_tracking_alias_tenant()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_course_organization_id uuid;
begin

  select c.organization_id
  into v_course_organization_id
  from public.courses c
  where c.id = new.course_id;

  if v_course_organization_id is null then
    raise exception
      'Course % does not exist',
      new.course_id;
  end if;

  if v_course_organization_id <> new.organization_id then
    raise exception
      'Course tracking alias organization mismatch';
  end if;


  new.source_system :=
    lower(
      btrim(
        new.source_system
      )
    );

  new.alias_type :=
    lower(
      btrim(
        new.alias_type
      )
    );

  new.alias_value :=
    btrim(
      new.alias_value
    );

  new.normalized_alias_value :=
    public.normalize_course_tracking_alias(
      new.alias_type,
      new.alias_value
    );

  if new.normalized_alias_value is null then
    raise exception
      'Unable to normalize course tracking alias';
  end if;

  new.updated_at :=
    now();

  return new;

end;
$function$;


drop trigger if exists
  trg_course_tracking_aliases_tenant
on public.course_tracking_aliases;


create trigger trg_course_tracking_aliases_tenant
before insert or update
on public.course_tracking_aliases
for each row
execute function
  public.enforce_course_tracking_alias_tenant();


-- ============================================================
-- 4. RLS
-- ============================================================

alter table public.course_tracking_aliases
enable row level security;


drop policy if exists
  course_tracking_aliases_select
on public.course_tracking_aliases;

create policy course_tracking_aliases_select
on public.course_tracking_aliases
for select
to authenticated
using (
  public.is_organization_member(
    organization_id
  )
);


drop policy if exists
  course_tracking_aliases_insert
on public.course_tracking_aliases;

create policy course_tracking_aliases_insert
on public.course_tracking_aliases
for insert
to authenticated
with check (
  public.can_administer_organization_crm(
    organization_id
  )
);


drop policy if exists
  course_tracking_aliases_update
on public.course_tracking_aliases;

create policy course_tracking_aliases_update
on public.course_tracking_aliases
for update
to authenticated
using (
  public.can_administer_organization_crm(
    organization_id
  )
)
with check (
  public.can_administer_organization_crm(
    organization_id
  )
);


drop policy if exists
  course_tracking_aliases_delete
on public.course_tracking_aliases;

create policy course_tracking_aliases_delete
on public.course_tracking_aliases
for delete
to authenticated
using (
  public.can_administer_organization_crm(
    organization_id
  )
);


-- ============================================================
-- 5. DETERMINISTIC COURSE RESOLVER
--
-- Order:
--   1. tracking-key alias
--   2. page-path alias
--   3. exact canonical course code
--   4. unique external_course_id
--
-- No fuzzy name matching.
-- No ambiguous guessing.
-- ============================================================

create or replace function public.resolve_course_tracking_signal(
  p_organization_id uuid,
  p_source_system text default 'website',
  p_tracking_key text default null,
  p_page_path text default null,
  p_page_url text default null
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
  v_tracking_key text;
  v_page_value text;
  v_page_path text;
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

    -- Direct database/admin execution.
    null;

  elsif v_request_role = 'service_role' then

    -- Trusted server-side execution.
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


  -- ========================================================
  -- 1. TRACKING-KEY ALIAS
  -- ========================================================

  v_tracking_key :=
    public.normalize_course_tracking_alias(
      'tracking_key',
      p_tracking_key
    );


  if v_tracking_key is not null then

    return query

    select
      a.organization_id,
      c.id,
      c.code,
      c.name,
      'alias_tracking_key'::text,
      a.alias_type,
      a.alias_value,
      a.priority

    from public.course_tracking_aliases a

    join public.courses c
      on c.id = a.course_id
     and c.organization_id = a.organization_id

    where a.organization_id = p_organization_id
      and a.source_system = v_source_system
      and a.alias_type = 'tracking_key'
      and a.normalized_alias_value = v_tracking_key
      and a.active = true
      and c.active = true

    order by
      a.priority asc,
      a.id asc

    limit 1;


    if found then
      return;
    end if;

  end if;


  -- ========================================================
  -- 2. PAGE-PATH ALIAS
  -- ========================================================

  v_page_value :=
    coalesce(
      nullif(
        btrim(
          coalesce(
            p_page_path,
            ''
          )
        ),
        ''
      ),

      nullif(
        btrim(
          coalesce(
            p_page_url,
            ''
          )
        ),
        ''
      )
    );


  v_page_path :=
    public.normalize_course_tracking_alias(
      'page_path',
      v_page_value
    );


  if v_page_path is not null then

    return query

    select
      a.organization_id,
      c.id,
      c.code,
      c.name,
      'alias_page_path'::text,
      a.alias_type,
      a.alias_value,
      a.priority

    from public.course_tracking_aliases a

    join public.courses c
      on c.id = a.course_id
     and c.organization_id = a.organization_id

    where a.organization_id = p_organization_id
      and a.source_system = v_source_system
      and a.alias_type = 'page_path'
      and a.normalized_alias_value = v_page_path
      and a.active = true
      and c.active = true

    order by
      a.priority asc,
      a.id asc

    limit 1;


    if found then
      return;
    end if;

  end if;


  -- ========================================================
  -- 3. EXACT CANONICAL COURSE CODE
  -- ========================================================

  if v_tracking_key is not null then

    select c.id
    into v_direct_course_id
    from public.courses c
    where c.organization_id = p_organization_id
      and lower(c.code) = v_tracking_key
      and c.active = true
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
        p_tracking_key,
        900

      from public.courses c

      where c.id = v_direct_course_id
        and c.organization_id = p_organization_id;

      return;

    end if;

  end if;


  -- ========================================================
  -- 4. UNIQUE EXTERNAL COURSE ID
  -- ========================================================

  if v_tracking_key is not null then

    select
      count(*),
      min(c.id::text)::uuid
    into
      v_direct_matches,
      v_direct_course_id

    from public.courses c

    where c.organization_id = p_organization_id
      and c.external_course_id is not null
      and lower(c.external_course_id) = v_tracking_key
      and c.active = true;


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
        p_tracking_key,
        950

      from public.courses c

      where c.id = v_direct_course_id
        and c.organization_id = p_organization_id;

      return;

    end if;

  end if;


  -- Unresolved intentionally returns zero rows.
  return;

end;
$function$;


-- ============================================================
-- 6. FUNCTION PERMISSIONS
-- ============================================================

revoke all
on function public.resolve_course_tracking_signal(
  uuid,
  text,
  text,
  text,
  text
)
from public, anon;


grant execute
on function public.resolve_course_tracking_signal(
  uuid,
  text,
  text,
  text,
  text
)
to authenticated, service_role;


-- ============================================================
-- 7. VERIFIED YOGAKULAM SEED ALIASES
-- ============================================================

with target_org as (
  select id
  from public.organizations
  where slug =
        'yogakulam-academy'
  limit 1
),

seed (
  source_system,
  alias_type,
  alias_value,
  course_code,
  priority
) as (

  values

  (
    'website',
    'tracking_key',
    'online-face-yttc',
    'FACE-YOGA',
    10
  ),

  (
    'website',
    'page_path',
    '/courses/online/online-prenatal-yoga-teacher-training.php',
    'ONLINE-PRENATAL',
    20
  ),

  (
    'website',
    'page_path',
    '/courses/online/online-face-yoga-teacher-training.php',
    'FACE-YOGA',
    20
  ),

  (
    'website',
    'page_path',
    '/courses/online/online-200-hour-yoga-teacher-training.php',
    'ONLINE-200H',
    20
  ),

  (
    'website',
    'page_path',
    '/courses/online/online-nutrition-course.php',
    'NUTRITION',
    20
  ),

  (
    'website',
    'page_path',
    '/courses/online/online-kids-yoga-teacher-training.php',
    'KIDS-YOGA',
    20
  ),

  (
    'website',
    'page_path',
    '/courses/mysore/100-hour-yoga-teacher-training-in-mysore.php',
    '100H-YTT',
    20
  ),

  (
    'website',
    'page_path',
    '/courses/mysore/200-hour-yoga-teacher-training-in-mysore.php',
    '200H-YTT',
    20
  ),

  (
    'website',
    'page_path',
    '/courses/mysore/300-hour-yoga-teacher-training-in-mysore.php',
    '300H-YTT',
    20
  ),

  (
    'website',
    'page_path',
    '/courses/mysore/500-hour-yoga-teacher-training-in-mysore.php',
    '500H-YTT',
    20
  ),

  (
    'website',
    'page_path',
    '/courses/mysore/prenatal-yoga-teacher-training-in-mysore.php',
    '85H-PRENATAL',
    20
  ),

  (
    'website',
    'page_path',
    '/courses/mysore/kundalini-yoga-teacher-training-in-mysore.php',
    '100H-KUNDALINI',
    20
  ),

  (
    'website',
    'page_path',
    '/courses/mysore/sound-healing-meditation-course-level-1-in-mysore.php',
    'SOUND-L1',
    20
  ),

  (
    'website',
    'page_path',
    '/courses/mysore/sound-healing-meditation-master-course-in-mysore.php',
    'SOUND-MASTER',
    20
  ),

  (
    'website',
    'page_path',
    '/courses/mysore/yoga-retreat-in-mysore.php',
    'YOGA-RETREAT',
    20
  ),

  (
    'website',
    'page_path',
    '/courses/kerala/100-hour-yoga-teacher-training-in-kerala.php',
    '100H-YTT',
    20
  ),

  (
    'website',
    'page_path',
    '/courses/kerala/200-hour-yoga-teacher-training-in-kerala.php',
    '200H-YTT',
    20
  ),

  (
    'website',
    'page_path',
    '/courses/kerala/300-hour-yoga-teacher-training-in-kerala.php',
    '300H-YTT',
    20
  ),

  (
    'website',
    'page_path',
    '/courses/kerala/prenatal-yoga-teacher-training-in-kerala.php',
    '85H-PRENATAL',
    20
  ),

  (
    'website',
    'page_path',
    '/courses/kerala/ayurveda-retreat-in-kerala.php',
    'AYURVEDA-RETREAT',
    20
  ),

  (
    'website',
    'page_path',
    '/courses/kerala/sound-healing-meditation-course-level-2-in-kerala.php',
    'SOUND-L2',
    20
  ),

  (
    'website',
    'page_path',
    '/courses/bengaluru/200-hour-weekdays-yoga-teacher-training-in-bengaluru.php',
    '200H-YTT',
    20
  ),

  (
    'website',
    'page_path',
    '/courses/bengaluru/200-hour-weekend-yoga-teacher-training-in-bengaluru.php',
    '200H-YTT',
    20
  ),

  (
    'website',
    'page_path',
    '/courses/bengaluru/prenatal-yoga-teacher-training-in-bengaluru.php',
    '85H-PRENATAL',
    20
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

  s.source_system,

  s.alias_type,

  s.alias_value,

  public.normalize_course_tracking_alias(
    s.alias_type,
    s.alias_value
  ),

  s.priority,

  true,

  jsonb_build_object(
    'seed',
    'migration_027',
    'verified',
    true
  )

from seed s

cross join target_org o

join public.courses c
  on c.organization_id = o.id
 and lower(c.code) = lower(s.course_code)

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