# KB-06B — Audited Discovery Consent Lifecycle (DRAFT)

**Date:** November 6, 2026. Stacked on engineering-validated KB-06A Draft PR #584, NOT on main. No hosted SQL executed.

## Purpose

KB-06A refuses scanning without consent but intentionally has no owner/admin consent issuance or revocation workflow. KB-06B provides the **first disabled-by-default backend contract** for an authenticated, tenant-bound initial grant and an audited withdrawal with active-job cancellation. This is not yet evidence that a real person saw an approved privacy policy.

## SQL and authorization

- `docs/sql/KB-06B-audited-discovery-consent-lifecycle-DRAFT.sql` follows the unapplied KB-01B and KB-06A SQL. It is **not a migration** and is executed only by a disposable PostgreSQL test in CI.
- `knowledge_discovery_consent_control` is a service-role-only policy registry. `grants_enabled` is **false by default**. A separate, independently authorized operator must review the policy document, approved version and SHA-256 and set the registry before any new grant is possible.
- An initial grant RPC requires an authenticated signed-in user with an existing **auth.sessions** row, the same exact user/session in **tenant_session_bindings**, an active organization and active owner/admin membership. Generic/singleton tenancy fallback and client-supplied actor IDs are **not** accepted. An active exact-domain ownership verification, matching registry policy version/digest, explicit acknowledgement and an expiry within **7 days** are mandatory.
- Grant creates a single tenant/host/purpose record and its immutable audit entry **in one transaction**. It does not allow silent renewal or regrant after revocation; those need their own future policy-reviewed procedure.
- Withdrawal requires the same independently validated actor/session and an exact current `revision`. It serializes active job-row locking with page commits, transitions consent to withdrawn, invalidates queued/running leases and writes an append-only withdrawal audit event in a single transaction. Race conditions must also be tested on independently authorized hosted staging.
- Audit includes actor, Auth session ID, organization, exact hostname, policy version/digest, revision, event timestamp, consent expiry and number of stopped discovery jobs. No raw website page HTML, personal website quotes, passwords or access tokens are written to this audit.

## API

`app/api/knowledge/discovery/consent/route.ts` adds three endpoints at the same route:

- **GET:** authenticated organization owner/admin reads its own consent state/audit, but returns a disabled state (without touching unapplied tables) while `KNOWLEDGE_DISCOVERY_CONSENT_MANAGEMENT_ENABLED` is not exactly `true`.
- **POST (initial grant):** explicitly blocked by default, with same-origin restriction, 2KB bounded JSON, exact acknowledgement, one-to-seven-day expiry, configured exact HTTPS business host, server-side `getUser()` and tenant-admin authentication, and a **caller-scoped authenticated RPC**. The DB policy registry is an independent second control; neither the API nor client can turn it on.
- **DELETE (withdrawal):** same-origin + bounded JSON, exact host + revision, server-confirmed owner/admin, and the caller-scoped Auth RPC. Deliberately remains callable when the grant switch is disabled so an existing consent can be withdrawn. With unapplied SQL the call fails closed.

There are **no new service-role API mutations**, no auto-consent on onboarding, and no automatic website crawl.

## Engineering verification

- `tests/database/knowledge-discovery-consent-lifecycle.test.mjs` applies the exact three KB SQL drafts into a newly created disposable loopback PostgreSQL database; adds synthetic session/membership fixtures; tests missing operator policy, missing ownership, wrong user/tenant/session, employee denial, policy acknowledgement and expiry bounds, append-only audit, revocation while a scan has an active lease, stale revisions, replay prevention and absence of grants after disabling policy.
- `tests/knowledge-discovery/consent-route.test.mjs` mocks the HTTP/SSR Auth boundary; tests default-off, no unauthorized database writes, invalid policy or cross-site requests, exact configured host, caller-scoped RPC and revocation despite grant being OFF.
- CI re-runs all existing Knowledge Builder and CRM tests, TypeScript, Next.js build, browser tests and isolated PostgreSQL.
- These tests use **only synthetic identities and data** and do not independently verify Supabase Auth hosted session cleanup, real consent UX, versioned legal policy approval, tenant RLS on real staging, or downstream quote retention/deletion.

## Not production-ready

The operator-approved policy document and consent presentation UX do **not** yet exist as independently accepted product artifacts. The policy registry is a mechanism, not legal approval. No one should enable the grant switch, apply these SQL drafts, run a real website crawl, or merge the draft until the owner, privacy/security reviewers and dedicated isolated staging environment are verified. KB-04E's **16 independent staging scenarios remain open**.

**Release boundaries:** all PRs draft/unmerged, no production/recovery migration or configuration change, crawler OFF, no model-provider calls, evidence storage, knowledge approval, or deployment.
