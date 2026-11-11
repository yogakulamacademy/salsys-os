# KB-02C — Standards-Based HTML5 Evidence Comparison (DRAFT)

**Date:** November 6, 2026  
**Repository:** yogakulamacademy/salsys-os  
**Draft PR:** #544, stacked on KB-01 Draft PR #538  
**Branch:** feature/kb02-source-evidence-core

## What this checkpoint does

Add a **side-by-side, standards-based HTML5 extraction path** rather than replacing the KB-02B conservative subset parser without evidence. The implementation depends on pinned **parse5 8.0.1** with the verified entities 8.1.0 dependency. The package and lockfile are updated together, including SRI integrity hashes, and GitHub's `npm ci` checks dependency consistency.

`lib/knowledge-extraction/html5-visible-text.ts`:
- Uses the HTML5 parser to construct and repair the document tree and decode HTML entities.
- Extracts headings H1–H6, paragraphs, lists, FAQ definition pairs and `details/summary` questions, and price/plan table rows while preserving quoted wording.
- Filters explicitly hidden, navigation, footer, modal/cookie, form, script, style, and other non-content elements.
- Enforces 512 KiB maximum input, 20,000 DOM nodes, maximum depth 60, 250 extracted blocks, 100,000 extracted characters and 6,000 characters per block. If exceeded, it **fails closed**; it does not silently truncate course fees, dates, discounts or policies.
- Accepts only **previously authorized HTTP 200 HTML responses** and passes the *actual response URL* through the KB-02A exact-verified-host evidence contract.
- Emits `unreviewed` provenance-bound evidence, source quotations and deterministic hashes, with no persistence or AI calls.

## Test evidence

- `tests/knowledge-extraction/html5-visible-text.test.mjs`: HTML5 auto-closing, entity decoding, malformed markup, headings/tables/FAQs, hidden content, size and depth bounds, exact-host filtering, source and quote hashes, and output stability.
- Side-by-side comparisons with the existing KB-02B conservative parser on overlapping supported markup, and a fixture where parse5 supports an HTML5 entity that the conservative parser rejects.
- `tests/knowledge-ui/knowledge-html5-browser-comparison.spec.ts`: local **Chromium `setContent()`** fixtures compare visible text and repaired document structures. No remote website or user data is fetched.
- The fixture documenting stylesheet-only hiding **must remain an explicit difference**: a static HTML5 parser can produce otherwise-hidden text that a browser excludes with computed CSS. The static parser warns `unverified_stylesheet_and_runtime_visibility` but does **not** claim that its blocks are definitively visible.
- The latest exact-commit CI and Playwright checks must be reviewed before this checkpoint can be marked fully green.

## Critical acceptance conditions not yet met

1. **Browser-computed visibility:** Production customer-content extraction needs an approved visible-text selection strategy (e.g., a sandboxed browser pass on authorized fixtures) or an explicit admin review path that does not silently trust CSS-hidden text.
2. **Authorization and consent:** Evidence must be generated only after verified domain ownership, admin authorization, and a clearly approved tenant consent scope. KB-01's hosted staging acceptance remains open.
3. **Retention:** No retention policy has been approved for raw HTML, extracted quotations, evidence history, or deleted/withdrawn content. No database persistence was added.
4. **Coverage:** Dynamic JavaScript, internationalization, structured data/JSON-LD, PDFs, images/OCR and non-semantic layouts require separate extraction decisions.
5. **Review and accuracy:** No facts, FAQ answers, or customer-facing AI responses may be generated or automatically approved from this parser. Future outputs must cite individual source blocks and respect stale/conflicting information.
6. **Integration:** The existing KB-01 crawler is still intentionally separate; it does not send customer page bodies into this parser or existing approved knowledge tables.

## Status and non-actions

The feature remains in **Draft PR #544**, stacked on the unmerged KB-01 PR. This milestone implements an additional parser and comparison suite, not a production-ready site ingestion pipeline.

**No merge, database migration, production deployment, public website crawl, evidence persistence, AI-generated knowledge, or provider messaging was performed.**
