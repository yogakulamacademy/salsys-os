import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    console.error(`[onboarding-foundation] FAIL: ${message}`);
    process.exitCode = 1;
  }
}

function contains(source, fragment, message) {
  assert(source.includes(fragment), message);
}

const provisioningAction = read('app/settings/organizations/actions.ts');
const authAction = read('app/actions/auth.ts');
const middleware = read('middleware.ts');
const securityAction = read('app/onboarding/security/actions.ts');
const securityPage = read('app/onboarding/security/page.tsx');
const websiteSkipAction = read('app/onboarding/website/skip-action.ts');
const finishCompletionAction = read('app/onboarding/finish/complete-action.ts');
const homeRecommendations = read('components/home-setup-recommendations.tsx');
const rootShell = read('components/root-shell.tsx');
const provisioningMigration = read(
  'supabase/migrations/20261023184246_customer_organization_provisioning_v1.sql',
);

// Customer provisioning must create a secure first-login state and roll back
// the Auth identity when tenant provisioning fails.
contains(
  provisioningAction,
  'require_password_change: true',
  'Provisioned owners must be marked for password replacement.',
);
contains(
  provisioningAction,
  'provisioned_customer_owner: true',
  'Provisioned customer-owner identity marker is missing.',
);
contains(
  provisioningAction,
  'await admin.auth.admin.deleteUser(ownerUserId)',
  'Failed tenant provisioning must roll back the created Auth user.',
);

// Sign-in must prioritize account security before business onboarding.
const signInSecurityIndex = authAction.indexOf(
  "signInData.user.app_metadata?.require_password_change === true",
);
const signInOnboardingIndex = authAction.indexOf(
  'shouldEnterRequiredOnboarding(supabase, tenant.organizationId)',
);
assert(signInSecurityIndex >= 0, 'Sign-in password-replacement gate is missing.');
assert(signInOnboardingIndex >= 0, 'Required onboarding sign-in gate is missing.');
assert(
  signInSecurityIndex < signInOnboardingIndex,
  'Password replacement must run before required onboarding at sign-in.',
);
contains(
  authAction,
  "redirect('/onboarding/security')",
  'Provisioned owners must be routed to the security step.',
);

// Middleware must prevent manual page-navigation bypass while leaving APIs on
// their existing authorization path.
const middlewareSecurityIndex = middleware.indexOf(
  'user.app_metadata?.require_password_change === true',
);
const middlewareOnboardingIndex = middleware.indexOf(
  '.from("organization_onboarding")',
);
assert(middlewareSecurityIndex >= 0, 'Session-level password gate is missing.');
assert(middlewareOnboardingIndex >= 0, 'Session-level onboarding gate is missing.');
assert(
  middlewareSecurityIndex < middlewareOnboardingIndex,
  'Session-level password gate must run before onboarding enforcement.',
);
contains(
  middleware,
  '!pathname.startsWith("/api/")',
  'Onboarding/security UX gates must not redirect API requests.',
);
contains(
  middleware,
  'pathname !== "/onboarding/security"',
  'Security page must be reachable while password replacement is required.',
);
contains(
  middleware,
  'onboarding?.enforce_on_sign_in === true',
  'Required onboarding must remain explicitly opt-in per organization.',
);

// Password replacement must verify the current credential, update through
// Supabase Auth, and clear only admin-owned app metadata afterward.
contains(
  securityAction,
  'current_password: currentPassword',
  'Password replacement must verify the current password.',
);
contains(
  securityAction,
  'await supabase.auth.updateUser',
  'Password replacement must use Supabase Auth.',
);
contains(
  securityAction,
  'admin.auth.admin.updateUserById',
  'Only the trusted admin client may clear the app-metadata gate.',
);
contains(
  securityAction,
  'require_password_change: false',
  'Successful password replacement must clear the provisioning gate.',
);
contains(
  securityPage,
  'Current temporary password',
  'Security UI must collect the current temporary password.',
);
contains(
  securityPage,
  'minLength={12}',
  'Security UI must enforce the 12-character minimum.',
);

// Business + Goals are the only hard onboarding requirements. Website,
// channels and team may be skipped, but skipping must never falsely mark them
// complete.
contains(
  websiteSkipAction,
  "current_step: 'channels'",
  'Skipping website setup must advance to Channels.',
);
assert(
  !websiteSkipAction.includes("completed_steps"),
  'Skipping website setup must not falsely mark Website complete.',
);
contains(
  finishCompletionAction,
  "const requiredSteps = ['business', 'goals'];",
  'Core onboarding requirements must remain Business + Goals.',
);
contains(
  finishCompletionAction,
  "status: 'completed'",
  'Onboarding completion write is missing.',
);
contains(
  finishCompletionAction,
  'completed_at:',
  'Onboarding completion timestamp is missing.',
);

// After onboarding, unfinished recommendations must be driven by live tenant
// evidence and must not appear on legacy tenants that never completed this flow.
contains(
  homeRecommendations,
  "onboarding?.status !== 'completed'",
  'Home setup recommendations must be limited to completed new-onboarding tenants.',
);
contains(
  homeRecommendations,
  "source.healthStatus === 'healthy'",
  'Website recommendation must use live tracking health evidence.',
);
contains(
  homeRecommendations,
  "href: '/settings/integrations'",
  'Channel setup recommendation is missing.',
);
contains(
  homeRecommendations,
  "href: '/settings/team'",
  'Team setup recommendation is missing.',
);
contains(
  homeRecommendations,
  "href: '/automation/recipes'",
  'First automation recommendation is missing.',
);

// Onboarding stays focused and shellless.
contains(
  rootShell,
  "pathname.startsWith('/onboarding/')",
  'Nested onboarding routes must remain shellless.',
);

// Provisioning RPC must create enforced onboarding atomically and remain
// service-role only.
contains(
  provisioningMigration,
  'provision_customer_organization_v1',
  'Customer organization provisioning RPC is missing.',
);
contains(
  provisioningMigration,
  'enforce_on_sign_in',
  'Provisioning RPC must create enforced onboarding state.',
);
contains(
  provisioningMigration,
  'grant execute',
  'Provisioning RPC service-role grant is missing.',
);
contains(
  provisioningMigration,
  'service_role',
  'Provisioning RPC must remain service-role controlled.',
);

if (!process.exitCode) {
  console.log(
    '[onboarding-foundation] PASS: provisioning, first-login security, optional setup, live recommendations and completion contracts verified.',
  );
}
