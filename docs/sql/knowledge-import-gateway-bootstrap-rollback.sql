-- Bootstrap rollback before activation. After use, disable the feature and
-- preserve import records while a separate retention-aware rollback is prepared.
begin;
set local lock_timeout = '5s';
lock table public.knowledge_import_jobs_v1, public.knowledge_import_entries_v1,
  knowledge_import_review.application_principals, knowledge_import_review.worker_principals in access exclusive mode;
do $$
begin
  if exists (select 1 from public.knowledge_import_jobs_v1)
    or exists (select 1 from storage.buckets where id = 'knowledge-import-private-v1')
    or exists (select 1 from knowledge_import_review.application_principals)
    or exists (select 1 from knowledge_import_review.worker_principals) then
    raise exception 'Bootstrap rollback requires an unused and unprovisioned import installation';
  end if;
end $$;
drop policy kb_import_review_gateway_insert_guard on storage.objects;
drop policy kb_import_review_anon_guard on storage.objects;
drop policy kb_import_review_read_guard on storage.objects;
drop policy kb_import_review_update_guard on storage.objects;
drop policy kb_import_review_delete_guard on storage.objects;
drop schema knowledge_import_review cascade;
drop table public.knowledge_import_entries_v1;
drop table public.knowledge_import_jobs_v1;
commit;
