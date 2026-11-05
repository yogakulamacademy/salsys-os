# Provider-confirmed message seen activity and staff AI context — V1

## Intent
Track **verified recipient reading behavior** as a distinct CRM activity
without treating it as a reply, lead stage transition, sales intent, or
authorization to automate outreach.

The user requested that a message being *seen* be visible in Activity and
contribute to customer context. This design deliberately differentiates
exact WhatsApp message receipt evidence from Instagram thread watermarks.

## WhatsApp: exact outbound message seen

For a signed Meta WhatsApp status webhook with `status='read'`, the
existing `apply_whatsapp_message_status` RPC first verifies the
organization and provider message ID, updates canonical `messages.read_at`
and relevant automation delivery audits. That existing RPC is unchanged.

Only when `WHATSAPP_MESSAGE_SEEN_ACTIVITY_ENABLED=true`, the status
handler then calls an additive recorder that:
- finds exactly **one** outbound message in the same organization with the
  exact WhatsApp provider MID and a real `read_at`
- verifies the same-tenant message, lead and WhatsApp conversation
- inserts a system `activities` entry with type `message_seen`,
  title **WhatsApp message seen**, original confirmed timestamp and
  internal message/conversation references
- uses a stable SHA-256-derived UUIDv8 activity ID and
  `ON CONFLICT (id) DO NOTHING` so webhook retries and concurrent attempts
  are idempotent
- stores no message text, provider MID, customer number or receipt body
  in the activity

A failing enabled activity write prevents the webhook receipt from being
marked processed; the next delivery can retry safely. When the flag is
absent, the previous provider status behavior remains unchanged.

## Instagram: conversation-level read evidence only

Instagram read envelopes can contain `read.watermark` rather than one
outbound message's MID. The signed webhook now recognizes **pure read**
envelopes only when `INSTAGRAM_READ_RECEIPT_ACTIVITY_ENABLED=true`.
Require customer sender, the same business-account recipient/entry ID,
a valid watermark time and no simultaneous message/postback.

After strict unique connected-account and exact existing tenant/account/
sender conversation resolution, one stable idempotent system activity is
recorded with type `conversation_read_observed`, title **Instagram
conversation read receipt** and evidence confidence
`conversation_watermark_only`.

This does **not** claim any particular outgoing CRM message was opened,
and it does not import previously ignored read envelopes or create leads.

## AI / staff usage

The existing tenant-scoped `getLeadContextV1(..., 'staff_insight')`
builder already retrieves the latest 30 activities for an authorized lead.
Those new timeline entries are eligible as **evidence** in staff insights
and the Journey/Activity interface, without copying private message text.

The `customer_draft` audience intentionally excludes staff activities.
Read evidence cannot be interpreted as confirmed interest, consent,
eligibility, payment, or a customer reply. It must never autonomously
queue a follow-up or switch funnel stage solely because of a read receipt.

## Safe rollout

1. Keep both new environment flags **absent/OFF in production** initially.
2. Pass CI, CodeQL, synthetic signed-HMAC and helper tenant-boundary tests.
3. Have a tenant owner review one authentic read receipt and the linked
   outbound CRM message/thread. Verify existing read_at evidence.
4. Explicitly authorize a very small manual pilot for the relevant channel.
5. Confirm one Activity row for each eligible first-seen evidence key,
   no duplicate after retry, no false message, no funnel stage changes.
6. Consider historical reconciliation only as a separately approved,
   read-only analysis followed by an explicit controlled backfill design.

Never activate Instagram outbound-echo storage, historical imports,
autonomous messages, or existing retry workers as a side effect of this
activity feature.

## Explicit limitations

- A WhatsApp recipient can disable read receipts; absence of a read event
  is not proof that the message was unread.
- An Instagram watermark may cover multiple messages; do not assign it
  to a specific message.
- These are customer-engagement observations, not marketing consent or
  promises of an answer.
- The SHA-256-derived UUID is an idempotency identifier, not a customer
  identifier to expose to external systems.
- The opt-in flags may be enabled only after permissions/production
  acceptance and explicit review.
