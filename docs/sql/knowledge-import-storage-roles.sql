-- Apply after the gateway migration and creation of its private JSON bucket.
-- Credential issuance is a separate action in the approved deployment secret store.
begin;
set local lock_timeout = '5s';

do $$
begin
  if not exists (
    select 1 from storage.buckets
    where id = 'knowledge-import-private-v1' and public = false
      and file_size_limit = 52428800 and allowed_mime_types = array['application/json']::text[]
  ) then
    raise exception 'The private Knowledge Import bucket must be configured first';
  end if;
end $$;

create role knowledge_import_gateway_storage nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
create role knowledge_import_worker_storage nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant knowledge_import_gateway_storage, knowledge_import_worker_storage to authenticator;
grant usage on schema storage to knowledge_import_gateway_storage, knowledge_import_worker_storage;
grant execute on function storage.allow_only_operation(text), storage.allow_any_operation(text[])
  to knowledge_import_gateway_storage, knowledge_import_worker_storage;
grant select, insert on storage.objects to knowledge_import_gateway_storage;
grant select on storage.objects to knowledge_import_worker_storage;

-- The restrictive fence applies even if the project has other permissive policies.
create policy kb_import_gateway_storage_read_fence on storage.objects as restrictive for select
  to knowledge_import_gateway_storage
  using (bucket_id = 'knowledge-import-private-v1'
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/source\.json$'
    and storage.allow_any_operation(array['object.get_authenticated_info', 'object.head_authenticated_info', 'storage.object.sign', 'storage.object.upload']));

create policy kb_import_worker_storage_read_fence on storage.objects as restrictive for select
  to knowledge_import_worker_storage
  using (bucket_id = 'knowledge-import-private-v1'
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/source\.json$'
    and storage.allow_only_operation('storage.object.sign'));

create policy kb_import_scoped_storage_read on storage.objects for select
  to knowledge_import_gateway_storage, knowledge_import_worker_storage using (true);

create policy kb_import_gateway_storage_create_fence on storage.objects as restrictive for insert
  to knowledge_import_gateway_storage
  with check (bucket_id = 'knowledge-import-private-v1'
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/source\.json$'
    and storage.allow_only_operation('storage.object.upload'));

create policy kb_import_gateway_storage_create on storage.objects for insert
  to knowledge_import_gateway_storage with check (true);

commit;
