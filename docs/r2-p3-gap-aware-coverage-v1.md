# R2-P3 — Gap-aware UTC session-history observation (research only)

**Status: not retention-ready.** Companion to Issue #527 and draft PR #535; does not change the retention definition or certify D1/D7/D30 cohorts.

The existing retention-readiness query exposes an observed first and last date and an elapsed calendar-day span. That is not a completeness check: a single old receipt can make a long span, while whole intervening days may have **zero observed session-start receipts**. The new diagnostic enumerates every UTC date needed for a provisional D1, D7 or D30 cohort window, including the 30-day washout and the complete return-day observation period.

## Read-only use

An authorized operator, with a tenant they are permitted to audit and a **read-only** production DB connection, may run:

```bash
psql "$AUTHORIZED_DB_CONNECTION" -v ON_ERROR_STOP=1 \
  -v organization_id='<authorized-tenant-uuid>' -v window_days=30 \
  -v return_day=30 -f docs/sql/r2-p3-gap-aware-coverage-v1.sql
```

Only `window_days=7/14/30` and `return_day=1/7/30` are accepted. A D30 report covering 30 cohort entry dates needs 30 washout days + 30 entry days + 30 return-followup days = **90 UTC calendar days** of potentially relevant coverage. The last closed day is yesterday UTC, **not** an independently verified ingestion watermark.

The query looks only at canonical `web.session_started` receipt dates, within this bounded range, and caps input at 50,001 matching events. The JSON contains period dates, counts of dates with and without observed starts, and granted/other consent **metadata snapshot totals**. It returns no source or visitor/session identifiers, page routes, full payloads, customer details, retention percentages or event rows. Over-limit results are `volume_limit`, and candidate counts/metadata are withheld.

## Interpreting the result

- A day **without observed session starts** is **not proof of an ingestion outage**. A quiet day may legitimately have zero sessions. Likewise, a day with starts does **not** prove complete delivery across sources, or correct bot filtering.
- The metadata `analytics=granted` snapshot is *not* a substitute for actual consent receipts, identity rotation continuity or verified source authorization.
- Current-day events and events received at or after the as-of UTC midnight are deliberately excluded. Yesterday's calendar closure is not evidence that all delayed events have arrived.
- This tenant-only diagnostic aggregates sources. A passing calendar observation cannot establish each source's completeness; source-specific completeness, withdrawal/erasure coverage, late arrivals and the attested `completeThroughUtc` watermark must be independently verified and approved before cohort computation.
- Its status is always observational, invalid or volume-limited. It can never certify retention readiness by itself. It does not substitute for real owner/admin acceptance (#523), the optional collector pilot (#520), real-site CMP/identity acceptance (#530/#531) or final semantics approval (#527/#535).

**Safety:** No schema migration, production write, tracking opt-in, deployment, new cloud project, contact exposure or service permissions. Never post a real tenant UUID, query credentials or per-tenant breakdown to public GitHub comments.
