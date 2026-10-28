import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function requireText(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`Authenticated production E2E contract failed: missing ${label} (${needle})`);
  }
}

function forbidText(source, needle, label) {
  if (source.includes(needle)) {
    throw new Error(`Authenticated production E2E contract failed: forbidden ${label} (${needle})`);
  }
}

const workflow = read('.github/workflows/authenticated-production-e2e.yml');
const spec = read('scripts/verify-authenticated-production-e2e.spec.mjs');
const packageJson = read('package.json');
const ci = read('.github/workflows/ci.yml');

requireText(workflow, 'workflow_dispatch:', 'manual workflow dispatch');
forbidText(workflow, '\n  push:', 'automatic push trigger');
forbidText(workflow, '\n  pull_request:', 'automatic pull-request trigger');
forbidText(workflow, '\n  schedule:', 'automatic schedule trigger');

requireText(workflow, '@playwright/test@1.51.1', 'pinned Playwright runner');
requireText(workflow, 'https://crm.salsysos.com', 'production base URL');
requireText(workflow, '${{ secrets.SALSYSOS_E2E_EMAIL }}', 'dedicated E2E email secret');
requireText(workflow, '${{ secrets.SALSYSOS_E2E_PASSWORD }}', 'dedicated E2E password secret');
requireText(workflow, '${{ secrets.SALSYSOS_E2E_ORGANIZATION_ID }}', 'expected E2E organization secret');
requireText(workflow, '--workers=1', 'single-worker tenant smoke');

requireText(spec, "input[name=\"email\"]", 'email form selector');
requireText(spec, "input[name=\"password\"]", 'password form selector');
requireText(spec, "getByRole('button', { name: 'Sign in' })", 'real login submission');
requireText(spec, "url.pathname === '/dashboard'", 'dashboard redirect assertion');
forbidText(spec, "'My admissions workspace'", 'role-specific admissions dashboard marker');
requireText(spec, "'salsys-active-workspace'", 'tenant workspace cookie assertion');
requireText(spec, "SALSYSOS_E2E_ORGANIZATION_ID", 'expected tenant environment binding');
requireText(spec, 'workspaceCookie?.value).toBe(expectedOrganizationId)', 'exact tenant cookie match');
requireText(spec, 'workspaceCookie?.httpOnly).toBe(true)', 'HttpOnly cookie assertion');
requireText(spec, 'workspaceCookie?.secure).toBe(true)', 'Secure cookie assertion');
requireText(spec, "screenshot: 'off'", 'disabled screenshots');
requireText(spec, "trace: 'off'", 'disabled traces');
requireText(spec, "video: 'off'", 'disabled video');

for (const suspicious of [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  /password\s*=\s*['"][^'"]+['"]/i,
]) {
  if (suspicious.test(spec)) {
    throw new Error('Authenticated production E2E contract failed: browser spec appears to contain a hardcoded credential.');
  }
}

requireText(packageJson, 'verify:authenticated-production-e2e-contract', 'package verifier script');
requireText(ci, 'npm run verify:authenticated-production-e2e-contract', 'CI verifier step');

console.log('Authenticated production E2E foundation contract verified.');
