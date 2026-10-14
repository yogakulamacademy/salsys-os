begin;

-- =============================================================================
-- 051_cross_channel_normalization_regex_fix.sql
--
-- Correct domain-alias regex escaping introduced in migration 050.
--
-- Migration 050 is immutable because it has already been applied. The
-- canonical views call normalize_marketing_source() dynamically, so replacing
-- this helper corrects both canonical read models without rewriting evidence.
-- =============================================================================

create or replace function public.normalize_marketing_source(
  p_value text
)
returns text
language sql
immutable
set search_path = public, pg_temp
as $function$
  with normalized as (
    select lower(
      regexp_replace(
        regexp_replace(
          btrim(coalesce(p_value, '')),
          '^https?://',
          '',
          'i'
        ),
        '^www\.',
        '',
        'i'
      )
    ) as value
  )
  select case
    when value = '' then null

    when value in (
      'ig',
      'instagram'
    )
      or value ~ '(^|.*\.)instagram\.com($|/)'
      then 'instagram'

    when value in (
      'fb',
      'facebook'
    )
      or value ~ '(^|.*\.)facebook\.com($|/)'
      then 'facebook'

    when value in (
      'meta',
      'meta ads',
      'meta_ads'
    )
      then 'meta'

    when value = 'google'
      or value ~ '(^|.*\.)google\.[a-z.]+($|/)'
      then 'google'

    when value in (
      'wa',
      'whatsapp'
    )
      or value ~ '(^|.*\.)whatsapp\.com($|/)'
      or value ~ '^wa\.me($|/)'
      then 'whatsapp'

    when value in (
      'direct',
      '(direct)'
    )
      then 'direct'

    else value
  end
  from normalized;
$function$;

revoke execute
on function public.normalize_marketing_source(text)
from public, anon;

grant execute
on function public.normalize_marketing_source(text)
to authenticated, service_role;

comment on function public.normalize_marketing_source(text) is
  'Normalizes common acquisition/source aliases without mutating original provider evidence.';

commit;
