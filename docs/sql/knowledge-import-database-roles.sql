-- Install after the gateway migration in the approved environment.
-- A database administrator sets role passwords outside this file and activates the roles separately.
begin;
set local lock_timeout = '5s';

create role knowledge_import_application nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
create role knowledge_import_worker nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;

grant usage on schema knowledge_import_review to knowledge_import_application, knowledge_import_worker;

grant execute on function
  knowledge_import_review.broker_current_scope(),
  knowledge_import_review.broker_reserve_current(uuid,bigint,integer,integer),
  knowledge_import_review.broker_cancel_current(uuid),
  knowledge_import_review.broker_gateway_acquire(uuid,uuid,uuid),
  knowledge_import_review.broker_gateway_append(uuid,uuid,uuid,bigint,bigint,bytea),
  knowledge_import_review.broker_gateway_begin_publication(uuid,uuid,uuid,bigint),
  knowledge_import_review.broker_gateway_lock(uuid,uuid,uuid,bigint),
  knowledge_import_review.broker_gateway_register(uuid,uuid,uuid,bigint,text,bigint,text,jsonb),
  knowledge_import_review.broker_gateway_publication_receipt(uuid,uuid,uuid,bigint),
  knowledge_import_review.broker_current_history(integer,timestamptz,uuid),
  knowledge_import_review.broker_reservation(uuid,uuid),
  knowledge_import_review.broker_digests(jsonb)
to knowledge_import_application;

grant execute on function
  knowledge_import_review.worker_expire_assignments(integer),
  knowledge_import_review.worker_due_jobs(integer),
  knowledge_import_review.worker_source_identity(uuid,uuid),
  knowledge_import_review.worker_verify_manifest(uuid,uuid,text,bigint,text,jsonb),
  knowledge_import_review.worker_digest_payloads(uuid,uuid,jsonb),
  knowledge_import_review.worker_claim(uuid,uuid,integer),
  knowledge_import_review.worker_finalize(uuid,uuid,integer,uuid,integer,jsonb),
  knowledge_import_review.worker_result(uuid,uuid,integer,uuid,integer),
  knowledge_import_review.worker_settle_failure(uuid,uuid,integer,uuid,integer,text)
to knowledge_import_worker;

insert into knowledge_import_review.application_principals(login_role, enabled)
values ('knowledge_import_application', false);

insert into knowledge_import_review.worker_principals(login_role, enabled, accept_gateway_jobs)
values ('knowledge_import_worker', false, false);

commit;
