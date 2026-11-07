# R2-P2 — Sensitive route suppression V3

**Status:** Pending release / independent owner-admin acceptance. This checkpoint narrows the existing native public path normalizer; it does not certify the R2-P2 live acceptance gate (Issue #523).

## Verified discrepancy (2026-11-06)

The production `native_safe_page_path_v2(text)` and Marketing → Behavior navigation-path server guard accepted syntactically clean, but potentially sensitive named routes (for example `/account/billing.php`, `/students/dashboard`). The Events-by-Page SQL helper and server already deny such routes. This is a **policy discrepancy**; it is not evidence that actual private customer paths were emitted.

## Change

- `20261106094500_r2_p2_strict_public_path_privacy_v3.sql` changes only `native_safe_page_path_v2(text)`, adding the same case-insensitive private route segment exclusions used by Events-by-Page. The signature, volatility, `pg_catalog` search path and REVOKE are retained. The change affects the existing two report paths without writing event rows.
- `lib/native-behavior-data.ts` adds the same independent server output exclusion for Popular navigation paths. This is defense in depth if an RPC or helper returns an unexpected result.
- Playwright local synthetic fixture deliberately returns `/account/billing.php` and `/students/dashboard` as otherwise well-formed, high-volume navigation edges. The browser must suppress both while showing `/courses/200-hour-ytt.php` → `/enroll.php`.
- Node regression checks pin the migration's safe/blocked route cases, and ensure no new grant or event mutation.

## Acceptance / deployment order

1. Confirm exact diff has only this SQL helper, server output guard, tests and docs. No other migrations or app integrations.
2. Full CI (including Playwright) and CodeQL success on exact PR head; isolate failures rather than treating all checks as green.
3. Separately authorize applying the small SQL migration in the existing Supabase project. A deployed Next app **does not** itself prove the migration applied. Run an authorized transaction-safe readback of `pg_get_functiondef`, and pure synthetic helper inputs; no production customer paths/IDs are required.
4. Confirm matching READY Vercel deployment and no post-release runtime regressions.
5. Retain Issue #523 as OPEN until real owner/admin role checks, tenant isolation, 7/14/30-day UI–SQL reconciliation, public-path output inspection and sign-off.

## Privacy limitations

An approved public route shape is not a guarantee that the underlying website is public; this check only enforces a conservative explicit set of sensitive route names. It does not protect arbitrarily named private routes, replace source consent review, prove end-to-end RLS, or authorize tracking. No production tenant/source/event changes, paid staging, credentials, staff impersonation, or optional behavior collection are part of this PR. PR #530 consent and PR #535 retention remain separately blocked.
