# Financial database tests

`npm run test:financial:db` runs independent PostgreSQL connections against disposable local databases. CI supplies PostgreSQL 17.11 as an isolated service. The database driver is a development dependency; the application does not depend on a test database.

To run against a dedicated local PostgreSQL test server, set both:

```text
SALSYS_ALLOW_LOCAL_DB_TESTS=1
SALSYS_TEST_DATABASE_URL=postgres://<test-admin>:<test-password>@127.0.0.1:<test-port>/postgres
```

The runner requires a literal loopback host and the `postgres` administration database. Use a dedicated test cluster. It creates random refund, capacity and payment-evidence databases and drops only databases it created. It does not accept a Supabase project URL or load application environment files. Roles are initialized only if absent; production credentials are neither needed nor accepted as a remote connection.

Tests use exact repository refund/verification commands and authorization helpers with reduced foundation tables. `local-auth-bootstrap.sql` supplies compatibility functions that read synthetic claims; it does **not** validate a Supabase JWT, issue a session or reproduce Auth infrastructure. The existing rollback-only fixture is also executed and checked for cleanup.

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

## Production processor provenance

The exact deployed pre-patch definitions were recovered read-only from the production migration ledger and captured as:

- `process-enrollment-raw-event-v1.production-baseline.sql` — 8,799 bytes, MD5 `4ba0b10a80e0c205a3f6cc07bffa7c16`;
- `process-payment-raw-event-v1.production-baseline.sql` — 6,627 bytes, MD5 `9a002d3693411bd548a58fbd7a937de0`;
- `process-tracking-raw-event-v1.production-baseline.sql` — 4,479 bytes, MD5 `6fa37e3bfe601ed724263c05d7678e39`.

`tests/readiness/financial-processor-baseline.test.cjs` verifies those exact byte/hash identities, checks deployed payment replay semantics, applies the reviewed late-association transformation to the complete enrollment processor body and verifies the conditional verified-payment patch on top of it. The source migration was traced to applied Supabase ledger version `20261019154130 / event_lifecycle_projection_v1` (35,391-byte statement, MD5 `79b3de6661e0551f862bdbd4750d41b6`). These snapshots improve reproducibility of the exact processor changes but do not replace a clean restore of every historical migration.

## Current evidence boundary

On executable branch head `1e672345ea79ba22c67fcba2f1b86206c58c7fd6`, the independent PostgreSQL financial job passed **62 tests, 62 passed, 0 failed**, and CodeQL #733 passed. Subsequent commits only update this README and the financial-association documentation; executable application, migration and test logic is unchanged. The final documentation-only head still requires its own CI/CodeQL result before merge consideration.

The six draft migrations covered by this branch are:

1. `20261102063943_atomic_refund_command_v1.sql`
2. `20261102095354_refund_request_replay_binding_v1.sql`
3. `20261102115513_payment_enrollment_association_v1.sql`
4. `20261102115600_enrollment_processor_payment_association_v1.sql`
5. `20261102154500_enrollment_batch_capacity_guard_v1.sql`
6. `20261102161000_enrollment_verified_payment_evidence_v1.sql`

Passing these tests is financial-subsystem evidence. It does not certify live provider delivery, real Supabase Auth/identity/consent, full-schema migration-history reproducibility, a governed financial correction/contractual-adjustment workflow, or the final GT-01 Hostinger/provider journey. Those require separate staging/live acceptance.

The suite accepts only the same explicitly enabled loopback test cluster. Test files run sequentially to avoid races in shared role bootstrap; transaction races within each case still use independent database connections. The original forty-assertion rollback fixture remains one nested case, not forty additional top-level cases.
