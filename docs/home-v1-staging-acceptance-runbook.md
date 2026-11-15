# Home V1 — staging acceptance and release gate

**Status: BLOCKED — real staging role and UI acceptance not performed.**
This checklist covers the stacked work in draft PRs #705–#708. It is not authority to deploy, merge, mutate a Supabase project or expose credentials.

## Verified in CI (2026-11-15)

- Latest previously completed clean-local migration replay for commit `fc10b8fed4e6a63c4be01f011f85c91c0472362a` **PASS**, including `tests/database/home-v1-rpc-auth-and-metrics-local.sql`.
- CodeQL Security Scan **PASS** for that commit.
- Financial-database CI job **PASS**.
- Application typecheck and build **PASS**; the overall CI workflow was subsequently **CANCELLED** when newer branch commits superseded its run. It must not be recorded as a full CI pass.
- The above results apply to the recorded commit only; any later changes must be tested again.
- Local fixture exercises anonymous, unbound, owner, manager, admissions, admin of another tenant, revoked member and cross-tenant checks using synthetic identities with `ROLLBACK`. It also verifies history cutoff, source grouping, open-opportunity stage rules and distinct INR/USD amounts.

## Preflight — staging database (read only)

An authorized operator first confirms that the **exact staging** project and application preview are intended for Home V1. A read-only audit on 2026-11-15 confirmed the temporary staging project and production histories have diverged substantially:

| Migration ledger | Version count |
| --- | ---: |
| Temporary staging | 433 |
| Production | 524 |
| Shared version numbers | 237 |
| Present only in staging | 196 |
| Present only in production | 287 |

The exact read-only staging audit in `docs/sql/home-v1-staging-metadata-audit-v1.sql` returned **metadata_pass=false** for all three functions:
- `get_dashboard_snapshot`: present, authenticated-executable, anonymous denied, but missing the proposed explicit session-binding and NULL-safe authorization guards;
- `get_home_v1_qualification_snapshot`: absent;
- `get_home_v1_pipeline_snapshot`: absent.

**NO-GO:** do not assume the temporary staging project can accept a straightforward Home V1 migration. Prefer an isolated, disposable acceptance environment created from the validated clean-replay dependency sequence. That environment requires separate approval before cloud provisioning or migration application. Do not attempt to replay hundreds of divergent historical migrations onto temporary staging.

Run `docs/sql/home-v1-staging-metadata-audit-v1.sql` using a private, authorized database connection against the chosen staging database.

Pass requires **all three RPCs** to have metadata_pass=true: functions installed, SECURITY DEFINER explicitly justified, authenticated EXECUTE granted, anonymous denied, explicit tenant-session record checked and null-safe authorization. A missing RPC is a deployment prerequisite, **not** a reason to turn off checks or show a fake zero value.

Before any staging migration, reconcile current migration history, backups, data retention/privacy policies, and preview application configuration. **Do not run migrations or change a persistent staging environment without the operator's approval.**

## Live staging acceptance (authorized signed-in accounts only)

Use explicitly approved test accounts with ordinary login and real, separate browser sessions. Do not forge JWTs, impersonate actual members, or share credentials in issues or chat. For each scenario, record only PASS / FAIL / BLOCKED and the tested app commit.

| Test | Expected result |
|---|---|
| Owner, bound tenant A, `/home` | Home loads; KPI evidence and drilldowns agree |
| Manager, bound tenant A | Permitted executive metrics match the same tenant |
| Admin, bound tenant B | Only B's data visible, no stale values from A |
| Admissions role, tenant A | `/home` and the three privileged RPCs denied |
| Anonymous / expired session | Direct RPC denied; no sensitive content rendered |
| Owner without bound session | All three direct RPCs denied |
| Revoked membership in current session | Subsequent RPC denied and prior cached tenant data removed |
| Cross-tenant direct calls | All three RPCs reject foreign organization IDs |
| `/home/sources` | Selected period preserved, grouped first-touch sources reconcile |
| `/revenue/valuation` | Eligible counts match Home pipeline RPC; missing values not silently zeroed |
| Missing reporting RPC or malformed response | Unavailable/error state, not fabricated zero |
| INR and USD valued leads | Separate values, no unapproved FX aggregation |
| Lead qualifies after a past cutoff | Past cutoff total does not change |
| 390px, 768px and desktop | Accessible layout, keyboard focus, reliable drilldowns |

**Critical acceptance principle:** CI's synthetic owner/admin tests do not substitute for real signed-in staging sessions. Any failure or uncertainty blocks approval; do not mark partial evidence as PASS.

## Data and semantic checks

- Confirm event `changed_at` and lead creation windows using the same UTC reporting date boundaries. Organization-local time zones are **not yet supported** for Home V1; clearly label UTC.
- Qualified count means **acquisition cohort that ever reached qualifying milestone by period end**; it is not the number currently in a qualified stage.
- Current open-pipeline value uses only explicitly valued, currency-tagged active sales-stage leads. Verify eligible, unvalued and missing-currency totals, and independently compare source records.
- Revenue remains an unreconciled CRM payment ledger. **Do not call it verified settled collections**, source-to-revenue conversion, or recognized accounting revenue.
- If reporting cohort/source totals cannot be independently reconciled, leave qualification rate unavailable.
- Do not enable external tracking, payments, messaging, or automation to generate test evidence.

## Go / no-go

Approval requires: exact commit's CI + CodeQL + migration replay success; metadata preflight green on approved staging; signed-in role/tenant matrix; KPI/source/valuation parity; responsive/error-state checks; explicit review of rollout and rollback procedure.

Current decision: **NO-GO pending staging migrations/role tests and the latest CI completion.**

The synthetic Playwright acceptance suite now includes `tests/ui/home-v1-evidence.spec.ts`: four Home headlines, period-preserving source drilldown, evidence-unavailable states, currency/collection disclaimers and 390px/768px/1440px layout checks. Its outcome must be obtained from CI for the exact commit containing the test; adding a test is not proof it passed.

Keep PR #708 **draft**, and do not merge to `main` or apply SQL to production.
