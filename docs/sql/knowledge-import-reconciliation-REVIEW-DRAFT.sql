-- REVIEW ONLY: privileged metadata inspection; not a deletion or quota release operation.
begin;
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
commit;
