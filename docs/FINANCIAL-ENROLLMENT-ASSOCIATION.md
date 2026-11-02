# Late enrollment association after refunds

This extends the draft refund reliability work. It changes no production data or UI and must not be treated as full financial, provider or enrollment acceptance.

## Problem and behavior

The refund ledger guard previously rejected the late association performed when enrollment arrived after a payment and refund. Allowing unrestricted enrollment edits would weaken allocation history. The private association command instead links matching existing original payments and all of their linked refunds to the same enrollment in one audited transaction. Amount, currency, payment status, original/refund identity, request bindings and other cash facts stay unchanged.

The command is private to owner-owned trusted processors. Public, anonymous, authenticated and service API roles cannot call it directly or create its temporary authority. The trusted dispatcher/enrollment entry points remain service-role-only; current application call sites use the server admin client. Nothing in this work authorizes autonomous messaging or new cash movement.

## Financial and association invariants

- Validate tenant, lead and enrollment; require matching recorded booking/raw-event evidence. This is association proof from the trusted processor, not independent provider payment verification or identity consent.
- Lock the lead before enrollment and payment rows, matching refund/verification lock order.
- Allow only a null-to-enrollment association through protected per-transaction/per-connection authority. A custom session setting cannot forge it.
- Associate original payments before linked refunds. Reject conflicting enrollment, tenant, lead or currency allocation. No exchange rate is inferred.
- Existing unlinked settled refunds require reconciliation before association; do not infer or silently move an unrelated refund.
- Keep linked financial fields immutable. Protect refunded-original booking identity and prevent an allocated enrollment from changing tenant, lead, currency or booking identity.
- Replays add no duplicate audit or financial records. New refunds inherit the original payment's enrollment through the canonical refund command.
- A later provider replay may refresh non-financial evidence only when protected financial facts remain unchanged. Conflicting provider amount/provider/payment facts fail instead of rewriting settled history.
- Fail the whole association command on audit failure or more than 1,000 scanned family records. Temporary authority is removed on success and rolled back on failure.
- At repeatable-read/serializable isolation, retry the whole transaction after serialization failure rather than reusing a stale allocation snapshot.

## Configured batch capacity enforcement

Capacity is now enforced at the database boundary when a batch explicitly has a positive `capacity`.

- `capacity > 0` is authoritative for seat enforcement.
- `capacity IS NULL` and `capacity = 0` preserve the existing `capacity_not_set` behavior and do not invent a seat limit.
- `seats_remaining` remains published/manual planning data; it is not used as the authoritative capacity counter.
- Occupied-seat semantics mirror the existing Admissions model: the latest canonical `confirmed` or `completed` enrollment consumes one seat. The legacy `current_stage='enrolled'` lead fallback consumes a seat only when no canonical enrollment exists for that lead/batch.
- Seat-producing changes serialize on the batch row, so two concurrent confirmations cannot both consume the final seat.
- Pending/cancelled/deferred enrollments do not consume a canonical occupied seat; cancelling the latest canonical enrollment can free capacity.
- Moving an enrollment into a full batch fails atomically. Cross-tenant batch association fails.
- Internal capacity helpers live in `app_private` and are not directly executable by API roles.

The implementation is `20261102154500_enrollment_batch_capacity_guard_v1.sql`. Its independent PostgreSQL tests cover unmanaged capacity, full-batch rejection, final-seat concurrency, legacy fallback behavior, batch moves, tenant scope and private ACLs.

## Verified-payment-backed enrollment evidence

SalsysOS does not impose a global deposit amount, percentage or payment requirement on every enrollment source. Instead, a trusted enrollment event that explicitly declares `confirmation_basis=verified_payment` must be backed by canonical paid-payment evidence before it can confirm.

For that payment-backed enrollment the processor requires a matching payment with:

- same organization and lead;
- same booking reference;
- same payment reference;
- same normalized provider;
- same currency when the enrollment supplies currency;
- `status='paid'`;
- non-refund payment kind;
- positive amount.

Pending, failed, refunded, refund-kind and zero-value rows cannot satisfy the rule. The rule deliberately does not invent a minimum deposit amount: a business-specific amount/percentage belongs in governed product configuration, not this generic evidence boundary.

Non-commerce enrollment sources remain unaffected unless they explicitly declare the verified-payment confirmation basis. The implementation is `20261102161000_enrollment_verified_payment_evidence_v1.sql`; its helper lives in `app_private` and is not API-callable.

Queue ordering is not trusted for correctness. Current Vercel queue documentation describes at-least-once delivery with approximate ordering. Separately, read-only production inspection confirmed an active one-minute tracking recovery job that re-enters the canonical dispatcher with bounded retry settings. Therefore an early payment-backed enrollment can fail closed while payment evidence is absent and be retried through the existing projection recovery path after the canonical paid payment exists. This remains bounded recovery, not an excuse to ignore dead-letter monitoring.

## Migration boundary and processor provenance

The refund/association chain now contains six draft migrations:

1. `20261102063943_atomic_refund_command_v1.sql`
2. `20261102095354_refund_request_replay_binding_v1.sql`
3. `20261102115513_payment_enrollment_association_v1.sql`
4. `20261102115600_enrollment_processor_payment_association_v1.sql`
5. `20261102154500_enrollment_batch_capacity_guard_v1.sql`
6. `20261102161000_enrollment_verified_payment_evidence_v1.sql`

The association processor migration transforms exactly one reviewed legacy payment-association statement and one lead-lock anchor. The verified-payment migration then patches the already-reviewed associated processor shape. Missing processor baseline, changed function shape or owner mismatch stops the relevant migration before widening access.

The applied processor source was traced read-only to authoritative Supabase migration-ledger entry `20261019154130 / event_lifecycle_projection_v1` (35,391-byte statement, MD5 `79b3de6661e0551f862bdbd4750d41b6`). The deployed definitions relevant to this work were captured verbatim into repository test fixtures:

- `tests/database/process-enrollment-raw-event-v1.production-baseline.sql` — 8,799 bytes, MD5 `4ba0b10a80e0c205a3f6cc07bffa7c16`;
- `tests/database/process-payment-raw-event-v1.production-baseline.sql` — 6,627 bytes, MD5 `9a002d3693411bd548a58fbd7a937de0`;
- `tests/database/process-tracking-raw-event-v1.production-baseline.sql` — 4,479 bytes, MD5 `6fa37e3bfe601ed724263c05d7678e39`.

Live readback confirmed all three are owned by `postgres`, are `SECURITY DEFINER`, deny anonymous/authenticated execution and grant execution to `service_role`. The application durable-event path calls the dispatcher through the server admin client.

`tests/readiness/financial-processor-baseline.test.cjs` verifies captured byte/hash identity, deployed payment replay semantics, the complete enrollment association transformation and the conditional verified-payment patch. The independent PostgreSQL suite also executes the dynamic `pg_get_functiondef()` patch and ACL behavior rather than relying only on string assertions.

This captured provenance improves reproducibility of the exact processor changes; it is not a replacement for a clean restore of every historical migration.

## Validation status

On exact executable branch head `1e672345ea79ba22c67fcba2f1b86206c58c7fd6`, the independent PostgreSQL financial job passed **62/62 tests**. That suite includes refund concurrency/replay, late payment-family association, provider replay, configured-capacity enforcement, final-seat concurrency, verified-payment evidence, dynamic processor patching, fail-closed drift checks and private-helper ACLs. CodeQL #733 also passed on that head.

Subsequent commits update only this documentation and the database-test README; executable application, migration and test logic remains unchanged. The final documentation-only head must still complete its own CI/CodeQL run before merge consideration.

No #440 migration has been applied to production. None of the six draft migration versions should be treated as deployed merely because branch tests pass. No production business data or provider action was performed by this work.

## Remaining acceptance

The major gaps still outside this checkpoint are:

- **Real provider + identity/consent integration evidence.** Synthetic/local database proof is not live provider acceptance.
- **Governed contractual and correction workflow.** Cash truth and contract value are separate. Discounts/scholarships/approved price changes must not masquerade as refunds, and an erroneous cash record must not be repaired by rewriting immutable payment/refund history. The exact append-only correction model remains a separate design/acceptance gate.
- **Complete GT-01 live commerce replay.** The approved Hostinger/provider flow must demonstrate the real sequence through booking, payment started, verified payment completed, enrollment completed, revenue, Customer 360, funnel and System Health without seeding the expected final state.
- **Full migration-history reproducibility.** A clean full-history schema restore remains a separate migration-history quality task.

Keep approved AI Knowledge, business content, Sales Assets and the controlled Conversation Agent critical. Growth views precede R13, and the user-withdrawn Home redesign stays withdrawn.
