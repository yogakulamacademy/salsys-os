-- REVIEW ONLY. Durable bounded gateway staging, not a migration or exposed API.
-- Raw source bytes are sensitive. Requires separate retention, encryption, capacity and DBA review.
begin;
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
-- Only terminal receiving uploads may purge chunks without external publication reconciliation.
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
 if not found or j.status not in ('cancelled','expired','failed') or clock_timestamp()<j.retention_expires_at then
   raise exception 'gateway purge not eligible'; end if;
 select * into g from knowledge_import_review.gateway_uploads where organization_id=p_org and job_id=p_job for update;
 if not found then return 0; end if;
 if g.phase<>'receiving' then raise exception 'gateway publication reconciliation required'; end if;
 if j.storage_released_at is not null or j.object_version is not null or j.sha256 is not null or j.manifest_sha256 is not null
   or g.source_sha256 is not null or exists(select 1 from public.knowledge_import_entries_v1 e
     where e.organization_id=p_org and e.job_id=p_job)
   then raise exception 'gateway purge identity conflict'; end if;
 select coalesce(sum(octet_length(bytes)),0) into removed from knowledge_import_review.gateway_chunks where organization_id=p_org and job_id=p_job;
 if removed is distinct from g.received_bytes or removed>j.declared_bytes then raise exception 'gateway staged byte count conflict'; end if;
 -- Parent job and stage locks serialize purge with upload/cancellation. Receipt
 -- and row removal commit together; failed transactions leave both untouched.
 insert into knowledge_import_review.gateway_receiving_purges(organization_id,job_id,generation,removed_bytes)
 values(p_org,p_job,g.generation,removed);
 delete from knowledge_import_review.gateway_chunks where organization_id=p_org and job_id=p_job;
 delete from knowledge_import_review.gateway_uploads where organization_id=p_org and job_id=p_job;
 return removed;
end $$;
-- Guard every quota release, including the earlier cleanup RPC. Parent job already locked by UPDATE.
-- Does not replace external evidence checks, and cannot prove deletion from WAL/backups.
create function knowledge_import_review.gateway_quota_guard()
returns trigger language plpgsql security invoker set search_path=pg_catalog,public,pg_temp as $$
begin
 if old.storage_released_at is null and new.storage_released_at is not null and (
   exists(select 1 from knowledge_import_review.gateway_uploads g where g.organization_id=new.organization_id and g.job_id=new.id and g.phase<>'registered')
   or exists(select 1 from knowledge_import_review.gateway_chunks c where c.organization_id=new.organization_id and c.job_id=new.id)) then
   raise exception 'gateway cleanup incomplete'; end if;
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
commit;
