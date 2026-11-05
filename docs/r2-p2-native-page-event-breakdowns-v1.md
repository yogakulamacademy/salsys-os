# R2-P2 — Native Page-Level Event Breakdowns V1

**Release posture:** Review-only. Existing website tracking remains unchanged and R2-P1 source opt-in is OFF.

## Goal

Extend Marketing → Behavior to answer: **Which public pages generated each tracked web action?** The report complements ordered funnels, navigation transitions, and UTC event trends without inventing attributions or using PostHog.

An authorized CRM user can pick a single registered `web.*` event and reuse the 7-, 14-, or 30-day UTC window. The independent funnel definition is not changed by the page selector.

## Source of evidence and definitions

- Canonical `public.raw_events`, filtered by the active organization bound to the authenticated CRM session.
- Each row is an **observed event**, not a unique visitor, confirmed lead, or paid conversion.
- `occurred_at` determines the UTC day; `received_at` must be at least one day before the window start, matching Event Trends.
- `identified_sessions` and each row's session count require nonblank tracking source, anonymous visitor ID, and session key.
- Each path is normalized using `native_safe_page_path_v2`, then a separate stricter denylist excludes private routes such as account, profile, student, payment, order, checkout, lead, admin and token surfaces.
- A displayed path must be observed from **three distinct source-scoped anonymous visitor identifiers**. This is a privacy threshold, not proof of three unique people.
- Maximum 10 paths; all non-displayed events are grouped as **Other or withheld events**, including unsafe paths, small groups and valid paths outside the top 10.
- The page/event percentage uses the *total* observed events for that event type as the denominator; percentages do not necessarily total 100% due to withheld activity.
- The report does not return raw visitor or session identifiers, page query strings, form values, event payloads, or individual journeys.

## Security and operational limits

- Uses a `SECURITY DEFINER` function which explicitly checks authenticated CRM access and membership in the session-bound organization.
- Public and anonymous EXECUTE revoked. The internal safe-path helper is not directly executable by authenticated/anon roles.
- Only active registered global `web.*` event types accepted. Windows strictly 7/14/30 days.
- Abort reports exceeding 50,000 candidate events; do not return partial totals as complete data.
- Existing event ingester, RLS, leads, permissions, integrations, reporting SQL, and other analytics are untouched.
- Client read-back independently checks path shape, private-route patterns, counts, min cohort, path uniqueness and displayed/withheld totals.
- A missing migration or denied request displays a local error for this panel; existing Funnel, Paths and Trends must remain available.

## Acceptance

1. Clean database migration replay with synthetic SQL privacy assertions; validate helper allowlist and route denylist.
2. Readiness tests, full build and TypeScript checks.
3. Synthetic Playwright tests for ready, empty, small-cohort, denied, API-error and event-selection scenarios on 390px/768px/1440px viewports.
4. CodeQL.
5. Review merge, apply incremental migration to production only after passing checks.
6. Verify migration ledger, function EXECUTE grants, exact READY Vercel merge SHA and no new errors.
7. **Owner/admin authenticated browser acceptance** across relevant organizations remains in Issue #523. Synthetic tests do not prove real user permissions.
8. Keep optional R2-P1 collector OFF until controlled website pilot Issue #520.

## Retention feasibility — not implemented here

Read-only historical audit: of about 1,610 observed anonymous identifiers with a session-start event in 30 days, 265 appeared in more than one session. This is sufficient to evaluate a repeat-session metric, **not** yet sufficient to label a product retention cohort without verifying ID stability, consent consistency, identity rotation and cross-browser behavior. Cohort and retention definitions must be separately approved and tested before any retention percentage is presented as a reliable product KPI.
