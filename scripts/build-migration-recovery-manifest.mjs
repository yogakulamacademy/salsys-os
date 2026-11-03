import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const migrationsDir = path.join(root, 'supabase', 'migrations');
const ledgerPath = path.join(root, 'supabase', 'recovery', 'production-ledger-20261017-20261019.tsv');
const outputPath = path.join(root, 'migration-recovery-manifest.md');

const ledgerLines = fs.readFileSync(ledgerPath, 'utf8')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

if (ledgerLines[0] !== 'version\tname') {
  throw new Error('Unexpected recovery ledger header');
}

const ledger = ledgerLines.slice(1).map((line) => {
  const [version, name, ...extra] = line.split('\t');
  if (!version || !name || extra.length) {
    throw new Error(`Invalid recovery ledger row: ${line}`);
  }
  return { version, name };
});

const files = fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort();
const parsed = files.map((file) => {
  const match = file.match(/^(\d+)_([^/]+)\.sql$/);
  return match ? { file, version: match[1], name: match[2] } : { file, version: null, name: null };
});

const byExact = new Map(parsed.filter((item) => item.version).map((item) => [`${item.version}\t${item.name}`, item]));
const byName = new Map();
for (const item of parsed) {
  if (!item.name) continue;
  const list = byName.get(item.name) ?? [];
  list.push(item);
  byName.set(item.name, list);
}

const rows = ledger.map((entry) => {
  const exact = byExact.get(`${entry.version}\t${entry.name}`);
  if (exact) return { ...entry, status: 'exact', repo: exact.file };

  const sameName = byName.get(entry.name) ?? [];
  if (sameName.length) {
    return {
      ...entry,
      status: 'mis-versioned',
      repo: sameName.map((item) => item.file).join(', '),
    };
  }

  return { ...entry, status: 'missing', repo: '—' };
});

const counts = rows.reduce((acc, row) => {
  acc[row.status] = (acc[row.status] ?? 0) + 1;
  return acc;
}, {});

const duplicateVersions = new Map();
for (const item of parsed) {
  if (!item.version) continue;
  const list = duplicateVersions.get(item.version) ?? [];
  list.push(item.file);
  duplicateVersions.set(item.version, list);
}
const collisions = [...duplicateVersions.entries()].filter(([, list]) => list.length > 1);

const lines = [
  '# Production Migration Recovery Manifest — 2026-10-17 through 2026-10-19',
  '',
  'Generated from the checked-in read-only production ledger snapshot. Recovery staging files are intentionally excluded because this script runs before the workflow stages them into `supabase/migrations`.',
  '',
  `- Production ledger rows: **${rows.length}**`,
  `- Exact repository matches: **${counts.exact ?? 0}**`,
  `- Same name / wrong version: **${counts['mis-versioned'] ?? 0}**`,
  `- Missing from normal migration directory: **${counts.missing ?? 0}**`,
  `- Duplicate local migration versions: **${collisions.length}**`,
  '',
  '## Ledger comparison',
  '',
  '| Production version | Production name | Status | Repository file |',
  '|---|---|---|---|',
  ...rows.map((row) => `| ${row.version} | ${row.name} | ${row.status} | ${row.repo.replaceAll('|', '\\|')} |`),
  '',
  '## Duplicate local versions',
  '',
  ...(collisions.length
    ? collisions.map(([version, list]) => `- **${version}** — ${list.join(', ')}`)
    : ['None in the current repository checkout.']),
  '',
  '## Safety boundary',
  '',
  '- This report does not mutate production or migration history.',
  '- A missing row is not automatically safe to replay; SQL must be recovered from the authoritative production ledger and validated in clean replay order.',
  '- A mis-versioned row must be normalized to the production ledger version in recovery CI before considering any repository-history repair.',
  '- Production remains authoritative while the repository history is reconstructed.',
  '',
];

fs.writeFileSync(outputPath, lines.join('\n'));
console.log(JSON.stringify({
  ledgerRows: rows.length,
  exact: counts.exact ?? 0,
  misVersioned: counts['mis-versioned'] ?? 0,
  missing: counts.missing ?? 0,
  duplicateLocalVersions: collisions.length,
  output: outputPath,
}, null, 2));

// The Migration Replay workflow needs one production-ledger migration that is
// absent from the normal source tree. Stage it only after the manifest has been
// generated so the report continues to describe repository history rather than
// recovery working copies. Other callers remain read-only.
if (process.env.GITHUB_WORKFLOW === 'Migration Replay') {
  await import('./stage-event-lifecycle-recovery.mjs');
}
