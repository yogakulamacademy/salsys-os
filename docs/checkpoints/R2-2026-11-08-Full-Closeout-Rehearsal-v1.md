# R2 — Full-stack Release Integration Rehearsal and Closure Ledger (2026-11-08)

**Status: DRAFT ENGINEERING REHEARSAL; R2 IS NOT FORMALLY CLOSED.**

**Repository:** `yogakulamacademy/salsys-os`  
**Safe baseline:** `main` and Vercel `crm.salsysos.com` READY on `691dc44182b969a2e0c272017fcdfc927c2dc9fc`.  
**Scope:** Combine already-tested draft code only; no merge, deployment, production SQL write, live website form submission, tracking activation, customer contact, billing/enrollment changes or new paid staging.

## 1. Provenance and safety

This branch starts from **R2 integration rehearsal draft PR #641**, commit `aefbdb4c974eb5c7fa64fa9c04afe38d71940b95`, already combining the draft versions of:

- [#530](https://github.com/yogakulamacademy/salsys-os/pull/530): consent identity withdrawal/regrant source and browser tests.
- [#535](https://github.com/yogakulamacademy/salsys-os/pull/535): synthetic D1/D7/D30 cohort design and retrospective quality diagnostics; *no published KPI*.
- [#623](https://github.com/yogakulamacademy/salsys-os/pull/623): one bounded retry for SQLSTATE `40P01` on **only** the idempotent browser lead-ingest RPC.
- [#638](https://github.com/yogakulamacademy/salsys-os/pull/638): stronger P2 event aggregate and UI/offline consistency validation.

This rehearsal additionally carries exact **R2 #643 draft [PR #648](https://github.com/yogakulamacademy/salsys-os/pull/648)** contents:

- `supabase/migrations/20261108080000_r2_browser_lead_primary_contact_v1.sql`, full function with exactly two conditional primary-contact changes, fail-closed body/ACL/owner guards;
- actual local full RPC / identity trigger / tenant isolation PostgreSQL regression;
- isolated partial-unique-index collision regression;
- static exact-source guard.

Changes to `.github/workflows/ci.yml` add all isolated database tests and a **combined retry test**: `23505` is *not* retried; only `40P01` is retried once using the same event id. `.github/workflows/migration-replay.yml` runs the real full RPC test in disposable Supabase, and uses pinned npm-backed `supabase/setup-cli` v3.2.0 with exact CLI `3.0.0` assertion. This matches a separately verified CI setup remedy from R13; there are **no production environment credentials** in that workflow.

Never merge the source PRs together with this rehearsal; it is a read-only assurance artifact for reviewing exact interactions and deciding later on a separately approved, minimal production release sequence.

## 2. R2 closure matrix — distinguish code tests from human evidence

| Gate | Verified/known now | Outstanding before full R2 closure |
| --- | --- | --- |
| 1. Lead reliability (#620/#643) | Independent draft PostgreSQL/browser/CI and CodeQL passed on source heads; combined CI/replay pending on this branch. Production read-only on 2026-11-08 confirms the canonical `ingest_website_lead` function's body hash and privileged owner/ACL/search-path still **match** the reviewed #648 preconditions. | Independent final reviewer, approved safe release/rollback, post-release error/duplicate audit and actual authorized browser-ingest acceptance. Do not label no recent error as proof of remedy. |
| 2. Consent (#528/#531/#588) | User previously performed live Accept All, Reject All, Customize, Reject/withdraw scenarios on Nov 7. Read-only production receipt aggregates contain both granted and denied consent decisions on Nov 7–8; this does not by itself prove third-party scripts or every browser behavior. SDK regression source tests exist. | Actual separated HTTPS site/CRM/database test of withdrawal/regrant and identity rotation across same tab, new tab, restore/blocked storage and live form continuity. Confirm real deployed SDK/CMP policy and third-party suppression independently. Do not repeat accepted simple UI checks. |
| 3. P1 behavior pilot (#520) | Contracts and SDK in production. Select-only query on 2026-11-08 found 7 legacy `web.cta_clicked` events dated Nov 2/4 (`www.yogakulam.com`, reported SDK mode `granted`), **zero** of the examined optional P1 event types received after the Nov 5 release cutoff. | Owner-authorized consent-safe single-site pilot with one CTA/pricing/FAQ/form, correct tenant/source/session, GPC, reject/withdraw and bounded volume. Collector stays OFF until explicit owner approval; no production site as surrogate staging. |
| 4. P2 Behavior Explorer (#523) | UI and underlying tenant-aware aggregate RPC in production; automated negative/positive tenant-bound RPC tests pass in disposable database. | Actual owner/admin sign-in for two authorized tenants; 7/14/30 funnel/event/path reconciliation against tenant-filtered SQL, empty states/mobile/accessibility. Source-only mock/SQL tests cannot complete this. |
| 5. P3 retention (#527) | Source contract and synthetic diagnostics are in draft; previously observed history coverage is incomplete, not full mature D1/D7/D30. | Owner-approved cohort/retention policy and first-seen completeness/maturity thresholds; sufficient verified genuine historical data; consent identity continuity; private/aggregate-only retention checks; real sign-in acceptance. No fabricated KPI or "zero" for missing coverage. |
| 6. Identity/commerce (#518) | R2 basic visitor→lead→Person/CRM V1 evidence previously accepted; PA-1 merge remains human-controlled. | Human disposition or explicit documented exception for two identity conflicts. Trusted real payment/enrollment completion is an external R2→R5 journey dependency. If separately deferred, record that scope decision explicitly; do not claim paid-conversion proof. |
| 7. Production release | All source PRs listed above have green exact-head CI+CodeQL individually; draft integration review needed. Production remains unchanged. | Reviewer approvals, owner-approved deployment/migrations, compatible migration ordering, smoke checks, production security/errors/duplicate counts, written acceptance and formal closure sign-off. |

## 3. Live production aggregate readback, 2026-11-08

**Method:** SELECT-only, privacy-preserving counts; no raw forms, contact values, visitor/session identifiers, URLs or event payload exports.

- Nov 7, UTC, across production consent receipts queried: `analytics` 41 granted and 9 denied; Nov 8: 6 granted and 7 denied (Nov 8 incomplete). These are **receipt counts, not unique users**. Query was not specifically restricted to one organization.
- Raw `web.session_started` consent-mode metadata, all production sources queried: Nov 7, **47 `required` and 25 `granted`**; Nov 8, **7 `required`** at observation time. The mix on Nov 7 includes historical configuration and cannot by itself establish whether every installed tag respected an independent real consent choice.
- `web.cta_clicked` records Nov 2 (2) and Nov 4 (5) were legacy events reporting `granted`; *the R2-P1 new behavior collector remains unaccepted*. For the eight examined behavioral event types, zero arrived after Nov 5, 14:16:17 UTC in that readback.
- Canonical `ingest_website_lead` read-only function validation: expected exact-body hash and owner, service-role ACL, definer/search path **all matched** #648 guard. This is a **precondition check**, not permission to apply it.

## 4. Acceptance boundaries retained

- The owner expressly postponed approval of **paid staging** until the CRM generates revenue. Respect that decision. The recovery rehearsal Supabase project is NOT disposable staging; production is NOT staging.
- No claim that tracking is 100% consent-compliant, complete, or free of errors merely because SDK/CI checks pass. No customer cookies, GPC proof or third-party tag proof inferred from self-reported SDK fields.
- No auto-merge or auto-release on an all-green rehearsal. The current production website's protected enrollment trigger, popup, payments and PHP booking flow must not be modified by this R2 work.
- Follow [Issue #518](https://github.com/yogakulamacademy/salsys-os/issues/518): a V1-closeout scope may separately identify accepted V1 invariants and formally defer *external* cross-phase dependencies, but cannot silently reinterpret this seven-gate full-R2 requirement as complete.

**Closure decision:** This draft rehearses all candidate source fixes together. *Full R2 = OPEN* until the live acceptance/retention/release conditions are independently satisfied, with owner-approved changes recorded. No progress percentage is a substitute for evidence.
