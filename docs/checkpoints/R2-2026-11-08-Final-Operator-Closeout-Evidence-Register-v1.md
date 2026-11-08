# SalsysOS R2 — final operator closeout evidence register (2026-11-08)

**State: NOT FORMALLY CLOSED / controlled releases remain NO-GO.**  
**Owner intent:** finish R2 without new paid infrastructure, synthetic live leads, unapproved tracking, speculative identity merges, or checkout/enrollment changes.  
**Purpose:** one versioned, evidence-backed acceptance register to avoid repeatedly re-auditing finished engineering. The register is **not** consent approval, an independent PR review, a backup certificate, or release authorization.

## Scope and immutable release provenance

| Check | Observed state | Evidence |
|---|---|---|
| Current `main` and CRM production | `da5d53623eb4518b7fcf8e6f33adabb06963def9`; `crm.salsysos.com` Vercel deployment `dpl_9H6SaD8T2vuB4hHGPnBmKvh2ZF9Y` **READY** | Live Vercel deployment / GitHub |
| Safe test/audit merges | #663 (actual SDK/CMP Chromium tests), #665 (read-only optional analytics metadata audit) **MERGED** | GitHub |
| Reliability candidate | #667 **DRAFT, OPEN, UNMERGED**, head `e3797c8dba330ad6b92314be096dcef973c9345c` | [PR #667](https://github.com/yogakulamacademy/salsys-os/pull/667) |
| Candidate CI | Validate + financial-database [42488825402](https://github.com/yogakulamacademy/salsys-os/actions/runs/42488825402), CodeQL [42488825425](https://github.com/yogakulamacademy/salsys-os/actions/runs/42488825425), migration replay [42488825447](https://github.com/yogakulamacademy/salsys-os/actions/runs/42488825447) **SUCCESS** | Actual exact-head GitHub jobs |
| Production database function | Canonical old-body MD5 `309f9d3ea4929e26f6c44f77099559ed`; repair migration `20261108080000_r2_browser_lead_primary_contact_v1` **NOT APPLIED** | Read-only production query + migration ledger |
| Production runtime health | No reported `/api/leads/browser/v1` runtime-error clusters in selected 24h; this is **PRE-fix** baseline, not repaired-path proof | Read-only Vercel scan |
| Privacy / behavioral collector | Seven optional P1 event types: **0 server receipts over checked last 7d**; remains OFF by policy | Read-only `raw_events` 7-event aggregate. Absence of events alone does not prove every client is disabled |

## Authoritative acceptance gates: no implicit waiver

| Gate | Real PASS evidence required | Current result | Responsible party |
|---|---|---|---|
| R2-R1 Lead reliability (#667, #620, #643) | Independent technical review of exact `40P01` same-event bounded retry, `23505` privileged RPC replacement, ACL/tenant isolation, triggers and rollback; signed-in/real-form isolated E2E; DBA-confirmed backup/restore; approved release window; post-deployment error/duplicate audit | **BLOCKED / NO-GO**. CI and local rollback PASS are not independent approval or production recovery evidence | Independent reviewer, DBA and release owner |
| R2-P1 Behavior pilot (#520) | Owner-authorized **one** consent-safe real origin, static non-PII CTA/pricing/FAQ/form markers and scroll verification; Reject/withdraw/GPC suppression; source/tenant/session correctness; rollback by switching collector OFF | **BLOCKED**; no authorized live pilot; synthetic browser suite PASS | Website owner/privacy reviewer |
| R2-P2 Behavior Explorer (#523) | Legitimate signed-in owner/admin on **two** authorized tenants; 7/14/30 real UI copies compared with separately captured tenant-scoped SQL within 120 seconds; empty state, no path/PII leakage, accessibility/mobile | **BLOCKED**; SQL-only baselines exist, not two-tenant UI proof | Actual owners/admins and authorized read-only operator |
| R2-P3 Consent (#530/#531/#588) | Separate isolated HTTPS website + CRM/API + DB verified not connected to production, real CMP/GPC/withdraw/regrant, identity rotation/cross-tab/storage failure; legacy metadata reviewed | **BLOCKED**; existing recovery project is *not* authorized staging | Site operator/privacy reviewer |
| R2-P3 Retention (#527/#535) | Approved D1/D7/D30 identity epoch, cohort entry, activity event and suppression rules; >=60 continuous **verified** UTC history calendar days under the project contract, mature cohorts, late-arrival watermark and real validated consent | **NOT READY**, first observed 2026-10-22 (18 calendar days as of Nov 8). Dec 20, 2026 is earliest *possible* day 60, NOT an automatic release date | Analytics owner/privacy reviewer |
| Identity conflicts | Legitimate CRM Data Quality comparison of Lead, Current contact and Candidate; authorized distinct/merge decision for **4** open conflict records affecting **2** leads; retain audit trail | **HUMAN REVIEW REQUIRED**; no automatic merge/dismiss | CRM owner/authorized manager |
| Payment/enrollment source | Trusted real commerce completion evidence **or explicit owner-approved deferral into R5**; never infer authoritative `payment.completed` from lead form | **UNRESOLVED R2→R5 boundary** | Product/release owner |
| Final R2 sign-off | Actual witnessed pass/fail evidence and documented release decision after above; no 100% label merely from automated CI | **OPEN** | Authorized product owner |

## Observed read-only reference aggregates (2026-11-08 UTC)

**Behavior Explorer operator SQL, default ordered funnel** `web.page_viewed → web.form_started → web.form_submitted`. These are source-scoped *session paths*, not persons/leads. Rolling windows move; re-run within 120 seconds of a genuine admin UI capture.

| Rolling window | Page view | Form start | Form submit | Candidate events |
|---|---:|---:|---:|---:|
| 7d | 992 | 91 | 40 | 2,395 |
| 14d | 2,230 | 178 | 92 | 5,842 |
| 30d | 2,664 | 218 | 107 | 6,783 |

See [#523 SQL evidence](https://github.com/yogakulamacademy/salsys-os/issues/523#issuecomment-6722822037) and `docs/sql/r2-p2-behavior-funnel-reconcile-v1.sql`. This proves neither live UI equality nor tenant-role authorization.

**Optional consent metadata audit**, versioned source `docs/sql/r2-optional-consent-metadata-audit-v1.sql`, received-date windows ending on incomplete Nov 8:

| Window | All mapped events | Analytics-purpose events | Lacking analytics-granted metadata |
|---|---:|---:|---:|
| 7d | 3,239 | 3,166 | 1 |
| 14d | 7,939 | 7,765 | 7 |
| 30d | 9,468 | 9,265 | 9 |

All return `analytics_metadata_review_required`. The day-level Nov 7–8 sampled analytics events show zero missing metadata, but the audit cannot verify a visitor's true consent choice, GPC compliance or third-party blocking. See [#588](https://github.com/yogakulamacademy/salsys-os/issues/588#issuecomment-6722822414).

**Retention diagnostic** `docs/sql/r2-p3-retention-readiness-v1.sql`: `not_ready_for_retention_kpi`; October 22–November 8 **18 observed calendar days**, **2,685** session starts, **2,663** source-scoped distinct session keys, **16** duplicate start keys, **1,790** browser keys, **302** with repeat sessions; first-seen/identity and consent continuity unverified. These are NOT D1/D7/D30 rates or individual people. See [#527](https://github.com/yogakulamacademy/salsys-os/issues/527#issuecomment-6722822829).

## Minimum-cost owner/operator procedure to finish the remaining acceptance

1. **Release review:** add a genuinely independent GitHub repo collaborator with appropriate review permission and request review of **#667**; current connected author account cannot approve its own implementation. Requested review of a non-collaborator failed with GitHub 422 (not accepted); do not claim review requested or fabricate approval.
2. **Isolated E2E:** keep the existing Recovery Rehearsal Supabase project reserved for recovery unless its custodian explicitly authorizes other use, confirms the cost/recovery impact and independently verifies data/env isolation. Existing Vercel previews are NOT safe by default; no production credentials/records in tests. Without suitable no-new-cost staging, this gate remains NO-GO.
3. **Authenticated P2:** actual owner/admin signs into [CRM](https://crm.salsysos.com) → Marketing → Behavior, selects default funnel, captures 7/14/30 figures; trusted operator runs `docs/sql/r2-p2-behavior-funnel-reconcile-v1.sql` with verified tenant and same windows. Compare offline with `scripts/r2-p2-compare-review-figures.mjs`; repeat in legitimately authorized second tenant and document safe empty state, denied cross-tenant reads and mobile behavior.
4. **Privacy and P1:** after isolated consent/GPC tests PASS and a separate owner authorization, enable **only one** static, consent-safe P1 pilot; monitor raw events/touchpoints, deduplication and suppressed sends; disable at first anomaly. Do not make it the default for existing customers.
5. **Identity decisions:** review [CRM Data Quality](https://crm.salsysos.com/data-quality). For each conflict, compare the real Lead/Current/Candidate and choose **Dismiss as distinct** or **Confirm same person & merge** only after authorized verification. Re-run aggregate OPEN count; no PII or identifiers in public issue.
6. **Retention:** do not publish a KPI until complete, mature, source/consent-epoch-scoped real history exists. Approve cohort semantics and re-run bounded, privacy-safe diagnostics. Do not backfill fabricated historical visitors.
7. **Production release only after gates:** preflight exact `main`/migration/ACL/function/body hash and independently verified backup; approved maintenance window; apply the narrow migration using reviewed Supabase path, deploy **only** #667 once, verify the actual Vercel commit and passive real error/duplicate invariants; invoke named rollback process if needed. Record real post-release observations and product-owner signature.
8. **Formal sign-off:** scope any deferred R5 commerce dependency explicitly; mark R2 V1 closed **only if** its accepted V1 contract is satisfied, without falsifying unfinished P1/P2/P3 release gates.

## Security / scope exclusions

- No production identity merge/dismiss, customer messaging, marketing conversion upload, provider or billing write, live form test submission, recovery project repurposing, paid staging purchase or optional collector activation is authorized by this document.
- Never request or store credentials, contact names/emails, visitor/session IDs, raw URLs, browser cookies, customer screenshots or raw SQL dumps in GitHub.
- Do not merge overlapping #659/#623/#648/#657 if #667 is eventually chosen.
- Do not change Yogakulam's existing enrollment-popup selectors, booking trigger contract, payment, reservation or enrollment processing.
- This documentation-only file must not create a Supabase migration, change runtime behavior or itself mark R2 closed.

**Current decision: release NO-GO; R2 formal closeout OPEN.** Engineering evidence is strong; required human acceptance, independently verifiable production recovery, controlled real-origin privacy tests and historical maturity cannot be replaced by green synthetic tests.
