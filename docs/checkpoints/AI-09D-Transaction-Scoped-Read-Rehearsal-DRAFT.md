# AI-09D — Transaction-scoped Read Rehearsal (LOCAL ONLY / NO AGENT ACTIVATION)

**Date:** 2026-11-09  
**Review target:** draft PR #671, `integration/kb16-r2-main-preserve-20261109`  
**Status:** NOT A PRODUCTION MIGRATION, no hosted Supabase install, no production/staging customer data, no callable Co-Pilot tools, no MCP transport.

## What was added

- `docs/sql/AI-09D-transaction-scoped-read-REHEARSAL-DRAFT.sql`: explicitly guarded synthetic PostgreSQL-only schema `ai09d_rehearsal`. It will not run unless the database name matches a freshly generated disposable `salsys_ai09d_<18 hex>`, the synthetic fixture tables/marker exist, and actual CRM tables `leads`/`contacts` do not exist.
- `tests/database/ai-transaction-scoped-read-rehearsal.test.mjs`: one full database scenario that builds a random local PostgreSQL database, tests the SQL contract through independent role-assumed connections, and force-drops the database in `finally`. It runs automatically under the existing `test:financial:db` glob, without changing CI workflows.
- Three **local test** read branches: `crm.course.list`, `crm.lead.read`, `knowledge.approved.search`; no mutation or arbitrary SQL in the user-facing function. Current synthetic Auth claims, active session, active tenant binding and owner/admin membership are checked on each invocation.
- Current tenant/resource predicates are enforced **inside the same statement** that reads the synthetic resource. Knowledge text must be approved, source-active and verified during that read. An audit row with limited metadata must be appended before the query can return.
- The database function returns a tightly scoped, minimal JSON projection, no source phone/email/secret note fields and no raw search query in audit. This is local-only data; its `may_execute=false` means NO agent/tool activation is wired.
- Denial tests cover unknown/mutating tools, arbitrary/wildcard query inputs, foreign organization and lead IDs, unapproved member, anonymous/service-role access, direct table/audit reads, revoked session, unverified/withdrawn Knowledge, direct audit mutation and forced audit failure.

## Limits — what this does NOT prove

1. **Synthetic Auth is NOT actual Supabase Auth.** The fixture `auth.jwt()` reads a test-only session claim that the test runner itself sets. In production, identity must come from a validated signed request; never permit clients/models to claim arbitrary sub/role/session IDs.
2. **Not a production RLS test.** The synthetic tables enable and force RLS and deny direct ordinary-role grants. But their `SECURITY DEFINER` function is owned by a privileged local fixture role; it uses explicit tenant predicates and is not evidence that production invoker-RLS and privilege-bypass contracts are safe. Independent DBA review of effective real role ownership, grants and transaction identity is essential.
3. **No global audit guarantees.** Local `read_audit` rows are append-only via triggers for ordinary writes, and a failed insert aborts the read statement. A privileged DDL owner/superuser can still change the fixtures or triggers. Audit legal purpose, retention, access, tamper evidence and erasure remain unresolved.
4. **No live tool dispatcher.** Nothing under `app/`, `supabase/migrations/`, Co-Pilot or existing Knowledge approvals imports or invokes this SQL. No real tenant, lead, model, provider, WhatsApp or payment access was given.
5. **Read visibility vs. data output:** A generic approved source/status boolean is insufficient to prove real current provenance, consent or absence of prompt injection. The KB-16A source-metadata quarantine and legal/DBA approval remain open. The earlier AI-09C projector is a separate source-only schema guard, not an authorization token.
6. **Atomicity and TOCTOU:** This local stored procedure checks session and membership and performs scoped reads/audit in one transaction, with shared locks on the synthetic session/tenant rows. Re-checks, isolation semantics, concurrent revocation/withdrawal controls and transaction ownership must be independently validated for the real Supabase schema, especially for session rotation during long reads.

## Release hold

PR #671 remains DRAFT/unmerged, no independent approvals. #601, #612, #613 and #614 require independent GitHub/security, legal/privacy/DBA, staging funding, 16 real signed-user staging witnesses and an approved Git-linked Vercel production cutover/rollback. Owner's staging ON HOLD remains in place. Do not merge, install hosted SQL, launch any paid environment or enable automated tool calls based on these tests.

**Next engineering task after local DB CI passes:** map the proposed exact-field output contracts to actual production schema in **read-only review documents**, then design a separately reviewed Auth/RLS adapter and privacy-approved audit retention. Do not wire the app until approvals and staging witnesses exist.
