# AI-09H — Production Read Authorization Decision Matrix (REVIEW ONLY)

**Date:** 2026-11-09  
**Review PR:** [#671](https://github.com/yogakulamacademy/salsys-os/pull/671), `integration/kb16-r2-main-preserve-20261109`  
**Artifact status:** *No authorization, no migration, no hosted access, no runtime tool*. The attached [machine-readable gate manifest](../contracts/AI-09H-production-read-authorization-release-hold-v1.json) is deliberately **BLOCKED** and has **0 independent reviews / 0 of 16 real signed-user staging witnesses**.

## Decision requested from independent reviewers

Do **not** green-light production tool reads on the strength of AI-09B–G's synthetic success. Agree on a trust-boundary design that proves (1) the signed current user and current session, (2) directly bound active tenant and role, (3) **actual same-transaction resource authorization** including capability and consent, (4) a genuinely **committed** audit before any model-visible output, and (5) legally approved processing/retention and a recoverable rollout.

Reviewers must name an effective GitHub reviewer, an independent security/DBA owner, a privacy/legal owner, and a release owner, then record authorizations in an **independently protected evidence system**. A PR comment, JSON field, synthetic test output or developer assertion is not a signature.

## Nine release gates

| ID | Owner function | Decision before any real implementation |
| --- | --- | --- |
| AUTH-01 | Security + DBA | Validate an Auth-signed request and current `auth.sessions` row; derive user/session from trusted context; require an existing direct `tenant_session_bindings` row, never auto-bind or fall back to sole membership |
| DB-02 | Security + DBA | Choose a reviewed invoker-RLS or carefully constrained definer model; inspect actual SQL owner, `BYPASSRLS`, exposed schema, default PUBLIC grants, search path, transaction isolation, locks, revoke/refresh races and access for `anon`, `authenticated`, `service_role` |
| RBAC-03 | Security + product owner | Define exactly which tenant members may see each lead; require current Sales workspace and assignment; remove any dependency on a service-role shortcut in authorization |
| COURSE-04 | Security + product owner | Require active tenant-scoped Education Core capability and Admin workspace; define published/active course/batch, no-batch/multi-batch behavior and legacy catalog visibility |
| KNOWLEDGE-05 | Legal/privacy + DBA | Require KB-16A current source metadata, consent owner/version/purpose, document approved validity, verified page content, withdrawal/expiry and historical-chunk invalidation |
| AUDIT-06 | Security + DBA + privacy | Define atomic append+commit result, failure/cancel/timeout/retry handling, minimum PII-free audit, denial-event policy, tamper/backup/retention semantics; never stream data on an uncertain commit |
| PRIVACY-07 | Legal/privacy + DBA | Independently sign processing notice and the 12-store retention/erasure matrix plus actual external copies/processors; do not invent retention durations |
| PROVIDER-08 | Security + AI owner | Verify least-privilege projections, prompt-injection isolation, no unreviewed tools or phone/email/notes and no LLM/provider/cache until authorized and committed |
| RELEASE-09 | Release owner + independent reviewer | Approve small reviewed change sets, effective protected environment, rollback, funding and dedicated isolated staging, then witness all 16 real signed-user scenarios |

Every gate is `pending_independent_review`; the machine-readable file forbids a production-ready or runtime-wired state. The 12 tests in `tests/readiness/ai09h-production-read-authorization-hold.test.cjs` validate that hold and current source constraints. They are CI **checks**, not legal/DBA approvals.

## Proposed transaction boundary — NOT installed

1. **Outer server request:** authenticated, browser-cookie-scoped Supabase `auth.getUser()` validates the current user. Browser/model input is restricted to `toolId,organizationId,leadId,query`; caller cannot nominate actor, session, role, SQL, endpoint or tool implementation. The owner must independently verify that the actual provider-to-DB request preserves signed Auth, not a user-supplied application metadata role.
2. **Single DB transaction:** choose one reviewed least-privilege transport for a *server-owned* read API. A non-exposed private schema is preferred for internal helpers; however, a `supabase-js .rpc` call to a non-exposed schema **cannot be assumed reachable**. DBA must explicitly decide between a reviewed exposed wrapper with narrow EXECUTE grant and internally private least-privilege code, or a tightly managed server-only database connection with trusted identity propagation. Do not assume either is configured.
3. **SQL identity:** derive `auth.uid()` and `auth.jwt()->>'session_id'` only from the upstream validated request context; verify present `auth.sessions` and exact `tenant_session_bindings`, active tenant, member and effective role, no generic fallback or `service_role` bypass. Test Auth anonymous-user modes and expired/revoked sessions; the Postgres role `authenticated` alone is not proof of a non-anonymous human.
4. **Read and resource policy:** recheck per-lead assignment/workspace in the *same* transaction as the tenant-scoped lead SELECT; for course lists recheck `education_core`, enabled workspace, tenant-matched course and batch plus publication status. Knowledge remains **DENIED** until the source-metadata-aware, withdrawal-safe query is independently accepted and real source consent is shown, not inferred from a Boolean.
5. **Minimal projection:** read only allowlisted server-side columns and produce bounded `organizationId,courseId,title,mode,startsOn` or `organizationId,leadId,stage,lastActivityAt:null`. Exclude phone, email, notes, price, payment and source raw prompt instructions. Treat returned database content as untrusted data, never authority to change system prompts or call tools.
6. **Audit commit boundary:** append minimum actor/session/tenant/tool/resource/row_count information under an approved privacy/retention scheme within the same DB transaction. Do not release a serialized result or start model generation until a successful **committed** response has been verified. A successful `INSERT` within a function that later fails to commit is **NOT** an audit receipt. On timeout/network ambiguity, deny output; reconcile possible duplicate audit attempts per an approved idempotency design.
7. **Denials:** if authorization or SQL fails, do not return rows or secrets. Because aborted SQL rolls back in-transaction audit inserts, decide separately whether and how denied attempts should be recorded with a privacy-approved independent facility; do not claim that local failed-transaction tests persist such denials.
8. **No runtime activation from this artifact.** AI-09B, AI-09C, AI-09E and AI-09F compile-time runtime constants must remain `false`, and the dedicated `ai_read_current_bound_session_v1` RPC remains uninstalled. Any future activation requires independent code/DBA/security/privacy approval, clean merge plan and isolated real witnessed staging evidence first.

## Proposed staged engineering review after decisions (not permission to deploy)

- **Review A — signed identity/tenant RPC design:** verify Auth boundary, `auth.sessions`, direct tenant binding, function grants/ownership, request role and revocation races. No live tool dispatch.
- **Review B — two read-only resource adapters:** exact lead assignment and course capability/published-batch SQL, strict output projection, permission-denial and concurrent-update tests.
- **Review C — Knowledge:** add current source consent/metadata history to its own separately reviewed query. Do not co-mingle with the generic canonical Knowledge search.
- **Review D — audit lifecycle:** private audit schema/commit semantics, retention/withdrawal/backups/denied-attempt handling, idempotency and legal purpose.
- **Review E — deployment:** a minimal migration plus rollback, developer-independent code approval, owner-funded standalone staging, actual signed-user witness suite and deliberate post-merge monitoring. No `main` merge or Vercel-triggered deploy before this.

**Important source-specific hazards:**

- The October 2026 generic `current_tenant_organization_id()` supports sole-membership fallback and generic service-role privileges; it is not an AI authorization boundary. The current workspace resolver may auto-bind a session.
- `can_access_lead` contains service-role bypass and cannot alone establish the actor's entitlement.
- The canonical lexical `search_organization_knowledge_v1` omits `knowledge_sources.metadata`; legacy approved chunks are not automatically provenance/consent safe.
- `courses` uses `name`; `course_batches` uses `mode,start_date`; `leads` uses `current_stage`. The AI-09D synthetic columns must never be installed as real production schema.
- Current R11 policies require `organization_has_capability(organization_id,'education_core')`; bypassing this with a privileged function would be an authorization regression.
- Supabase guidance notes that grants and RLS are **separate** controls, `SECURITY DEFINER` may bypass RLS, PUBLIC EXECUTE/default grants need explicit review, and `auth.sessions` can be consulted for logout revocation. Authoritative documentation: https://supabase.com/docs/guides/auth/sessions ; https://supabase.com/docs/guides/database/postgres/row-level-security ; https://supabase.com/docs/guides/api/securing-your-api .

## No-go and release ownership

**Owner staging ON HOLD**, 0/16 independent real witnesses; 0 independent PR reviewers. **Issues #601, #612, #613 and #614 remain release blockers.** Production and Recovery Rehearsal are not staging. Do not provision or bill a test project, create/alter GitHub environment or branch protection, deploy SQL to hosted Supabase, crawl customer sites, send messages, call models or MCP tools, alter live approval/enrollment operations, merge PR #671 or deploy Vercel based on this package.

This document and its JSON/checks are a **review packet only**. They deliberately cannot self-approve the release.
