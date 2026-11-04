-- Phase C / C3: minimal AI insight receipt and human feedback ledger.
-- Private data is deliberately NOT stored: no prompt, conversation body,
-- model prose, customer contact detail, staff note, or provider token.
-- Service-role-only access; no exposed RLS policies are granted.

create table if not exists public.ai_lead_insight_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null,
  requested_by uuid references auth.users(id) on delete set null,
  model_name text not null,
  context_sha256 text not null,
  insight_status text not null,
  intent_level text not null,
  next_action_kind text not null,
  evidence_refs text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  constraint ai_lead_insight_runs_parent_lead_fk
    foreign key (organization_id, lead_id)
    references public.leads(organization_id, id) on delete cascade,
  constraint ai_lead_insight_runs_model_name_check
    check (length(model_name) between 1 and 120),
  constraint ai_lead_insight_runs_sha_check
    check (context_sha256 ~ '^[0-9a-f]{64}$'),
  constraint ai_lead_insight_runs_status_check
    check (insight_status in ('supported','insufficient_evidence')),
  constraint ai_lead_insight_runs_intent_check
    check (intent_level in ('unknown','low','medium','high')),
  constraint ai_lead_insight_runs_action_check
    check (next_action_kind in ('none','human_review','reply','follow_up','verify_payment')),
  constraint ai_lead_insight_runs_refs_check
    check (cardinality(evidence_refs) <= 60),
  constraint ai_lead_insight_runs_tenant_lead_id_uniq
    unique (organization_id, lead_id, id)
);

create index if not exists ai_lead_insight_runs_org_lead_created_idx
  on public.ai_lead_insight_runs(organization_id,lead_id,created_at desc);

create table if not exists public.ai_lead_insight_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  lead_id uuid not null,
  run_id uuid not null,
  reviewed_by uuid not null references auth.users(id) on delete restrict,
  rating text not null,
  issue_codes text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  constraint ai_lead_insight_reviews_run_fk
    foreign key (organization_id, lead_id, run_id)
    references public.ai_lead_insight_runs(organization_id, lead_id, id)
    on delete cascade,
  constraint ai_lead_insight_reviews_rating_check
    check (rating in ('accurate','partially_accurate','inaccurate','unsure')),
  constraint ai_lead_insight_reviews_codes_check
    check (
      cardinality(issue_codes) <= 5
      and issue_codes <@ array[
        'unsupported_claim','wrong_intent','wrong_objection','wrong_next_action',
        'missing_context','outdated_context','privacy_concern','other'
      ]::text[]
    ),
  constraint ai_lead_insight_reviews_once_per_reviewer
    unique (run_id, reviewed_by)
);

create index if not exists ai_lead_insight_reviews_org_created_idx
  on public.ai_lead_insight_reviews(organization_id,created_at desc);

alter table public.ai_lead_insight_runs enable row level security;
alter table public.ai_lead_insight_runs force row level security;
alter table public.ai_lead_insight_reviews enable row level security;
alter table public.ai_lead_insight_reviews force row level security;

-- No SELECT/INSERT/UPDATE/DELETE policy is created for anon/authenticated.
-- The trusted server verifies membership and lead access before using
-- a separately configured service-role Supabase client.
revoke all on table public.ai_lead_insight_runs from public, anon, authenticated;
revoke all on table public.ai_lead_insight_reviews from public, anon, authenticated;
grant select, insert on table public.ai_lead_insight_runs to service_role;
grant select, insert on table public.ai_lead_insight_reviews to service_role;

comment on table public.ai_lead_insight_runs is
  'C3 non-reversible metadata receipt of an AI lead insight; never store message text or output prose.';
comment on table public.ai_lead_insight_reviews is
  'C3 append-only staff quality feedback; one immutable review per staff member per insight receipt.';
