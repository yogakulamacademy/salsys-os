create or replace function public.seo_is_probable_brand_query(
  p_query_key text,
  p_brand_key text
)
returns boolean
language sql
immutable
strict
set search_path = pg_catalog, pg_temp
as $function$
  select
    length(regexp_replace(p_brand_key, '^www', '')) >= 4
    and (
      position(regexp_replace(p_brand_key, '^www', '') in p_query_key) > 0
      or (
        abs(
          length(p_query_key) -
          length(regexp_replace(p_brand_key, '^www', ''))
        ) <= 2
        and left(p_query_key, 3) =
            left(regexp_replace(p_brand_key, '^www', ''), 3)
        and right(p_query_key, 4) =
            right(regexp_replace(p_brand_key, '^www', ''), 4)
      )
    );
$function$;
