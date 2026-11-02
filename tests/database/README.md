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

The association suite also executes the new ledger guard and private enrollment-link command, tests the processor migration against a reduced adapter with the exact reviewed update/lock anchor, and checks API-role revocation. It covers late links, linked refunds, idempotent retries, scope/evidence mismatch, conflicting allocations, immutable ownership, audit rollback, family limits and races in both directions (including stale repeatable-read snapshots). The fixture processor is not the deployed enrollment implementation. The migration deliberately fails if the reviewed processor baseline or ownership is absent or its shape differs; it does not silently accept an unpatched adapter.

The suite accepts only the same explicitly enabled loopback test cluster. Test files run sequentially to avoid races in shared role bootstrap; transaction races within each case still use independent database connections. The original forty-assertion rollback fixture remains one nested case, not forty additional top-level cases.
