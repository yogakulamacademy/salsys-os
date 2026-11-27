-- REVIEW ONLY: server-owned session boundary. Not a migration, no application grants.
begin;
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
commit;
