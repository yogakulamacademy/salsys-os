import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const scanRoots = ['app', 'components', 'lib'];
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);

const forbiddenImports = [
  '@/lib/supabase/admin',
  '@/lib/ga4',
  '@/lib/gsc',
  '@/lib/google-ads',
  '@/lib/meta-ads',
];

const forbiddenSecretTokens = [
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'TRACKING_INGEST_SECRET',
  'WEBSITE_LEAD_CAPTURE_SECRET',
  'META_APP_SECRET',
  'WA_APP_SECRET',
  'CRON_SECRET',
];

function walk(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(absolute));
    } else if (sourceExtensions.has(path.extname(entry.name))) {
      files.push(absolute);
    }
  }
  return files;
}

function isClientModule(source) {
  const head = source.slice(0, 512);
  return /(^|\n)\s*['\"]use client['\"]\s*;/.test(head);
}

const violations = [];

for (const relativeRoot of scanRoots) {
  const absoluteRoot = path.join(root, relativeRoot);
  if (!fs.existsSync(absoluteRoot)) continue;

  for (const file of walk(absoluteRoot)) {
    const source = fs.readFileSync(file, 'utf8');
    if (!isClientModule(source)) continue;

    const relative = path.relative(root, file).replaceAll(path.sep, '/');

    for (const importPath of forbiddenImports) {
      if (source.includes(importPath)) {
        violations.push(`${relative}: client module imports privileged server module ${importPath}`);
      }
    }

    for (const token of forbiddenSecretTokens) {
      if (source.includes(token)) {
        violations.push(`${relative}: client module references server-only secret ${token}`);
      }
    }
  }
}

if (violations.length > 0) {
  throw new Error(`Client/server secret boundary violations:\n${violations.join('\n')}`);
}

const adminModule = fs.readFileSync(path.join(root, 'lib/supabase/admin.ts'), 'utf8');
if (!/^import ['\"]server-only['\"];?/m.test(adminModule)) {
  throw new Error('lib/supabase/admin.ts must remain explicitly server-only.');
}

const metaAdsModule = fs.readFileSync(path.join(root, 'lib/meta-ads.ts'), 'utf8');
if (!/^import ['\"]server-only['\"];?/m.test(metaAdsModule)) {
  throw new Error('lib/meta-ads.ts must remain explicitly server-only.');
}

console.log('Client/server secret boundary contracts verified.');
