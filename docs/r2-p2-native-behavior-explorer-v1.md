# R2-P2 — Native Behavior Explorer V1

**Status:** Review-only implementation; do not apply to production until PR checks pass.

This adds PostHog-style **ordered web event funnels and aggregate navigation paths inside SalsysOS**, without a PostHog dependency. R2-P1 pilot issue #520 remains open. No new customer website tracking is enabled in this checkpoint.

## Location
- SalsysOS -> Marketing -> Behavior (a new tab).
- Existing Funnel, Analytics, Attribution and Marketing pages remain unchanged.
- The user can choose 2–5 distinct registered browser events and a 7/14/30-day window, then rerun a report. No customer-defined event contracts or saved reports yet.

## Data semantics
- Uses the immutable, canonical public.raw_events ledger. No second analytics database.
- Only canonical web events with explicitly active registered contracts can enter a funnel.
- A session is keyed by tracking source, anonymous visitor and session key, avoiding cross-site/visitor collisions.
- Events must occur in strictly recorded order by occurred_at, then event UUID for ties.
- The earliest matching ordered subsequence counts one session once at each stage.
- Browser events do not establish confirmed CRM leads, revenue, bookings, or enrollments.
- Separate adjacent page-view transitions show aggregate sessions and transition counts.
- Paths with fewer than 3 sessions are hidden. Potentially sensitive path tokens are collapsed or excluded.
- No raw visitor/session IDs, email, phone, form values, raw event payload, or individual journey is sent to the UI.

## Security and limits
- SECURITY DEFINER RPC guards require an authenticated, active CRM user and membership in the currently bound organization. The caller cannot choose another organization.
- Direct raw-events Data API access remains blocked by existing RLS/ACL.
- RPC EXECUTE is revoked from PUBLIC and anon and granted only to authenticated.
- Date windows are strictly 7/14/30 days, 2–5 distinct steps, and only active registered web event names.
- Funnel candidate events are bounded to 50,000; results fail closed rather than show partial counts.
- At most 12 ranked navigation transitions are returned.
- No write access, automation, callbacks, customer messaging or outbound provider interactions.

## Acceptance
1. Clean database replay validates SQL and the deterministic sequence helper's four assertions.
2. Readiness/contract tests validate tenant checks, bounded inputs, no raw IDs, minimum aggregate size and existing Funnel route preservation.
3. TypeScript typecheck and production build pass.
4. CodeQL passes.
5. Confirm read-only behavior on real production tenant after approval and migration; check a valid 3-step funnel, invalid steps, zero-data empty state, and a separate tenant's rejection.
6. Run an authenticated, owner-approved browser QA at desktop and mobile widths and inspect SQL latency under increased event volume.
7. Keep R2-P1 customer-site collection OFF until controlled pilot issue #520 passes.

## Intentionally deferred
- Time-to-convert and step property filters.
- Session replay.
- Saved funnels, cohorts and retention.
- User-journey drill-down or person-level re-identification.
- A/B tests, surveys and feature flag management.
- Alternate-vertical tracking, Real Estate (after R14) and Instagram outgoing synchronization.

The first release focuses on a safe, intelligible analytic foundation. Additional interactive analytics should be added after measured production acceptance.
