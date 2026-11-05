# Phase B — WhatsApp receipt-to-CRM reconciliation panel

## Purpose

Move the historical WhatsApp provider-message-ID audit into the **owner/admin-only System Health → Message Sync** view without exposing customer conversations or enabling replay.

The service-only SQL function `get_whatsapp_receipt_reconciliation_v1(organization_id)` computes tenant-scoped aggregate evidence from existing WhatsApp webhook receipts, canonical raw events, message links and CRM messages. The application passes the **freshly authenticated, active workspace's organization ID** only after owner/admin membership verification.

## Numbers and interpretation

- **Processed incoming receipts:** Legacy WhatsApp webhook events marked `processed` with `event_type LIKE 'message:%'`.
- **Processed with CRM message:** Processed receipts with an exact tenant-scoped provider-message-ID match in `messages`.
- **Processed without exact match:** The corresponding unmatched receipts; **not proof of lost messages**.
- **Failed incoming receipts:** Inbound receipts still marked `failed`.
- **Failed with raw evidence:** Failed receipts whose exact provider message ID is still represented in canonical WhatsApp `raw_events`.
- **Failed without exact match:** Failed receipts with no exact tenant-scoped CRM message match.

Two additional provider-ID link counts and the oldest unmatched receipt timestamps are available to the server-side parser. The UI shows counts and dates only, never original receipt IDs, provider message IDs, error strings, phone numbers, lead IDs, raw payloads or message bodies.

## Privacy and safety guarantees

1. SQL function is `STABLE SECURITY INVOKER` and **SELECT-only**. Execution is revoked from `PUBLIC`, `anon` and `authenticated`, granted to `service_role`.
2. Every provider-ID lookup includes the same `organization_id` as the webhook receipt. Tenant matching happens in SQL; neither the frontend nor the server receives the underlying customer or provider IDs.
3. The application authenticates active staff and current workspace owner/admin membership before creating the privileged client.
4. The parser accepts exactly the expected numeric counts and timestamp fields and rejects negative/non-integer/impossible counts or additional fields.
5. If the function is not yet migrated, errors, or returns malformed data, only this **optional panel** shows unavailable. The other WhatsApp health checks remain intact.
6. No event replay, lead creation, message insertion, provider call, webhook subscription changes, history import, background cron, or new feature flag.

## Production evidence at design time — 5 November 2026

Across all organizations, the read-only prior checkpoint reported 35 incoming WhatsApp receipts marked processed: 29 exact CRM provider-ID matches and 6 without exact matches. Six older incoming receipts remained failed and lacked exact CRM message matches; all six retained canonical raw-event provider-ID evidence. Five of those failures were caused by an older `lead_attribution.organization_id` null error, and the October 27 database hardening is already installed.

**Important:** These are cross-organization background counts. The System Health panel always scopes its result to the current authorized organization and may therefore show smaller figures.

## Release and operator acceptance

1. Review migration SQL and run CI, typecheck, browser tests, CodeQL and migration replay.
2. Merge the PR and apply the new SQL function as an independently verified service-only database migration. Verify permission checks for `anon`, `authenticated`, and `service_role`, and compare aggregate results to an independent, read-only SQL query.
3. Verify exact production deployment commit and confirm that System Health renders counts only to the correct workspace owner/admin.
4. Before any historic repair, privately review each record, confirm provider IDs and alternate representation, and obtain **separate explicit approval** for an idempotent and reversible recovery procedure.
5. Keep Instagram outgoing sync flags, historical import and the inactive retry cron unchanged. Provider-side Instagram and WhatsApp live-message acceptance remains a separate gate.
