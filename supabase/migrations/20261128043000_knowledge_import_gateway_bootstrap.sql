-- Install bulk import data structures and client Storage guards. Activation and
-- runtime credentials are provisioned separately. The rejected TUS path is excluded.
begin;
set local lock_timeout = '5s';

do $$
begin
  if exists (select 1 from storage.buckets where id = 'knowledge-import-private-v1') then
    raise exception 'Knowledge import bucket already exists. Verify its provenance before installing the gateway.';
  end if;
end $$;

create table public.knowledge_import_jobs_v1 (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id),
  requested_by uuid not null references auth.users(id),
  request_session_id uuid not null,
  object_path text not null unique,
  declared_bytes bigint not null check (declared_bytes between 1 and 52428800),
  verified_bytes bigint check (verified_bytes between 1 and 52428800),
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  total_entries integer check (total_entries between 1 and 10000),
  status text not null default 'awaiting_upload' check (status in ('awaiting_upload','queued','processing','completed','failed','cancelled','expired')),
  upload_expires_at timestamptz not null,
  retention_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  check (object_path = organization_id::text || '/' || id::text || '/source.json'),
  check ((verified_bytes is null) = (sha256 is null)),
  check (verified_bytes is null or verified_bytes = declared_bytes),
  check (status not in ('queued','processing','completed') or (sha256 is not null and total_entries is not null)),
  check (upload_expires_at > created_at and retention_expires_at >= upload_expires_at)
);
create table public.knowledge_import_entries_v1 (
  organization_id uuid not null,
  job_id uuid not null,
  entry_index integer not null check (entry_index between 0 and 9999),
  status text not null default 'pending' check (status in ('pending','leased','created','invalid','duplicate','failed','cancelled')),
  attempts integer not null default 0 check (attempts between 0 and 5),
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  error_code text check (error_code is null or error_code ~ '^[a-z0-9_]{1,64}$'),
  document_id uuid,
  primary key (organization_id,job_id,entry_index),
  unique (organization_id,document_id),
  foreign key (organization_id,job_id) references public.knowledge_import_jobs_v1(organization_id,id) on delete cascade,
  check ((status = 'leased') = (lease_token is not null and lease_expires_at is not null)),
  check ((lease_token is null) = (lease_expires_at is null)),
  check ((status = 'created') = (document_id is not null))
);
create index knowledge_import_jobs_v1_org_status on public.knowledge_import_jobs_v1(organization_id,status,created_at);
create index knowledge_import_entries_v1_claim on public.knowledge_import_entries_v1(organization_id,job_id,status,available_at,entry_index);
alter table public.knowledge_import_jobs_v1 enable row level security;
alter table public.knowledge_import_entries_v1 enable row level security;
-- Fail closed: no policies or application grants yet. Runtime RPCs require separate review.
revoke all on public.knowledge_import_jobs_v1, public.knowledge_import_entries_v1 from public, anon, authenticated, service_role;

create schema knowledge_import_review;
revoke all on schema knowledge_import_review from public, anon, authenticated, service_role;
alter table public.knowledge_import_entries_v1
  add column payload_sha256 text check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  add column claimed_by_worker name,
  add column completed_by_worker name,
  add column completed_token_sha256 text check(completed_token_sha256 ~ '^[0-9a-f]{64}$'),
  add check ((completed_by_worker is null)=(completed_token_sha256 is null)),
  add check (completed_by_worker is null or status='created'),
  add check (claimed_by_worker is null or status='leased'),
  add foreign key (document_id,organization_id) references public.knowledge_documents(id,organization_id);
-- Lock parent first in every transition. Strict user session only; no service role bypass.
create function knowledge_import_review.lock_job(p_org uuid,p_job uuid)
returns public.knowledge_import_jobs_v1 language plpgsql security invoker
set search_path=pg_catalog,public,auth,pg_temp as $$
declare j public.knowledge_import_jobs_v1%rowtype;
begin
  select * into j from public.knowledge_import_jobs_v1 where organization_id=p_org and id=p_job for update;
  if not found or auth.role() is distinct from 'authenticated' or auth.uid() is distinct from j.requested_by
    or (auth.jwt()->>'session_id') is distinct from j.request_session_id::text then
    raise exception 'import access denied' using errcode='42501';
  end if;
  perform 1 from auth.sessions s join public.tenant_session_bindings b on b.session_id=s.id and b.user_id=s.user_id
    join public.organization_members m on m.user_id=s.user_id and m.organization_id=b.organization_id
    join public.organizations o on o.id=m.organization_id
    where s.id=j.request_session_id and s.user_id=j.requested_by and b.organization_id=p_org
      and m.active=true and m.role in ('owner','admin') and o.status='active'
    for share of s,b,m,o;
  if not found then raise exception 'import access denied' using errcode='42501'; end if;
  return j;
end $$;
create function knowledge_import_review.rollup(p_org uuid,p_job uuid)
returns void language sql security invoker set search_path=pg_catalog,public,pg_temp as $$
  update public.knowledge_import_jobs_v1 j set status=case when exists(
    select 1 from public.knowledge_import_entries_v1 e where e.organization_id=j.organization_id and e.job_id=j.id
      and e.status in ('pending','leased')) then 'processing' else 'completed' end
  where j.organization_id=p_org and j.id=p_job and j.status in ('queued','processing');
$$;
create function knowledge_import_review.claim(p_org uuid,p_job uuid,p_limit integer)
returns table(entry_index integer,lease_token uuid,attempts integer)
language plpgsql security invoker set search_path=pg_catalog,public,pg_temp as $$
declare j public.knowledge_import_jobs_v1%rowtype; t timestamptz;
begin
  j:=knowledge_import_review.lock_job(p_org,p_job); t:=clock_timestamp();
  if p_limit is null or p_limit not between 1 and 50 or j.status not in ('queued','processing') or t>=j.retention_expires_at then return; end if;
  update public.knowledge_import_entries_v1 e set status='failed',lease_token=null,lease_expires_at=null,claimed_by_worker=null,error_code='attempts_exhausted'
    where e.organization_id=p_org and e.job_id=p_job and e.attempts>=5 and
      (e.status='pending' or (e.status='leased' and e.lease_expires_at<=t));
  return query
    with picked as (select e.entry_index from public.knowledge_import_entries_v1 e
      where e.organization_id=p_org and e.job_id=p_job and e.attempts<5 and e.payload_sha256 is not null
      and ((e.status='pending' and e.available_at<=t) or (e.status='leased' and e.lease_expires_at<=t))
      order by e.entry_index limit p_limit for update)
    update public.knowledge_import_entries_v1 e set status='leased',attempts=e.attempts+1,
      lease_token=gen_random_uuid(),lease_expires_at=least(t+interval '120 seconds',j.retention_expires_at),claimed_by_worker=null,error_code=null
    from picked where e.organization_id=p_org and e.job_id=p_job and e.entry_index=picked.entry_index
    returning e.entry_index,e.lease_token,e.attempts;
  perform knowledge_import_review.rollup(p_org,p_job);
end $$;
create function knowledge_import_review.finalize(p_org uuid,p_job uuid,p_index integer,p_token uuid,p_attempt integer,p_payload jsonb)
returns uuid language plpgsql security invoker set search_path=pg_catalog,public,auth,pg_temp as $$
declare j public.knowledge_import_jobs_v1%rowtype; e public.knowledge_import_entries_v1%rowtype; v jsonb; d uuid; t timestamptz;
begin
  j:=knowledge_import_review.lock_job(p_org,p_job); t:=clock_timestamp();
  select * into e from public.knowledge_import_entries_v1 where organization_id=p_org and job_id=p_job and entry_index=p_index for update;
  if not found then raise exception 'entry not found'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' or e.payload_sha256 is null
     or encode(sha256(convert_to(p_payload::text,'UTF8')),'hex')<>e.payload_sha256 then raise exception 'payload mismatch'; end if;
  -- Authorized read-back of durable result after a lost response; never write twice.
  if e.status='created' then return e.document_id; end if;
  if j.status not in ('queued','processing') or t>=j.retention_expires_at or e.status<>'leased'
      or e.claimed_by_worker is not null or p_token is null or e.lease_token is distinct from p_token or e.attempts is distinct from p_attempt or t>=e.lease_expires_at then raise exception 'stale claim'; end if;
  if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('title','category','content','source_name','source_type','source_uri'))
    or length(coalesce(p_payload->>'content','')) not between 10 and 8000 then raise exception 'invalid payload'; end if;
  v:=public.create_source_backed_knowledge_document_v2(p_org,p_payload->>'title',p_payload->>'category',p_payload->>'content',
    p_payload->>'source_name',p_payload->>'source_type',p_payload->>'source_uri',null,null,false);
  d:=(v->>'document_id')::uuid;
  if v->>'status' is distinct from 'draft' or not exists(select 1 from public.knowledge_documents
      where id=d and organization_id=p_org and status='draft' and created_by=j.requested_by) then raise exception 'draft verification failed'; end if;
  update public.knowledge_import_entries_v1 set status='created',document_id=d,lease_token=null,lease_expires_at=null,claimed_by_worker=null,error_code=null
    where organization_id=p_org and job_id=p_job and entry_index=p_index;
  perform knowledge_import_review.rollup(p_org,p_job);
  return d;
end $$;
create function knowledge_import_review.cancel(p_org uuid,p_job uuid)
returns boolean language plpgsql security invoker set search_path=pg_catalog,public,pg_temp as $$
declare j public.knowledge_import_jobs_v1%rowtype;
begin
  j:=knowledge_import_review.lock_job(p_org,p_job);
  if j.status not in ('awaiting_upload','queued','processing') then return false; end if;
  update public.knowledge_import_entries_v1 set status='cancelled',lease_token=null,lease_expires_at=null,claimed_by_worker=null
    where organization_id=p_org and job_id=p_job and status in ('pending','leased');
  update public.knowledge_import_jobs_v1 set status='cancelled' where organization_id=p_org and id=p_job;
  return true;
end $$;
-- Failure settlement requires the live claim, not a caller-supplied retry time.
create function knowledge_import_review.settle_failure(p_org uuid,p_job uuid,p_index integer,p_token uuid,p_attempt integer,p_error_code text)
returns text language plpgsql security invoker set search_path=pg_catalog,public,pg_temp as $$
declare j public.knowledge_import_jobs_v1%rowtype; e public.knowledge_import_entries_v1%rowtype; t timestamptz; next_status text;
begin
  j:=knowledge_import_review.lock_job(p_org,p_job); t:=clock_timestamp();
  select * into e from public.knowledge_import_entries_v1 where organization_id=p_org and job_id=p_job and entry_index=p_index for update;
  if not found or j.status not in ('queued','processing') or t>=j.retention_expires_at or e.status<>'leased'
    or e.claimed_by_worker is not null or p_token is null or e.lease_token is distinct from p_token or e.attempts is distinct from p_attempt
    or e.lease_expires_at is null or t>=e.lease_expires_at then raise exception 'stale claim'; end if;
  -- Only reviewed, non-sensitive machine codes. No arbitrary exception text.
  if p_error_code is null or p_error_code not in ('db_transient','storage_transient','invalid_payload','permanent_failure') then
    raise exception 'unsupported failure code';
  end if;
  next_status:=case when p_error_code in ('db_transient','storage_transient') and e.attempts<5 then 'pending' else 'failed' end;
  update public.knowledge_import_entries_v1 set status=next_status,lease_token=null,lease_expires_at=null,claimed_by_worker=null,
    available_at=case when next_status='pending' then t+make_interval(secs=>30*power(2,e.attempts-1)::integer) else available_at end,
    error_code=p_error_code where organization_id=p_org and job_id=p_job and entry_index=p_index;
  perform knowledge_import_review.rollup(p_org,p_job);
  return next_status;
end $$;
-- Callers hold the job row lock and verify the deadline and authority first.
create function knowledge_import_review.mark_job_expired(p_org uuid,p_job uuid)
returns void language sql security invoker set search_path=pg_catalog,public,pg_temp as $$
  update public.knowledge_import_entries_v1 set status='cancelled',lease_token=null,lease_expires_at=null,claimed_by_worker=null,error_code='job_expired'
    where organization_id=p_org and job_id=p_job and status in ('pending','leased');
  update public.knowledge_import_jobs_v1 set status='expired' where organization_id=p_org and id=p_job;
$$;
-- Metadata expiry only. This is not object deletion or a background sweeper.
create function knowledge_import_review.expire(p_org uuid,p_job uuid)
returns boolean language plpgsql security invoker set search_path=pg_catalog,public,pg_temp as $$
declare j public.knowledge_import_jobs_v1%rowtype; t timestamptz;
begin
  j:=knowledge_import_review.lock_job(p_org,p_job); t:=clock_timestamp();
  if not ((j.status='awaiting_upload' and t>=j.upload_expires_at) or
      (j.status in ('queued','processing') and t>=j.retention_expires_at)) then return false; end if;
  perform knowledge_import_review.mark_job_expired(p_org,p_job);
  return true;
end $$;
-- Explicit tenant resource configuration; no default commercial entitlement.
create table knowledge_import_review.quotas (
  organization_id uuid primary key references public.organizations(id),
  max_active_jobs integer not null check (max_active_jobs between 1 and 100),
  max_reserved_bytes bigint not null check (max_reserved_bytes between 1 and 5368709120)
);
alter table knowledge_import_review.quotas enable row level security;
revoke all on knowledge_import_review.quotas from public,anon,authenticated,service_role;
alter table public.knowledge_import_jobs_v1 add column manifest_sha256 text check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  add column storage_released_at timestamptz,
  add check (storage_released_at is null or status in ('completed','failed','cancelled','expired'));
-- Owner-only review reservation. Session identity comes from the server-owned Auth context.
-- Expiry inputs require a separately approved policy; no storage permission is issued.
create function knowledge_import_review.reserve(p_org uuid,p_job uuid,p_bytes bigint,p_upload_until timestamptz,p_retain_until timestamptz)
returns uuid language plpgsql security invoker set search_path=pg_catalog,public,auth,pg_temp as $$
declare q knowledge_import_review.quotas%rowtype; j public.knowledge_import_jobs_v1%rowtype; v_actor uuid; v_session uuid; t timestamptz; n bigint; b numeric;
begin
  if auth.role() is distinct from 'authenticated' or auth.uid() is null or p_org is null or p_job is null then
    raise exception 'import access denied' using errcode='42501'; end if;
  v_actor:=auth.uid();
  select s.id into v_session from auth.sessions s join public.tenant_session_bindings b on b.session_id=s.id and b.user_id=s.user_id
    join public.organization_members m on m.user_id=s.user_id and m.organization_id=b.organization_id
    join public.organizations o on o.id=m.organization_id
    where s.id::text=auth.jwt()->>'session_id' and s.user_id=v_actor and b.organization_id=p_org
      and m.active=true and m.role in ('owner','admin') and o.status='active' for share of s,b,m,o;
  if not found then raise exception 'import access denied' using errcode='42501'; end if;
  -- A fixed-snapshot transaction can miss a reservation committed while waiting on this lock.
  -- Reject stronger isolation rather than relying on a row lock to refresh an old snapshot.
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'import reservation requires read committed' using errcode='25000';
  end if;
  -- Serialize reservations on the quota row; cleanup also uses quota-first ordering.
  select * into q from knowledge_import_review.quotas where organization_id=p_org for update;
  if not found then raise exception 'import quota not configured'; end if;
  t:=clock_timestamp();
  if p_bytes is null or p_bytes not between 1 and 52428800 or p_upload_until is null or p_retain_until is null
      or p_upload_until<=t or p_retain_until<p_upload_until then raise exception 'invalid reservation'; end if;
  -- No job-row lock here: existing job transitions lock the job before authority rows.
  select * into j from public.knowledge_import_jobs_v1 where id=p_job;
  if found then
    if j.organization_id=p_org and j.requested_by=v_actor and j.request_session_id=v_session
        and j.declared_bytes=p_bytes and j.upload_expires_at=p_upload_until and j.retention_expires_at=p_retain_until then return j.id; end if;
    raise exception 'reservation conflict';
  end if;
  -- Publication begins in a separate transaction before registration can run.
  -- Keep publishing reservations active even after the deadline: a publisher
  -- may already be registering a source, or its outcome may need reconciliation.
  select count(*) filter(where jobs.status in ('queued','processing') or (jobs.status='awaiting_upload' and (
      jobs.upload_expires_at>t or exists(select 1 from knowledge_import_review.gateway_uploads g
        where g.organization_id=jobs.organization_id and g.job_id=jobs.id and g.phase='publishing')))),
    coalesce(sum(jobs.declared_bytes) filter(where jobs.storage_released_at is null),0) into n,b
    from public.knowledge_import_jobs_v1 jobs where jobs.organization_id=p_org;
  -- Retained bytes count all jobs until a separately authorized cleanup receipt is committed.
  if n>=q.max_active_jobs or b+p_bytes>q.max_reserved_bytes then raise exception 'import quota exceeded'; end if;
  insert into public.knowledge_import_jobs_v1(id,organization_id,requested_by,request_session_id,object_path,declared_bytes,upload_expires_at,retention_expires_at,created_at)
    values(p_job,p_org,v_actor,v_session,p_org::text||'/'||p_job::text||'/source.json',p_bytes,p_upload_until,p_retain_until,t);
  return p_job;
end $$;
-- Trusted review caller must obtain the raw digest, byte count and manifest from verified immutable storage.
-- This function checks the complete ledger partition; it does not independently inspect storage bytes.
create function knowledge_import_review.enqueue(p_org uuid,p_job uuid,p_bytes bigint,p_sha text,p_manifest jsonb)
returns text language plpgsql security invoker set search_path=pg_catalog,public,pg_temp as $$
declare j public.knowledge_import_jobs_v1%rowtype; t timestamptz; n integer; h text; item jsonb; idx integer; st text; digest text; seen integer[]:='{}';
begin
  j:=knowledge_import_review.lock_job(p_org,p_job); t:=clock_timestamp();
  if p_bytes is distinct from j.declared_bytes or p_sha is null or p_sha !~ '^[0-9a-f]{64}$'
    or p_manifest is null or jsonb_typeof(p_manifest)<>'array' then raise exception 'invalid manifest'; end if;
  n:=jsonb_array_length(p_manifest);
  if n not between 1 and 10000 or octet_length(p_manifest::text)>2097152 then raise exception 'invalid manifest'; end if;
  h:=encode(sha256(convert_to(p_manifest::text,'UTF8')),'hex');
  if j.manifest_sha256 is not null then
    if j.manifest_sha256=h and j.sha256=p_sha and j.verified_bytes=p_bytes and j.total_entries=n then return j.status; end if;
    raise exception 'manifest conflict';
  end if;
  if j.status<>'awaiting_upload' or t>=j.upload_expires_at or t>=j.retention_expires_at then raise exception 'reservation unavailable'; end if;
  if exists(select 1 from public.knowledge_import_entries_v1 where organization_id=p_org and job_id=p_job) then raise exception 'unexpected existing ledger'; end if;
  -- Validate the whole manifest before any write; no client-controlled approval or payload.
  for item in select value from jsonb_array_elements(p_manifest) loop
    if jsonb_typeof(item)<>'object' then raise exception 'invalid manifest entry'; end if;
    if exists(select 1 from jsonb_object_keys(item) k where k not in ('index','status','payload_sha256'))
      or jsonb_typeof(item->'index') is distinct from 'number' or coalesce(item->>'index','') !~ '^(0|[1-9][0-9]{0,3})$'
      or jsonb_typeof(item->'status') is distinct from 'string' then raise exception 'invalid manifest entry'; end if;
    idx:=(item->>'index')::integer; st:=item->>'status'; digest:=item->>'payload_sha256';
    if idx>=n or idx=any(seen) or st not in ('pending','invalid','duplicate') or
      (st='pending' and (jsonb_typeof(item->'payload_sha256') is distinct from 'string' or digest is null or digest !~ '^[0-9a-f]{64}$')) or
      (st<>'pending' and item ? 'payload_sha256') then raise exception 'invalid manifest entry'; end if;
    seen:=array_append(seen,idx);
  end loop;
  insert into public.knowledge_import_entries_v1(organization_id,job_id,entry_index,status,payload_sha256,available_at)
    select p_org,p_job,(v->>'index')::integer,v->>'status',v->>'payload_sha256',t from jsonb_array_elements(p_manifest) v;
  update public.knowledge_import_jobs_v1 set verified_bytes=p_bytes,sha256=p_sha,manifest_sha256=h,total_entries=n,
    status=case when exists(select 1 from public.knowledge_import_entries_v1 where organization_id=p_org and job_id=p_job and status='pending') then 'queued' else 'completed' end
    where organization_id=p_org and id=p_job returning status into st;
  return st;
end $$;
-- Canonical payload digests for a trusted review adapter; no application grants.
create function knowledge_import_review.digest_payloads(p_payloads jsonb)
returns table(entry_index bigint,payload_sha256 text) language plpgsql security invoker
set search_path=pg_catalog,pg_temp as $$
begin
  if p_payloads is null or jsonb_typeof(p_payloads)<>'array' then raise exception 'invalid digest batch'; end if;
  if jsonb_array_length(p_payloads) not between 1 and 50 or octet_length(p_payloads::text)>524288 then raise exception 'invalid digest batch'; end if;
  if exists(select 1 from jsonb_array_elements(p_payloads) as v where jsonb_typeof(v)<>'object') then raise exception 'invalid digest payload'; end if;
  return query select ord-1,encode(sha256(convert_to(v::text,'UTF8')),'hex')
    from jsonb_array_elements(p_payloads) with ordinality as a(v,ord) order by ord;
end $$;
-- Review-only permission predicate. Not an installed storage RLS policy or upload grant.
create function knowledge_import_review.upload_allowed(p_org uuid,p_job uuid,p_bucket text,p_path text,p_bytes bigint)
returns boolean language sql security invoker set search_path=pg_catalog,public,auth,pg_temp as $$
  select coalesce(p_bucket='knowledge-import-private-v1' and auth.role()='authenticated' and exists(
    select 1 from public.knowledge_import_jobs_v1 j
    join auth.sessions s on s.id=j.request_session_id and s.user_id=j.requested_by
    join public.tenant_session_bindings b on b.session_id=s.id and b.user_id=s.user_id and b.organization_id=j.organization_id
    join public.organization_members m on m.user_id=s.user_id and m.organization_id=j.organization_id
    join public.organizations o on o.id=j.organization_id
    where j.organization_id=p_org and j.id=p_job and j.requested_by=auth.uid()
      and s.id::text=auth.jwt()->>'session_id' and m.active and m.role in ('owner','admin') and o.status='active'
      and j.status='awaiting_upload' and clock_timestamp()<j.upload_expires_at
      and j.object_path=p_path and j.declared_bytes=p_bytes),false);
$$;
-- History is scoped to the current active administrator session, not arbitrary org claims.
-- Deliberately omit raw paths, digests, session identities, lease tokens and document text.
create function knowledge_import_review.history(p_org uuid,p_limit integer,p_before timestamptz default null,p_before_id uuid default null)
returns table(job_id uuid,job_status text,created_at timestamptz,file_bytes bigint,total_entries integer,
  pending integer,leased integer,created integer,invalid integer,duplicate integer,failed integer,cancelled integer)
language plpgsql security invoker set search_path=pg_catalog,public,auth,pg_temp as $$
declare cutoff timestamptz;
begin
  if auth.role() is distinct from 'authenticated' or auth.uid() is null or not exists(
    select 1 from auth.sessions s join public.tenant_session_bindings b on b.session_id=s.id and b.user_id=s.user_id
    join public.organization_members m on m.user_id=s.user_id and m.organization_id=b.organization_id
    join public.organizations o on o.id=m.organization_id
    where s.id::text=auth.jwt()->>'session_id' and s.user_id=auth.uid() and b.organization_id=p_org
      and m.active and m.role in ('owner','admin') and o.status='active') then
    raise exception 'import access denied' using errcode='42501';
  end if;
  if p_limit is null or p_limit not between 1 and 25 or (p_before is null)<>(p_before_id is null) then
    raise exception 'invalid history cursor';
  end if;
  cutoff:=clock_timestamp();
  return query select j.id,
    case when j.status='awaiting_upload' and j.upload_expires_at<=cutoff
      and not exists(select 1 from knowledge_import_review.gateway_uploads g
        where g.organization_id=j.organization_id and g.job_id=j.id and g.phase='publishing')
      then 'expired' else j.status end,
    j.created_at,j.declared_bytes,j.total_entries,
    a.pending,a.leased,a.created,a.invalid,a.duplicate,a.failed,a.cancelled
  from (select q.* from public.knowledge_import_jobs_v1 q where q.organization_id=p_org
    and (p_before is null or (q.created_at,q.id)<(p_before,p_before_id))
    order by q.created_at desc,q.id desc limit p_limit) j
  cross join lateral (select
    count(*) filter(where e.status='pending')::integer as pending,
    count(*) filter(where e.status='leased')::integer as leased,
    count(*) filter(where e.status='created')::integer as created,
    count(*) filter(where e.status='invalid')::integer as invalid,
    count(*) filter(where e.status='duplicate')::integer as duplicate,
    count(*) filter(where e.status='failed')::integer as failed,
    count(*) filter(where e.status='cancelled')::integer as cancelled
    from public.knowledge_import_entries_v1 e where e.organization_id=j.organization_id and e.job_id=j.id) a
  order by j.created_at desc,j.id desc;
end $$;
-- REVIEW ONLY: dedicated principal registry, no login or application role provisioned here.
-- session_user is the actual connection identity; JWT claims cannot substitute for it.
create table knowledge_import_review.worker_principals (
  login_role name primary key,
  enabled boolean not null default false,
  accept_gateway_jobs boolean not null default false
);
create unique index knowledge_import_one_gateway_worker
  on knowledge_import_review.worker_principals (accept_gateway_jobs) where accept_gateway_jobs;
create table knowledge_import_review.worker_delegations (
  organization_id uuid not null,
  job_id uuid not null,
  login_role name not null references knowledge_import_review.worker_principals(login_role),
  actor_id uuid not null,
  actor_session_id uuid not null,
  source_sha256 text not null check(source_sha256 ~ '^[0-9a-f]{64}$'),
  manifest_sha256 text not null check(manifest_sha256 ~ '^[0-9a-f]{64}$'),
  object_version text not null check(length(object_version) between 1 and 256),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  primary key(organization_id,job_id),
  foreign key(organization_id,job_id) references public.knowledge_import_jobs_v1(organization_id,id) on delete cascade
);
alter table knowledge_import_review.worker_principals enable row level security;
alter table knowledge_import_review.worker_delegations enable row level security;
revoke all on knowledge_import_review.worker_principals,knowledge_import_review.worker_delegations from public,anon,authenticated,service_role;
-- Storage version must come from an independently verified immutable-object adapter.
alter table public.knowledge_import_jobs_v1 add column object_version text check(length(object_version) between 1 and 256);
create function knowledge_import_review.delegate_worker(p_org uuid,p_job uuid,p_login name,p_until timestamptz)
returns boolean language plpgsql security invoker set search_path=pg_catalog,public,auth,pg_temp as $$
declare j public.knowledge_import_jobs_v1%rowtype; t timestamptz;
begin
  j:=knowledge_import_review.lock_job(p_org,p_job);t:=clock_timestamp();
  if j.status not in ('queued','processing') or j.sha256 is null or j.manifest_sha256 is null or j.object_version is null
     or p_until is null or p_until<=t or p_until>least(j.retention_expires_at,t+interval '15 minutes') then return false; end if;
  if not exists(select 1 from knowledge_import_review.worker_principals p join pg_roles r on r.rolname=p.login_role
    where p.login_role=p_login and p.enabled and r.rolcanlogin and not r.rolsuper and not r.rolbypassrls
      and not r.rolcreaterole and not r.rolcreatedb and not r.rolreplication
      and not pg_has_role(r.oid,'service_role','MEMBER') and not pg_has_role(r.oid,'authenticated','MEMBER')) then return false; end if;
  -- No replacement or extension until a separately reviewed renewal operation exists.
  insert into knowledge_import_review.worker_delegations(organization_id,job_id,login_role,actor_id,actor_session_id,source_sha256,manifest_sha256,object_version,expires_at)
    values(p_org,p_job,p_login,j.requested_by,j.request_session_id,j.sha256,j.manifest_sha256,j.object_version,p_until)
    on conflict(organization_id,job_id) do nothing;
  return found;
end $$;
create function knowledge_import_review.revoke_worker(p_org uuid,p_job uuid)
returns boolean language plpgsql security invoker set search_path=pg_catalog,public,auth,pg_temp as $$
begin
  perform knowledge_import_review.lock_job(p_org,p_job);
  update knowledge_import_review.worker_delegations set revoked_at=clock_timestamp()
    where organization_id=p_org and job_id=p_job and revoked_at is null;
  return found;
end $$;
-- Narrow metadata-only eligibility. Owner execution, fixed search path, actual login identity.
-- This does not grant claim/finalize, raw file read or any other execution authority.
create function knowledge_import_review.worker_authorized(p_org uuid,p_job uuid,p_allow_completed boolean)
returns boolean language plpgsql security definer set search_path=pg_catalog,public,auth,pg_temp as $$
declare j public.knowledge_import_jobs_v1%rowtype; d knowledge_import_review.worker_delegations%rowtype;
begin
  select * into j from public.knowledge_import_jobs_v1 where organization_id=p_org and id=p_job for update;
  if not found or (j.status not in ('queued','processing') and not(coalesce(p_allow_completed,false) and j.status='completed')) or clock_timestamp()>=j.retention_expires_at then return false; end if;
  select * into d from knowledge_import_review.worker_delegations where organization_id=p_org and job_id=p_job for share;
  if not found or d.login_role<>session_user or d.revoked_at is not null or clock_timestamp()>=d.expires_at
    or d.actor_id<>j.requested_by or d.actor_session_id<>j.request_session_id
    or d.source_sha256 is distinct from j.sha256 or d.manifest_sha256 is distinct from j.manifest_sha256
    or d.object_version is distinct from j.object_version then return false; end if;
  perform 1 from knowledge_import_review.worker_principals p join pg_roles r on r.rolname=p.login_role
    where p.login_role=session_user and p.enabled and r.rolcanlogin and not r.rolsuper and not r.rolbypassrls
      and not r.rolcreaterole and not r.rolcreatedb and not r.rolreplication
      and not pg_has_role(r.oid,'service_role','MEMBER') and not pg_has_role(r.oid,'authenticated','MEMBER') for share of p;
  if not found then return false; end if;
  perform 1 from auth.sessions s join public.tenant_session_bindings b on b.session_id=s.id and b.user_id=s.user_id
    join public.organization_members m on m.user_id=s.user_id and m.organization_id=b.organization_id
    join public.organizations o on o.id=m.organization_id
    where s.id=d.actor_session_id and s.user_id=d.actor_id and b.organization_id=p_org
      and m.active and m.role in ('owner','admin') and o.status='active' for share of s,b,m,o;
  return found and clock_timestamp()<d.expires_at and clock_timestamp()<j.retention_expires_at;
end $$;
-- The externally testable eligibility predicate never grants completed-job processing.
create function knowledge_import_review.worker_allowed(p_org uuid,p_job uuid)
returns boolean language sql security definer set search_path=pg_catalog,pg_temp as $$
  select knowledge_import_review.worker_authorized(p_org,p_job,false);
$$;
-- Worker entry points: separate from user-session claim/finalize. Review owner only;
-- test grants only in the disposable fixture. Never set or impersonate Auth claims.
create function knowledge_import_review.worker_claim(p_org uuid,p_job uuid,p_limit integer)
returns table(entry_index integer,lease_token uuid,attempts integer)
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare j public.knowledge_import_jobs_v1%rowtype; expiry timestamptz; t timestamptz;
begin
  if not knowledge_import_review.worker_authorized(p_org,p_job,true) then raise exception 'worker access denied' using errcode='42501'; end if;
  select * into j from public.knowledge_import_jobs_v1 where organization_id=p_org and id=p_job;
  select expires_at into expiry from knowledge_import_review.worker_delegations where organization_id=p_org and job_id=p_job;
  if j.status='completed' then return; end if; -- authorized empty result; never claim completed entries
  t:=clock_timestamp();
  if p_limit is null or p_limit not between 1 and 50 then raise exception 'invalid batch size'; end if;
  if t>=least(expiry,j.retention_expires_at) then raise exception 'worker access denied' using errcode='42501'; end if;
  update public.knowledge_import_entries_v1 e set status='failed',lease_token=null,lease_expires_at=null,claimed_by_worker=null,error_code='attempts_exhausted'
    where e.organization_id=p_org and e.job_id=p_job and e.attempts>=5 and
      (e.status='pending' or (e.status='leased' and e.lease_expires_at<=t));
  return query with picked as (
    select e.entry_index from public.knowledge_import_entries_v1 e
    where e.organization_id=p_org and e.job_id=p_job and e.attempts<5 and e.payload_sha256 is not null
      and ((e.status='pending' and e.available_at<=t) or (e.status='leased' and e.lease_expires_at<=t))
    order by e.entry_index limit p_limit for update)
    update public.knowledge_import_entries_v1 e set status='leased',attempts=e.attempts+1,
      lease_token=gen_random_uuid(),lease_expires_at=least(t+interval '120 seconds',expiry,j.retention_expires_at),
      claimed_by_worker=session_user,error_code=null
    from picked where e.organization_id=p_org and e.job_id=p_job and e.entry_index=picked.entry_index
    returning e.entry_index,e.lease_token,e.attempts;
  perform knowledge_import_review.rollup(p_org,p_job);
end $$;
-- Draft-only write boundary. Unlike the public RPC, it derives the original actor
-- from the locked job, never from a worker argument or fabricated user JWT.
create function knowledge_import_review.worker_finalize(p_org uuid,p_job uuid,p_index integer,p_token uuid,p_attempt integer,p_payload jsonb)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare j public.knowledge_import_jobs_v1%rowtype; e public.knowledge_import_entries_v1%rowtype;
  expiry timestamptz; t timestamptz; src uuid; doc uuid; title text; category text; content text; source_name text; source_type text; uri text;
begin
  if not knowledge_import_review.worker_allowed(p_org,p_job) then raise exception 'worker access denied' using errcode='42501'; end if;
  select * into j from public.knowledge_import_jobs_v1 where organization_id=p_org and id=p_job;
  select expires_at into expiry from knowledge_import_review.worker_delegations where organization_id=p_org and job_id=p_job;
  select * into e from public.knowledge_import_entries_v1 where organization_id=p_org and job_id=p_job and entry_index=p_index for update;
  t:=clock_timestamp();
  if not found or t>=least(expiry,j.retention_expires_at) or e.status<>'leased' or e.claimed_by_worker is distinct from session_user
      or p_token is null or e.lease_token is distinct from p_token or e.attempts is distinct from p_attempt
      or e.lease_expires_at is null or t>=e.lease_expires_at then raise exception 'stale worker claim'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' or e.payload_sha256 is null
    or encode(sha256(convert_to(p_payload::text,'UTF8')),'hex')<>e.payload_sha256 then raise exception 'payload mismatch'; end if;
  if exists(select 1 from jsonb_each(p_payload) kv where kv.key not in ('title','category','content','source_name','source_type','source_uri')
     or (jsonb_typeof(kv.value)<>'string' and not(kv.key='source_uri' and jsonb_typeof(kv.value)='null'))) then raise exception 'invalid payload'; end if;
  title:=btrim(p_payload->>'title'); category:=coalesce(nullif(btrim(p_payload->>'category'),''),'general');
  content:=btrim(p_payload->>'content'); source_name:=btrim(p_payload->>'source_name');
  source_type:=p_payload->>'source_type'; uri:=nullif(btrim(p_payload->>'source_uri'),'');
  if title is null or length(title) not between 1 and 180 or length(category)>60
    or content is null or length(content) not between 10 and 8000 or source_name is null or length(source_name) not between 1 and 240
    or source_type is null or source_type not in ('manual','website','pdf','drive','faq','policy','course','crm_reply','other')
    or (uri is not null and (length(uri)>2048 or uri !~* '^https?://[^[:space:]]+$')) then raise exception 'invalid payload'; end if;
  insert into public.knowledge_sources(organization_id,source_type,name,source_uri,status,metadata,created_by)
    values(p_org,source_type,source_name,uri,'active',jsonb_build_object('entry_mode','knowledge_import_review'),j.requested_by) returning id into src;
  insert into public.knowledge_documents(organization_id,source_id,title,category,content,status,created_by,metadata)
    values(p_org,src,title,category,content,'draft',j.requested_by,jsonb_build_object('entry_mode','knowledge_import_review','import_job_id',j.id,'import_entry_index',p_index)) returning id into doc;
  insert into public.knowledge_chunks(organization_id,document_id,chunk_index,content,metadata)
    values(p_org,doc,0,content,jsonb_build_object('source','knowledge_import_review'));
  update public.knowledge_import_entries_v1 set status='created',document_id=doc,lease_token=null,lease_expires_at=null,claimed_by_worker=null,error_code=null,
    completed_by_worker=session_user,completed_token_sha256=encode(sha256(convert_to(p_token::text,'UTF8')),'hex')
    where organization_id=p_org and job_id=p_job and entry_index=p_index;
  perform knowledge_import_review.rollup(p_org,p_job);
  return doc;
end $$;
-- Only the original authorized administrator may renew a still-active delegation.
-- No renewal after expiry or revocation, no worker self-renewal or reassignment.
create function knowledge_import_review.renew_worker(p_org uuid,p_job uuid,p_until timestamptz)
returns boolean language plpgsql security invoker set search_path=pg_catalog,public,auth,pg_temp as $$
declare j public.knowledge_import_jobs_v1%rowtype; d knowledge_import_review.worker_delegations%rowtype; t timestamptz;
begin
  j:=knowledge_import_review.lock_job(p_org,p_job);
  select * into d from knowledge_import_review.worker_delegations where organization_id=p_org and job_id=p_job for update;
  if not found or j.status not in ('queued','processing') or d.revoked_at is not null or d.actor_id<>j.requested_by
    or d.actor_session_id<>j.request_session_id or d.source_sha256 is distinct from j.sha256
    or d.manifest_sha256 is distinct from j.manifest_sha256 or d.object_version is distinct from j.object_version then return false; end if;
  perform 1 from knowledge_import_review.worker_principals p join pg_roles r on r.rolname=p.login_role
    where p.login_role=d.login_role and p.enabled and r.rolcanlogin and not r.rolsuper and not r.rolbypassrls
      and not r.rolcreaterole and not r.rolcreatedb and not r.rolreplication
      and not pg_has_role(r.oid,'service_role','MEMBER') and not pg_has_role(r.oid,'authenticated','MEMBER') for share of p;
  if not found then return false; end if;
  t:=clock_timestamp();
  if t>=d.expires_at or p_until is null or p_until<=d.expires_at or p_until>least(j.retention_expires_at,t+interval '15 minutes') then return false; end if;
  update knowledge_import_review.worker_delegations set expires_at=p_until where organization_id=p_org and job_id=p_job;
  return true;
end $$;
-- Worker failure settlement verifies the exact live lease. Database owns retry delay.
create function knowledge_import_review.worker_settle_failure(p_org uuid,p_job uuid,p_index integer,p_token uuid,p_attempt integer,p_error_code text)
returns text language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare j public.knowledge_import_jobs_v1%rowtype; e public.knowledge_import_entries_v1%rowtype; expiry timestamptz; t timestamptz; next_status text;
begin
  if not knowledge_import_review.worker_allowed(p_org,p_job) then raise exception 'worker access denied' using errcode='42501'; end if;
  select * into j from public.knowledge_import_jobs_v1 where organization_id=p_org and id=p_job;
  select expires_at into expiry from knowledge_import_review.worker_delegations where organization_id=p_org and job_id=p_job;
  select * into e from public.knowledge_import_entries_v1 where organization_id=p_org and job_id=p_job and entry_index=p_index for update;
  t:=clock_timestamp();
  if not found or t>=least(expiry,j.retention_expires_at) or e.status<>'leased' or e.claimed_by_worker is distinct from session_user
    or p_token is null or e.lease_token is distinct from p_token or e.attempts is distinct from p_attempt
    or e.lease_expires_at is null or t>=e.lease_expires_at then raise exception 'stale worker claim'; end if;
  if p_error_code is null or p_error_code not in ('db_transient','storage_transient','invalid_payload','permanent_failure') then raise exception 'unsupported failure code'; end if;
  next_status:=case when p_error_code in ('db_transient','storage_transient') and e.attempts<5 then 'pending' else 'failed' end;
  update public.knowledge_import_entries_v1 set status=next_status,lease_token=null,lease_expires_at=null,claimed_by_worker=null,
    available_at=case when next_status='pending' then t+make_interval(secs=>30*power(2,e.attempts-1)::integer) else available_at end,
    error_code=p_error_code where organization_id=p_org and job_id=p_job and entry_index=p_index;
  perform knowledge_import_review.rollup(p_org,p_job);
  return next_status;
end $$;
-- Recovery is read-only: exact successful attempt/token/worker match, even after the last entry completes.
-- No payload access and no new draft creation. Null means no matching committed receipt.
create function knowledge_import_review.worker_result(p_org uuid,p_job uuid,p_index integer,p_token uuid,p_attempt integer)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare result uuid;
begin
  if not knowledge_import_review.worker_authorized(p_org,p_job,true) then raise exception 'worker access denied' using errcode='42501'; end if;
  if p_token is null or p_attempt is null then return null; end if;
  select e.document_id into result from public.knowledge_import_entries_v1 e
    where e.organization_id=p_org and e.job_id=p_job and e.entry_index=p_index and e.status='created'
      and e.attempts=p_attempt and e.completed_by_worker=session_user
      and e.completed_token_sha256=encode(sha256(convert_to(p_token::text,'UTF8')),'hex');
  return result;
end $$;
-- No broad read or arbitrary failure settlement. Actual worker error classification remains separate.
-- Worker receives only its assigned source identity, not a storage token or raw data.
create function knowledge_import_review.worker_source_identity(p_org uuid,p_job uuid)
returns table(object_path text,object_version text,byte_length bigint,source_sha256 text,manifest_sha256 text,read_expires_at_ms bigint)
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
  if not knowledge_import_review.worker_allowed(p_org,p_job) then raise exception 'worker access denied' using errcode='42501'; end if;
  return query select j.object_path,j.object_version,j.verified_bytes,j.sha256,j.manifest_sha256,
    floor(extract(epoch from least(d.expires_at,j.retention_expires_at))*1000)::bigint
    from public.knowledge_import_jobs_v1 j
    join knowledge_import_review.worker_delegations d on d.organization_id=j.organization_id and d.job_id=j.id
    where j.organization_id=p_org and j.id=p_job;
end $$;
-- Adapter must independently read/hash the actual immutable object. This verifies
-- its proposed source/manifest identity against the registered database record.
create function knowledge_import_review.worker_verify_manifest(p_org uuid,p_job uuid,p_version text,p_bytes bigint,p_sha text,p_manifest jsonb)
returns boolean language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare j public.knowledge_import_jobs_v1%rowtype;
begin
  if not knowledge_import_review.worker_allowed(p_org,p_job) then raise exception 'worker access denied' using errcode='42501'; end if;
  select * into j from public.knowledge_import_jobs_v1 where organization_id=p_org and id=p_job;
  if p_manifest is null or jsonb_typeof(p_manifest)<>'array' then return false; end if;
  if jsonb_array_length(p_manifest) is distinct from j.total_entries or octet_length(p_manifest::text)>2097152 then return false; end if;
  return coalesce(p_version=j.object_version and p_bytes=j.verified_bytes and p_sha=j.sha256
    and encode(sha256(convert_to(p_manifest::text,'UTF8')),'hex')=j.manifest_sha256,false);
end $$;
-- Scoped canonical digest operation for the dedicated worker adapter; no raw document reads.
create function knowledge_import_review.worker_digest_payloads(p_org uuid,p_job uuid,p_payloads jsonb)
returns table(entry_index bigint,payload_sha256 text) language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
  if not knowledge_import_review.worker_allowed(p_org,p_job) then raise exception 'worker access denied' using errcode='42501'; end if;
  return query select d.entry_index,d.payload_sha256 from knowledge_import_review.digest_payloads(p_payloads) d;
end $$;
-- Register storage version and verified manifest in one transaction, using the original session.
-- Caller must independently verify immutable provider identity; no storage I/O or application grants.
create function knowledge_import_review.register_verified_source(p_org uuid,p_job uuid,p_version text,p_bytes bigint,p_sha text,p_manifest jsonb)
returns text language plpgsql security invoker set search_path=pg_catalog,public,pg_temp as $$
declare j public.knowledge_import_jobs_v1%rowtype; result text;
begin
  j:=knowledge_import_review.lock_job(p_org,p_job);
  if p_version is null or length(p_version) not between 1 and 256 then raise exception 'invalid object version'; end if;
  if j.object_version is not null and j.object_version is distinct from p_version then raise exception 'object version conflict'; end if;
  if j.object_version is null and j.manifest_sha256 is not null then raise exception 'unversioned manifest already registered'; end if;
  result:=knowledge_import_review.enqueue(p_org,p_job,p_bytes,p_sha,p_manifest);
  update public.knowledge_import_jobs_v1 set object_version=p_version
    where organization_id=p_org and id=p_job and object_version is null;
  return result;
end $$;
-- Owner-only cleanup ledger. No external Storage delete or proof verification happens in SQL.
-- Never grant this review boundary to an application user or import worker.
create table knowledge_import_review.storage_cleanup (
  organization_id uuid not null,
  job_id uuid not null,
  cleanup_id uuid not null unique default gen_random_uuid(),
  object_path text not null,
  object_version text not null,
  source_sha256 text not null check(source_sha256 ~ '^[0-9a-f]{64}$'),
  requested_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  evidence_sha256 text check(evidence_sha256 ~ '^[0-9a-f]{64}$'),
  primary key(organization_id,job_id),
  foreign key(organization_id,job_id) references public.knowledge_import_jobs_v1(organization_id,id),
  check ((completed_at is null)=(evidence_sha256 is null))
);
alter table knowledge_import_review.storage_cleanup enable row level security;
revoke all on knowledge_import_review.storage_cleanup from public,anon,authenticated,service_role;
-- Use a stable cleanup ID across lost responses; job must be terminal and past retention.
-- Unversioned/abandoned reservations deliberately remain accounted until a separate absence protocol exists.
create function knowledge_import_review.begin_storage_cleanup(p_org uuid,p_job uuid)
returns uuid language plpgsql security invoker set search_path=pg_catalog,public,pg_temp as $$
declare j public.knowledge_import_jobs_v1%rowtype; c knowledge_import_review.storage_cleanup%rowtype;
begin
  select * into j from public.knowledge_import_jobs_v1 where organization_id=p_org and id=p_job for update;
  if not found or j.status not in ('completed','failed','cancelled','expired')
    or clock_timestamp()<j.retention_expires_at or j.object_version is null or j.sha256 is null
    or exists(select 1 from public.knowledge_import_entries_v1 e where e.organization_id=p_org and e.job_id=p_job and e.status in ('pending','leased'))
    then raise exception 'cleanup not eligible'; end if;
  select * into c from knowledge_import_review.storage_cleanup where organization_id=p_org and job_id=p_job for update;
  if found then
    if c.object_path is distinct from j.object_path or c.object_version is distinct from j.object_version or c.source_sha256 is distinct from j.sha256 then
      raise exception 'cleanup identity conflict'; end if;
    return c.cleanup_id;
  end if;
  if j.storage_released_at is not null then raise exception 'cleanup receipt missing'; end if;
  insert into knowledge_import_review.storage_cleanup(organization_id,job_id,object_path,object_version,source_sha256)
    values(p_org,p_job,j.object_path,j.object_version,j.sha256) returning cleanup_id into c.cleanup_id;
  return c.cleanup_id;
end $$;
-- Evidence digest is an attestation by a future separately authorized cleanup broker.
-- It MUST bind provider deletion/absence, exact object identity and no unfinished/replayable upload.
-- This function validates the ledger binding, not the truth of the external evidence.
create function knowledge_import_review.complete_storage_cleanup(p_org uuid,p_job uuid,p_cleanup uuid,p_path text,p_version text,p_source_sha text,p_evidence_sha text)
returns boolean language plpgsql security invoker set search_path=pg_catalog,public,pg_temp as $$
declare j public.knowledge_import_jobs_v1%rowtype; c knowledge_import_review.storage_cleanup%rowtype; t timestamptz;
begin
  -- Quota lock first: serialize release with new reservations; no Auth/actor locks in cleanup.
  perform 1 from knowledge_import_review.quotas where organization_id=p_org for update;
  if not found then raise exception 'import quota not configured'; end if;
  select * into j from public.knowledge_import_jobs_v1 where organization_id=p_org and id=p_job for update;
  if not found or j.status not in ('completed','failed','cancelled','expired') or clock_timestamp()<j.retention_expires_at
    or exists(select 1 from public.knowledge_import_entries_v1 e where e.organization_id=p_org and e.job_id=p_job and e.status in ('pending','leased')) then
    raise exception 'cleanup not eligible'; end if;
  select * into c from knowledge_import_review.storage_cleanup where organization_id=p_org and job_id=p_job for update;
  if not found or p_cleanup is null or p_cleanup is distinct from c.cleanup_id
    or p_path is distinct from c.object_path or p_version is distinct from c.object_version or p_source_sha is distinct from c.source_sha256
    or c.object_path is distinct from j.object_path or c.object_version is distinct from j.object_version or c.source_sha256 is distinct from j.sha256
    or p_evidence_sha is null or p_evidence_sha !~ '^[0-9a-f]{64}$' then raise exception 'cleanup evidence mismatch'; end if;
  if c.completed_at is not null then
    if c.evidence_sha256 is distinct from p_evidence_sha or j.storage_released_at is distinct from c.completed_at then raise exception 'cleanup receipt conflict'; end if;
    return true;
  end if;
  if j.storage_released_at is not null then raise exception 'cleanup receipt conflict'; end if;
  t:=clock_timestamp();
  update knowledge_import_review.storage_cleanup set completed_at=t,evidence_sha256=p_evidence_sha where organization_id=p_org and job_id=p_job;
  update public.knowledge_import_jobs_v1 set storage_released_at=t where organization_id=p_org and id=p_job;
  return true;
end $$;
create function knowledge_import_review.require_worker_principal()
returns void language plpgsql security invoker set search_path=pg_catalog,pg_temp as $$
begin
  perform 1 from knowledge_import_review.worker_principals p join pg_roles r on r.rolname=p.login_role
    where p.login_role=session_user and p.enabled and r.rolcanlogin and not r.rolsuper and not r.rolbypassrls
      and not r.rolcreaterole and not r.rolcreatedb and not r.rolreplication
      and not pg_has_role(r.oid,'service_role','MEMBER') and not pg_has_role(r.oid,'authenticated','MEMBER')
    for share of p;
  if not found then raise exception 'worker access denied' using errcode='42501'; end if;
end $$;

-- Close only expired assignments belonging to the connected worker. Preserve
-- completed drafts and retained bytes, and never renew a deadline on behalf of a user.
create function knowledge_import_review.worker_expire_assignments(p_limit integer)
returns integer language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare candidate record; cutoff timestamptz; closed_count integer:=0;
begin
  if p_limit is null or p_limit not between 1 and 5 then raise exception 'invalid expiry limit'; end if;
  perform knowledge_import_review.require_worker_principal();
  cutoff:=clock_timestamp();

  for candidate in
    select j.organization_id,j.id,j.requested_by,j.request_session_id,j.sha256,j.manifest_sha256,j.object_version
    from public.knowledge_import_jobs_v1 j join knowledge_import_review.worker_delegations d
      on d.organization_id=j.organization_id and d.job_id=j.id
    where d.login_role=session_user and d.expires_at<=cutoff and j.status in ('queued','processing')
      and d.actor_id=j.requested_by and d.actor_session_id=j.request_session_id
      and d.source_sha256=j.sha256 and d.manifest_sha256=j.manifest_sha256 and d.object_version=j.object_version
    order by d.expires_at,j.id limit p_limit for update of j skip locked
  loop
    -- Renewal and worker writes lock the job first. Confirm the delegation under
    -- that lock so a concurrent renewal cannot be expired from a stale snapshot.
    perform 1 from knowledge_import_review.worker_delegations d
      where d.organization_id=candidate.organization_id and d.job_id=candidate.id
        and d.login_role=session_user and d.expires_at<=cutoff
        and d.actor_id=candidate.requested_by and d.actor_session_id=candidate.request_session_id
        and d.source_sha256=candidate.sha256 and d.manifest_sha256=candidate.manifest_sha256
        and d.object_version=candidate.object_version for share;
    if found then
      perform knowledge_import_review.mark_job_expired(candidate.organization_id,candidate.id);
      closed_count:=closed_count+1;
    end if;
  end loop;
  return closed_count;
end $$;

-- Discovery returns only assigned due job identifiers. It is advisory, never a lease.
-- Each claim and finalize still requires the locked current authority check.
create function knowledge_import_review.worker_due_jobs(p_limit integer)
returns table(organization_id uuid,job_id uuid)
language plpgsql security definer set search_path=pg_catalog,public,auth,pg_temp as $$
begin
  if p_limit is null or p_limit not between 1 and 25 then raise exception 'invalid discovery limit'; end if;
  perform knowledge_import_review.require_worker_principal();
  return query select j.organization_id,j.id
    from knowledge_import_review.worker_delegations d
    join public.knowledge_import_jobs_v1 j on j.organization_id=d.organization_id and j.id=d.job_id
    join auth.sessions s on s.id=d.actor_session_id and s.user_id=d.actor_id
    join public.tenant_session_bindings b on b.session_id=s.id and b.user_id=s.user_id and b.organization_id=j.organization_id
    join public.organization_members m on m.user_id=s.user_id and m.organization_id=j.organization_id
    join public.organizations o on o.id=j.organization_id
    where d.login_role=session_user and d.revoked_at is null and d.expires_at>clock_timestamp()
      and j.status in ('queued','processing') and j.retention_expires_at>clock_timestamp()
      and j.requested_by=d.actor_id and j.request_session_id=d.actor_session_id
      and j.sha256=d.source_sha256 and j.manifest_sha256=d.manifest_sha256 and j.object_version=d.object_version
      and m.active and m.role in ('owner','admin') and o.status='active'
      and exists(select 1 from public.knowledge_import_entries_v1 e
        where e.organization_id=j.organization_id and e.job_id=j.id and
        ((e.status='pending' and e.available_at<=clock_timestamp()) or (e.status='leased' and e.lease_expires_at<=clock_timestamp())))
    order by j.created_at,j.id limit p_limit;
end $$;
-- Narrow history entry point derives tenant from the current Auth session.
-- No caller-supplied org, raw content, credentials, or generic table access.
-- Review only: no application grants, no exposed API schema.
create function knowledge_import_review.current_history(p_limit integer,p_before timestamptz default null,p_before_id uuid default null)
returns table(job_id uuid,job_status text,created_at text,file_bytes bigint,total_entries integer,
  pending integer,leased integer,created integer,invalid integer,duplicate integer,failed integer,cancelled integer)
language plpgsql security definer set search_path=pg_catalog,public,auth,pg_temp as $$
declare v_org uuid;
begin
  if auth.uid() is null or auth.jwt()->>'role' is distinct from 'authenticated'
    or coalesce(auth.jwt()->>'is_anonymous','false')<>'false' then
    raise exception 'import access denied' using errcode='42501'; end if;
  select b.organization_id into v_org from auth.sessions s
    join public.tenant_session_bindings b on b.session_id=s.id and b.user_id=s.user_id
    join public.organization_members m on m.user_id=s.user_id and m.organization_id=b.organization_id
    join public.organizations o on o.id=m.organization_id
    where s.id::text=auth.jwt()->>'session_id' and s.user_id=auth.uid()
      and m.active and m.role in ('owner','admin') and o.status='active';
  if not found then raise exception 'import access denied' using errcode='42501'; end if;
  return query select h.job_id,h.job_status,to_char(h.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    h.file_bytes,h.total_entries,h.pending,h.leased,h.created,h.invalid,h.duplicate,h.failed,h.cancelled
    from knowledge_import_review.history(v_org,p_limit,p_before,p_before_id) h
    order by h.created_at desc,h.job_id desc;
end $$;
revoke all on all functions in schema knowledge_import_review from public,anon,authenticated,service_role;

create table knowledge_import_review.gateway_uploads (
 organization_id uuid not null,job_id uuid not null,
 writer_sha256 text not null check(writer_sha256 ~ '^[0-9a-f]{64}$'),
 generation bigint not null check(generation>0), writer_until timestamptz not null,
 received_bytes bigint not null default 0 check(received_bytes between 0 and 52428800),
 phase text not null default 'receiving' check(phase in ('receiving','publishing','registered')),
 source_sha256 text check(source_sha256 ~ '^[0-9a-f]{64}$'),
 primary key(organization_id,job_id),
 foreign key(organization_id,job_id) references public.knowledge_import_jobs_v1(organization_id,id),
 check ((phase='receiving')=(source_sha256 is null))
);
create table knowledge_import_review.gateway_chunks (
 organization_id uuid not null,job_id uuid not null,byte_offset bigint not null check(byte_offset between 0 and 52428799),
 bytes bytea not null check(octet_length(bytes) between 1 and 1048576),
 sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 primary key(organization_id,job_id,byte_offset),
 foreign key(organization_id,job_id) references knowledge_import_review.gateway_uploads(organization_id,job_id)
);
alter table knowledge_import_review.gateway_uploads enable row level security;
alter table knowledge_import_review.gateway_chunks enable row level security;
revoke all on knowledge_import_review.gateway_uploads,knowledge_import_review.gateway_chunks from public,anon,authenticated,service_role;
-- Caller supplies a server-generated high-entropy UUID (never log it); replay same token
-- after lost acquisition response. Different writer may take over only after lease expiry.
create function knowledge_import_review.gateway_acquire(p_org uuid,p_job uuid,p_token uuid)
returns table(generation bigint,received_bytes bigint,writer_until timestamptz)
language plpgsql security invoker set search_path=pg_catalog,public,auth,pg_temp as $$
declare j public.knowledge_import_jobs_v1%rowtype; g knowledge_import_review.gateway_uploads%rowtype; t timestamptz; h text;
begin
 j:=knowledge_import_review.lock_job(p_org,p_job);t:=clock_timestamp();
 if p_token is null or j.status<>'awaiting_upload' or t>=j.upload_expires_at or coalesce(auth.jwt()->>'is_anonymous','false')<>'false' then raise exception 'gateway reservation unavailable'; end if;
 h:=encode(sha256(convert_to(p_token::text,'UTF8')),'hex');
 select * into g from knowledge_import_review.gateway_uploads u where u.organization_id=p_org and u.job_id=p_job for update;
 if not found then
   insert into knowledge_import_review.gateway_uploads(organization_id,job_id,writer_sha256,generation,writer_until)
   values(p_org,p_job,h,1,least(t+interval '5 minutes',j.upload_expires_at)) returning * into g;
 else
   if g.phase<>'receiving' then raise exception 'gateway publication already started'; end if;
   if g.writer_until>t and g.writer_sha256<>h then raise exception 'gateway writer busy'; end if;
   update knowledge_import_review.gateway_uploads u set writer_sha256=h,
     generation=case when g.writer_until<=t then g.generation+1 else g.generation end,
     writer_until=least(t+interval '5 minutes',j.upload_expires_at)
     where u.organization_id=p_org and u.job_id=p_job returning * into g;
 end if;
 return query select g.generation,g.received_bytes,g.writer_until;
end $$;
create function knowledge_import_review.gateway_lock(p_org uuid,p_job uuid,p_token uuid,p_generation bigint,p_phase text)
returns knowledge_import_review.gateway_uploads language plpgsql security invoker set search_path=pg_catalog,public,auth,pg_temp as $$
declare j public.knowledge_import_jobs_v1%rowtype; g knowledge_import_review.gateway_uploads%rowtype; t timestamptz;
begin
 j:=knowledge_import_review.lock_job(p_org,p_job); t:=clock_timestamp();
 select * into g from knowledge_import_review.gateway_uploads where organization_id=p_org and job_id=p_job for update;
 if not found or j.status<>'awaiting_upload' or t>=j.upload_expires_at or t>=g.writer_until
   or coalesce(auth.jwt()->>'is_anonymous','false')<>'false' or p_token is null
   or g.writer_sha256 is distinct from encode(sha256(convert_to(p_token::text,'UTF8')),'hex')
   or g.generation is distinct from p_generation or g.phase is distinct from p_phase then raise exception 'stale gateway writer'; end if;
 return g;
end $$;
-- Sequential fixed-size chunks, exact replay only. Server calculates digest, not client.
create function knowledge_import_review.gateway_append(p_org uuid,p_job uuid,p_token uuid,p_generation bigint,p_offset bigint,p_bytes bytea)
returns bigint language plpgsql security invoker set search_path=pg_catalog,public,pg_temp as $$
declare g knowledge_import_review.gateway_uploads%rowtype; j public.knowledge_import_jobs_v1%rowtype; c knowledge_import_review.gateway_chunks%rowtype; n integer; h text;
begin
 g:=knowledge_import_review.gateway_lock(p_org,p_job,p_token,p_generation,'receiving');
 select * into j from public.knowledge_import_jobs_v1 where organization_id=p_org and id=p_job;
 n:=octet_length(p_bytes);
 if p_offset is null or p_offset<0 or p_offset>=j.declared_bytes or mod(p_offset,1048576)<>0 or n is null
   or n<>least(1048576,j.declared_bytes-p_offset) then raise exception 'invalid gateway chunk'; end if;
 h:=encode(sha256(p_bytes),'hex');
 if p_offset<g.received_bytes then
   select * into c from knowledge_import_review.gateway_chunks where organization_id=p_org and job_id=p_job and byte_offset=p_offset;
   if not found or c.sha256 is distinct from h or c.bytes is distinct from p_bytes then raise exception 'gateway chunk conflict'; end if;
   return g.received_bytes;
 end if;
 if p_offset<>g.received_bytes then raise exception 'gateway offset mismatch'; end if;
 insert into knowledge_import_review.gateway_chunks values(p_org,p_job,p_offset,p_bytes,h);
 update knowledge_import_review.gateway_uploads set received_bytes=g.received_bytes+n where organization_id=p_org and job_id=p_job;
 return g.received_bytes+n;
end $$;
-- One-shot publication fence. A lost response leaves publishing locked for reconciliation,
-- never automatic takeover/retry. Result is bounded by the reservation (max 50 MiB).
create function knowledge_import_review.gateway_begin_publication(p_org uuid,p_job uuid,p_token uuid,p_generation bigint)
returns bytea language plpgsql security invoker set search_path=pg_catalog,public,pg_temp as $$
declare g knowledge_import_review.gateway_uploads%rowtype; j public.knowledge_import_jobs_v1%rowtype; source bytea;
begin
 g:=knowledge_import_review.gateway_lock(p_org,p_job,p_token,p_generation,'receiving');
 select * into j from public.knowledge_import_jobs_v1 where organization_id=p_org and id=p_job;
 if g.received_bytes<>j.declared_bytes then raise exception 'gateway source incomplete'; end if;
 select string_agg(c.bytes,''::bytea order by c.byte_offset) into source from knowledge_import_review.gateway_chunks c where c.organization_id=p_org and c.job_id=p_job;
 if octet_length(source) is distinct from j.declared_bytes then raise exception 'gateway source incomplete'; end if;
 update knowledge_import_review.gateway_uploads set phase='publishing',source_sha256=encode(sha256(source),'hex') where organization_id=p_org and job_id=p_job;
 return source;
end $$;
-- Only a trusted broker supplies the observed provider identity and verified manifest.
-- Recheck live writer, exact staged digest, session and job; atomically purge staged bytes.
create function knowledge_import_review.gateway_register(p_org uuid,p_job uuid,p_token uuid,p_generation bigint,p_version text,p_bytes bigint,p_sha text,p_manifest jsonb)
returns text language plpgsql security invoker set search_path=pg_catalog,public,pg_temp as $$
declare g knowledge_import_review.gateway_uploads%rowtype; result text;
begin
 g:=knowledge_import_review.gateway_lock(p_org,p_job,p_token,p_generation,'publishing');
 if g.source_sha256 is distinct from p_sha or g.received_bytes is distinct from p_bytes then raise exception 'gateway source mismatch'; end if;
 result:=knowledge_import_review.register_verified_source(p_org,p_job,p_version,p_bytes,p_sha,p_manifest);
 delete from knowledge_import_review.gateway_chunks where organization_id=p_org and job_id=p_job;
 update knowledge_import_review.gateway_uploads set phase='registered' where organization_id=p_org and job_id=p_job;
 return result;
end $$;
-- Receiving uploads may purge chunks after retention. An abandoned reservation
-- becomes expired under the same lock, without waiting for its original session.
-- No quota release here: absence of any provider object/old upload still requires evidence.
-- Durable logical database purge receipt; not provider deletion, WAL/backups erasure,
-- or quota-release evidence. No authenticated, application or worker grants.
create table knowledge_import_review.gateway_receiving_purges(
 organization_id uuid not null,job_id uuid not null,
 generation bigint not null check(generation>0),
 removed_bytes bigint not null check(removed_bytes between 0 and 52428800),
 purged_at timestamptz not null default clock_timestamp(),
 primary key(organization_id,job_id),
 foreign key(organization_id,job_id) references public.knowledge_import_jobs_v1(organization_id,id)
);
alter table knowledge_import_review.gateway_receiving_purges enable row level security;
revoke all on knowledge_import_review.gateway_receiving_purges from public,anon,authenticated,service_role;
create function knowledge_import_review.gateway_purge_receiving(p_org uuid,p_job uuid)
returns bigint language plpgsql security invoker set search_path=pg_catalog,public,pg_temp as $$
declare j public.knowledge_import_jobs_v1%rowtype; g knowledge_import_review.gateway_uploads%rowtype; removed bigint;
begin
 select * into j from public.knowledge_import_jobs_v1 where organization_id=p_org and id=p_job for update;
 if not found or j.status not in ('awaiting_upload','cancelled','expired','failed') or clock_timestamp()<j.retention_expires_at then
   raise exception 'gateway purge not eligible'; end if;
 select * into g from knowledge_import_review.gateway_uploads where organization_id=p_org and job_id=p_job for update;
 if not found and j.status<>'awaiting_upload' then return 0; end if;
 if g.job_id is not null and g.phase<>'receiving' then raise exception 'gateway publication reconciliation required'; end if;
 if j.storage_released_at is not null or j.object_version is not null or j.sha256 is not null or j.manifest_sha256 is not null
   or g.source_sha256 is not null or exists(select 1 from public.knowledge_import_entries_v1 e
     where e.organization_id=p_org and e.job_id=p_job)
   then raise exception 'gateway purge identity conflict'; end if;
 if g.job_id is not null then
   select coalesce(sum(octet_length(bytes)),0) into removed from knowledge_import_review.gateway_chunks where organization_id=p_org and job_id=p_job;
   if removed is distinct from g.received_bytes or removed>j.declared_bytes then raise exception 'gateway staged byte count conflict'; end if;
 end if;
 if j.status='awaiting_upload' then perform knowledge_import_review.mark_job_expired(p_org,p_job); end if;
 if g.job_id is null then return 0; end if;
 -- Parent job and stage locks serialize purge with upload/cancellation. Receipt
 -- and row removal commit together; failed transactions leave both untouched.
 insert into knowledge_import_review.gateway_receiving_purges(organization_id,job_id,generation,removed_bytes)
 values(p_org,p_job,g.generation,removed);
 delete from knowledge_import_review.gateway_chunks where organization_id=p_org and job_id=p_job;
 delete from knowledge_import_review.gateway_uploads where organization_id=p_org and job_id=p_job;
 return removed;
end $$;
-- A changed release timestamp must match the completed receipt for this exact source.
-- External evidence remains the cleanup operator's responsibility.
create function knowledge_import_review.gateway_quota_guard()
returns trigger language plpgsql security invoker set search_path=pg_catalog,public,pg_temp as $$
begin
 if new.storage_released_at is null or new.storage_released_at is not distinct from old.storage_released_at then
   return new;
 end if;
 if exists(select 1 from knowledge_import_review.gateway_uploads g where g.organization_id=new.organization_id and g.job_id=new.id and g.phase<>'registered')
   or exists(select 1 from knowledge_import_review.gateway_chunks c where c.organization_id=new.organization_id and c.job_id=new.id) then
   raise exception 'gateway cleanup incomplete'; end if;
 if not exists(
   select 1 from knowledge_import_review.storage_cleanup receipt
   where receipt.organization_id=new.organization_id and receipt.job_id=new.id
     and receipt.object_path=new.object_path and receipt.object_version=new.object_version
     and receipt.source_sha256=new.sha256 and receipt.completed_at=new.storage_released_at
     and receipt.evidence_sha256 is not null
 ) then raise exception 'completed storage cleanup receipt required'; end if;
 return new;
end $$;
create trigger knowledge_import_gateway_quota_guard before update of storage_released_at on public.knowledge_import_jobs_v1
 for each row execute function knowledge_import_review.gateway_quota_guard();
revoke all on function knowledge_import_review.gateway_purge_receiving(uuid,uuid),knowledge_import_review.gateway_quota_guard() from public,anon,authenticated,service_role;
-- Read-only publication receipt: original session and exact writer fence, even after lease
-- or upload deadline. No new publication, external access or quota release.
create function knowledge_import_review.gateway_publication_receipt(p_org uuid,p_job uuid,p_token uuid,p_generation bigint)
returns table(state text,job_status text) language plpgsql security invoker set search_path=pg_catalog,public,auth,pg_temp as $$
declare j public.knowledge_import_jobs_v1%rowtype; g knowledge_import_review.gateway_uploads%rowtype;
begin
 j:=knowledge_import_review.lock_job(p_org,p_job);
 select * into g from knowledge_import_review.gateway_uploads where organization_id=p_org and job_id=p_job for share;
 if not found or p_token is null or g.generation is distinct from p_generation or coalesce(auth.jwt()->>'is_anonymous','false')<>'false'
   or g.writer_sha256 is distinct from encode(sha256(convert_to(p_token::text,'UTF8')),'hex') then
   raise exception 'publication receipt denied' using errcode='42501'; end if;
 return query select case when g.phase='registered' and j.object_version is not null and j.manifest_sha256 is not null
   and j.sha256=g.source_sha256 and j.verified_bytes=g.received_bytes and j.status<>'awaiting_upload'
   then 'registered'::text else 'reconciliation_required'::text end,j.status;
end $$;
revoke all on function knowledge_import_review.gateway_publication_receipt(uuid,uuid,uuid,bigint) from public,anon,authenticated,service_role;
revoke all on function knowledge_import_review.gateway_acquire(uuid,uuid,uuid),knowledge_import_review.gateway_lock(uuid,uuid,uuid,bigint,text),knowledge_import_review.gateway_append(uuid,uuid,uuid,bigint,bigint,bytea),knowledge_import_review.gateway_begin_publication(uuid,uuid,uuid,bigint),knowledge_import_review.gateway_register(uuid,uuid,uuid,bigint,text,bigint,text,jsonb) from public,anon,authenticated,service_role;

create function knowledge_import_review.current_scope()
returns uuid language plpgsql security invoker set search_path=pg_catalog,public,auth,pg_temp as $$
declare v_org uuid;
begin
 if auth.uid() is null or auth.jwt()->>'role' is distinct from 'authenticated' or coalesce(auth.jwt()->>'is_anonymous','false')<>'false' then
   raise exception 'import access denied' using errcode='42501'; end if;
 select b.organization_id into v_org from auth.sessions s
 join public.tenant_session_bindings b on b.session_id=s.id and b.user_id=s.user_id
 join public.organization_members m on m.user_id=s.user_id and m.organization_id=b.organization_id
 join public.organizations o on o.id=m.organization_id
 where s.id::text=auth.jwt()->>'session_id' and s.user_id=auth.uid() and m.active and m.role in ('owner','admin') and o.status='active';
 if not found then raise exception 'import access denied' using errcode='42501'; end if;
 return v_org;
end $$;
-- Durations are trusted server policy, not request fields. No production defaults.
create function knowledge_import_review.reserve_current(p_job uuid,p_bytes bigint,p_upload_seconds integer,p_retention_seconds integer)
returns uuid language plpgsql security invoker set search_path=pg_catalog,public,auth,pg_temp as $$
declare v_org uuid; j public.knowledge_import_jobs_v1%rowtype; t timestamptz;
begin
 v_org:=knowledge_import_review.current_scope();t:=clock_timestamp();
 if p_job is null or p_bytes is null or p_bytes not between 1 and 52428800 or p_upload_seconds is null or p_upload_seconds not between 60 and 86400
 or p_retention_seconds is null or p_retention_seconds<p_upload_seconds or p_retention_seconds>2592000 then raise exception 'invalid reservation policy'; end if;
 select * into j from public.knowledge_import_jobs_v1 where id=p_job;
 if found then
   if j.organization_id<>v_org or j.requested_by<>auth.uid() or j.request_session_id::text is distinct from auth.jwt()->>'session_id'
      or j.declared_bytes<>p_bytes or j.status<>'awaiting_upload' or j.upload_expires_at<=t then raise exception 'reservation unavailable'; end if;
   return knowledge_import_review.reserve(v_org,p_job,p_bytes,j.upload_expires_at,j.retention_expires_at);
 end if;
 return knowledge_import_review.reserve(v_org,p_job,p_bytes,t+make_interval(secs=>p_upload_seconds),t+make_interval(secs=>p_retention_seconds));
end $$;
create function knowledge_import_review.cancel_current(p_job uuid)
returns boolean language plpgsql security invoker set search_path=pg_catalog,public,auth,pg_temp as $$
begin
 return knowledge_import_review.cancel(knowledge_import_review.current_scope(),p_job);
end $$;
revoke all on function knowledge_import_review.current_scope(),knowledge_import_review.reserve_current(uuid,bigint,integer,integer),knowledge_import_review.cancel_current(uuid) from public,anon,authenticated,service_role;

create table knowledge_import_review.application_principals(login_role name primary key,enabled boolean not null default false);
alter table knowledge_import_review.application_principals enable row level security;
revoke all on knowledge_import_review.application_principals from public,anon,authenticated,service_role;
create function knowledge_import_review.broker_assert()
returns void language plpgsql security invoker set search_path=pg_catalog,public,auth,pg_temp as $$
declare v_exp text; v_expected text; v_bound uuid;
begin
 if not exists(select 1 from knowledge_import_review.application_principals p join pg_roles r on r.rolname=p.login_role
   where p.login_role=session_user and p.enabled and r.rolcanlogin and not r.rolsuper and not r.rolbypassrls and not r.rolcreaterole and not r.rolcreatedb and not r.rolreplication
     and not exists(select 1 from pg_auth_members m where m.member=r.oid)
     and not exists(select 1 from knowledge_import_review.worker_principals w where w.login_role=r.rolname)) then
   raise exception 'application broker denied' using errcode='42501'; end if;
 v_exp:=auth.jwt()->>'exp';
 if v_exp is null or v_exp !~ '^[0-9]{1,12}$' or v_exp::numeric<=extract(epoch from clock_timestamp()) then
   raise exception 'application session expired' using errcode='42501'; end if;
 -- Hold the actual session binding for the transaction. A concurrent workspace
 -- change must serialize with this operation rather than silently change its tenant.
 select b.organization_id into v_bound from public.tenant_session_bindings b
 where b.session_id::text=auth.jwt()->>'session_id' and b.user_id=auth.uid()
 for share;
 if not found then raise exception 'application scope denied' using errcode='42501'; end if;
 v_expected:=nullif(current_setting('knowledge_import.expected_organization',true),'');
 if v_expected is not null and v_bound::text is distinct from v_expected then
   raise exception 'application scope denied' using errcode='42501'; end if;
 if knowledge_import_review.current_scope() is distinct from v_bound then
   raise exception 'application scope denied' using errcode='42501'; end if;
end $$;
create function knowledge_import_review.broker_current_scope()
returns uuid language plpgsql security definer set search_path=pg_catalog,public,auth,pg_temp as $$
begin
 perform knowledge_import_review.broker_assert();
 
 return knowledge_import_review.current_scope();
end $$;
-- Only administrators of this private registry select the default worker. Application and
-- worker logins cannot choose another principal or read the registry directly.
create function knowledge_import_review.gateway_worker_login()
returns name language plpgsql security invoker set search_path=pg_catalog,pg_temp as $$
declare login name;
begin
 select p.login_role into login from knowledge_import_review.worker_principals p
 join pg_roles r on r.rolname=p.login_role
 where p.accept_gateway_jobs and p.enabled and r.rolcanlogin and not r.rolsuper
   and not r.rolbypassrls and not r.rolcreaterole and not r.rolcreatedb and not r.rolreplication
   and not exists(select 1 from pg_auth_members m where m.member=r.oid)
 for share of p;
 if not found then raise exception 'import worker unavailable' using errcode='55000'; end if;
 return login;
end $$;
revoke all on function knowledge_import_review.gateway_worker_login() from public,anon,authenticated,service_role;

create function knowledge_import_review.broker_reserve_current(p_job uuid,p_bytes bigint,p_upload integer,p_retain integer)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,auth,pg_temp as $$
begin
 perform knowledge_import_review.broker_assert();
 perform knowledge_import_review.gateway_worker_login();
 return knowledge_import_review.reserve_current(p_job,p_bytes,p_upload,p_retain);
end $$;
create function knowledge_import_review.broker_cancel_current(p_job uuid)
returns boolean language plpgsql security definer set search_path=pg_catalog,public,auth,pg_temp as $$
begin
 perform knowledge_import_review.broker_assert();
 
 return knowledge_import_review.cancel_current(p_job);
end $$;
create function knowledge_import_review.broker_gateway_acquire(p_org uuid,p_job uuid,p_token uuid)
returns table(generation bigint,received_bytes bigint,writer_until timestamptz) language plpgsql security definer set search_path=pg_catalog,public,auth,pg_temp as $$
begin
 perform knowledge_import_review.broker_assert();
 if p_org is distinct from knowledge_import_review.current_scope() then raise exception 'application scope denied' using errcode='42501'; end if;
 return query select * from knowledge_import_review.gateway_acquire(p_org,p_job,p_token);
end $$;
create function knowledge_import_review.broker_gateway_append(p_org uuid,p_job uuid,p_token uuid,p_generation bigint,p_offset bigint,p_bytes bytea)
returns bigint language plpgsql security definer set search_path=pg_catalog,public,auth,pg_temp as $$
begin
 perform knowledge_import_review.broker_assert();
 if p_org is distinct from knowledge_import_review.current_scope() then raise exception 'application scope denied' using errcode='42501'; end if;
 return knowledge_import_review.gateway_append(p_org,p_job,p_token,p_generation,p_offset,p_bytes);
end $$;
create function knowledge_import_review.broker_gateway_begin_publication(p_org uuid,p_job uuid,p_token uuid,p_generation bigint)
returns bytea language plpgsql security definer set search_path=pg_catalog,public,auth,pg_temp as $$
begin
 perform knowledge_import_review.broker_assert();
 if p_org is distinct from knowledge_import_review.current_scope() then raise exception 'application scope denied' using errcode='42501'; end if;
 perform knowledge_import_review.gateway_worker_login();
 return knowledge_import_review.gateway_begin_publication(p_org,p_job,p_token,p_generation);
end $$;
create function knowledge_import_review.broker_gateway_lock(p_org uuid,p_job uuid,p_token uuid,p_generation bigint)
returns boolean language plpgsql security definer set search_path=pg_catalog,public,auth,pg_temp as $$
begin
 perform knowledge_import_review.broker_assert();
 if p_org is distinct from knowledge_import_review.current_scope() then raise exception 'application scope denied' using errcode='42501'; end if;
 perform knowledge_import_review.gateway_lock(p_org,p_job,p_token,p_generation,'publishing'); return true;
end $$;
create function knowledge_import_review.broker_gateway_register(p_org uuid,p_job uuid,p_token uuid,p_generation bigint,p_version text,p_bytes bigint,p_sha text,p_manifest jsonb)
returns text language plpgsql security definer set search_path=pg_catalog,public,auth,pg_temp as $$
declare result text; login name; retain_until timestamptz;
begin
 perform knowledge_import_review.broker_assert();
 if p_org is distinct from knowledge_import_review.current_scope() then raise exception 'application scope denied' using errcode='42501'; end if;
 result:=knowledge_import_review.gateway_register(p_org,p_job,p_token,p_generation,p_version,p_bytes,p_sha,p_manifest);
 if result='queued' then
   login:=knowledge_import_review.gateway_worker_login();
   select j.retention_expires_at into strict retain_until from public.knowledge_import_jobs_v1 j
     where j.organization_id=p_org and j.id=p_job;
   -- Same transaction as registering the verified source. The original authenticated actor
   -- delegates this exact source to the configured worker using the existing authority check.
   if not knowledge_import_review.delegate_worker(p_org,p_job,login,least(retain_until,clock_timestamp()+interval '15 minutes')) then
     raise exception 'import worker assignment failed' using errcode='55000';
   end if;
 end if;
 return result;
end $$;
create function knowledge_import_review.broker_gateway_publication_receipt(p_org uuid,p_job uuid,p_token uuid,p_generation bigint)
returns table(state text,job_status text) language plpgsql security definer set search_path=pg_catalog,public,auth,pg_temp as $$
begin
 perform knowledge_import_review.broker_assert();
 if p_org is distinct from knowledge_import_review.current_scope() then raise exception 'application scope denied' using errcode='42501'; end if;
 return query select * from knowledge_import_review.gateway_publication_receipt(p_org,p_job,p_token,p_generation);
end $$;
create function knowledge_import_review.broker_current_history(p_limit integer,p_before timestamptz,p_before_id uuid)
returns table(job_id uuid,job_status text,created_at text,file_bytes bigint,total_entries integer,pending integer,leased integer,created integer,invalid integer,duplicate integer,failed integer,cancelled integer) language plpgsql security definer set search_path=pg_catalog,public,auth,pg_temp as $$
begin
 perform knowledge_import_review.broker_assert();
 
 return query select * from knowledge_import_review.current_history(p_limit,p_before,p_before_id);
end $$;
create function knowledge_import_review.broker_reservation(p_org uuid,p_job uuid)
returns table(organization_id uuid,id uuid,requested_by uuid,request_session_id uuid,object_path text,declared_bytes bigint,upload_expires_at timestamptz,status text) language plpgsql security definer set search_path=pg_catalog,public,auth,pg_temp as $$
begin
 perform knowledge_import_review.broker_assert();
 if p_org is distinct from knowledge_import_review.current_scope() then raise exception 'application scope denied' using errcode='42501'; end if;
 return query select j.organization_id,j.id,j.requested_by,j.request_session_id,j.object_path,j.declared_bytes,j.upload_expires_at,j.status from knowledge_import_review.lock_job(p_org,p_job) j where j.status='awaiting_upload';
end $$;
create function knowledge_import_review.broker_digests(p_payloads jsonb)
returns table(entry_index bigint,payload_sha256 text) language plpgsql security definer set search_path=pg_catalog,public,auth,pg_temp as $$
begin
 perform knowledge_import_review.broker_assert();
 
 return query select * from knowledge_import_review.digest_payloads(p_payloads);
end $$;
revoke all on function knowledge_import_review.broker_assert(),knowledge_import_review.broker_current_scope(),knowledge_import_review.broker_reserve_current(uuid,bigint,integer,integer),knowledge_import_review.broker_cancel_current(uuid),knowledge_import_review.broker_gateway_acquire(uuid,uuid,uuid),knowledge_import_review.broker_gateway_append(uuid,uuid,uuid,bigint,bigint,bytea),knowledge_import_review.broker_gateway_begin_publication(uuid,uuid,uuid,bigint),knowledge_import_review.broker_gateway_lock(uuid,uuid,uuid,bigint),knowledge_import_review.broker_gateway_register(uuid,uuid,uuid,bigint,text,bigint,text,jsonb),knowledge_import_review.broker_gateway_publication_receipt(uuid,uuid,uuid,bigint),knowledge_import_review.broker_current_history(integer,timestamptz,uuid),knowledge_import_review.broker_reservation(uuid,uuid),knowledge_import_review.broker_digests(jsonb) from public,anon,authenticated,service_role;

create function knowledge_import_review.reconciliation_snapshot(p_org uuid,p_job uuid)
returns table(object_path text,job_status text,phase text,expected_bytes bigint,expected_sha text,registered_version text,staged_bytes bigint)
language plpgsql security invoker set search_path=pg_catalog,public,pg_temp as $$
begin
 return query select j.object_path,j.status,g.phase,j.declared_bytes,
   coalesce(j.sha256,g.source_sha256),j.object_version,
   coalesce((select sum(octet_length(c.bytes)) from knowledge_import_review.gateway_chunks c where c.organization_id=j.organization_id and c.job_id=j.id),0)::bigint
 from public.knowledge_import_jobs_v1 j
 left join knowledge_import_review.gateway_uploads g on g.organization_id=j.organization_id and g.job_id=j.id
 where j.organization_id=p_org and j.id=p_job and j.status in ('completed','failed','cancelled','expired')
 and j.retention_expires_at<=clock_timestamp() and j.storage_released_at is null
 and not exists(select 1 from public.knowledge_import_entries_v1 e where e.organization_id=j.organization_id and e.job_id=j.id and e.status in ('pending','leased'));
end $$;
revoke all on function knowledge_import_review.reconciliation_snapshot(uuid,uuid) from public,anon,authenticated,service_role;

create policy kb_import_review_gateway_insert_guard on storage.objects as restrictive for insert to authenticated
  with check (bucket_id is distinct from 'knowledge-import-private-v1');
create policy kb_import_review_anon_guard on storage.objects as restrictive for insert to anon
  with check (bucket_id is distinct from 'knowledge-import-private-v1');
create policy kb_import_review_read_guard on storage.objects as restrictive for select to anon,authenticated
  using (bucket_id is distinct from 'knowledge-import-private-v1');
create policy kb_import_review_update_guard on storage.objects as restrictive for update to anon,authenticated
  using (bucket_id is distinct from 'knowledge-import-private-v1')
  with check (bucket_id is distinct from 'knowledge-import-private-v1');
create policy kb_import_review_delete_guard on storage.objects as restrictive for delete to anon,authenticated
  using (bucket_id is distinct from 'knowledge-import-private-v1');

commit;
