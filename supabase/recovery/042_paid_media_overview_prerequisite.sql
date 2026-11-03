-- CI-only historical recovery prerequisite.
-- Reconstructs the production reporting view required by migration 042.
-- Staged only by Migration Replay; never applied to production by this PR.

create or replace view public.v_paid_media_leads_overview as
select
  count(*) as paid_media_leads,
  count(*) filter (where platform = 'google'::text) as google_leads,
  count(*) filter (where platform = 'instagram'::text) as instagram_leads,
  count(*) filter (where platform = 'facebook'::text) as facebook_leads,
  count(*) filter (where platform = 'meta'::text) as meta_unspecified_leads,
  count(*) filter (
    where current_stage = any (
      array[
        'qualified'::lead_stage,
        'high_intent'::lead_stage,
        'payment_pending'::lead_stage,
        'enrolled'::lead_stage
      ]
    )
  ) as qualified_leads,
  count(*) filter (where behaviour_temperature = 'hot'::text) as hot_leads,
  count(*) filter (where has_payment) as paid_leads,
  count(*) filter (where is_enrolled) as enrolled_leads,
  count(*) filter (where campaign_matched) as campaign_matched_leads,
  count(*) filter (where allocated_acquisition_cost is not null) as leads_with_allocated_cost,
  coalesce(sum(revenue_inr), 0::numeric)::numeric(14,2) as revenue_inr,
  coalesce(sum(revenue_usd), 0::numeric)::numeric(14,2) as revenue_usd,
  organization_id
from public.v_paid_media_leads
group by organization_id;
