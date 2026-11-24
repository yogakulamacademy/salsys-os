# R13 manual-first pilot — decision 2026-11-24

Owner decision: manually approve plan selections for the first ten organizations; add a payment gateway after product-market fit. Free Forever and the initial fourteen-day Pro trial remain the approved policy. Prices, quotas and detailed plan entitlements remain unapproved.

## Pilot interpretation
- Ten distinct organizations admitted over the pilot lifetime, not ten registrations or ten plan-change requests. No automatic expansion or gateway switch at ten.
- Customers request published plans. Dedicated platform operator reviews and records approval. Offline confirmation is administrator-attested, never gateway-verified. Complimentary access is an explicit option, not the default. Free has no expiry; paid-tier pilot approval has an explicit end, bounded to one month in the current candidate.
- Keep the quote and gateway evidence candidates available for future integration; neither is a mandatory step for manual pilot approval. No automatic charges, card collection or renewal mandate.
- The current approval UI records authorization only. It does not activate a subscription yet. Its default-off flag is SALSYS_MANUAL_PILOT_ENABLED. Dedicated operator grants, published offers and pilot request eligibility require approved release configuration.

## Mandatory next implementation
Combine P0/P1/P2 candidates in an integrated disposable test environment. A single activation transaction must recheck the immutable manual approval, current request and active verified owner, source subscription revision, exact published offer, period and capacity. Lock in consistent order with trial conversion, request withdrawal and usage changes. Persist the versioned contract and update canonical subscription, effective workspace scopes, quotas and integration permissions together; no automatic data deletion. Extend the P2 runtime resolver, quota guard, capability/integration checks, subscription dashboard and expiry reconciliation for manual contracts. Keep existing automation/AI and privacy safety gates. Test expiry-to-Free, stale/withdrawn approval, concurrent activation and no accidental legacy grants. A future provider-verified activation must share the same versioned contract boundary, not treat manual approval as settlement.

## Release
No production migration, operator grant, payment provider, or pilot activation is authorized by this document. Validate exact combined head, real Auth and operational rollback; obtain approved commercial terms and release authorization before enabling.
