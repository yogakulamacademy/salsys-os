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
- Cohort entry is the first eligible session-start date AFTER a verified continuous **30-day washout**, meaning no consent-eligible start for the same source-scoped browser key on any of the **30 preceding UTC dates** (the date exactly 30 days earlier is included in the washout). A browser key can become **new-to-window again** after a 31-or-more-day quiet gap within independently complete history, even when it has older observed activity. That is not reliable evidence of a person's first-ever visit, and must never be labeled a new person or new customer. Missing historical events do not prove inactivity. The full lookback and outcome observation must be complete.
- All dates are UTC. Today's UTC day is incomplete. **Maturity requires both a closed return day and a separately verified ingestion-completeness watermark.** For an as-of date of 2026-11-06 *and only if* November 5 is independently verified complete, the latest D30 cohort date is 2026-10-06. If the latest complete day is November 4, the latest eligible D30 cohort is October 5. An elapsed date by itself is NOT proof of data completeness.
- A 7/14/30-day report span means the number of fully mature candidate cohort ENTRY dates ending on the latest Dn-mature date; it is not the latest 7/14/30 event activity period.
- A minimum of **60** calendar days of sufficiently complete history is a general prerequisite for mature D30 evidence, but not always sufficient for a 7/14/30-day historical cohort span AND 30-day washout. The test checks the earliest candidate cohort's washout explicitly.
- The synthetic input completeThroughUtc is an **externally attested** last fully observed UTC day, not calculated by taking MAX(event_date). The test rejects a missing or present/future-day watermark. It drops incomplete as-of-day activity and events delivered after the report's start-of-day cutoff. This is a synthetic expectation; real completeness requires audited source uptime, outbox delivery, late-arrival bounds and consent/erasure evidence.
- Invalid/missing analytics consent evidence, unverified source or identity, excessive clock skew, stale delivery, bot/automation uncertainty, privacy deletion, unbounded input or conflicts must block rather than publish a partial retention figure. The synthetic model uses provisional 24-hour delivery-lag and 5-minute clock tolerances for eligible evidence; real thresholds require separate validation. Explicit **botFiltering**, **privacyErasureCoverage**, and **eventTimeQuality** gates default to blocked. A synthetic true value is only a test assumption, not a live system verification.
- **Production counterevidence (2026-11-07, read-only):** The active Yogakulam website source recorded **four** `web.session_started` receipts more than **24 hours** after occurrence in the observed 30-day lookback, despite only **17 observed UTC calendar days** of web-event history. This invalidates any unqualified assumption that a 24-hour ingestion cutoff establishes completeness. The research-only test intentionally **blocks** a candidate event even one second beyond 24 hours; it must never silently omit that event and publish an apparently clean cohort. The exact 24-hour boundary remains a synthetic assumption, **not** an approved production delivery SLA. No D1/D7/D30 report should be published until actual late-arrival distributions, replay/queue behavior, the separately attested completeness watermark, erasure/consent continuity, and a suitable lateness policy have been reviewed and approved. Excluding delayed events is **not** a substitute for proving historical completeness; longer cutoff windows alone do not close this gate.

- **Additional timestamp-quality evidence (2026-11-07, 06:52–06:53 UTC):** Of **2,637** observed source-scoped session-start receipts, **171** had `received_at < occurred_at` (the client event time was later than server receipt); **165** were within 5 seconds, **5** were 5–30 seconds, **1** was 30 seconds–5 minutes, and **none** exceeded 5 minutes (largest observed negative lag approximately **94.6 seconds**). Positive receipt lag exceeded 24 hours in **4** events (all 24–48 hours, maximum approximately **34.3 hours**). These are aggregate timestamp comparisons only: a negative lag does **not** by itself prove tampering or a backend bug; client clock differences and asynchronous transport are possible explanations. The synthetic regression accepts exactly five minutes of negative lag but blocks anything beyond five minutes; both this limit and the 24-hour delivery limit remain **unapproved research assumptions**, not production acceptance thresholds. No automatic correction, timestamp rewriting, event deletion, or retention computation is permitted from these findings.

## Closed UTC-day observation coverage (2026-11-07, research)

The trusted-operator `docs/sql/r2-p3-retention-readiness-v1.sql` now includes the number of **distinct closed UTC calendar days with web-event observations** during each of the preceding 30 and 60 closed UTC days, the number of the last 60 closed days without an event observation, and explicit `history_completeness_verified=false`. Today's UTC date is always excluded from those counts, even if some events have arrived today.

**Read-only production snapshot at 2026-11-07T11:27:56Z** for the internally resolved active production website scope: 9,349 web-event observations in the 90-day bounded sample; earliest recorded date **2026-10-22**, latest recorded date **2026-11-07**; **16 of 60 closed UTC days** had a web event. The most recent 30 closed UTC days also contained observations on **16 days**. The current UTC date (November 7) is incomplete. The 44 closed UTC days without observations in the preceding 60-day window are **not necessarily 44 days of ingestion failure**: the website may not yet have been instrumented or may have had no activity. Likewise, observed days are not proof of source completeness, uninterrupted consent or independent first-seen evidence.

This means a mere earliest→latest event date span—or eventually reaching 60 calendar days since the earliest event—must not qualify D30 cohorts. Review independently attested source uptime and ingestion completeness per eligible day, the full 30-day inactive washout, closed D30 outcome days, event latency, bot/deletion policies and consent/identity boundaries before any retention percentage. The SQL remains SELECT-only, privately tenant-scoped and operator-run; it returns only aggregate coverage and existing bounded evidence, with no raw visitor/session/source identifiers. This patch does not add a public RPC, migration, dashboard, collector or retention KPI.

## Reproducible operator-only timestamp-quality diagnostic (research)

The SELECT-only file `docs/sql/r2-p3-event-time-quality-diagnostic-v1.sql` returns a **single privacy-bounded aggregate JSON object** for a separately verified authorized tenant. It is not deployed as a function/API/report, does not change production data, and never returns browser, session, tracking-source or organization identifiers.

Run it only with an independently authorized **read-only** database connection. Pass the tenant UUID privately to `psql`, never via an issue or copied public record:

```bash
psql "$AUTHORIZED_DB_CONNECTION" -X -q -A -t -P pager=off -v ON_ERROR_STOP=1 \
  -v organization_id='<verified-authorized-tenant-uuid>' -v days=30 \
  -f docs/sql/r2-p3-event-time-quality-diagnostic-v1.sql
```

The diagnostic accepts only 7/14/30 **UTC calendar-day** windows (current UTC day incomplete), caps observations at 50,000, and suppresses all quality counters if the cap is exceeded or the window is invalid. It reports mutually exclusive **negative/positive arrival-delay buckets**, a client-observed analytics snapshot breakdown, count of observed SDK versions, and maximum/minimum event-to-receipt lag. Its `observational_only` status explicitly does **not** establish cohort eligibility, full source/consent history, an ingestion SLA, owner/admin session authorization, or retention. A `no_observations` status is not proof that no traffic occurred. These aggregate receipt-time comparisons do not distinguish client clock skew from queue/retry behavior.

On 2026-11-07 at ~07:03 UTC, a SELECT-only syntax/execution check of the diagnostic, with the target production organization resolved *internally in SQL* from the active `yogakulam.com` website source (without emitting IDs), returned `observational_only`, **2,639** bounded session-start observations, **4** arrivals 24–48h after the claimed event time, **171** negative-lag observations within five minutes, and **2** SDK versions. No tenant IDs, browser keys, event payloads or raw rows were returned. These counts change as new events arrive, and they still leave the proposed 24-hour and five-minute limits **unapproved**.

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

- Missing acceptance gates, verified complete-through date, bot/erasure assessment, or short history => blocked, no KPI.
- Duplicate event IDs, repeated session starts, same-session reloads across days => no artificial return.
- An older browser-key session **31+ days** before a candidate day does not exclude a verified new-to-window entry; activity **1–30 days** before that day excludes it. Exact-day D1/D7/D30 returns still require another distinct session.
- Independent new session on exact D1/D7/D30 calendar day => synthetic return only.
- Returns on D2/D8/D31 do not satisfy D1/D7/D30 respectively.
- Same browser-like string in another source/tenant or fresh consent epoch => never stitched.
- Small cohort (fewer than 20 keys) => suppressed numerator AND denominator.
- Missing identity/epoch/consent, uncertain timestamp/delivery or conflicting duplicate => blocked. A replay with the same source-scoped event ID and identical original session/time may have a later receipt time; an event ID with a different session **or occurrence timestamp** is conflicting and must fail closed.
- Recent cohorts without a fully closed and independently verified complete outcome day => not included. Incomplete current-day activity and post-cutoff receipts cannot inflate a prior report.
- Serialized result => aggregate statuses/dates only, no raw IDs.

**Release gate:** This is research/specification and test-only work. Issue #527 must stay open. No billable staging project, new Supabase branch, tracking source, background job, website script, payment action, deployment or provider send is required or authorized.
