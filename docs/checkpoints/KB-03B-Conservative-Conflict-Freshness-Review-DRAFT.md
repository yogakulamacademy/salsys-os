# KB-03B — Conservative Source Conflict and Freshness Review (DRAFT)

**Date:** November 6, 2026  
**Repository:** yogakulamacademy/salsys-os  
**Branch:** feature/kb03b-conflict-freshness-signals  
**Stacked on:** KB-03A Draft PR #551 (and KB-02E #549, KB-02D #547, KB-02A–C #544, KB-01 #538)

## What is implemented

A **pure, deterministic, non-authoritative review-signal engine** in
`lib/knowledge-extraction/source-review-signals.ts`. The input is the exact
quotation/citation candidate bundles prepared by KB-03A, plus explicit
**manually reviewed comparison bindings** (`scopeKey`, `fieldKey`,
`kind`, `draftId`) and an independently supplied verified hostname.
No page scraping, AI inference, database persistence, model calls, or
publishing is performed.

The comparator intentionally does **not** guess whether two claims are
about the same offer, room, program, batch, or location. Only claims
bound to identical human-chosen field/scope keys may be compared.

Supported review signals:

1. **Price difference:** Exactly one explicitly rendered currency amount
   in each quote; only the same USD/EUR/GBP/INR currency is comparable.
   Thousands separators and two-digit decimal forms are normalized without
   floating-point rounding. Multiple amounts or dissimilar currencies are
   excluded from comparison, with explicit issues. A difference is a
   **review signal**, not a statement about the actual correct price.
2. **Date difference:** Compares one unambiguous and valid ISO `YYYY-MM-DD`
   date per quote. Date ranges and ambiguous/multiple date references
   are not compared automatically.
3. **Policy wording variation:** Compares source text in an explicitly
   matched field and flags text variation for manual interpretation.
   A wording difference is **not** declared a legal or factual contradiction.
4. **Source age:** Only checks a dated snapshot against an **explicitly
   supplied reviewAgeDays** threshold. There is no inferred expiry,
   deletion, or retention duration. Age means *recheck freshness*, not
   *incorrect* or *delete*.

Every signal carries original source URL, retrieval time, exact quote,
source-block identity, quote SHA-256, and snapshot SHA-256. It remains
`unreviewed`, `manualReviewRequired:true`, `canPublish:false`.
The entire report is `canPublish:false`, `canStore:false`, and
`sourceTruthDetermined:false`.

## Guardrails

- Exact independently supplied verified HTTPS hostname, not inferred
  from the evidence being assessed.
- Reject missing/altered source quotation hashes, source URLs, snapshot
  hashes, draft identity hashes, invalid review status, or duplicate
  comparison bindings.
- Reject source snapshots with inconsistent retrieval timestamps, implausible
  future timestamps, and groups exceeding the maximum number of citations.
- Bounded bundles, bindings, signal records, and maximum sources.
- No automatic cross-currency conversion or matching between private,
  twin-sharing, different location, currency, month, or product variants.

## Synthetic admin preview

`/settings/knowledge/evidence-preview` contains two **invented** company
pages, one with a $150 workshop fee and an older page with $175 for the
same manually annotated workshop field. The display shows a potential
price difference and a separate old-source reminder with exact quotation
and source URL. Both are explicitly nonauthoritative.

The admin-only route remains synthetic and read-only. No live tenant
source, network request, new data collection, persistence, or AI
approval/publishing was added.

## Automated coverage

`tests/knowledge-extraction/source-review-signals.test.mjs` verifies
price variations, same-amount normalization, cross-currency and room
scope protection, ambiguous multiple values, ISO-date variation and
invalid ranges, policy text differences, explicit age-threshold behavior,
URL/hash tampering, forged bindings, future/mixed timestamps and overflow.
`tests/knowledge-ui/knowledge-evidence-review-preview.spec.ts`
checks the synthetic UI signals, source citations, and disabled
publishing.

The **latest exact-head** CI, TypeScript, build, database and Playwright
checks must pass before KB-03B can be marked validated.

## Not complete

This does **not** provide AI semantic contradiction detection, inferred
program matching, natural-language date extraction, cross-currency rate
comparisons, ranking which source is correct, automatic content updates,
or safe autonomous FAQ answers. The UI does not alter the existing
approved-knowledge pipeline.

Before real ingestion, KB-01 staging acceptance, tenant authorization,
website ownership and published terms, approval of evidence consent/
retention/deletion, browser-computed visibility handling, RLS, audit
rehearsal, and an explicit deployment authorization remain mandatory.

**No production or Recovery database write, merge, crawl, scheduled
collection, autonomous reply, or knowledge publication occurred.**
