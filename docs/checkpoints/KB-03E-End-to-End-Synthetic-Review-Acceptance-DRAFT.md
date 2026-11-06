# KB-03E — End-to-End Synthetic Knowledge Review Acceptance (DRAFT)

**Date:** November 6, 2026  
**Repository:** `yogakulamacademy/salsys-os`  
**Branch:** `feature/kb03e-review-acceptance-contract`  
**Stacked base:** `feature/kb03d-grounding-quality-evaluation` (Draft PR #557). KB-03C #555, KB-03B #553, KB-03A #551, KB-02E #549, KB-02D #547, KB-02A–C #544 and KB-01 #538 remain draft parents.

## Scope

KB-03E creates a **pure, read-only, synthetic acceptance packet** that evaluates the existing source-grounded FAQ and fact proposal workflow as a coherent whole.

The source-to-review sequence is:

`prepared website source blocks`
→ `KB-03A source-only candidates`
→ `KB-03B conservative difference and age signals`
→ `KB-03C model-ready request + synthetic untrusted model response validation`
→ `KB-03D grounding and accuracy triage`
→ `KB-03E synthetic acceptance packet`.

There are **no live model calls, website crawls, real customer page bodies, database writes, knowledge approval actions or publication**.

## Delivered

- `lib/knowledge-extraction/knowledge-review-acceptance.ts` implements `prepareSyntheticKnowledgeReviewAcceptance`. It receives the original source-scoped KB-03C request, **untrusted model-shaped JSON**, a dated grounding assessment configuration and optional KB-03B review signals.
- It independently **replays** the KB-03C validator followed by the KB-03D evaluator. Callers cannot supply an already-approved draft or skip grounding checks.
- The packet carries the source-scoped request/packet hashes, source URL, retrieval timestamp, snapshot/quote/block hashes, exact source answer, suggested question, review warnings and disposition.
- Conflicting or insufficient source evidence is **held**, otherwise still **requires manual review**. Human reviewer decisions are `not_recorded` for every entry.
- `canStore:false`, `canApprove:false`, `canPublish:false`, `dataWasStored:false`, `aiProviderWasCalled:false` are immutable output contracts. No numerical confidence score implies correctness.
- Seven release requirements remain blocked by construction: real-source/visibility verification; approved consent/retention; independently complete conflict coverage; semantic accuracy; reviewer identity/audit; isolated staging/RLS; explicit merge/deployment authorization.
- The existing organization knowledge actions are **named only for future architecture discussion**, never imported, invoked or called by the packet/UI. There is **no handoff**.
- The admin-only synthetic evidence preview shows the packet counts, blocked requirements and unconnected handoff. It reuses the existing `requireAdminWorkspaceAccess` route protection.

## Existing audited knowledge path (read-only inspection)

The current separate `app/settings/knowledge/actions.ts` uses `createKnowledgeDocumentAction` with `create_source_backed_knowledge_document_v2`; approval uses `approveKnowledgeDocumentAction` with `approve_knowledge_document_v1`, both scoped through the active organization context. Importantly, create also exposes an `approve` intent on manual form submission.

**Do not connect synthetic KB-03 candidate content directly to either existing write path.** Future integration must be new, explicitly approved work: tenant-bound authorization, consent, retention, visibility review, conflict resolution and audit must be verified independently before any human-created draft or approval RPC is invoked. The existing `p_approve` behavior should not be used to bypass review of machine-prepared content.

## Automated acceptance coverage

`tests/knowledge-extraction/knowledge-review-acceptance.test.mjs` creates two invented workshop pages ($150 vs. an older $175), prepares real source-evidence contracts, generates source-only draft candidates, binds the comparison to a chosen field/scope, simulates FAQ output and evaluates the complete KB-03C → KB-03E chain.

Scenarios include:
- One fee answer held due to the matching price variation; an unrelated FAQ still requires human verification.
- Exact quote and SHA-256 source identity preserved throughout.
- No independent conflict evaluation means a hold, not implicit approval.
- Invented answers, altered prices/questions, forged IDs, added `approved` or `publish` fields and duplicate proposals all rejected.
- Changed request hashes, forged conflict report and invalid date settings rejected.
- Stable deterministic packet IDs and an explicitly empty nonpublishable packet.
- No model, database, network, approval or publication side effects.

`tests/knowledge-ui/knowledge-evidence-review-preview.spec.ts` checks the synthetic acceptance UI, blocked release gates, disabled publishing and no knowledge write requests.

**Only the exact latest-head CI run can establish final validation.** The KB-03D parent CI passed, but KB-03E must pass independently.

## Remaining blockers

1. KB-01: approve a dedicated isolated staging environment and verified HTTPS ownership/crawler acceptance. The production discovery schema has not been deployed.
2. KB-02: approve explicit tenant evidence consent, storage scope, quote retention duration, withdrawal and deletion, tenant RLS, audit and browser-computed visibility; then stage/rehearse them.
3. KB-03: real provider integration with reviewed data processing, cost/rate controls, model abuse testing, independent semantic evaluation and monitoring are **not done**. Synthetic model JSON is not evidence of real LLM performance.
4. Human-reviewed changes need an independently authorized, audited transition into the existing knowledge workflow, with no shortcut to create-and-approve.
5. Full regression, branch reconciliation, security review, rollback and explicit owner approval are required before merge/deployment.

**Do not infer this is production-ready from passing synthetic tests.**

## Non-actions

No production or Recovery database mutation, migration, consent choice, evidence persistence, customer website crawl, model invocation, approval, Co-Pilot publication, external message, merge or deployment.
