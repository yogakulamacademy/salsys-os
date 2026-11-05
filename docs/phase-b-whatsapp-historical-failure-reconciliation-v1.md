# Phase B — Historical WhatsApp webhook reconciliation (read-only)

**Checkpoint:** 5 November 2026. **Scope:** approved database-operator audit across the current production database, **not** a tenant-accessible screen or evidence of provider delivery. SQL: `docs/sql/whatsapp-historical-failure-reconciliation-readonly-v1.sql`.

## Verified findings

The database contains **8** failed legacy WhatsApp webhook events: 3 incoming text, 2 unsupported messages, 1 incoming image, 1 sent status and 1 delivered status. All eight failed receipts have recorded valid signatures and were received between 28 September and 21 October 2026.

Of the **6 failed incoming-message events**:

| Read-only check | Result |
| --- | ---: |
| Failed incoming receipts | 6 |
| Canonical raw events with matching provider message ID | 6 |
| Legacy WhatsApp CRM message-link matches | 0 |
| Exact CRM message matches by provider message ID | 0 |
| Current exact WhatsApp/phone contact identity matches | 0 |
| Current exact WhatsApp conversation identity matches | 0 |
| Failed due to `lead_attribution.organization_id` being null | **5 of 6** |

The remaining incoming text failure has a different old processing-state diagnostic. Its cause cannot be concluded from these aggregate observations. Two older failed sent/delivered status receipts are also unresolved.

There are **35** incoming WhatsApp receipts marked processed and **29** with exact provider-message-ID matches to CRM messages. The **6 older processed** receipts without an exact match were received between 28 September and 10 October 2026. These may be legacy mapping, handling or recording discrepancies and must not be classified as lost messages from this check alone.

## Verified original failure is already guarded

The five historical attribution failures predate a production fix installed on **27 October 2026**:

- Migration `20261027090000_db_incident_hardening_v2.sql` installs an active `lead_attribution` trigger that fills missing tenant ownership from the parent lead, rejects cross-tenant mismatches and refuses a missing lead.
- Migration `20261027143000_create_crm_lead_explicit_attribution_tenant_v1.sql` makes `create_crm_lead` write `organization_id` explicitly when creating lead attribution.

A read-only inspection of production function definitions and trigger status confirmed both protections are present. Since 27 October, the stored event history shows **5 processed incoming messages and 0 failed incoming messages**. This is encouraging evidence, but a small sample and not a guarantee that every current WhatsApp provider event is received.

## Investigation and recovery gates

1. **No automatic replay, lead creation, deletion or status change.** Preserve immutable source events and receipt records. Recovery needs separate approval.
2. For each historical receipt, an authorized operator privately checks the connected account, original provider message ID, intended tenant, sender identity, received time and provider status. No message bodies or customer identifiers should be copied into this runbook or CI artifacts.
3. Reconcile against exact provider IDs in `whatsapp_crm_message_links` and `messages`, then review existing lead/contact mappings and conversation history for alternate representation. A zero exact ID match is **not** proof that a human-readable message is absent.
4. Distinguish **failed inbound** (eligible for controlled recovery review) from **processed but unmatched** (may be a historical recording discrepancy). Do not rerun processed events without explaining their original success state.
5. Before proposing a targeted repair, specify whether it would create a new lead, duplicate an existing lead, duplicate a message, or change the contact/tenant mapping. Require a reviewed, reversible, idempotent approach with dry-run evidence, independent user approval and a rollback procedure.
6. Compare with current Meta WhatsApp connection and Business-app Coexistence evidence, which remains unverified. Do not infer full end-to-end delivery from old database receipts.
7. Continue to keep Instagram outbound echo cron inactive and Instagram history/import flags off until the separate authorized provider test passes.

## Safety of the SQL

The SQL file contains **SELECT statements only**. Joins may use internal provider IDs and contact identities to compute aggregates inside the database; the output exposes counts, dates and boolean guard status only. It never emits message bodies, error strings, contact details, phone numbers, provider IDs, raw webhook payloads or organization IDs. It is for authorized operations personnel, **not** a publicly callable RPC or an application endpoint.

These findings are a **historical operations audit**. It establishes an identified and corrected legacy bug plus unresolved recovery candidates; it does **not** claim historical messages have been repaired, that live provider delivery is healthy, or that all WhatsApp conversations are complete.
