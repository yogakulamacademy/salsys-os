import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    console.error(`[platform-onboarding-final-closeout] FAIL: ${message}`);
    process.exitCode = 1;
  }
}

function contains(source, fragment, message) {
  assert(source.includes(fragment), message);
}

function excludes(source, fragment, message) {
  assert(!source.includes(fragment), message);
}

const access = read('lib/platform-admin-access.ts');
const page = read('app/settings/organizations/page.tsx');
const action = read('app/settings/organizations/actions.ts');
const middleware = read('middleware.ts');
const securityAction = read('app/onboarding/security/actions.ts');
const provisioningMigration = read(
  'supabase/migrations/20261023184246_customer_organization_provisioning_v1.sql',
);

// Platform-wide tenant registry reads and writes must share one exact authority
// boundary: active SalsysOS workspace, Owner/Admin membership, active profile.
contains(access, "active.organizationSlug !== 'salsysos'", 'Platform administration must be bound to the SalsysOS tenant.');
contains(access, "!['owner', 'admin'].includes(active.role)", 'Platform administration must be limited to Owner/Admin roles.');
contains(access, "profile.active !== true", 'Inactive platform profiles must be rejected.');
contains(page, "requirePlatformAdminAccess", 'Customer Organizations page must use the shared platform-admin guard.');
contains(action, "requirePlatformAdminAccess", 'Customer provisioning action must use the shared platform-admin guard.');
excludes(page, 'async function requirePlatformAdmin()', 'Page must not carry a second copy of platform authorization logic.');
excludes(action, 'async function requirePlatformAdmin()', 'Provisioning action must not carry a second copy of platform authorization logic.');

// The database portion of provisioning must remain one service-role-only
// transaction that creates owner membership, workspaces, and enforced onboarding.
for (const [fragment, message] of [
  ["if auth.role() <> 'service_role'", 'Provisioning RPC must require service role.'],
  ['insert into public.organizations', 'Provisioning RPC must create the tenant.'],
  ['insert into public.organization_members', 'Provisioning RPC must create the owner membership.'],
  ['insert into public.organization_workspaces', 'Provisioning RPC must create enabled workspaces.'],
  ['insert into public.organization_onboarding', 'Provisioning RPC must create onboarding state.'],
  ['enforce_on_sign_in', 'New customer onboarding must remain explicitly enforced.'],
  ['from public, anon, authenticated;', 'Direct public/authenticated provisioning execution must remain revoked.'],
  ['to service_role;', 'Provisioning execution must remain service-role only.'],
]) {
  contains(provisioningMigration, fragment, message);
}

// Auth is an external system, so failed tenant provisioning uses compensation.
// Never claim that compensation succeeded unless the Auth delete itself succeeded.
contains(action, 'const { error: rollbackError } = await admin.auth.admin.deleteUser(ownerUserId);', 'Provisioning must inspect Auth cleanup success.');
contains(action, 'if (rollbackError)', 'Auth cleanup failure must have an explicit fail-closed branch.');
contains(action, 'could not verify removal of the temporary owner login', 'Cleanup failure must be reported truthfully.');
contains(action, 'Do not retry this email until a platform administrator removes the orphaned Auth identity.', 'Cleanup failure must prevent blind provisioning retry.');
contains(action, 'Owner login was removed because the customer workspace could not be provisioned', 'Successful compensation must be reported separately.');
excludes(action, 'Owner login was rolled back because', 'Provisioning must not make an unverified rollback claim.');

// First-login password replacement stays ahead of required onboarding.
const passwordGateIndex = middleware.indexOf(
  'user.app_metadata?.require_password_change === true',
);
const onboardingGateIndex = middleware.indexOf(
  '.from("organization_onboarding")',
);
assert(passwordGateIndex >= 0, 'Forced password replacement middleware gate is missing.');
assert(onboardingGateIndex >= 0, 'Required onboarding middleware gate is missing.');
assert(passwordGateIndex < onboardingGateIndex, 'Password replacement must remain ahead of onboarding enforcement.');
contains(securityAction, 'require_password_change: false', 'Only successful password replacement may clear the first-login security gate.');

// Required onboarding must fail closed when its authority cannot be checked.
// A successful null row remains the explicit legacy/not-enrolled case.
contains(middleware, 'Critical auth, workspace, and required-onboarding checks fail closed.', 'Middleware contract must describe required onboarding as fail closed.');
contains(middleware, 'if (onboardingError)', 'Onboarding read errors must be handled explicitly.');
contains(middleware, 'return workspaceServiceUnavailable(pathname);', 'Required onboarding failures must use the existing private 503 boundary.');
contains(middleware, 'Middleware required onboarding lookup unavailable', 'Required onboarding dependency failures must be observable.');
excludes(middleware, 'Middleware onboarding lookup skipped', 'Middleware must not silently skip a failed required-onboarding lookup.');
excludes(middleware, 'if (!onboarding) {\n        return workspaceServiceUnavailable', 'A successful missing onboarding row must remain compatible with legacy tenants.');

if (!process.exitCode) {
  console.log('[platform-onboarding-final-closeout] PASS: platform authority, provisioning compensation, first-login security, and fail-closed onboarding contracts verified.');
}
