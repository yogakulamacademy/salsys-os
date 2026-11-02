# Financial database tests

`npm run test:financial:db` runs independent PostgreSQL connections against disposable local databases. CI supplies PostgreSQL 17.11 as an isolated service. The database driver is a development dependency; the application does not depend on a test database.

To run against a dedicated local PostgreSQL test server, set both:

```text
SALSYS_ALLOW_LOCAL_DB_TESTS=1
SALSYS_TEST_DATABASE_URL=postgres://<test-admin>:<test-password>@127.0.0.1:<test-port>/postgres
```

The runner requires a literal loopback host and the `postgres` administration database. Use a dedicated test cluster. It creates random `salsys_refund_test_<uuid>` databases and drops only the databases it created. It does not accept a Supabase project URL or load application environment files. Roles are initialized only if absent; production credentials are neither needed nor accepted as a remote connection.

Tests use the exact repository refund/verification commands and authorization helpers, with reduced foundation tables. `local-auth-bootstrap.sql` supplies compatibility functions that read synthetic claims; it does **not** validate a Supabase JWT, issue a session or reproduce Auth infrastructure. The existing rollback-only fixture is also executed and checked for cleanup.

Race tests hold the first transaction open, start a second connection and verify `pg_blocking_pids` before releasing the first. They cover matching and conflicting retries, cumulative refund limits, rollback recovery, repeatable-read/serializable snapshots, original-payment protection and request aliases across separate leads. They also verify that an audit failure rolls back the refund, request binding and parent timestamp change.

Passing these tests is financial subsystem evidence. It does not certify provider delivery, ingestion, identity resolution, full-schema compatibility, contractual adjustments or enrollment/capacity behavior. Those require separate staging and end-to-end acceptance tests.

The association suite also executes the new ledger guard and private enrollment-link command, tests the processor migration against a reduced adapter with the exact reviewed update/lock anchor, and checks API-role revocation. It covers late links, linked refunds, idempotent retries, scope/evidence mismatch, conflicting allocations, immutable ownership, audit rollback, family limits and races in both directions (including stale repeatable-read snapshots). The executable fixture processor remains intentionally reduced and is not presented as the deployed enrollment implementation.

To close that source-provenance gap, the exact deployed pre-patch definitions were recovered read-only from the production migration ledger and captured as:

- `process-enrollment-raw-event-v1.production-baseline.sql` — 8,799 bytes, MD5 `4ba0b10a80e0c205a3f6cc07bffa7c16`;
- `process-tracking-raw-event-v1.production-baseline.sql` — 4,479 bytes, MD5 `6fa37e3bfe601ed724263c05d7678e39`.

`tests/readiness/financial-processor-baseline.test.cjs` verifies those exact byte/hash identities and applies the reviewed source transformation to the complete enrollment processor body. The source migration was traced to applied Supabase ledger version `20261019154130 / event_lifecycle_projection_v1` (35,391-byte statement, MD5 `79b3de6661e0551f862bdbd4750d41b6`). These snapshots improve reproducibility of the exact processor patch, but they are not a substitute for a clean restore of every historical migration.

`provider-replay-after-refund.test.mjs` adds the stale/conflicting provider replay boundary: same financial facts may refresh non-financial evidence after a refund, conflicting amount/provider facts remain immutable, and a same-enrollment replay stays idempotent after the guarded late-enrollment association. It does not claim to call a real payment provider.

The suite accepts only the same explicitly enabled loopback test cluster. Test files run sequentially to avoid races in shared role bootstrap; transaction races within each case still use independent database connections. The original forty-assertion rollback fixture remains one nested case, not forty additional top-level cases.
