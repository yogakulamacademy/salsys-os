-- REVIEW ONLY alternative to the direct TUS policy. Apply only in a fresh disposable test.
-- A dedicated gateway publishes via a separately authorized server transport.
-- Existing client read/update/delete guards remain. Never issue direct signed upload tokens.
begin;
drop policy kb_import_review_insert on storage.objects;
drop policy kb_import_review_insert_guard on storage.objects;
create policy kb_import_review_gateway_insert_guard on storage.objects as restrictive for insert to authenticated
  with check (bucket_id is distinct from 'knowledge-import-private-v1');
revoke execute on function knowledge_import_review.storage_insert_allowed(text,text,jsonb) from authenticated;
commit;
