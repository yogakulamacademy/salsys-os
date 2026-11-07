# R2 website lead capture — SQLSTATE 40P01 mitigation (DRAFT)

**Issue:** #620. **State:** UNRELEASED, draft engineering candidate. No permission to merge to `main` or run production test submissions from this document.

## Read-only evidence from November 7, 2026

- Vercel runtime error aggregation reported a single `/api/leads/browser/v1` failure: `deadlock detected`.
- The separately inspected production Postgres log recorded **one** `40P01` at **12:01:10.870 UTC**. Boolean-only log checks found the context includes `ingest_website_lead`, `visitor_identity_links` and an `ON CONFLICT DO UPDATE`, with a transaction ShareLock. We did **not** export raw query text, personal values, process IDs, visitor IDs, session keys or the detailed deadlock graph.
- The existing ingestion SQL takes a transaction-scoped advisory lock keyed by `organization_id + external_event_id`. Distinct events for the same visitor/contact are not necessarily serialized by this event-specific lock.
- This evidence narrows the likely contention area but does **not** prove the full opposing lock chain or a deterministic root cause. Do not rewrite database lock ordering without isolated reproduction and review.

## Narrow application-level mitigation

- Wrap **only** the tenant-bound `ingest_website_lead_for_organization` RPC in `retryWebsiteLeadIngestDeadlock`.
- On a PostgREST result with SQLSTATE **`40P01` only**, wait 35 ms and attempt the **same RPC with the same external event ID** one additional time. PostgreSQL aborts the deadlocked RPC transaction; the existing SQL idempotency check is retained.
- Return all successful and other-error responses unchanged. A second `40P01` remains an error; there is no recursive/unbounded retry.
- No replay of privacy gates, external sends, rate-limit calls, source enrichment, customer messaging, course booking, payments or enrollment actions.
- Do not retry general network errors, timeouts, uniqueness, authorization or RLS errors.

## Verification / release gate

- New actual-source Node synthetic tests cover first-attempt success, one `40P01` recovery, exhausted retry, other SQL/network errors, stable closure event key and narrow route integration.
- `tests/database/r2-browser-lead-deadlock-concurrency.test.mjs` now runs with two independent connections against a **random disposable local PostgreSQL database** in the financial-database CI service. It deliberately constructs an opposing row-lock cycle, checks actual PostgreSQL `40P01`/rollback, then exercises the *actual retry helper* to commit one event receipt and suppress a duplicate retry. This is a simplified lock model, **not an exact reproduction** of the production ingestion SQL/triggers, and does not establish the root cause of the observed deadlock.
- Require exact-head `npm run test:readiness`, TypeScript, Next.js build, full CI, CodeQL and financial/database regressions **before** any release decision.
- The mitigation is not a substitute for a disposable Postgres dual-transaction reproduction of the actual lock cycle, a controlled real site form acceptance, idempotency verification or production failure-rate review.
- If merged after explicit code review, monitor `40P01` and browser lead capture errors without exposing event or contact payloads. Roll back the isolated route/helper if retries introduce any duplicate effects or unexpected latency.
- Issue #620 remains OPEN until safe evidence demonstrates the production incident is resolved; issue #523 owner/admin acceptance, #531 consent staging, #520 collector pilot (OFF), and #527 retention remain separate.

**Safety:** No production database write, schema, RLS, tenant membership, site tracking flag, consent policy, billing, customer record, payment, enrollment or provider send is authorized by this draft.
