# R2-P2 — Behavior Explorer live owner/admin acceptance V1

**2026-11-06. Status: PARTIAL: metadata confirmed, live role + UI acceptance pending.** Issue #523. This is a manual acceptance procedure, not a tracking activation or new report.

## Verified database security metadata

On 2026-11-06, a SELECT-only audit of SalsysOS Production reported:
- Three Behavior Explorer functions exist. Each is STABLE / SECURITY DEFINER; authenticated EXECUTE is allowed, anon EXECUTE denied.
- Each SQL function includes CRM-user, organization-member and authentication checks.
- The is_organization_member helper also enforces session_is_bound_to_organization for the active authenticated session. Membership alone does not authorize a foreign tenant.
- Both raw_events and tracking_sources have RLS enabled and deny direct SELECT to anonymous and authenticated roles.

The query in docs/sql/r2-p2-behavior-metadata-audit-v1.sql returns only aggregate security metadata and a boolean overall_pass. No visitor/lead/tenant identifiers were retrieved by the check.

**Limitation:** Function-text and grant inspection is NOT an authenticated owner/admin test or proof of correct tenant-specific aggregates. It does not close Issue #523.

## A. Repeat the metadata audit

Only a trusted operator with a separately authorized, read-only database connection should run:

    psql "$AUTHORIZED_DB_CONNECTION" -v ON_ERROR_STOP=1 \
      -f docs/sql/r2-p2-behavior-metadata-audit-v1.sql

Expected: overall_pass=true, all three function guards/privileges green, two tables protected, session-bound membership guard true. If not, stop and escalate. This procedure does not authorize changing permissions, sessions, billing, schemas or customer records.

## B. Real owner/admin browser acceptance

Use only your ordinary authorized login in the deployed CRM; do not impersonate another customer/staff member.

1. Open Marketing → Behavior in the currently authorized tenant. Record pass/fail and UTC window, never post its organization UUID.
2. Select the ordered default funnel: Page viewed → Form started → Form submitted. Check 7/14/30 day views, reordered steps, duplicate rejection and invalid URL parameters. Ordered funnel sessions are not equivalent to independent event totals or paid enrollments.
3. Compare Event Activity for the three defaults across 7/14/30 UTC days against the separate, tenant-specific SQL comparator below. Today is incomplete; the UI and SQL should be sampled on the same UTC date with ingestion lag noted.
4. Confirm public PHP/HTML navigation edges where privacy thresholds are met; query strings, tokens, PII, account/private/customer routes and dynamic identifiers must never appear. Check 12-edge cap and meaningful empty state.
5. Events by Page: choose an event, check observed events/sessions, low-visitor suppression, safe paths and the 10-page limit. A denial is not zero traffic.
6. Check 390px and 768px mobile and 1440px desktop, accessible keyboard controls, loading, failure and denial states. Confirm Marketing → Funnel and Analytics remain functional.
7. If the same owner/admin is already authorized to another tenant, use **only the approved tenant/login workflow**. Verify that paths/totals change and prior-tenant reports disappear. Otherwise mark the multi-tenant gate BLOCKED, never simulate authority with live credentials.
8. Permission denial after an authorized context change must leave no previous tenant data. If anything sensitive appears, stop and escalate; do not enable tracking to get more test data.

## C. Tenant-specific Event Activity reconciliation

The SELECT-only companion docs/sql/r2-p2-behavior-trends-reconcile-v1.sql reproduces the existing Event Trends RPC's 3 default event names, received/occurred filters and distinct source-scoped session semantics. It does NOT compute ordered funnels, page breakdowns or paths.

For each authorized tenant, a trusted operator supplies the verified organization UUID only in their private terminal:

    psql "$AUTHORIZED_DB_CONNECTION" -v ON_ERROR_STOP=1 \
      -v organization_id='<verified-organization-uuid>' -v days=14 \
      -f docs/sql/r2-p2-behavior-trends-reconcile-v1.sql

Repeat with days=7, days=14 and days=30. Compare each total_events, observed_sessions, and daily events/sessions with the corresponding Marketing → Behavior Event Activity values. A volume_limit or invalid_window status is NOT a pass. Never invent a mismatch tolerance: source events can arrive between UI and SQL reads and must be reconciled by timestamp/integration evidence.

The query returns aggregate counts/UTC dates only, not visitor/source/session IDs. It was SQL-syntax-checked against production on 2026-11-06 with an **intentionally nonexistent synthetic tenant ID** and returned zero counts. That is not proof of real-tenant agreement. Other event types, full funnel depth and path metrics require separate owner-authorized reconciliation.

## D. Acceptance evidence — pass, fail or blocked only

| Gate | Record |
| --- | --- |
| Metadata permissions and helper guards | PASS / FAIL |
| Owner real login, own tenant | PASS / FAIL / BLOCKED |
| Admin real login, own tenant | PASS / FAIL / BLOCKED |
| Authorized tenant switching and stale-data removal | PASS / FAIL / BLOCKED |
| Default ordered funnel 7/14/30 | PASS / FAIL / BLOCKED |
| Default Event Trends SQL comparison 7/14/30 | PASS / FAIL / BLOCKED |
| Public navigation-path and page breakdown privacy | PASS / FAIL / BLOCKED |
| Mobile/desktop/keyboard/error regression | PASS / FAIL / BLOCKED |
| Existing Marketing Funnel and Analytics unchanged | PASS / FAIL / BLOCKED |

Record date, reviewer, verified merge/deployment SHA and result only. Do **not** post organization IDs, DB credentials, JWT/cookies, raw URLs with querystrings, visitor/session keys, contacts or sensitive screenshots. Redact any locally retained evidence.

## Safety and release constraints

Issue #523 remains OPEN until owner/admin live browser, tenant-isolation and actual aggregate acceptance are witnessed and signed off. Synthetic two-tenant tests, function-text checks and metadata readbacks do not close it. R2-P1 optional collector Issue #520 remains OFF. Draft PR #530 / Issue #531 real CMP and staging acceptance is separate and blocked; production/recovery databases must not be repurposed. No billable staging project, customer message, payment, tracking registration, production migration or role change is authorized by this checklist.


## E. Extended read-only reconciliation: default funnel and page summary

**Added in R2-P2 acceptance preparation V2 (2026-11-06).** The comparisons below use a verified tenant ID supplied privately by the operator, never pasted into issues or chat. Use a separately approved read-only database connection. These tools deliberately return **aggregate counts only**; they do not authorize reading/exporting visitor IDs, session IDs, lead records, or raw event URLs.

### Default ordered funnel

    psql "$AUTHORIZED_DB_CONNECTION" -v ON_ERROR_STOP=1 \
      -v organization_id='<verified-organization-uuid>' -v days=14 \
      -f docs/sql/r2-p2-behavior-funnel-reconcile-v1.sql

Repeat with days=7, 14, and 30, and compare **distinct funnel session counts** for Page viewed, Form started and Form submitted to Marketing → Behavior's ordered funnel. The comparator also reports the source-scoped path_sessions denominator. Unlike Event Trends' UTC calendar-day range, the funnel RPC uses a *rolling* interval from the current timestamp; compare in close succession and investigate any ingestion/boundary drift. The 50,000-event cap is fail-closed: volume_limit is NOT an acceptable success state.

The SQL deliberately uses the **same production native_funnel_depth_v1 helper** as the RPC to calculate ordered stage depth. This supports data scope/aggregation comparison but **does not independently prove helper correctness**; retain the existing synthetic ordering tests and human event-order checks. The script does not calculate or export individual page-to-page edges. Its aggregate path_sessions value is not evidence of safe or complete route display.

### Events by Page summary

    psql "$AUTHORIZED_DB_CONNECTION" -v ON_ERROR_STOP=1 \
      -v organization_id='<verified-organization-uuid>' -v days=14 \
      -v event='web.page_viewed' \
      -f docs/sql/r2-p2-behavior-page-reconcile-v1.sql

Repeat for 7/14/30 and, where authorized, other *registered* web events. Compare the **page summary** to the corresponding Events by Page status: total_events, safe_path_events, identified_sessions, displayed_events, hidden_or_other_events, and displayed-page count. The comparator applies the same safe-path helper, >=3 distinct anonymous visitor suppression and maximum 10 displayed paths as the current RPC, but **does not output the actual path strings**. The current UTC day is incomplete. Unregistered_event, invalid_window, or volume_limit is a failed/blocked comparison, not a zero-traffic result.

Because the comparator uses the live safe-path helper, it is NOT an independent proof that a path is harmless. Authorized reviewers must inspect displayed public paths directly in the CRM (with appropriate local redaction) and make sure query strings, tokens, long IDs and account/private routes never appear. The published reports may use different date-window semantics; never compare a rolling funnel count directly against an Event Trends or page-summary count.

Both scripts were syntax-tested SELECT-only on SalsysOS Production using an **intentionally nonexistent synthetic tenant UUID**, which returned only zero aggregates. **That does not prove actual owner/admin permissions**, live tenant authorization, correct UI totals, or a real-tenant match. Do not report the entire Issue #523 acceptance as passed from these tests.

### Updated evidence record

In addition to the earlier checklist, record PASS / FAIL / BLOCKED for the following **separate** checks: (1) default funnel stage counts for 7/14/30 rolling days; (2) Events by Page summary for 7/14/30 UTC days; (3) the actual displayed path privacy review. The existing real owner/admin login, other-tenant denial, accessibility and legacy-Marketing checks are independent. No billable staging project, production role change, tracking opt-in or customer data export is authorized.
