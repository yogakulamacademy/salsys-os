# Phase C / C4 — Staff AI Lead Intelligence panel (guarded pilot)

## Delivered in this branch

- Reusable `components/ai-lead-insight-panel.tsx` with compact/no-brand styling.
- Inbox lead context panel integration. A separate lead-profile integration
  is still pending; it is **not** claimed as complete.
- User-triggered Generate and Regenerate, review-required state, source
  references, uncertainty, empty/loading/error states and staff rating.
- Source links open the permitted lead's conversation/profile. The current
  thread does not support an exact message anchor, so the UI never claims to
  navigate to a specific individual message.
- Explicit opt-in with `AI_LEAD_INSIGHTS_UI_ENABLED=true`. The panel does
  not render when the flag is absent or the CRM is in mock mode.
- Server-gated generation with active tenant, lead access, per-user hourly
  and per-organization daily quota reservations before requesting Claude.

## Why there is a separate tenant policy

The `AI_LEAD_INSIGHTS_ENABLED` model flag alone is insufficient. The C4 gate
also requires `AI_LEAD_INSIGHTS_QUOTAS_ENABLED=true`, and an explicit
`ai_lead_insight_tenant_policies.enabled=true` row for the authorized tenant.
No row is inserted or enabled by default.

The migration is in
`supabase/migrations/20261104214500_ai_lead_insight_usage_gate_v1.sql`.
It implements a service-role-only RPC and atomic usage counters, with
default per-user limit of 6 attempts/hour and tenant limit of 40 attempts/day.
Limits apply to **attempts**, including provider timeouts and invalid
model results, not just successful responses. This conservatively prevents
unbounded spend and automated bypass via repeated failed calls. SQL enforces
these rules under concurrent requests.

Do not activate until limits have been reviewed for the target tenant.

## Required gates before pilot

1. C1, C2, C3 dependency PRs pass review and land in order.
2. Apply and read back the C3 feedback migration and C4 quota migration using
   the standard migration promotion workflow.
3. Verify tenant isolation using authorized and denied real sessions (no
   customer data in general logs).
4. Finish the lead-profile UI placement and implement audit-friendly usage
   monitoring, a documented retention schedule and spend alerts.
5. Perform a controlled live Claude test with permitted consent-compatible
   records; inspect factual claims and citation relevance (the validator
   checks citation authorization, not semantic truth).
6. Configure server-only `AI_LEAD_INSIGHTS_CONTEXT_HMAC_KEY` if storing
   feedback receipts, and keep `AI_LEAD_INSIGHTS_INCLUDE_PRIVATE_NOTES`
   disabled absent separate review.
7. Configure production flags ONLY after C4 acceptance and verified tenant
   policy. Do not expose any of them as `NEXT_PUBLIC_` values.

## Feature flag checklist

| Server variable | Default when absent |
| --- | --- |
| `AI_LEAD_INSIGHTS_ENABLED` | Generation off |
| `AI_LEAD_INSIGHTS_UI_ENABLED` | Panel hidden |
| `AI_LEAD_INSIGHTS_QUOTAS_ENABLED` | Generation denied |
| `AI_LEAD_INSIGHTS_FEEDBACK_ENABLED` | Feedback capture off |
| `AI_LEAD_INSIGHTS_CONTEXT_HMAC_KEY` | Receipt signing unavailable |
| `AI_LEAD_INSIGHTS_INCLUDE_PRIVATE_NOTES` | Private notes excluded from provider |

## What this does NOT do

- No automatic messages, follow-up creation or provider sending.
- No automatic lead-stage changes or payment/enrollment status updates.
- No payment probability or model-reported conversion score.
- No human identity merge based on AI inference.
- No claim that a referenced message semantically supports a conclusion
  without human review.
- No production activation in this PR.

## Remaining before Phase C closeout

- Lead-profile UI integration (and mobile layout checks).
- Full CI, migration replay, browser tests, security review and controlled
  production acceptance.
- Staff feedback operational QA, usage monitoring, budget alarms, retention
  and model performance evaluation.
