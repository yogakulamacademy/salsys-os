#!/usr/bin/env node
/**
 * Stage-only migration side-effect candidate inventory.
 * Conservative source-string matches; candidate presence is never an automatic
 * safety conclusion. No SQL content/URLs/secrets in output. No network or DB calls.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildManifest } from './r2-staging-migration-manifest.mjs';

const detectors = Object.freeze({
  cron_schedule: /\bcron\s*\.\s*schedule\s*\(/gi,
  cron_alter: /\bcron\s*\.\s*(?:alter_job|unschedule)\s*\(/gi,
  http_execution: /\b(?:net\s*\.\s*http_(?:get|post|delete|patch|put)|http\s*\.\s*(?:get|post|put|delete|patch)|http_(?:get|post|put|delete|patch)|extensions\s*\.\s*http)\s*\(/gi,
  extension_network: /\bcreate\s+extension\s+(?:if\s+not\s+exists\s+)?(?:pg_net|http|postgres_fdw|dblink)\b/gi,
  remote_url_literal: /\bhttps?:\/\//gi,
  vault_reference: /\b(?:vault|supabase_vault)\s*\./gi,
  cross_database: /\b(?:dblink_connect|postgres_fdw|create\s+server)\b/gi,
  outbound_queue: /\b(?:send_(?:whatsapp|instagram|email)|dispatch_(?:whatsapp|instagram|email)|invoke_provider)\s*\(/gi,
});
const digest = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

export function auditStagedMigrationFiles(folder) {
  const manifest = buildManifest(folder);
  const rows = [];
  const totals = Object.fromEntries(Object.keys(detectors).map(k => [k, 0]));
  for (const file of manifest.files) {
    const bytes = fs.readFileSync(path.join(folder, file.name));
    // This is intentionally a *candidate* search including strings/comments/DO bodies.
    // Do not treat zero matches as proof of absence of dynamic SQL side effects.
    const sql = bytes.toString('utf8');
    for (const [kind, regex] of Object.entries(detectors)) {
      regex.lastIndex = 0;
      const matches = sql.match(regex);
      if (matches?.length) {
        rows.push({ file: file.name, kind, count: matches.length });
        totals[kind] += matches.length;
      }
    }
  }
  return {
    report: 'r2_staging_sql_external_effects_candidates_v1',
    inspectedSqlFiles: manifest.fileCount,
    sqlManifestSha256: manifest.manifestSha256,
    candidateFileCount: new Set(rows.map(x => x.file)).size,
    candidateOccurrences: Object.values(totals).reduce((a, b) => a + b, 0),
    categories: totals,
    candidates: rows.sort((a,b)=> a.file.localeCompare(b.file)||a.kind.localeCompare(b.kind)),
    reviewRequired: true,
    authorizedToRunMigrations: false,
    absenceOfExternalEffectsVerified: false,
    warning: 'Conservative lexical candidates; not a sandbox, complete taint analysis, or release approval.',
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) {
    console.error('BLOCKED_USAGE_EXPLICIT_LOCAL_DIRECTORY_REQUIRED');
    process.exitCode = 2;
  } else {
    try {
      process.stdout.write(JSON.stringify(auditStagedMigrationFiles(path.resolve(process.argv[2])), null, 2) + '\n');
    } catch {
      console.error('BLOCKED_INVALID_MIGRATION_WORKTREE');
      process.exitCode = 2;
    }
  }
}
