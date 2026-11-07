# R2 — Tracking snippet consent-safe default (DRAFT)

**Status:** Proposed UI safeguard only. **Not** consent acceptance, pilot activation, production deployment, or a fix to an already-installed customer website.

**Related issue:** #588 (website SDK consent-mode/provenance verification).

## Finding

The existing CRM Tracking Snippet panel offered two install examples for the **same real website Site ID**:

- **Production:** `data-consent-mode="required"` with `salsys-consent.js`.
- **Temporary controlled test:** `data-consent-mode="granted"`, no consent UI, debug enabled.

The latter is labeled temporary, but can still be copied and installed on a real website. In `public/salsys-tracker.js`, granted mode bypasses the local analytics-preference check and can automatically call `consent({ analytics: 'granted' })` on page initialization. A matching server `explicit_granted` receipt therefore proves that a grant record exists, **not** that a visitor actively chose to grant optional analytics.

The strict tracking source database flags do not determine how an external website loads or configures its SDK. Whether the active site uses the temporary snippet must be independently verified by its owner/operator.

## Minimal proposed change

1. Remove the second, potentially misleading **temporary granted-mode test snippet** from the CRM Tracking Snippet panel.
2. Make the actual install snippet generator **always** emit `data-consent-mode="required"` and include the consent UI, retaining the existing optional lead-capture flag.
3. Run a synthetic readiness regression **against the real TSX snippet generator**, checking both lead-capture states and safe site-ID query encoding.

No changes to the event SDK, `/api/events/browser/v1`, consent RPCs, database/schema/migrations, website HTML/PHP, enrollment/payment handlers, source registration, tracking opt-in, customer events or existing consent receipts.

## Why this does not close #588

The server still supports `granted` mode and previously copied website snippets continue to work unchanged. This PR prevents this specific CRM panel from **offering new** production-unsafe examples; it does **not** stop a manually installed snippet or certify real consent choice/provenance.

A separately authorized website operator must inspect the actual live HTML/templates/tag managers/consent manager, obtain explicit site-owner acceptance, verify Reject All/withdrawal and any external consent bridging with disposable test subjects in an **isolated** staging site. Do not equate synthetic receipt tests to real choices or manually flip production settings.

Issue #520 controlled behavior pilot remains OFF, Issue #523 authenticated owner/admin report acceptance remains OPEN, Issue #531 isolated consent staging remains blocked, PR #530 consent-identity and PR #535 retention research stay draft/unmerged. No new cloud project or spending is authorized.

## Release conditions

- Run exact-branch readiness tests, TypeScript and Next.js build, full Chromium/financial CI and CodeQL; review the diff for unrelated changes.
- Confirm the Tracking Snippet UI still works with an actual permitted tenant and the existing lead-capture toggle.
- Obtain UI/website-owner approval before merging/deploying the change.
- Record explicitly whether the external production site's current script uses `required` or `granted` and whether user consent precedes optional analytics. This change cannot establish those facts.

## Rollback

Revert the UI-only commit if necessary. No SQL, event-history or tracking data migration is required.
