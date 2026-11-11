# AI-09J — Disposable PostgreSQL audit idempotency and uncertain-retry rehearsal (DRAFT)

**Date:** 2026-11-09  
**Review PR:** [#671](https://github.com/yogakulamacademy/salsys-os/pull/671), branch `integration/kb16-r2-main-preserve-20261109`.  
**Status:** Local synthetic engineering only. **NOT** a Supabase migration, production authorization, legal retention policy, AI tool executor or proof of live audit durability.

## Why this checkpoint matters

AI-09I modeled read-result withholding until a **mocked** commit receipt. That cannot prove real database transaction behavior. A timeout may occur after a database commits, and a caller might retry with the same request ID. Without an idempotency strategy, a retry can insert extra audit events, replay a different resource scope, or falsely release records.

AI-09J tests PostgreSQL's actual **unique constraint and transaction conflict behavior** in a disposable, freshly generated localhost database. It does **not** implement a live transaction adapter. No records leave the function; it returns only a local ledger state and `may_execute=false`.

## New artifacts

- `docs/sql/AI-09J-idempotent-audit-replay-REHEARSAL-DRAFT.sql`: Guarded `ai09j_rehearsal` schema; executes only inside a synthetic `salsys_ai09j_<18 lowercase hex>` database with a deliberate marker and fixture Auth/tenant tables. It refuses real CRM/Knowledge table presence.
- `tests/database/ai-audit-idempotency-replay-rehearsal.test.mjs`: Included automatically in `npm run test:financial:db`; creates the local database, uses independent PostgreSQL connections, and drops the temporary database in `finally`. Requires `SALSYS_ALLOW_LOCAL_DB_TESTS=1`, a `localhost`/`127.0.0.1` server, the `postgres` root username and `/postgres` database.
- No `supabase/migrations`, `app/` or live `lib/ai` wiring was changed by AI-09J.

## Local simulation and tests

The fixture models a server-created request UUID (not model/browser-supplied), exact tenant + signed-user *mock* session and direct binding, current owner/admin membership and an allowlisted read-only tool. Audit metadata uses a globally unique request UUID; a second insertion of the same ID is serialized by the real PostgreSQL primary key.

| Test condition | Required local behavior |
| --- | --- |
| First allowed request | Appends one synthetic audit row; returns `inserted_pending_commit` and no records |
| Independent connection after COMMIT | Can observe precisely one persisted row |
| Same request replay after successful COMMIT | Returns `already_present_no_result`, no new row and no read data |
| Same request ID, different resource/row count/tool | Denies the collision, without reporting prior request data |
| Same request ID across tenant, actor or session | Denies the collision globally |
| Concurrent duplicate while first transaction is open | Second transaction waits for the first commit/rollback outcome; cannot insert two rows |
| First transaction commits | Waiting duplicate returns replay state, one row total |
| First transaction rolls back | Waiting request becomes the sole insertion, still *pending commit* until its own transaction commits |
| Simulated crash/rollback then retry | Rolled-back event is absent, retry inserts once |
| Disabled auth session / non-admin / anon / service role | No new request or replay authorized |
| Failed audit insert or direct table read | Fails closed, returns no records |
| Direct delete or truncate | Blocked by local append-only triggers for ordinary statements |
| Knowledge search, CRM mutation or malformed resource scope | Always denied |

A tuple check binds each request ID to **organization, actor, session, read tool, resource ID and row count**. If a duplicate ID has changed meaning, the function rejects it rather than issuing a model-visible receipt.

## Important limitations

1. **Not signed real-world Auth:** Synthetic `auth.jwt()` comes from test-controlled PostgreSQL claims. Current Supabase Auth, JWT validation, logout/refresh behavior and deployed `auth.sessions` privileges remain untested. Do not allow callers/models to choose request IDs, actors, roles or session IDs in a real service.
2. **Ledger is not a CRM read:** This function **never** reads courses, leads, Knowledge or customer records. Actual same-transaction resource authorization, consent, RLS and minimal projection are still separate mandatory work.
3. **Commit semantics:** A returned `inserted_pending_commit` is **not** proof of persistence. The tests explicitly issue COMMIT then check from an independent connection. The function itself does not create a durable application acknowledgment or streaming barrier.
4. **Replay is not a reusable authorization token:** `already_present_no_result` is deliberately not treated as a read result. If a previous request succeeded but its response was lost, the caller cannot reconstruct or resend data merely by replaying an ID. User-facing reconciliation semantics need approved security/product design.
5. **Privileged owner is not RLS proof:** The rehearsal uses local privileged `SECURITY DEFINER` behavior, with explicit tenant predicates and direct grants denied. Production SQL owners, `BYPASSRLS`, Data API exposure, RLS policies, anonymous Supabase users and SQL lock/isolation behavior must receive independent DBA/security approval.
6. **No legal audit policy:** The audit contains synthetic actor/session/request identifiers; no raw prompt, phone, email or fetched content. Exact production purpose, minimal identifiers, retention, deletion, tamper resistance, denial events, external processors/backups, and recovery are **unapproved** under #613. The append-only triggers are removable by privileged DDL administrators.
7. **Concurrency tests are evidence of local Postgres behavior only:** They do not cover a real transaction manager, SQL connection pooler, network partition or provider output. Real scenarios must be independently witnessed in approved isolated staging.
8. **Never conflate audit logging with a right to access data:** The local function returns empty records and `may_execute=false` in every outcome. AI-09H's nine gates stay `pending_independent_review`; Knowledge consent remains blocked.

## Release gate and follow-up

Staging is owner **ON HOLD**; **0/16** signed-user staging witnesses; **0** independent PR reviews. Issues #601, #612, #613, #614 require independent decisions. Draft PR #671 must remain unmerged; `main` automatically affects production-linked deployments. No hosted Supabase SQL, production/recovery staging, project billing, customer crawl, provider or MCP call, Co-Pilot execution, WhatsApp or CRM mutation has been performed.

**Next independently reviewed engineering design:** a trusted server-created correlation ID, transaction and audit commit receipt owned by one approved database transport, privacy-approved retry/denial semantics and per-resource Auth/RLS checks. This document and its local tests do not approve implementation or launch.
