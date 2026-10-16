-- SalsysOS Organization Knowledge V1
-- Tenant-safe, approval-aware knowledge foundation for AI Co-Pilot and future automations.
-- This migration is additive only. It does not enable autonomous messaging.

create table if not exists public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_type text not null default 'manual'
    check (source_type in ('manual','website','pdf','drive','faq','policy','course','crm_reply','other')),
  name text not null,
  source_uri text,
  status text not null default 'active'
    check (status in ('active','disabled','archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);

create index if not exists knowledge_sources_org_status_idx
  on public.knowledge_sources (organization_id, status, updated_at desc);

create table if not exists public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_id uuid,
  title text not null,
  category text not null default 'general',
  status text not null default 'draft'
    check (status in ('draft','review','approved','expired','superseded','archived')),
  content text not null default '',
  version integer not null default 1 check (version > 0),
  valid_from timestamptz,
  valid_until timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  supersedes_document_id uuid,
  source_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  constraint knowledge_documents_validity_check
    check (valid_until is null or valid_from is null or valid_until > valid_from),
  constraint knowledge_documents_source_fk
    foreign key (source_id, organization_id)
    references public.knowledge_sources(id, organization_id)
    on delete set null,
  constraint knowledge_documents_supersedes_fk
    foreign key (supersedes_document_id, organization_id)
    references public.knowledge_documents(id, organization_id)
    on delete set null
);

create index if not exists knowledge_documents_org_status_idx
  on public.knowledge_documents (organization_id, status, category, updated_at desc);

create index if not exists knowledge_documents_org_source_idx
  on public.knowledge_documents (organization_id, source_id, updated_at desc);

create index if not exists knowledge_documents_validity_idx
  on public.knowledge_documents (organization_id, valid_from, valid_until)
  where status = 'approved';

create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  document_id uuid not null,
  chunk_index integer not null check (chunk_index >= 0),
  content text not null check (length(btrim(content)) > 0),
  content_hash text,
  token_count integer check (token_count is null or token_count >= 0),
  metadata jsonb not null default '{}'::jsonb,
  search_vector tsvector generated always as (
    to_tsvector('simple', coalesce(content, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, chunk_index),
  unique (id, organization_id),
  constraint knowledge_chunks_document_fk
    foreign key (document_id, organization_id)
    references public.knowledge_documents(id, organization_id)
    on delete cascade
);

create index if not exists knowledge_chunks_org_document_idx
  on public.knowledge_chunks (organization_id, document_id, chunk_index);

create index if not exists knowledge_chunks_search_idx
  on public.knowledge_chunks using gin (search_vector);

create table if not exists public.knowledge_approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  document_id uuid not null,
  action text not null
    check (action in ('submitted','approved','rejected','expired','superseded','archived')),
  reviewer_id uuid,
  note text,
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  constraint knowledge_approvals_document_fk
    foreign key (document_id, organization_id)
    references public.knowledge_documents(id, organization_id)
    on delete cascade
);

create index if not exists knowledge_approvals_org_document_idx
  on public.knowledge_approvals (organization_id, document_id, created_at desc);

-- Reuse the platform-wide updated_at trigger function.
drop trigger if exists knowledge_sources_set_updated_at on public.knowledge_sources;
create trigger knowledge_sources_set_updated_at
before update on public.knowledge_sources
for each row execute function public.set_updated_at();

drop trigger if exists knowledge_documents_set_updated_at on public.knowledge_documents;
create trigger knowledge_documents_set_updated_at
before update on public.knowledge_documents
for each row execute function public.set_updated_at();

drop trigger if exists knowledge_chunks_set_updated_at on public.knowledge_chunks;
create trigger knowledge_chunks_set_updated_at
before update on public.knowledge_chunks
for each row execute function public.set_updated_at();

-- Row Level Security: every knowledge row belongs to exactly one organization.
alter table public.knowledge_sources enable row level security;
alter table public.knowledge_documents enable row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.knowledge_approvals enable row level security;

drop policy if exists knowledge_sources_read on public.knowledge_sources;
create policy knowledge_sources_read
on public.knowledge_sources
for select
to authenticated
using (
  public.is_crm_user()
  and public.is_organization_member(organization_id)
);

drop policy if exists knowledge_sources_insert on public.knowledge_sources;
create policy knowledge_sources_insert
on public.knowledge_sources
for insert
to authenticated
with check (public.can_manage_organization(organization_id));

drop policy if exists knowledge_sources_update on public.knowledge_sources;
create policy knowledge_sources_update
on public.knowledge_sources
for update
to authenticated
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

drop policy if exists knowledge_sources_delete on public.knowledge_sources;
create policy knowledge_sources_delete
on public.knowledge_sources
for delete
to authenticated
using (public.can_manage_organization(organization_id));

drop policy if exists knowledge_documents_read on public.knowledge_documents;
create policy knowledge_documents_read
on public.knowledge_documents
for select
to authenticated
using (
  public.is_crm_user()
  and public.is_organization_member(organization_id)
);

drop policy if exists knowledge_documents_insert on public.knowledge_documents;
create policy knowledge_documents_insert
on public.knowledge_documents
for insert
to authenticated
with check (public.can_manage_organization(organization_id));

drop policy if exists knowledge_documents_update on public.knowledge_documents;
create policy knowledge_documents_update
on public.knowledge_documents
for update
to authenticated
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

drop policy if exists knowledge_documents_delete on public.knowledge_documents;
create policy knowledge_documents_delete
on public.knowledge_documents
for delete
to authenticated
using (public.can_manage_organization(organization_id));

drop policy if exists knowledge_chunks_read on public.knowledge_chunks;
create policy knowledge_chunks_read
on public.knowledge_chunks
for select
to authenticated
using (
  public.is_crm_user()
  and public.is_organization_member(organization_id)
);

drop policy if exists knowledge_chunks_insert on public.knowledge_chunks;
create policy knowledge_chunks_insert
on public.knowledge_chunks
for insert
to authenticated
with check (public.can_manage_organization(organization_id));

drop policy if exists knowledge_chunks_update on public.knowledge_chunks;
create policy knowledge_chunks_update
on public.knowledge_chunks
for update
to authenticated
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

drop policy if exists knowledge_chunks_delete on public.knowledge_chunks;
create policy knowledge_chunks_delete
on public.knowledge_chunks
for delete
to authenticated
using (public.can_manage_organization(organization_id));

drop policy if exists knowledge_approvals_read on public.knowledge_approvals;
create policy knowledge_approvals_read
on public.knowledge_approvals
for select
to authenticated
using (
  public.is_crm_user()
  and public.is_organization_member(organization_id)
);

drop policy if exists knowledge_approvals_insert on public.knowledge_approvals;
create policy knowledge_approvals_insert
on public.knowledge_approvals
for insert
to authenticated
with check (public.can_manage_organization(organization_id));

-- Approval history is append-only for authenticated users. Service-role maintenance
-- still remains available for controlled migrations/repair operations.

revoke all on table public.knowledge_sources from anon;
revoke all on table public.knowledge_documents from anon;
revoke all on table public.knowledge_chunks from anon;
revoke all on table public.knowledge_approvals from anon;

grant select, insert, update, delete on table public.knowledge_sources to authenticated;
grant select, insert, update, delete on table public.knowledge_documents to authenticated;
grant select, insert, update, delete on table public.knowledge_chunks to authenticated;
grant select, insert on table public.knowledge_approvals to authenticated;

comment on table public.knowledge_sources is
  'Tenant-scoped sources that supply organization knowledge to SalsysOS AI features.';
comment on table public.knowledge_documents is
  'Versioned tenant-scoped knowledge documents with approval and validity lifecycle.';
comment on table public.knowledge_chunks is
  'Tenant-scoped retrieval chunks derived from knowledge documents; lexical search is available in V1.';
comment on table public.knowledge_approvals is
  'Append-only human approval/rejection history for organization knowledge documents.';
