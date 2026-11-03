# SalsysOS — Real Provider / Identity / Consent Acceptance v1

Date: 2026-11-02
Production organization: Yogakulam Academy
Branch: `codex/financial-refund-reliability`

## Purpose

Separate the previously combined `real provider + identity/consent integration evidence` gate into evidence that is already production-proven versus the one external provider-completion proof that is still missing.

No production mutation, identity merge, payment, enrollment, consent decision or provider action was performed for this checkpoint. All production checks were read-only.

## Current real commerce baseline

Observed live production raw events:

```text
booking.completed    27
booking.started       1
payment.started       7
payment.completed     0
enrollment.completed  0
```

Commerce processing status:

```text
booking.completed    25 processed
booking.completed     2 dead_letter
booking.started       1 failed
payment.started       7 processed
```

The two immutable booking dead letters still report `booking lead resolution required` and remain excluded from deterministic repair unless authoritative booking evidence becomes available.

Canonical payments currently remain pending and canonical enrollments remain zero. Therefore no verified paid completion is being fabricated from pipeline stages or browser claims.

## Real commerce identity acceptance

The seven live `payment.started` events provide real production evidence for deterministic commerce identity:

- all **7/7** project successfully into processed commerce events;
- all **7/7** resolve to a canonical Lead reference;
- all **7/7** had canonical email contact evidence available by event time;
- all **7/7** had canonical phone contact evidence available by event time;
- the seven events represent five distinct canonical payment-start Leads;
- **0/5** of those Leads intersect the two unresolved `identity_resolution_conflicts` rows.

This is sufficient to accept the real payment-start identity boundary. The two unrelated unresolved identity conflicts remain human-review items and must not be merged automatically.

## Consent and privacy acceptance

Production consent infrastructure is live:

```text
privacy_consent_receipts   1665
tracking_consent_events     101
visitor_identity_links       56
```

The real payment-start events are trusted server-side business events and do not carry browser `anonymous_visitor_id` values. The five distinct payment-start Leads also do not currently have a resolved browser consent family attached at conversion time.

That produces the correct fail-closed result in `resolve_conversion_feedback_match_context(...)`:

- analytics consent = `unknown` for all five payment-start Leads;
- `ad_user_data` consent = `unknown` for all five payment-start Leads;
- eligible-for-ad-user-data = false for all five;
- no advertising email/phone match values are exposed for those Leads.

This is an accepted privacy behavior, not a commerce failure. Transactional processing must not be blocked by an absent marketing/advertising consent record, and transactional identity must not be interpreted as permission for advertising use.

The conversion-feedback resolver already preserves these guarantees:

- tri-state consent remains true / false / null;
- analytics consent never implies `ad_user_data` consent;
- no advertising match data is returned unless `ad_user_data=true`;
- contacts observed after conversion time are not exposed;
- no identifiers are fabricated.

## Provider completion evidence

The remaining unproven portion is the real verified-success provider path.

The repository contains reviewed adapters for:

- PayPal verified completion;
- ICICI verified SecureHash return;
- Direct UPI admin verification.

The completion contract is intentionally server-side and post-verification/post-commit. The validated Yogakulam adapter emits deterministic enrollment identity `ENR-<booking_reference>` and declares:

```text
confirmation_basis = verified_payment
payment_reference   = authoritative provider/local reference
payment_provider    = provider name
verification_source = provider/admin verification source
```

The #440 branch now additionally requires matching canonical positive paid non-refund payment evidence before a payment-backed enrollment can confirm.

## External blocker

This environment has no Hostinger web-host filesystem/SFTP capability and cannot deploy or edit the live Yogakulam payment-success PHP handlers.

Therefore the following cannot honestly be marked production-proven yet:

```text
payment.completed
enrollment.completed
```

The missing action remains deployment of the already-reviewed adapters into the authoritative PayPal, ICICI and/or Direct UPI success path, followed by one controlled real verified payment.

## Acceptance decision

### Accepted

- real `payment.started` provider/intake processing;
- canonical Lead identity for all current payment-start events;
- canonical email/phone evidence available by payment-start time;
- no unresolved identity conflict on the payment-start Leads;
- privacy/consent separation between transactional processing and advertising use;
- fail-closed conversion-feedback behavior when ad consent is unknown;
- no inferred/fabricated advertising identifiers.

### Not yet accepted

- real provider-verified `payment.completed` emission;
- real provider/admin-backed `enrollment.completed` emission;
- GT-01 full commerce replay through paid Revenue / Customer 360 / Funnel / System Health.

## Next exact gate

The next provider-side acceptance must be one controlled verified transaction after live Hostinger adapter deployment. Require, in order of authoritative facts rather than queue delivery order:

```text
booking.completed
payment.started
payment.completed
enrollment.completed
```

Then verify:

1. the payment-start Lead identity is reused rather than duplicated;
2. payment becomes canonical `paid` from provider/admin evidence only;
3. enrollment identity is deterministic and idempotent;
4. payment-backed enrollment passes verified-payment evidence checks;
5. contract value uses business course value rather than processor surcharge;
6. Revenue, Customer 360, Funnel and Attribution reflect the same canonical transaction;
7. retries do not duplicate payment/enrollment records;
8. System Health shows no new unresolved processing failures;
9. advertising/conversion feedback remains separately consent-aware.

Until that provider-completion event pair exists, the product must continue to report commerce completion as not production-proven.
