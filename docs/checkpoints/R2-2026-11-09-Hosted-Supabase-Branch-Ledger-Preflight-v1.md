# R2 — Hosted Supabase branch migration-ledger parity (2026-11-09)

**Status:** Provider hosted-branch replay **BLOCKED**. This checkpoint and its script are read-only diagnostics; they do not authorize a new paid branch, production migration or R2 sign-off.

## Reproduced observation

The owner explicitly approved one temporary, data-less Supabase development branch at $0.01344/hour. The branch `r2-isolated-acceptance-20261109` was created at 2026-11-09 02:38:09 UTC with `with_data=false`, and Supabase returned `MIGRATIONS_FAILED`. Its replay applied `001` through `006`, then PostgreSQL reported `42703` at migration `007_tenant_schema_foundation.sql` while creating the index on `public.courses(organization_id, source_system, external_course_id)`.

Isolated branch inspection found **0 Auth users, 0 leads, 0 lead contacts, 0 conversations, 0 messages, and 0 Storage objects**. The failed paid branch was promptly **deleted**. A follow-up branch list showed only `main`, while production and the separate Recovery Rehearsal project remained healthy.

The repository **does** contain `supabase/migrations/0065_catalog_integration_prerequisites.sql` and an identical `supabase/recovery/007_catalog_authorization_prerequisite.sql`. These define the missing catalog columns and old auth helpers. However, the actual **production provider migration ledger** contains `006`, `007`, `008` and `009` but **does not record `0065`** (checked 2026-11-09). GitHub's clean Migration Replay stages additional historical recovery prerequisites; that replay is not equivalent to hosted branch replay from the production migration ledger.

## Operator diagnostic (no provider access)

Use the SalsysOS Production SQL editor *only for this SELECT*, with no credentials, PII or row data exported:

```sql
select version
from supabase_migrations.schema_migrations
order by version;
```

Save its version strings locally in a JSON object with a `migrations` array:

```json
{"migrations":[{"version":"006"},{"version":"007"}]}
```

**The example above is intentionally incomplete and MUST fail.** Use a fresh, complete operator-supplied version-only production ledger snapshot, not the example, and do not claim the supplied data was checked by the script.

```sh
node scripts/r2-hosted-branch-ledger-preflight.mjs --ledger-json /path/to/version-only-ledger.json
```

The tool is a local, read-only Node script and performs no network calls or database writes. Exit code **2** means blocked. In particular, `BLOCKED_0065_NOT_RECORDED_BEFORE_007` warns that the prerequisite is absent from the provider ledger: **do not repeat an hourly-billed hosted branch trial**. Exit code **0** (`PASS_KNOWN_007_PREREQUISITE_ONLY`) means only this specific recorded prerequisite was observed; it does **not** prove a complete provider-ledger replay, backup/restore readiness, source/tenant isolation, or permission to create paid staging.

The test file `tests/readiness/r2-hosted-branch-ledger-preflight-v1.test.cjs` is picked up by the existing `npm run test:readiness` CI glob. Its observed missing-`0065` fixture passes when the guard correctly **blocks** the known failure; that is not a successful hosted branch run.

## Safe routes after independent technical review

- **Provider-supported ledger reconciliation:** determine an approved way to preserve source/history and reconstruct missing prerequisites. **Do not** casually insert an `0065` migration ledger row or apply historical SQL to live production just to make hosted branching pass. Independently review privileges, data continuity, restore/rollback and downstream prerequisites first.
- **New, fully separate staging database:** obtain the provider's current project cost and explicit financial approval before provision; apply the reviewed source-local recovery/bootstrap chain on an isolated project without production rows. Require a distinct protected Vercel project and genuine HTTPS test website, with all external sends, billing and scheduler effects disabled.
- **No-new-cost work:** continue disposable local/CI PostgreSQL and synthetic browser tests while the actual hosted migration replay and real-site acceptance remain blocked.

These options do not replace separate real owner/admin tenant isolation, consent/GPC/withdrawal acceptance, production backup recovery verification, or controlled release authority. PR #667 remains separately reviewed, approved and **unmerged** pending those release gates.
