# AI-03A — Independent Prompt Review Ledger (DISPOSABLE SQL / NO RELEASE)

**Date:** 2026-11-09 IST  
**Scope:** Priority 2 of SalsysOS governed AI.  
**Review candidate:** [draft integration PR #671](https://github.com/yogakulamacademy/salsys-os/pull/671), not `main`.  
**Status:** LOCAL ONLY, NOT A MIGRATION, not deployed, not approved, no active prompt selection or agent tool execution.

## What this checkpoint adds

- `docs/sql/AI-03A-prompt-approval-ledger-REHEARSAL-DRAFT.sql`: PostgreSQL-only prototype with a strict throwaway database name, explicit synthetic fixture marker, mandatory local synthetic tenant/Auth/session tables, and rejection if the `leads` or `contacts` table exists. No invocation against hosted, production or recovery projects.
- A private `ai03a_rehearsal` schema with `prompt_versions` and append-only `prompt_audit` tables. Prompt text, SHA-256 and author/version fields are write-once; submission and review status is stored separately.
- Three narrowly-granted `SECURITY DEFINER` functions that recheck **synthetic** Auth/JWT session IDs, active tenant, active owner/admin membership, and matching session binding. All actual function entry points allow only `authenticated`, revoke public/anon/service-role grants, and are intentionally **not** exposed by production Data API.
- `create_prompt_draft_v1` derives the next version per organization and prompt key under a transaction-scoped advisory lock, stores a PostgreSQL-computed digest, and writes a `created` audit record.
- `submit_prompt_review_v1` requires that same draft author and a current tenant session, moves only `draft → pending_review`, and writes an audit event.
- `decide_prompt_review_v1` requires a **different** active owner/admin from the original author, same tenant and current session, and moves `pending_review → reviewed/rejected` exactly once. It recomputes the saved body hash and appends another audit entry.
- **All successful responses include `may_execute=false`**. `reviewed` means reviewed candidate, never effective or authorized system prompt. No runtime AI action, payment, send, website crawler, MCP server, agent orchestration or SQL-install endpoint references this schema.
- `tests/database/ai-governed-prompt-ledger-rehearsal.test.mjs` runs only when `SALSYS_ALLOW_LOCAL_DB_TESTS=1` and the test connection is strictly local PostgreSQL `postgres`. It creates a randomly named disposable database, exercises negative tenant/actor/session/review cases, validates audit immutability, denial of direct authenticated tables, separation of author/reviewer, SHA-256 and version increment, then force-drops the database.
- Existing `.github/workflows/ci.yml` financial-database job now runs this test on its synthetic PostgreSQL service. This is no-cost CI rehearsal, NOT the 16 independent real signed-user staging scenarios.

## Critical implementation boundaries

1. **No authorization from a hash:** SHA-256 establishes consistency between stored body and digest. Anyone able to write arbitrary storage or replace code can manufacture a new pair; it is not a signature or evidence of human signoff.
2. **No authority from mocked sessions:** The fixture's `auth.jwt()` reads synthetic test claims, not a real Supabase authentication token. The design must be separately reviewed against current hosted session schema, token rotation, session expiry, revocation, membership RLS and service-role privilege boundaries.
3. **No physical immutable storage:** Trigger-level DELETE/UPDATE/TRUNCATE protection and explicit table grants provide a local append-only contract for ordinary roles. Superusers and DDL owners can disable triggers, modify schemas or tamper with records. Before production, decide retention and off-database tamper-evident provenance.
4. **No production migration:** The guard explicitly rejects missing synthetic fixtures and ordinary CRM tables; SQL lives only under `docs/sql/*REHEARSAL-DRAFT.sql`. Do not create `supabase/migrations/*` until DBA/security/legal approval, a protected merge/deploy plan, and separate owner authorization.
5. **No runtime tool registry, router, version activation, or permissions bypass:** `lib/ai/agent-governance-v1.ts` remains standalone and always returns `mayExecute:false`; previous pinned Co-Pilot and original Knowledge approval actions remain untouched. A reviewer can mark a candidate `reviewed`, but no prompt will ever be consumed automatically.
6. **No use of Production or Recovery for staging:** owner instructions continue to hold all separate staged testing, any paid projects, real website scans, model-provider calls, and migrations.

## What is still needed before a real governed-agent system can launch

- Authorized review of **who may author**, **who may independently approve**, required approval quorum, separation of duties, revision invalidation/revoke, version rollback and provenance of prompt text.
- DBA-owned, installable schema with real Supabase Auth session lock/recheck (not synthetic fixtures), RLS and exposed-API policies, explicit SQL grants and complete audit/retention strategy.
- A separate **signed, explicit runtime activation action** for reviewed versions, tenant-specific guidance and approved tool execution, with server-owned authorization and independently witnessed tests; never derive activation from `reviewed` database status alone.
- Tool permission execution requires its own narrow authenticated dispatcher, current tenant and per-resource RBAC, human approval for mutations, quotas, rate limits, idempotency, audit and per-channel consent.
- Independent security (#612), privacy and retention (#613), release (#601), isolated post-revenue staging budget (#614), and **0/16 real staging witnesses** remain open.
- Actual `main` has Git-linked Vercel production deployment behavior; the combined PR cannot be merged as a code-only operation. A separately approved deployment hold/rollback plan is mandatory.

## Local negative tests are NOT live approval evidence

The tests prove synthetic behavior only. Engineering green checks do not mean any independent reviewer has signed off, any legal purpose/retention policy exists, or that real tenants are isolated in production. The PR remains **DRAFT / UNMERGED**; staging remains **ON HOLD**.
