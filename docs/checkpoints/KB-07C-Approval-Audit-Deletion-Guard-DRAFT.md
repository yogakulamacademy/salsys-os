# KB-07C — Prevent accidental human approval audit deletion (DRAFT ONLY)

**Date:** 2026-11-07. **Stacked base:** KB-06H draft PR #599. **Scope:** a single proposed FK change + disposable PostgreSQL regression. **DO NOT APPLY OR MERGE** without independent owner, security, legal/retention and migration review.

## Source-proven issue

The existing knowledge migration `supabase/migrations/20261016171500_organization_knowledge_v1.sql` declares the human review table `public.knowledge_approvals` **append-only for authenticated users**, but also declares its document FK `knowledge_approvals_document_fk` with `ON DELETE CASCADE`. The same migration grants authenticated organization managers DELETE on `public.knowledge_documents`. As a result, a document delete permitted by RLS can **silently erase its historical approvals**, including reviewer notes. This is a *current schema design risk*, not proof any real audit was deleted. Even a privileged delete could erase audit records.

## Narrow draft remediation

`docs/sql/KB-07C-knowledge-approval-audit-delete-guard-DRAFT.sql` changes **only** that existing FK from CASCADE to **RESTRICT**, inside a transaction with timeouts. It does not create a production migration, create policy, grant, new delete privilege, external API or deletion scheduler. An existing approval row then makes a direct document delete fail at the database FK layer, irrespective of application RLS visibility. It intentionally does **not** change `knowledge_documents -> knowledge_chunks` ON DELETE CASCADE for drafts with no approvals.

**This is NOT a lawful/complete data-erasure policy.** It may block legitimate retention expiry or erasure for previously approved content until independent security/legal/data-governance decisions determine what reviewer evidence may be retained, what must be minimized/redacted/deleted, and how to handle version/source links, audit texts, backup copies, AI prompts, downstream replies and exports. In particular, the organization's other cascades, service-role mutations of audit rows, and tenant deletion paths are **NOT fixed** by this single FK. No data rights representation is made. This should not be auto-applied and the status remains blocked.

## Verification method

`tests/database/knowledge-approval-audit-delete-guard.test.mjs` connects **only** to loopback admin Postgres with `SALSYS_ALLOW_LOCAL_DB_TESTS=1`, a `/postgres` database path and `postgres` user. It creates its own uniquely named disposable database and destroys it after the test. It replays the original schema's two exact FK relationship types in a minimal synthetic subset, demonstrates that the existing cascade **does remove** an approval row, applies the **exact unchanged proposal SQL** to the disposable database, reads actual PostgreSQL constraint type `confdeltype='r'`, proves a document with human review rows fails deletion with SQLSTATE 23503 while preserving its document/chunks/audit, and proves an unapproved draft still deletes with chunk cascade. It is *schema/FK verification*, **not** a production RLS, real Auth, actual lifecycle, legality or hosted staging test.

The draft branch adds this test to the pre-existing disposable PostgreSQL CI service and preserves existing CI tests. No populated application database or hosted Supabase endpoint is used.

## Independent approvals needed before even staging

1. Legal/data governance approval of auditable history versus deletion rights. Audit notes can themselves contain personal/source data; decide minimal metadata, correction, legal basis, rights handling and actual retention duration instead of assuming perpetual retention.
2. DBA review for FK replacement locking and constraint validation, transaction rollback, concurrent writes, source/version references and organization-deletion cascade semantics.
3. Authorized, independent isolated staging project and owner-created synthetic fixture tenants; **never use Production or Recovery Rehearsal**.
4. Real 16-scenario KB-04E independent staging acceptance, including deletion/audit reconciliation, still **0/16 verified**.

**Non-actions:** No production or recovery SQL executed, no hosted migration, no project billed/provisioned, no Auth session or user data touched, no consent, crawler, AI call, merge or deployment. All actions remain disabled until independent approval.
