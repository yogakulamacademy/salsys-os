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

## Independent SQL external-effect candidate inventory (CI evidence)

The same disposable `Migration Replay` job now runs:

```bash
node scripts/r2-staging-sql-external-effects-audit.mjs supabase/migrations \
  > r2-staging-sql-external-effects-candidates.json
node --test tests/readiness/r2-staging-sql-external-effects-audit-v1.test.cjs
```

It hashes the *same* prepared migration SQL inputs and lists only filenames, categories and match counts, **not** raw SQL, URLs, secrets or customer data. It detects possible `cron.schedule`, cron mutation, HTTP/pg_net, remote URL defaults, vault and cross-database/provider effects. It deliberately scans strings and comments as well as executable text, so entries can be false positives; dynamically constructed SQL may also escape detection. **Even if the report has zero candidates, it is not proof that external effects are absent.**

This audit is **report-only** and does not rewrite SQL, disable schedules, prevent network egress or authorize the remote schema apply. Before bootstrapping staging, independently review all candidate SQL and the prepared migration manifest, demonstrate a disposable CI replay of the *actual staging-specific* no-external-effects strategy, and provide operator signoff. Known source risks include every-minute Instagram retry jobs and a default URL targeting the live SalsysOS scheduler, even though that scheduler setting defaults disabled. No actual outbound send is demonstrated by a static match.

The `migration-recovery-evidence` artifact includes `r2-staging-sql-external-effects-candidates.json` next to the source manifest, enabling a file-by-file no-secrets review. **Do not run a raw `supabase db push` on staging based solely on any of these diagnostics.**

## Staging-only inert scheduler SQL copy — requires separate replay proof

For the **exact** prepared migration folder whose SHA-256 was recorded by successful source CI, the local helper:

```sh
node scripts/r2-staging-inert-scheduler-sql-copy.mjs \
  --source supabase/migrations \
  --output /tmp/r2-staging-inert-migrations \
  --expected-source-manifest-sha256 REPLACE_WITH_VERIFIED_CI_SOURCE_MANIFEST_SHA256
```

writes a **new local folder** of SQL files; it never edits the original repository migrations or connects to a database. It fails closed if the source fingerprint does not match, if any of the six known `cron.schedule` source files differ, if unknown cron scheduling appears, or if an output folder exists. It replaces the *six scheduled SQL command literals only* with inert `select 1;` commands. It also changes the historical automation scheduler's default live SalsysOS endpoint to the non-routable `https://staging.invalid/api/automation/runtime-scheduler`. It retains the schema and the recovery migration functions. A new, different **staging manifest SHA-256** is printed and must be used with the staging-only remote dry-run; do not reuse the original source digest for the changed SQL copy.

The staging-only **second reset** now replaces the local runner's development `supabase/seed.sql` with a comment-only file before database reset. The original source file remains unchanged; this prevents fictional admissions leads and demo campaigns from entering the staging acceptance fixture. Following the second reset, CI asserts that `auth.users`, `storage.objects`, `public.leads`, `public.lead_contacts`, `public.messages`, `public.conversations`, and `public.web_sessions` all contain **zero rows**. Do not copy the development seed file to hosted staging. These tests prove only the isolated local fixture, not hosted staging data state.

A **second, disposable local database replay** in GitHub CI uses this transformed working tree, then requires every active `cron.job` command to be exactly `select 1;`, and requires `automation_scheduler_settings.enabled=false` with the `.invalid` endpoint. The original *unmodified* full migration replay and tenant-isolation checks execute first. This establishes local migration compatibility and the tested scheduler-command boundary without activating any remote project.

The copied SQL still contains some privileged functions, `pg_net`, an inactive scheduler implementation, and additional URL literals used elsewhere in the schema. The transform is **not a guarantee of complete network isolation** and cannot substitute for independently checking whether any other operation could invoke a provider or access a secret. It does **not** perform any staging or production SQL write, install a CRM, create an authenticated user, or authorize external test sends. Real stage-only DDL and acceptance still require separate operator review of the exact transformed manifest and provider settings.

## Staging-copy tenant isolation rehearsal

After the second no-seed, inert-scheduler local database replay, the disposable GitHub runner reruns both existing `tests/database/r2-behavior-rpc-negative-auth-local.sql` and `tests/database/r2-behavior-rpc-positive-tenant-local.sql` against the **transformed** staging-copy schema. These are synthetic local SQL cases: positive owner/admin access, foreign-tenant report denial, anonymous/unbound-session denial and rollback of their temporary test data. The runner verifies **after** both tests that Auth users, leads, contacts, conversations, messages, web sessions and Storage objects remain at zero, and active cron commands remain inert.

This **does not replace real independently signed-in browser testing** in hosted staging, and does not prove consent, portal behavior, connection isolation or restore readiness. No production and no hosted staging SQL is executed by this check.

## New fail-closed remote dry-run helper (local operator only)

On a separate, trusted working tree that has reproduced **all** of the historical recovery workflow steps and has passed the clean local replay, save the exact approved manifest SHA-256 from the current GitHub `migration-recovery-evidence` artifact. Do not copy credentials into logs or GitHub issues.

With the official Supabase CLI, manually authenticate and link **only** the staging project ref `ndxpjqkthuzxlmbenxti` in this isolated checkout; first verify the locally written `supabase/.temp/project-ref` equals that exact ref. The project must have no production customer data. Never link production or Recovery Rehearsal.

```bash
node scripts/r2-staging-remote-dryrun.mjs \
  --project-root . \
  --expected-manifest-sha256 REPLACE_WITH_REVIEWED_64_CHAR_CI_DIGEST
```

This command checks the exact staging ref, rejects incorrect/missing linkage, rejects mismatched SQL file bytes and duplicate versions, and calls **only** `supabase db push --dry-run` via a fixed argument array. It neither connects to nor modifies production; the linked Supabase CLI may read staging schema state. CLI output is intentionally not echoed to avoid leaking connection metadata. The success label `DRY_RUN_CLI_COMPLETED_NOT_APPLIED` is a dry-run status only, **not an applied migration or security signoff**.

An operator must separately inspect the staging-only `supabase migration list --remote` and the reviewed, prepared SQL migration order. Do not run `supabase db push` without `--dry-run` or write any staging DDL before operator review of every privileged/security/third-party side effect, verification of no real sends/cron, and approval. The production project reference is `doaozrkrtgeslddwhclj` and Recovery Rehearsal is `wunnbqjvfzmawubglyhe`; both are **prohibited** targets.

**There is no assumption that the remote CLI dry-run is already complete**: it requires an operator's authenticated, isolated checkout and the exact GitHub CI manifest digest. No provider credentials are bundled in this PR.

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
