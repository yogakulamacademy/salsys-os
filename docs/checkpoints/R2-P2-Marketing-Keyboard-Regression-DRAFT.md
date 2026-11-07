# R2-P2 — keyboard navigation and legacy Marketing regression (DRAFT)

This is a **synthetic CI-only** accessibility check. It does **not** establish real owner/admin access, tenant isolation on the deployed CRM, or approval to release R2-P1 tracking.

## Scope

- In `app/marketing/canonical-workspace.tsx`, the selected Marketing tab is now programmatically identified by `aria-current="page"`; non-selected tabs have no current-page marker.
- The existing navigation links expose visible keyboard focus (focus-visible outline) without changing their href, routing target, marketing data loaders, or visual default state.
- `tests/ui/behavior-explorer.spec.ts` now exercises **Enter-key navigation** from Behavior → Analytics → Funnel → Behavior, asserting that each active view gets the current-page marker and that the existing Funnel page still renders.
- The same Playwright test changes the native date-range select from the keyboard, runs the funnel via keyboard Enter, verifies the 30-day URL and the preserved Behavior report.
- All data is synthetic from the loopback-only Playwright fixture with no live CRM credentials, customer records, website collector events or production SQL writes.

## Acceptance boundary

The test is a targeted **keyboard/semantics and legacy Marketing regression**, not a full WCAG audit or real mobile/owner acceptance. Existing 390/768/1440 synthetic responsive checks and privacy denial tests remain separate. Require exact-head CI and CodeQL success, explicit review, and approval before any merge. Real deployed owner/admin browser and tenant-isolation acceptance in Issue #523 stays OPEN. PR #611 path response safeguards and draft consent PRs are independent and unmerged. Optional R2-P1 tracking stays OFF.
