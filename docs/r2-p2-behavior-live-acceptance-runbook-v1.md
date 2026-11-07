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

The SQL uses an **independent three-step ordering check with PostgreSQL array ordinality**, rather than calling the live native_funnel_depth_v1 helper. Six synthetic, SELECT-only PostgreSQL ordering fixtures passed (complete, out-of-order, missing first, repeated, partial, later-completed). This provides a stronger comparison of ordering behavior but **does not replace user-level authorization or live UI reconciliation**; retain existing browser tests and human event-order checks. The script does not calculate or export individual page-to-page edges. Its aggregate path_sessions value is not evidence of safe or complete route display.

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


## F. Negative PostgreSQL role acceptance on a disposable local database

**Added 2026-11-06.** The clean Supabase migration-replay workflow now runs
`tests/database/r2-behavior-rpc-negative-auth-local.sql` against its **local
Postgres Docker container**, after all migrations have been replayed. It uses
only two deliberately nonexistent synthetic organization IDs.

The SQL tests all three reporting RPCs twice: (1) as the actual PostgreSQL
`anon` role, which must be denied function execution (`42501`), and (2)
as the `authenticated` role with transaction-local synthetic JWT claims
but **without CRM/session membership**, which must be denied by the
function's authorization guard (`P0001`). Unexpected successful calls,
missing RPCs, unexpected SQL errors or incorrect privileges fail CI.

The assertions execute inside rolled-back transactions. They perform no
fixture inserts, customer record reads, tracking sends or production role
switches. They require no paid cloud project or production secret. They
test actual migrated PostgreSQL authorization behavior—not merely source
text—but **still do not certify live owner/admin sessions, tenant isolation
between two authorized accounts, or UI-to-SQL reconciliation**.

The clean migration replay's negative checks are a *separate* evidence row:
PASS / FAIL / BLOCKED. Issue #523's human acceptance rows above remain
required even when this new CI check passes.


## G. Positive local tenant-bound authorization and tenant isolation (2026-11-06)

The migration-replay workflow now runs `tests/database/r2-behavior-rpc-positive-tenant-local.sql`
**after** the existing negative RPC authorization test in disposable Supabase/PostgreSQL.

The test transaction creates **two distinct synthetic CRM accounts**, an
owner of tenant A and an admin of tenant B, each with **one active membership**. It enables local session
enforcement, creates two local internal tracking sources, and inserts distinct
source-scoped, timestamp-ordered synthetic events. All inserts and session
bindings disappear under the final `ROLLBACK` and are **never run in production**.

It verifies as the actual PostgreSQL `authenticated` role:

- The synthetic owner A session can bind to its authorized tenant A and
  receives exactly the A-only funnel (4/2/1), Event Activity (4/2/1) and
  public page summary (4 page views, 4 identified sessions).
- The owner A session is **denied** all three foreign tenant-B RPCs with
  `P0001`, and cannot rebind to B in place. A deliberate attempt to add
  a second active membership for A fails the database guard with `23514`.
- The separate synthetic **admin B user/session** can bind to tenant B,
  receives only B's distinct 5/3/2 counts, and is denied all three tenant-A
  RPCs with `P0001`.
- Unexpected successful authorization, inaccurate aggregate totals, schema
  regression, RLS errors or any other SQL error fail the clean-replay job.

This is a deeper PostgreSQL execution-level **synthetic positive and negative
tenant-isolation test**, not just an inspection of SQL function text or an
unbound-session rejection. It requires no paid staging project, customer
credentials, real visitor IDs, live customer activity or production data writes.

**Still not passed by this test:** real authenticated owner/admin browser
sessions and sign-off, tenant switching through the actual CRM login,
user-interface-to-live-SQL reconciliation, live consent withdrawal/regrant,
and verified retention-history completeness. Record these as BLOCKED or
PENDING, not PASS, until independently witnessed. Issue #523 stays OPEN.


## H. Exact 7/14/30-day SQL-to-RPC reconciliation in disposable PostgreSQL (2026-11-06)

The existing positive two-tenant local test now includes **three synthetic
UTC activity age bands** (recent, 10 days ago, and 22 days ago) for
each isolated source and user. A local PostgreSQL-only independent SQL
`SELECT` calculates event counts and distinct source-scoped session counts
using each reporting RPC's UTC event/receipt window rules. Those expected
aggregates are stored in a **transaction-local temporary table**, readable
only for the duration of the test and dropped on final `ROLLBACK`.

Under actual `authenticated` PostgreSQL roles and bound synthetic sessions,
the test checks all **7-, 14-, and 30-day** results against the independently
aggregated synthetic event rows, for each tenant:

| Local synthetic tenant | 7-day page/start/submit | 14-day page/start/submit | 30-day page/start/submit |
| --- | --- | --- | --- |
| Owner A | 4 / 2 / 1 | 6 / 3 / 1 | 7 / 3 / 1 |
| Admin B | 5 / 3 / 2 | 6 / 4 / 3 | 8 / 5 / 3 |

For each window, the checks cover the ordered funnel step sessions,
Event Activity per-event receipts/sessions, the sum of each returned
daily series, exact UTC range metadata and row count, and Events by Page
totals / identified sessions / privacy-safe public path totals.
Existing bidirectional tenant denial and the single-active-membership
guard must also keep passing.

**Scope of proof:** This tests query window semantics and role/tenant
boundaries for fabricated event histories under a clean migrated database,
with zero new cloud resources, no real customer data, no service-role
impersonation, no privacy/collector changes and no persisted fixtures.

**Still required:** A verified owner/admin **real CRM browser session**
and real tenant-specific `7/14/30` dashboard-to-operator-SQL comparison
from the same observation interval, including late-arriving activity
and the incomplete current UTC day. Synthetic comparisons must never
be presented as final production acceptance or D1/D7/D30 retention evidence.
The existing user-facing procedures in this runbook and issue #523 remain open.


## I. Copy a privacy-safe Event Activity review snapshot (2026-11-06)

In a **real, authorized owner/admin CRM session**, open `Marketing → Behavior`
and choose the default events `Page viewed → Form started → Form submitted`.
Apply 7, 14 and 30 days **one at a time**. In each available Event Activity
panel, click **Copy review figures**. The button is absent if the report is
unavailable or lacks safely validated aggregate data.

The copied plain text includes only: the selected UTC day count, the first
and last UTC dates, the SQL report's `generated_at` timestamp, whether the
current UTC day is incomplete, and the selected event names with their
**independent observed event counts and identified session counts**.

It does **not** copy an organization or user name/ID, tracking source ID,
visitor/session identifier, browser cookie, URL/path, event payload, lead,
payment, or retention result. Nothing is sent to a server by the copy action.
Clipboard use requires a direct user click; browser permission may prevent
copying, in which case the UI shows a generic clipboard-unavailable message.

Compare the snapshot against the matching *authorized tenant-scoped*
`docs/sql/r2-p2-behavior-trends-reconcile-v1.sql` output, preferably during
the same UTC day and close to the displayed generation time. Check the
scope/event sequence. Account for late-arriving events and incomplete current
UTC day, recording real differences rather than claiming arbitrary tolerance.

**Evidence boundary:** This makes review safer and easier but does not
perform SQL comparison automatically and does **not** prove who clicked,
real owner/admin authorization, cross-tenant isolation or sign-off. The
reviewer must perform and attest the live login, comparison and privacy tests.
Never enter or share live credentials, organization UUIDs, session tokens,
raw visitor data or customer screenshots in an acceptance record.


## J. High-repeat public page-view data-quality review (2026-11-06)

**Why:** Real CRM screenshots (7/14/30 days) showed unusually concentrated
page-view counts on public routes such as `/courses/kerala/test.php`
and `/our-courses.php`. Session-level repetition is a reason to
**investigate**, not evidence of bot traffic, fraud, broken instrumentation,
a customer action, or a conversion.

**Read-only operator procedure:** Run
`docs/sql/r2-p2-repeat-public-pageview-diagnostic-v1.sql` with the same
**authorized tenant UUID** and `days=7`, `14`, or `30` in a private
database terminal. Do not post the UUID, credentials, tracking/source IDs,
visitor/session keys, or raw events. The diagnostic uses the same live
UTC-calendar window, one-day receipt grace, safe-public-path helper and
50,000-row volume limit as Events by Page.

The diagnostic returns at most ten **privacy-filtered public paths**.
Each returned path has **at least three distinct source-scoped visitors,
five identified sessions, and fifty observed views**. It is flagged for
*review only* when identified views per session are at least ten and at
least 70% of identified views come from sessions recording ten or more
views of the same path. The report includes only bounded aggregate counts
and a review reason. It never outputs individual source/visitor/session IDs,
private paths, raw payloads, or account identifiers.

**Verified live read-only snapshot:** On November 6, 2026,
12:17:42 UTC, the 30-day operator diagnostic flagged precisely two pages:
`/courses/kerala/test.php` (374 views, 19 sessions, six visitors; 93%
of identified views from high-repeat sessions) and
`/our-courses.php` (305 views, eight sessions, three visitors; 94.8%
of identified views from high-repeat sessions). The counters can change
while new data arrives or old data leaves the UTC window. The SQL did
not identify what caused the repetition. This sample is not a complete
traffic-quality or marketing-attribution determination.

**Follow-up before any filtering:** An authorized website operator
should check whether each route is a genuine public course page, an
internal test fixture, a deliberately refreshed preview, a third-party
monitor, or another legitimate behavior, using lawful operational context.
Review the existing instrumentation only if necessary and approved.
Do **not** label sessions as bots, automatically exclude paths, disable
collection, rewrite historical events, change consent, or adjust the
reported customer metrics based solely on the ratio.

**R2 acceptance boundary:** This closes a repeat-traffic *diagnostic
documentation* gap, **not** Issue #523's real owner/admin session
authentication, cross-tenant browser check, same-instant dashboard-to-SQL
sign-off, or the separate consent/identity and retention gates.
No paid staging, new provider calls, or production writes.
