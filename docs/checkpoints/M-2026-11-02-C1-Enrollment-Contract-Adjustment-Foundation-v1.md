# C1 — Enrollment Contract Adjustment Foundation v1

Date: 2026-11-02  
Branch: `codex/financial-refund-reliability`  
PR: #440  
Validated executable head: `ed5e12f5138d57d5d66683bed2ce9cef253ce272`

## Status

**C1 backend + governed Lead-detail UI: COMPLETE on the draft branch.**

This checkpoint does **not** mean production deployment or live provider acceptance. PR #440 remains draft/unmerged and no #440 migration has been applied to production.

## Problem closed by C1

After a canonical enrollment exists, the agreed enrollment value must be commercial contract truth. Scholarships, discounts, fee waivers, approved price changes and contract corrections must be auditable without masquerading as payments or refunds.

Before C1, a later trusted enrollment replay could also try to reapply stale source `total_value`/`currency`, which would either overwrite a governed contract value or fail noisily once a guard was added.

C1 closes those gaps while preserving the existing immutable cash ledger boundary.

## Implemented contract

### 1. Append-only contract adjustment ledger

Migration:

- `20261102164500_enrollment_contract_adjustments_v1.sql`

Adds the governed enrollment contract-adjustment model and `apply_enrollment_contract_adjustment_v1`.

Required properties:

- owner/admin human approval;
- tenant/lead/enrollment validation;
- previous value, new value and delta recorded;
- adjustment type + reason required;
- actor and idempotency evidence recorded;
- append-only history;
- direct table mutation blocked;
- no payment/refund insert/update/delete;
- canonical audit metadata cannot be overridden by caller metadata;
- scholarship/discount/fee-waiver paths cannot increase the agreed total;
- lower contract value may produce an overpayment-review state but never an automatic refund.

### 2. Contract value outranks forecast after enrollment

Migration:

- `20261102164600_enrollment_contract_value_precedence_v1.sql`

Rule:

- before canonical enrollment: lead potential value/currency is forecast truth;
- after canonical enrollment: enrollment total/currency is contract truth.

The affected revenue/readiness projections preserve `security_invoker=true`.

### 3. Trusted replay preserves governed contract value

Migration:

- `20261102164700_enrollment_contract_replay_preservation_v1.sql`

Rule:

- a trusted replay may refresh permitted non-contract enrollment evidence;
- it must preserve an already governed enrollment `total_value` and `currency`;
- stale source value/currency does not overwrite the approved contract;
- the replay remains idempotent instead of becoming a dead-letter solely because contract truth was governed later;
- unauthorized/direct edits remain blocked;
- the processor patch fails closed if the reviewed production anchor drifts.

## Lead detail UI

Added:

- `components/contract-value-card.tsx`
- `app/actions/enrollments.ts`
- Lead detail integration in `app/leads/[id]/page.tsx`

The Contract value surface is intentionally separate from `PaymentCard` / Payments & revenue.

It shows:

- current agreed value;
- currency;
- enrollment status;
- approved adjustment history;
- explicit warning that contract adjustment does not move/refund cash;
- owner/admin approval form with type, new agreed total and reason.

The server action:

- derives active user/workspace context;
- verifies the enrollment belongs to the current lead/tenant;
- calls only the governed contract-adjustment RPC;
- revalidates relevant CRM/revenue pages;
- never performs a direct adjustment-table write;
- never creates a payment/refund.

Success notices distinguish normal adjustment, overpayment review and mock mode.

## Validation

Exact executable head:

`ed5e12f5138d57d5d66683bed2ce9cef253ce272`

Evidence:

- independent financial PostgreSQL suite: **79/79 passed, 0 failed**;
- CI #1471: **passed**;
- TypeScript: **passed**;
- production build: **passed**;
- synthetic loopback browser UI: **passed**;
- knowledge preview UI: **passed**;
- refund controls UI: **passed**;
- C1 readiness/source-boundary contract: **passed**;
- CodeQL #756: **passed**.

C1 test coverage includes:

- owner/admin authorization;
- tenant-scoped reads;
- append-only history;
- idempotent retries;
- discount/scholarship direction;
- concurrent adjustments;
- direct-update blocking;
- no cash mutation;
- overpayment without automatic refund;
- contract-over-forecast value/currency precedence;
- trusted replay preservation;
- fail-closed processor-anchor drift;
- UI separation from Payments & revenue;
- governed-RPC-only mutation path.

## Nine draft migrations currently in PR #440

1. `20261102063943_atomic_refund_command_v1.sql`
2. `20261102095354_refund_request_replay_binding_v1.sql`
3. `20261102115513_payment_enrollment_association_v1.sql`
4. `20261102115600_enrollment_processor_payment_association_v1.sql`
5. `20261102154500_enrollment_batch_capacity_guard_v1.sql`
6. `20261102161000_enrollment_verified_payment_evidence_v1.sql`
7. `20261102164500_enrollment_contract_adjustments_v1.sql`
8. `20261102164600_enrollment_contract_value_precedence_v1.sql`
9. `20261102164700_enrollment_contract_replay_preservation_v1.sql`

## Production boundary

At this checkpoint:

- PR #440 is still draft/unmerged;
- no #440 migration has been applied to production;
- no production business data was changed;
- no live provider action was performed;
- no automatic refund path was introduced;
- no production cash ledger was rewritten.

## Remaining outside C1

1. Real provider + identity/consent integration evidence.
2. Complete GT-01 Hostinger/provider replay from booking through verified payment, enrollment, revenue, Customer 360, funnel and System Health without seeding the expected final state.
3. Clean full-history migration restore/reproducibility as a separate migration-quality task.

## Release decision

C1 is accepted as **draft-branch complete** based on executable evidence above. It is not production-accepted until the PR is intentionally released, migrations are applied through the normal deployment path, production smoke/provenance checks pass and any live-provider release gates are explicitly accepted.
