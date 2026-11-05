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

## v2: Provider account and sender identity safety

The updated read-only function no longer credits a WhatsApp receipt as **matched**
based on provider message ID alone. An exact CRM match must also resolve to an
**inbound WhatsApp** message whose conversation belongs to the same organization,
provider business-account ID and normalized sender conversation ID.

Historical processed receipts without such an exact match are divided into
**mutually exclusive** sender-conversation groups: same business account only;
other/unmapped business account only; both (ambiguous); and no sender conversation
found. The sum of these categories must equal the total processed receipts
without exact matches, otherwise the report is unavailable. A separate
overlapping count indicates whether canonical raw-event processing reports
`processed`. None of these categories proves delivery or authorizes replay.

A read-only production investigation on 5 November 2026 observed, **across all
organizations**, 6 historical processed receipts with no exact CRM match:
6 canonical raw events marked processed, 5 with a sender conversation attached
to another/unmapped business account, and 1 with no sender conversation.
There were 0 with a same-account sender conversation and 0 with multiple
account threads in that historical sample. The 29 exact matches already agreed
on inbound direction, WhatsApp channel, business account, and sender. These
patterns are possible **historical identity-mapping drift**, not proven cause
and not proof of missing CRM content.

**Do not rewrite `external_account_id`, merge contacts, replay webhooks or
create messages based solely on these aggregates.** Preserve the original
provider-account and sender evidence for privately reviewed, separately
approved case-by-case recovery.

## v3: Timing matters — later conversations are not historical routing evidence

A further metadata-only production audit on **5 November 2026** established that
all **5** processed-but-unmatched WhatsApp receipts with a *currently existing*
sender conversation on another business account were received **before**
those conversations were created. Each conversation appeared more than one
day after the corresponding receipt. There was **no** same-sender inbound
CRM message within 24 hours of any of the 6 unmatched processed receipts.
Only one of the six receipt account IDs had a matching WhatsApp account
record already registered at receipt time. These are aggregate observations
across organizations, not evidence about a named customer.

The new v3 SQL report divides **other-account-only** sender threads into
three mutually exclusive, tenant-scoped chronological categories:

- **Already existed at receipt:** an alternate-account sender thread existed
  at or before the legacy webhook arrival.
- **Only created later:** no alternate-account thread existed at arrival,
  but at least one was created later.
- **Timing unknown:** no dated thread could be classified safely.

The category counts must sum exactly to
`processedUnmatchedOtherAccountThread`, or the server report fails closed.
Multiple-account threads are tracked separately in the original identity
partition and are not silently assigned to these other-account-only buckets.

**Interpretation:** A later-created conversation does **not** establish that
the earlier webhook was misrouted to that account; an earlier conversation
also does not prove original routing by itself. No contact reassignment,
automatic repair, webhook replay or message creation is authorized by this
audit. Staff must privately verify the historical provider-account and
onboarding timeline before considering case-specific recovery.

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
