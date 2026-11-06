# KB-02A — Website Evidence Preparation Foundation (DRAFT)

**Date:** November 6, 2026  
**Stacked on:** KB-01 branch `feature/kb01-public-website-scope` / Draft PR #538  
**Branch:** `feature/kb02-source-evidence-core`

## Purpose

Start the next phase of the SalsysOS AI Knowledge Builder **without waiting for a hosted staging environment** and without prematurely trusting, generating, approving or publishing customer website information.

The work is a pure, server-capable TypeScript normalization function, `prepareWebsiteEvidence`, accepting structured **visible-text blocks** from an upstream HTML extractor that has not yet been built. It performs **no HTTP calls**, **no AI calls**, **no database writes**, and **no CRM/Co-Pilot side effects**.

## Delivered

- Bind each evidence snapshot to the exact previously verified HTTPS hostname.
- Preserve the canonical source page URL, page title, fetch timestamp and snapshot SHA-256.
- Maintain heading hierarchy (H1/H2/H3) and original source-block index.
- Preserve short exact-source wording with only layout whitespace/control-character normalization; do not paraphrase fees, dates, policies or course details.
- Emit deterministic per-block and per-quote SHA-256 hashes for change detection and future approval references.
- Tag all fragments as `unreviewed`, never `approved`.
- Reject explicitly tagged navigation, footer, cookie, hidden, script, style and form content.
- Deduplicate repeated text **within** the current heading section only.
- Fail closed for malformed, cross-host, HTTP/credential URLs, unknown block kinds, overlong blocks, excessive page text and excessive emitted evidence.
- Return an explicit empty-content result for boilerplate-only pages instead of claiming an extraction success.

## Tests

`tests/knowledge-extraction/website-evidence.test.mjs` checks:
- source URL and heading-based citations;
- content integrity for prices, questions and answers;
- no boilerplate or script pollution;
- deterministic hashes and change detection;
- out-of-scope and malformed URL rejection;
- no silent truncation and empty page semantics;
- preserved number/text claims without auto-inference.

Added to GitHub CI, but final passing checks are required before approval.

## Strict boundaries / remaining work

- **This is a content-evidence contract, not a production HTML parser.** An independently tested standards-compliant HTML-to-visible-text parser is still needed. Never wire user-controlled page HTML directly to AI instructions.
- No raw HTML, extracted page bodies or evidence have been persisted in production or elsewhere.
- No migration/schema changes and no retrieval/approval/Co-Pilot integration in KB-02A.
- No AI-driven facts, FAQs, categorization, rephrasing or translations.
- KB-02B will connect a bounded parser to verified fetched pages, retain traceable evidence according to agreed tenant consent/retention rules, and expose it for admin review before AI drafting.
- The KB-01 parent branch remains unmerged, and all staging acceptance gates remain open.

## Release sequence

Continue KB-01 isolated staging acceptance and migration rehearsal separately from this pure extraction branch. When the parent branch is approved/merged, rebase/retarget the stacked KB-02 work with full regression checks. **No production merge or deployment without explicit approval.**
