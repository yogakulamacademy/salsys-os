# DM-LINK-07A — Exact send-failure provenance hardening

**Recorded:** 2026-11-12  
**Scope:** Existing isolated DM-link feature branch only; no runtime integration.  
**Status:** Security code correction and bounded offline regression checks completed. Review required before merge.  
**Previous checkpoint:** [DM-LINK-07 two-stage link lifecycle](./DM-LINK-07-Two-Phase-Link-Registry-And-Consolidated-Review-2026-11-12.md).

## Material defect found in source review

The DM-LINK-07 reservation transition previously proposed **retiring** a reserved link whenever the caller set `dispatchState='definitive_failure'`. The code comment said that only a trusted provider rejection could cause retirement, but the function did **not verify a failure proof tied to the exact outbound attempt**.

An ambiguous Instagram timeout must not be reclassified as definitive failure: the platform may have accepted a message even when its response was lost. Incorrect retirement would make source-linked visits disappear or encourage a duplicate send. This is a code-policy gap; it does not imply live customer impact because the feature is not deployed.

## Fix committed to existing feature branch

`lib/ai/dm-link-registry-lifecycle.ts` now defines `DmLinkRejectionProof` with source verification, a fixed `explicit_provider_rejection` outcome, dispatch attempt, organization/lead/conversation, exact Instagram business account and recipient, and bounded rejection timestamp.

For `dispatchState='definitive_failure'`:
- **Acceptance proof is also present** → `manual_review: conflicting_send_outcomes`, no retirement.
- **No verified rejection proof** → `hold: missing_verified_failure`, no retirement.
- **Unverified or wrong tenant/recipient/attempt/account/lead/conversation proof** → `manual_review: rejection_not_safely_bound`, no retirement.
- **Rejection outside reservation/now window** → `manual_review: rejection_time_conflict`, no retirement.
- **Exact independently verified rejection** → `retire: verified_provider_rejection` as a **proposed** CAS database transition only.
- **Unknown send/transport timeout** → remains held, not retired or resent.

The output invariants `attributionAuthorized=false` and `automaticSendAllowed=false` are maintained for every planned transition. No direct database mutation, Meta call, tracking, token issuance, or customer messaging was implemented.

The `failureProof.sourceVerified` value is **not sufficient as a browser/client input**: the future privileged server adapter must establish verified, non-replayable provider-response lineage before calling this function. Source-trusted booleans do not replace signature validation, tenant checks, a reviewed transaction, or database uniqueness.

## Tests and verification limits

- Updated `tests/readiness/dm-link-registry-lifecycle-v1.test.cjs` to **37 test scenarios** (original 28 plus 9 new negative/contradiction checks).
- The **37 original committed test callbacks** were executed against the **committed lifecycle function bodies**, with TypeScript types stripped and `transpileModule` supplied by a narrow in-memory shim; **37 passed, 0 failed**.
- GitHub repository was read through the authenticated connector; local container could not resolve `github.com` for a checkout. **No native `node --test`, full strict `tsc`, full repository CI, CodeQL, Meta/Supabase signed-in acceptance or real performance measurement** is claimed.
- GitHub Actions reports no workflow runs for `feature/dm-link-evidence-policy-v1-20261111`. Do not describe historical local tests or other PR's CI as verification of this branch.

## Independent review / release gates

1. Reviewer must verify the authenticity and consistency of **both accepted-send proofs and definitive negative send proofs**, not just matching IDs. Ambiguous or retryable errors must map to `unknown`.
2. Revalidate sent/failed reconciliation on exact `organization_id`, `lead_id`, `conversations.id`, provider account, recipient and dispatch attempt **inside an atomic, reviewed DB transition**; CAS row-version and uniqueness are still design only.
3. Approve per-conversation link attribution/privacy purpose, retention, withdrawal, deletion, and approximate network-country evidence collection; no nationality or price eligibility inference.
4. Independently run the full branch test suite, native TypeScript, CI and CodeQL before any review sign-off. Only after owner authorization can safe staging assets be provisioned; existing R2 staging hold remains controlling.
5. Existing R2 recovery/DBA/privacy gates in [#518](https://github.com/yogakulamacademy/salsys-os/issues/518) and [#531](https://github.com/yogakulamacademy/salsys-os/issues/531) remain **NO-GO** as of 2026-11-12; 0/16 witnessed staged tests and optional behavioral collector OFF.

**Explicit boundary:** no new PR, schema migration, staging resource, live redirect, visitor IP/country capture, CRM task insertion, Instagram DM, model call, merge or deployment.
