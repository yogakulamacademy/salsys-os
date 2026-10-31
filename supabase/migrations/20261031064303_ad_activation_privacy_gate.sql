begin;

-- Service-role privacy gate used before audience membership is exported.
-- Conservative rule: any active restriction blocks export; otherwise each of
-- advertising, marketing and personalization must be explicitly granted on
-- the canonical person or linked lead subject. Unknown consent is not enough.
create or replace function public.resolve_ad_activation_privacy_v1(
  p_organization_id uuid,
  p_person_id uuid,
  p_lead_id uuid default null
)
returns jsonb
language sql
stable
set search_path = 'public', 'pg_temp'
as $function$
with subjects(subject_key) as (
  select 'person:' || p_person_id::text
  union all
  select 'lead:' || p_lead_id::text where p_lead_id is not null
),
preferences as (
  select
    pp.purpose_key,
    bool_or(pp.current_decision = 'granted') as has_grant,
    bool_or(pp.current_decision in ('denied','withdrawn','opted_out','limited')) as has_non_grant
  from public.privacy_preferences pp
  join subjects s on s.subject_key = pp.subject_key
  where pp.organization_id = p_organization_id
    and pp.purpose_key in ('advertising','marketing','personalization')
  group by pp.purpose_key
),
restriction as (
  select coalesce(bool_or(
    r.block_ad_exports or r.block_marketing or r.block_profiling or r.restrict_processing
  ), false) as blocked
  from public.privacy_subject_restrictions r
  where r.organization_id = p_organization_id
    and r.active = true
    and (r.person_id = p_person_id or (p_lead_id is not null and r.lead_id = p_lead_id))
),
rollup as (
  select
    coalesce((select blocked from restriction), false) as blocked,
    coalesce((select has_grant and not has_non_grant from preferences where purpose_key='advertising'), false) as advertising_granted,
    coalesce((select has_grant and not has_non_grant from preferences where purpose_key='marketing'), false) as marketing_granted,
    coalesce((select has_grant and not has_non_grant from preferences where purpose_key='personalization'), false) as personalization_granted
)
select jsonb_build_object(
  'eligible', not blocked and advertising_granted and marketing_granted and personalization_granted,
  'block_ad_exports', blocked,
  'advertising', advertising_granted,
  'marketing', marketing_granted,
  'personalization', personalization_granted
)
from rollup;
$function$;

revoke all on function public.resolve_ad_activation_privacy_v1(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.resolve_ad_activation_privacy_v1(uuid, uuid, uuid) to service_role;

commit;
