-- KB-06A: DRAFT follow-on SQL for the unapplied KB-01B discovery schema.
-- DO NOT apply to Production, Recovery Rehearsal or a customer tenant.
-- Requires KB-01B already installed in an independently approved disposable
-- test database. There is deliberately NO consent-granting application API.
begin;

create table public.knowledge_discovery_site_consents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  hostname text not null
    check (hostname ~ '^[a-z0-9][a-z0-9.-]*[.][a-z]{2,}$'
      and length(hostname) <= 253 and hostname=lower(hostname)),
  purpose text not null default 'website_discovery_review_only'
    check (purpose='website_discovery_review_only'),
  status text not null check (status in ('granted','withdrawn')),
  policy_version text not null check (length(btrim(policy_version)) between 1 and 100),
  granted_by uuid not null,
  granted_at timestamptz not null,
  valid_until timestamptz not null,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,hostname),
  constraint knowledge_discovery_consent_dates_check check (
    valid_until > granted_at and
    (
      (status='granted' and withdrawn_at is null)
      or (status='withdrawn' and withdrawn_at is not null
          and withdrawn_at >= granted_at)
    )
  )
);
create index knowledge_discovery_consent_expiry_idx
  on public.knowledge_discovery_site_consents(valid_until)
  where status='granted';
alter table public.knowledge_discovery_site_consents enable row level security;
revoke all on public.knowledge_discovery_site_consents from public,anon,authenticated;
grant select on public.knowledge_discovery_site_consents to authenticated;
grant all on public.knowledge_discovery_site_consents to service_role;
create policy knowledge_discovery_consent_admin_read
  on public.knowledge_discovery_site_consents for select to authenticated
  using (public.can_manage_organization(organization_id));

-- Reads only an explicitly granted tenant/host/purpose consent. The hostname
-- is parsed from a canonical HTTPS seed URL; credentials, custom ports,
-- non-HTTPS schemes and unexpected suffixes fail closed.
create or replace function public.knowledge_discovery_consent_active_v1(
  p_organization_id uuid,p_seed_url text
) returns boolean language sql stable security invoker
set search_path=public,pg_temp as $function$
  select coalesce(
    p_seed_url ~ '^https://[a-z0-9][a-z0-9.-]*[.][a-z]{2,}(/|$)'
    and exists(
      select 1 from public.knowledge_discovery_site_consents c
      where c.organization_id=p_organization_id
        and c.hostname=substring(p_seed_url from '^https://([a-z0-9.-]+)(/|$)')
        and c.purpose='website_discovery_review_only'
        and c.status='granted'
        and c.granted_at <= clock_timestamp()
        and c.valid_until > clock_timestamp()
        and c.withdrawn_at is null
    ),false);
$function$;
revoke all on function public.knowledge_discovery_consent_active_v1(uuid,text)
  from public,anon,authenticated;
grant execute on function public.knowledge_discovery_consent_active_v1(uuid,text)
  to service_role;

-- Replace the exact KB-01B claim and commit functions with extra consent
-- checks; all canonical quota, lease, RLS and tenant behaviors are preserved.
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

  -- All queued or in-flight jobs with missing/withdrawn/expired consent
  -- are invalidated before any new lease can be issued. This cannot undo
  -- HTTP requests that began before withdrawal.
  update public.knowledge_discovery_jobs j set
    status='cancelled',
    last_error_code='consent_not_active',
    lease_token=null,lease_until=null,finished_at=clock_timestamp()
  where j.status in ('queued','running')
    and not public.knowledge_discovery_consent_active_v1(
      j.organization_id,j.seed_url
    );

  return query
  with candidate as (
    select j.id from public.knowledge_discovery_jobs j
    where (j.status = 'queued' or (j.status = 'running' and j.lease_until < now()))
      and j.attempts < 5 and j.next_allowed_at <= now()
      and public.knowledge_discovery_consent_active_v1(j.organization_id,j.seed_url)
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
  v_consent_id uuid;
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

  -- Lock the matching consent record to serialize with a concurrent
  -- withdrawal. A withdrawal that wins the lock first blocks this commit.
  -- No newly discovered link, metadata or page state is saved after denial.
  select c.id into v_consent_id
    from public.knowledge_discovery_site_consents c
    where c.organization_id=v_job.organization_id
      and c.hostname=substring(v_job.seed_url from '^https://([a-z0-9.-]+)(/|$)')
      and c.purpose='website_discovery_review_only'
      and c.status='granted'
      and c.granted_at <= clock_timestamp()
      and c.valid_until > clock_timestamp()
      and c.withdrawn_at is null
    for share;
  if not found then
    update public.knowledge_discovery_jobs
    set status='cancelled',last_error_code='consent_not_active',
        lease_token=null,lease_until=null,finished_at=clock_timestamp()
    where id=p_job_id and organization_id=p_organization_id;
    return jsonb_build_object('ok',false,'reason','consent_not_active');
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
