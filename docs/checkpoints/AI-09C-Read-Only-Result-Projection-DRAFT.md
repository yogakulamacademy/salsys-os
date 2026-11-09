# AI-09C — Read-only result projection and data boundary (DRAFT / DISABLED)

**Date:** 2026-11-09  
**Review target:** Draft integration PR #671.  
**Priority:** AI-09 read-only tool safety, following AI-09B eligibility gate.  
**Status:** Source-only, synthetic, not connected to any production route, Knowledge preview, current Co-Pilot, Supabase, MCP, model or real tool runner.

## New engineering artifacts

- lib/ai/read-only-tool-result-projection-v1.ts: pure server-only output-shaping contract for three proposed tools: knowledge.approved.search, crm.course.list and crm.lead.read.
- tests/readiness/read-only-tool-result-projection-v1.test.cjs: 15 no-network tests, discovered automatically by npm run test:readiness.
- Every accepted projection is an **untrusted-data-only**, immutable, bounded record list, with **mayExecute=false** and **executionStatus=not_wired**. No live records are queried or transmitted.
- The contract denies extra source fields rather than forwarding raw CRM rows: phone, email, personal notes, credentials, payment fields, role/session claims, endpoints and arbitrary fields are out of the projection schema.
- Cross-organization rows, another lead's ID, duplicate IDs, excessive row counts, malformed dates and timestamps, control/bidi characters, unexpected object prototypes/getters and whole-set mismatches fail closed. A later unsafe record rejects the complete result; no partial Knowledge is returned.
- Knowledge output requires a structurally approved document, active source and sourceTextVerified=true. This is **not proof** of real or current approval. A forged or stale source flag can pass this structural checker; the only acceptable source of truth remains the independently authorized database retrieval with current consent/source checks.
- Evidence strings are marked untrusted_data_not_instructions. This label is **not a prompt-injection defense by itself**. Future model prompts, retrieval, rendering and tool dispatch must enforce strict data-vs-command separation and no authority escalation.

## Design limits and review decisions

1. **Not real authorization.** The projection accepts a scope object as an argument; it cannot authenticate a server principal or ensure the caller supplied that scope. A future dispatcher must derive scope from signed Auth/session and tenant membership, independently check RLS and per-lead grants and audit the read within the authorized transaction.
2. **Not actual data mapping.** Fields are proposed minimum safe contracts; future DB adapters must be reviewed against the real course, lead and Knowledge schemas, purpose/PII rules, provenance and supported program dates. Never cast arbitrary raw database rows into these types.
3. **No bypass through status flags.** Approved/verified/active flags in a returned object do not establish consent, revision lineage or reviewer identity. KB-16A source-aware retrieval quarantine remains uninstalled pending security/DBA review.
4. **No user-facing send.** No replies, payment commitments, lead updates, WhatsApp/Instagram/email messaging, tool execution or MCP transport is enabled. READ_ONLY_TOOL_RESULT_RUNTIME_WIRED=false is a compile-time literal.
5. **No release yet.** Independent GitHub review, DBA/Auth/consent/audit retention approval and rollback, #601/#612/#613/#614 decisions and 16 real signed-user staging witnesses remain outstanding. Owner-held staging remains on hold. No main merge, hosted SQL, paid environment or production deployment is authorized by this checkpoint.

**Next engineering checkpoint:** Real Auth-/RLS-scoped read adapters with durable tenant-scoped audit and purpose-based redaction, first in disposable local fixtures after permission and retention policy review. The structural projector is never an authorization token.
