# R2-P3 — Native retention readiness, evidence gate V1

**Date:** 2026-11-05. **Status:** RESEARCH ONLY / NOT READY TO LABEL A REPORT "RETENTION".  
**Source:** Read-only production aggregates from canonical SalsysOS `public.raw_events` and source review of `public/salsys-tracker.js`. No tenant events, identities, CRM records, cookies, or consent receipts were modified.

## Objective and scope

Before adding PostHog-like D1/D7/D30 retention, determine whether first-party anonymous identifiers support meaningful repeat-visit observations. Do **not** conflate browser IDs, sessions, visitors, real people, qualified leads, or confirmed customer retention.

The authenticated Marketing → Behavior workspace already contains ordered funnels, navigation paths, daily event trends, and page-level event breakdowns. Those are **event observation reports**; they do not establish mature person-level cohorts.

## Source and identity behavior

The active Universal SDK loads `public/salsys-tracker.js`:

- With required consent, `salsys_vid` is saved to **localStorage** only after analytics permission is granted; `salsys_vid_session` is in **sessionStorage**. Browser-generated IDs do not identify a person and are scoped to the website origin/browser storage context.
- `salsys_sid` is a random **sessionStorage** key reused across reloads in the same tab and is not currently defined by a 30-minute idle timeout. A new tab, storage clear, private mode or blocked storage can create separate identifiers; browser session restore can extend a key's lifetime.
- `web.session_started` is sent once per session key in normal SDK operation, but retries can create multiple source events for the same key. Canonical event IDs and session keys must be deduplicated separately.
- Consent denial/withdrawal removes the persistent visitor key, stored first-touch attribution and queued events from localStorage. The current tab's in-memory visitor ID and sessionStorage ID are not explicitly rotated in the same function. **Before retention activation, test deny → grant again in one tab** for unexpected ID continuity and ensure the intended privacy policy governs it. This is a source-review concern, not a claim of proven production misuse.
- `web.form_submitted` may be collected as a necessary form action without optional analytics permission; it is **not** automatically evidence of consented, repeatable analytics identity.
- A trusted CRM identity handoff is exact-session scoped and does **not** make an anonymous browser identifier an authoritative human identity. Cross-domain and cross-device stitching is not implied.

## Production evidence snapshot

These are **cross-tenant, aggregate-only audit totals** captured on 2026-11-05, and will change with new events. The attached SQL diagnostic is deliberately **tenant-bound**; it should not reproduce these cross-tenant totals for one organization.

| Measure | Observed |
| --- | ---: |
| Earliest recorded `web.*` event | 2026-10-22 |
| Latest recorded `web.*` event | 2026-11-05 |
| Distinct source-scoped anonymous browser keys with session-start evidence (30-day lookup) | 1,613 |
| Session-start events | 2,373 |
| Distinct observed session keys | 2,353 |
| Session keys with multiple start events | 15 |
| Browser keys with more than one session key | 265 |
| Browser keys with repeated sessions **on the same UTC day only** | 168 |
| Browser keys seen on more than one UTC day | 97 |
| Browser keys with observed spans of at least 7 days | 27 |
| Browser keys with observed spans of at least 14 days | 1 |

The production ledger contains **only approximately 15 calendar days of web-event history**, which is insufficient for a mature D30 cohort. These counts are not D7 or D30 retention numerators; the first appearance in this limited ledger is not necessarily a visitor's first-ever visit.

Additional read-only data quality evidence: of 8,418 web events inspected, 8,406 had an analytics `granted` metadata snapshot and 12 had no analytics decision in that snapshot. The recorded SDK versions were 1.1.0 (8,287 events) and 1.0.0 (131 events). The standalone `tracking_consent_events` ledger, by itself, is not a complete continuous proof of grant/withdrawal history for every event and browser identifier. The raw-event consent snapshot is observational metadata, not a substitute for authoritative consent-eligibility adjudication.

## Recommendation: staged retention semantics

**Stage A — now:** Only use `observed repeat-session keys`, `same-day repeats` and `cross-day return keys` as internal aggregate evidence, not as a production retention percentage. Break down by authorized organization and tracking-source scope internally; do not show user/session identifiers, exact journeys, paths, UTM values or individual consent details.

**Stage B — validate:** Controlled first-party browser tests for required/granted/denied/withdrawn/regranted permission; same-tab reload, new tab, private mode, browser restore, blocked storage, and cross-origin navigation. Confirm ID rotation and deletion policy on withdrawal and different SDK versions. Verify consent ledger / raw-event metadata consistency and source-origin/tenant boundaries.

**Stage C — cohort gate:** Define UTC cohort start from a sufficiently complete observation window, an inactivity/session definition, a meaningful active-event definition and at least a 30-day lookback + 30-day follow-up for D30 measurement (a conservative minimum of 60 calendar days of suitable history). Cohorts not yet mature must be excluded or labeled incomplete; do not claim that 60 days alone establishes cohort accuracy.

**Stage D — bounded implementation:** Build read-only, tenant-authorized database aggregates, with volume bounds, explicit unavailable states, k-anonymity suppression, regression tests for clock skew/ID rotation/duplicate sessions/missing consent and real owner acceptance before exposing a retention KPI. No raw visitor ID joins outside the database result boundary and no auto-enrollment/CRM mutations.

## Reproducible SELECT-only audit

`docs/sql/r2-p3-retention-readiness-v1.sql` is for a **trusted operator** with verified access to one tenant. It uses a required `psql` `organization_id` variable, returns a single JSON object of aggregate counts, caps 30-day candidate session-start events at 50,001, and never returns source IDs or visitor/session identifiers.

```bash
psql "$AUTHORIZED_DB_CONNECTION" \
  -v organization_id='<verified-organization-uuid>' \
  -f docs/sql/r2-p3-retention-readiness-v1.sql
```

Do not paste these credentials, a real organization UUID or the raw query results into issue comments. Use only a separately approved production read-only connection. This diagnostic is **not** a migration, RPC, tracking activation, dashboard feature, or publicly accessible API.

## Acceptance / pending work

- [x] Source-review browser visitor/session ID storage and basic consent pathways.
- [x] Read-only aggregate historical coverage, source versions, repeated session IDs, same-day versus cross-day evidence.
- [x] Add a documented tenant-scoped, SELECT-only reproducibility query.
- [ ] Controlled staging/manual consent-withdrawal and regrant continuity test.
- [ ] Validate cookie/storage lifecycle and source identity provenance under real browser configurations.
- [ ] Validate enough history to mature cohorts and explicit first-seen washout.
- [ ] Approve final cohort definition, thresholds and presentation language.
- [ ] Implement and authenticate the read-only retention aggregate with strict privacy controls.
- [ ] Actual owner/admin multi-tenant QA (Issue #523), and controlled website collector pilot (Issue #520).

**Dependencies:** R2-P2 Issue #523 stays open for real authenticated tenant acceptance. R2-P1 website collection remains OFF pending Issue #520. R2-P3 tracking Issue #527 remains open. Never enable a new collector just to populate a retention dashboard.
