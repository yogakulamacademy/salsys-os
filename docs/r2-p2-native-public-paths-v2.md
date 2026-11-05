# R2-P2 Public Page Paths V2 — release notes and acceptance

## Why this change
The first native navigation explorer permitted clean slash-based paths but did not recognize the public `.php` and `.html` pages commonly used by the live website. The original report therefore had no qualifying path edges, despite multi-page sessions.

Read-only evidence, inspected November 5, 2026 (aggregated across organizations, 14-day window, **not** per-tenant live acceptance):
- 5,453 page-view events; 4,042 had safe single-`.php` route shapes.
- 1,855 non-identical adjacent page-view pairs across 609 sessions.
- 0 qualifying edges under the old public-path filter.
- 112 qualifying edges with the revised allowlist and a stricter threshold of three distinct anonymous visitors.
- These counts include historical first-party events and do **not** prove new R2-P1 browser behavior tracking is on.

## V2 behavior
- Public paths may be clean slash slugs, or strictly formed lowercase `.php`, `.html` / `.htm` routes.
- Hostnames, URLs with query strings, percent encoding, email symbols, arbitrary dots, long numeric/hex identifiers, and unsafe paths collapse to `/other` and do not appear in path results.
- An edge is visible only after **three distinct anonymous visitors** (source-scoped), not merely three sessions. Sessions and transition counts remain aggregates; no visitor IDs or raw payloads leave SQL.
- No change to ordered funnel semantics, source-scoped session identity, tenant checks, role checks, date/step bounds or 50k fail-closed event cap.
- No customer website tracking activation, no new tables/grants, no mutation of existing events.

## Acceptance
1. SQL clean migration replay and embedded positive/negative route assertions.
2. Node readiness tests, typecheck, full build and CodeQL.
3. Merge PR only after checks pass and no unintended changes.
4. Apply incremental SQL to the production Supabase project, then read back permissions, helper outputs and the migration ledger.
5. Confirm matching READY Vercel commit and check new recent runtime errors.
6. Verify aggregate edge counts on the authorized tenant, and complete authenticated UI QA separately.
7. Keep R2-P1 site opt-in OFF pending Issue #520 pilot acceptance.

The R2-P2 explorer is released independently from the R2-P1 collector. User-level playback and re-identification remain out of scope.
