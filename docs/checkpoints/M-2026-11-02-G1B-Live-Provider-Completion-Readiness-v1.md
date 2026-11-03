# G1B — Live Provider Completion Readiness v1

Date: 2026-11-02  
Branch: `codex/financial-refund-reliability`  
Production organization: Yogakulam Academy

## Status

**ENGINEERING READY / LIVE PROOF PENDING.**

G1B cannot be marked complete until one real verified payment path on the live Yogakulam host produces both `payment.completed` and `enrollment.completed` in SalsysOS.

No synthetic completion event is accepted as a substitute for this gate.

## Current live production baseline

Read-only production inspection on 2026-11-02 found:

- `booking.completed`: **27**
- `payment.started`: **7**
- `payment.completed`: **0**
- `enrollment.completed`: **0**

The seven real `payment.started` events are distributed across:

- PayPal: **3**
- ICICI: **3**
- Direct UPI: **1**

This proves the live website reaches SalsysOS through booking and payment-initiation for all three supported payment paths. The verified-success hop is still missing.

## Repository-side completion adapters

The repository-side adapters are implemented and previously validated:

### PayPal / ICICI

`integrations/php/yogakulam-verified-payment-enrollment.php`

The adapter:

- runs only after provider verification and local paid commit;
- uses deterministic `ENR-<booking_reference>` enrollment identity;
- emits `confirmation_basis=verified_payment`;
- carries payment reference/provider evidence;
- excludes processor surcharge from enrollment value;
- remains fail-open so tracking cannot roll back a verified payment.

### Direct UPI

`integrations/php/yogakulam-direct-upi-completion.php`

The adapter:

- runs only after admin verification commits both proof verification and `payments.status='paid'`;
- emits `payment.completed` first;
- emits deterministic `enrollment.completed` from the same verified payment evidence;
- preserves deposit/balance/full payment kind;
- uses business subtotal for payment amount;
- uses offer price, otherwise regular price, for enrollment contract value;
- emits `confirmation_basis=verified_payment`;
- remains fail-open.

## Compatibility with current #440 financial rules

The current draft financial branch now requires payment-backed enrollment events that explicitly declare `confirmation_basis=verified_payment` to match canonical paid evidence for:

- organization;
- lead;
- booking reference;
- payment reference;
- provider;
- supplied currency;
- positive non-refund paid amount.

Both Yogakulam completion adapters already emit the required evidence fields. Therefore no new adapter schema change is required for the current verified-payment enforcement work.

## Live-host deployment boundary

The remaining work is external to this repository environment.

The live Yogakulam host must have the validated adapter files deployed and wired into the authoritative verified-success handlers:

### PayPal

After the existing authoritative `trackSalsysPaypalCompleted($payment)` call, including the already-paid/idempotent path:

`trackSalsysVerifiedPaymentEnrollment($payment, 'paypal', 'paypal_capture')`

### ICICI

After the existing authoritative `trackSalsysIciciCompleted($payment)` call, including the already-paid/idempotent path:

`trackSalsysVerifiedPaymentEnrollment($payment, 'icici', 'icici_securehash_return')`

### Direct UPI

Immediately after the verified admin transaction commits and before email/redirect:

`trackSalsysDirectUpiCompleted(...)`

Completion must never be emitted from proof upload alone or browser-side success state.

## Tool/access limitation

This ChatGPT environment has no installed Hostinger hosting/SFTP/file-manager connector. The available Hostinger integration is mail-only. Therefore the live PHP host files cannot be inspected or edited directly from this environment.

This is an external-access limitation, not an unresolved SalsysOS backend design gap.

## Controlled live proof required

Use one real verified payment path and require the sequence:

`booking.completed -> payment.started -> payment.completed -> enrollment.completed`

Then verify all of the following against the same booking/payment identity:

1. raw events are accepted and processed;
2. canonical Payment exists and is linked to the correct lead/booking;
3. Payment amount is the business subtotal, not processor surcharge;
4. canonical Enrollment exists with identity `ENR-<booking_reference>`;
5. retry/revisit does not create duplicate Payment or Enrollment;
6. enrollment contract value comes from authoritative course value, not current deposit/gateway fee;
7. Revenue reflects the completed payment correctly;
8. Customer 360 shows payment + enrollment progression;
9. Funnel/attribution can consume the completed commerce path;
10. System Health records no new processing/dead-letter failure.

## Post-payment verification queries

After the controlled payment, the first production check is the event-family count. Both completion counts must become greater than zero:

```sql
select source_event_type, count(*)
from public.raw_events
where organization_id = '<YOGAKULAM_ORG_ID>'
  and event_family in ('booking','payment','enrollment')
group by source_event_type
order by source_event_type;
```

Then inspect the exact booking/payment references through canonical raw-event/entity-reference, Payment and Enrollment records. Do not infer completion from counts alone.

## Acceptance decision

G1B is accepted as **repository/backend ready** but **not live-provider complete**.

The gate closes only after a controlled verified live payment produces the completion pair and downstream reconciliation above.
