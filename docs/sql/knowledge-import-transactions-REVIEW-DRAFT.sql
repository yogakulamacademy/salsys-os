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
returns text language plpgsql security invoker set search_path=pg_catalog,public,pg_temp as $
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
end $;
-- Metadata expiry only. This is not object deletion or a background sweeper.
create function knowledge_import_review.expire(p_org uuid,p_job uuid)
returns boolean language plpgsql security invoker set search_path=pg_catalog,public,pg_temp as $
declare j public.knowledge_import_jobs_v1%rowtype; t timestamptz;
begin
  j:=knowledge_import_review.lock_job(p_org,p_job); t:=clock_timestamp();
  if not ((j.status='awaiting_upload' and t>=j.upload_expires_at) or
      (j.status in ('queued','processing') and t>=j.retention_expires_at)) then return false; end if;
  update public.knowledge_import_entries_v1 set status='cancelled',lease_token=null,lease_expires_at=null,error_code='job_expired'
    where organization_id=p_org and job_id=p_job and status in ('pending','leased');
  update public.knowledge_import_jobs_v1 set status='expired' where organization_id=p_org and id=p_job;
  return true;
end $;
revoke all on all functions in schema knowledge_import_review from public,anon,authenticated,service_role;
commit;
