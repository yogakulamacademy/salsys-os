-- REVIEW ONLY. Not a migration. Owner-only invoker functions for disposable tests.
-- No worker delegation, upload, enqueue, storage access or application grants.
begin;
create schema knowledge_import_review;
revoke all on schema knowledge_import_review from public, anon, authenticated, service_role;
alter table public.knowledge_import_entries_v1
  add column payload_sha256 text check (payload_sha256 ~ '^[0-9a-f]{64}$'),
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
  update public.knowledge_import_entries_v1 e set status='failed',lease_token=null,lease_expires_at=null,error_code='attempts_exhausted'
    where e.organization_id=p_org and e.job_id=p_job and e.attempts>=5 and
      (e.status='pending' or (e.status='leased' and e.lease_expires_at<=t));
  return query
    with picked as (select e.entry_index from public.knowledge_import_entries_v1 e
      where e.organization_id=p_org and e.job_id=p_job and e.attempts<5 and e.payload_sha256 is not null
      and ((e.status='pending' and e.available_at<=t) or (e.status='leased' and e.lease_expires_at<=t))
      order by e.entry_index limit p_limit for update)
    update public.knowledge_import_entries_v1 e set status='leased',attempts=e.attempts+1,
      lease_token=gen_random_uuid(),lease_expires_at=least(t+interval '120 seconds',j.retention_expires_at),error_code=null
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
      or p_token is null or e.lease_token is distinct from p_token or e.attempts is distinct from p_attempt or t>=e.lease_expires_at then raise exception 'stale claim'; end if;
  if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('title','category','content','source_name','source_type','source_uri'))
    or length(coalesce(p_payload->>'content','')) not between 10 and 8000 then raise exception 'invalid payload'; end if;
  v:=public.create_source_backed_knowledge_document_v2(p_org,p_payload->>'title',p_payload->>'category',p_payload->>'content',
    p_payload->>'source_name',p_payload->>'source_type',p_payload->>'source_uri',null,null,false);
  d:=(v->>'document_id')::uuid;
  if v->>'status' is distinct from 'draft' or not exists(select 1 from public.knowledge_documents
      where id=d and organization_id=p_org and status='draft' and created_by=j.requested_by) then raise exception 'draft verification failed'; end if;
  update public.knowledge_import_entries_v1 set status='created',document_id=d,lease_token=null,lease_expires_at=null,error_code=null
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
  update public.knowledge_import_entries_v1 set status='cancelled',lease_token=null,lease_expires_at=null
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
    or p_token is null or e.lease_token is distinct from p_token or e.attempts is distinct from p_attempt
    or e.lease_expires_at is null or t>=e.lease_expires_at then raise exception 'stale claim'; end if;
  -- Only reviewed, non-sensitive machine codes. No arbitrary exception text.
  if p_error_code is null or p_error_code not in ('db_transient','storage_transient','invalid_payload','permanent_failure') then
    raise exception 'unsupported failure code';
  end if;
  next_status:=case when p_error_code in ('db_transient','storage_transient') and e.attempts<5 then 'pending' else 'failed' end;
  update public.knowledge_import_entries_v1 set status=next_status,lease_token=null,lease_expires_at=null,
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
  update public.knowledge_import_entries_v1 set status='cancelled',lease_token=null,lease_expires_at=null,error_code='job_expired'
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
revoke all on all functions in schema knowledge_import_review from public,anon,authenticated,service_role;
commit;
