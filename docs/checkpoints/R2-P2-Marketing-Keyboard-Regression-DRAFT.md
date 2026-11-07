# R2-P2 — keyboard navigation and legacy Marketing regression (DRAFT)

This is a **synthetic CI-only** accessibility check. It does **not** establish real owner/admin access, tenant isolation on the deployed CRM, or approval to release R2-P1 tracking.

## Scope

- In `app/marketing/canonical-workspace.tsx`, the selected Marketing tab is now programmatically identified by `aria-current="page"`; non-selected tabs have no current-page marker.
- The existing navigation links expose visible keyboard focus (focus-visible outline) without changing their href, routing target, marketing data loaders, or visual default state.
- `tests/ui/behavior-explorer.spec.ts` now exercises **Enter-key navigation** from Behavior → Analytics → Funnel → Behavior, asserting that each active view gets the current-page marker and that the existing Funnel page still renders.
- The same Playwright test changes the native date-range select from the keyboard, runs the funnel via keyboard Enter, verifies the 30-day URL and the preserved Behavior report.
- All data is synthetic from the loopback-only Playwright fixture with no live CRM credentials, customer records, website collector events or production SQL writes.

## Synthetic soft-navigation tenant and denial check

A second Playwright regression exercises **the same browser document** (no full reload) across changes in the local fixture's active tenant. Starting from an already-rendered Behavior view for synthetic tenant A, it switches the fixture context to tenant B, navigates via Marketing → Funnel → Behavior, and verifies that the Behavior path and Events by Page displays show B-only observations with A's route absent. It also checks the fresh Behavior RPC carries B's synthetic tenant ID.

Then the fixture denies B's reports. The browser navigates Marketing → Analytics → Behavior without a reload and must show **Behavior analytics unavailable**, no stale tenant paths or ordered funnel, and an unavailable Event Activity panel. A local window flag confirms the same document remained mounted; the fixture resets at test end.

This tests a **synthetic client-side stale-data regression only**. It is not proof that an authenticated human can switch real organizations, that a different JWT/tenant binding is authorized, or that no stale content appears in every real browser environment. The actual owner/admin tenant isolation and denial acceptance in #523 remains blocked.

## Acceptance boundary

The test is a targeted **keyboard/semantics and legacy Marketing regression**, not a full WCAG audit or real mobile/owner acceptance. Existing 390/768/1440 synthetic responsive checks and privacy denial tests remain separate. Require exact-head CI and CodeQL success, explicit review, and approval before any merge. Real deployed owner/admin browser and tenant-isolation acceptance in Issue #523 stays OPEN. PR #611 path response safeguards and draft consent PRs are independent and unmerged. Optional R2-P1 tracking stays OFF.
