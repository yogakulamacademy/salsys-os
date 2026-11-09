#!/usr/bin/env node
/**
 * R2 hosted Supabase branch ledger parity diagnostic.
 *
 * Pure, local, read-only. Accepts ONLY a trusted operator's version-only JSON
 * snapshot from supabase_migrations.schema_migrations. Does not call Supabase,
 * create a branch, read credentials, or modify a database or repository file.
 *
 * Passing proves only the known migration 007 prerequisite. It is NOT
 * exhaustive provider-ledger audit, staging approval, or restore evidence.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prerequisitePath = path.join(root, 'supabase/migrations/0065_catalog_integration_prerequisites.sql');
const dependantPath = path.join(root, 'supabase/migrations/007_tenant_schema_foundation.sql');
const recoveryPath = path.join(root, 'supabase/recovery/007_catalog_authorization_prerequisite.sql');

export function analyzeLedger(snapshot, sourceFiles) {
  const { prerequisite, dependant, recovery } = sourceFiles;
  const requiredSource = [
    [prerequisite, 'alter table public.courses'],
    [prerequisite, 'add column if not exists source_system text'],
    [prerequisite, 'add column if not exists external_course_id text'],
    [prerequisite, 'alter table public.course_batches'],
    [prerequisite, 'external_batch_id text'],
    [dependant, 'create unique index if not exists uq_courses_org_source_external'],
    [dependant, 'on public.courses(organization_id, source_system, external_course_id)'],
    [recovery, 'add column if not exists source_system text'],
  ];
  if (requiredSource.some(([sql, marker]) => typeof sql !== 'string' || !sql.includes(marker))) {
    return { status: 'BLOCKED_SOURCE_PREREQUISITE_DRIFT', known007PrerequisiteSatisfied: false };
  }
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) ||
      !Array.isArray(snapshot.migrations) || snapshot.migrations.length === 0) {
    return { status: 'BLOCKED_LEDGER_SNAPSHOT_REQUIRED', known007PrerequisiteSatisfied: false };
  }
  const versions = snapshot.migrations.map(row =>
    (typeof row === 'string' ? row : (row && !Array.isArray(row) ? row.version : null)));
  if (versions.some(v => typeof v !== 'string' || !/^\d{3,14}$/.test(v)) ||
      new Set(versions).size !== versions.length) {
    return { status: 'BLOCKED_INVALID_OR_DUPLICATE_LEDGER_VERSIONS', known007PrerequisiteSatisfied: false };
  }
  const set = new Set(versions);
  if (!set.has('006') || !set.has('007')) {
    return { status: 'BLOCKED_006_007_LEDGER_BASELINE_MISSING', known007PrerequisiteSatisfied: false };
  }
  if (!set.has('0065')) {
    return { status: 'BLOCKED_0065_NOT_RECORDED_BEFORE_007', known007PrerequisiteSatisfied: false };
  }
  return {
    status: 'PASS_KNOWN_007_PREREQUISITE_ONLY',
    known007PrerequisiteSatisfied: true,
  };
}

function printResult(result) {
  console.log(JSON.stringify({
    report: 'r2_hosted_branch_ledger_preflight_v1',
    ...result,
    fullMigrationReplayVerified: false,
    isolatedE2EVerified: false,
    backupRestoreVerified: false,
    authorizationToCreatePaidBranch: false,
    note: 'Version-only, operator-supplied evidence. Never treat this narrow check as hosted branch readiness.',
  }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf('--ledger-json');
  if (index < 0 || index + 2 !== process.argv.length) {
    printResult({ status: 'BLOCKED_LEDGER_SNAPSHOT_REQUIRED', known007PrerequisiteSatisfied: false });
    process.exitCode = 2;
  } else {
    try {
      const filePath = path.resolve(process.argv[index + 1]);
      const snapshot = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const sources = {
        prerequisite: fs.readFileSync(prerequisitePath, 'utf8'),
        dependant: fs.readFileSync(dependantPath, 'utf8'),
        recovery: fs.readFileSync(recoveryPath, 'utf8'),
      };
      const result = analyzeLedger(snapshot, sources);
      printResult(result);
      if (!result.known007PrerequisiteSatisfied) process.exitCode = 2;
    } catch {
      // Never echo untrusted snapshot contents, local paths, or credentials.
      printResult({ status: 'BLOCKED_SNAPSHOT_UNREADABLE_OR_INVALID', known007PrerequisiteSatisfied: false });
      process.exitCode = 2;
    }
  }
}
