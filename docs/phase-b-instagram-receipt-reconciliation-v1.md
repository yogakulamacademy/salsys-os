# Phase B — Instagram inbound receipt-to-CRM reconciliation

## Why this audit exists

A webhook receipt can be marked `processed` without being a customer message.
The old inbound webhook path stored read receipts and reactions as
`message:unknown`; a later code guard now ignores these non-message
envelopes before attempting to create a CRM message. Instagram can also
emit a native contact-share template directly after a contact-containing
text message. The existing rich-inbound processor intentionally suppresses
those duplicate template envelopes only when its documented evidence test
matches.

Do not use `processed receipt minus CRM message count` as a lost-message
estimate. Do not assume that all ignored statuses are correct forever.

## Read-only production evidence observed on 5 November 2026

Across the organizations examined, the metadata-only investigation found:
- 4,470 Instagram `message:%` webhook receipts marked processed
- 2,450 exact CRM inbound matches, requiring tenant, provider MID, channel,
  direction, connected business-account ID and sender conversation
- 1,995 unmatched non-message envelopes: 1,961 read and 34 reaction
  receipts, with the stored `non_message_messaging_envelope` ignore reason
- 25 unmatched native contact-share templates tagged ignored as duplicates
- 0 other processed receipts without an exact CRM match in this snapshot
- 1 ignored-tagged template also had an exact CRM match; it is **overlap**
  requiring private review, not a reason to overwrite or delete a CRM message

The additional matched ignored-tagged record must not be double-counted.
The report partitions processed receipts by **exact match first**, then
ignored no-match categories, then review candidates. The overlap is a
separate indicator. These aggregate cross-organization findings are not
the numbers a single staff member is authorized to see in their own workspace.

## New operator report

`get_instagram_receipt_reconciliation_v1(p_organization_id)` is an
aggregating, stable, SECURITY INVOKER, SELECT-only function. It reads
`raw_events`, `raw_event_processing`, `messages` and `conversations`
with tenant scope on every join. It returns numeric counts and `checkedAt`
only, not message content, customer profiles, provider/account IDs, raw
payloads or error descriptions.

The function revokes `EXECUTE` from `PUBLIC`, `anon` and
`authenticated`; only `service_role` can call it. The app first
verifies the logged-in, active owner/admin in the current organization
before accessing the service client. A strict parser rejects unexpected
keys and inconsistent totals. If migration or validation is unavailable,
only the optional reconciliation card shows an unavailable state.

## Interpretation and release limits

- Exact inbound match is **CRM representation evidence**, not confirmation
  that all provider messages were delivered.
- Ignored non-message notifications should not become customer messages.
- Ignored contact-share duplicates should not be replayed or converted
  into new customer messages without private case-specific evidence.
- A processed no-match review count is an investigation **candidate**, not
  proof of missing content. Check provider and account identity first.
- An ignored-tagged record with an exact CRM match is a taxonomy overlap,
  not an authorization to delete, rewrite or merge any records.
- The report does not check Meta subscriptions, enable Instagram echo
  processing, send messages or import history.

## Acceptance and rollout

1. Run the schema/readiness tests, build, browser checks and CodeQL.
2. Install the reviewed function using the approved Supabase migration
   workflow; verify SECURITY INVOKER, stable, service-only permissions and
   the function's exact output shape. Review schema migrations first.
3. Run an independent SELECT-only tenant and cross-organization aggregate
   comparison. Verify the partition identities before accepting the card.
4. Confirm the owner/admin Message Sync view shows only its active
   organization's counts and gracefully handles an unavailable function.
5. Keep `INSTAGRAM_OUTBOUND_ECHO_ENABLED` and
   `INSTAGRAM_HISTORY_SYNC_ENABLED` disabled and the dedicated echo retry
   cron inactive. This report does not clear those release gates.
