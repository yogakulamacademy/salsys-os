# SalsysOS — GT-01 Internal Production-Schema Acceptance v1

Date: 2026-11-03
Production organization: Yogakulam Academy
Production project: `doaozrkrtgeslddwhclj`
Base `main`: `7e0d3ce47b2efc0231e74a9bef32f253158cda78`

## Purpose

Record production-schema acceptance of the internal Salsys commerce projection path after the nine financial/enrollment migrations were deployed and verified.

This checkpoint is **not full GT-01 provider acceptance**. PayPal, ICICI and Direct UPI success handlers remain deliberately deferred. No real provider transaction was performed and this checkpoint must not be used as evidence that the provider-verified `payment.completed` / `enrollment.completed` path is live.

The acceptance used a single synthetic transaction on the real production schema and ended with `ROLLBACK`. It exercised the real dispatcher and production triggers/read models while leaving no synthetic business record committed.

## Tested path

The rollback-only transaction exercised the following authoritative event sequence through `process_tracking_raw_event_v1`:

```text
booking.completed
payment.started
enrollment.completed   # deliberately early; must fail closed
payment.completed
enrollment.completed   # retry of the same event; must succeed
same enrollment event  # idempotent reuse
```

The test used the existing active `website_backend` tracking source and an existing tenant-owned course. It did not call `/api/events/v1`, Vercel Queue, a payment provider, a Hostinger handler, or any external messaging action.

The synthetic enrollment event declared:

```text
confirmation_basis = verified_payment
payment_reference   = synthetic stable reference
payment_provider    = gt01_internal
verification_source = gt01_internal_rollback
```

The amount and contract value were both synthetic `USD 1000.00`. These values existed only inside the rolled-back transaction.

## Acceptance results

### Booking and identity reuse

- `booking.completed`: passed.
- `payment.started`: passed without an explicit `lead_id` in the payment event.
- The payment resolved through the booking reference and reused the same canonical synthetic Lead identity rather than creating a second Lead.

### Verified-payment fail-closed behavior

The first `enrollment.completed` attempt ran while the canonical payment was still pending.

Result:

```text
ok = false
error = Verified paid payment evidence is not available for this enrollment yet
```

This is the expected boundary: a payment-backed enrollment cannot confirm from a payment-start/browser claim alone.

### Payment completion and enrollment recovery

After processing `payment.completed` with the same stable provider/payment reference:

- exactly one canonical payment existed;
- payment status became `paid`;
- the same previously failed enrollment event was retried;
- the retry passed;
- exactly one enrollment existed;
- enrollment status was `confirmed`;
- the payment became linked to that enrollment;
- the enrollment contract value was `1000.00 USD`.

A third dispatch of the same enrollment raw event returned idempotent reuse and did not create a duplicate enrollment.

### CRM and revenue projection

Inside the transaction after successful completion:

```text
lead stage                 = closed_won
canonical payment rows     = 1
canonical enrollment rows  = 1
payment status             = paid
enrollment status          = confirmed
payment linked enrollment  = true
contract value             = 1000.00
revenue payment status     = paid
revenue net paid           = 1000.00
revenue contract value     = 1000.00
revenue outstanding        = 0.00
touchpoints                 = 4
activities                  = 1
```

All four raw events finished with `processed` status after the expected enrollment retry.

## Rollback / production-data proof

The transaction ended with `ROLLBACK`.

Post-test read-only cleanup verification returned:

```text
synthetic leads left       = 0
synthetic raw events left  = 0
synthetic payments left    = 0
synthetic enrollments left = 0
synthetic touchpoints left = 0
```

Production returned to the pre-test commerce baseline:

```text
payments     = 8
enrollments  = 0
```

No failed/dead-letter raw-event processing row was created by the acceptance test. PostgreSQL logs showed no error entries during the post-test verification window.

## System-health readback

At the post-test readback (`2026-11-03T12:55:25Z`):

- CRM Core integrity: **healthy**, `0` issues.
- Customer 360 integrity: **warning/degraded**, caused by the same `2` pre-existing unresolved identity conflicts; no new GT-01 identity issue was introduced.
- System Health summary: `13` systems total — `9` healthy, `2` warning, `1` critical, `1` inactive.

The non-green system-health items are independent of this acceptance:

- Google Ads: critical because the Google Cloud project is not approved for production non-test-account access (`CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION`).
- Search Indexing: inactive/disabled, with existing queued backlog.
- Customer 360 Integrity: warning from the two pre-existing unresolved identity conflicts.
- Meta Ads: warning while its latest status is success.

No evidence links these existing conditions to the rollback GT-01 test.

## Accepted by this checkpoint

This checkpoint accepts the **internal production-schema commerce path** after authoritative evidence is present:

1. booking reference → canonical Lead identity reuse;
2. pending payment cannot satisfy verified-payment enrollment;
3. authoritative paid payment updates the existing canonical payment;
4. the same enrollment event can recover after payment completion;
5. enrollment creation is deterministic/idempotent;
6. payment is associated with the canonical enrollment;
7. payment completion promotes the Lead to `closed_won`;
8. Revenue reflects the same paid amount and enrollment contract value;
9. dispatcher retries do not duplicate payment/enrollment rows;
10. rollback leaves production business data unchanged.

## Not accepted / still provider-gated

The following remain outside this checkpoint:

- live Hostinger success-handler deployment;
- real PayPal verified completion;
- real ICICI SecureHash verified completion;
- real Direct UPI admin-verified completion;
- real provider-originated `payment.completed`;
- real provider/admin-backed `enrollment.completed`;
- external `/api/events/v1` + Vercel Queue delivery proof for the completion pair;
- full live GT-01 from actual checkout/provider success through Revenue, Customer 360, Funnel and System Health.

The product must therefore continue to report **full GT-01 as provider-gated**, not complete.

## Next gate

When provider-handler work is resumed, run one controlled verified transaction through the authoritative live provider path and require, in authoritative fact order:

```text
booking.completed
payment.started
payment.completed
enrollment.completed
```

Then verify the same invariants already proven internally here, plus external delivery/idempotency and provider evidence provenance.

Until then, the correct status is:

**GT-01 internal production-schema acceptance: PASSED**

**Full GT-01 provider acceptance: NOT YET PROVEN / DEFERRED**
