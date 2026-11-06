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

## Local command result

- **AGGREGATES_MATCHED_NOT_ACCEPTANCE** — numeric comparison agrees; **live owner/admin role, cross-tenant authorization and acceptance remain unverified**. Exit 0.
- **REVIEW_REQUIRED_NUMERIC_DIFFERENCE** — one or more aggregate counts/UTC windows differ. Exit 2, review near-same-time evidence.
- **REVIEW_REQUIRED_CAPTURE_DRIFT** — more than 120 seconds separate the CRM report generation time and SQL sampling time. Exit 2, recapture instead of guessing tolerance.
- **INPUT_REJECTED** — malformed report, non-default event, unsupported window, missing timestamps, unexpected JSON keys, volume limit, unauthorized extra fields, or other untrusted input. Exit 1; input contents are not echoed.

**Local data hygiene:** use untracked files outside the repository and remove them after the authorized review. Browser clipboard access requires the admin to click Copy. No automatic extraction, direct database connection or SSH is performed by the script. Do not upload these files or add them to CI artifacts.

## Privacy and completion boundary

- SQL aggregate snapshots are produced by the trusted operator's own DB role. The CLI does **not** exercise actual PostgreSQL authenticated/anonymous role guards or prove tenant isolation.
- A reviewer must still witness a real owner/admin login, correct/foreign-tenant denial, on-screen safe public page paths, responsive/accessible behavior, and unrelated Marketing tab integrity and record the actual authorized sign-off (Issue #523).
- The optional R2-P1 behavioral collector remains OFF until its separate consent-safe pilot (#520). Draft consent PR #530, isolated staging gate #531 and retention PR #535 / history issue #527 remain unchanged.
- No production event editing, web tracker change, SQL migration, backfill, retention KPI, permission change, customer messaging or billable staging project is authorized by this operator aid.
