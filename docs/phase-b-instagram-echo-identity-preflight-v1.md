# Phase B — Read-only identity preflight for signed Instagram echo candidates

## Verified starting evidence

Read-only Vercel logs on 5 November 2026 between 10:10 and 10:25 UTC
showed **seven individual signed outgoing-shaped webhook observations**, each
with candidateCount=1. They may include duplicate delivery retries: there
is no unique-MID or distinct-account conclusion. All occurred while outbound
CRM echo projection was disabled; the raw outbound-echo event table remained
empty. Live subscription and exactly-once CRM storage are still unverified.

Independent metadata-only SQL before this change found:
- 2 connected Instagram business account IDs; 0 account IDs connected
  to multiple organizations and 0 duplicate connected rows
- 839 Instagram conversation provider-identity groups; 0 ambiguous groups,
  0 missing lead or provider identity, 0 conversations without an inbound
  message bearing a provider ID
- 2,533 provider-MID groups across messages, 0 duplicate groups,
  0 cross-conversation groups and 0 mixed-direction groups
- Outbound projector and retry RPCs grant EXECUTE to service_role only;
  outbound echo retry cron stays **inactive**

These historical aggregate checks are not a guarantee about the next webhook.

## Change

After verifying the exact-byte Meta HMAC signature and validating
`message.is_echo=true`, sender direction, an undeleted event and real MID,
the existing disabled-sync observation performs **at most ten** identity
preflights per webhook:

1. Read connected Instagram integration rows for the provider account,
   without selecting tokens and with `limit(2)`. Require **exactly one**
   connection before choosing its organization.
2. Read existing CRM conversations filtered by that **resolved organization**,
   Instagram channel, business account and exact
   `accountId + ':' + recipientId` conversation key with `limit(2)`.
   Require exactly one match; never create leads or conversations.
3. Read existing outbound CRM messages filtered by the same organization
   and conversation, `direction='outbound'`, and the provider's exact
   `external_message_id`, with `limit(2)`. Treat exactly one match
   as an existing message-ID match; zero or multiple are **not** counted
   as a clean match.

Only count totals are logged as one structured event:
- `candidateCount`, `checkedCount`, `uncheckedCount`
- `connectedAccountMatches`, `existingThreadMatches`
- `existingOutboundMidMatches`
- `unmappedOrAmbiguousAccounts`, `missingOrAmbiguousThreads`
- `lookupUnavailable`

No organization ID, account ID, sender, provider MID, customer name, message
body, attachments, token, raw event, or timestamps are logged as application
payload fields. Infrastructure-generated request timestamps remain outside
the application log fields.

## Release and safety properties

- No provider API calls, customer sends, raw-event writes, CRM mutations,
  history imports, cursor changes, new database migrations or cron changes.
- The code deliberately creates a service-role client **only after valid
  Meta signature and qualifying disabled-mode echo candidates**, and only
  issues bounded SELECT queries. No RPC or DML is invoked.
- A failed/missing/ambiguous lookup only increases a count; the signed
  webhook still receives the previous success/ignored semantics. It cannot
  trigger Meta retries or stop inbound ingestion solely because an optional
  identity observation failed.
- Invalid signature, deleted message, unsupported direction, missing MID
  or non-message envelope cannot invoke this preflight.
- Existing actual echo projection stays fully behind the unchanged
  `INSTAGRAM_OUTBOUND_ECHO_ENABLED=true` gate, OFF by default.
- One webhook can contain repeated candidates; aggregate counts do not
  prove uniqueness and must not be used as financial or customer-message
  reconciliation source of truth.
- At most ten candidate events are checked per request; the remainder
  increase `uncheckedCount` without database lookups.

## Interpreting the result

A nonzero `connectedAccountMatches` is server-side lookup evidence that
the signed event names a currently connected business account, not proof
that the correct Meta subscription fields were configured.

A nonzero `existingThreadMatches` is evidence of an exact
organization/account/sender CRM thread. It does not identify the account
to readers of the aggregate log.

A nonzero `existingOutboundMidMatches` is provider-ID existence evidence,
not proof the native Instagram app sent that message, nor proof of exactly
one final storage operation across every channel.

If existing-thread matches are positive while outbound-MID matches are zero,
that is an **investigation candidate**, not permission to manufacture a
message. User-authorized provider sample and Meta subscription inspection
remain required.

## Operator continuation

1. Review the latest count-only production logs for this exact marker.
2. In the owner/admin Message Sync screen run
   **Check Meta subscription** and **Preview history (read-only)** for the
   intended connected account. Share only numerical summaries.
3. Correlate any single controlled native-app reply with a narrow time
   window and a signed preflight observation. Provider retries can repeat
   observations; do not count log entries as unique messages.
4. Test exactly-one outbound CRM storage in an approved controlled path.
   Do not enable the live outbound feature flag, history importer or
   inactive retry job solely on this preflight.

## Automated acceptance

Synthetic signed request tests cover account ambiguity, missing thread,
duplicate thread, error fallback, existing MID, bounded 10-candidate
processing, invalid HMAC, non-echo events, and no RPC/CRM write in disabled
mode. CI, TypeScript, build, CodeQL and existing browser/database tests
must pass before merging.
