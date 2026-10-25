-- ============================================================
-- MIGRATION 029
-- VERIFIED WEBSITE COURSE CAPTURE VALUE VARIANTS
-- ============================================================

begin;

with target_org as (
  select id
  from public.organizations
  where slug = 'yogakulam-academy'
  limit 1
),
seed(capture_value, course_code) as (
  values
    ('100 Hour Yoga Teacher Training in Kerala', '100H-YTT'),
    ('200 Hour Yoga Teacher Training in Kerala', '200H-YTT'),
    ('200 Hour Yoga Teacher Training in Mysore', '200H-YTT'),
    ('300 Hour Yoga Teacher Training in Kerala', '300H-YTT'),
    ('300 Hour Yoga Teacher Training in Mysore', '300H-YTT'),
    ('500 Hour Yoga Teacher Training in Mysore', '500H-YTT'),
    ('85-Hour Prenatal Yoga Teacher Training in Mysore', '85H-PRENATAL'),
    ('85-Hour Prenatal Yoga Teacher Training in Kerala', '85H-PRENATAL'),
    ('Prenatal & Postnatal Yoga Teacher Training in Mysore', '85H-PRENATAL'),
    ('Prenatal & Postnatal Yoga Teacher Training in Kerala', '85H-PRENATAL')
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
  public.normalize_course_tracking_alias('capture_value', s.capture_value),
  20,
  true,
  jsonb_build_object(
    'seed', 'migration_029',
    'verified_from_live_capture', true
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
  course_id = excluded.course_id,
  alias_value = excluded.alias_value,
  priority = excluded.priority,
  active = true,
  metadata = excluded.metadata,
  updated_at = now();

commit;
