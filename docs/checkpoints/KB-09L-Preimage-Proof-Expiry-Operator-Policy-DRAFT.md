# KB-09L — Original proof preimage, transaction expiry policy and operator consent control

**STATUS: DRAFT / DO NOT MERGE / DO NOT DEPLOY**  
**Date:** 2026-11-08  
**Parent:** [KB-09K PR #649](https://github.com/yogakulamacademy/salsys-os/pull/649), exact unmerged parent HEAD `b61e187da46cb46e32db03b33519bb2c15715bac`.

## Threat model: service-role confirmation by known stored hash

KB-09K reduced direct privileged DML, but its public `confirm_checked_knowledge_discovery_proof_v1` accepted the *stored* `challenge_hash` as the only proof input. A compromised `service_role` client could read the hash and submit it to mark the domain verified **without ever fetching the configured website**. Code-level server-side fetch protection alone could be bypassed by a caller with a stolen service key.

### Proposed local-only engineering hardening

`docs/sql/KB-09L-proof-preimage-operator-hold-REHEARSAL-DRAFT.sql` is **not a migration** and hard-fails outside the auto-dropped random `salsys_kb09f_<18 hex>` localhost PostgreSQL fixture.

- **Retire the v1 hash-only RPC:** revoke `EXECUTE` on both public and private KB-09K v1 service proof confirmation functions in the disposable fixture.
- **New v2 service-only contract:** `confirm_checked_knowledge_discovery_proof_v2(p_organization_id,p_hostname,p_proof_token)` takes the original `salsysos-domain-verification=<64 lowercase hex>` token. It hashes these exact bytes inside PostgreSQL with SHA-256, then matches **the stored hash**, current configured HTTPS host, exact org, pending/claimed challenge, 2-minute claim window, no existing verified proof and expiry at least 5 seconds ahead. DB owns the fixed 30-day verification lifetime and returns no token in its result.
- **Existing route remains robots-safe** and checks an exact public proof-file match before calling v2. The route uses only the fetched proof's `.trim()` token at that RPC, never the stored hash; it performs a fresh signed-in-session verification after the network call and never directly updates proof rows or falls back to v1.
- **Residual limits:** The token is known to its issuing user and may be publicly visible once posted to the website. The database proves possession of a valid preimage, **not** that the caller retrieved it over the intended domain. A service-role key compromise paired with a known token or compromised server still permits abuse. The raw token travels through one service-to-PostgREST JSON argument; independent secret handling, request logging protections and service key scoping remain required.

The mainline application has **no installed v2 RPC**. Merging the draft endpoint alone would fail closed; **do not deploy or migrate** this SQL.

## Transaction-expiry decision packet — OPEN / RELEASE BLOCKER

**Observed PostgreSQL reality:** `clock_timestamp()` checks and row/advisory locks validate authorization at SQL execution time. A caller can still wrap the RPC in `BEGIN`, receive `ok=true`, hold the transaction (even actively with `pg_sleep`) past proof/challenge expiry and then `COMMIT`. Row locks postpone other writers, but do not stop elapsed time or provide a user-defined SQL callback just before physical COMMIT. Adding a 5-second buffer reduces ordinary network/transaction latency but **does not guarantee validity at COMMIT**. The disposable test demonstrates this *intentional negative*; do not mislabel it a solved proof boundary.

**Proposed operational policy for independent security-owner approval (NOT YET APPROVED):**

1. Define authorization as **proof/consent valid under current DB clock while the one-statement RPC executes**, and treat revocation as effective once withdrawal obtains its serialized lock. Explicitly state that proof may expire between that check and the actual physical commit.
2. Only call job enqueue, page commit, consent and proof confirmation through individually authorized **single PostgREST requests**, not caller-managed multi-statement/held transactions. Require short statement timeouts, bounded resource limits, a reasonable expiry buffer and post-operation monitoring; test actual hosted PostgREST transaction defaults and signed sessions.
3. If the security/privacy owner requires **physical COMMIT-time proof validity**, **REJECT the proposed policy and keep release blocked**. A materially different design plus independent database/reviewer evidence is required. No claims of a guarantee based on function code or synthetic tests.
4. In either policy, external web fetches happen only under a current host allowlist, valid ownership proof, explicit active consent, robots rules and scoped worker leases; no website work is authorized based on stale receipt metadata.

**Decision owner:** independent security reviewer/DBA and product owner must sign off the risk statement. Neither the model nor successful synthetic CI may approve it.

## Operator-controlled consent-policy approval — exact human-owned workflow

The previous KB-06B `knowledge_discovery_consent_control` registry defaults to `grants_enabled=false`; KB-09K removed direct service-role writes. In KB-09L, the only new policy object is a **private DBA-owned append-only synthetic review receipt** with exact policy bytes + SHA-256 equality, source reference, distinct security/privacy reviewer identities and distinct evidence references. It rejects UPDATE/DELETE/TRUNCATE, exposes **no service-role, authenticated or anonymous table access**, creates **no policy approval endpoint**, and never enables the grant flag. Synthetic references are tests only, **not independent review evidence**.

**Proposed manual approval sequence (future, separate, ticketed work):**

1. Privacy/legal owner approves exact text, collection purpose, notice, retention/erasure terms, grant expiry, revocation behavior, data rights and localization; security owner independently reviews Auth/roles, audit and threat model. Capture immutable external review approvals with two independent human identities and independent evidence references.
2. An authorized DBA/operator verifies the **actual exact UTF-8 policy bytes and SHA-256** against the signed source and hashes, version uniqueness and source-of-truth reference. Use independently reviewed KB-06E policy document schema after genuine migration approval (not this fixture). No service-role upload/edit endpoints.
3. In a separately approved versioned migration/change window, DBA inserts the reviewed document, writes a durable append-only policy-approval record with two independently verifiable signoffs, and enables the **exact** KB-06B policy version+hash only after all preconditions and independent checks are complete. Require separate confirmation of existing/new consent policy, public notice and rollback plan. An API user or a bare user-provided SHA must never turn this flag on.
4. Validate `get_knowledge_discovery_policy_preview_v1` through genuinely signed, tenant-bound admin sessions, and test consent grant/withdrawal/erasure under two independent tenant sessions. On any mismatch, **fail closed with grants disabled** and preserve legally required audit data. A future disable operation requires an explicit logged operator change; prior consents and erasure obligations remain in scope.
5. Separate **policy approval** from an individual tenant owner's **consent acknowledgement**, domain ownership verification and permission to crawl. Even an approved global policy is not tenant consent. A withdrawn consent cannot be silently regranted.

**Operator registry write/enable code is deliberately NOT implemented**, because this requires approved human/legal evidence and DBA roles the present synthetic fixture cannot supply. That is safer than introducing an unreviewed service or admin endpoint.

## Engineering verification (local-only)

- `tests/knowledge-discovery/verification-route.test.mjs`: fetched original token is passed to v2 and not stored digest; wrong/missing fetched proof refuses service call; errors do not return the secret; existing cross-origin, admin/session, cooldown and robots tests remain.
- `tests/database/knowledge-commit-ownership-races.test.mjs`: previous F–K suites remain. Additional **v1 revoked** / v2 minimal `EXECUTE`, malformed hash vs token refusal, wrong preimage, exact claim, expiry margin, replay and error denial; intentional **external COMMIT-after-expiry** reproduction; private operator receipt digest and distinct-reviewer checks; immutable audit receipt and disabled consent control.
- CI and CodeQL evidence must be recorded **only for the exact final SHA** after the GitHub runs finish. No synthetic pass is evidence of hosted authentication, privacy/legal authorization or production readiness.

## Release conditions still open

Gate [#601](https://github.com/yogakulamacademy/salsys-os/issues/601) **OPEN/BLOCKED at 0/16 independently witnessed real staging acceptance cases**. Independent security/reviewer [#612](https://github.com/yogakulamacademy/salsys-os/issues/612), privacy/legal/DBA [#613](https://github.com/yogakulamacademy/salsys-os/issues/613), and isolated staging/budget [#614](https://github.com/yogakulamacademy/salsys-os/issues/614) remain unresolved. Required: real signed Supabase Auth, independent tenant A/B, reviewed SQL migration and owner/RPC privilege sequencing, all writer inventory, service-key confidentiality/logging, runner/lease/consent-withdrawal races, retention and rollback, explicit expiry policy decision, operator policy approvals.

**Owner spending constraint:** any new paid staging is deferred until SalsysOS generates revenue, and then still requires **separate fresh explicit price authorization**. No resource creation is authorized by this document.

**NON-ACTIONS:** No hosted Supabase Production/Recovery/staging SQL, no real customer data, live website crawl or fetch, provider/model call, consent grant, policy activation, paid resource, GitHub ruleset/protection change, `main` merge, or deployment. PR remains **DRAFT/UNMERGED** regardless of test results.
