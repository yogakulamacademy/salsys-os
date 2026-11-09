# AI-09K — Independent Security Review Slices (DRAFT / REVIEW INTAKE ONLY)

**Review baseline:** `bfd15b934caf4ddb254e38c21c8cd9f854d7e9f6`  
**Source:** [combined draft PR #671](https://github.com/yogakulamacademy/salsys-os/pull/671), `integration/kb16-r2-main-preserve-20261109`  
**Review branch:** `review/ai09k-independent-security-slices-20261109` (based **directly on the integration commit**, not on production-linked `main`)  
**PR #676 review-only base branch:** `review/ai09k-base-20261109` at exact commit `bfd15b934caf4ddb254e38c21c8cd9f854d7e9f6`. This prevents the PR's comparison base from drifting as the integration branch changes. A branch pointer is not immutable governance evidence: source links and approvals MUST still bind to the exact SHA.  
**State:** Six independent review slices are **ready to inspect**, not reviewed or approved. This document authorizes **no merge, migration, staging, execution, deployment, paid resource or policy change**.

## Why this exists

The combined KB/R2/AI draft contained **272 changed files** compared with `main` when this review packet was created; it may contain more changes now. Asking a security reviewer to approve the entire stack as a unit is inappropriate and makes issue-specific conclusions hard to audit.

This separate AI-09K review PR adds only a small **review index, this guide, and a hold-regression test** relative to its **dedicated, SHA-pinned review-only base branch**, not the live integration branch. Reviewers should **open the exact baseline commit** linked below for underlying implementation evidence. Approval of this documentation does not approve the underlying code, the 272-file stack, a SQL migration, or a production release.

The source-only AI modules, disposable PostgreSQL tests and nine AI-09H production decisions remain unchanged by this PR. The combined PR #671 stays draft and unmerged.

## Exact source reviews — six bounded slices

Every source link is pinned to the fixed baseline commit so that subsequent changes to the integration branch do not silently change the reviewed bytes. For the complete path/test inventory and pending owner decisions, see [the machine-readable AI-09K index](../contracts/AI-09K-independent-review-slices-v1.json).

### AI09K-01 — Governed prompts and approval history

**Reviewer:** independent AI governance engineer and DBA.  
**Read:** [versioned prompt and tenant guidance contract](https://github.com/yogakulamacademy/salsys-os/blob/bfd15b934caf4ddb254e38c21c8cd9f854d7e9f6/lib/ai/agent-governance-v1.ts), [prompt ledger local SQL](https://github.com/yogakulamacademy/salsys-os/blob/bfd15b934caf4ddb254e38c21c8cd9f854d7e9f6/docs/sql/AI-03A-prompt-approval-ledger-REHEARSAL-DRAFT.sql).  
**Verify:** immutable/versioned system prompt digests, tenant isolation, two-person approvals, no prompt/tool execution, disposable-only SQL fixture.  
**Hold:** no signed production system-prompt approvals or actual live tenant guidance configuration have been certified.

### AI09K-02 — Signed identity and tool scope

**Reviewer:** independent security engineer and Supabase Auth/DBA.  
**Read:** [read-only tool gate](https://github.com/yogakulamacademy/salsys-os/blob/bfd15b934caf4ddb254e38c21c8cd9f854d7e9f6/lib/ai/read-only-tool-gate-v1.ts), [server Auth preflight](https://github.com/yogakulamacademy/salsys-os/blob/bfd15b934caf4ddb254e38c21c8cd9f854d7e9f6/lib/ai/read-only-auth-boundary-v1.ts).  
**Verify:** Auth actor is server-derived, current `auth.sessions` + direct session-to-tenant binding is mandatory, absent RPC fails closed; no fallback to sole-membership/auto-binding, no `service_role` shortcut and no caller-chosen callbacks.  
**Hold:** `ai_read_current_bound_session_v1` is **not installed** and synthetic fakes do not prove signed real-world Auth or RLS.

### AI09K-03 — Strict output projection and Knowledge quarantine

**Reviewer:** security/privacy engineer.  
**Read:** [minimal result projector](https://github.com/yogakulamacademy/salsys-os/blob/bfd15b934caf4ddb254e38c21c8cd9f854d7e9f6/lib/ai/read-only-tool-result-projection-v1.ts), [real CRM schema mapping](https://github.com/yogakulamacademy/salsys-os/blob/bfd15b934caf4ddb254e38c21c8cd9f854d7e9f6/lib/ai/real-schema-read-projection-draft-v1.ts).  
**Verify:** public course/batch/lead field parity, tenant/lead ID isolation, PII and unsafe-field denial, caps on rows and dates, no last-activity invention and no instructions inferred from retrieved data.  
**Hold:** Knowledge source status/consent revision, withdrawal and verified original text are **not available from the canonical search**; every new Knowledge tool path must remain blocked until KB-16A independently accepted.

### AI09K-04 — SQL tenant/resource authorization

**Reviewer:** PostgreSQL DBA and security engineer.  
**Read:** [transaction-scoped local SQL](https://github.com/yogakulamacademy/salsys-os/blob/bfd15b934caf4ddb254e38c21c8cd9f854d7e9f6/docs/sql/AI-09D-transaction-scoped-read-REHEARSAL-DRAFT.sql), [real-shape capability/lead local SQL](https://github.com/yogakulamacademy/salsys-os/blob/bfd15b934caf4ddb254e38c21c8cd9f854d7e9f6/docs/sql/AI-09G-real-shape-read-REHEARSAL-DRAFT.sql).  
**Verify:** disposable-DB-only guards, explicit tenant/resource predicates, `education_core` and workspace checks, revoked-session/privilege denials, RLS and function `SECURITY DEFINER`/grant limitations.  
**Hold:** production function owner, RLS semantics, deployment migrations, rollback, session locks and per-lead assignment are **not approved**.

### AI09K-05 — Commit and replay guarantees

**Reviewer:** independent database reliability, security and privacy owner.  
**Read:** [commit ordering simulation](https://github.com/yogakulamacademy/salsys-os/blob/bfd15b934caf4ddb254e38c21c8cd9f854d7e9f6/lib/ai/audit-commit-read-preview-v1.ts), [local PostgreSQL idempotent replay SQL](https://github.com/yogakulamacademy/salsys-os/blob/bfd15b934caf4ddb254e38c21c8cd9f854d7e9f6/docs/sql/AI-09J-idempotent-audit-replay-REHEARSAL-DRAFT.sql).  
**Verify:** no returned records on uncertain COMMIT, never trust synthetic receipt, global request-ID collision and race tests, rollback then retry, no replay-as-capability, minimum PII-free audit metadata.  
**Hold:** a real COMMIT acknowledgment, cancellation/retry recovery, separate denied-attempt audit policy and lawful retention are **not approved**.

### AI09K-06 — Nine release decisions and staging hold

**Reviewer:** independent legal/privacy, security/DBA, release owner and infrastructure approver.  
**Read:** [AI-09H nine-gate manifest](https://github.com/yogakulamacademy/salsys-os/blob/bfd15b934caf4ddb254e38c21c8cd9f854d7e9f6/docs/contracts/AI-09H-production-read-authorization-release-hold-v1.json), [security review matrix](https://github.com/yogakulamacademy/salsys-os/blob/bfd15b934caf4ddb254e38c21c8cd9f854d7e9f6/docs/checkpoints/AI-09H-Production-Authorization-Decision-Matrix-DRAFT.md).  
**Verify:** all nine independent decisions remain pending, owner staging hold is respected, no one conflates local green CI with a release approval.  
**Hold:** [#601](https://github.com/yogakulamacademy/salsys-os/issues/601), [#612](https://github.com/yogakulamacademy/salsys-os/issues/612), [#613](https://github.com/yogakulamacademy/salsys-os/issues/613) and [#614](https://github.com/yogakulamacademy/salsys-os/issues/614) remain open. **0 independent reviews, 0/16 real signed-user staging witnesses.**

## How reviewers should record a decision

1. Pick **one slice only** and inspect the exact pinned sources **plus** the matching readiness / disposable-database tests from the JSON index. Verify effective deployed grants and signed Auth only after separate owner approval for isolated staging; do not use Production or Recovery Rehearsal as staging.
2. Record in an independently protected evidence store: slice ID, exact SHA, reviewer identity/function, date, positive/negative scenarios inspected, approved/rejected/changes-requested conclusion and any security-sensitive notes. Put only a **non-sensitive evidence reference** in GitHub. A GitHub review comment alone does not satisfy legal/DBA approval.
3. Keep `pending_independent_review` in the machine-readable manifest until independently authorized release owners establish a separate guarded evidence process. Editing JSON to `approved`, toggling a compile-time constant, or approving this documentation-only PR must never enable execution.
4. Request **changes to the relevant underlying code PR** for failed paths; do not merge the large PR. The intended future pattern is separate minimal code-reviewed changes followed by explicit, separately authorized staging, 16 witnessed real signed-user tests and final release approval.

## Safety boundary and status

- **NOT a production staging environment:** no hosted Supabase SQL, migrations, crawler, customer records, provider calls, AI tools, MCP endpoint, Vercel deploy or paid resource action.
- **NOT a release path:** this review branch is based on the feature integration branch. The new PR must stay **DRAFT** and must not be merged into `main` or the integration branch without independent approval.
- **NOT a substitute for code review:** these six slices are *review guides* for existing source code, not a claim that anyone has independently reviewed it.
- **No live Co-Pilot or Knowledge workflow changes.** Existing manual approvals remain unchanged.

If the underlying integration SHA changes, create a new independently versioned review intake with updated immutable source links before attempting approval. Never silently reinterpret a completed review against different code.
