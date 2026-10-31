# SalsysOS — Booking Dead-Letter Reconciliation

**Date:** 2026-10-30  
**Branch:** `phase-6a-violet-foundation`

## Scope

This checkpoint reconciles the two known `booking.completed` raw events currently in `dead_letter` state with processing error:

`booking lead resolution required`

No destructive repair or identity merge was performed.

---

## Evidence

The two dead-letter events:

- arrived within roughly one second of each other;
- came from the same anonymous visitor;
- came from the same browser session;
- contain the same exact customer contact data;
- contain the same course;
- contain the same course dates;
- contain the same room/value selection;
- differ only in booking reference.

This is consistent with a duplicate reservation submission / double-submit pattern, but the raw evidence alone is not sufficient to declare either external booking reference invalid.

---

## Identity reconciliation

Checks performed against production Salsys data found:

1. no CRM Lead matching the exact contact data exposed by the trusted booking events;
2. no `visitor_identity_links` row for the anonymous visitor or final booking session;
3. no preceding `lead.submitted` event for that visitor/session;
4. no later `payment.started` event referencing either dead-letter booking reference.

The visitor history contains normal browser/session/form-start telemetry followed directly by the two trusted booking completions.

Therefore Salsys has no deterministic Lead/Opportunity identity that can safely receive either booking projection.

---

## Decision

Do **not**:

- auto-create an Opportunity solely to make the dead letter disappear;
- merge by customer name;
- guess which booking reference is canonical;
- replay either event into an unrelated existing Lead;
- delete either raw event.

Both events remain valid immutable evidence and should stay surfaced as integrity issues until the external Yogakulam reservation database provides authoritative booking status.

---

## Required external reconciliation

Using the live Yogakulam checkout/reservation database, check both booking references and determine:

- whether one was superseded/cancelled/abandoned;
- whether either booking remains active;
- whether one reference is the true reservation used for subsequent payment/contact activity;
- whether the duplicate was created by retry/double submission.

If exactly one booking is authoritatively valid, repair only that booking using deterministic identity evidence. Preserve the other raw event as duplicate/audit evidence.

If both bookings are legitimate, they still require a valid CRM identity/Opportunity linkage before replay.

If neither is legitimate, preserve both events and classify them as abandoned/duplicate upstream reservations rather than fabricating CRM projections.

---

## Current status

**Dead-letter count:** 2  
**Root cause:** no resolvable Lead/Opportunity identity at processing time  
**Duplicate pattern:** strongly indicated  
**Safe automatic replay:** no  
**Data deletion:** none  
**Identity merge:** none  
**Next dependency:** authoritative live Yogakulam reservation status
