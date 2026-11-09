#!/usr/bin/env node
/**
 * R2 staging-only, operator-invoked, fail-closed Supabase CLI dry run.
 *
 * This program NEVER links a project, sends SQL, applies migrations, creates
 * paid resources, or accepts a DB URL. The operator must first link a disposable
 * local checkout to the exact staging ref. It then checks the staged SQL bytes
 * against a reviewed CI artifact digest before a read-only CLI dry-run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildManifest } from './r2-staging-migration-manifest.mjs';

export const STAGING_REF = 'ndxpjqkthuzxlmbenxti';
export const PRODUCTION_REF = 'doaozrkrtgeslddwhclj';
export const RECOVERY_REF = 'wunnbqjvfzmawubglyhe';

function fail(reason) { throw new Error('BLOCKED_' + reason); }
function assertStageTargetEnvironment() {
  // Supabase CLI accepts SUPABASE_WORKDIR, which overrides the linked checkout.
  // Never allow an inherited shell setting to redirect even a dry run.
  if (process.env.SUPABASE_WORKDIR?.trim()) fail('CLI_WORKDIR_OVERRIDE');
  // Supabase CLI v3 resolves a bare remote target from SUPABASE_PROJECT_ID first.
  // Reject inherited non-staging refs; the child process is pinned to STAGING_REF.
  if (process.env.SUPABASE_PROJECT_ID?.trim() &&
      process.env.SUPABASE_PROJECT_ID.trim() !== STAGING_REF) fail('CLI_PROJECT_OVERRIDE');
}
export function planDryRun({ projectRoot, expectedDigest, cli = 'supabase' }) {
  assertStageTargetEnvironment();
  if (!/^[a-f0-9]{64}$/.test(expectedDigest ?? '')) fail('INVALID_MANIFEST_DIGEST');
  const project = path.resolve(projectRoot);
  const refPath = path.join(project, 'supabase', '.temp', 'project-ref');
  if (!fs.existsSync(refPath)) fail('LINK_TO_STAGING_REQUIRED');
  const actualRef = fs.readFileSync(refPath, 'utf8').trim();
  if (actualRef !== STAGING_REF) fail('WRONG_PROJECT_REF');
  const migrations = path.join(project, 'supabase', 'migrations');
  const manifest = buildManifest(migrations);
  if (manifest.manifestSha256 !== expectedDigest) fail('MIGRATION_DIGEST_MISMATCH');
  // Supabase CLI v3 defaults db push to LOCAL; v2 uses linked by default.
  // --linked explicitly selects the reviewed linked staging ref on BOTH v2 and v3.
  // v3 deprecates --linked, but continues to support it; a future unsupported
  // version must fail, never silently fall back to a local dry run.
  // Never use --db-url, --yes, --include-seed, or arbitrary SQL.
  return { command: cli, args: ['db', 'push', '--dry-run', '--linked'], cwd: project,
    projectRef: actualRef, fileCount: manifest.fileCount, expectedDigest };
}

export function runDryRun(plan) {
  // Recheck the actual project-ref and bytes immediately before the CLI call:
  // the link or migrations may have changed since planDryRun() was invoked.
  assertStageTargetEnvironment();
  if (plan.projectRef !== STAGING_REF || !plan.cwd ||
      JSON.stringify(plan.args) !== JSON.stringify(['db', 'push', '--dry-run', '--linked'])) {
    fail('INVALID_DRYRUN_PLAN');
  }
  const refPath = path.join(plan.cwd, 'supabase', '.temp', 'project-ref');
  if (!fs.existsSync(refPath) || fs.readFileSync(refPath, 'utf8').trim() !== STAGING_REF) {
    fail('STAGING_LINK_CHANGED_BEFORE_CLI');
  }
  const current = buildManifest(path.join(plan.cwd, 'supabase', 'migrations'));
  if (current.manifestSha256 !== plan.expectedDigest || current.fileCount !== plan.fileCount) {
    fail('STAGING_SQL_CHANGED_BEFORE_CLI');
  }
  const env = { ...process.env };
  delete env.SUPABASE_WORKDIR;
  // Pin the CLI's v3 environment-based linked-project lookup to the verified
  // stage ref, even if the checkout contains a different .env setting.
  env.SUPABASE_PROJECT_ID = STAGING_REF;
  const r = spawnSync(plan.command, plan.args, {
    cwd: plan.cwd,
    env,
    shell: false,
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 3 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // Do not echo provider output, even on failure: it may contain connection info.
  if (r.error || r.status !== 0) fail('SUPABASE_CLI_DRYRUN_FAILED');
  return { status: 'DRY_RUN_CLI_COMPLETED_NOT_APPLIED', targetRef: plan.projectRef,
    fileCount: plan.fileCount, schemaApplied: false,
    productionModified: false, acceptanceVerified: false };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--project-root' || args[2] !== '--expected-manifest-sha256') {
    fail('USAGE');
  }
  const plan = planDryRun({ projectRoot: args[1], expectedDigest: args[3] });
  process.stdout.write(JSON.stringify(runDryRun(plan), null, 2) + '\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (e) {
    const msg = String(e.message);
    console.error(msg.startsWith('BLOCKED_') ? msg : 'BLOCKED_UNVERIFIED_ENVIRONMENT');
    process.exitCode = 2;
  }
}
