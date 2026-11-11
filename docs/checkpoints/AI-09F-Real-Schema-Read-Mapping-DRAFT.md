# AI-09F — Real-schema read mapping and Knowledge consent release stop (DRAFT)

**Date:** 2026-11-09  
**Integration PR:** [#671](https://github.com/yogakulamacademy/salsys-os/pull/671)  
**Classification:** Source-only engineering contract, not a deployed read adapter or production migration.

## Why this checkpoint exists

AI-09D demonstrated a transaction-scoped read/audit pattern with **invented, disposable tables**. AI-09E added a **non-wired** Supabase Auth / direct-binding preflight but deliberately requires an RPC that does not exist. Neither proves production table compatibility, per-resource role/consent, or audit durability.

This checkpoint inspects the repository's actual migrations and closes a dangerous *design assumption* before anyone wires the agent: we must not treat synthetic fixture columns as real CRM columns or treat an approved-looking document as consent-verified Knowledge.

### Verified source-code schema map

| Proposed tool | Real schema evidence | Draft mapping | Mandatory independent read gate |
| --- | --- | --- | --- |
| `crm.course.list` | `001_initial_crm.sql`: `public.courses(id,name,active)`; `public.course_batches(id,course_id,mode,start_date,active)`. `007_tenant_schema_foundation.sql` adds `organization_id` to both. | One active course and one active batch map to ID/title/display mode/startsOn; `non_residential` -> `in_person` **display category only**. Multiple batches per course are not supported by the draft. | Current signed tenant binding and owner/admin role, `education_core` capability and course/batch RLS, matching batch parent and tenant, query limits, committed audit. Actual tenant visibility and capability approval are **NOT** proved by input rows. |
| `crm.lead.read` | `001_initial_crm.sql`: `public.leads(id,current_stage)`; `007_tenant_schema_foundation.sql` adds `organization_id`. | Exact lead ID + tenant + enumerated `current_stage` project to lead ID, stage, `lastActivityAt:null`. | Real `can_work_lead` or equivalent reviewed *same-transaction* authorization and tenant/RLS. No PII fields. `updated_at` must **not** be relabeled as last activity. |
| `knowledge.approved.search` | `20261016171500_organization_knowledge_v1.sql`: `knowledge_sources.status, metadata`, `knowledge_documents.status, metadata, valid_from/until`, `knowledge_chunks.metadata`; canonical `20261016182500_fix_organization_knowledge_search_v1.sql` returns document/chunk metadata but **not** `knowledge_sources.metadata`. | **Intentionally DENIED** by AI-09F: `knowledge_policy_unresolved` even if a source row claims `approved:true`. | Independent KB-16A source-metadata-aware SQL quarantine, actual source-consent/withdrawal verification, historic-version invalidation, per-tenant RLS and review, explicit purpose and retention, committed audit. |

Other relevant source contracts:

- `20261014061001_session_bound_tenant_authorization.sql` uses a generic sole-membership fallback and service-role authorization shortcuts. Those must never authorize the new AI read tool.
- `20261027200500_extend_current_workspace_context_with_access.sql` can auto-bind a workspace for general CRM UX. New AI tools require an already-direct-bound, independently validated session, without automatic binding.
- `20261101173500_r11_capability_security_foundation_v1.sql` makes course and batch RLS conditional on `education_core` capability. The future read must apply this same capability gate even if a SQL SECURITY DEFINER function bypasses table RLS.
- `20261027090000_db_incident_hardening_v2.sql` shows `can_access_lead` has a service-role bypass, so it cannot be used alone as an authorization guarantee for AI reads.

## New draft-only source and tests

- `lib/ai/real-schema-read-projection-draft-v1.ts` maps carefully selected **real-schema-shaped** rows into AI-09C's existing output projector for course/batch and lead reads. It has **no SQL, HTTP, Auth, provider calls, audit writes or execution permissions** and is not imported by any application action. `REAL_SCHEMA_READ_ADAPTER_RUNTIME_WIRED=false` is immutable.
- `tests/readiness/real-schema-read-projection-draft-v1.test.cjs` checks positive mapping, cross-tenant parent mismatches, missing lead scope, fake privilege claims, PII, unpublished/inactive rows, invalid batch modes/dates, hostile objects, duplicate/oversized results, the Knowledge hard stop, and **migration source parity**. It is included in `npm run test:readiness`.
- Even valid projections still contain `mayExecute:false`; the source-shape checker itself cannot tell whether a course is permitted, the caller is authenticated, the selected lead is assigned, audit is committed or Knowledge is consent-valid.

## Future production design criteria — NOT authorized

1. **Single verified read transaction:** Auth JWT/session, `auth.sessions`, exact `tenant_session_bindings`, active org, current membership role, resource visibility and audit write must be validated together. A preflight-only RPC response is not a reusable capability.
2. **Knowledge:** Install nothing until security/DBA/legal approve source-metadata quarantine, active source, approved document validity and current consent/withdrawal semantics. The canonical search must not be used as an AI tool read shortcut.
3. **Courses:** Tenant and Education Core capability must be explicitly enforced for `courses` and `course_batches`; document which course/batch visibility applies, including no batch and multi-batch cases.
4. **Leads:** Apply per-lead authorization (including assignment) and return only id/stage; do not use a service-role direct query after an earlier stale app check.
5. **Audit:** A read response must not be released before its durable audit transaction commits. Denied attempts roll back their own SQL insert: separate policy/design is needed to log denials safely without exposing inputs or masking failure.
6. **Operations:** SQL SECURITY DEFINER ownership, grants, RLS bypass, timeouts, row locks, tenant-safe cache/exports, retention/deletion, rollback and negative tests need separate independent review.

**Non-actions:** No `supabase/migrations` additions, hosted SQL, production/recovery/staging calls, MCP server, tool execution, AI provider invocation, Co-Pilot or Knowledge runtime imports, GitHub ruleset changes, merge or deployment. PR #671 stays **DRAFT**, #601/#612/#613/#614 stay **open**, staging remains owner-ON HOLD at **0/16 real witnessed scenarios**, and `main` is production-deploy-linked. Independent GitHub/security, privacy/legal and DBA approvals are still missing.
