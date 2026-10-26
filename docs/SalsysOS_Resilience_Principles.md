# SalsysOS Resilience Principles

**Date:** 2026-10-26  
**Status:** Canonical architecture guidance for external dependency outages

This document turns the October 26 Supabase incident into permanent system design rules.

## 1. External providers can fail

SalsysOS may depend on Supabase, Vercel, Meta, payment processors, email providers, analytics APIs and customer systems. None of those dependencies should be treated as perfectly available.

Design for temporary unavailability rather than assuming it cannot happen.

## 2. Separate user availability from business-event durability

A database outage may prevent authenticated UI use, but it must not automatically destroy authoritative business events.

The user-facing application and the business-event ingestion plane are therefore separate resilience concerns.

## 3. Authoritative event durability must exist outside the failed dependency

If Supabase/Postgres is unavailable, a queue stored in the same Supabase/Postgres database cannot protect the event.

For trusted business events, the first durable boundary must therefore be independent of Supabase.

Current implementation:

`trusted source -> /api/events/v1 -> Vercel durable queue -> private consumer -> Supabase/Postgres`

## 4. Never claim durable acceptance before a durable boundary succeeds

An event may be reported as durably accepted only after at least one approved durable path has accepted it.

If neither independent queue nor direct authoritative persistence succeeds, return a retryable failure instead of a false success.

## 5. Stable IDs make replay safe

Every authoritative retriable event must retain a stable event id.

Retrying the same business fact must not create duplicate bookings, payments, enrollments or revenue.

Idempotency belongs at both transport and canonical persistence boundaries.

## 6. Secrets remain secrets during recovery

Recovery infrastructure must not weaken credential handling.

- never queue plaintext trusted-source secrets;
- never log them;
- queue only a one-way fingerprint where needed;
- re-validate active credentials before persistence;
- revoked/inactive sources fail permanently.

## 7. Browser and server authority remain different

Browser telemetry can describe behavior, source, journey and intent.

Only trusted backend/provider confirmation can establish authoritative booking, paid, enrollment, refund or final-revenue truth.

An outage does not justify weakening this boundary.

## 8. Customer checkout must not depend on telemetry

Salsys tracking/telemetry failure must not prevent the customer from completing a valid booking or payment in the source business system.

Telemetry integrations should fail open relative to the source transaction while preserving enough local/provider identity for later reconciliation.

## 9. Backlog recovery must be controlled

After a provider recovers, do not stampede it with the full backlog.

Use bounded concurrency and retry/backoff behavior. Current durable trusted-event consumer recovery concurrency is intentionally capped.

## 10. Persist raw truth before derived projections

Once a trusted event is durably stored in canonical raw event evidence, downstream projection may be retried independently.

Projection failure after raw persistence is not equivalent to event loss.

## 11. UI dependency failures should be bounded and explicit

Auth/workspace/database calls in routing and login paths must have bounded waits.

Infrastructure failure should return a controlled temporary-unavailable state rather than:

- hanging indefinitely;
- causing a platform middleware timeout;
- falsely reporting invalid credentials.

Security-sensitive authority checks remain fail-closed.

## 12. Reconciliation is part of resilience

Queues and retries reduce loss risk, but authoritative systems should still be reconcilable.

Future connector/provider implementations should support comparing provider truth against Salsys persisted truth after outages.

Examples:

- payment processor captures vs Salsys payments;
- enrollment provider records vs Salsys enrollments;
- trusted source event ids vs persisted raw events.

## 13. Backups and transport resilience solve different problems

PITR/backups protect stored database state.

Independent durable queues protect events that arrive while the database cannot accept writes.

Both are required for mature resilience; one does not replace the other.

## 14. Evidence language

Always distinguish:

- BUILT;
- MERGED;
- DEPLOYED;
- TESTED;
- PROVEN E2E.

Do not convert an inferred recovery into a proven business-event result.

## 15. References

- `docs/SalsysOS_Current_Checkpoint.md`
- `docs/checkpoints/M-2026-10-26-Supabase-Incident-and-Durable-Event-Resilience-v1.md`
- `docs/durable-event-ingestion-v1.md`
- PR #187 / merge `9409a658c5786ae4a6fa209d976c732f0c6de00d`
