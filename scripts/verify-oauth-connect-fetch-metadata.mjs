import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const helperPath = path.join(root, 'lib/security/fetch-metadata.ts');
const routePaths = [
  'app/api/integrations/google/connect/route.ts',
  'app/api/integrations/meta/connect/route.ts',
  'app/api/integrations/instagram/connect/route.ts',
];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const helper = fs.readFileSync(helperPath, 'utf8');
if (!helper.includes("headers.get('sec-fetch-site')")) {
  throw new Error('Fetch Metadata helper must read Sec-Fetch-Site.');
}
if (!helper.includes("=== 'cross-site'")) {
  throw new Error('Fetch Metadata helper must reject only explicit cross-site requests.');
}

for (const routePath of routePaths) {
  const source = read(routePath);
  if (!source.includes("@/lib/security/fetch-metadata")) {
    throw new Error(`${routePath} must import the Fetch Metadata helper.`);
  }

  const getStart = source.indexOf('export async function GET');
  const guard = source.indexOf('isExplicitCrossSiteRequest(request)', getStart);
  const auth = source.indexOf('supabase.auth.getUser()', getStart);
  const stateCreation = source.indexOf('createOAuthState()', getStart);

  if (getStart < 0 || guard < 0 || auth < 0 || stateCreation < 0) {
    throw new Error(`${routePath} is missing the expected OAuth connect contract.`);
  }
  if (!(guard < auth && guard < stateCreation)) {
    throw new Error(`${routePath} must reject explicit cross-site requests before auth/state creation.`);
  }
  if (!source.includes("status: 403")) {
    throw new Error(`${routePath} must return 403 for explicit cross-site OAuth initiation.`);
  }
}

console.log('OAuth connect Fetch Metadata contracts verified.');
