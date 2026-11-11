# KB-06F — Live-session consent authority, staging read-only negative-test harness (DRAFT)

**Date:** 2026-11-07. **Base:** KB-06E draft PR #593. **Release:** engineering only, unapplied and disabled by default.

## Why this work is needed

The existing KB-05D/05F protected manual staging workflow validates two real Supabase Auth sessions against `knowledge_documents` and `search_organization_knowledge_v1`, including cross-tenant denials. It does **not** test the later KB-06B consent actor's strict live `auth.sessions` and `tenant_session_bindings` requirement. Synthetic/disposable PostgreSQL tests cannot establish that live Supabase Auth sessions are correctly tenant-bound.

This checkpoint adds **optional** real Auth-session *read-only* checks using the existing manual environment and exact reviewed SHA. No actual authorized staging exists yet. The two connected projects remain **SalsysOS Production** and **SalsysOS Recovery Rehearsal**, both hard-denied as staging by the preflight.

## Implementation

- `scripts/verify-kb-isolated-staging-readonly.mjs` adds `consentActorPath()`, which builds only `GET /rest/v1/rpc/kb_discovery_consent_actor_v1?p_org=<uuid>`. No dynamic RPC name, no arbitrary HTTP method or URL, no grant/withdrawal/policy/erasure endpoint.
- An **opt-in** `runKbStagingReadOnlyAcceptance(config,{checkConsentActor:true})` mode preserves the original KB-05D 12 knowledge isolation checks and adds **8** consent authority checks:
  1. Tenant A's new Auth session must return exactly A's user ID for org A.
  2. Tenant B's new Auth session must return exactly B's user ID for org B.
  3. A must NOT be authorized as owner/admin for B's organization.
  4. B must NOT be authorized as owner/admin for A's organization.
  5. Anonymous RPC execution must be denied (401/403) for org A.
  6. Anonymous RPC execution must be denied (401/403) for org B.
  7. A's *old bearer* must be denied after local session logout (the JWT may otherwise remain cryptographically valid).
  8. B's old bearer must be denied after local session logout.
- Existing login verifies real user ID, issuer, JWT signed session ID and calls `/auth/v1/user`. It requires *two distinct* sessions. `finally`-style cleanup revokes all new sessions with **local-only** logout even on failures; cleanup failures are hard failures. Only Auth login/logout send POST; all knowledge/consent probes are GET. Do not print credentials, bearer tokens or consent records.
- The manual-only `.github/workflows/kb-isolated-staging-readonly.yml` adds optional `verify_consent_session_authority` boolean, default **false**. Existing read-only workflow behavior stays unchanged unless a separately approved operator opts in. It uses the existing protected environment, reviewed exact SHA/branch and exact staging project ref checks; no extra staging credentials are created.
- Offline synthetic tests prove positive own actor is essential, cross-tenant leaks, missing/malformed positive, anonymous over-privilege and revoked-session authority all fail. Also prove old 12-check mode remains unchanged and no requests run against known Production or Recovery projects.

## Conditions BEFORE enabling the manual option

1. An **independently approved disposable isolated staging Supabase project**, different from Production and Recovery, with explicit ownership and billing approval and a protected reviewed GitHub environment; neither exists in the currently visible connector inventory.
2. The staged database must include reviewed and applied **KB-06B's strict actor RPC** plus all prerequisites; no production/recovery SQL allowed. The function must be reachable through PostgREST by `authenticated` only.
3. Two genuine **test-only** owner/admin accounts (A/B) with distinct active organizations and exact live Auth `session_id` bindings. **The KB-05D workflow signs in by password to generate fresh sessions; stale pre-created bindings will not satisfy KB-06B's strict check.** Stage onboarding/auth must bind the specific newly issued sessions legitimately and independently. Do not bypass the database guard or fabricate `auth.sessions`.
4. Separate operator/reviewer confirms the precise code SHA, environment reviewers/branch restrictions, staging domain, fixture provenance, and session cleanup; no customer content or service-role keys in the browser/workflow.
5. If there is no approved session-binding path for the two test accounts yet, this read-only scenario must **fail**, rather than weakening the guard. It would then become an explicit staging blocker requiring a separately reviewed setup procedure.

## Limits of results

Even if all **20** checks return "passed", results are engineering observations and **not independently reviewed external evidence** or automatic completion of KB-04E's 16 scenarios. The report deliberately returns `independentStagingAcceptanceVerified:false` and `authorizesCrawlOrRelease:false`.

This runner tests strict *actor authority* only, not a real granted consent lifecycle, domain proof, job cancellation, raw quotation retention/erasure, policy-text legal approval, provider behavior, or knowledge publishing.

### Non-actions

No staging workflow was dispatched, no live sign-ins, no Supabase schema or data changes, no website access, AI calls, webhook sends, merge or production deployment. Keep all staging and discovery grant flags OFF. Do not merge this draft PR solely because CI is green.
