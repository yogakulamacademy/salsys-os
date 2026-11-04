-- Phase C5e: append-only draft references for human pilot release review.
-- Does NOT grant or alter ai_lead_insight_pilot_approvals.
-- Owner-submitted references are pointers to separately secured evidence,
-- not evidence content and not authorization to enable the model.
create table if not exists public.ai_lead_insight_review_packet_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  authored_by uuid not null references auth.users(id) on delete restrict,
  policy_version text not null default 'lead_insight_pilot_v1'
    check (policy_version = 'lead_insight_pilot_v1'),
  privacy_ref text,
  retention_ref text,
  provider_budget_ref text,
  quality_review_ref text,
  created_at timestamptz not null default now(),
  constraint ai_lead_insight_draft_refs_length_check check (
    (privacy_ref is null or length(privacy_ref) between 8 and 100)
    and (retention_ref is null or length(retention_ref) between 8 and 100)
    and (provider_budget_ref is null or length(provider_budget_ref) between 8 and 100)
    and (quality_review_ref is null or length(quality_review_ref) between 8 and 100)
  )
);

create index if not exists ai_lead_insight_review_packet_drafts_latest_idx
  on public.ai_lead_insight_review_packet_drafts (organization_id, created_at desc, id desc);

alter table public.ai_lead_insight_review_packet_drafts enable row level security;
alter table public.ai_lead_insight_review_packet_drafts force row level security;

revoke all on public.ai_lead_insight_review_packet_drafts from public, anon, authenticated;
grant select, insert on public.ai_lead_insight_review_packet_drafts to service_role;

comment on table public.ai_lead_insight_review_packet_drafts is
  'C5e owner-only append-only working references. Never activates AI, never marks approvals or permits quota reservation.';
