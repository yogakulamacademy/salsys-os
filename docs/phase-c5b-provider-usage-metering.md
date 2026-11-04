# Phase C5b — Usage evidence before a controlled Claude pilot

## What this change delivers

A per-request Anthropic usage receipt is created in the authorized lead's
tenant before any new AI Lead Intelligence call. The server records the
request outcome and (when the provider returns it) token usage, then
verifies the audit update **before** exposing any model result.

Code:
- `lib/ai/lead-insight-provider-usage.ts` — authorization-gated begin/finalize.
- `app/leads/insights-actions.ts` — model request is forbidden if audit
  initiation fails; provider failures are recorded as a final outcome.
- `supabase/migrations/20261104233000_ai_lead_insight_provider_usage_v1.sql`
  — private, tenant/lead-keyed usage table with forced RLS, and no
  ordinary browser/authenticated-role privileges.
- `lib/ai/lead-insight-provider-usage-summary.ts` — conservative,
  bounded token readings.
- `/settings/ai-insights` — owner/admin-only operational readout for
  provider completions, other outcomes and measured tokens.

## Security

The receipt stores only organization/lead IDs, reviewer ID, model name,
request outcome, HTTP status, four numeric token counters and timing.
No prompts, customer contacts, internal notes, message text, model
outputs, credentials or raw headers are copied to this table.

Every request must pass the original C1 lead authorization, C4 quota
reservation, and then another live tenant/lead permission check BEFORE
creating a provider request receipt. Without a persisted receipt there
is no Anthropic call.

Completion is scoped to the same lead and organization and requires
`outcome='started'` for one-time finalization. Missing token usage
stays `NULL`, never fabricated as zero. A failed finalization prevents
the model output from reaching the user. A transport interruption may
leave a `started` row; the owner dashboard reports pending counts, and
incident review is required. No automatic retries or cleanup are added.

`AI_LEAD_INSIGHTS_USAGE_LEDGER_ENABLED=true` is a **new server-only
activation prerequisite**. Absent/false means AI Lead Intelligence
generation fails closed. It must not be configured in production until
the C5 pilot gates have been explicitly approved and the migration
verified.

## Correct use of Anthropic token fields

`input_tokens`, `cache_creation_input_tokens`,
`cache_read_input_tokens`, and `output_tokens` are recorded as
provider-returned counters, when available. For an input-token total
those first three input categories must be added; however, their
commercial billing rates can differ.

These are not a USD invoice, contracted price, automatic cost alarm, or
a hard monetary spending limit. Requests ending in HTTP/network failure
may not return tokens. The dashboard labels readings as partial when
appropriate and does not guess the missing cost.

The existing atomic per-tenant/day and per-user/hour attempt quotas
remain the hard admission gate. Provider-side monetary budgets/alerts
must be configured and verified separately before live activation.

## Data retention

A proposed 90-day operational review threshold is shown for the new
usage records, matching the existing receipt/quota age indicators.
This is **not yet an approved retention schedule** and no rows are
deleted. Legal/privacy sign-off and a tested archival/deletion plan
must precede automated cleanup.

## Activation prerequisites remaining

1. Review, test and merge this PR.
2. Apply and read back the new migration; check RLS, no browser grants,
   tenant-specific foreign keys, and zero exposed rows.
3. Agree on permitted data, consent/notice, retention and deletion plan.
4. Configure provider-side spending limits and alerts as well as
   usage metrics review and incident ownership.
5. Only then enable tenant policy and server-only AI flags with a
   narrow staff pilot and an explicitly authorized or synthetic case.
6. Manually inspect citations against messages: citation existence
   alone is not proof that a claim is correct.

**Nothing in this branch** enables tenant opt-in, sends a real message,
changes payment state, switches on live Claude generation, creates a
scheduled job, or applies the production SQL migration automatically.
OpenSearch remains out of scope.
