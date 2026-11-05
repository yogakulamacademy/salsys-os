# Message Seen Activity — read-only rollout readiness

## Background

PR #514 deployed the two disabled-by-default message-read activity recorders.
The WhatsApp path requires a provider-confirmed `read_at` on an existing
tenant-scoped outbound message with a real provider message ID. The Instagram
path records a conversation watermark, **not** a specific message view.
Neither feature flag has been enabled in production.

A read-only production snapshot on 5 November 2026 found:
- 4 WhatsApp outbound CRM messages with `read_at` recorded
- 0 existing activities of types `message_seen` and
  `conversation_read_observed`
- Both new activity capture flags absent from production
- Outbound Instagram echo processing and Instagram history imports disabled

Those historical read statuses are **not** proof that new activity recording
has been accepted in live Meta webhooks. Do not backfill them implicitly.

## Implementation

The existing owner/admin-only
`/system-health/message-sync` page now includes **Message seen · Activity
readiness**, a read-only tenant-scoped coverage preview with:
- WhatsApp outbound CRM messages with a confirmed `read_at`
- Those with an actual provider `external_message_id` and eligible for
  message-specific `message_seen` activity recording
- Those with a matching activity reference to the **same lead, same
  conversation, same message and verified provider-read source**
- Eligible messages without a matching activity
- Read messages without a provider ID, plus the number of WhatsApp
  conversations checked and both capture-flag states

The numbers are computed without returning customer names, message bodies,
phone numbers or provider message IDs to the UI. The server performs only
bounded `SELECT` queries against:
1. The active organization's WhatsApp conversations
2. The active organization's outbound messages in those conversations
   with non-null `read_at`
3. Only activities for the tenant-verified lead IDs, further restricted
   to `message_seen` and then exact evidence metadata reconciliation

Each table read is capped at **250** records plus one overflow sentinel.
Malformed rows, ambiguous duplicate message identities, query failure, or
sample overflow makes the report explicitly **unavailable**, rather than
displaying a misleading zero or implying complete coverage.

The legacy `activities` table is lead-keyed, so its lead IDs are
derived solely from the already verified tenant-scoped outbound messages.
The owner/admin check is performed before the server constructs an admin
client or calls this report. No organization value comes from the browser.

## Interpretation

- **Eligible without activity** is not necessarily a processing failure:
  most historical `read_at` rows predate the new feature.
- A positive activity-match count proves an exact stored CRM reference,
  not that Meta always sends read receipts, nor that the customer intends
  to reply.
- The report covers **WhatsApp exact message read statuses only**.
  Instagram `read.watermark` is separate thread-level evidence.
- Absence of a read receipt is not proof that the message was unread.
- A read receipt must not trigger autonomous outreach, a pipeline-stage
  change or commercial/financial inference.

## Rollout

1. Keep both read-activity capture flags OFF and validate the read-only
   audit for the intended owner/admin organization.
2. When authorized, choose a controlled WhatsApp test contact and a
   specific existing outbound message with a matching provider ID.
3. Explicitly approve a small real provider pilot before enabling
   `WHATSAPP_MESSAGE_SEEN_ACTIVITY_ENABLED`.
4. Verify the first new live signed `status=read` receipt adds exactly
   one correct `message_seen` activity; replay must not duplicate.
5. Verify the Activity timeline and staff AI evidence, with no customer
   draft leakage or automatic follow-up.
6. Design any historical backfill as an independent, explicitly approved
   operation; never infer existing historical missing activity as an
   error that should be automatically repaired.

No Meta API calls, webhook replay, database migration, customer message
send, stage update or environment flag change is part of this PR.
