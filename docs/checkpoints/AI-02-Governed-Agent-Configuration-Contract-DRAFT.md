# AI-02 — Governed Agent Configuration Contracts (DRAFT / NOT WIRED)

**Workstream:** Priority 2 — versioned platform system prompts, scoped tenant guidance, and a read-only tool-proposal allowlist.  
**Git target:** [draft integration PR #671](https://github.com/yogakulamacademy/salsys-os/pull/671).  
**Classification:** Source-only synthetic design, not approved production configuration, not a deployed prompt registry or MCP server.  
**Staging:** Owner's staging ON HOLD. 0 of 16 real independently witnessed staging cases.

## Why this is separate from existing Co-Pilot

The existing `app/conversations/copilot-actions.ts` contains its own router/reply system prompts, checked tenant knowledge, Haiku/Sonnet routing and a human-reviewed draft result. None of these existing runtime pathways import or call the new AI-02 contract. The original `app/settings/knowledge/actions.ts` and its pinned Git blob remain unchanged; Knowledge Builder approval, website discovery, provider sending and financial flows are also unchanged.

The new contract lives at `lib/ai/agent-governance-v1.ts`. It imports only the built-in SHA-256 utility and the Next.js `server-only` boundary. It has no storage client, network client, tool dispatcher, model caller, action endpoint, webhook or authorization side effect. The compiled literal `AGENT_GOVERNANCE_EXECUTION_WIRED=false` cannot be enabled by an environment flag. All successful inspections report `mayExecute:false`, including when a caller claims a prompt is already approved.

## AI-07 draft platform prompt versions

- Exact schema `schemaVersion=1`, `scope=platform`, prompt key from `admissions_router`, `admissions_reply` or `staff_insight`; positive safe integer version, `draft` status only, claimed author ID and canonical UTC creation time.
- The SHA-256 digest of the exact UTF-8 prompt body must match; the body has a strict byte range, cannot hide control characters or unknown fields, and is never included in the returned minimized preview.
- An attacker who can edit both the text and digest can still construct a **matching but unauthorized** draft. SHA-256 alone is **not** a digital signature, an immutable storage guarantee, independent human approval, or permission to run this prompt.
- Before real activation, add an independently reviewed audit-backed, revision-controlled, append-only prompt repository with owner signatures, separation of duties, admin RBAC and rollback. The server must pin the approved platform prompt version and verify its release policy at runtime; tenant content cannot replace platform policy.

## AI-08 tenant-specific guidance without system override

- Guidance is an exact structured `tenant_guidance` draft: explicit active tenant UUID, author UUID, version, `draft` status, allowlisted tone/response-length/languages and a bounded unique list of Knowledge document references.
- No arbitrary `systemPrompt`, instructions, calls, callbacks, elevated tools, reviewer spoofing or unknown fields are accepted. Returned collections are frozen copies to stop local mutation.
- The active tenant UUID argument is a **preview invariant**, not an authentication method. The future caller must get organization and role from a real authenticated session, verify membership and authorized edits in DB, and re-fetch/check each Knowledge document from the approved tenant with source and consent status. An ID in the draft is not evidence of approval.
- Real tenant instructions, if needed in a later version, require a separate review/approval and explicitly lower precedence than platform and safety policies.

## AI-09 allowlisted read-only tool PROPOSALS only

The v1 known identifiers are `knowledge.approved.search`, `crm.course.list` and `crm.lead.read`. No SQL, network operation, callback, provider token, payment mutation, media send or webhook is registered.

- Proposal IDs for tenant and actor must match a separately verified server context. Proposed read-only lead access must match the independently pre-authorized lead ID, and in this cautious v1 only `owner`/`admin` role contexts may receive a **review-eligible** classification.
- `sessionVerified`/`membershipVerified` in a caller-supplied object are **not independently cryptographically checked by this pure function**. This inspection must never be exposed directly as an authorization endpoint. The future database and application execution path must check current session, active tenant, per-lead RBAC, tool-specific purpose/consent, idempotency, limits and audit **again**, immediately before any effect.
- Even a permitted-looking read proposal always returns `executionStatus='not_wired'` and `mayExecute:false`. There is no call dispatch implementation and no MCP endpoint.
- Mutations, unknown tools, tenant/actor scope mismatches, arbitrary endpoints, mixed lead scopes, missing membership, lower roles, and forged approval or prompt fields fail closed.

## Synthetic regression criteria

`tests/readiness/agent-governance-contract-v1.test.cjs` (automatically included in `npm run test:readiness`) covers:

1. Confirm existing Co-Pilot and pinned Knowledge action **do not import** this module.
2. Validate digest, platform scope, version, author/timestamp shape and draft-only lifecycle; reject forged approved status, extra fields and tampering.
3. Validate strict same-tenant guidance, structured language/tone/options and approved-knowledge **reference shape**, without falsely treating a reference as verified content.
4. Test malformed and cross-tenant proposals, identity mismatch, non-admin, unverified session, unapproved lead target, unknown/mutating tools and endpoint smuggling.
5. Confirm all eligible candidates remain non-executable, even if the environment sets `AI_AGENT_GOVERNANCE_ENABLED=true`.
6. Confirm existing manual Knowledge approval stays the previously pinned exact blob SHA.

These tests cover pure source contracts only; they **do not** validate real OAuth logins, effective GitHub branch rules, DB RLS, stored prompt histories, production flags, real AI model safety, external MCP clients, approved automated sending, or signed isolated staging.

## Work needed to actually close Priority 2

- Independently reviewed schema and migration design for append-only platform prompt revisions, tenant guidance, review decisions and audit evidence; never presume untrusted payload `status=approved` is authority.
- Server-owned RBAC/consent gates and exact live session replay protection for prompt review and eventual tool execution.
- Separate human approval/rollback process and verification of current active tenant, document source approval, and immutable prompt digests/signatures.
- Dedicated retrieval and tool-dispatch safety suite with cross-tenant, session-revocation, prompt-injection and output-contract negative tests, **and** signed independent staging acceptance once the owner lifts the hold.
- Independent legal/privacy owner signs off on content retention, processor sharing and deletions; security and DBA sign off before any hosted SQL.
- An owner-approved production hold/deploy plan for Git-linked Vercel `main`; do not merge the combined 200+ file KB/AI candidate directly into production.
- MCP remains OPTIONAL; no reason to register an MCP server until a separate external consumer and Auth/policy model are explicitly required.

## Release barriers unchanged

- [#601](https://github.com/yogakulamacademy/salsys-os/issues/601) — release plan, isolated real signed-user witnesses (0/16), protected merge and rollback.
- [#612](https://github.com/yogakulamacademy/salsys-os/issues/612) — independent security/DBA, KB-14A approval guard and KB-16A source-level retrieval quarantine.
- [#613](https://github.com/yogakulamacademy/salsys-os/issues/613) — privacy purpose, consent, retention, deletion and processor governance.
- [#614](https://github.com/yogakulamacademy/salsys-os/issues/614) — owner's separate approval for funded staging **after revenue**.
- PR #671 stays **DRAFT/UNMERGED**, existing R2 main changes must be preserved, no old manual Knowledge approval or Co-Pilot runtime changes permitted in this workstream.

**No part of this source-only contract proves that system prompts are securely governed or tools are authorized to run in production.**
