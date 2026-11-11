# KB-05D — Dedicated Staging Auth and Knowledge Read Isolation Harness (DRAFT)

**Date:** November 6, 2026  
**Stack:** KB-05C Draft PR #573 → KB-05D, not `main`  
**Scope:** Manual, read-only **knowledge-data** acceptance in an owner-approved *separate* Supabase project. Not yet executed on any hosted database.

## Why this checkpoint

KB-05A/05B/05C pass synthetic PostgreSQL RLS and session-bound authorization tests, but their fake `request.jwt.claims` are **not signed Supabase access tokens**. KB-04E still has **0 of 16 independently verified staging scenarios**. This change supplies a deliberately narrow real-session test path. It neither creates nor chooses a hosted staging project.

The connected Supabase account presently lists only **SalsysOS Production** and **SalsysOS Recovery Rehearsal**. The tester expressly refuses both known project refs, and never uses the existing production authenticated-E2E workflow.

## Delivered

- `scripts/verify-kb-isolated-staging-readonly.mjs`: Node 22 runner with a **pure, no-network configuration preflight**. Exact HTTPS `https://<20-character-project-ref>.supabase.co` target, explicit manual approval phrase, distinct organizations/users/documents/markers, user-ID expectations, required test credentials and known prod/recovery project denylist.
- Two password sign-ins via **staging Supabase Auth only**; GET `/auth/v1/user` independently confirms each authenticated test identity. Signing in **creates staging Auth sessions**—do not describe the entire test as zero side effects.
- Four positive checks: each test actor can directly read *its own approved* document and retrieve its indexed approved content through the existing **STABLE** `search_organization_knowledge_v1` function, using **GET**, not POST.
- Eight negative checks: A↔B direct document reads and retrieval queries; anonymous reads and retrieval for both tenants. A negative must return HTTP 401/403 or a **200 empty list**, never a nonempty list.
- Positive controls are mandatory: missing approved fixtures, missing retrieval indexes, wrong accounts, wrong target, and errors/404s fail the run. The runner has no knowledge writes, SQL execution, crawler, provider API or approval invocation.
- `tests/knowledge-extraction/kb-isolated-staging-readonly.test.mjs`: entirely mocked HTTP regression tests with no network. Verify target refusal, credential/fixture separation, request methods/paths, positive/negative coverage, detected leakage and non-vacuous results.
- `.github/workflows/kb-isolated-staging-readonly.yml`: **manual `workflow_dispatch` only**, restricted GitHub environment `kb-isolated-staging-acceptance`, explicit typed operator approval phrase/ref and matching protected environment ref. Neither regular PR CI nor pushes can initiate a staging Auth request.

## Prerequisites (not complete)

1. Provision a **new, owner-approved** project dedicated to KB acceptance, with test-only data, its own allowed budget, policies and secrets. **Never reuse Production or Recovery Rehearsal.** The script has a denylist for currently known production/recovery refs, not a proof that an arbitrary other ref is safe.
2. Deploy a reviewed version of the intended knowledge migrations in that staging project; verify RLS, Data API exposure and functions against hosted state.
3. Create two different test-only users (A and B) with known IDs, active organization memberships and **correctly bound, fresh sessions**. Use separate organizations, with no customer data.
4. Create **one distinct approved and currently valid test document per tenant**, each with a uniquely searchable `kbfixture...` marker in the indexed chunk. Record exact document, organization and user UUIDs. Do not populate fixtures from actual customer responses.
5. Create the GitHub environment `kb-isolated-staging-acceptance`, restrict it to reviewed branches, require independent reviewers and configure environment-scoped secrets and variables listed below. A workflow file on a draft branch may not be dispatchable until it has been reviewed/introduced on the default branch. **Do not merge to unblock dispatch without a separate review.**
6. Have an authorized operator supply the exact target ref and `I_APPROVE_READ_ONLY_KB_STAGING` in a deliberate manual dispatch, and independently review the run logs and hosted RLS policies.

### Protected GitHub environment configuration

Secrets (do not paste into chats, PRs, logs or source):  
`SALSYS_KB_STAGING_ANON_KEY`, `SALSYS_KB_STAGING_A_EMAIL`, `SALSYS_KB_STAGING_A_PASSWORD`, `SALSYS_KB_STAGING_B_EMAIL`, `SALSYS_KB_STAGING_B_PASSWORD`.

Variables:  
`SALSYS_KB_STAGING_PROJECT_REF`, `SALSYS_KB_STAGING_API_URL`, `SALSYS_KB_STAGING_A_USER_ID`, `SALSYS_KB_STAGING_B_USER_ID`, `SALSYS_KB_STAGING_A_ORG_ID`, `SALSYS_KB_STAGING_B_ORG_ID`, `SALSYS_KB_STAGING_A_DOCUMENT_ID`, `SALSYS_KB_STAGING_B_DOCUMENT_ID`, `SALSYS_KB_STAGING_A_MARKER`, `SALSYS_KB_STAGING_B_MARKER`.

The script receives `SALSYS_KB_STAGING_RUN_APPROVAL` only from the explicit workflow input, not a stored default. The manual ref must equal the protected environment variable.

## Evidence status and limitations

**CI unit tests can establish only that the runner's simulated request behavior is correct. They do NOT run this manual workflow or produce real hosted staging acceptance evidence.** If an eventual operator runs the manual test successfully, it provides only:

- Real Supabase test-user identity verification via the signed-token Auth API.
- Positive owner/tenant read and search access for exactly two seeded documents.
- Denial of the other tenant's seeded documents and retrieval queries.
- Denial of anonymous reads/retrieval for the two seeded fixtures.

It **does not** test cross-tenant writes, privilege changes, concurrent sessions, old JWT expiration, `auth.sessions` revocation, deletion/retention, consent withdrawal, source provenance, live crawl protections, real AI quality, or any production state. A successful run does not establish all KB-04E 16 scenarios or authorize production.

## Non-actions

No staging project created; no website crawled; no authenticated staging session opened by CI; no Supabase hosted project queried or modified as part of KB-05D development; no customer data, knowledge mutations, policy changes, migrations, automatic approvals, publications, main merge or deployment.

**Release remains blocked and all KB draft PRs remain unmerged.**
