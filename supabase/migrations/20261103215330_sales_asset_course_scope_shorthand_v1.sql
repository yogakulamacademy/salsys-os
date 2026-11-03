-- Governed Sales Asset course-scope shorthand normalization V1
--
-- Follow-up to the deterministic comparison key. The Sales Asset upload UI
-- historically suggested shorthand such as "200h". Treat only the
-- unambiguous 200/300/500-hour YTT shorthands (and their online-prefixed
-- variants) as YTT aliases. Specialized durations such as 85h prenatal and
-- 100h programs are deliberately not broadened.

create or replace function public.sales_asset_course_scope_key_v1(p_value text)
returns text
language sql
immutable
set search_path = pg_catalog
as $function$
  with normalized as (
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
    ) as scope_key
  )
  select case
    when scope_key ~ '^(online)?(200|300|500)h$' then scope_key || 'ytt'
    else scope_key
  end
  from normalized;
$function$;

revoke all on function public.sales_asset_course_scope_key_v1(text)
  from public, anon;
grant execute on function public.sales_asset_course_scope_key_v1(text)
  to authenticated, service_role;

comment on function public.sales_asset_course_scope_key_v1(text) is
  'Deterministic Sales Asset course-scope key. Normalizes punctuation/common hour/YTT aliases plus unambiguous 200/300/500h YTT shorthand; specialized course durations remain distinct.';
