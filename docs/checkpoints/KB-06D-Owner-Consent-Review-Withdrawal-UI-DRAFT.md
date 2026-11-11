# KB-06D — Owner-Facing Discovery Consent Review and Withdrawal (DRAFT)

**Date:** November 7, 2026  
**Parent:** KB-06C Draft PR #587; all Knowledge Builder changes remain unmerged.  
**Release:** No SQL application, Production/Recovery configuration, customer crawl, external messages, AI generation, publication or deployment.

## What this checkpoint delivers

The owner/admin can navigate from **Website discovery** to **Discovery consent**. The page independently enforces the existing owner/admin workspace role on the server and uses the existing authenticated backend API for consent state. It shows only the current tenant's scoped consent records (domain/purpose, expiry, policy version, revision) and recent auditable grant/withdrawal events. It never presents a policy text as legally reviewed when no approved policy artifact has been provided.

**There is no UI capable of granting consent.** The new-grant button is disabled, with explanation that a reviewed legal notice, policy version/digest and independent operator approval do not yet exist. No generic checkbox or client-selected policy can invoke the existing grant RPC. The browser never posts to the consent grant endpoint or discovery/erasure APIs.

### Read-only access gate

`GET /api/knowledge/discovery/consent` supports a new, independent environment flag:

- `KNOWLEDGE_DISCOVERY_CONSENT_READ_ENABLED` is **OFF unless exactly `true`**. Existing `KNOWLEDGE_DISCOVERY_CONSENT_MANAGEMENT_ENABLED` behavior is preserved for legacy synthetic tests, but should **not** be enabled merely to expose the read-only page; it is independently associated with the draft grant API.
- When neither flag is ON, the backend first checks the authenticated workspace administrator, then returns an explicit **history unavailable**, with no query against unapplied KB draft tables and no invented `no consent` conclusion.
- When authorized read is enabled, the backend additionally executes `kb_discovery_consent_actor_v1` using the caller's Supabase Auth session and requires an exact caller UUID response. This checks the already-drafted KB-06B live `auth.sessions`, `tenant_session_bindings`, active organization, role and membership logic **before querying consent/audit tables**. Unbound/revoked/cross-tenant sessions are rejected, rather than shown a misleading empty history.
- The database's strict session-bound tenant RLS remains the enforcement on record reads. Results are bounded to 30 consent records and 50 recent audit events. No browser service-role credentials are used.
- If the flag is accidentally enabled against an environment without approved draft SQL, the route fails closed; **do not enable it in Production or Recovery Rehearsal**.

### Withdrawal UX (existing KB-06B authenticated RPC only)

A recorded `granted` status (even expired) can be withdrawn with a **two-step** explicit review and exact hostname typing. The only browser write is `DELETE /api/knowledge/discovery/consent` with the server-provided host and exact revision. The backend independently validates same origin, active owner/admin session and revision. Stale/conflicting revisions show an error and trigger a fresh read. A successful response is identified as a consent withdrawal, **not** metadata erasure, source quotation deletion, legal retention completion or publication.

The previous KB-06C explicit metadata-erasure RPC remains disabled and separate. The new UI never invokes it. Approval, expiry/retention and independent staged witnessing are still blockers.

## Engineering verification

- `tests/knowledge-discovery/consent-route.test.mjs` covers default-off schema avoidance, owner/admin check, separate read-only flag, inability to enable grant with a read flag, and denied unbound/revoked-session reads.
- `tests/knowledge-ui/knowledge-consent-workspace.spec.ts` covers disabled state despite malformed/misleading extra data, no browser grant writes, exact-host confirmation, single withdrawal with the current revision, audit refresh, conflict handling, error state and responsive mobile overflow, using local synthetic network fixtures.
- Full CI executes existing KB-01B/06A/06B/06C exact SQL, TypeScript, Next.js, shared CRM and Knowledge Builder Playwright regressions. **Check exact head results before calling this technically validated.**

## Still prohibited

No new consent can be granted by UI. No source/quote storage or retention duration has been approved; no automatic erasure/scheduler, legal notice, real tenant A/B acceptance or public test domain is authorized. All 16 independent KB-04E staging scenarios remain open. **Keep PR DRAFT / DO NOT MERGE, flags OFF and all KB SQL unapplied.**
