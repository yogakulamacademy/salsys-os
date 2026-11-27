-- REVIEW ONLY. Not a migration. Owner-only invoker functions for disposable tests.
-- No worker delegation, upload, enqueue, storage access or application grants.
begin;
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
  if j.status not in ('queued','processing') then return false; end if;
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
-- Metadata expiry only. This is not object deletion or a background sweeper.
create function knowledge_import_review.expire(p_org uuid,p_job uuid)
returns boolean language plpgsql security invoker set search_path=pg_catalog,public,pg_temp as $$
declare j public.knowledge_import_jobs_v1%rowtype; t timestamptz;
begin
  j:=knowledge_import_review.lock_job(p_org,p_job); t:=clock_timestamp();
  if not ((j.status='awaiting_upload' and t>=j.upload_expires_at) or
      (j.status in ('queued','processing') and t>=j.retention_expires_at)) then return false; end if;
  update public.knowledge_import_entries_v1 set status='cancelled',lease_token=null,lease_expires_at=null,claimed_by_worker=null,error_code='job_expired'
    where organization_id=p_org and job_id=p_job and status in ('pending','leased');
  update public.knowledge_import_jobs_v1 set status='expired' where organization_id=p_org and id=p_job;
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
alter table public.knowledge_import_jobs_v1 add column manifest_sha256 text check (manifest_sha256 ~ '^[0-9a-f]{64}$');
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
  -- Serialize reservations on the quota row. Other transitions never acquire this lock.
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
  select count(*) filter(where status in ('awaiting_upload','queued','processing')),coalesce(sum(declared_bytes),0) into n,b
    from public.knowledge_import_jobs_v1 where organization_id=p_org;
  -- Retained bytes count all jobs until separately authorized deletion/reconciliation.
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
  return query select j.id,j.status,j.created_at,j.declared_bytes,j.total_entries,
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
  enabled boolean not null default false
);
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
  if not knowledge_import_review.worker_allowed(p_org,p_job) then raise exception 'worker access denied' using errcode='42501'; end if;
  select * into j from public.knowledge_import_jobs_v1 where organization_id=p_org and id=p_job;
  select expires_at into expiry from knowledge_import_review.worker_delegations where organization_id=p_org and job_id=p_job;
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
returns table(object_path text,object_version text,byte_length bigint,source_sha256 text,manifest_sha256 text)
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
  if not knowledge_import_review.worker_allowed(p_org,p_job) then raise exception 'worker access denied' using errcode='42501'; end if;
  return query select j.object_path,j.object_version,j.verified_bytes,j.sha256,j.manifest_sha256
    from public.knowledge_import_jobs_v1 j where j.organization_id=p_org and j.id=p_job;
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
revoke all on all functions in schema knowledge_import_review from public,anon,authenticated,service_role;
commit;
