# Phase B — Message synchronization reconciliation audit v1

## Scope

This milestone provides a **read-only, per-tenant operational audit**, not a
message send/replay or provider account reconfiguration.

Route: `/system-health/message-sync` (linked from System Health).
Access: freshly authenticated, active owner/admin of the bound organization.
Database: `get_message_sync_audit_v1(organization_id)` is an invoker-rights
RPC executable only by the service role, after application authorization.

The RPC returns metadata only: message counts grouped by channel/direction,
missing external provider IDs, outbound records lacking sent timestamps,
latest stored timestamps, Instagram/WhatsApp raw-event processing outcomes,
and aggregate Instagram historical reconciliation cursor counts.

It returns **no** message bodies, leads, customer identifiers, provider
message IDs, raw webhook payloads, account credentials, error strings,
history cursors, phone numbers or emails.

## Read-only production baseline — 5 November 2026

Observed across the existing database at audit time (not an authorized staff
role's effective Inbox visibility):

| Channel | Inbound | Outbound | Outbound missing external ID |
| --- | ---: | ---: | ---: |
| Instagram | 2,351 | 12 | 3 |
| WhatsApp | 29 | 10 | 3 |
| Website | 24 | 0 | 0 |
| Total | 2,404 | 22 | 6 |

Raw event processing:
- Instagram: 4,370 `processed` records.
- WhatsApp: 53 `processed`, 4 `ignored`, 9 `failed`,
  3 `dead_letter` records.
- Instagram history reconciliation: 0 saved account cursors.

These counts do **not** prove end-to-end delivery, all-time historical
completeness, or missing customer conversations. A single raw event can
represent a webhook event other than a user-visible message; a missing external
ID can also be an older/local record. The proper conclusion is **review
required**, not automatic replay/deletion.

## Release process

1. Validate the service-only SQL function with migration replay, and test it
   against the target tenant using read-only service-role execution.
2. Verify `anon`/`authenticated` cannot call the RPC.
3. Verify owner/admin access, no cross-tenant data exposure, and no provider
   credentials leaked through the page.
4. Run TypeScript, readiness tests, build/browser checks and CodeQL.
5. Merge and verify exact production deployment SHA.
6. Leave all AI pilot flags and unreviewed Instagram/WhatsApp echo/import
   activation flags unchanged.

## Manual provider reconciliation still required

- Instagram: use the existing Meta `message_echoes` read-only subscription
  check for the connected account. A configured app flag is not proof of Meta
  subscription. Compare native-app replies with CRM messages by provider
  message ID, with explicit permission and a permitted customer-initiated
  test thread.
- WhatsApp coexistence: verify the actual connected number's Meta events,
  business-app echo behavior, provider IDs, statuses, attachments and
  timestamps. Check 9 failed / 3 dead-letter event records individually
  under controlled, authorized operational access; never print payloads.
- History: use the already-built read-only Instagram Conversations API preview
  first. A zero cursor count means no persisted reconciliation progress;
  the current API may omit old/Requests chats.
- Duplicates: the database has a tenant-scoped uniqueness index on
  `messages(organization_id, external_message_id)` when the ID is non-null.
  That does not by itself prove all provider mappings are correct.
- Do not automatically retry, bulk import or send messages without explicit
  provider-account checks and human approval.

## Limitations

This read-only audit is not a provider delivery dashboard, SLA monitor,
historical import operator, or proof of inbox permission acceptance beyond
the old 300-row boundary. Those acceptance tasks remain open and should be
tracked separately.
