begin;

-- =============================================================================
-- 050_cross_channel_canonical_normalization.sql
--
-- Provider-neutral normalization layer for cross-channel analytics.
--
-- Design rules:
-- - Preserve raw_events, touchpoints, v_person_journey and provider evidence.
-- - Do not rewrite historical source/channel values.
-- - Normalize aliases only in reusable helper functions / canonical views.
-- - Keep interaction channel separate from acquisition source.
-- - Use security_invoker views so existing tenant/RLS controls remain effective.
-- =============================================================================


-- =============================================================================
-- 1. MARKETING SOURCE NORMALIZER
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
        '^www\\.',
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
      or value ~ '(^|.*\\.)instagram\\.com($|/)'
      then 'instagram'

    when value in (
      'fb',
      'facebook'
    )
      or value ~ '(^|.*\\.)facebook\\.com($|/)'
      then 'facebook'

    when value in (
      'meta',
      'meta ads',
      'meta_ads'
    )
      then 'meta'

    when value = 'google'
      or value ~ '(^|.*\\.)google\\.[a-z.]+($|/)'
      then 'google'

    when value in (
      'wa',
      'whatsapp'
    )
      or value ~ '(^|.*\\.)whatsapp\\.com($|/)'
      or value ~ '^wa\\.me($|/)'
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


-- =============================================================================
-- 2. INTERACTION CHANNEL NORMALIZER
-- =============================================================================

create or replace function public.normalize_interaction_channel(
  p_value text
)
returns text
language sql
immutable
set search_path = public, pg_temp
as $function$
  with normalized as (
    select lower(
      btrim(
        coalesce(p_value, '')
      )
    ) as value
  )
  select case
    when value = '' then null

    when value in (
      'web',
      'website'
    )
      then 'website'

    when value in (
      'ig',
      'instagram'
    )
      then 'instagram'

    when value in (
      'wa',
      'whatsapp'
    )
      then 'whatsapp'

    when value in (
      'mail',
      'email'
    )
      then 'email'

    when value in (
      'tel',
      'telephone',
      'phone'
    )
      then 'phone'

    when value in (
      'meta_lead_form',
      'meta lead form',
      'facebook_lead_form',
      'facebook lead form'
    )
      then 'meta_lead_form'

    else value
  end
  from normalized;
$function$;

revoke execute
on function public.normalize_interaction_channel(text)
from public, anon;

grant execute
on function public.normalize_interaction_channel(text)
to authenticated, service_role;

comment on function public.normalize_interaction_channel(text) is
  'Normalizes interaction-channel aliases while keeping channel semantics separate from acquisition source.';


-- =============================================================================
-- 3. CANONICAL TOUCHPOINT READ MODEL
--
-- Original source/platform/channel columns remain unchanged.
-- Canonical fields are additive only.
-- =============================================================================

create or replace view public.v_touchpoints_canonical
with (security_invoker = true)
as
select
  t.*,

  public.normalize_marketing_source(
    coalesce(
      nullif(t.source, ''),
      nullif(t.utm_source, ''),
      nullif(t.platform, '')
    )
  ) as canonical_source,

  public.normalize_marketing_source(
    t.platform
  ) as canonical_platform,

  public.normalize_interaction_channel(
    t.channel::text
  ) as canonical_channel

from public.touchpoints t;

revoke all
on table public.v_touchpoints_canonical
from public, anon;

grant select
on table public.v_touchpoints_canonical
to authenticated, service_role;

comment on view public.v_touchpoints_canonical is
  'Tenant-safe canonical touchpoint read model. Preserves original evidence and adds normalized source/platform/channel fields.';


-- =============================================================================
-- 4. CANONICAL PERSON JOURNEY READ MODEL
--
-- v_person_journey remains the established provider-neutral journey model.
-- This view adds canonical aliases and normalized direction without replacing it.
-- =============================================================================

create or replace view public.v_person_journey_canonical
with (security_invoker = true)
as
select
  j.*,

  public.normalize_marketing_source(
    j.source
  ) as canonical_source,

  public.normalize_interaction_channel(
    j.channel
  ) as canonical_channel,

  case
    when lower(coalesce(j.event_type, '')) = 'message_inbound'
      then 'inbound'

    when lower(coalesce(j.event_type, '')) = 'message_outbound'
      then 'outbound'

    when lower(coalesce(j.metadata ->> 'direction', '')) in (
      'inbound',
      'outbound'
    )
      then lower(j.metadata ->> 'direction')

    else null
  end as canonical_direction

from public.v_person_journey j;

revoke all
on table public.v_person_journey_canonical
from public, anon;

grant select
on table public.v_person_journey_canonical
to authenticated, service_role;

comment on view public.v_person_journey_canonical is
  'Canonical cross-channel journey read model layered over v_person_journey. Original journey evidence remains unchanged.';


commit;
