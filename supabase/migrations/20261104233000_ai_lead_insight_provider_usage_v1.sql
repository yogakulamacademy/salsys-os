-- Phase C5b: internal metadata-only Anthropic request ledger.
-- No prompt content, message text, contact details, model output, API
-- credentials, provider request headers or billed USD estimates are saved.
-- Requires explicit feature gating in the server action; schema alone cannot
-- enable the pilot.
create table if not exists public.ai_lead_insight_provider_calls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  lead_id uuid not null,
  requested_by uuid references auth.users(id) on delete set null,
  model_name text not null,
  outcome text not null default 'started',
  http_status integer,
  input_tokens bigint,
  output_tokens bigint,
  cache_creation_input_tokens bigint,
  cache_read_input_tokens bigint,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  elapsed_ms integer,
  constraint ai_lead_insight_provider_calls_tenant_lead_fk
    foreign key (organization_id, lead_id)
    references public.leads(organization_id, id) on delete cascade,
  constraint ai_lead_insight_provider_calls_model_check
    check (length(model_name) between 1 and 120),
  constraint ai_lead_insight_provider_calls_outcome_check
    check (outcome in ('started','provider_completed','http_error','transport_error','invalid_response')),
  constraint ai_lead_insight_provider_calls_timestamp_check
    check ((outcome = 'started' and completed_at is null)
      or (outcome <> 'started' and completed_at is not null)),
  constraint ai_lead_insight_provider_calls_http_check
    check (http_status between 100 and 599),
  constraint ai_lead_insight_provider_calls_elapsed_check
    check (elapsed_ms between 0 and 120000),
  constraint ai_lead_insight_provider_calls_tokens_check
    check (
      (input_tokens is null or input_tokens between 0 and 1000000000)
      and (output_tokens is null or output_tokens between 0 and 1000000000)
      and (cache_creation_input_tokens is null or cache_creation_input_tokens between 0 and 1000000000)
      and (cache_read_input_tokens is null or cache_read_input_tokens between 0 and 1000000000)
    )
);

create index if not exists ai_lead_insight_provider_calls_tenant_started_idx
  on public.ai_lead_insight_provider_calls(organization_id, started_at desc);

alter table public.ai_lead_insight_provider_calls enable row level security;
alter table public.ai_lead_insight_provider_calls force row level security;

revoke all on public.ai_lead_insight_provider_calls from public, anon, authenticated;
grant select, insert, update on public.ai_lead_insight_provider_calls to service_role;

comment on table public.ai_lead_insight_provider_calls is
  'Phase C5b private request metadata; nullable token readings are not billing amounts. Retention approval required before cleanup.';
