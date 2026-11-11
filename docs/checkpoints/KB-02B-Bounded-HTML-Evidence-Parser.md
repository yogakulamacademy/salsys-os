# KB-02B — Bounded HTML-to-Evidence Parser (DRAFT)

**Date:** 2026-11-06  
**Repository:** yogakulamacademy/salsys-os  
**Branch:** feature/kb02-source-evidence-core  
**Stacked draft PR:** #544, based on KB-01 Draft PR #538  
**Production:** Unchanged; no merge, migration, live crawl, AI generation or knowledge publishing.

## Implemented

- `lib/knowledge-extraction/html-visible-text.ts` provides an **intentionally conservative HTML parser** that accepts up to **512 KiB** of source text, 20,000 nodes, 60 levels of depth, 4 KiB per opening tag, 250 visible blocks and 100,000 characters of extracted evidence text. Excesses return explicit failure codes rather than truncating potentially important fees, dates or policies.
- Traverses supported semantic HTML elements: H1–H6, paragraphs, nested inline text, lists, table rows with cell separators, definition-list FAQs (`dt`/`dd`) and `details/summary` questions.
- Excludes known navigation, header/footer, script/style, forms, templates, hidden, cookie-consent and inaccessible subtree markers (including explicit inline `display:none` / `visibility:hidden` with `!important`).
- Decodes common named and numeric HTML entities and rejects unsupported encoded entities instead of quietly changing source text.
- Captures page title, preserves literal source quotation and punctuation, and passes extracted blocks through `prepareWebsiteEvidence` for exact HTTPS hostname validation, deterministic hashes, hierarchy, deduplication and `unreviewed` status.
- `prepareWebsiteEvidenceFromFetch` is a pure boundary accepting an **already authorized** public fetch response. It rejects all non-200 and non-HTML responses, binds provenance to the actual returned URL and never initiates a fetch itself.

## Automated coverage

`tests/knowledge-extraction/html-visible-text.test.mjs` covers:
- exact fee text, dates, price punctuation, Unicode and entity decoding;
- headings H1–H6, lists, table price pairs, definition FAQs and details questions;
- script/hidden/cookie/navigation exclusion and explicit hidden CSS;
- quoted attribute delimiters and nested inline tags;
- malicious/unknown entities, invalid attributes, malformed comments/tags and unfinished raw-text elements;
- strict limits on HTML bytes, nesting, tags, visible blocks and text lengths;
- successful and rejected fetch MIME/status cases;
- source URL host scope, deterministic hashes, explicit empty-content outcomes and no automatic approval.

The CI workflow runs the parser and KB-02A evidence tests together. Check the exact latest commit's CI status before claiming full validation.

## Critical limitations / acceptance gates

**This is NOT a standards-compliant HTML5 parser, DOM renderer or readability engine.**

- Browser error-correction rules, CSS from stylesheets, dynamically rendered JavaScript, shadow DOM, lazy-loaded content, alternate languages/encodings, images/OCR, ARIA semantics and non-standard entity references are not fully supported.
- The conservative parser may reject otherwise valid HTML or miss useful data. It must NOT be advertised as complete, authoritative site extraction or wired to customer-facing production without a maintained HTML5 parser, independent adversarial tests and browser comparison on authorized fixture sites.
- HTML and text are untrusted data. Extracted fragments must never be treated as system instructions, approved knowledge or automatically sent customer answers.
- No page bodies or evidence are stored yet. Consent and tenant-scoped retention rules still need explicit approval and a reviewed migration before any persistence.
- No modifications to KB-01's crawler, scheduler, existing knowledge RPCs or autonomous AI flows.

## Next step

KB-02C should provide a standards-compliant parser and source-grounding comparison suite, define explicit tenant consent and evidence retention, and expose an **admin-only review** flow without auto-approval. KB-01 isolated staging migration/HTTPS route acceptance remains a separate production gate.
