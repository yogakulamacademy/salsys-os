# AI-09G — Real-schema-shaped read-policy and audit rehearsal (DRAFT; DISPOSABLE LOCAL POSTGRES ONLY)

**Date:** 2026-11-09  
**Review target:** [Draft PR #671](https://github.com/yogakulamacademy/salsys-os/pull/671), `integration/kb16-r2-main-preserve-20261109`  
**Runtime:** NO live tool, NO hosted Supabase migration, NO production/staging database, NO MCP, NO Co-Pilot import.

## Engineering outcome

AI-09D previously exercised generic three-tool synthetic fixture reads. AI-09E created an uninstalled dedicated direct-session Auth preflight. AI-09F mapped *actual* CRM migration shapes and blocked Knowledge source claims that cannot be independently verified. AI-09G now exercises the linked read-policy controls **together inside one disposable PostgreSQL transaction**, using test fixtures named like the real CRM columns.

Added:

- `docs/sql/AI-09G-real-shape-read-REHEARSAL-DRAFT.sql`. Must run only in a randomly generated local database named `salsys_ai09g_<18 lowercase hex>`; requires a deliberate synthetic marker and synthetic Auth/tenant fixtures, and rejects all real `public.leads`, `public.courses`, `public.course_batches`, `public.contacts`, `public.knowledge_sources` and `public.knowledge_documents`. **Never execute this on any hosted database.**
- `tests/database/ai-real-shape-read-policy-rehearsal.test.mjs`. The standard `npm run test:financial:db` automatically runs it. It provisions a disposable localhost database, uses current synthetic Auth/session-binding fixtures, tests via independent role-assumed database connections, and force-drops the database afterward. It requires `SALSYS_ALLOW_LOCAL_DB_TESTS=1` and the exact localhost root URL guard.
- The real-shape local function `ai09g_rehearsal.read_real_shape_fixture_v1` uses ONLY `crm.course.list` and `crm.lead.read` success branches. `knowledge.approved.search` is **always denied**, as are all arbitrary/write tool IDs. All outputs include `may_execute=false`, `local_fixture_only=true` and `untrusted_data_not_instructions`.

## Tested local security requirements

| Area | Local fixture behavior |
| --- | --- |
| Tenant identity | Read derives actor/session from synthetic `auth.jwt()`, rechecks the exact `tenant_session_bindings` and `auth.sessions` records, active tenant, active owner/admin membership, and takes shared locks in the same statement. No auto-binding, sole-membership fallback or service-role path. |
| Course visibility | Real fields `public.courses(name,active,organization_id)` + `public.course_batches(mode,start_date,course_id,organization_id,active)`; requires a current synthetic `education_core` capability and enabled Admin workspace; strict tenant/parent/active checks. One earliest active batch is selected per course, at most 20 courses, with `non_residential` mapped to display `in_person`. |
| Lead visibility | Requires current same-tenant lead ID and enabled Sales workspace; only owner/admin roles in this draft. Maps actual `current_stage` into a known enum, returns `lastActivityAt:null` instead of forging a timestamp, never returns phone/email/notes. |
| Knowledge | No metadata/provenance/consent shortcut; always denies with `ai09g_knowledge_policy_unresolved`, even for authenticated owners/admins. |
| Audit | Tenant, actor, session, tool, resource and row count only; append-only triggers against ordinary modifications. Failed insert aborts data return. No raw query, text or PII is logged. |
| Negative paths | Foreign tenant, foreign lead, invalid lead stage, manager, anon, service-role, unknown/write tool, missing resource, unexpected resource, disabled capability or workspace, direct table read, audit tamper, forced audit failure, revoked `auth.sessions` row and removed direct tenant binding. |

## Explicit limitations and decisions still needed

1. **Synthetic Auth, not production signed Auth.** A disposable `auth.jwt()` reads test-supplied claims. No evidence is provided that real Supabase JWTs, session cookies, refresh rotation or `auth.sessions` revocation are correctly enforced in a deployed environment. The AI-09E preflight RPC remains absent; this SQL is an independent local rehearsal, not its implementation.
2. **Not production RLS.** The source fixtures use `SECURITY DEFINER` owned by a privileged local role, explicit `organization_id` predicates, forced RLS on the fixture tables and denied ordinary table grants. Privileged owner/bypass semantics and all real production policies still require DBA review.
3. **Role scope intentionally restrictive.** AI-09E and AI-09G allow only owner/admin in the draft. Adding admissions/manager would require a separate independently approved per-lead assignment policy, sales workspace permissions, consent/purpose analysis and tests. The current real `can_access_lead` has a general service-role bypass; never reuse that alone.
4. **Course semantics not finalized.** Choosing one earliest active batch per course is a safe illustrative bound, **not a confirmed product requirement**. Course visibility also requires a production check of `education_core`, ownership and batch-specific publish status/visibility. A production adapter must not inherit selection rules without business and security review.
5. **Knowledge remains blocked.** Canonical `search_organization_knowledge_v1` does not return `knowledge_sources.metadata`; source status/consent revision/withdrawal/verified content cannot be inferred from `approved` alone. KB-16A consent/source-history quarantine still needs independent DBA/security/legal review and a separate approved implementation.
6. **Audit durability and denial events.** The local function appends audit before returning; the test harness commits each accepted read before accessing the result. Real API commit semantics, external model release, isolation level, stream cancellation, retries/idempotency, denial logs, legal retention/deletion and privileged tamper resistance are *not* proved. Negative SQL statements rollback any audit inserts; policy for denied attempts is unresolved.
7. **No live resource grants, no production application integration.** There is no installed `supabase/migrations` entry, no Co-Pilot import, no MCP endpoint, no external model/provider invocation or production deployment. The local schema is not a production SQL proposal; migrate only after review/rebuild against actual Supabase tables with proper ownership and rollback.
8. **Release protection unchanged.** Draft PR #671 remains unmerged, no independent GitHub review, staging owner-ON HOLD at 0/16 real witnessed scenarios; issues #601, #612, #613, #614 still require approvals. Main is production-deploy-linked.

## Next authorized step

Use this evidence to draft the **production Auth/RLS/consent/audit transaction decision matrix** for independent security/DBA/legal review, and split review into small bounded changes before installing anything. Actual code deployment, hosted migrations, staging activation and automated CRM edits are not authorized by these local tests.
