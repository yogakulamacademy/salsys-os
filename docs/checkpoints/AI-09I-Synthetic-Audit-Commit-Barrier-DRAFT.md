# AI-09I — Synthetic audit-commit release barrier (DRAFT / NON-EXECUTABLE)

**Date:** 2026-11-09  
**Branch:** `integration/kb16-r2-main-preserve-20261109`  
**Review target:** [Draft PR #671](https://github.com/yogakulamacademy/salsys-os/pull/671).  
**Classification:** Source-only **simulation of ordering**, not a trusted commit receipt, transaction manager, production authorization, deployed SQL, or tool execution path.

## Reason for this checkpoint

The AI-09D/G SQL rehearsals demonstrate that an audit INSERT can be placed after a scoped read in one local PostgreSQL transaction. That is **not enough** to prove the application holds the response until that transaction has **COMMITTED** successfully. A database timeout after COMMIT may leave the caller uncertain: it must not silently assume success and release CRM records to a model. A previous receipt from a different tenant/request must not authorize a new read.

AI-09H's `AUDIT-06` production gate remains pending security/DBA/privacy approval. AI-09I makes the expected application ordering independently testable **without enabling a live adapter**.

## Added files

- `lib/ai/audit-commit-read-preview-v1.ts`: server-only, unimported by live Co-Pilot/Knowledge actions, `AUDIT_COMMIT_PREVIEW_RUNTIME_WIRED=false`. `previewAuditCommittedReadOrdering` is callable only by synthetic test fixtures. It performs **no** Supabase, SQL, HTTP, real audit, provider, WhatsApp, MCP or CRM calls.
- `tests/readiness/audit-commit-read-preview-v1.test.cjs`: 18 synthetic tests running under `npm run test:readiness`. They include a deliberately unresolved mock commit promise, and assert that the returned read result has **not** settled before the mock commit is confirmed.

The source composes the existing strict proposal grammar and real-schema projection, and models three *separately controlled* steps:

1. **Prepare (local fake only)**: mock callback returns transaction, audit and request IDs, exact tenant/tool/lead scope, a pending audit indicator, an explicitly bounded row count, and real-CRM-shaped synthetic rows.
2. **Validate projection**: reuse AI-09F minimal-field mapping; deny the whole set for PII, other tenants, invalid lead stages, bad dates, duplicate/unsafe scope or unknown output fields. **Never call mock commit** if the projection is unsafe. Best-effort mock abort is attempted when a valid prepared context exists.
3. **Commit confirmation (local fake only)**: second mock callback returns an exact-field synthetic receipt whose transaction, audit event, request, tenant, tool, lead and row count must match. Both commit and audit statuses must equal `committed`. Only then does the function return the **synthetic preview**. It still returns `mayExecute=false`, `executionStatus='not_wired'`, `commitStatus='synthetic_receipt_only'`.

For timeout, thrown commit error, malformed receipt, incorrect IDs, replayed receipt or ambiguous state, the preview **denies without returning records**. It does not disclose internal error strings and does not claim that an abort removed an audit record or that a denied event was persisted. The caller's future real transaction manager would need safe reconciliation of commits whose network result is unknown.

### Never treat the mock receipt as authority

The local callbacks are supplied by the test runner. Any arbitrary JavaScript caller can return a fake `committed` response. AI-09I proves **control-flow ordering under mocked conditions only**. It cannot authenticate JWTs, detect service-role bypass, verify RLS, ensure actual SQL durability, validate current source consent, or certify external storage. The preparer and committer must eventually be part of a separately approved, server-owned, least-privilege transaction boundary; they must not be invocable or provided by a browser or LLM.

The tool `knowledge.approved.search` is **unconditionally blocked** here because the canonical Knowledge search lacks consent/source metadata. No `ai_read_current_bound_session_v1` function has been installed. No payment/mutation/send tools are accepted.

## Production decisions required — still NOT approved

| Review subject | Real proof still necessary |
| --- | --- |
| Signed Auth/session | Current Auth JWT and `auth.sessions` check, direct binding to active tenant, role, no generic fallback/auto-binding |
| Lead/course access | Same-transaction per-lead assignment/workspace or tenant course+batch capability/published state; audited RLS and invoker/definer privileges |
| Knowledge | Independently approved source metadata/consent/withdrawal/validity policy and KB-16A quarantine |
| Audit durability | Actual transaction owner, commit-ack semantics, crash/timeout/cancellation and retries, idempotency, denied-attempt handling, integrity and retention; *not* simply a `true` Boolean |
| Data minimization | Independent review of projection fields, no PII, strict prompt-injection/data isolation, and provider access only after known commit |
| Release | Security/DBA/legal decisions and independent GitHub PR reviewer, migration/rollback, owner-approved dedicated staging and 16/16 signed real-user acceptance witnesses |

**Hard release hold:** No `main` merge; no hosted SQL; no staging activation or paid projects; no provider, WhatsApp, model, MCP or live Co-Pilot changes. Draft PR #671 remains unmerged, 0 independent reviews, staging owner ON HOLD at 0/16, and issues #601, #612, #613, #614 remain the controlling blockers. A green CI result is not a waiver.

## Reviewer sequence

First independently review the actual future signed-session/database adapter and transaction-commit protocol, then approve legal audit retention; only then consider a separately reviewed implementation and isolated real staging evidence. Do not change any AI-09H gate from pending based on this synthetic checkpoint.
