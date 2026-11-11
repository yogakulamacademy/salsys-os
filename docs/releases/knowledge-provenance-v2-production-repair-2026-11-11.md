# Organization Knowledge V2 — narrow production RPC repair

**Date:** 2026-11-11  
**Tracker:** [#694](https://github.com/yogakulamacademy/salsys-os/issues/694)  
**Status:** Read-only diagnosis completed; **production DDL authorization, independent DBA/security review and authenticated smoke acceptance remain outstanding**. This document grants none of them.

## Verified symptom and cause

The live manual **Add Knowledge** form invokes:
`public.create_source_backed_knowledge_document_v2(p_approve, p_category, p_content, p_organization_id, p_source_name, p_source_type, p_source_uri, p_title, p_valid_from, p_valid_until)`.

An authenticated user received a missing PostgREST schema-cache function error. A **read-only production `pg_proc` query** confirmed the function has not been created. This is not a schema-cache-only issue.

- Canonical repository migration: `supabase/migrations/20261103190000_ai_knowledge_provenance_readiness_v2.sql`; verified file blob at investigation: `f467795b0590223a43fd1ef0f367631b48658257`.
- The canonical migration is **already committed to `main`**, but its name/version is **absent** from Production `supabase_migrations.schema_migrations`.
- Existing V1 create, approve, archive and retrieval RPCs are present. All four relevant Knowledge tables exist, with RLS enabled and status/source check constraints.
- Read-only inventory found zero knowledge sources, documents, chunks or approvals. This is a snapshot, not a live acceptance proof.

**Impact:** `Save as Draft` and `Save & Approve` both call the missing RPC and fail. No evidence of lost knowledge rows.

## Precise scope

The **existing canonical migration alone** adds a tenant-admin-gated, source-backed creation RPC and restricted function execute grants. The function stores passive source URL metadata; it does **not** fetch a website, invoke an LLM, enable new AI agents, send WhatsApp messages, change table RLS, or apply any other Knowledge Builder draft integration.

Do **not** deploy PR #671 or any other open AI migration stack as part of this repair. Existing Co-Pilot and user permissions must be unchanged except for the exact reviewed function EXECUTE right.

## Mandatory approval before production changes

1. **Owner:** Authorize this **specific production DDL change**, identifying production project, canonical migration path/version and reviewed checksum/commit. Generic "continue working" is not a substitute for the recorded deployment approval.
2. **Independent security/DBA reviewer:** Review the full 196-line canonical SQL: `SECURITY DEFINER`, fixed `search_path`, JWT-based actor check through `public.can_manage_organization`, accepted source types/URLs, empty/oversized content handling, cross-tenant rejection and anonymous-denied EXECUTE grants. Record an independent dated review and release disposition in a controlled evidence store.
3. **Migration operator:** Obtain a fresh migration inventory and inspect all local-versus-remote differences. `supabase migration list --remote` and `supabase db push --dry-run --remote` are suitable **read-only** diagnostics through an appropriately authenticated local CLI. Do not invoke `db push` if it would apply **any other pending migration**, or run ad hoc remote SQL in place of migration history. Choose a version-preserving, reviewed, **single-migration** deployment procedure; reconcile canonical version `20261103190000` in the history. Do not silently add a second timestamp for the same SQL.
4. **Operator:** Confirm backup/recovery readiness and a reviewed reversal plan; record the exact function body checksum and migration outcome.
5. **Independent reviewer:** Read back the function's existence, signature and privileges, and verify that PostgREST sees the RPC. Only after function exists, if the REST schema is still stale, request a cache reload through the approved process.

**Read-back queries** (read-only; examples for the authorized operator):

```sql
select p.proname, pg_get_function_identity_arguments(p.oid) as signature,
       p.prosecdef as security_definer,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='create_source_backed_knowledge_document_v2';

select version, name
from supabase_migrations.schema_migrations
where name='ai_knowledge_provenance_readiness_v2';
```

Expected: **one** 10-argument RPC with `SECURITY DEFINER=true`, `anon_execute=false`, `authenticated_execute=true` and exactly the expected canonical version record. The existence/grant check alone does not establish correct tenant isolation.

## Authenticated acceptance after the authorized deployment

- Owner/admin signed in to the correct organization: use **Save as Draft** on one *genuine verified* low-risk policy entry, with source name and no sensitive data; check it is a `draft`, linked to one active source, has one document and one retrieval chunk, and is **not** eligible for retrieval until approved. Avoid polluting production with new dummy items.
- Independently authorized reviewer verifies the entry against its actual source and approves it; check current approved knowledge appears in retrieval preview. Review and archive any mistaken entry through the normal lifecycle, preserving audit records.
- Non-admin and cross-tenant attempts must be **denied**; use explicitly authorized test identities, never another organization's live content.
- Confirm no new website discovery, no automatic replies or model tools, and no new records in unrelated business tables. Record screenshots and masked aggregate counts; avoid copying actual customer data into tickets.

## Rollback and hold points

- Before deploy: no production operation if review, permission or migration-history alignment is missing.
- On failure: stop, leave existing V1 lifecycle intact, verify actual state and execute **only** the independently reviewed rollback, if justified. Do not remove the function or alter history blindly: signed-in users may have already created records after deployment.
- Knowledge Builder isolated staging remains **ON HOLD**; all 16 real acceptance witnesses remain **0/16**. This incident repair cannot close #601, #612, #613, #614 or #677.

## Evidence record

Capture at minimum: approval identities (stored privately), reviewed SQL Git SHA and migration file blob, target project, migration-history preflight, dry-run scope, apply time, post-apply `pg_proc`/grant check, REST readiness, authenticated admin/non-admin behavior, rollback evidence, final operator sign-off and the user-visible outcome. Public issue #694 should link only to a non-sensitive attestation.
