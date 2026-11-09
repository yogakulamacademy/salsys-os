# R2 isolated staging — source migration fingerprint handoff

**Scope:** a local, read-only inventory of exact staged SQL migration file bytes. This is **not** a staging deploy, schema repair, acceptance certificate, consent approval, or instruction to write to production.

## Why this is necessary

On 2026-11-09 a temporary provider development-branch clone failed replay at historical migration `007` because the actual production ledger omitted source prerequisite `0065`. The failed branch was deleted. The separately created empty and owner-authorized standalone staging project is `ndxpjqkthuzxlmbenxti` (Singapore, $10/month recurring, initially 24–48h). At creation it had no public tables, functions, migrations, Auth users, Storage objects or Edge Functions.

A read-only version-only parity audit of `main` at `33320481438af68eb4ec2584369e9aadce36fd37` counted:

- GitHub `supabase/migrations/`: 366 SQL files, 363 distinct numeric filename versions;
- production provider migration ledger: 522 version records;
- overlap: 211; repository-only: 152; provider-only: 311;
- three duplicate repository filename version prefixes before the existing workflow's historical renames: `029`, `030`, `20261020101500`.

These differences can be **intentional historical recovery handling**, not a count of broken migrations. The existing local `.github/workflows/migration-replay.yml` performs special `mv`/`cp`/assembly steps in its disposable CI working tree; an ordinary, unprepared `supabase db push` of the source folder is *not* an accepted staging bootstrap.

## Operator workflow (local files only)

After checking out an exact reviewed commit in an isolated local/CI checkout and reproducing all of the existing **Stage historical recovery prerequisites** working-tree steps from `.github/workflows/migration-replay.yml`, run:

```bash
node scripts/r2-staging-migration-manifest.mjs supabase/migrations > r2-staging-migration-worktree-manifest.json
node --test tests/readiness/r2-staging-migration-manifest-v1.test.cjs
```

This produces an ordered JSON inventory of migration filenames, numeric versions and SHA-256 hashes plus an overall manifest SHA-256. No SQL text, customer data, credentials, network calls or provider operations are included. Duplicate versions, invalid names and empty directories exit nonzero; that is **expected on the raw source folder**, and prevents assuming it is deployable.

**Do not publish a manifest as a successful fresh-database replay.** It only fingerprints inputs. Separately run the actual full local migration reset and its local security/tenant/rollback test assertions, record the same source commit and exact tested SQL manifest hash, and independently review the SQL for external actions, SECURITY DEFINER ACLs, RLS and live-provider side effects.

If the source SQL is later staged for remote installation, independently verify the operator's Supabase target is **only** `ndxpjqkthuzxlmbenxti`, **never** production `doaozrkrtgeslddwhclj` or Recovery Rehearsal `wunnbqjvfzmawubglyhe`. Confirm credentials/hostnames and that staging is still empty and disposable. Run the current CLI's `supabase migration list --remote` and `supabase db push --dry-run --remote`, inspect every planned SQL migration, confirm no seeded customer records or external sends, and get explicit release-operator signoff before any **staging-only** schema apply. Never perform a remote `migration repair` or modify production's migration ledger simply to make a replay pass.

The manifest **cannot** establish that a valid deployed CRM/API exists, that a real website/CMP was tested, that a multi-tenant signed-in browser test passed, or that a production backup restores. All R2 P1/P2/P3 gates and PR #667 release constraints remain independent.

References: [R2 staging issue #531](https://github.com/yogakulamacademy/salsys-os/issues/531), [Supabase migration guidance](https://supabase.com/docs/guides/deployment/database-migrations), [Supabase CLI workflows](https://supabase.com/docs/guides/local-development/cli-workflows).
