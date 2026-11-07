# KB-04A — Same-Page Snapshot Change Detection (DRAFT)

**Date:** November 6, 2026  
**Repository:** `yogakulamacademy/salsys-os`  
**Branch:** `feature/kb04a-source-snapshot-delta-preview`  
**Stacked base:** `feature/kb03e-review-acceptance-contract` (Draft PR #558). Earlier KB-01 through KB-03D drafts remain unmerged.

## What this checkpoint does

Add a **pure, deterministic, non-authoritative** change comparison between two already prepared source-evidence snapshots. No website recrawl, AI call, storage, approved knowledge update, scheduled job, or Co-Pilot activation occurs.

`lib/knowledge-extraction/website-snapshot-delta.ts`:
- Requires an **independently supplied exact verified HTTPS hostname**, identical canonical page URL for both snapshots, and strictly increasing retrieval timestamps.
- Rejects invalid/tampered evidence block IDs, quote SHA-256 values, duplicate IDs, invalid heading paths, unreviewed-status violations, out-of-order source indexes and oversized source content.
- Groups source quotations by exact heading path and block kind. Identical quotes in a group are **unchanged**, even if other source blocks move.
- If exactly one prior quote and one current quote remain unmatched within the same heading/block-kind group, flags a **possible modified source quotation**, displaying old and new exact quotes with full citation data.
- In one-to-many and many-to-many ambiguous groups, reports **added/removed** source quotes and a separate `ambiguous_text_alignment` warning rather than inventing a one-to-one edit.
- Changing a section heading does **not** imply an existing quote has been factually modified; it is shown as separately removed/added due to differing scopes.
- A page-title change gets a separate warning, not a fabricated changed knowledge item.
- Every comparison output is `unverified_snapshot_comparison`, with `sourceAuthenticityVerified:false`, `renderedVisibilityVerified:false`, `liveWebsiteChangeConfirmed:false`, `canStore:false`, `canScheduleCrawl:false`, `canApprove:false` and `canPublish:false`.

This compares evidence supplied to the function; it does **not** prove the snapshots were fetched live from an owned website. Source hashes are consistency checks, not proof of independent provenance. The existing parser cannot establish CSS or runtime visibility.

## Synthetic admin preview

The owner/admin-only `/settings/knowledge/evidence-preview` page now compares two **invented versions of the same URL** `https://sample.example.com/services`: one older example has a $175 introduction workshop fee, and the later one has $150. The UI shows both exact quotations with their date and SHA-256 reference, alongside counts for added, removed, modified and unchanged blocks. It explicitly states no real source update has been confirmed.

This deliberately does **not** replace the separate KB-03B cross-page comparison. KB-03B reviews different sources only when manually bound to identical program/offer scopes; KB-04A compares two snapshots of a single exact URL.

## Automated tests

`tests/knowledge-extraction/website-snapshot-delta.test.mjs` covers:
- Same-page modified fee with both original citation hashes.
- Unchanged/reordered content, added FAQ pairs, and explicitly removed source text.
- Ambiguous N:M group comparisons, changed headings and separate title-change warnings.
- Repeated same snapshot at two retrieval times.
- Cross-domain, alias, wrong-path, HTTP and nonmonotonic timestamp rejection.
- Tampered quote, hash, block ID, review status, index and source metadata rejection.
- Deterministic results, no approval or synchronization permissions.

`tests/knowledge-ui/knowledge-evidence-review-preview.spec.ts` covers the read-only before/after UI, no knowledge API writes and disabled publishing.

The exact final commit must pass full CI, TypeScript, Next.js build, Chromium and existing isolated knowledge/retrieval tests.

## Still to build

- **KB-04B:** Source refresh policy, approved crawl scheduling controls, website-ownership expiry, consent withdrawal, rate limiting and emergency stop—all tested on isolated staging before activation.
- **KB-04C:** Reliable cross-page semantic mapping, conflicting effective periods, stale-source risk, historical versions and suppression of unverified updates.
- **KB-04D:** Human review of changed source evidence, staged resync and audited resolution of outdated/withdrawn knowledge through the existing approval lifecycle.
- **KB-04E:** Tenant isolation, retention/deletion and performance/e2e acceptance.

The KB-01 staging/ownership and KB-02 tenant consent, retention, RLS, deletion and browser visibility gates remain open. KB-03 real model-provider evaluation and audited approval handoff are not complete.

## Non-actions

No customer website was crawled. No evidence or HTML was stored. No real AI provider was contacted. No production/recovery/staging database was mutated. No migration, change scheduler, outbound messaging, knowledge-document creation, approval, release, merge, or deployment occurred.
