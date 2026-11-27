-- REVIEW ONLY. Never apply to hosted Storage or a shared database.
-- Test against the exact provider schema and TUS lifecycle before granting access.
begin;
create function knowledge_import_review.storage_insert_allowed(p_bucket text,p_path text,p_metadata jsonb)
returns boolean language plpgsql security definer set search_path=pg_catalog,public,auth,pg_temp as $$
declare j public.knowledge_import_jobs_v1%rowtype; size_text text;
begin
  if p_bucket is distinct from 'knowledge-import-private-v1' or auth.uid() is null
    or auth.jwt()->>'role' is distinct from 'authenticated'
    or coalesce(auth.jwt()->>'is_anonymous','false')<>'false' then return false; end if;
  -- Never accept client-provided tenant IDs, user_metadata, or arbitrary path parsing.
  select * into j from public.knowledge_import_jobs_v1 where object_path=p_path;
  if not found then return false; end if;
  -- Fail closed on missing provider metadata. TUS initiation may not provide it:
  -- provider compatibility and actual byte enforcement are release blockers.
  size_text:=p_metadata->>'size';
  if size_text is null or size_text !~ '^[1-9][0-9]{0,7}$'
    or p_metadata->>'mimetype' is distinct from 'application/json' then return false; end if;
  return knowledge_import_review.upload_allowed(j.organization_id,j.id,p_bucket,p_path,size_text::bigint);
end $$;
revoke all on function knowledge_import_review.storage_insert_allowed(text,text,jsonb) from public,anon,authenticated,service_role;
-- Explicit permissive INSERT plus restrictive guards prevent broad existing policies
-- from bypassing the reservation for authenticated and anonymous clients.
create policy kb_import_review_insert on storage.objects for insert to authenticated
  with check (bucket_id='knowledge-import-private-v1' and knowledge_import_review.storage_insert_allowed(bucket_id,name,metadata));
create policy kb_import_review_insert_guard on storage.objects as restrictive for insert to authenticated
  with check (case when bucket_id='knowledge-import-private-v1' then knowledge_import_review.storage_insert_allowed(bucket_id,name,metadata) else true end);
create policy kb_import_review_anon_guard on storage.objects as restrictive for insert to anon
  with check (bucket_id is distinct from 'knowledge-import-private-v1');
create policy kb_import_review_read_guard on storage.objects as restrictive for select to anon,authenticated
  using (bucket_id is distinct from 'knowledge-import-private-v1');
create policy kb_import_review_update_guard on storage.objects as restrictive for update to anon,authenticated
  using (bucket_id is distinct from 'knowledge-import-private-v1')
  with check (bucket_id is distinct from 'knowledge-import-private-v1');
create policy kb_import_review_delete_guard on storage.objects as restrictive for delete to anon,authenticated
  using (bucket_id is distinct from 'knowledge-import-private-v1');
-- No schema/function grants, bucket creation or activation in this review file.
-- Actual Storage role grants and provider-enforced size/expiry/no replay require review.
commit;
