begin;

create table if not exists public.marketing_audience_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  segment_key text not null,
  captured_on date not null default ((now() at time zone 'utc')::date),
  matched_people integer not null default 0,
  matched_leads integer not null default 0,
  identity_coverage_pct integer not null default 0,
  top_source text,
  top_course text,
  top_location text,
  top_stage text,
  data_truncated boolean not null default false,
  captured_at timestamptz not null default now(),
  constraint marketing_audience_snapshots_segment_nonempty check (nullif(btrim(segment_key), '') is not null),
  constraint marketing_audience_snapshots_people_nonnegative check (matched_people >= 0),
  constraint marketing_audience_snapshots_leads_nonnegative check (matched_leads >= 0),
  constraint marketing_audience_snapshots_identity_range check (identity_coverage_pct between 0 and 100),
  constraint marketing_audience_snapshots_daily_unique unique (organization_id, segment_key, captured_on)
);

create index if not exists marketing_audience_snapshots_org_history_idx
  on public.marketing_audience_snapshots (organization_id, captured_on desc, segment_key);

alter table public.marketing_audience_snapshots enable row level security;

drop policy if exists marketing_audience_snapshots_member_read on public.marketing_audience_snapshots;
create policy marketing_audience_snapshots_member_read
on public.marketing_audience_snapshots
for select
to authenticated
using (public.is_organization_member(organization_id));

revoke all on public.marketing_audience_snapshots from public, anon, authenticated;
grant select on public.marketing_audience_snapshots to authenticated;
grant all on public.marketing_audience_snapshots to service_role;

comment on table public.marketing_audience_snapshots is
'PII-free aggregate history for adaptive Marketing Audience Intelligence. Never stores person IDs, lead IDs, raw contact identifiers, CRM notes, messages, health data, payment data, documents, or provider payloads.';

comment on column public.marketing_audience_snapshots.top_source is 'Aggregate non-sensitive label only.';
comment on column public.marketing_audience_snapshots.top_course is 'Aggregate non-sensitive course label only; sensitive categories are suppressed upstream.';
comment on column public.marketing_audience_snapshots.top_location is 'Aggregate non-sensitive location label only.';
comment on column public.marketing_audience_snapshots.top_stage is 'Aggregate CRM stage label only.';

commit;
