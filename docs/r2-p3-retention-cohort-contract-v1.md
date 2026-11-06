# R2-P3 — Privacy-first retention cohort definition V1

**Date:** 2026-11-06. **Status: RESEARCH ONLY.** No D1/D7/D30 retention KPI, dashboard, API, migration, tracking activation, visitor export, or production rollout is authorized.

This contract extends the existing retention evidence review (docs/r2-p3-retention-readiness-evidence-v1.md) and tenant-scoped SELECT-only audit (docs/sql/r2-p3-retention-readiness-v1.sql). The new executable research model lives entirely in tests/readiness/r2-retention-cohort-contract-v1.test.cjs. It uses fabricated events, has no application import, and is NOT a production metrics engine.

## Provisional meaning

Use the label **observed new-to-window browser keys returning with a new session**, not people, students, leads, customer retention, or verified attribution. The intended logical identity is source-scoped: (organization, tracking source, anonymous browser key, verified consent epoch). Never combine keys across organizations, origins, sources, browsers or an exact-session CRM identity handoff.

The synthetic test includes an identityEpoch field to represent a independently verified consent and rotation boundary. This is a TEST ASSUMPTION, not a field of public.raw_events, and it must never be fabricated from metadata or inferred from matching visitor strings. Draft PR #530 addresses withdrawal/regrant behavior but has NOT been accepted in a real browser. Without verified identity continuity, actual retention eligibility remains blocked.

## Eligibility, dates and activity

- The provisional activity event is canonical, consent-eligible web.session_started. A page view, refresh and necessary form submission do not by themselves establish an independent consented return session.
- A session is unique to tenant, tracking source, browser key, verified consent epoch and session key. Replayed event IDs and repeated starts for the same session key count only once. The same session lasting across UTC midnight is NOT a return session.
- A return must use a distinct session key inside the same verified tenant/source/browser/epoch and have its first start on exactly cohort day +1 (D1), +7 (D7), or +30 (D30), respectively. These are exact UTC calendar days, NOT a rolling or cumulative within-N-day window.
- Cohort entry is the first observed eligible session start AFTER a verified continuous **30-day washout**. This is not reliable evidence of a person's first-ever visit. Missing historical events do not prove inactivity. The full lookback and outcome observation must be complete.
- All dates are UTC. Today's UTC day is incomplete. For an as-of date of 2026-11-06, the latest fully matured D30 cohort day is 2026-10-06, because the October 6 cohort's November 5 outcome day has ended. October 7 would not yet be mature.
- A 7/14/30-day report span means the number of fully mature candidate cohort ENTRY dates ending on the latest Dn-mature date; it is not the latest 7/14/30 event activity period.
- A minimum of **60** calendar days of sufficiently complete history is a general prerequisite for mature D30 evidence, but not always sufficient for a 7/14/30-day historical cohort span AND 30-day washout. The test checks the earliest candidate cohort's washout explicitly.
- Invalid/missing analytics consent evidence, unverified source or identity, excessive clock skew, stale delivery, bot/automation uncertainty, privacy deletion, unbounded input or conflicts must block rather than publish a partial retention figure. The synthetic model uses a provisional 24-hour delivery-lag tolerance and a 5-minute clock tolerance; real thresholds require separate evidence.

## Safety and aggregation

- Use a provisional cohort-day privacy threshold of at least **20** distinct eligible source-scoped browser keys. For 1–19 keys, suppress BOTH numerator and denominator; never display a calculated 0% or an identifiable row.
- The 20-key number is a research default, NOT final security approval. Test differencing between overlapping date ranges and repeated filters, rare cohorts, source/tenant sparsity, and UI compositional privacy before shipping.
- Return only server-authorized, bounded aggregates. Never return visitor/session/source IDs, cookies, contacts, page paths, private journeys, payloads or source-level identifiers. Real SQL must enforce current tenant and role membership and fail closed under event volume >50,000.
- The synthetic model emits a status of synthetic_only when all artificial gates pass; it cannot establish production metrics or authorize a new feature. Unsupported or immature cohorts must not silently produce a retention percentage.

## Hard dependencies before implementation

1. **Issue #523:** real authenticated owner/admin Behavior Explorer acceptance, tenant isolation, RLS, and comparison with authorized tenant-only SQL aggregates. Synthetic two-tenant Playwright does not prove real RLS.
2. **Issue #520:** controlled optional browser collector pilot. The collector remains OFF and may not be enabled to populate retention reports.
3. **Issue #530** and draft PR #530, plus Issue #531: verify required-consent grant/withdrawal/regrant, same-tab and cross-tab restore, identity rotation, blocked storage and exact-session form handoff on a properly isolated test website with a real CMP.
4. Confirm real 30-day washout and mature follow-up coverage, late arrivals, source retention policy, consent/source consistency, SDK versions, bot filtering and deletion boundaries. The observed raw-event history on 2026-11-05 was only about 15 days.
5. Obtain owner approval of active event, labeling, date window, privacy threshold and usefulness. Separately design and review read-only SQL RPC tenancy/role/grants, output safety and query bounds, then run authorized live acceptance. None is satisfied by this PR.

## Synthetic contract cases

- Missing acceptance gates or short history => blocked, no KPI.
- Duplicate event IDs, repeated session starts, same-session reloads across days => no artificial return.
- Independent new session on exact D1/D7/D30 calendar day => synthetic return only.
- Returns on D2/D8/D31 do not satisfy D1/D7/D30 respectively.
- Same browser-like string in another source/tenant or fresh consent epoch => never stitched.
- Small cohort (fewer than 20 keys) => suppressed numerator AND denominator.
- Missing identity/epoch/consent, uncertain timestamp/delivery, conflicting duplicate => blocked.
- Recent cohorts without a fully closed outcome day => not included.
- Serialized result => aggregate statuses/dates only, no raw IDs.

**Release gate:** This is research/specification and test-only work. Issue #527 must stay open. No billable staging project, new Supabase branch, tracking source, background job, website script, payment action, deployment or provider send is required or authorized.
