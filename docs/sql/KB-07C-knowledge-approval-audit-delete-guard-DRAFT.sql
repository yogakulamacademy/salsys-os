-- KB-07C: DRAFT ONLY / UNAPPLIED. NOT A RETENTION OR ERASURE POLICY.
-- Original deployed knowledge V1 schema cascades knowledge_documents DELETE into
-- knowledge_approvals, silently destroying append-only human review history.
-- Change ONLY this one FK to RESTRICT. This deliberately blocks deletion of a
-- document with approval history until independent governance reviews the
-- lawful retention/erasure approach. It does NOT erase quotes or content and
-- does NOT protect audit history against tenant/org deletion or admin repair.
-- Exact source: supabase/migrations/20261016171500_organization_knowledge_v1.sql.
--
-- Never apply to Production or Recovery Rehearsal. No hosted staging target is
-- approved, and KB-04E independent acceptance is still 0/16.
-- The SQL is for independent review and disposable local PostgreSQL testing.
begin;
set local statement_timeout = '30s';
set local lock_timeout = '3s';

alter table public.knowledge_approvals
  drop constraint knowledge_approvals_document_fk;

alter table public.knowledge_approvals
  add constraint knowledge_approvals_document_fk
  foreign key (document_id, organization_id)
  references public.knowledge_documents(id, organization_id)
  on delete restrict;

commit;
