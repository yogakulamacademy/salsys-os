# Financial database tests

`npm run test:financial:db` runs independent PostgreSQL connections against disposable local databases. CI supplies PostgreSQL 17.11 as an isolated service. The database driver is a development dependency; the application does not depend on a test database.

To run against a dedicated local PostgreSQL test server, set both:

```text
SALSYS_ALLOW_LOCAL_DB_TESTS=1
SALSYS_TEST_DATABASE_URL=postgres://<test-admin>:<test-password>@127.0.0.1:<test-port>/postgres
```

The runner requires a literal loopback host and the `postgres` administration database. Use a dedicated test cluster. It creates random refund, capacity, payment-evidence and contract-adjustment databases and drops only databases it created. It does not accept a Supabase project URL or load application environment files. Roles are initialized only if absent; production credentials are neither needed nor accepted as a remote connection.

Tests use exact repository refund/verification/contract commands and authorization helpers with reduced foundation tables. `local-auth-bootstrap.sql` supplies compatibility functions that read synthetic claims; it does **not** validate a Supabase JWT, issue a session or reproduce Auth infrastructure. The existing rollback-only fixture is also executed and checked for cleanup.

## Refund and late-association coverage

Race tests hold the first transaction open, start a second connection and verify `pg_blocking_pids` before releasing the first. They cover matching and conflicting retries, cumulative refund limits, rollback recovery, repeatable-read/serializable snapshots, original-payment protection and request aliases across separate leads. They also verify that an audit failure rolls back the refund, request binding and parent timestamp change.

The association suite executes the ledger guard and private enrollment-link command, tests the processor migration against a reduced adapter with the exact reviewed update/lock anchor, and checks API-role revocation. It covers late links, linked refunds, idempotent retries, scope/evidence mismatch, conflicting allocations, immutable ownership, audit rollback, family limits and races in both directions, including stale repeatable-read snapshots.

`provider-replay-after-refund.test.mjs` covers the stale/conflicting provider replay boundary: same financial facts may refresh non-financial evidence after a refund, conflicting amount/provider facts remain immutable, and a same-enrollment replay stays idempotent after guarded late-enrollment association. It is grounded against the captured deployed payment-processor source but does not contact a real payment provider.

## Configured capacity coverage

`enrollment-capacity.test.mjs` executes the real capacity-guard migration in disposable PostgreSQL and verifies:

- `capacity IS NULL` and `capacity = 0` preserve existing `capacity_not_set` semantics;
- positive capacity counts latest canonical `confirmed`/`completed` enrollments;
- pending rows do not consume a seat and cannot be confirmed after the batch becomes full;
- cancelling the latest canonical enrollment can free capacity;
- the legacy enrolled-lead fallback consumes one seat only when no canonical enrollment exists;
- moving an enrollment into a full batch rolls back;
- cross-tenant batch association is rejected;
- two independent transactions competing for the final seat serialize and only one commits;
- capacity helpers live in `app_private` and are not directly executable by `anon`, `authenticated` or `service_role` API roles.

`seats_remaining` is deliberately not used as authoritative capacity truth.

## Verified-payment enrollment evidence

`enrollment-payment-evidence.test.mjs` verifies the private paid-payment evidence boundary for enrollment events that explicitly declare `confirmation_basis=verified_payment`.

The test requires matching organization, lead, booking reference, payment reference, provider and optional currency; the canonical payment must be positive, non-refund and `paid`. Pending, failed, refunded, refund-kind and zero-value rows fail. A pending row can fail first and then satisfy the same evidence check after its authoritative status changes to paid.

The test intentionally proves that a positive payment of `1` can satisfy the generic evidence rule: this layer does **not** invent a minimum deposit amount or percentage. Business-specific deposit policy belongs in governed configuration, not a hard-coded platform rule.

`enrollment-payment-evidence-patch.test.mjs` executes the complete verified-payment migration against a reviewed PostgreSQL enrollment-processor shape. It verifies the `pg_get_functiondef()` patch happens exactly once, preserves service-role-only processor access, keeps the helper private, and fails closed when the reviewed association baseline is absent.

## Enrollment contract adjustment coverage

C1 separates agreed enrollment value from cash truth.

`enrollment-contract-adjustments.test.mjs` executes the governed contract-adjustment migration and verifies:

- only authenticated organization owner/admin users can approve adjustments;
- tenant, lead and enrollment scope is enforced;
- adjustment history is append-only;
- idempotent retries do not duplicate approved adjustments;
- scholarship/discount/fee-waiver paths cannot increase agreed value;
- direct enrollment/ledger mutation remains blocked outside governed authority;
- an approved adjustment does not create, rewrite or refund cash;
- lowering contract value below already collected cash produces review evidence rather than an automatic refund;
- independent concurrent adjustments serialize safely.

`enrollment-contract-value-precedence.test.mjs` verifies the revenue/readiness rule: lead potential value is forecast truth before enrollment, while enrollment total/currency becomes contract truth after enrollment. The affected views remain `security_invoker=true`.

`enrollment-contract-replay-preservation.test.mjs` verifies a trusted at-least-once enrollment replay preserves a governed adjusted `total_value`/`currency` while permitted non-contract evidence can still refresh. It also verifies the source patch fails closed if the reviewed processor anchor drifts.

The readiness/source-boundary coverage additionally checks the mounted Lead-detail **Contract value** UI remains separate from **Payments & revenue**, the server action calls only the governed RPC and the UI/action cannot perform cash writes.

## Production processor provenance

The exact deployed pre-patch definitions were recovered read-only from the production migration ledger and captured as:

- `process-enrollment-raw-event-v1.production-baseline.sql` — 8,799 bytes, MD5 `4ba0b10a80e0c205a3f6cc07bffa7c16`;
- `process-payment-raw-event-v1.production-baseline.sql` — 6,627 bytes, MD5 `9a002d3693411bd548a58fbd7a937de0`;
- `process-tracking-raw-event-v1.production-baseline.sql` — 4,479 bytes, MD5 `6fa37e3bfe601ed724263c05d7678e39`.

`tests/readiness/financial-processor-baseline.test.cjs` verifies those exact byte/hash identities, checks deployed payment replay semantics, applies the reviewed late-association transformation to the complete enrollment processor body, verifies the conditional verified-payment patch, and verifies the contract-replay preservation transformation on the reviewed processor chain. The source migration was traced to applied Supabase ledger version `20261019154130 / event_lifecycle_projection_v1` (35,391-byte statement, MD5 `79b3de6661e0551f862bdbd4750d41b6`). These snapshots improve reproducibility of the exact processor changes but do not replace a clean restore of every historical migration.

## Current evidence boundary

On executable branch head `ed5e12f5138d57d5d66683bed2ce9cef253ce272`, the independent PostgreSQL financial job passed **79 tests, 79 passed, 0 failed**. CI #1471 and CodeQL #756 also passed, including TypeScript, production build, synthetic browser UI, knowledge preview UI, refund controls and the C1 readiness/source-boundary contract.

Subsequent commits only update documentation/checkpoint files; executable application, migration and test logic remains the validated `ed5e12f5…` state. The final documentation-only branch head must complete its own CI/CodeQL result before merge consideration.

The nine draft migrations covered by this branch are:

1. `20261102063943_atomic_refund_command_v1.sql`
2. `20261102095354_refund_request_replay_binding_v1.sql`
3. `20261102115513_payment_enrollment_association_v1.sql`
4. `20261102115600_enrollment_processor_payment_association_v1.sql`
5. `20261102154500_enrollment_batch_capacity_guard_v1.sql`
6. `20261102161000_enrollment_verified_payment_evidence_v1.sql`
7. `20261102164500_enrollment_contract_adjustments_v1.sql`
8. `20261102164600_enrollment_contract_value_precedence_v1.sql`
9. `20261102164700_enrollment_contract_replay_preservation_v1.sql`

Passing these tests is financial-subsystem and C1 draft-branch evidence. It does not certify live provider delivery, real Supabase Auth/identity/consent, full-schema migration-history reproducibility, or the final GT-01 Hostinger/provider journey. Those require separate staging/live acceptance.

The suite accepts only the same explicitly enabled loopback test cluster. Test files run sequentially to avoid races in shared role bootstrap; transaction races within each case still use independent database connections. The original forty-assertion rollback fixture remains one nested case, not forty additional top-level cases.
