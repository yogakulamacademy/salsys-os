# R2 staging — read-only post-install catalog exposure gate v1

**Scope:** low-risk metadata-only audit that is safe to run on the existing empty temporary staging database **and** as a read-only production reference. It is strictly **not** a database migration, a privilege change, an E2E test, consent signoff, recovery rehearsal or release approval. No production customer rows, names, email addresses, secrets, tokens or message content are accessed.

## Audit

Run the single `SELECT` in `docs/sql/r2-staging-postinstall-catalog-exposure-v1.sql` against an independently verified target. It uses PostgreSQL catalog metadata (`pg_class`, `pg_namespace`, `pg_proc`), `has_table_privilege` and `has_function_privilege`. It returns **aggregate counts only**, with fail-closed classification:

- `SCHEMA_NOT_INSTALLED_OR_INCOMPLETE` — no public application tables or no public privileged functions. This is the expected result **before staging schema installation**; zero findings here is not a pass.
- `PRIVILEGE_CATALOG_REVIEW_REQUIRED` — an RLS-disabled public table accessible by `anon` or `authenticated`; a public view accessible to either role without explicit `security_invoker=true`; or a public `SECURITY DEFINER` function callable by `anon`. A finding must be investigated and corrected or independently justified before E2E.
- `CATALOG_GUARDS_PASS_NOT_ACCEPTANCE` — the *narrow* catalog invariants above hold. It explicitly returns `false` for real signed tenant testing, consent, backup restore and authorization to release.

Do not hardcode absolute table/function totals as release pass thresholds. Production and historical stage-only local replay can legitimately have different schemas or version/role contracts. A passing catalog gate **does not validate** the authorization checks inside the `authenticated`-executable security-definer functions, real Auth/session claims, metadata staleness, RPC access, consent, outbound integrations or data isolation. These must be witnessed independently.

## Evidence from November 9, 2026 (read-only queries)

| Metric | Production baseline | Fresh empty staging |
|---|---:|---:|
| Public-schema tables | 251 | 0 |
| Public-schema views | 265 | 0 |
| Public tables without RLS | 1 | 0 |
| Non-RLS tables accessible to anon/authenticated | 0 | 0 |
| Views exposed without `security_invoker=true` | 0 | 0 |
| Public `SECURITY DEFINER` functions | 423 | 0 |
| Such functions executable by anon | 0 | 0 |
| Such functions executable by authenticated | 114 | 0 |
| Audit gate | `CATALOG_GUARDS_PASS_NOT_ACCEPTANCE` | `SCHEMA_NOT_INSTALLED_OR_INCOMPLETE` |

The single production RLS-off table was **not accessible by either API-facing role** according to this catalog test. The 114 authenticated-executable privileged functions are informational candidates for function-body authorization review, **not 114 known vulnerabilities**. The production baseline is not an acceptance substitute for actual staging security. It provides a reference only.

## Execution boundaries

- Existing staging project: `ndxpjqkthuzxlmbenxti`, still intentionally empty and separately approved at $10/month recurring; **do not apply migrations based on this report**.
- Production project: `doaozrkrtgeslddwhclj`, strictly read-only baseline; never modify.
- Recovery Rehearsal: `wunnbqjvfzmawubglyhe`, off limits.
- PR #674 contains 431-file staging-only SQL package with inert cron jobs, a non-routable scheduler endpoint and no development seed. It still requires independent approval, exact CI evidence, authenticated staging-only dry run and operational safety signoff before the hosted schema can be installed.
- PR #667 lead-reliability release is unrelated and remains unmerged.

**Post-install acceptance sequence:** after the authorized operator installs the reviewed staging-only schema, rerun this metadata query; investigate every privilege finding; run Supabase security/health advisors; verify active cron commands, scheduler disabled, lack of external credentials, and empty customer tables separately; then run actual authenticated tenant A/B, consent and application HTTP tests and approved restore checks. Do not update any release gate based solely on this query.

Reference: [R2 staging issue #531](https://github.com/yogakulamacademy/salsys-os/issues/531).
