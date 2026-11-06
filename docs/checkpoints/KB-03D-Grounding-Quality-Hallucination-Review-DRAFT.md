# KB-03D — Grounding Quality and Hallucination Review Signals (DRAFT)

**Date:** November 6, 2026  
**Repository:** yogakulamacademy/salsys-os  
**Branch:** feature/kb03d-grounding-quality-evaluation  
**Stacked on:** KB-03C Draft PR #555, KB-03B #553, KB-03A #551, KB-02E #549, KB-02D #547, KB-02A–C #544, KB-01 #538.

## Goal and non-goals

KB-03D adds an independent, **deterministic review triage** for simulated AI proposals. It intentionally does **not** claim genuine semantic entailment, current source truth, or hallucination-free output. It neither contacts an LLM provider nor grants write, approval or publication rights.

## Implemented

`lib/knowledge-extraction/ai-grounding-evaluation.ts`:
- **Replays the KB-03C response validator** against the original versioned, source-grounded request; rejects modified proposal identities, answers, questions, quote hashes, sources, approve flags or other mismatched results.
- Accepts an optional KB-03B review-signal report, with fail-closed structural/source-host checks; a signal tied to a proposal's exact quotation, source URL, block hash and snapshot hash produces an **unresolved source difference** hold.
- Treats an old source as a **recheck reminder** only when an explicitly provided review-age threshold is reached. The threshold is **not** a deletion or evidence-retention period.
- Where no freshness threshold or comparison report was supplied, reports coverage gaps rather than assuming the claim is current or conflict-free.
- Flags generated questions with too little lexical overlap with cited content and suspicious unsourced material terms. **Lexical overlap is not semantic verification**.
- Flags prices, dates, policies and sensitive claims for extra human review; holds quotations that resemble prompt-injection instructions as untrusted source text.
- Produces either `hold_for_resolution` or `manual_review_required`. Both have `canApprove:false`, `canPublish:false`; report state is always `not_semantically_verified` with `semanticsVerified:false`, `sourceTruthVerified:false`, `canStore:false`.
- No score or percentage is used to suggest machine-established correctness.

## Synthetic admin preview

The owner/admin-only `/settings/knowledge/evidence-preview` screen now displays a synthetic **Grounding and accuracy review** section. An invented $150 source quote is shown as held because a separately provided old source has $175 for the same explicitly annotated workshop/fee scope. An existing rescheduling FAQ still requires human review.

No customer website fetch, model call, approval operation, database write, subscription, Co-Pilot publication or external message was added.

## Regression coverage

`tests/knowledge-extraction/ai-grounding-evaluation.test.mjs` covers:
- exact answer and citation replay;
- price conflict hold without choosing the true value;
- explicit age policy, old sources and missing freshness evidence;
- unrelated/high-impact generated questions;
- prompt-injection-looking source quotations treated as inert evidence;
- forged citations, modified approval flags and unverifiable request state;
- invalid review signal reports;
- invalid age settings, future-dated content and empty responses.

`tests/knowledge-ui/knowledge-evidence-review-preview.spec.ts` confirms visible synthetic holds and that publishing remains disabled without knowledge API writes.

## Security and remaining requirements

- The freshness and lexical checks are **heuristic**. Passing them does **not** establish relevance, accuracy, entailment, legal validity or the absence of hallucinations.
- Conflict input is diagnostic, not an authoritative conflict-free certificate. Its completeness is not established.
- Genuine AI generation (provider adapter, tool restrictions, secrets, rate/cost limits, consent, data processing/retention rules, provider security review, abuse tests) is **not** enabled. A provider integration is a separate, explicitly approved stage.
- KB-01 controlled staging/ownership acceptance and KB-02 tenant consent, retention, deletion, audit/RLS and browser-computed visibility are still blockers for real evidence.
- Human approval and Co-Pilot publication must reuse an audited, independently authorized path after tenant evidence is validated.
- Stacked PRs are unmerged. Check the **exact latest-head** CI and browser results before marking this checkpoint validated; do not treat an earlier cancelled run as green.

**No production or Recovery DB mutation, live customer crawl, model call, knowledge publishing, merge or deployment occurred.**
