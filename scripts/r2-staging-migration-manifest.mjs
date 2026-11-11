#!/usr/bin/env node
/**
 * Report the exact SQL files in the operator's staging migration working tree.
 * Read-only, local, no Supabase CLI/provider calls, secrets, or database access.
 * This is an artifact-integrity diagnostic, NOT authorization to deploy.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

export function buildManifest(folder) {
  const entries = fs.readdirSync(folder, { withFileTypes: true });
  const names = entries.filter(e => e.isFile() && e.name.endsWith('.sql'))
    .map(e => e.name).sort();
  if (names.length === 0) throw new Error('EMPTY_MIGRATION_DIRECTORY');
  const files = names.map(name => {
    const m = name.match(/^(\d{3,14})_([a-z0-9_]+)\.sql$/);
    if (!m) throw new Error('INVALID_MIGRATION_FILENAME');
    const bytes = fs.readFileSync(path.join(folder, name));
    return { name, version: m[1], sha256: hash(bytes) };
  });
  const versions = new Set();
  for (const file of files) {
    if (versions.has(file.version)) throw new Error('DUPLICATE_MIGRATION_VERSION');
    versions.add(file.version);
  }
  const content = JSON.stringify(files);
  return {
    report: 'r2_staging_migration_worktree_manifest_v1',
    fileCount: files.length,
    manifestSha256: hash(content),
    files,
    safety: {
      remoteProviderAccess: false,
      customerDataExported: false,
      remoteSchemaReady: false,
      isolatedAcceptanceProven: false,
      authorizationToDeploy: false,
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  if (process.argv.length !== 3) {
    console.error('BLOCKED_USAGE: provide one explicit local migration directory argument');
    process.exitCode = 2;
  } else {
    try {
      const target = path.resolve(process.argv[2]);
      const result = buildManifest(target);
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    } catch (e) {
      // Do not expose paths, SQL contents, or environment values.
      console.error('BLOCKED_' + (String(e.message).match(/^[A-Z_]+$/) ? e.message : 'MIGRATION_INSPECTION_FAILED'));
      process.exitCode = 2;
    }
  }
}
