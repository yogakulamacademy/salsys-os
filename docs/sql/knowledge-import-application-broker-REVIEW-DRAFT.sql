-- REVIEW ONLY, no migration or production grants. Dedicated trusted application broker.
-- Definer wrappers deliberately encapsulate privileged table access; no generic SQL execution.
-- Database trusts claims from the exact-token verified application boundary. A stolen broker login
-- could impersonate a known active session; do not distribute it to clients or workers.
begin;
create table knowledge_import_review.application_principals(login_role name primary key,enabled boolean not null default false);
alter table knowledge_import_review.application_principals enable row level security;
revoke all on knowledge_import_review.application_principals from public,anon,authenticated,service_role;
create function knowledge_import_review.broker_assert()
returns void language plpgsql security invoker set search_path=pg_catalog,public,auth,pg_temp as $$
declare v_exp text;
begin
 if not exists(select 1 from knowledge_import_review.application_principals p join pg_roles r on r.rolname=p.login_role
   where p.login_role=session_user and p.enabled and r.rolcanlogin and not r.rolsuper and not r.rolbypassrls and not r.rolcreaterole and not r.rolcreatedb and not r.rolreplication
     and not exists(select 1 from pg_auth_members m where m.member=r.oid)
     and not exists(select 1 from knowledge_import_review.worker_principals w where w.login_role=r.rolname)) then
   raise exception 'application broker denied' using errcode='42501'; end if;
 v_exp:=auth.jwt()->>'exp';
 if v_exp is null or v_exp !~ '^[0-9]{1,12}$' or v_exp::numeric<=extract(epoch from clock_timestamp()) then
   raise exception 'application session expired' using errcode='42501'; end if;
 perform knowledge_import_review.current_scope();
end $$;
create function knowledge_import_review.broker_current_scope()
returns uuid language plpgsql security definer set search_path=pg_catalog,public,auth,pg_temp as $$
begin
 perform knowledge_import_review.broker_assert();
 
 return knowledge_import_review.current_scope();
end $$;
create function knowledge_import_review.broker_reserve_current(p_job uuid,p_bytes bigint,p_upload integer,p_retain integer)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,auth,pg_temp as $$
begin
 perform knowledge_import_review.broker_assert();
 
 return knowledge_import_review.reserve_current(p_job,p_bytes,p_upload,p_retain);
end $$;
create function knowledge_import_review.broker_cancel_current(p_job uuid)
returns boolean language plpgsql security definer set search_path=pg_catalog,public,auth,pg_temp as $$
begin
 perform knowledge_import_review.broker_assert();
 
 return knowledge_import_review.cancel_current(p_job);
end $$;
create function knowledge_import_review.broker_gateway_acquire(p_org uuid,p_job uuid,p_token uuid)
returns table(generation bigint,received_bytes bigint,writer_until timestamptz) language plpgsql security definer set search_path=pg_catalog,public,auth,pg_temp as $$
begin
 perform knowledge_import_review.broker_assert();
 if p_org is distinct from knowledge_import_review.current_scope() then raise exception 'application scope denied' using errcode='42501'; end if;
 return query select * from knowledge_import_review.gateway_acquire(p_org,p_job,p_token);
end $$;
create function knowledge_import_review.broker_gateway_append(p_org uuid,p_job uuid,p_token uuid,p_generation bigint,p_offset bigint,p_bytes bytea)
returns bigint language plpgsql security definer set search_path=pg_catalog,public,auth,pg_temp as $$
begin
 perform knowledge_import_review.broker_assert();
 if p_org is distinct from knowledge_import_review.current_scope() then raise exception 'application scope denied' using errcode='42501'; end if;
 return knowledge_import_review.gateway_append(p_org,p_job,p_token,p_generation,p_offset,p_bytes);
end $$;
create function knowledge_import_review.broker_gateway_begin_publication(p_org uuid,p_job uuid,p_token uuid,p_generation bigint)
returns bytea language plpgsql security definer set search_path=pg_catalog,public,auth,pg_temp as $$
begin
 perform knowledge_import_review.broker_assert();
 if p_org is distinct from knowledge_import_review.current_scope() then raise exception 'application scope denied' using errcode='42501'; end if;
 return knowledge_import_review.gateway_begin_publication(p_org,p_job,p_token,p_generation);
end $$;
create function knowledge_import_review.broker_gateway_lock(p_org uuid,p_job uuid,p_token uuid,p_generation bigint)
returns boolean language plpgsql security definer set search_path=pg_catalog,public,auth,pg_temp as $$
begin
 perform knowledge_import_review.broker_assert();
 if p_org is distinct from knowledge_import_review.current_scope() then raise exception 'application scope denied' using errcode='42501'; end if;
 perform knowledge_import_review.gateway_lock(p_org,p_job,p_token,p_generation,'publishing'); return true;
end $$;
create function knowledge_import_review.broker_gateway_register(p_org uuid,p_job uuid,p_token uuid,p_generation bigint,p_version text,p_bytes bigint,p_sha text,p_manifest jsonb)
returns text language plpgsql security definer set search_path=pg_catalog,public,auth,pg_temp as $$
begin
 perform knowledge_import_review.broker_assert();
 if p_org is distinct from knowledge_import_review.current_scope() then raise exception 'application scope denied' using errcode='42501'; end if;
 return knowledge_import_review.gateway_register(p_org,p_job,p_token,p_generation,p_version,p_bytes,p_sha,p_manifest);
end $$;
create function knowledge_import_review.broker_gateway_publication_receipt(p_org uuid,p_job uuid,p_token uuid,p_generation bigint)
returns table(state text,job_status text) language plpgsql security definer set search_path=pg_catalog,public,auth,pg_temp as $$
begin
 perform knowledge_import_review.broker_assert();
 if p_org is distinct from knowledge_import_review.current_scope() then raise exception 'application scope denied' using errcode='42501'; end if;
 return query select * from knowledge_import_review.gateway_publication_receipt(p_org,p_job,p_token,p_generation);
end $$;
create function knowledge_import_review.broker_current_history(p_limit integer,p_before timestamptz,p_before_id uuid)
returns table(job_id uuid,job_status text,created_at text,file_bytes bigint,total_entries integer,pending integer,leased integer,created integer,invalid integer,duplicate integer,failed integer,cancelled integer) language plpgsql security definer set search_path=pg_catalog,public,auth,pg_temp as $$
begin
 perform knowledge_import_review.broker_assert();
 
 return query select * from knowledge_import_review.current_history(p_limit,p_before,p_before_id);
end $$;
create function knowledge_import_review.broker_reservation(p_org uuid,p_job uuid)
returns table(organization_id uuid,id uuid,requested_by uuid,request_session_id uuid,object_path text,declared_bytes bigint,upload_expires_at timestamptz,status text) language plpgsql security definer set search_path=pg_catalog,public,auth,pg_temp as $$
begin
 perform knowledge_import_review.broker_assert();
 if p_org is distinct from knowledge_import_review.current_scope() then raise exception 'application scope denied' using errcode='42501'; end if;
 return query select j.organization_id,j.id,j.requested_by,j.request_session_id,j.object_path,j.declared_bytes,j.upload_expires_at,j.status from knowledge_import_review.lock_job(p_org,p_job) j where j.status='awaiting_upload';
end $$;
create function knowledge_import_review.broker_digests(p_payloads jsonb)
returns table(entry_index bigint,payload_sha256 text) language plpgsql security definer set search_path=pg_catalog,public,auth,pg_temp as $$
begin
 perform knowledge_import_review.broker_assert();
 
 return query select * from knowledge_import_review.digest_payloads(p_payloads);
end $$;
revoke all on function knowledge_import_review.broker_assert(),knowledge_import_review.broker_current_scope(),knowledge_import_review.broker_reserve_current(uuid,bigint,integer,integer),knowledge_import_review.broker_cancel_current(uuid),knowledge_import_review.broker_gateway_acquire(uuid,uuid,uuid),knowledge_import_review.broker_gateway_append(uuid,uuid,uuid,bigint,bigint,bytea),knowledge_import_review.broker_gateway_begin_publication(uuid,uuid,uuid,bigint),knowledge_import_review.broker_gateway_lock(uuid,uuid,uuid,bigint),knowledge_import_review.broker_gateway_register(uuid,uuid,uuid,bigint,text,bigint,text,jsonb),knowledge_import_review.broker_gateway_publication_receipt(uuid,uuid,uuid,bigint),knowledge_import_review.broker_current_history(integer,timestamptz,uuid),knowledge_import_review.broker_reservation(uuid,uuid),knowledge_import_review.broker_digests(jsonb) from public,anon,authenticated,service_role;
commit;
