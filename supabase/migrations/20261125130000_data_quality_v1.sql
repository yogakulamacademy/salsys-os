-- Data quality, CRM tab for admins (owner-approved mockup, 25 Nov 2026).
-- Read-only JSON for one business: open-enquiry gaps (course, value, owner),
-- identity coverage, course suggestions from the ad each person clicked
-- (when 90%+ of at least 3 others from that ad have one course), the
-- no-course leads with their own words (sorted further in the app), a sample
-- of leads without an owner, and open same-person checks. Test leads and
-- archived leads are left out. Service role only. Value columns are read via
-- jsonb (they predate the tracked migrations).

create or replace function public.data_quality_v1(p_organization_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
with
open_leads as (
  select l.id, coalesce(nullif(btrim(l.display_name), ''), l.lead_code, 'Lead') as name, l.current_stage::text as stage,
         l.current_contact_channel as channel, l.interested_course_id, l.owner_user_id, l.created_at,
         (to_jsonb(l) ->> 'potential_value') as value
  from public.leads l
  where l.organization_id = p_organization_id
    and l.status::text <> 'archived'
    and l.current_stage::text not in ('closed_won', 'enrolled', 'lost', 'unqualified', 'duplicate')
    and not coalesce((l.metadata ->> 'test_lead')::boolean, false)
),
no_course as (select * from open_leads where interested_course_id is null),
last_in as (
  select distinct on (m.lead_id) m.lead_id, left(coalesce(m.body, ''), 160) as body
  from public.messages m
  where m.organization_id = p_organization_id and m.direction = 'inbound'
    and m.lead_id in (select id from no_course)
  order by m.lead_id, m.created_at desc
),
words as (
  select m.lead_id, left(string_agg(coalesce(m.body, ''), E'\n' order by m.created_at), 800) as text
  from public.messages m
  where m.organization_id = p_organization_id and m.direction = 'inbound'
    and m.lead_id in (select id from no_course)
  group by m.lead_id
),
ad_course as (
  select r.ad_id, l.interested_course_id as course_id, count(*) as n
  from public.lead_ad_referrals r
  join public.leads l on l.id = r.lead_id
  where r.organization_id = p_organization_id and l.interested_course_id is not null
  group by r.ad_id, l.interested_course_id
),
ad_best as (
  select distinct on (ad_id) ad_id, course_id, n, sum(n) over (partition by ad_id) as total
  from ad_course
  order by ad_id, n desc
),
ad_suggest as (
  select distinct on (nc.id) nc.id as lead_id, b.course_id, b.n, b.total, r.ad_title
  from no_course nc
  join public.lead_ad_referrals r on r.lead_id = nc.id and r.organization_id = p_organization_id
  join ad_best b on b.ad_id = r.ad_id
  where b.total >= 3 and b.n::numeric / b.total >= 0.9
  order by nc.id, b.n::numeric / b.total desc, b.total desc
),
persons as (
  select count(distinct pl.person_id) as total,
         count(distinct pl.person_id) filter (where exists (
           select 1 from public.person_identifiers i where i.person_id = pl.person_id and i.verified
         )) as verified
  from public.person_leads pl
  where pl.organization_id = p_organization_id
),
conflicts as (
  select c.id, c.lead_id, c.person_id, c.conflict_type, c.detected_at,
         coalesce(cardinality(c.candidate_person_ids), 0) as candidates,
         c.candidate_person_ids[1] as first_candidate,
         c.evidence ->> 'identifier_type' as identifier_type,
         c.evidence ->> 'source_system' as source_system,
         coalesce(nullif(btrim(l.display_name), ''), l.lead_code, 'Lead') as lead_name,
         coalesce((l.metadata ->> 'test_lead')::boolean, false) or l.display_name ilike '%test%' as test_lead
  from public.identity_resolution_conflicts c
  left join public.leads l on l.id = c.lead_id
  where c.organization_id = p_organization_id and c.status = 'open'
)
select jsonb_build_object(
  'open', (select count(*) from open_leads),
  'noCourse', (select count(*) from no_course),
  'noValue', (select count(*) from open_leads where value is null),
  'noOwner', (select count(*) from open_leads where owner_user_id is null),
  'persons', (select total from persons),
  'personsVerified', (select verified from persons),
  'adSuggestions', coalesce((select jsonb_agg(jsonb_build_object(
      'leadId', s.lead_id, 'courseId', s.course_id, 'courseName', co.name, 'n', s.n, 'total', s.total, 'adTitle', s.ad_title
    )) from ad_suggest s join public.courses co on co.id = s.course_id), '[]'::jsonb),
  'noCourseLeads', coalesce((select jsonb_agg(jsonb_build_object(
      'leadId', nc.id, 'name', nc.name, 'stage', nc.stage, 'channel', nc.channel, 'createdAt', nc.created_at,
      'lastIn', li.body, 'words', w.text
    ) order by nc.created_at desc) from no_course nc left join last_in li on li.lead_id = nc.id left join words w on w.lead_id = nc.id), '[]'::jsonb),
  'noOwnerSample', coalesce((select jsonb_agg(x order by x->>'createdAt' desc) from (
      select jsonb_build_object('leadId', o.id, 'name', o.name, 'stage', o.stage, 'channel', o.channel, 'createdAt', o.created_at,
        'course', (select name from public.courses where id = o.interested_course_id)) as x
      from open_leads o where o.owner_user_id is null order by o.created_at desc limit 100) t), '[]'::jsonb),
  'conflicts', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'leadId', lead_id, 'personId', person_id, 'type', conflict_type, 'detectedAt', detected_at,
      'candidates', candidates, 'firstCandidate', first_candidate, 'identifierType', identifier_type,
      'source', source_system, 'leadName', lead_name, 'testLead', test_lead
    ) order by detected_at desc) from conflicts), '[]'::jsonb)
);
$$;

revoke all on function public.data_quality_v1(uuid) from public, anon, authenticated;
grant execute on function public.data_quality_v1(uuid) to service_role;
