# Phase B — Exact Instagram outbound projector in disposable PostgreSQL

## Why this test exists

Production now receives signature-valid Instagram outbound-shaped webhooks.
The disabled-mode identity preflight observed two candidates on 5 November
2026 at 10:55:49 UTC that uniquely matched connected Instagram integration
rows and an existing CRM thread. Neither had an existing outbound provider
MID match. These two deliveries may represent one retried provider message.

These observations do **not** justify activating
`INSTAGRAM_OUTBOUND_ECHO_ENABLED` yet.

Prior tests of `ingest_instagram_outbound_echo_v1` checked the SQL source
and mocked the RPC response. This checkpoint exercises the **unchanged exact
repository migration** in an isolated local PostgreSQL 17 transaction.

## Executable acceptance coverage

`tests/database/instagram-outbound-echo-projector.test.mjs` reads
`supabase/migrations/20261104170000_instagram_outbound_echo_v1.sql`
directly and executes that code with synthetic data against a reduced,
purpose-built database foundation.

It confirms:

1. `anon` and `authenticated` cannot execute the projector; only the
   intended `service_role` has EXECUTE.
2. A valid synthetic outbound echo creates exactly one CRM message with
   the right organization, lead, conversation, direction, MID, source
   and original event time.
3. Repeating the same raw event creates no additional CRM message.
4. Receiving a separate raw echo carrying the **same provider MID**
   also creates no additional CRM message.
5. An existing disconnected/unmatched account cannot project a message
   into the wrong organization's thread.
6. A sender mismatch or a disagreement between raw and nested MIDs
   fails closed without creating a CRM message.
7. Missing conversations defer rather than creating new leads.
8. Reusing a provider MID against a different existing CRM thread
   conflicts; it cannot silently attach to another lead.
9. Unprivileged callers are rejected even for otherwise valid echo events.

The suite first refuses an existing application schema and accepts
**only** an explicitly opted-in local PostgreSQL connection at
`127.0.0.1` or `localhost` whose database is exactly `postgres`.
It always rolls back its DDL, roles, synthetic leads, messages and events.
No Meta API calls, tokens or customer data are used.

The CI `financial-database` job already provides a disposable Postgres
17 service and executes this test as a separate step after the existing
financial suite. This does not reclassify Instagram messaging as finance;
the independent local database service is simply the existing isolated
execution infrastructure.

## Limits and release gate

- The foundation replaces upstream `log_lead_interaction` and
  `set_raw_event_processing_status` with **synthetic local stubs**.
  It executes the real echo projector but not the complete production
  lead automation, realtime or audit ecosystem.
- This tests serial idempotent replays. It does not yet prove every
  possible independent-transaction race, live Meta send, callback
  ordering or production history completeness.
- It does not verify owner/admin Meta subscription results or the
  native Instagram app as the originating client.
- It performs no production migration, deployment flag change, cron
  activation, history import, real reply or live CRM write.
- The live exactly-once acceptance check remains mandatory before
  enabling the outgoing echo processor.

As long as live evidence is missing, keep the outgoing-echo and
history-import flags OFF and the outbound retry job INACTIVE.
