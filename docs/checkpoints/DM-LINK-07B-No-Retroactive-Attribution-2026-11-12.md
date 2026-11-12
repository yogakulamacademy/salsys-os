# DM-LINK-07B — No retroactive link attribution before send acceptance and activation

**Checkpoint date:** 2026-11-12  
**Feature branch:** `feature/dm-link-evidence-policy-v1-20261111`  
**Status:** Implemented as **offline pure policy code and regression tests only**. No live URL/DB, API tracking, message send, staging/production deployment or merge.

## Concrete code defect and correction

The earlier `evaluateDmLinkCommittedAttribution` allowed any visit with `issued_at <= observed_at < expires_at` after the registry's state was eventually `active`. This inadvertently allowed **retrospective attribution** of a prior link visit that occurred while the URL was `reserved` (before Meta acceptance or the database commit that activates the registry).

That matters because a link must be reserved before its Instagram DM can be sent, and the ID association is only verified after the send. A pre-activation visit might have been a URL preview, leaked token, mistaken or forwarded click, or a visitor who must not yet be associated with the CRM contact.

### Actual code change

`lib/ai/dm-link-registry-lifecycle.ts` now requires two **separate source timestamps** on the already-committed activation record:
- `providerAcceptedAt`: exact verified provider acceptance timestamp from the outbound message and accepted send provenance.
- `linkActivatedAt`: the **actual committed** DB activation timestamp, not a proposed timestamp from the planner or a browser event.

The attribution policy rejects missing, invalid, or out-of-order values unless:

```
issuedAt <= providerAcceptedAt <= linkActivatedAt <= observedAt < expiresAt
AND state = 'active'
AND sourceBindingCommitted = true
AND provenanceVerified = true
AND purposePermitted = true
AND revoked = false
AND tokenDigestMatched = true
AND requestedOrganizationId = organizationId
```

Activation exactly at expiry is rejected, and a visit exactly at activation is allowed. Repeated time checks use the prior strict ISO-8601 input parser with microsecond support. An IP-derived `country` remains only **network country-of-visit** for the URL, never the recipient's verified residence, nationality or price eligibility.

The future privileged server adapter must verify that `linkActivatedAt` is an **immutable, database-generated commit/transition timestamp** with actual on-row provenance; a client boolean, self-reported timestamp, cache or raw query parameter is untrusted. This pure function cannot provide tamper resistance or read/write transactional guarantees by itself. Ingestion must apply the attribution guard **before writing** any customer-linked visit event, and any buffered visits from the `reserved` interval must remain unattributed even after eventual activation.

## Test evidence

- Updated `tests/readiness/dm-link-registry-lifecycle-v1.test.cjs`: original 37 scenarios plus 10 new timing/order scenarios = **47 committed test cases**.
- Ran all 47 test callbacks in an isolated JavaScript runner using the **exact committed TypeScript function bodies**, with type annotations removed and a narrow synthetic transpilation shim. **47 passed, 0 failed**.
- GitHub connector write/read-back confirmed the source/test files and their exact blob hashes.
- **NOT run:** native `node --test` with TypeScript transpilation; repository `npm run test:readiness`; native `tsc --noEmit`; GitHub Actions CI/CodeQL; provider-signed Meta callbacks; real RLS/DBA transaction tests; signed-in staging acceptance. No branch-specific Actions run was previously available. These synthetic tests are insufficient for a merge/production GO.

## Integration dependency / failure modes requiring review

1. Do not supply `linkActivatedAt` from `issuedAt` or `acceptedAt`; actual DB source-of-truth transition/commit time required. Consider transaction commit ordering and clock skew in final DBA design.
2. A `reserved` URL may redirect to the approved course page only under the reviewed privacy-safe fallback, **without** recording a linked customer click or network country.
3. If activation happens after someone follows a legitimate link, **do not backfill** that visit to an Instagram recipient. This is a deliberate safety tradeoff.
4. The existing `projectDmLinkStaffEvidence` and `evaluateDmLinkReviewPipeline` currently do **not call** `evaluateDmLinkCommittedAttribution` because there is no live registry adapter; their mock observations are not evidence of verified committed activation. A future integration must require exact activation authorization before passing *any* visit to these functions.
5. Public token handling still requires expiry, HMAC digest match, tenant isolation, no referrer/URL/log leaks, reasonable rate limits and legal purpose approval; link geography remains conditional on privacy consent and reliable server-edge country evidence.
6. The offline `activate` and `retire` planner outputs are **never permission to write**. Unique message/attempt IDs, source authenticity, RLS, consent, row-version compare-and-swap and auditable DB commit remain separate pending approvals.
7. The R2 gate (#518/#531) remains NO-GO: optional behavioral collector OFF, staging acceptance 0/16 ON HOLD, independent privacy/recovery/DBA approvals incomplete. No source-only test can lift it.

## Review sequence

Reviewer first examines temporal attribution and source-trust invariants, then the two-stage send failure/acceptance proofs, finally the database and privacy model. Only then run full native branch CI in an authorized no-deploy path; do not open a PR that silently starts Vercel preview, data collection or paid staging. No new runtime integration is authorized by this checkpoint.
