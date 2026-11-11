-- KB-07D — DRAFT ONLY / UNAPPLIED. Protect consent and erasure audit
-- records from TRUNCATE, including TRUNCATE ... CASCADE.
--
-- KB-06B/06C already install BEFORE UPDATE OR DELETE immutable row triggers.
-- PostgreSQL invokes them for ON DELETE CASCADE, so ordinary consent deletion
-- is rejected when audit rows exist. But TRUNCATE does NOT fire DELETE triggers.
-- The same existing immutable trigger function is reused for TRUNCATE.
--
-- No retention duration, erasure permission, policy text, service-role key,
-- approved staging project or production migration is added here.
-- The source KB draft SQL and this SQL remain unapplied everywhere.
-- DO NOT run in Production or Recovery Rehearsal.
begin;
set local statement_timeout = '30s';
set local lock_timeout = '3s';

create trigger kb_discovery_consent_audit_truncate_block
before truncate on public.knowledge_discovery_consent_audit
for each statement
execute function public.kb_discovery_consent_audit_immutable_v1();

create trigger kb_discovery_metadata_erasure_audit_truncate_block
before truncate on public.knowledge_discovery_metadata_erasure_audit
for each statement
execute function public.kb_discovery_consent_audit_immutable_v1();

commit;
