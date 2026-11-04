# Phase C / C2 — Evidence-grounded staff AI insights

## Scope

C2 adds **model-generated staff-only recommendations** on top of the C1
authorized lead-context builder. It does not change message sending,
pipeline stage, payment state, enrollment, organization data, or jobs.

- \`lib/ai/lead-insight-validation.ts\`: shared structured schema and a
  fail-closed validator.
- \`app/leads/insights-actions.ts\`: explicit staff-triggered Claude call.
- \`tests/readiness/lead-insights-v1.test.cjs\`: privacy, evidence,
  authorization and provider-failure regression tests.

This action is NOT yet wired to the UI or scheduled to run. C4 will provide
a staff-only panel and an explicit Generate control.

## Activation

Server-only \`AI_LEAD_INSIGHTS_ENABLED=true\` is required before the action
can run; it is intentionally **not enabled** by this change.

Uses pre-existing server-only \`ANTHROPIC_API_KEY\` and
\`ANTHROPIC_SONNET_MODEL\` (with \`ANTHROPIC_HAIKU_MODEL\` fallback).
No new provider credentials, packages, or migration are required.

The AI provider receives minimized, bounded, contact-redacted staff
evidence. Raw internal lead notes and staff summaries are **excluded by
default** and require separate explicit server-controlled
\`AI_LEAD_INSIGHTS_INCLUDE_PRIVATE_NOTES=true\` to be sent to the model.
Do not set this flag until privacy review, tenancy controls, and customer
data handling are approved.

## Output contract

\`lead_insights_v1\` contains:

- \`summary\` with real source references;
- \`intent\` (unknown/low/medium/high), requiring inbound customer-message evidence;
- \`interests\`, sourced only from inbound messages or recorded lead preferences;
- \`objections\`, requiring inbound message evidence;
- \`nextAction\`, for staff review only, and
- \`uncertainty\` and \`reviewRequired=true\`.

No numeric prediction is made. \`insufficient_evidence\` resets unsupported
model prose to a deterministic unknown state.

Cited references must exist in the bounded authorized context snapshot.
Unknown, duplicated, cross-lead or forbidden-source references invalidate
the entire response; they are never quietly accepted. The server rejects
unverified "deposit received"/"enrollment confirmed" claims.

The result returns reference IDs, source types and timestamps; no message
bodies, staff notes, provider identifiers or credentials are returned.

## Consistency and safe failure

C2 checks the active lead and organization before the provider request and
again after generation. Changes in context or access invalidate the result.
Requests fail closed if the provider times out, refuses, truncates, returns
invalid JSON or fails the evidence validator.

The validator ensures **reference presence and source eligibility**, not
semantic truth: it cannot prove that a cited message supports a narrative
claim. Thus EVERY insight requires staff review, and C3 should add
annotation/feedback, explicit claim-level adjudication and quality tests.

No raw insight is persisted yet; C3 must design tenant-safe evidence storage,
feedback and retention policies before any persistence or bulk generation.

## C2 exit criteria

- Typecheck and readiness tests pass.
- Security scan and standard CI pass.
- No unapproved server activation flag is configured.
- Denied leads cause zero model requests.
- Cited evidence is authorized, current, source-appropriate and bounded.
- Internal notes are not forwarded by default; customer contact details
  are redacted from provider prompts.
- The action has no CRM mutation or outbound messaging capabilities.
- A model result is explicitly labeled staff-reviewed, not verified fact.

## Next

C3: feedback and output evaluation using synthetic cases + permitted
human-labeled real examples.

C4: add reviewed UX to Customer 360 / Inbox, per-lead request throttling,
status/evidence navigation, review UX and tenant-level opt-in controls.
