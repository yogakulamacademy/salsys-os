# Phase B — Instagram outbound echo concurrent replay acceptance

## Why this check is necessary

The prior disposable-PostgreSQL verification (PR #512) executed the exact
outbound echo SQL function sequentially and demonstrated same-MID
idempotency. That cannot tell us how two **independent connections** behave
when Meta delivers the same provider message through separate webhook
receipts before either transaction has committed.

Production has a unique index on `messages(organization_id,
external_message_id)` for non-null IDs. That protects the canonical
stored record, but the projector's early `SELECT` cannot see uncommitted
writes from another connection.

## Executed race contract

`tests/database/instagram-outbound-echo-concurrency.test.mjs` runs only in
the explicitly opted-in local PostgreSQL test service already used by CI.
It creates a uniquely named disposable database, installs the **exact
existing** outbound projection migration plus the prior synthetic
foundation, and uses two independent PostgreSQL connections.

1. First transaction ingests a signed-shaped synthetic outbound echo and
   deliberately retains its uncommitted provider MID.
2. Second transaction ingests another synthetic raw receipt with the **same
   provider MID**. The test observes a real `pg_blocking_pids` lock wait on
   the PostgreSQL unique index before releasing the first transaction.
3. The winner commits one outbound record. The second competing transaction
   receives SQLSTATE `23505` (unique constraint violation). This is an
   actual transient conflict, **not** a clean duplicate acknowledgement.
4. After rolling back the loser, retrying the same second raw receipt
   returns `duplicate_message=true` and `processed=false`, with no second
   stored CRM message. Its processing status becomes processed.
5. The final record retains the correct tenant, conversation, direction
   and provider ID. Every synthetic table and row is dropped with the
   database after the test. No production records, Meta APIs or customers
   are touched.

## Release interpretation

- **Safety proven:** the existing unique index prevents two canonical CRM
  records sharing one provider MID in the same organization, even with
  independent concurrent transactions. A later retry recognizes the
  existing message without duplication.
- **Remaining improvement:** an initial concurrent collision can raise
  `23505`, which may lead to one webhook 500/automatic provider retry.
  This test does not prove both concurrent attempts immediately succeed,
  nor does it claim zero retry cost.
- **Not yet proven:** real Meta native-app sends, exact provider subscription
  fields, arbitrary races across different workers, production exactly-one
  acceptance, or any historical recovery/import completeness.
- **No runtime change:** this PR adds only a disposable CI test, its CI step,
  and this document. No new migration, permission, environment flag,
  provider send, customer write, or retry-job activation.

## Strict safety boundary

The test refuses a connection unless
`SALSYS_ALLOW_LOCAL_DB_TESTS=1` and the database URL targets a literal
loopback PostgreSQL host, the `postgres` administrator, and the
`postgres` maintenance database. It never runs against a live Supabase
project or an existing application schema.

Keep `INSTAGRAM_OUTBOUND_ECHO_ENABLED` and
`INSTAGRAM_HISTORY_SYNC_ENABLED` disabled and the outbound echo retry
cron inactive until an authorized controlled live acceptance is complete.
