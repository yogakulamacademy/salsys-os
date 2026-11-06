# KB-03A — Source-Grounded Fact and FAQ Candidate Preparation (DRAFT)

Date: November 6, 2026
Repository: yogakulamacademy/salsys-os
Branch: feature/kb03a-source-backed-drafts
Stacked on: KB-02E PR #549 → KB-02D PR #547 → KB-02A–C PR #544 → KB-01 PR #538

## Objective

Create the first deterministic fact/FAQ *review candidates* using **only**
previously prepared source evidence. This does **not** call an AI model and
does **not** generate new or paraphrased answers. It is the preparatory stage
for an eventually approved AI-assisted drafting pipeline.

## Implemented

- `lib/knowledge-extraction/source-grounded-drafts.ts` converts unreviewed,
  provenance-bound source blocks into two limited kinds:
  1. **Source statement:** an exact quotation from an eligible paragraph,
     list item, or table row. It is not parsed into inferred atomic facts.
  2. **FAQ pair:** an exact question and exact answer, but **only** where
     their original source block indexes are consecutive, their heading
     paths match, the question ends with a question mark, and both
     blocks are within size limits. Nonconsecutive, orphaned, malformed,
     or oversized FAQ blocks produce explicit issues instead of invented answers.
- Every item carries source URL, fetch timestamp, snapshot SHA-256,
  source block ID/index, quote SHA-256, exact wording, and heading path.
- Detects **review reminders** for pricing, dates/schedules, eligibility/
  cancellation/policy terms, and sensitive claims. These heuristic risk tags
  are not confidence scores or accuracy judgements.
- Rejects invalid source URL, source hash, duplicate block IDs, tampered
  quotation hashes, previously approved blocks, nonmonotonic indexes,
  oversized volume, and inconsistent empty-content status.
- Every candidate remains `unreviewed`,
  `provenanceStatus: source_quote_only`,
  `manualReviewRequired: true`, and `canPublish: false`.
  The entire bundle says `canStore: false`,
  `canPublish: false`, `aiGenerated: false`.
- The **synthetic** admin evidence review preview now shows candidate
  quotations and FAQ pairs alongside their source block indexes, truncated
  SHA hashes and reminder tags. It contains no new buttons that could
  approve, store, or publish knowledge.
- Tests cover verbatim source integrity, FAQ adjacency/heading match,
  unanswered questions, prompt-injection-looking input as inert data,
  tampered hashes, offsite URLs, candidate caps, and empty source status.
- Playwright adds a read-only preview test, including zero knowledge API
  writes and a disabled Publish knowledge action.

## Important limitations

- This module does **not** use a model and should not be represented as
  AI-generated facts or FAQs. It cannot detect true contradictions,
  cross-page inconsistencies, dated prices, semantic equivalence, or missing
  information. Source words can be wrong or stale.
- It cannot independently prove that a prepared source snapshot came from a
  live owned website. Provenance validation protects consistency of supplied
  blocks, **not** the authenticity of untrusted input. That assurance depends
  on KB-01 domain ownership, pinned fetching, tenant auth, and staging review.
- Static HTML CSS/JS visibility uncertainty from KB-02C still applies.
- This branch neither persists nor sends extracted text to a model.
- No customer website has been scanned; the visible preview is **synthetic**.
- Consent, deletion, audit, and retention rules are unresolved; KB-02E's
  diagnostics are not write permissions.

## Acceptance and release gates

1. Newest-head CI: unit, TypeScript, full Next.js build, Chromium preview,
   existing knowledge and isolated PostgreSQL suites.
2. Independent evaluation of extracted browser-visible text and HTML5
   parser under controlled staging fixtures.
3. Verify tenant authorization, source authenticity, storage consent, and
   approved retention/deletion/audit contracts before any real ingestion.
4. Build conflict and freshness handling before AI-generated suggestions.
5. Human approval and knowledge publication must be separate auditable
   operations and never run in response to an unreviewed source.
6. Parent draft PRs must be independently reconciled and receive explicit
   merge/deploy approval.

## Non-actions

No production/recovery/staging database mutation; no migrations, persistence,
AI calls, automated replies, customer messaging, live network crawling,
knowledge approval, deployment, or main-branch merge.
