# SalsysOS — Real-Activity Production Acceptance v1

**Date:** 2026-11-01  
**Production organization:** Yogakulam Academy  
**Production head at verification:** `ca4de2d58fc7d950376ff0bf8150fe812c04386b`

## Purpose

Continue Production Acceptance after PA-1 without performing the unresolved human-approved identity merge.

This checkpoint uses only existing live production evidence. No synthetic customer records, payments, enrollments, identity merges or manual stage changes were created to make a metric green.

Canonical acceptance chain:

`Lead -> Admissions -> Conversation -> Follow-up -> Payment/Enrollment -> Revenue`

## Live production inventory

Read-only production counts observed during this checkpoint:

```text
leads                         596
conversations                 566
admissions_auto_task_events    20
follow-up tasks                22
lead contact logs              16
payments                        2
enrollments                     0
conversion facts                1
```

Current pipeline-stage inventory also contains live `payment_pending`, `enrolled` and `closed_won` stage rows, but stage labels alone are not treated as authoritative payment/enrollment truth.

## Lead -> Conversation -> Admissions -> Follow-up

This segment is production-proven.

Evidence:

- multiple live Leads have a canonical Conversation plus Admissions automation plus a generated follow-up task;
- all 20 `admissions_auto_task_events` inspected have a matching `tasks` row for the same Lead, title and due timestamp;
- Admissions-generated follow-up rows are therefore reaching the canonical task system correctly.

Open task status is an operational-workflow state. It is not evidence that task creation failed.

## Booking -> Payment start

The trusted commerce intake path is working through `payment.started`.

Canonical Commerce Event Readiness reports:

```text
health_status                configuration_blocked
operational_status           payment_completion_missing
booking.completed (30d)      19
payment.started (30d)         2
payment.completed (30d)       0
enrollment.completed (30d)    0
```

Both live `payment.started` events projected successfully into canonical `payments` rows.

Current canonical payment rows are still `pending`; no verified `paid` projection exists yet.

## Raw-event processor status

Commerce raw-event processing:

```text
booking.completed   17 processed
booking.completed    2 dead_letter
payment.started      2 processed
payment.completed    0 received
enrollment.completed 0 received
```

The two booking dead letters are the previously reconciled pair with processing error:

`booking lead resolution required`

They remain immutable evidence because:

- they arrived as a duplicate/double-submit pattern;
- no deterministic Lead/Opportunity identity existed at processing time;
- no later payment start references either booking reference;
- authoritative Yogakulam reservation status is still required before any replay/repair.

They are not a newly discovered regression and must not be auto-replayed, merged, deleted or force-linked.

## Internal SalsysOS commerce readiness

The SalsysOS side is ready for authoritative completion events:

- `process_payment_raw_event_v1` handles both `payment.started` and `payment.completed`;
- payment projection is idempotent and updates canonical `payments`;
- paid payment changes are wired to the `payments_promote_closed_won_v1` trigger;
- `process_enrollment_raw_event_v1` handles `enrollment.completed`;
- enrollment projection is idempotent and writes canonical `enrollments`;
- durable trusted events are persisted before projection and can be retried safely.

Therefore the current blocker is not a missing SalsysOS payment/enrollment projector.

## Exact blocker

The external Yogakulam PHP verified-success handlers have not yet produced authoritative:

```text
payment.completed
enrollment.completed
```

The live source is `website_backend` / `yogakulam_php_backend` from `www.yogakulam.com`.

The validated adapter/patch assets already exist in the repository:

- `integrations/php/yogakulam-verified-payment-enrollment.php`
- `integrations/php/yogakulam-direct-upi-completion.php`
- `docs/checkpoints/M-2026-10-30-Live-Commerce-Handler-Audit-v2.md`
- `docs/checkpoints/M-2026-10-30-Live-Yogakulam-Commerce-Patch-Manifest-v1.md`

Required live handlers remain:

1. PayPal verified-success path;
2. ICICI verified-return path;
3. Direct UPI admin verification path.

Completion emission must remain post-verification, post-local-commit and fail-open.

## Acceptance decision

### Accepted

- Lead ingestion / CRM presence
- Conversation presence
- Admissions automation event generation
- Follow-up task creation
- Booking completion intake
- Payment-start intake
- Durable raw-event persistence and processing for active booking/payment-start flow

### Not yet production-proven

- verified `payment.completed`
- canonical paid revenue
- `enrollment.completed`
- canonical Enrollment creation from live checkout
- complete Customer 360 commerce journey
- end-to-end revenue/attribution from a real verified transaction

## Next exact checkpoint

Deploy the already-reviewed verified-success completion adapters into the live Yogakulam PHP host, then execute one controlled real verified payment and require this sequence:

```text
booking.completed
payment.started
payment.completed
enrollment.completed
```

Post-event acceptance must verify:

- raw events are processed without failure;
- the existing pending Payment becomes verified/paid without duplication;
- Enrollment uses deterministic identity `ENR-<booking_reference>`;
- revenue uses business subtotal and excludes processor surcharge;
- Customer 360 shows payment + enrollment;
- funnel/attribution receives the realized conversion;
- retries do not duplicate Payment or Enrollment;
- System Health remains green apart from separately parked external provider blockers.

Until that real authoritative event pair arrives, commerce remains `configuration_blocked / payment_completion_missing` and must not be represented as production-proven.
