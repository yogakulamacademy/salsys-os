# KB-04C — Cross-Page Change Impact and Historical Citation Review (DRAFT)

**Date:** November 6, 2026
**Stacked on:** KB-04B, Draft PR #563 (which is stacked on KB-04A, Draft PR #561).
**Branch:** `feature/kb04c-source-change-impact-review`

## Implemented
New pure `assessSourceChangeImpact` consumes validated KB-04A same-page quotation deltas from one or more URLs on the **same exact supplied verified HTTPS hostname**. It never chooses a canonical fee, date, or policy. It does not infer semantic equivalence from text, URLs, page titles or proximity.

An external, explicitly supplied `SourceChangeBinding` must identify each quote by:
- exact change ID and prior/current side;
- exact organization, scope and field keys, with value kind;
- optional proposed effective window annotations (ISO day boundaries, exclusive end).

The function fails closed on mismatching organization, unknown quotation references, duplicated/ambiguous bindings, inconsistent field types, tampered quotes/IDs, future or invalid timestamps, and invalid source provenance.

Comparison over multiple pages is only possible when quotations were manually bound to the same field/scope. Temporal risks remain **review cues**, not factual contradictions: overlapping periods, disjoint periods, unknown effective periods, identical quotations, or solitary evidence.

A separate historical-reference input links a hypothetical published/superseded/archived knowledge version to a precise prior quote (URL, snapshot, block and quote hashes). When the quoted older source is changed/removed, a **potentially affected published citation** is reported, without editing, archiving, hiding or suppressing the existing document.

The report makes coverage limitations visible: unmapped changed quotations and historical references not represented in the supplied comparisons. Source age is a review threshold, never a deletion or retention policy.

## Admin preview
The existing admin-guarded synthetic `/settings/knowledge/evidence-preview` now includes a KB-04C section. A hypothetical $175 → $150 same-page change is bound to a fictional program and overlapping manually annotated windows. An invented published knowledge version cites the older quotation; the preview marks it *potentially affected*, not invalid or silently replaced.

The previous KB-01 through KB-04B synthetic UI remains intact, as do legacy knowledge creation, approval, retrieval and publishing routes.

## Tests
- `tests/knowledge-extraction/source-change-impact.test.mjs`: same-page history, multi-page explicit binding, overlap/nonoverlap/unknown time windows, unchanged quotations across pages, removed quotes, stale review age, published vs archived reference, incomplete history coverage, tampering, cross-tenant rejection, invalid bindings, determinism and no mutation.
- `tests/knowledge-ui/knowledge-evidence-review-preview.spec.ts`: at-risk citation appears; neither automatic update nor storage request is sent; publication remains disabled.
- Existing CI `tests/knowledge-extraction/*.test.mjs` and `npm run test:knowledge:ui` are the proposed acceptance commands. **CI/build/browser status for exact HEAD must be independently verified before marking this checkpoint validated.**

## Permanent safety boundary
`sourceTruthDetermined=false`, `semanticMappingVerifiedBySystem=false`, `websiteOwnershipVerifiedBySystem=false`, `evidenceStored=false`, `publishedKnowledgeModified=false`, and all fetch/store/suppress/approve/publish flags are `false`.

Any future suppression of newly generated unverified proposals must be implemented separately from existing approved knowledge retrieval, with explicit authenticated tenant permissions and auditability. This module is an advisory calculator only.

## Open gates / next checkpoint
- **KB-04D:** authenticated tenant-bound human change review; audited, consent-compatible handoff into the *existing* knowledge-document lifecycle. Do not add a parallel approval route.
- **KB-04E:** isolated tenant RLS, retention/deletion, real browser and provider tests, coverage reconciliation and full acceptance.
- Parent KB-01/02/03/04A/04B source verification, consent, retention, ownership expiry, robots/DNS/SSRF, staging, real-model and deployment gates remain open until separately evidenced.

## Non-actions
No live website or AI provider accessed; no job scheduled; no database or production mutation; no existing knowledge archived, updated, suppressed or published; no merge or deployment.
