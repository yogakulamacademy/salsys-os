# KB-03C — Model-Ready Draft Contract and Simulated AI Proposal Validation (DRAFT)

**Date:** November 6, 2026
**Repository:** yogakulamacademy/salsys-os
**Branch:** feature/kb03c-grounded-ai-proposals
**Parent branch:** feature/kb03b-conflict-freshness-signals (Draft PR #553)
**Earlier stacked drafts:** KB-03A #551, KB-02E #549, KB-02D #547, KB-02A–C #544, KB-01 #538.

## Delivered

`lib/knowledge-extraction/ai-draft-contract.ts` adds a model-ready, provider-independent contract and a fail-closed validator. **There is NO model invocation in KB-03C.**

`buildAIDraftingRequest(bundles, verifiedHostname)`:
- Requires existing KB-03A unreviewed source-only candidate bundles bound to an independently supplied, exact verified HTTPS hostname.
- Validates candidate identities, snapshot and quotation SHA-256 hashes, original source URLs, FAQ question/answer adjacency and citation coherence.
- Produces a bounded request with a deterministic request ID and separately expressed trusted rules vs. untrusted source data.
- Includes original source quotations, source block indexes, headings, timestamps, source-draft identities, and heuristic review reminders, not the whole website or customer conversation.
- Explicitly sets `canCallModel:false`, `canStore:false` and `canPublish:false`.

`validateAIDraftingResponse(untrustedModelOutput, request)`:
- Accepts a strict versioned JSON-object shape only, with an exactly matching request ID, no extra keys, and at most twelve proposals.
- Each proposal references exactly one supplied source draft identity.
- **FAQ:** a proposed question can be newly worded, but its answer MUST exactly match the cited source quotation; the question must pass length, character and numeric-token guards.
- **Fact:** a statement MUST equal the source quotation exactly; paraphrased, invented or supplemented facts are rejected.
- Rejects unknown/duplicate references, forged approval flags, modified prices/dates, HTML-shaped questions and unsupported response structures.
- Reattaches provenance from the trusted source request rather than trusting model-provided citations.
- Always marks every accepted proposal `unreviewed`, `grounding:exact_source_quote`, `manualReviewRequired:true`, `canStore:false`, `canPublish:false`.
- Explicitly reports `sourceClaimsVerified:false` and `meaningVerified:false`, because exact quotation is NOT proof that a website claim is accurate or a question is semantically appropriate.

## Synthetic admin preview

`/settings/knowledge/evidence-preview` now also shows two **simulated model responses** based on invented workshop evidence: a new fee-related question with a verbatim price-row answer, and an existing FAQ with its original answer.

The preview clearly says that **no AI model was contacted**. Each simulated suggestion displays its citation, source hash and human-review status. The Publish knowledge button remains disabled. This UI has no new API/DB writes and is restricted to the existing owner/admin route.

## Test coverage

`tests/knowledge-extraction/ai-draft-contract.test.mjs` verifies:
- source citations and identities;
- exact source-quote-only answers;
- generated FAQ questions without invented numeric claims;
- tampered hashes, cross-host sources and already-approved blocks being refused;
- forged proposal references, duplicate IDs, unexpected approval keys, oversized batches and unsupported JSON;
- injection-like source text remains inert data;
- zero-proposal results remain unapproved and nonpublishable.

`tests/knowledge-ui/knowledge-evidence-review-preview.spec.ts` verifies the synthetic AI section, citation source, disabled publishing, and absence of knowledge API writes.

**Latest-head CI must be checked**; older passing commits do not establish this checkpoint's validity.

## Security and semantic limits

- KB-03C **does not run a model**, contact an LLM provider, generate real customer knowledge, connect a public endpoint, persist evidence or integrate with approved Co-Pilot retrieval.
- The validator checks JSON/citation integrity and **lexical/exact quotation grounding only**. It cannot establish factual correctness, contextual completeness, semantic entailment, current pricing, eligibility, policy authority, or that generated question wording is not misleading.
- Website source text remains untrusted and may contain prompt injection. A future model boundary must keep it separated from trusted instructions, constrain tools, avoid secret access, and undergo adversarial testing.
- KB-03B conflicts and freshness warnings require manual resolution; passing KB-03C must not supersede them.
- KB-01 real staging/ownership acceptance, KB-02 evidence consent/retention/deletion/RLS audit acceptance and human approval controls remain release gates.

## Next: KB-03D

Develop independent model-output evaluation, semantic entailment/contradiction review, adversarial fixtures, and a provider sandbox behind strict feature flags **only after** explicit provider/data processing and consent decisions. Nothing may auto-approve or publish. Check role isolation, monitoring, cost, emergency stop and retention before enabling any model call.

## Non-actions

No production/recovery database changes, migration, live crawl, new retention policy, model call, customer message, knowledge approval, PR merge or deployment.
