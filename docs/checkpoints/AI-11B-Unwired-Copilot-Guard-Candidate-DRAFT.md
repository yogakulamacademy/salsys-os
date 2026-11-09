# AI-11B — Unwired Co-Pilot Guard Candidate for G01/G02 (DRAFT)

**Date:** 2026-11-09  
**Tracking:** [Issue #677](https://github.com/yogakulamacademy/salsys-os/issues/677)  
**Implementation branch:** \`integration/kb16-r2-main-preserve-20261109\`  
**Parent:** [Draft PR #671](https://github.com/yogakulamacademy/salsys-os/pull/671)

## Scope and non-actions

This checkpoint responds to two **observed synthetic weaknesses** in the existing, **human-reviewed** SalsysOS Co-Pilot. It adds a **standalone, server-only, non-wired candidate** and 13 tests. **It does not import the candidate into \`app/conversations/copilot-actions.ts\`, change current routing, touch \`app/settings/knowledge/actions.ts\`, call a provider, send a WhatsApp message, modify a lead, deploy SQL, or enable autonomous actions.**

Artifacts:
- \`lib/ai/copilot-safety-guard-candidate-v1.ts\`
- \`tests/readiness/ai11b-copilot-safety-guard-candidate.test.cjs\`
- this review packet

\`COPILOT_SAFETY_GUARD_RUNTIME_WIRED=false\`; all candidate evaluations return \`maySend=false\`, \`mayExecute=false\`, \`manualReviewRequired=true\` where applicable. The candidate never accepts a browser-controlled role, authentication proof, arbitrary system instruction, financial record or tool endpoint. It has no external side effects.

## G01 — successful model router produces a dangerously low classification

\`previewPostRouterSafety(latestInbound, modelRoute)\` uses **only the latest inbound message**, never older chat history, retrieved Knowledge chunks or the provider's explanation, to apply a conservative local severity floor. A refund demand/dispute, chargeback, legal threat, serious complaint or medical emergency is marked \`human_only\` / \`complex\` / \`handoff\` even when the successful model router says \`simple|low\`. Selected discount or policy exceptions get at least \`review\`. A model can increase severity but cannot decrease the local floor. The output includes **code-only reasons**, never the original prompt text or a model-generated justification.

**Important limitations:** These are narrowly scoped **English-language lexical patterns**, not a universal legal/safety-intent classifier. Oblique wording, other languages, sarcasm, negations, international spelling and sophisticated prompt injection can defeat or over-trigger them. A human must decide expansion, false-positive tolerance, translation, crisis treatment and whether a high-risk classification should suppress drafting completely. The existing Co-Pilot's router is **not modified** by this candidate.

## G02 — model returned unsupported payment confirmation

\`previewCopilotDraftSafety(text)\` rejects modeled affirmative payment/refund/booking/enrollment/room/certificate assertions before a hypothetical staff preview when the text lacks a separately trusted claim-validation pathway. It denies direct email/telephone echoes using the **pure direct-contact detector** from the staff-insight module, but does **not** reuse the staff-insight assertion policy or claim that those staff and customer audiences share a sufficient model. It also rejects common prompt-injection echoes, invalid/oversized content and control characters.

Only tightly bounded **neutral verification** sentences can mention an unconfirmed financial/booking event (e.g. “I cannot confirm whether your payment was received”). Sentence-by-sentence evaluation prevents a disclaimer in one sentence from laundering a positive claim in another. In review, the earlier neutral-prefix exception proved too permissive for **same-sentence clauses** separated by semicolons, commas or dashes (for example, “I cannot confirm whether your payment was received; your booking was confirmed”). It now requires a **whole-clause, tightly scoped verification grammar** rather than accepting any sentence that merely begins with “I cannot confirm” or “Please verify”. Ten adversarial mixed-clause cases and four permitted neutral questions were added to a thirteenth regression test. This is still a lexical filter, not a semantic safety certificate. The candidate **returns no model text on denial**; even accepted text is labeled \`unverified_human_review_draft_only\`, \`maySend=false\`.

**Important limitations:** A lexical filter cannot establish factual truth, guarantee absent PII, verify financial settlement, evaluate all variants and languages, or replace independent evidence validation. Conditional statements, negation and adversarial paraphrase require human adversarial testing. Screened staff drafts are **not** approved messages.

## Local test coverage (13 synthetic tests)

- Model says \`simple|low\` on multiple refund/legal/emergency/complaint scenarios → candidate high-risk override.
- Discount, special exceptions and refund-policy queries → candidate staff review.
- Neutral syllabus/timetable enquiries → no artificial high-risk floor.
- Model human-only escalation is never demoted.
- Forged actor/role/endpoint claims, invalid objects, prototype and accessor tricks → denied.
- Unsupported positive settlement, room, booking, enrollment and certificate commitments → denied, no leaked text.
- Neutral uncertainty/review wording remains displayable **only for human review**.
- Multi-sentence disclaimer followed by confirmation and intra-sentence “but/however” → denied.
- Contact details and echoed system-prompt instructions → denied.
- No live Co-Pilot/Knowledge imports and no model/database/network function in the candidate.

These are **13 test definitions**, not real model test cases or 16 signed-user witnesses. They are run by the existing \`npm run test:readiness\` glob and do not change any executable route.

## Independent decisions required before wiring

1. **AI/product safety reviewer** signs the precedence table and identifies which sensitive/latest-message classes must force handoff, blocking versus permitted draft, supported languages and accessibility constraints.
2. **Security reviewer** approves a Co-Pilot-specific output policy with trusted financial/booking evidence, fallback and false-positive handling, PII test coverage, prompt injection evaluation and privacy-preserving error messages.
3. **DBA/tenant security reviewer** reviews effective signed session, lead access and knowledge-source consent; neither the candidate nor AI-11A tests establish production RLS or current consent.
4. **Product/legal privacy** approves a human-review workflow, data processing purpose, retention and any provider copies; release issues #601/#612/#613/#614 remain open.
5. A separate **minimal code review** approves integration into the existing server action without changing the original Knowledge approval action or enabling automatic sending, followed by an owner-approved independent real staging suite (**0/16 witnessed, ON HOLD**).

**Do not close #677 as production-fixed.** At most, mark the proposed candidate *draft-engineered and source-tested*. Current Co-Pilot continues its existing human-reviewed behavior until a separate approved integration.

## AI program closure accounting

AI-10 basic routing/insight-usage foundation is on \`main\`. AI-11A now contains 26 mocked evaluation cases; AI-11B proposes local mitigations but is **not wired**. AI-12 vector caching and AI-13 MCP are **optional deferred**, not mandatory. AI-07/08 runtime prompt governance and AI-09 true Auth/RLS/audit tool execution are **not production complete**. Parent PR #671 remains DRAFT/unmerged; security review PR #676 is pinned to the earlier AI-09J baseline and does **not** approve AI-11A/B.

**Owner staging ON HOLD, 0/16 real witnesses, 0 independent security/privacy/DBA GitHub approvals, no hosted SQL or production operations authorized.**
