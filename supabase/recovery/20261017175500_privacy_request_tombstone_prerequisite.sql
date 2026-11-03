-- Cold-recovery compatibility only.
--
-- The production Oct-17 privacy/compliance sequence created consent purposes,
-- consent receipts, current preferences, subject restrictions, data-subject
-- requests and search tombstones before later intelligence/OpenSearch migrations
-- consumed those contracts. Their creator migrations are absent from Git.
--
-- Reconstruct only the coherent schema required by later migrations. No
-- production rows are copied. Later privacy automation functions/triggers remain
-- the responsibility of their own historical boundaries.
--
-- CI only. Never apply this recovery file directly to current production.

begin;

-- Production migration 20261017164301_privacy_compliance_core_v1 also
-- established the tracking-source privacy contract. Keep these columns here in
-- the consolidated cold-recovery boundary so the later live-closeout health
-- migration sees the same schema without replaying the missing privacy sequence
-- as partially overlapping tables.
alter table public.tracking_sources
  add column if not exists privacy_mode text not null default 'strict',
  add column if not exists honor_gpc boolean not null default true,
  add column if not exists require_consent_for_optional boolean not null default true,
  add column if not exists privacy_notice_version text;

alter table public.tracking_sources
  drop constraint if exists tracking_sources_privacy_mode_check;
alter table public.tracking_sources
  add constraint tracking_sources_privacy_mode_check
  check (privacy_mode in ('strict','balanced','custom'));

create table if not exists public.privacy_processing_purposes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  purpose_key text not null,
  name text not null,
  category text not null check (category = any(array[
    'service_delivery'::text,'security'::text,'analytics'::text,
    'marketing'::text,'advertising'::text,'sale_sharing'::text,
    'personalization'::text,'legal_compliance'::text,'other'::text
  ])),
  lawful_basis text not null check (lawful_basis = any(array[
    'consent'::text,'contract'::text,'legal_obligation'::text,
    'vital_interests'::text,'public_task'::text,'legitimate_interests'::text,
    'opt_out'::text,'other'::text
  ])),
  consent_required boolean not null default false,
  is_optional boolean not null default true,
  honor_gpc boolean not null default false,
  enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,purpose_key)
);

alter table public.privacy_processing_purposes enable row level security;
drop policy if exists privacy_processing_purposes_member_read on public.privacy_processing_purposes;
create policy privacy_processing_purposes_member_read
on public.privacy_processing_purposes
for select
using (
  exists (
    select 1 from public.organization_members m
    where m.organization_id = privacy_processing_purposes.organization_id
      and m.user_id = auth.uid()
      and m.active
  )
);

create table if not exists public.privacy_consent_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  person_id uuid references public.persons(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  anonymous_visitor_id text,
  subject_key text not null,
  purpose_key text not null,
  decision text not null check (decision = any(array[
    'granted'::text,'denied'::text,'withdrawn'::text,'opted_out'::text,'limited'::text
  ])),
  source text not null,
  notice_version text,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  evidence jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (organization_id,purpose_key)
    references public.privacy_processing_purposes(organization_id,purpose_key)
    on delete restrict,
  check (person_id is not null or lead_id is not null or anonymous_visitor_id is not null)
);

create index if not exists idx_privacy_consent_receipts_subject
  on public.privacy_consent_receipts(organization_id,subject_key,purpose_key,occurred_at desc,created_at desc);
create index if not exists idx_privacy_consent_receipts_person
  on public.privacy_consent_receipts(organization_id,person_id,purpose_key,occurred_at desc)
  where person_id is not null;
create index if not exists idx_privacy_consent_receipts_lead
  on public.privacy_consent_receipts(organization_id,lead_id,purpose_key,occurred_at desc)
  where lead_id is not null;
create index if not exists idx_privacy_consent_receipts_visitor
  on public.privacy_consent_receipts(organization_id,anonymous_visitor_id,purpose_key,occurred_at desc)
  where anonymous_visitor_id is not null;

alter table public.privacy_consent_receipts enable row level security;
drop policy if exists privacy_consent_receipts_member_read on public.privacy_consent_receipts;
create policy privacy_consent_receipts_member_read
on public.privacy_consent_receipts
for select
using (
  exists (
    select 1 from public.organization_members m
    where m.organization_id = privacy_consent_receipts.organization_id
      and m.user_id = auth.uid()
      and m.active
  )
);

create table if not exists public.privacy_preferences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subject_key text not null,
  purpose_key text not null,
  current_decision text not null check (current_decision = any(array[
    'granted'::text,'denied'::text,'withdrawn'::text,'opted_out'::text,'limited'::text
  ])),
  latest_receipt_id uuid not null references public.privacy_consent_receipts(id) on delete restrict,
  effective_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (organization_id,subject_key,purpose_key)
);

alter table public.privacy_preferences enable row level security;
drop policy if exists privacy_preferences_member_read on public.privacy_preferences;
create policy privacy_preferences_member_read
on public.privacy_preferences
for select
using (
  exists (
    select 1 from public.organization_members m
    where m.organization_id = privacy_preferences.organization_id
      and m.user_id = auth.uid()
      and m.active
  )
);

create table if not exists public.privacy_data_subject_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_type text not null check (request_type = any(array[
    'access'::text,'correction'::text,'deletion'::text,'restriction'::text,
    'portability'::text,'objection'::text,'opt_out_sale_sharing'::text,
    'limit_sensitive'::text,'withdraw_consent'::text,'grievance'::text,'other'::text
  ])),
  jurisdiction text,
  person_id uuid references public.persons(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  anonymous_visitor_id text,
  requester_email text,
  requester_phone text,
  status text not null default 'received' check (status = any(array[
    'received'::text,'verifying'::text,'in_progress'::text,
    'completed'::text,'denied'::text,'cancelled'::text
  ])),
  verification_status text not null default 'pending' check (verification_status = any(array[
    'pending'::text,'verified'::text,'failed'::text,'not_required'::text
  ])),
  received_at timestamptz not null default now(),
  due_at timestamptz not null default (now() + interval '30 days'),
  completed_at timestamptz,
  denial_reason text,
  export_location text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  verification_method text,
  verified_at timestamptz,
  export_generated_at timestamptz,
  export_hash text,
  export_manifest jsonb not null default '{}'::jsonb
);

create index if not exists idx_privacy_dsr_due
  on public.privacy_data_subject_requests(organization_id,status,due_at)
  where status <> all(array['completed'::text,'denied'::text,'cancelled'::text]);

alter table public.privacy_data_subject_requests enable row level security;
drop policy if exists privacy_data_subject_requests_member_read on public.privacy_data_subject_requests;
create policy privacy_data_subject_requests_member_read
on public.privacy_data_subject_requests
for select
using (
  exists (
    select 1 from public.organization_members m
    where m.organization_id = privacy_data_subject_requests.organization_id
      and m.user_id = auth.uid()
      and m.active
  )
);

create table if not exists public.privacy_subject_restrictions (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  person_id uuid references public.persons(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  anonymous_visitor_id text,
  block_optional_tracking boolean not null default false,
  block_marketing boolean not null default false,
  block_profiling boolean not null default false,
  block_ad_exports boolean not null default false,
  restrict_processing boolean not null default false,
  reason text not null,
  source_request_id uuid references public.privacy_data_subject_requests(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  id uuid primary key default gen_random_uuid(),
  check (person_id is not null or lead_id is not null or anonymous_visitor_id is not null)
);

create unique index if not exists uq_privacy_subject_restrictions_person
  on public.privacy_subject_restrictions(organization_id,person_id)
  where person_id is not null and active;
create unique index if not exists uq_privacy_subject_restrictions_lead
  on public.privacy_subject_restrictions(organization_id,lead_id)
  where lead_id is not null and active;
create unique index if not exists uq_privacy_subject_restrictions_visitor
  on public.privacy_subject_restrictions(organization_id,anonymous_visitor_id)
  where anonymous_visitor_id is not null and active;

alter table public.privacy_subject_restrictions enable row level security;
drop policy if exists privacy_subject_restrictions_member_read on public.privacy_subject_restrictions;
create policy privacy_subject_restrictions_member_read
on public.privacy_subject_restrictions
for select
using (
  exists (
    select 1 from public.organization_members m
    where m.organization_id = privacy_subject_restrictions.organization_id
      and m.user_id = auth.uid()
      and m.active
  )
);

create table if not exists public.privacy_search_tombstones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_id uuid not null references public.privacy_data_subject_requests(id) on delete cascade,
  person_id uuid references public.persons(id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  operation text not null default 'delete' check (operation = 'delete'),
  reason text not null default 'data_subject_erasure',
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique (organization_id,request_id,entity_type,entity_id)
);

create index if not exists idx_privacy_search_tombstones_pending
  on public.privacy_search_tombstones(organization_id,created_at)
  where processed_at is null;

alter table public.privacy_search_tombstones enable row level security;
drop policy if exists privacy_search_tombstones_member_read on public.privacy_search_tombstones;
create policy privacy_search_tombstones_member_read
on public.privacy_search_tombstones
for select
using (
  exists (
    select 1 from public.organization_members m
    where m.organization_id = privacy_search_tombstones.organization_id
      and m.user_id = auth.uid()
      and m.active
  )
);

commit;
