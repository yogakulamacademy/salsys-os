-- KB-01B: DRAFT. Generate a Supabase CLI migration before applying.
-- This file has NOT been executed on production or any other environment.
begin;

-- KB-01H: website owner proof is required for discovery; store hash only.
create table if not exists public.knowledge_discovery_domain_verifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  hostname text not null check (char_length(hostname) between 4 and 253 and hostname = lower(hostname)),
  challenge_hash text not null check (length(challenge_hash) = 64 and challenge_hash ~ '^[0-9a-f]+$'),
  created_by uuid not null,
  issued_at timestamptz not null default now(),
  last_check_at timestamptz,
  challenge_expires_at timestamptz not null,
  verified_at timestamptz,
  verified_until timestamptz,
  unique (organization_id, hostname),
  constraint knowledge_discovery_proof_dates_check check (
    (verified_at is null and verified_until is null)
    or (verified_at is not null and verified_until is not null and verified_until > verified_at)
  )
);
create index if not exists knowledge_discovery_proof_expires
  on public.knowledge_discovery_domain_verifications(verified_until)
  where verified_until is not null;
alter table public.knowledge_discovery_domain_verifications enable row level security;
revoke all on public.knowledge_discovery_domain_verifications from public, anon, authenticated;
grant select on public.knowledge_discovery_domain_verifications to authenticated;
grant all on public.knowledge_discovery_domain_verifications to service_role;
create policy knowledge_discovery_proof_admin_read
  on public.knowledge_discovery_domain_verifications for select to authenticated
  using (public.can_manage_organization(organization_id));

-- KB-01I: both ownership rate limits are transactional, not racy read/then-write API checks.
-- Only the service role can invoke these functions. RLS remains enabled and
-- no public/anonymous/authenticated write grants are added.
create or replace function public.issue_knowledge_discovery_domain_challenge_v1(
  p_organization_id uuid,
  p_hostname text,
  p_created_by uuid,
  p_challenge_hash text
)
returns timestamptz
language plpgsql security invoker
set search_path = public, pg_temp as $function$
declare
  v_issued timestamptz;
  v_verified_until timestamptz;
  v_now timestamptz := clock_timestamp();
  v_expiry timestamptz := v_now + interval '24 hours';
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  -- Serialize even when there is no existing row to lock.
  perform pg_advisory_xact_lock(hashtextextended(
    p_organization_id::text || ':' || p_hostname, 20261106));

  select issued_at, verified_until into v_issued, v_verified_until
  from public.knowledge_discovery_domain_verifications
  where organization_id = p_organization_id and hostname = p_hostname
  for update;

  if v_verified_until > v_now then
    raise exception 'domain_already_verified' using errcode = 'P0001';
  end if;
  if v_issued > v_now - interval '5 minutes' then
    raise exception 'domain_challenge_cooldown' using errcode = 'P0001';
  end if;

  insert into public.knowledge_discovery_domain_verifications (
    organization_id, hostname, created_by, challenge_hash,
    issued_at, challenge_expires_at, verified_at, verified_until, last_check_at
  ) values (
    p_organization_id, p_hostname, p_created_by, p_challenge_hash,
    v_now, v_expiry, null, null, null
  )
  on conflict (organization_id, hostname) do update set
    created_by = excluded.created_by,
    challenge_hash = excluded.challenge_hash,
    issued_at = excluded.issued_at,
    challenge_expires_at = excluded.challenge_expires_at,
    verified_at = null,
    verified_until = null,
    last_check_at = null;

  return v_expiry;
end;
$function$;
revoke all on function public.issue_knowledge_discovery_domain_challenge_v1(uuid,text,uuid,text)
  from public, anon, authenticated;
grant execute on function public.issue_knowledge_discovery_domain_challenge_v1(uuid,text,uuid,text)
  to service_role;

create or replace function public.claim_knowledge_discovery_proof_check_v1(
  p_organization_id uuid,
  p_hostname text,
  p_challenge_hash text
)
returns boolean
language plpgsql security invoker
set search_path = public, pg_temp as $function$
declare
  v_updated uuid;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  -- UPDATE row locking serializes simultaneous verify requests. A rejected
  -- request causes no network call and cannot consume additional fetch budget.
  update public.knowledge_discovery_domain_verifications
  set last_check_at = clock_timestamp()
  where organization_id = p_organization_id
    and hostname = p_hostname
    and challenge_hash = p_challenge_hash
    and challenge_expires_at > clock_timestamp()
    and (last_check_at is null or last_check_at <= clock_timestamp() - interval '30 seconds')
  returning id into v_updated;

  return v_updated is not null;
end;
$function$;
revoke all on function public.claim_knowledge_discovery_proof_check_v1(uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.claim_knowledge_discovery_proof_check_v1(uuid,text,text)
  to service_role;

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

-- KB-01E scan frequency gate, enforced atomically for every service-side job insert.
-- Database enforcement prevents repeat/colliding API requests bypassing UI controls.
-- One active scan remains protected by the unique partial index above.
create or replace function public.guard_knowledge_discovery_job_rate_v1()
returns trigger language plpgsql security invoker
set search_path = public, pg_temp as $function$
declare
  v_total_day integer;
  v_latest timestamptz;
begin
  -- Serialize attempts for this organization, including concurrent API requests.
  perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text, 20261106));

  -- Let the active-job unique index raise its standard 23505 error.
  if exists (
    select 1 from public.knowledge_discovery_jobs
    where organization_id = new.organization_id and status in ('queued','running')
  ) then
    return new;
  end if;

  select count(*), max(created_at) into v_total_day, v_latest
  from public.knowledge_discovery_jobs
  where organization_id = new.organization_id
    and created_at > now() - interval '24 hours';

  if v_total_day >= 3 then
    raise exception 'discovery_daily_scan_limit' using errcode = 'P0001';
  end if;
  if v_latest > now() - interval '15 minutes' then
    raise exception 'discovery_scan_cooldown' using errcode = 'P0001';
  end if;
  return new;
end;
$function$;
revoke all on function public.guard_knowledge_discovery_job_rate_v1() from public, anon, authenticated;
create trigger knowledge_discovery_jobs_rate_limit
before insert on public.knowledge_discovery_jobs
for each row execute function public.guard_knowledge_discovery_job_rate_v1();

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
-- Atomic result commit: lock the job before any page or counter mutation.
-- This prevents cancellation/lease replacement from racing with late workers.
create or replace function public.commit_knowledge_discovery_page_v1(
  p_organization_id uuid,
  p_job_id uuid,
  p_page_id uuid,
  p_lease_token uuid,
  p_page_status text,
  p_http_status integer default null,
  p_content_type text default null,
  p_page_title text default null,
  p_failure_code text default null,
  p_links jsonb default '[]'::jsonb,
  p_delay_seconds integer default 2
)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $function$
declare
  v_job public.knowledge_discovery_jobs%rowtype;
  v_link text;
  v_changed integer := 0;
  v_total integer := 0;
  v_fetched integer := 0;
  v_blocked integer := 0;
  v_failed integer := 0;
  v_skipped integer := 0;
  v_pending integer := 0;
  v_result_status text;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if p_page_id is not null and p_page_status not in ('fetched','blocked','failed','skipped') then
    raise exception 'Invalid discovery page status';
  end if;
  if jsonb_typeof(p_links) <> 'array' or jsonb_array_length(p_links) > 80 then
    raise exception 'Discovery link batch is invalid';
  end if;

  select * into v_job from public.knowledge_discovery_jobs
  where id = p_job_id and organization_id = p_organization_id
  for update;
  if not found or v_job.status <> 'running'
     or v_job.lease_token is distinct from p_lease_token
     or v_job.lease_until is null or v_job.lease_until <= now() then
    return jsonb_build_object('ok',false,'reason','inactive_or_stale_lease');
  end if;

  if p_page_id is not null then
    update public.knowledge_discovery_pages
    set status = p_page_status,
        http_status = p_http_status,
        content_type = left(p_content_type,160),
        page_title = left(p_page_title,180),
        failure_code = left(p_failure_code,80),
        processed_at = now()
    where id = p_page_id and organization_id = p_organization_id
      and job_id = p_job_id and status = 'discovered';
    get diagnostics v_changed = row_count;
    if v_changed <> 1 then
      return jsonb_build_object('ok',false,'reason','page_not_pending');
    end if;

    if p_page_status = 'fetched' then
      for v_link in
        select distinct value from jsonb_array_elements_text(p_links) as links(value)
      loop
        if char_length(v_link) between 10 and 2048 then
          select count(*) into v_total from public.knowledge_discovery_pages
            where job_id = p_job_id and organization_id = p_organization_id;
          exit when v_total >= v_job.max_pages;
          insert into public.knowledge_discovery_pages(
            organization_id,job_id,url,discovered_from,depth,status)
          select p_organization_id,p_job_id,v_link,p_url.url,
                 least(6,p_url.depth+1),'discovered'
            from public.knowledge_discovery_pages as p_url
            where p_url.id = p_page_id and p_url.job_id = p_job_id
              and p_url.organization_id = p_organization_id
          on conflict (job_id,url) do nothing;
        end if;
      end loop;
    end if;
  end if;

  select count(*),
    count(*) filter (where status = 'fetched'),
    count(*) filter (where status = 'blocked'),
    count(*) filter (where status = 'failed'),
    count(*) filter (where status = 'skipped'),
    count(*) filter (where status = 'discovered')
  into v_total,v_fetched,v_blocked,v_failed,v_skipped,v_pending
  from public.knowledge_discovery_pages
  where organization_id = p_organization_id and job_id = p_job_id;

  v_result_status := case when v_pending > 0 then 'queued'
    when v_blocked > 0 or v_failed > 0 then 'partial'
    else 'completed' end;
  update public.knowledge_discovery_jobs
  set pages_discovered = v_total, pages_fetched = v_fetched,
      pages_blocked = v_blocked, pages_failed = v_failed,
      pages_skipped = v_skipped, status = v_result_status,
      attempts = 0, lease_token = null, lease_until = null,
      next_allowed_at = now() + make_interval(secs =>
        greatest(2,least(3600,coalesce(p_delay_seconds,2)))),
      finished_at = case when v_pending > 0 then null else now() end
  where id = p_job_id and organization_id = p_organization_id;
  return jsonb_build_object('ok',true,'status',v_result_status,
    'pages_discovered',v_total,'pages_fetched',v_fetched,
    'pages_blocked',v_blocked,'pages_failed',v_failed);
end;
$function$;
revoke all on function public.commit_knowledge_discovery_page_v1(uuid,uuid,uuid,uuid,text,integer,text,text,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.commit_knowledge_discovery_page_v1(uuid,uuid,uuid,uuid,text,integer,text,text,text,jsonb,integer) to service_role;

commit;
