# KB-11B — Auth-revocation race closeout and independent migration-readiness review

**2026-11-08 · DRAFT ENGINEERING ONLY · NOT AN INSTALLABLE MIGRATION · STAGING ON HOLD**

Parent review: [consolidated PR #666](https://github.com/yogakulamacademy/salsys-os/pull/666); release gate [#601](https://github.com/yogakulamacademy/salsys-os/issues/601); security [#612](https://github.com/yogakulamacademy/salsys-os/issues/612); legal/DBA [#613](https://github.com/yogakulamacademy/salsys-os/issues/613); deferred staging budget [#614](https://github.com/yogakulamacademy/salsys-os/issues/614). An independently reviewed production migration, signed releases and hosted staging evidence **do not exist**. No owner approvals are asserted by this file.

## Finding and local-only correction

The KB-11A SQL originally called `kb_discovery_consent_actor_v1`, which checks the current Auth session, binding, organization and owner/admin membership through normal reads but **does not lock the rows**. Another transaction could revoke the real Auth session or deactivate the owner's membership after the initial check, before the draft write.

KB-11B extends **only** the existing disposable SQL rehearsal `docs/sql/KB-11A-consent-atomic-discovered-draft-REHEARSAL-DRAFT.sql`. After the same signed-session helper checks the caller, it acquires `FOR SHARE` locks on the exact `auth.sessions`, `tenant_session_bindings`, `organizations` and `organization_members` rows of that active tenant-admin session. They remain locked through the source+draft+chunk insert and any caller transaction commit. A revocation that acquired its row lock first makes the subsequent locked recheck fail. This does **not** grant permissions, install functions, or change application runtime.

`tests/database/knowledge-discovery-atomic-draft.test.mjs` adds two overlapping-transaction regressions: DELETE of the Auth session and deactivation of the admin membership **first**, with a competing draft request. The candidate must wait, deny and create no source/document/chunk after the revocation commits. It also retains KB-11A's tenant and role denies, consent withdrawal locking, proof/policy expiry checks, and chunk-failure rollback.

**Caution:** These are PostgreSQL lock-level invariants tested with stand-in Auth/session schema. They are **not** proof of real Supabase Auth, PostgREST/JWT session handling, untrusted network traffic, legal consent, or real staging acceptance. The SQL statement-time vs physical COMMIT-time proof expiry decision is still open.

## Reviewer-only migration checklist — actual dependent contracts

| Component | Source already present in repo | Exact review requirements |
|---|---|---|
| Auth and tenant binding | `docs/sql/KB-06B-audited-discovery-consent-lifecycle-DRAFT.sql` | Validate actual `auth.sessions` ownership and lifecycle, signed JWT/session binding, membership role and org active column; ensure `FOR SHARE` locks don't introduce unsafe lock order or unacceptable latency |
| Configured website | `organization_onboarding.website_url` from existing platform migrations | Verified configured domain remains stable through draft transaction, and post-onboarding website edits cannot silently relink historical drafts |
| Domain proof, jobs and pages | `KB-01B` draft and `KB-09F`–`KB-09N` **local rehearsals** | Exact active hostname, completed/partial job, fetched HTTP-200 HTML, proof expiry, lease/commit RBAC and privileged direct-write revocations |
| Consent and audited policy | `KB-06A`, `KB-06B`, `KB-06E` drafts and `KB-09T` rehearsal | Version + digest of grant, consent revision, withdrawal locking, policy OFF switch, audit immutability, legal retention and erasure |
| Knowledge source and versioned draft | Existing `20261016171500_organization_knowledge_v1.sql` and `20261103190000_ai_knowledge_provenance_readiness_v2.sql` | Confirm real CHECK/FK/trigger/RLS/GRANT semantics for source, document, chunk, audit and retrieval. Ensure no generic v2 **fallback** from discovered-page action, no auto-approval |
| New discovered-page draft RPC | KB-11A/11B **disposable SQL candidate only** | Approve public exposure or narrow invoker bridge, SECURITY DEFINER owner + empty search path, explicit EXECUTE revokes before exposure, and actual PostgREST signature; no migration until reviewed |

### Security review questions that cannot be answered by passing synthetic CI

1. Does the exact production schema match the local stand-ins, including tenant-session binding FKs, account suspension, reauthentication, transactional Auth session revocation and membership updates? What if an Auth provider revokes access without deleting the row?
2. Can an authenticated caller invoke the SECURITY DEFINER function through an exposed `public` RPC with a malformed JWT, forged tenant, stale role, RLS-escaping source or a wrong-page ID? Review default PUBLIC and inherited EXECUTE ACLs, function owner, schema exposure, transaction boundaries and `statement_timeout`/`lock_timeout`.
3. Are all direct `service_role` writes to discovery proof/job/page/consent tables and legacy unsafe functions disabled during a **future** atomic cutover without disrupting unrelated CRM or manual knowledge tools? Which exact versioned migration applies each restriction, and who may restore service?
4. Are there lock-order conflicts among session locks, onboarding website edits, job claim/commit, consent withdrawal, policy shutdown and retention erasure? Verify with authenticated two-tenant real transactions in isolated staging when authorized.
5. Can a SQL function return an `ok:true` result while an externally held transaction commits **after** proof/consent expiry? Yes, this remains an unresolved product/security/DBA **policy**; the local end-of-function clock check does not make a COMMIT-time guarantee.
6. After site consent withdrawal, what happens to manually entered drafts, snippets/chunks, approvals, cached answers, historical citations, raw fetches, logs, backups, exports and model/provider copies? No production retention period, legal basis, erasure timing or authorization is defined in this draft.
7. Should repeated Save as Draft requests on the same page create distinct versions, or be idempotent? Should a newer fetched snapshot invalidate an existing unreviewed draft? These remain product decisions, not assumed behavior.

### Mandatory release decision sequence

- **S0 / engineering:** Full cumulative GitHub diff read by independent security/DBA reviewers, deterministic local regressions + CodeQL against **the final exact SHA**, documented role grants and target SQL mapping. Tests alone do **not** grant approval.
- **S1 / governance:** Legal/privacy + DBA owner signoff on purpose, notice/digest, retention, consent withdrawal, downstream copies, erasure and COMMIT-expiry decision; external secured attestation references; protected-branch reviewer approval.
- **S2 / staging separately authorized:** Only after SalsysOS earns revenue, obtain fresh quote/currency/cost cap and **explicit** owner acceptance to create an isolated synthetic-only project, never Production or Recovery. No hosted migrations or real Auth witnesses while staging is held.
- **S3 / release:** Witness all **16** real scenarios and any added post-onboarding/withdrawal races with independent receipts; obtain separate protected merge, production change, deployment, monitoring and rollback authorization.

### Emergency containment and backout (not authorization)

Keep `KNOWLEDGE_DISCOVERY_PILOT_ENABLED` and `KNOWLEDGE_DISCOVERY_ATOMIC_DRAFT_APPROVED` disabled, pause worker, deny new evidence/candidates while preserving the owner's audited withdrawal capability, never turn on old broad privileged DML or generic source-backed fallback. Do **not** run `DROP CASCADE`, delete consent/erasure audit, copy Production/Recovery into staging or claim rollback is equivalent to deletion. An approved data-aware reverse migration must be independently reviewed later.

**Release remains BLOCKED; staging ON HOLD; independent real signed acceptance 0/16.**
