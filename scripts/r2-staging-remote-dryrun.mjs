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
export function planDryRun({ projectRoot, expectedDigest, cli = 'supabase' }) {
  if (!/^[a-f0-9]{64}$/.test(expectedDigest ?? '')) fail('INVALID_MANIFEST_DIGEST');
  const project = path.resolve(projectRoot);
  const refPath = path.join(project, 'supabase', '.temp', 'project-ref');
  if (!fs.existsSync(refPath)) fail('LINK_TO_STAGING_REQUIRED');
  const actualRef = fs.readFileSync(refPath, 'utf8').trim();
  if (actualRef !== STAGING_REF) fail('WRONG_PROJECT_REF');
  const migrations = path.join(project, 'supabase', 'migrations');
  const manifest = buildManifest(migrations);
  if (manifest.manifestSha256 !== expectedDigest) fail('MIGRATION_DIGEST_MISMATCH');
  // Never use --db-url, --linked-to-another-project, --yes, or arbitrary SQL.
  return { command: cli, args: ['db', 'push', '--dry-run'], cwd: project,
    projectRef: actualRef, fileCount: manifest.fileCount };
}

export function runDryRun(plan) {
  const r = spawnSync(plan.command, plan.args, {
    cwd: plan.cwd,
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
