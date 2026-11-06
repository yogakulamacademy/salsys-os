-- KB-01B: DRAFT. Generate a Supabase CLI migration before applying.
-- This file has NOT been executed on production or any other environment.
begin;

create table if not exists public.knowledge_discovery_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null,
  seed_url text not null check (char_length(seed_url) between 12 and 2048),
  max_pages integer not null default 30 check (max_pages between 1 and 50),
  status text not null default 'queued' check (status in ('queued','running','completed','partial','failed','cancelled')),
  attempts integer not null default 0 check (attempts between 0 and 10),
  lease_token uuid,
  lease_until timestamptz,
  next_allowed_at timestamptz not null default now(),
  pages_discovered integer not null default 0,
  pages_fetched integer not null default 0,
  pages_blocked integer not null default 0,
  pages_failed integer not null default 0,
  pages_skipped integer not null default 0,
  last_error_code text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);
create unique index if not exists knowledge_discovery_one_active_job_per_org
  on public.knowledge_discovery_jobs(organization_id) where status in ('queued','running');
create index if not exists knowledge_discovery_jobs_org_created
  on public.knowledge_discovery_jobs(organization_id, created_at desc);
create index if not exists knowledge_discovery_jobs_queue
  on public.knowledge_discovery_jobs(next_allowed_at, created_at)
  where status in ('queued', 'running');

create table if not exists public.knowledge_discovery_pages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  job_id uuid not null,
  url text not null check (char_length(url) between 10 and 2048),
  discovered_from text,
  depth integer not null default 0 check (depth between 0 and 6),
  status text not null default 'discovered' check (status in ('discovered','fetched','blocked','failed','skipped')),
  http_status integer,
  content_type text,
  page_title text,
  failure_code text,
  discovered_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (job_id, url),
  constraint knowledge_discovery_pages_job_fk
    foreign key (job_id, organization_id)
    references public.knowledge_discovery_jobs(id, organization_id) on delete cascade
);
create index if not exists knowledge_discovery_pages_queue
  on public.knowledge_discovery_pages(job_id, status, depth, discovered_at);

alter table public.knowledge_discovery_jobs enable row level security;
alter table public.knowledge_discovery_pages enable row level security;
revoke all on table public.knowledge_discovery_jobs from public, anon, authenticated;
revoke all on table public.knowledge_discovery_pages from public, anon, authenticated;
grant select on public.knowledge_discovery_jobs, public.knowledge_discovery_pages to authenticated;
grant all on public.knowledge_discovery_jobs, public.knowledge_discovery_pages to service_role;

create policy knowledge_discovery_jobs_admin_read on public.knowledge_discovery_jobs
  for select to authenticated using (public.can_manage_organization(organization_id));
create policy knowledge_discovery_pages_admin_read on public.knowledge_discovery_pages
  for select to authenticated using (public.can_manage_organization(organization_id));

create trigger knowledge_discovery_jobs_updated_at
before update on public.knowledge_discovery_jobs
for each row execute function public.set_updated_at();

-- Service-role-only atomic lease: ordinary users cannot invoke this function.
create or replace function public.claim_knowledge_discovery_job_v1()
returns table(job_id uuid, organization_id uuid, seed_url text, max_pages integer, lease_token uuid)
language plpgsql security definer set search_path = public, pg_temp as $function$
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  update public.knowledge_discovery_jobs j set
    status = 'failed', last_error_code = 'max_attempts_exceeded',
    lease_until = null, lease_token = null, finished_at = now()
  where j.status in ('queued','running') and
    (j.status = 'queued' or j.lease_until < now()) and j.attempts >= 5;

  return query
  with candidate as (
    select j.id from public.knowledge_discovery_jobs j
    where (j.status = 'queued' or (j.status = 'running' and j.lease_until < now()))
      and j.attempts < 5 and j.next_allowed_at <= now()
    order by j.created_at for update skip locked limit 1
  )
  update public.knowledge_discovery_jobs j set
    status = 'running',
    attempts = case when j.status = 'running' then j.attempts + 1 else j.attempts end,
    lease_token = gen_random_uuid(),
    lease_until = now() + interval '2 minutes',
    started_at = coalesce(j.started_at, now())
  from candidate c where j.id = c.id
  returning j.id, j.organization_id, j.seed_url, j.max_pages, j.lease_token;
end;
$function$;
revoke all on function public.claim_knowledge_discovery_job_v1() from public, anon, authenticated;
grant execute on function public.claim_knowledge_discovery_job_v1() to service_role;
commit;
