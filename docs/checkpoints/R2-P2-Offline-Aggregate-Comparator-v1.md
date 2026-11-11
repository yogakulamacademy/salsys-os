# R2-P2 — Offline aggregate snapshot comparator (operator-only)

**Status: acceptance aid, not R2 acceptance.** This is a local Node script. It does not access a database, log into the CRM, call a website, upload review files, persist customer records or create production metrics.

## What this adds

- scripts/r2-p2-compare-review-figures.mjs compares an **explicitly copied**, aggregate-only Marketing → Behavior review record with the output of one independently authorized, tenant-scoped, read-only SQL comparator.
- Two existing operator SQL files now include sampled_at_utc in their **JSON output only**. Their event selection, time window, counts, database state and live RPC definitions are unchanged.
- The local comparator rejects unexpected fields (including tenant, visitor, session, source and URL fields) rather than printing them, validates approved default event names and session counts, and rejects a snapshot captured more than **120 seconds** apart.
- An exact aggregate match is labeled **AGGREGATES_MATCHED_NOT_ACCEPTANCE**, never security or role sign-off. A mismatch is **REVIEW_REQUIRED_NUMERIC_DIFFERENCE**; excessive sampling drift is **REVIEW_REQUIRED_CAPTURE_DRIFT**. Invalid inputs are **INPUT_REJECTED**.

## Procedure with a legitimately authorized admin

1. Sign in normally to the deployed CRM and open **Marketing → Behavior**. Select the default steps Page viewed → Form started → Form submitted.
2. Select **14 days** and click **Run funnel**. Use **Copy funnel figures** in the Ordered funnel panel. Paste the aggregate text *only* into an untracked local file, e.g. /tmp/r2-p2-ui-funnel-14.txt.
3. As close as practicable to that click, in a **private authorized read-only database terminal**, run:

    psql "$AUTHORIZED_DB_CONNECTION" -X -q -A -t -P pager=off \
      -v ON_ERROR_STOP=1 \
      -v organization_id='<verified-authorized-organization-uuid>' \
      -v days=14 \
      -f docs/sql/r2-p2-behavior-funnel-reconcile-v1.sql \
      > /tmp/r2-p2-sql-funnel-14.json

   Do not paste the organization UUID, database URL, role credentials or results containing identifiers into a conversation, issue, or source-controlled file. The SQL file must be executed only for a tenant independently verified to belong to the authorized reviewer.

4. Compare offline on the operator's local machine:

    node scripts/r2-p2-compare-review-figures.mjs \
      --ui /tmp/r2-p2-ui-funnel-14.txt \
      --sql /tmp/r2-p2-sql-funnel-14.json

5. Repeat at 7 and 30 days, with corresponding separately captured UI/SQL files. For **Event Activity** (distinct from ordered funnel), use **Copy review figures** and docs/sql/r2-p2-behavior-trends-reconcile-v1.sql with the same -X -q -A -t flags. The script recognizes and compares the correct **UTC calendar-day window** separately. Do **not** compare a rolling funnel to Event Activity.
6. Manually investigate differences. An exact numeric match within a short sampling interval is necessary but insufficient; ingestion lag, a partial UTC day, differences in queries' time boundaries or unverified live permissions may remain. Do not adjust the copied figures to manufacture a match.

## Strict UTC-grid and SQL total consistency (2026-11-06)

The **local operator** Event Activity comparison now validates the full SQL daily UTC date grid, not just the first/last labels. Each row must appear once, in calendar order, cover exactly the requested 7/14/30 dates, and end on the actual UTC date of the SQL snapshot. It also requires the daily **event counts** for each default event to sum to that series' reported `total_events`, and the three event totals to sum to SQL's `candidate_events`. This matches the read-only SQL's bounded, default-event-only source query.

It intentionally does **not** require daily distinct session counts to sum to `observed_sessions`: a single source-scoped session can have eligible events on multiple UTC dates, so daily session counts are not additive across a reporting window. All tests use synthetic aggregates only, including missing/duplicated/out-of-order/impossible dates, mismatching day totals, changed candidate event totals, and inconsistent UTC snapshot dates. Inputs failing integrity are `INPUT_REJECTED`, never `AGGREGATES_MATCHED_NOT_ACCEPTANCE`.

The user-copied Event Activity range must also be a complete UTC window anchored to its own report timestamp; this is a check on a clipboard string, **not** proof of authentic CRM admin login, real tenant isolation, SQL role, source data quality, or owner release sign-off. Use the authorized read-only SQL on a privately verified tenant and preserve the existing real-user acceptance gate.

## Local command result

- **AGGREGATES_MATCHED_NOT_ACCEPTANCE** — numeric comparison agrees; **live owner/admin role, cross-tenant authorization and acceptance remain unverified**. Exit 0.
- **REVIEW_REQUIRED_NUMERIC_DIFFERENCE** — one or more aggregate counts/UTC windows differ. Exit 2, review near-same-time evidence.
- **REVIEW_REQUIRED_CAPTURE_DRIFT** — more than 120 seconds separate the CRM report generation time and SQL sampling time. Exit 2, recapture instead of guessing tolerance.
- **INPUT_REJECTED** — malformed report, non-default event, unsupported window, missing timestamps, unexpected JSON keys, volume limit, unauthorized extra fields, or other untrusted input. Exit 1; input contents are not echoed.

**Local data hygiene:** use untracked files outside the repository and remove them after the authorized review. Browser clipboard access requires the admin to click Copy. No automatic extraction, direct database connection or SSH is performed by the script. Do not upload these files or add them to CI artifacts.

## Actual UI-to-CLI format compatibility regression (2026-11-06)

The additional readiness test `tests/readiness/r2-p2-real-copy-sql-roundtrip-v1.test.cjs` loads and executes **both actual CRM TypeScript clipboard formatters** in isolated Node VMs and feeds their resulting full copied strings directly into **the production operator CLI parser**, with independently constructed **synthetic SQL JSON** in the exact expected output shape.

The test covers **7, 14 and 30 days** for the default, ordered `web.page_viewed → web.form_started → web.form_submitted` funnel and the same three default Event Activity series. It verifies corresponding window and snapshot timestamps, aggregate matches, mismatched counts, stale SQL, wrong report class, output redaction and CLI rejection of unexpected identifier fields. This closes the compatibility-test gap left by independent formatter and comparator tests using handwritten copies.

This is **not** an authorized admin session, SQL readback, real tenant isolation, verified complete event history, production web consent, or reconciliation sign-off. It deliberately performs **no network/database operations** and cannot close Issue #523. Non-default event combinations are not supported by the default SQL comparator; the operator must select the three exact default events before copying.

## Distinct-session integrity guard (2026-11-07)

The offline comparator now verifies the **set-cardinality constraints** implied by the trusted SQL's source-scoped distinct-session calculations for all three default Event Activity event types. Each UTC day's distinct sessions must be **no greater than the report's full-window distinct sessions**, and the sum of daily distinct sessions must be **at least the full-window distinct sessions**. The daily sum may be greater because one source-scoped session can contribute events on multiple UTC days; it must **not** be forced equal to the full-window count. Daily event counts still must sum exactly to the event total.

For the rolling ordered funnel, the SQL's `path_sessions` denominator must also be no greater than `candidate_events`, because each identified page-view session requires at least one candidate page-view event. These checks run **only against the operator's supplied aggregate-only JSON**, reject impossible records as `INPUT_REJECTED`, and do not infer identity, authenticate the reviewer, or alter any live query/RPC.

The synthetic readiness regression `tests/readiness/r2-p2-offline-aggregate-compare-v1.test.cjs` covers daily deficits, a single day exceeding the full-window distinct-session set, a separate event series with impossible sessions, valid cross-day reuse, and a funnel denominator exceeding the candidate event count. Real 7/14/30 owner/admin UI and SQL observations remain **BLOCKED** until reviewed by an authorized operator; metadata, a matching numeric snapshot, and synthetic tests are **not** sign-off or tenant isolation.

## Privacy and completion boundary

- SQL aggregate snapshots are produced by the trusted operator's own DB role. The CLI does **not** exercise actual PostgreSQL authenticated/anonymous role guards or prove tenant isolation.
- A reviewer must still witness a real owner/admin login, correct/foreign-tenant denial, on-screen safe public page paths, responsive/accessible behavior, and unrelated Marketing tab integrity and record the actual authorized sign-off (Issue #523).
- The optional R2-P1 behavioral collector remains OFF until its separate consent-safe pilot (#520). Draft consent PR #530, isolated staging gate #531 and retention PR #535 / history issue #527 remain unchanged.
- No production event editing, web tracker change, SQL migration, backfill, retention KPI, permission change, customer messaging or billable staging project is authorized by this operator aid.
