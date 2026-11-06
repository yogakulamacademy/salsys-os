# R2-P2 — Safe ordered-funnel acceptance copy (operator aid)

**Scope:** UI-only, user-initiated, aggregate-only clipboard aid; this document is not a sign-off.

The existing Marketing → Behavior Event Activity **Copy review figures** action
returns independently observed event totals over **UTC calendar-day** windows.
The new **Copy funnel figures** action belongs to the distinct **Ordered funnel**
panel and prepares its stage-by-stage **source-scoped anonymous session**
counts for comparison with the existing rolling-window funnel SQL.

## Normal authorized review

1. Sign in normally with an authorized CRM admin/owner account. Do not
   impersonate any user or use recovered credentials.
2. On Marketing → Behavior, choose the default ordered three-step funnel:
   `web.page_viewed → web.form_started → web.form_submitted`. Run 7, 14,
   and 30 days **one at a time**. Confirm the page has an available report.
3. Click **Copy funnel figures**, a local browser clipboard action. The copy
   contains only the selected 7/14/30-day rolling window, server report
   timestamp, safe allowlisted event names, ordered-session counts and
   aggregate page-view session denominator. It does **not** contain tenant,
   tracking source, individual visitor/session identifiers, path strings,
   URL or raw payloads.
4. In a separately authorized private database terminal run
   `docs/sql/r2-p2-behavior-funnel-reconcile-v1.sql` with the **verified tenant**
   and matching `days` parameter. Compare each ordered funnel stage, not
   the unrelated Event Activity event-count totals.
5. Note the **rolling time boundary**: funnels use a current-timestamp
   interval, unlike Event Activity and Events by Page, which use UTC
   calendar-day windows. If counts differ, check receipt lag, execution
   timestamps and observation-window drift; never assume a fixed tolerance.
6. Independently complete the authorized owner/admin role check, denied
   foreign-tenant check, actual page-path privacy inspection, responsive
   layout check, existing Marketing-tab regression and operator sign-off
   in Issue #523. The copied numbers do not substitute for these.

## Fail-closed and safety contract

- Hide the copy button for unavailable or malformed funnel reports, missing
  or invalid server-generated timestamps, invalid event names, noninteger/
  negative session counts, repeated/incorrectly ordered steps, or an invalid
  7/14/30-day window.
- A copied report always identifies itself as **dashboard observation,
  NOT owner/admin acceptance or SQL reconciliation**.
- The browser writes to the clipboard **only after a human clicks**;
  clipboard failures show a neutral failure message, never false success.
- Separate synthetic tenant fixture tests confirm a tenant-context refresh
  changes the copied stage numbers and that denial hides the copy action.
  These synthetic tests are *not* production permission sign-off.
- Do not paste actual tenant UUIDs, auth tokens, raw website URLs, or
  customer identifiers in GitHub issues or acceptance notes.
- No event recording, optional tracking opt-in, consent, SDK/API/RPC/SQL,
  source registration, retention definition, billing or production data
  is changed by this feature.

The existing Event Activity copy remains unchanged. The page-breakdown
read-only SQL comparator `docs/sql/r2-p2-behavior-page-reconcile-v1.sql`
is also unchanged; the new funnel copy is not a privacy verdict about the
paths appearing elsewhere in the Behavior Explorer.

**Acceptance boundary:** Issue #523 stays OPEN until an actual authorized
admin/owner conducts and signs off live session and tenant-specific UI-to-SQL
checks. Optional behavior collector Issue #520 remains OFF, and staged consent
PR #530 / retention PR #535 stay gated by their independent acceptance plans.
