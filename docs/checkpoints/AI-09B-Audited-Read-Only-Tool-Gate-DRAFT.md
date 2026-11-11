# AI-09B — Audited Read-Only Tool Gate (DRAFT / NOT EXECUTABLE)

**Date:** 2026-11-09  
**Review target:** [draft integration PR #671](https://github.com/yogakulamacademy/salsys-os/pull/671)  
**Priority:** P2 — governed tool permissions (AI-09).  
**Class:** Synthetic, server-only contract for future independently authorized tool execution. No live tool runner, data access, webhook, MCP endpoint, hosted SQL, provider call, or changed Co-Pilot action.

## Deliverable

- `lib/ai/read-only-tool-gate-v1.ts` adds an independent, server-only **eligibility and audit** gate. Its compiled constant `READ_ONLY_TOOL_GATE_RUNTIME_WIRED=false` cannot be toggled with environment variables.
- `tests/readiness/read-only-tool-gate-v1.test.cjs` exercises the contract using synthetic server-owned session, resource-grant and audit dependencies. It is included automatically in `npm run test:readiness` and full CI.
- A model-proposed request can specify only `toolId`, `organizationId`, `leadId`, and `query`. Exact keys and per-tool types are enforced; arbitrary SQL, URL, HTTP method, executable callback, request-supplied actor, role, granted privilege, approval or session are forbidden.
- The three inert allowlisted identifiers match AI-02: `knowledge.approved.search`, `crm.course.list`, and `crm.lead.read`. This does **not** install these as callable tools.
- The `getCurrentPrincipal` dependency models a **future trusted server** lookup of current user ID, session ID, tenant-session binding, active organization, role and membership. The module validates this object's shape but **does not authenticate it**. Only future reviewed production-auth code may implement this callback; never supply it from a model, API payload or browser.
- The `checkCurrentResourceAccess` dependency models a **future authoritative** per-tool/per-resource database grant including current lead assignment, knowledge document approval/consent and course visibility. Model-selected tenant IDs and role claims are not authorization.
- The principal is resolved a second time after resource checking to reject session rotation, membership/role change, or revoked access during preflight. This still **does not** remove the necessity to enforce Auth, RLS, consent and scoped reads within the actual database transaction.
- Each attempt requests a minimal `appendAudit` acknowledgement recording trace ID, time, recognized tool ID, server-derived tenant/actor, requested lead scope, decision and reason. Raw search text, PII, evidence, credentials, and provider payloads are not written into this audit event. A missing or failed audit acknowledgement fails closed. The dependency itself is a mock in tests; **no durable audit backend was installed**.
- Every successful result is **`review_eligible`, `executionStatus='not_wired'`, `mayExecute=false`**. There is no data return, tool result, database connection or executable callback. This module cannot read a lead or issue an API call.

## Mandatory review and activation gates

1. **Authentication integration:** Real server-only Supabase Auth validation, active `auth.sessions`/tenant session binding, revoked/expired/rotated session handling, strong membership and organization status checks, actor provenance from Auth (not request payload).
2. **Per-tool RLS and scope:** Live tenant-specific grants; employee lead ownership/assignment; staff roles; current approved and non-withdrawn Knowledge document/source consent checks; course visibility; time-of-check/time-of-use transaction safety.
3. **Audit durability and privacy:** Append-only, tamper-evident audit storage; retention/erasure/legal-basis decisions; restricted audit readers, tenant scoping, bounded metadata and failure handling.
4. **Execution:** Separate independently reviewed, narrowly scoped **read-only** dispatcher with explicit query bindings, row limits, tenant-safe output mapping and redaction. Any mutating CRM actions and outbound WhatsApp/Instagram/email require separate consent, human approval and rate/idempotency protection.
5. **Prompt injection and tool output:** Treat retrieved Knowledge and CRM strings as untrusted data. Model must never be allowed to reinterpret them as tool instructions, change permissions, request arbitrary URLs/SQL, or escalate into sending or payment actions.
6. **MCP:** Remains deferred. An MCP transport, if later needed, may route only to the separately authorized tool layer; a protocol does not grant authorization.
7. **Release:** Independently reviewed code, DBA/security (#612), privacy/legal (#613), rollback and release (#601), approved paid staging (#614), and 16 real independently witnessed cases. Current staging remains owner-**ON HOLD**. Do not merge the 200+ file draft PR directly into Git-linked production `main`.

## Synthetic acceptance boundary

- Positive: valid structurally allowed plan + two stable trusted-session lookups + authorized resource decision + successful audit results in an **inert** `review_eligible` plan.
- Negative: any other tool ID, mutating API, attacker endpoint, extra privilege/session fields, bad query/lead/tenant scope, inactive/revoked identity, member/viewer role, denied resource grant, changed session/actor/tenant between checks, Auth failure or audit failure yields **no tool execution or data**.
- Tests assert the original pinned `app/settings/knowledge/actions.ts` remains identical; current `app/conversations/copilot-actions.ts` is not wired to the new module.
- Tests use only in-memory callbacks and synthetic identities. They **cannot** certify actual Supabase authentication, real OAuth, live row-level security, real search eligibility, database audit durability, prompt safety, real CRM data isolation or staging acceptance.

**Bottom line:** This checkpoint improves the engineering trust-boundary design and its regression coverage. AI-09 is STILL incomplete for production until the real authenticated, audited and scoped executor exists and passes independent review.
