# Phase B — WhatsApp coexistence readiness audit v1

## Purpose

Make the existing System Health → Message Sync page useful for **WhatsApp Business-app coexistence** without touching the provider, customer messages, numbers or credentials.

This is a read-only, **active-tenant-only** evidence summary, not a sender configuration screen or a replay control.

## What is displayed

- Count of the workspace's connected WhatsApp integrations.
- Count of active WhatsApp sender mappings linked to those connected integrations.
- Recorded onboarding-mode claims: coexistence, Cloud API and unknown.
- Count of stored webhook receipts signed and classified as `smb_message_echoes`.
- Count of signed, derived `echo:%` child webhook events.
- Failed and dead-letter legacy webhook event counts.
- A bounded breakdown of failed event types: inbound text, images, unsupported messages,
  sent/delivered statuses and other types, plus events received in the last seven days.
- Time when the server performed the read.

Only aggregate counts and timestamps are returned, with no customer contact information, message bodies, raw webhook payloads, provider message IDs, phone numbers, access tokens or connection identifiers.

## Authority and privacy

1. Freshly authenticate the current user and ensure their profile is active.
2. Check active owner/admin workspace, exact active organization and matching current membership **before** constructing a service-role database client.
3. Scope all connected integration, active phone mapping, and webhook receipt reads to that exact organization.
4. For webhook events, use count-only (`head:true`) queries with the indexed organization and event type/status, without loading rows.
5. Recognize that onboarding metadata is *not proof* that Meta currently permits Business-app coexistence or that its events reach this CRM.
6. Require `signature_valid=true` for recorded parent/child echo receipts. No signed echo records is **absence of evidence**, not proof of provider malfunction.
7. Missing counts, malformed connection inventory, permissions or query errors fail closed as unavailable.

## Failed-webhook triage

These numbers are **exact count-only tenant-filtered queries**; the application
never selects `processing_error`, payloads, message IDs or event rows to build
this breakdown. It asks PostgreSQL for counts of five fixed event types
(`message:text`, `message:image`, `message:unsupported`, `status:sent`,
`status:delivered`) only when `processing_status = failed`. Any remaining
failed events appear under **Other event types**. The sum is checked against
the total failed count and fails closed if counts disagree; a concurrent
webhook status change may briefly require an audit refresh. The recent failure
metric counts events with `received_at` within seven days of the query.

The categorization is based on **event type**, not the cause of the processing
failure. It cannot demonstrate whether a message was lost, an integration is
currently broken, or a replay would be safe. Inspect older events privately
under an authorized incident procedure; never automatically retry these
historical records.

## Production baseline (read-only, entire database, not per-tenant)

On 5 November 2026, database inspection found the Business-app echo projector and trigger installed; zero `smb_message_echoes` parent events, zero derived `echo:%` child events, and eight legacy webhook events marked `failed`: three text messages, two unsupported messages, one image, and two delivery-status updates. All eight were received between 28 September and 21 October 2026; this is *not* a delivery or provider subscription test.

## Before claiming coexistence synchronized

An owner/admin should check the real connected number's Meta eligibility and webhook configuration and authorize a Business-app test message in an existing permitted conversation. Validate that the resulting signed echo has the correct tenant, phone, customer thread, provider message ID, direction, attachment metadata and timestamp. Check for duplicate CRM messages and review failed legacy events privately. Do not send, replay, subscribe, or change Meta configuration from this audit.

## Deployment and rollback boundaries

No database migration, provider API call, feature flag, new cron or integration connection mutation. The scheduled Instagram outbound-echo retry worker stays inactive. Any provider-related activation remains a separately approved checkpoint.
