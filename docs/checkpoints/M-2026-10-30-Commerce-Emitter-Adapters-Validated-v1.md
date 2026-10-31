# SalsysOS — Commerce Emitter Adapters Validated

**Date:** 2026-10-30  
**Branch:** `phase-6a-violet-foundation`  
**Implementation head validated:** `66ece99fcbc415bee8aedf371c0b3afe5e2c971b`

## Purpose

This checkpoint records the repository-side completion work for authoritative Yogakulam checkout events and the production evidence observed immediately afterward.

It does **not** claim end-to-end production completion. The remaining dependency is deployment/wiring inside the live Yogakulam PHP payment-success handlers and one verified transaction proving the full chain.

---

## Repository changes completed

### Direct UPI verified completion adapter

Commit:

`1e7aea357e74224175fd152819855c87da341df0`

File:

`integrations/php/yogakulam-direct-upi-completion.php`

Contract:

- call only after authoritative admin verification and the local DB transaction has committed;
- emit `payment.completed` from the verified paid state;
- emit deterministic `enrollment.completed` as `ENR-<booking_reference>`;
- remain fail-open so analytics/tracking failure can never roll back a verified bank payment;
- never treat proof upload alone as payment truth.

### Verified PayPal / ICICI enrollment completion adapter

Commit:

`66ece99fcbc415bee8aedf371c0b3afe5e2c971b`

File:

`integrations/php/yogakulam-verified-payment-enrollment.php`

Contract:

- use only after a provider-specific path has verified payment and committed the local payment row as `paid`;
- follow the existing provider-specific `payment.completed` emission with `enrollment.completed`;
- use deterministic `ENR-<booking_reference>` identity for retry safety;
- exclude processor-fee/gateway amounts from enrollment value;
- omit enrollment value rather than inventing it when an authoritative course value is unavailable;
- remain fail-open.

### Lead Inspector -> Customer 360

The direct Customer 360 navigation is implemented on the release branch and is no longer a pending UX dependency.

---

## Validation completed

For `66ece99fcbc415bee8aedf371c0b3afe5e2c971b`:

- Vercel deployment: **READY**;
- durable trusted-event ingestion contracts: **PASS**;
- Sales workspace contracts: **PASS**;
- Vercel production-style build completed successfully in the connected deployment environment.

A separate isolated checkout was used to validate the planned Team Performance duplicate-authority cleanup. The change passed `git diff --check`, durable-event contracts, Sales contracts, compilation, linting and type checking. The isolated build then stopped only at prerender because the sandbox intentionally lacked Supabase public environment variables. That cleanup was **not pushed** because the sandbox had no GitHub write credentials and the large page was intentionally not replaced through a truncation-prone API path.

---

## Production evidence after adapter work

Production `raw_events` remained:

- `booking.completed`: **14**
- `payment.started`: **2**
- `payment.completed`: **0**
- `enrollment.completed`: **0**

Latest observed production event timestamps still show no new verified-success commerce event after the repository adapter work.

Therefore the active blocker remains upstream of Salsys raw-event persistence.

---

## What is already proven

The live Yogakulam integration has already proven:

- booking completion reaches Salsys;
- payment preparation reaches Salsys;
- both ICICI and PayPal have produced real `payment.started` events;
- Salsys durable ingestion, raw-event processing and payment/enrollment projectors are already implemented.

Saved website handlers also show existing provider-side `payment.completed` helper calls for PayPal and ICICI. The missing proof is that the exact updated handlers/helpers are deployed and executing on the live Yogakulam host.

---

## Remaining live-host work

The next production task is narrow and provider-specific.

### PayPal

After verified capture and local paid commit:

1. emit `payment.completed` using the existing completion helper;
2. call `trackSalsysVerifiedPaymentEnrollment($payment, 'paypal', 'paypal_capture')`;
3. confirm the private Salsys env and tracking helper are loaded on the live host.

### ICICI

After SecureHash/reference/amount/currency verification and local paid commit:

1. emit `payment.completed` using the existing completion helper;
2. call `trackSalsysVerifiedPaymentEnrollment($payment, 'icici', 'icici_securehash_return')`;
3. confirm the private Salsys env and tracking helper are loaded on the live host.

### Direct UPI

After admin verification commits both proof verification and payment paid state:

1. load the Direct UPI completion adapter;
2. call `trackSalsysDirectUpiCompleted(...)`;
3. never emit completion from proof upload alone.

---

## Required production proof

Run one controlled verified checkout and reconcile, in order:

`booking.completed -> payment.started -> payment.completed -> authoritative Payment row -> enrollment.completed -> authoritative Enrollment row`

Then verify downstream:

- Opportunity/customer linkage;
- Funnel;
- Attribution;
- Revenue;
- Customer 360;
- Commerce Event Readiness.

Only after this chain is observed should verified commerce completion be marked **E2E PROVEN**.

---

## Current blocker classification

**SalsysOS projector/backend:** implemented and validated.  
**Repository integration adapters:** implemented and validated.  
**Live Yogakulam host wiring/deployment:** pending.  
**Production `payment.completed`:** 0.  
**Production `enrollment.completed`:** 0.  
**E2E commerce proof:** pending.
