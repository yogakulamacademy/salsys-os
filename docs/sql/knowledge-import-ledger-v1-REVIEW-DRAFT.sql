-- REVIEW DRAFT ONLY. Not a migration. Do not execute on hosted or staging databases.
-- Proposed durable metadata schema, no storage bucket, jobs, functions or runtime grants.
-- Test on a disposable database only after DBA review and authorization.
begin;
create table public.knowledge_import_jobs_v1 (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id),
  requested_by uuid not null references auth.users(id),
  request_session_id uuid not null,
  object_path text not null unique,
  declared_bytes bigint not null check (declared_bytes between 1 and 52428800),
  verified_bytes bigint check (verified_bytes between 1 and 52428800),
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'awaiting_upload' check (status in ('awaiting_upload','queued','processing','completed','failed','cancelled','expired')),
  upload_expires_at timestamptz not null,
  retention_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  check (object_path = organization_id::text || '/' || id::text || '/source.json'),
  check ((verified_bytes is null) = (sha256 is null)),
  check (verified_bytes is null or verified_bytes = declared_bytes),
  check (status not in ('queued','processing','completed') or sha256 is not null),
  check (upload_expires_at > created_at and retention_expires_at >= upload_expires_at)
);
create table public.knowledge_import_entries_v1 (
  organization_id uuid not null,
  job_id uuid not null,
  entry_index integer not null check (entry_index between 0 and 9999),
  status text not null default 'pending' check (status in ('pending','leased','created','invalid','duplicate','failed','cancelled')),
  attempts integer not null default 0 check (attempts between 0 and 5),
  lease_token uuid,
  lease_expires_at timestamptz,
  error_code text check (error_code is null or error_code ~ '^[a-z0-9_]{1,64}$'),
  document_id uuid,
  primary key (organization_id,job_id,entry_index),
  foreign key (organization_id,job_id) references public.knowledge_import_jobs_v1(organization_id,id) on delete cascade,
  check ((status = 'leased') = (lease_token is not null and lease_expires_at is not null)),
  check ((lease_token is null) = (lease_expires_at is null)),
  check ((status = 'created') = (document_id is not null))
);
create index knowledge_import_jobs_v1_org_status on public.knowledge_import_jobs_v1(organization_id,status,created_at);
create index knowledge_import_entries_v1_claim on public.knowledge_import_entries_v1(organization_id,job_id,status,entry_index);
alter table public.knowledge_import_jobs_v1 enable row level security;
alter table public.knowledge_import_entries_v1 enable row level security;
-- Fail closed: no policies or application grants yet. Runtime RPCs require separate review.
revoke all on public.knowledge_import_jobs_v1, public.knowledge_import_entries_v1 from public, anon, authenticated, service_role;
commit;
