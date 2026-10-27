const baseUrl = (process.env.SALSYSOS_SMOKE_BASE_URL || 'https://crm.salsysos.com').replace(/\/$/, '');
const timeoutMs = Number(process.env.SALSYSOS_SMOKE_TIMEOUT_MS || 12000);
const maxAttempts = Number(process.env.SALSYSOS_SMOKE_ATTEMPTS || 3);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(path) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${baseUrl}${path}`, {
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'user-agent': 'SalsysOS-Production-Smoke/1.0',
          accept: 'text/html,application/xhtml+xml',
        },
      });
      const body = await response.text();
      clearTimeout(timeout);

      if (response.status >= 500 && attempt < maxAttempts) {
        lastError = new Error(`${path} returned ${response.status}`);
        await sleep(750 * attempt);
        continue;
      }

      return { response, body };
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (attempt < maxAttempts) {
        await sleep(750 * attempt);
        continue;
      }
    }
  }

  throw lastError || new Error(`Unable to fetch ${path}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function includesAll(body, fragments) {
  return fragments.every((fragment) => body.includes(fragment));
}

async function runCheck(name, path, verify) {
  const startedAt = Date.now();
  const result = await fetchWithRetry(path);
  verify(result);
  const durationMs = Date.now() - startedAt;
  console.log(`PASS ${name} (${durationMs}ms)`);
}

const checks = [
  {
    name: 'login page is available and secure headers are present',
    path: '/login',
    verify: ({ response, body }) => {
      assert(response.status === 200, `/login expected 200, got ${response.status}`);
      assert(includesAll(body, ['SalsysOS', 'Sign in', 'Secure account access']), '/login missing expected sign-in content');
      const hsts = response.headers.get('strict-transport-security') || '';
      assert(hsts.toLowerCase().includes('max-age='), '/login missing Strict-Transport-Security');
    },
  },
  {
    name: 'recovery confirmation fails closed without a token',
    path: '/auth/recovery-confirm',
    verify: ({ response, body }) => {
      assert(response.status === 200, `/auth/recovery-confirm expected 200, got ${response.status}`);
      assert(
        body.includes('This password reset link is incomplete. Request a new reset email.'),
        '/auth/recovery-confirm did not show the fail-closed incomplete-link state',
      );
    },
  },
  {
    name: 'reset password surface remains available without mutating state',
    path: '/reset-password',
    verify: ({ response, body }) => {
      assert(response.status === 200, `/reset-password expected 200, got ${response.status}`);
      assert(includesAll(body, ['Choose a new password', 'Update password']), '/reset-password missing expected recovery UI');
    },
  },
  {
    name: 'protected workspace resolves to sign-in when unauthenticated',
    path: '/workspace',
    verify: ({ response, body }) => {
      assert(response.status === 200, `/workspace unauthenticated flow expected final 200, got ${response.status}`);
      const finalUrl = new URL(response.url);
      const redirectedToLogin = finalUrl.pathname === '/login';
      const renderedLogin = includesAll(body, ['Secure account access', 'Sign in']);
      assert(redirectedToLogin || renderedLogin, `/workspace did not resolve to the unauthenticated login gate (final URL: ${response.url})`);
    },
  },
];

console.log(`SalsysOS production smoke target: ${baseUrl}`);

let failures = 0;
for (const check of checks) {
  try {
    await runCheck(check.name, check.path, check.verify);
  } catch (error) {
    failures += 1;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FAIL ${check.name}: ${message}`);
  }
}

if (failures > 0) {
  console.error(`Production smoke failed: ${failures}/${checks.length} checks failed.`);
  process.exit(1);
}

console.log(`Production smoke passed: ${checks.length}/${checks.length} checks.`);
