-- Optional development seed data. Uses fictional leads only.
--
-- The schema is tenant-scoped from migration 007 onward. Seed the fictional
-- course/lead rows inside the canonical development organization created by
-- that migration rather than relying on the retired global courses(code)
-- uniqueness contract.

with seed_organization as (
  select id
  from public.organizations
  where slug = 'yogakulam-academy'
  limit 1
)
insert into public.courses (
  organization_id,
  code,
  name,
  category,
  hours
)
select
  o.id,
  v.code,
  v.name,
  v.category,
  v.hours
from seed_organization o
cross join (
  values
    ('YTT-200'::text, '200-Hour Yoga Teacher Training'::text, 'Yoga Teacher Training'::text, 200::integer),
    ('YTT-300'::text, '300-Hour Yoga Teacher Training'::text, 'Yoga Teacher Training'::text, 300::integer),
    ('PRENATAL-85'::text, '85-Hour Prenatal & Postnatal Yoga Teacher Training'::text, 'Prenatal'::text, 85::integer),
    ('SOUND-L1'::text, 'Sound Healing Teacher Training - Level 1'::text, 'Sound Healing'::text, null::integer)
) as v(code, name, category, hours)
on conflict (organization_id, code) do nothing;

insert into public.campaigns (platform, external_campaign_id, name, source, medium, objective)
values
  ('google_ads', 'demo-google-001', 'Demo 200H Search', 'google', 'cpc', 'lead_generation'),
  ('meta_ads', 'demo-meta-001', 'Demo Instagram Testimonials', 'instagram', 'paid_social', 'messages')
on conflict (platform, external_campaign_id) do nothing;

-- Add fictional leads
with seed_organization as (
  select id
  from public.organizations
  where slug = 'yogakulam-academy'
  limit 1
),
course_200 as (
  select c.id
  from public.courses c
  join seed_organization o
    on o.id = c.organization_id
  where c.code = 'YTT-200'
  limit 1
)
insert into public.leads (
  organization_id,
  first_name,
  last_name,
  display_name,
  current_stage,
  intent,
  interested_course_id,
  preferred_location,
  country,
  lead_creation_channel,
  current_contact_channel,
  next_followup_at
)
select
  o.id,
  v.first_name,
  v.last_name,
  v.display_name,
  v.current_stage,
  v.intent,
  (select id from course_200),
  v.preferred_location,
  v.country,
  v.lead_creation_channel,
  v.current_contact_channel,
  v.next_followup_at
from seed_organization o
cross join (
  values
    (
      'Maya'::text,
      'Keller'::text,
      'Maya Keller'::text,
      'qualified'::public.lead_stage,
      'medium'::public.intent_level,
      'Mysore'::text,
      'Germany'::text,
      'instagram'::public.contact_channel,
      'instagram'::public.contact_channel,
      now() + interval '1 day'
    ),
    (
      'Daniel'::text,
      'Reed'::text,
      'Daniel Reed'::text,
      'high_intent'::public.lead_stage,
      'high'::public.intent_level,
      'Mysore'::text,
      'United Kingdom'::text,
      'whatsapp'::public.contact_channel,
      'whatsapp'::public.contact_channel,
      now() + interval '4 hours'
    ),
    (
      'Sofia'::text,
      'Martin'::text,
      'Sofia Martin'::text,
      'payment_pending'::public.lead_stage,
      'very_high'::public.intent_level,
      'Kerala'::text,
      'France'::text,
      'website'::public.contact_channel,
      'whatsapp'::public.contact_channel,
      now() + interval '2 hours'
    )
) as v(
  first_name,
  last_name,
  display_name,
  current_stage,
  intent,
  preferred_location,
  country,
  lead_creation_channel,
  current_contact_channel,
  next_followup_at
);
