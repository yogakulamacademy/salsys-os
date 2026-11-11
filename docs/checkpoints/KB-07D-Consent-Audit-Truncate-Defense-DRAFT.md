# KB-07D — Preserve discovery consent/erasure audit from TRUNCATE (DRAFT / UNAPPLIED)

**Date:** 2026-11-07. **Stacked base:** KB-07C draft PR #603. **Status:** engineering proposal only. No production/staging SQL, no authorized retention or erasure.

## Exact finding: CASCADE is already blocked while the immutable trigger is enabled

The unapplied `docs/sql/KB-06B-audited-discovery-consent-lifecycle-DRAFT.sql` declares `knowledge_discovery_consent_audit.consent_id` with `ON DELETE CASCADE` **and** installs `kb_discovery_consent_audit_immutable` **BEFORE UPDATE OR DELETE**, whose exact helper `kb_discovery_consent_audit_immutable_v1()` raises `consent_audit_append_only` / SQLSTATE `42501`. PostgreSQL invokes child-table DELETE triggers even when their DELETE is caused by a foreign-key cascade (PostgreSQL trigger documentation: https://www.postgresql.org/docs/current/trigger-definition.html). **Therefore the plain DELETE of a consent with existing history is rejected when the trigger is enabled**; KB-06G's original warning was too broad and has been corrected in the source risk catalog and checkpoint.

This differs from KB-07C's existing deployed `knowledge_approvals` table, which **does not** have that immutable BEFORE DELETE trigger. Its document FK cascade is a genuine silent data-loss risk.

## Distinct confirmed escape: TRUNCATE

PostgreSQL `TRUNCATE` does not fire `BEFORE DELETE` triggers. It fires its own statement-level `BEFORE TRUNCATE` event instead; even `TRUNCATE ... CASCADE` can cascade through FK relationships that would normally RESTRICT row DELETE. The source KB-06B SQL explicitly `GRANT ALL` on `knowledge_discovery_consent_audit` to `service_role`; KB-06C does so for the metadata erasure audit too. This is a **privileged maintenance / unguarded operation risk**, not evidence that it happened in a real project. A superuser or owner can still disable triggers or change DDL; this DRAFT does not claim absolute protection against a malicious administrator.

The narrow proposed `docs/sql/KB-07D-consent-erasure-audit-truncate-guard-DRAFT.sql` creates **two BEFORE TRUNCATE statement triggers**, reusing the *existing KB-06B immutable trigger function*, on exactly:
- `public.knowledge_discovery_consent_audit`
- `public.knowledge_discovery_metadata_erasure_audit`

The triggers always raise `42501`; they cover direct table TRUNCATE and any parent `TRUNCATE ... CASCADE` that includes an audit table. The DRAFT does **not** change FK delete behavior, create any delete/erasure procedure, authorize an indefinite audit retention, touch `knowledge_approvals`, or modify row-level consent policy. This is a proposed defense-in-depth **requiring independent security/DBA/legal review**, not a production-approved retention approach.

## Actual disposable PostgreSQL evidence

`tests/database/knowledge-consent-audit-truncate-guard.test.mjs` runs only with explicit `SALSYS_ALLOW_LOCAL_DB_TESTS=1` on loopback `/postgres` using the local `postgres` account; it creates and destroys its own distinct database.

The test extracts the **unchanged original trigger function and BEFORE DELETE/UPDATE trigger definitions** verbatim from KB-06B/06C DRAFT SQL and recreates the exact relevant FK actions in a *minimal synthetic table fixture* (not the full Supabase Auth/RLS model). It checks:
1. Before KB-07D, direct consent DELETE with a consent audit row already **fails SQLSTATE 42501** due to the original immutable trigger. No data loss.
2. Before KB-07D, TRUNCATE on consent and erasure audit tables **succeeds and removes synthetic audit rows** (true uncovered behavior).
3. Apply the **exact unchanged KB-07D proposal SQL** to this sacrificial database. Verify both PostgreSQL trigger definitions.
4. After KB-07D, direct TRUNCATE of each audit and `TRUNCATE knowledge_discovery_site_consents CASCADE` all **fail with 42501**, leaving source consent, withdrawal history and erasure audit counts unchanged.
5. UPDATE and DELETE immutability still work; no remote network, auth login, production write, or user data.

This test is an **engineering proof of proposed DDL on disposable Postgres**, not independent live staging acceptance, complete source/derived retention, consent/grant approval, quote erasure or user rights resolution. The test is part of KB stacked draft CI; no new production migration.

## Explicit open decisions

- Legal/data-governance: acceptable retention basis and duration for consent, withdrawals, audit notes, identifiers and erasure records; lawful deletion/minimization requirements, backups, exports, traces and external providers. No policy or duration is invented.
- DBA: whether the table-wide TRUNCATE prohibition affects approved maintenance/tenant-offboarding flows; review FK ordering, trigger disabling permissions, DB owners, and safe test rollback. Service-role access and DDL ownership are separate from ordinary user RLS.
- Security: independently verify protected GitHub staging reviewers, real Auth/session binding, staged role permissions and 16 KB-04E scenarios.
- Infrastructure: no approved isolated staging project. Production and Recovery Rehearsal are **forbidden**; pricing quoted but user has not explicitly authorized a charge.

**No hosted SQL executed, no test user logged in, no real consent granted/withdrawn, no source crawl, no feature flag changed, no production/recovery writes, no paid provisioning, no PR merge or deployment. DRAFT / DO NOT MERGE.**
