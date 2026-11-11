# R2-P2 — Native Event Trends V1

**Release posture:** Review-only branch. R2-P1 collection remains OFF; this feature analyzes only existing first-party events.

## Why

The existing native Behavior Explorer shows ordered funnels and aggregated navigation paths. It does not show independent day-by-day event volume, making it difficult to distinguish a conversion-rate change from an underlying traffic change. This checkpoint adds native **Event activity** without a PostHog dependency or a second tracking database.

## Features

- A daily event trend for each of the currently selected 2–5 funnel event types.
- Total **event observations** and **identified sessions** per event across the report window.
- Date windows: 7, 14, or 30 **UTC calendar days**, including the current UTC date (explicitly marked incomplete).
- Daily bars (zero means zero, never an invented trend); text labels for screen readers and per-day hover detail.
- Clearly separates event counts from ordered funnel conversion stages, confirmed CRM lead creation and payments.
- Distinct status states for missing migration, database failure and excessive report volume; the existing Funnel and Paths remain available if trends fail.

## Data/security

The function `get_native_behavior_event_trends_v1` returns only aggregated counts from canonical `public.raw_events`. It uses the existing tenant-bound authenticated CRM authorization checks. No individual identifiers, event payloads, queries or page paths are returned.

- `p_days`: only 7, 14 or 30.
- `p_events`: 1–5 distinct active registered global `web.*` events.
- The selected events match the current ordered funnel selector but trends independently count each event across the window.
- Rows must be observed by UTC day and ingested no earlier than 1 day before the reporting window. Late or backdated events outside this receipt window may be excluded; do not claim completeness beyond that condition.
- Distinct sessions require nonblank source, visitor and session identifiers. Raw event counts include events lacking session IDs; therefore event counts and identified-session counts are not interchangeable.
- Abort at 50,000 matching candidate events instead of silently using truncated results.
- The server validates the RPC response, ordering and totals before rendering.
- Existing `raw_events` grants/RLS are unchanged. `anon` and `PUBLIC` cannot invoke the new RPC.
- No new source opt-in, browser instrumentation, CRM writes, automation or provider sends.

## Review and deployment gates

1. Review SQL search path, tenancy checks, event allowlist, date bounds, read complexity and response shape.
2. Run clean migration replay to validate function syntax, date sanity check and existing migrations.
3. Run the readiness and Playwright synthetic Behavior tests, TypeScript, Next.js build and CodeQL.
4. Merge only with passing checks and review.
5. Apply the SQL migration to the correct SalsysOS production Supabase project, read back grants and matching function metadata.
6. Verify the Vercel deployment exactly matches the merge SHA and READY aliases.
7. Compare authenticated reports for real tenants against separately computed tenant-scoped aggregates and review mobile layout; this remains owner/admin acceptance and is **not** satisfied by synthetic tests.
8. Leave [R2-P1 live collector pilot](https://github.com/yogakulamacademy/salsys-os/issues/520) OFF and [R2-P2 authorized UI acceptance](https://github.com/yogakulamacademy/salsys-os/issues/523) open until explicitly verified.

## Deferred

Event-property filters, person-level drill-down, retrospective segmentation, saved reports, cohorts, retention, session replay, experiments and surveys remain separate checkpoints.

## Server-side distinct-session set integrity — 2026-11-07

The existing Event Activity server data loader now checks the same **source-scoped distinct-session set cardinality** required by the R2-P2 offline comparator's draft #636. For each default or selected event, every UTC day's identified sessions must be no greater than that event's whole-window identified sessions; the sum of daily identified sessions must be **at least** the whole-window count. This is a necessary condition for a valid union of the UTC-day distinct-session sets. A session may appear on two different UTC days, so requiring the daily sum to **equal** the window count would incorrectly reject valid reports.

If either inequality fails or the sum exceeds JavaScript's safe integer precision, the Event Activity module fails closed with the existing unavailable state. The other two independently scoped Behavior panels (ordered funnel and Events by Page) must remain visible. This changes only the server response validator, not RPC queries, event collection, raw rows, permissions, enrollment, or privacy defaults.

The disposable loopback Chromium fixture now supplies two individually malformed reports: one day's session cardinality larger than the window's, and a window cardinality larger than all daily session counts combined. Both are rejected with no retained trend rows, while the same synthetic tenant's funnel and page breakdown still render; the normal valid scenario remains available. Structural tests guard these bounds. This is synthetic validation, **not** real owner/admin authenticated acceptance, tenant isolation or a live UI-to-SQL match. Issue #523 remains OPEN until the authorized reviewer witnesses it.

