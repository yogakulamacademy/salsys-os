# Phase B — Bounded outbound Instagram history evidence (read-only)

## Why
SalsysOS can accept incoming Instagram webhooks, but native Instagram-app replies
are not yet proven to generate signed outgoing echo webhooks on the connected
application. The existing owner/admin **Preview history (read-only)** inspects
Meta's Conversations API but previously reported only total messages seen.
It did not show whether provider-sent messages from that sampled conversation
are represented in the existing CRM thread.

## New owner/admin preview evidence
The same existing `mode: 'history_preview', apply: false` call still fetches
**at most one provider conversation and 20 messages**. After checking the
provider conversation participants against the connected professional account,
the CRM must have exactly one tenant/account/sender-matched existing conversation.

For provider messages with a real ID, a valid timestamp and a direction-valid
`from.id` (and a correct `to.id` if available), the preview counts distinct
provider **outbound** message IDs and performs ONE tenant-scoped, read-only
lookup in `public.messages`, constrained by:
- the authorized organization ID
- the existing CRM conversation's ID
- `direction = outbound`
- provider `external_message_id` in the bounded observed list

The resulting UI receives exactly three additional numbers:
`outboundMessagesSeen`, `outboundMessagesMatched` and
`outboundMessagesNotInCrm`. The last count is the number of distinct,
direction-valid provider outbound IDs absent from that one CRM conversation
at preview time. A duplicate ID in the provider page counts once.

No provider/customer IDs, message text, attachments, tokens, content or
conversation identifiers leave the server. Malformed or oversized provider
pages or failed/too-large CRM lookups show an unavailable state, never a
falsely reassuring zero.

## Safety
- No Meta POST request, outgoing DM, CRM upsert, raw webhook replay, cursor
  movement, history import, new lead, new database function, migration,
  environment flag or cron activation
- Existing history `apply:true` path remains unmodified
- Same-origin active owner/admin membership gate and connected-account
  lookup stay in place in the existing route
- The older Settings → Integrations history-preview control now sends the
  API-supported `history_preview` mode with `apply: false`, instead of the
  unsupported `history` mode. The separately gated apply action omits the
  inspection mode and remains unchanged in scope. Both UI entry points
  display the numeric outbound sample, without raw provider data
- The client validator strictly limits the extra counts to 0–20, requires
  `outboundMessagesMatched + outboundMessagesNotInCrm =
  outboundMessagesSeen`, rejects unknown fields and any import evidence
- Existing inbound webhook and outbound-echo handling are unchanged

## Interpreting the result
- A positive outbound sample proves Meta's Conversations API returned a
  direction-valid outbound message in a sampled existing thread.
- A positive missing-match count is an **investigation candidate**, not
  evidence that the provider message failed to send, or that it should
  automatically be imported, merged or replayed.
- Zero missing matches is not proof of complete synchronization. The Graph
  API may omit conversations, messages or inactive Requests.
- If the sampled conversation does not already match an existing CRM
  thread, the preview skips it rather than inventing a lead.
- A CRM provider-ID match is existence evidence, not automatically proof
  of exactly-one message; separate duplicate/idempotency checks remain.
- The sample provides a useful *alternative evidence source* when no
  echo webhook candidate reaches the signed webhook handler. It does not
  verify subscription fields or guarantee native-app echo delivery.

## Operator procedure
1. Go to **System Health → Message Sync** as an active owner/admin.
2. Choose **Preview history (read-only)** for each connected account.
3. Record the numeric sample and any unavailable status only.
4. If sampled outbound IDs are not represented in the CRM, investigate
   account identity, message ID and source coverage in a private approved
   review. Do not run history import or activate outbound echo processing.
5. Use the separate **Check Meta subscription** control and a permitted
   signed live event to establish the independent webhook release gate.

The feature is tested using synthetic Meta GET payloads, a stub CRM tenant
query, malformed provider responses, and strict client-side validation.
