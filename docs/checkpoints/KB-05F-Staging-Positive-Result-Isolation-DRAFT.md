# KB-05F — Exhaustive Staging Positive-Result Isolation (DRAFT)

**Date:** November 6, 2026  
**Branch:** `feature/kb05f-complete-staging-response-isolation`  
**Parent:** KB-05E Draft PR #575, stacked on the earlier unmerged Knowledge Builder drafts.

## Why this matters

The KB-05D/05E manually approved staging harness previously considered an own-tenant read/search successful if the expected document was present. That was insufficient: a response containing the correct row **and an unrelated tenant's row** could still pass. This checkpoint makes such mixed or over-broad results fail closed. It does **not** change production knowledge retrieval semantics.

## Existing production search contract

The committed `public.search_organization_knowledge_v1` SQL returns `chunk_id`, `document_id`, `title`, `category`, `content`, `rank`, `valid_until` and `metadata`, **not `organization_id`**. The manually prepared staging fixture has one distinct, approved document per tenant with a unique `kbfixture...` marker in indexed chunk content, so cross-tenant search isolation is safely checked against the exact *expected document ID* on **every returned row**.

## Added acceptance controls

- Own-document GET must produce **exactly one** row matching the expected UUID, organization UUID and approved status. Zero rows fail as a missing positive fixture; multiple rows or wrong-scope metadata fail.
- Own-search GET must produce between **1 and 6** rows, and **every** row must have the same approved fixture's `document_id` plus nonempty content. This catches a foreign or otherwise unexpected document mixed into a correct result.
- At least one returned chunk must contain the fixture's unique `kbfixture...` marker. A result matching an unrelated indexed text field without the actual test content is not accepted as evidence of source retrieval.
- The existing negative-path rule remains strict: cross-tenant and anonymous requests return only 401/403 or HTTP 200 with an empty array; any nonempty response fails.
- Offline/mock regression tests inject leaked foreign rows into both positive document and positive search responses, an ungrounded marker and an oversized search result. All must be rejected.

The staging harness retains KB-05D's protected manual-only workflow and KB-05E's Auth-validated JWT consistency checks. It adds no new route or endpoint, Auth session, SQL writer, crawler, AI provider call or automated staging trigger.

## Important boundaries

- Only **dedicated, explicitly approved synthetic staging tenants** may be used. The known Production and Recovery Rehearsal project references remain blocked. A new project has **not** been provisioned or used.
- Actual `search_organization_knowledge_v1` supports multiple relevant documents within one tenant. The exact-one-document restriction here is **only valid for the unique isolated fixture marker** and MUST NOT be copied into the production retrieval application.
- A future staging run can provide narrow real-session read-isolation evidence, but does not independently verify ownership/consent/retention/deletion, session binding rows, browser source truth, model responses, audit or the KB-04E 16-scenario release acceptance.
- The current draft does **not** execute the protected workflow. A passed mocked test is not a substitute for actual staging isolation.
- All prior KB PRs remain draft/unmerged. No changes to `main`, production or recovery.

## Engineering validation

Exact-head GitHub Actions `validate` (unit tests, TypeScript, Next.js build and synthetic browser tests) and `financial-database` (disposable PostgreSQL) must **both** pass before closing this engineering checkpoint. Keep production release blocked regardless of those results.
