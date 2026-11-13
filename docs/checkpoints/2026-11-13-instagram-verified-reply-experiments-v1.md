# Instagram verified reply experiments V1 — code-review checkpoint (2026-11-13)

## Decision
Implement an Instagram counterpart to Yogakulam's WhatsApp A/B drafts as an **assisted human-reply workflow**, not as a WABA template or an Instagram cold broadcast.

Standard Instagram DM API replies require a customer-initiated conversation and the currently authorized reply window. SalsysOS already has an Instagram manual sender, its policy evaluator, quick replies and suppression controls. We reuse those unchanged.

Instagram Marketing Messages (where available and permitted) are a separate opt-in capability and are **not part of this release**.

## Branch scope
- 8 tested reply situations with A/B copy (16 versions): enquiry, follow-up, fees, batch timing, online/residential, rooms, registration and continued interest
- Deterministic 50/50 assignment by organization + lead + experiment, stable for repeated previews
- Tenant-bound verified CRM first name and active linked course, no LLM-generated parameters and no sensitive field interpolation
- Preview-only API with signed-in user, active organization, can_work_lead, existing Instagram conversation and current manual DM eligibility
- Latest inbound message simple keyword signals for an operator, NOT AI-inferred/confirmed personal traits or automatic lead mutations
- Inbox chooses a verified variant, inserts a draft, and leaves final sending as an explicit separate human action
- Optional experiment identifiers on manual send re-resolve both assignment and exact unchanged body before existing Instagram policy check and Meta HTTP call
- After successful send, existing canonical message metadata records only experiment, variant and source; failed attribution is reported as sent/uncertain, never retried
- Read-only owner/admin scorecard for reply within 72h, explicit intent signals, opt-outs and last-tagged-message operational enrollment association within 30d, bounded samples with visible incompleteness warning
- Existing CRM/Meta send policy and STOP/suppression rules remain authoritative
- Enforces 1000 UTF-8 byte limit on Instagram send text

## Explicit safety and release limits
Feature is OFF by default: IG_REPLY_VARIANTS_ENABLED must equal true on server
**AND** IG_REPLY_VARIANTS_ALLOWED_ORGANIZATIONS must explicitly include the
current workspace UUID (comma-separated list). A global switch alone is
insufficient; first-customer training copy must never appear in unrelated
SalsysOS organizations.
No schema migration, retroactive customer data mutation, Meta/Instagram outbound campaign, new automation, new notification tokens, policy enablement or live send was performed.
No Meta-approved WhatsApp template is used for Instagram standard DM replies.
Do not enable for cold or expired-window follow-ups. No 'HUMAN_AGENT' override is added.
A/B metrics are **not** proof of incremental lift. No real metrics are available until there are successful tagged manual sends.

## Validation required before rollout
1. New deterministic tests, typecheck, build, existing Instagram operations and Webhook replay regression suite.
2. Owner/admin and assigned employee tests; unassigned, revoked and cross-tenant accounts denied by preview and sending.
3. Verify verified-name/course absence, malicious placeholder strings, stale A/B preview, edited text, concurrent echo and idempotent send lineage.
4. Verify current standard Instagram 24h policy, closed window, suppression/STOP, missing permissions and provider rejection.
5. Witness a narrow authorized test with exactly one opted-in customer within the standard DM window; confirm a human clicked Send and one canonical outbound record includes the variant ID.
6. Confirm scorecard 72h associations and later genuine enrollment attribution, no fabricated conversions, and sample truncation warnings.
7. Obtain qualified independent review and release approval. Preserve R2 and AI staging holds; no merges/deployments before authorization.

## Lifecycle
- V1 code submitted as draft review only.
- A later tenant-specific template registry and durable assignment/audit ledger may replace the code catalog.
- Full AI intent inference, model evaluations, sentiment and deeper CRM insights require separate consent, source-evidence and approval design.
- Do not market a feature as live until real signed-in staging and provider tests are accepted.
