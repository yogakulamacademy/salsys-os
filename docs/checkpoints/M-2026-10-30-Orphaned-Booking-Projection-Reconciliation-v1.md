# M-2026-10-30 — Orphaned Booking Projection Reconciliation v1

**Date:** 2026-10-30  
**Branch:** `phase-6a-violet-foundation`  
**Scope:** Production reconciliation of the three processed `booking.completed` events surfaced by System Health as orphaned projections.

## Decision

Preserve all three records as integrity/audit issues. Do **not** relink them automatically and do **not** recreate Opportunities solely to silence System Health.

The raw events processed successfully at the time, but each recorded a Lead ID that no longer exists. Historical touchpoints referenced by the processor result are also no longer present. The raw event ledger is therefore the surviving immutable evidence.

## Orphan pair: same historical visitor / deleted Opportunity

Two events were received within milliseconds of one another for the same visitor/session and the same customer/course facts, but with different booking references:

- `booking_completed:YGK-2026-0BD5585F`
- `booking_completed:YGK-2026-08297618`

Both were processed against deleted Lead:

`ebb6ff54-12ed-44c9-bb02-7009ee28146f`

Both payloads contain the same historical customer identifiers, course, dates, room and value.

A historical Person still exists with those exact website identifiers, but the identifiers are unverified and there is no surviving `person_leads` relationship to an active Opportunity.

A later Lead for the same phone was created on 2026-10-27, but the identity engine explicitly chose `smart_confidence_new_person` rather than merging it to the historical Person. Its evidence treated the phone-only candidate as a non-hard signal. The later visitor routing link therefore does not justify rewriting the older booking projections onto that newer Opportunity.

**Disposition:** preserve both orphaned booking projections. A future manual repair is acceptable only if an authoritative Yogakulam reservation/customer source proves the intended surviving Opportunity relationship.

## Third orphan

Event:

- `booking_completed:YGK-2026-F89CD384`

Processed against deleted Lead:

`9d82b52e-1cfb-45d6-9746-8d81736d4bf9`

There is no current CRM Lead match for the event contact identifiers and no surviving visitor identity link for the historical visitor.

**Disposition:** preserve as orphaned. Do not invent a replacement Lead/Person relationship.

## Why no automatic repair was performed

SalsysOS identity rules require deterministic evidence before relinking customer history. Exact historical raw evidence is preserved, but deletion context for the original Opportunities is unknown. Recreating an Opportunity would create a new business record and could reverse an intentional deletion or attach commercial history to the wrong active Opportunity.

Therefore:

- no Lead was created;
- no Person merge was performed;
- no raw event was rewritten;
- no touchpoint was fabricated;
- no replay was forced;
- no System Health warning was suppressed.

## Current interpretation

These three records are historical integrity warnings, not current processor failures. System Health should continue to surface them until deterministic external evidence supports a repair or an explicit product policy is introduced for acknowledged historical orphans.
