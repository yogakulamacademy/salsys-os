# KB-12 — Final Engineering Closeout / Release Hold

**2026-11-08 — DRAFT, ENGINEERING-ONLY — NOT A PRODUCTION RELEASE**

Owner instruction remains: NO staging spend/provisioning, Production/Recovery reuse, hosted SQL, real customer crawling, model calls, GitHub protections change, main merge or deployment without fresh explicit authorization. A successful synthetic test is not an independent approval.

## Current deliverables

- Consolidated [draft PR #666](https://github.com/yogakulamacademy/salsys-os/pull/666), kept unmerged. Post-onboarding Knowledge Builder settings, consent/verification UI, safe website discovery metadata, manual draft input and bounded HTML/FAQ evidence previews are on its isolated branch, not live.
- KB-11A/B: uninstalled, disposable-local-only SQL candidate for source + draft + chunk created atomically under tenant, signed Auth session, owner/admin membership, configured domain, verified proof, current policy, and granted consent. It holds live session/organization/membership and policy/consent/job/page locks to serialize local revoke-first races.
- KB-12A: same disposable SQL now rejects malformed configured-domain labels, special-use DNS suffixes and unsafe URL syntax; local regression adds wrong-domain and concurrent website-change/policy-shutdown denial.
- Existing emergency pause / feature gates stay disabled; discovered-page save never falls back to the broad legacy knowledge creator and cannot auto-approve. Production worker never commits source-content evidence.
- KB-10 release-hold preflight prevents the unapproved atomic discovered-page function entering installable migration files. All unapproved SQL resides in docs/sql and is guarded by disposable test database names.

## Release decision matrix

| Area | Condition to count as complete | Current evidence |
|---|---|---|
| Local engineering | Full CI, database regressions, CodeQL on final exact PR head | Must inspect exact final run before claiming success |
| Integrated branch | Review entire cumulative changed-file list and divergence from advancing main, preserving contributors | Independent review outstanding |
| SQL security | Real Supabase/Auth session semantics, DML grants, function owner, RLS, commit expiry and migration/rollback validated | Disposable PostgreSQL only |
| Website source | Authorized real HTML/robots/redirect/provenance handling and persisted unapproved quote evidence | Production evidence writes disabled |
| Privacy + retention | Lawful purpose and notice/policy digest; 12 stores and 5 processor/copy categories, withdrawal/erasure deadlines and audit | Legal/DBA decision outstanding |
| Dedicated staging | Revenue condition, fresh currency/cost quote, capped approved budget, independent synthetic-only isolation | ON HOLD, no project |
| Acceptance | 16/16 independently witnessed real signed-user staging scenarios, plus post-onboarding and revoke races | **0/16** |
| Review + release | Independent protected review, explicitly authorized main merge and prod deploy, monitoring and rollback evidence | NOT AUTHORIZED |

## External approvals — cannot be supplied by the implementing assistant

1. [#612 Security and GitHub rules](https://github.com/yogakulamacademy/salsys-os/issues/612): named independent security reviewer, cumulative diff, protected-branch review and database/Auth/GRANT sign-off. GitHub PR currently has no independent approval.
2. [#613 Legal, privacy and DBA](https://github.com/yogakulamacademy/salsys-os/issues/613): choose actual consent basis/version, retention and deletion for every affected store and copy, regrant/withdrawal treatment, whether physically late COMMIT is forbidden, and idempotent save policy. No arbitrary defaults.
3. [#614 Cost and isolated staging](https://github.com/yogakulamacademy/salsys-os/issues/614): only once SalsysOS has revenue, approve fresh specific currency, capped budget, two synthetic tenants, dedicated isolated project and teardown. Production and Recovery forbidden.
4. [#601 Release acceptance](https://github.com/yogakulamacademy/salsys-os/issues/601): approve reviewed, versioned migration and independent staging witnesses (16/16), then separately approve protected main merge, production deploy, live monitoring and non-destructive rollback.

## Merge-safe handoff

PR #666 contains a broad integrated delta and is behind main. The designated reviewer must reconcile new main commits without overwriting another contributor, re-run all required checks at the eventual final merge SHA, and document effective GitHub rulesets/required checks. Do not cherry-pick unfinished older KB drafts into production separately, disable safe guards to pass tests, or deploy without consent and real validation.

**Definition of finish:** the available no-cost draft engineering may be checkpointed with green exact-head tests, but the Knowledge Builder is **not 100% production-closed** until all four owner/independent gates and the 16 staging witnesses exist. Do not close their issues early.
