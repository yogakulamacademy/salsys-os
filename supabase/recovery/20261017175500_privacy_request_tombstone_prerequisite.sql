-- Cold-recovery compatibility only.
--
-- The production privacy/compliance sequence created the data-subject request
-- and search-tombstone contracts before the OpenSearch outbox foundation.
-- Those historical creator migrations are absent from Git. Reconstruct the
-- minimum coherent schema required at the 20261017180156 boundary without
-- copying production rows or later request-processing triggers.
--
-- CI only. Never apply this recovery file directly to current production.

begin;

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

drop policy if exists privacy_data_subject_requests_member_read
  on public.privacy_data_subject_requests;
create policy privacy_data_subject_requests_member_read
on public.privacy_data_subject_requests
for select
using (
  exists (
    select 1
    from public.organization_members m
    where m.organization_id = privacy_data_subject_requests.organization_id
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

drop policy if exists privacy_search_tombstones_member_read
  on public.privacy_search_tombstones;
create policy privacy_search_tombstones_member_read
on public.privacy_search_tombstones
for select
using (
  exists (
    select 1
    from public.organization_members m
    where m.organization_id = privacy_search_tombstones.organization_id
      and m.user_id = auth.uid()
      and m.active
  )
);

commit;
