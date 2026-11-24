import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const read = (path) => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const action = read('app/signup/actions.ts');
const page = read('app/signup/page.tsx');
const callback = read('app/signup/verify/route.ts');
const sql = read('supabase/drafts/r13_verified_signup.sql');
const middleware = read('middleware.ts');
const login = read('app/actions/auth.ts');

// Source contracts only: this suite does not exercise Supabase or CAPTCHA.
const ordered = (source, first, second) => {
  assert.ok(source.includes(first), first);
  assert.ok(source.includes(second), second);
  assert.ok(source.indexOf(first) < source.indexOf(second), first + ' must precede ' + second);
};

test('signup verifies CAPTCHA and reserves quota before Auth signup', () => {
  ordered(action, 'await verifySignupCaptcha', 'reserve_signup_intent_v1');
  ordered(action, 'reserve_signup_intent_v1', 'supabase.auth.signUp');
  ordered(action, 'if (data.session)', 'accept_signup_intent_v1');
});
test('resend is gated by CAPTCHA and durable reservation', () => {
  const resend = action.slice(action.indexOf('export async function resendSignupVerificationAction'));
  ordered(resend, 'await verifySignupCaptcha', 'reserve_signup_resend_v1');
  ordered(resend, 'reserved === true', 'supabase.auth.resend');
  assert.ok(page.includes('action={resendSignupVerificationAction}'));
  assert.ok(callback.includes('/signup?mode=resend'));
});
test('provisioning requires a server-bound identity', () => {
  assert.ok(sql.includes('where accepted_user_id = p_user_id'));
  assert.ok(sql.includes('v_user.email_confirmed_at is not null'));
  assert.ok(sql.includes('v_user.email_confirmed_at is null'));
  assert.ok(sql.includes('exists (select 1 from public.organization_members where user_id = p_user_id)'));
});
test('registration tables and service RPCs have explicit restrictions', () => {
  for (const name of ['signup_registration_intents', 'signup_resend_attempts', 'signup_usage_counters']) {
    assert.ok(sql.includes(name + ' enable row level security'));
    assert.ok(sql.includes('revoke all on public.' + name + ' from public, anon, authenticated, service_role'));
  }
  for (const name of ['reserve_signup_intent_v1','accept_signup_intent_v1','reserve_signup_resend_v1','provision_verified_signup_v1']) {
    assert.ok(sql.includes('revoke all on function public.' + name));
    assert.ok(sql.includes('grant execute on function public.' + name));
  }
  assert.ok(sql.includes('pg_catalog.pg_advisory_xact_lock'));
});
test('onboarding stays protected and login retries only missing membership', () => {
  const publicPaths = middleware.slice(middleware.indexOf('const PUBLIC_EXACT_PATHS'), middleware.indexOf('const ACTIVE_WORKSPACE_COOKIE'));
  assert.ok(!publicPaths.includes('/signup/onboarding'));
  assert.ok(login.includes("tenant.reason === 'no_membership'"));
  assert.ok(login.includes('provisionVerifiedSignup'));
});

test('signup remains disabled without explicitly approved matching trial policy', () => {
  const availability = read('lib/signup/availability.ts');
  assert.ok(availability.includes("SALSYS_PUBLIC_SIGNUP_ENABLED !== 'true'"));
  assert.ok(availability.includes('signup_trial_available_v1'));
  assert.ok(page.includes('await isPublicSignupAvailable()'));
  assert.ok(read('app/login/page.tsx').includes('await isPublicSignupAvailable()'));
  assert.ok(sql.includes('revoke all on public.signup_trial_policy from public, anon, authenticated, service_role'));
  assert.ok(!sql.includes('insert into public.signup_trial_policy'));
  assert.ok(sql.includes('p.version = t.plan_version'));
  ordered(sql, 'Approved trial policy unavailable', 'v_org := public.provision_customer_organization_v1');
  ordered(sql, 'v_org := public.provision_customer_organization_v1', 'insert into public.saas_organization_subscriptions');
  assert.ok(sql.includes('where organization_id = v_org'));
  assert.ok(sql.includes('workspace_code = any(v_policy.allowed_workspace_codes)'));
});

test('14-day Pro trial has an approved permanent Free fallback and no automatic billing', () => {
  assert.ok(sql.includes('check (trial_days = 14)'));
  assert.ok(sql.includes("p.code = 'pro'"));
  assert.ok(sql.includes("fp.code = 'free'"));
  assert.ok(sql.includes("interval '336 hours'"));
  assert.ok(sql.includes('free_workspace_codes <@ allowed_workspace_codes'));
  assert.ok(sql.includes('convert_expired_signup_trial_v1'));
  assert.ok(sql.includes("and source = 'manual'"));
  assert.ok(sql.includes("and status = 'trialing'"));
  assert.ok(sql.includes("trial_converted_at is not null"));
  assert.ok(!sql.includes('delete from public.organizations'));
  assert.ok(page.includes('Free forever, with 14 days of Pro trial access'));
});

test('trial expiry cron is secret-protected and separately release-gated', () => {
  const cron = read('app/api/commercial/trial-expiry/route.ts');
  ordered(cron, 'bearerMatchesAnySecret(request.headers', 'SALSYS_TRIAL_RECONCILIATION_ENABLED');
  ordered(cron, 'SALSYS_TRIAL_RECONCILIATION_ENABLED', "rpc('reconcile_expired_signup_trials_v1'");
  assert.ok(sql.includes('for update of i skip locked'));
  assert.ok(sql.includes('p_limit > 100'));
  assert.ok(sql.includes('trial_conversion_retry_at'));
  assert.ok(JSON.parse(read('vercel.json')).crons.some(c => c.path === '/api/commercial/trial-expiry' && c.schedule === '*/5 * * * *'));
  assert.ok(middleware.includes('"/api/commercial/trial-expiry"'));
});

test('current plan projection is session-bound, expiry-aware and does not elevate workspace access', () => {
  assert.ok(sql.includes('v_context := public.get_current_workspace_context_v1()'));
  assert.ok(sql.includes('where organization_id = v_org'));
  assert.ok(sql.includes('if clock_timestamp() < v_intent.trial_ends_at'));
  assert.ok(sql.includes("'free_pending_reconciliation'"));
  assert.ok(sql.includes('grant execute on function public.get_current_signup_plan_v1() to authenticated'));
  const access = read('lib/workspace-access.ts');
  assert.ok(access.includes('filter(code => !plan || signupPlanAllowsWorkspace(plan, code))'));
  assert.ok(access.includes("plan?.state === 'unavailable'"));
  assert.ok(read('components/root-shell.tsx').includes("pathname.startsWith('/signup/')"));
  assert.ok(read('app/dashboard/page.tsx').includes('<SignupPlanBanner />'));
});

test('signup quotas use approved snapshots and transactional row guards', () => {
  assert.ok(sql.includes('free_named_users between 1 and pro_named_users'));
  assert.ok(sql.includes('free_lead_records between 1 and pro_lead_records'));
  assert.ok(sql.includes('where organization_id=p_org for update'));
  assert.ok(sql.includes('if v_used >= v_limit'));
  assert.ok(sql.includes('after insert or update or delete on public.leads'));
  assert.ok(sql.includes('after insert or update or delete on public.organization_members'));
  assert.ok(sql.includes('revoke all on function public.adjust_signup_usage_internal_v1'));
  assert.ok(sql.includes('revoke all on function public.resolve_signup_plan_internal_v1'));
  assert.ok(sql.includes("if p_delta = 1 then"));
});

test('commercial eligibility intersects existing capability authorization and does not grant capabilities', () => {
  assert.ok(sql.includes('public.session_is_bound_to_organization(p_organization_id)'));
  assert.ok(sql.includes('public.is_organization_member(p_organization_id)'));
  assert.ok(sql.includes('and oc.enabled'));
  assert.ok(sql.includes('and public.signup_capability_allowed_internal_v1'));
  assert.ok(sql.includes('from public.saas_plan_entitlements'));
  assert.ok(sql.includes('revoke all on function public.signup_capability_allowed_internal_v1'));
});
test('self-service automation stays blocked before provider send or claim', () => {
  assert.ok(sql.includes('grant execute on function public.signup_automation_allowed_v1(uuid,text) to service_role'));
  assert.ok(sql.includes('and not exists(select 1 from public.signup_registration_intents where organization_id=p_organization_id)'));
  const whatsapp = read('lib/automation/whatsapp-broadcast-runner.ts');
  const instagram = read('lib/automation/instagram-operations.ts');
  ordered(whatsapp, "commercialAutomationAllowed(organizationId, 'whatsapp')", "'prepare_whatsapp_broadcast_provider_send_v1'");
  ordered(instagram, "commercialAutomationAllowed(organizationId, 'instagram')", "'claim_instagram_automation_run_v1'");
  const guard = read('lib/commercial/automation-access.ts');
  assert.ok(guard.includes("rpc('signup_automation_allowed_v1'"));
  assert.ok(guard.includes('return !error && data === true'));
});

test('provider runtime operations require approved integration eligibility', () => {
  assert.ok(sql.includes("pro_integration_codes text[] not null default '{}'"));
  assert.ok(sql.includes('free_integration_codes <@ pro_integration_codes'));
  assert.ok(sql.includes('trial_integration_codes = v_policy.pro_integration_codes'));
  assert.ok(sql.includes('grant execute on function public.signup_integration_allowed_v1(uuid,text) to service_role'));
  const guard = read('lib/commercial/integration-access.ts');
  assert.ok(guard.includes("rpc('signup_integration_allowed_v1'"));
  assert.ok(guard.includes('if (error || data !== true) throw'));
  const checks = [
    ['lib/integrations/instagram-connection.ts', 'await requireCommercialIntegration(resolvedOrganizationId, "instagram")', '.from("integration_connections")'],
    ['lib/integrations/whatsapp-connection.ts', "await requireCommercialIntegration(resolvedOrganizationId, 'whatsapp')", 'await loadConfiguredRuntime('],
    ['lib/ga4.ts', "await requireCommercialIntegration(resolvedRuntime.organizationId, 'ga4')", 'await getGoogleAccessTokenForOrganizationConnection('],
    ['lib/gsc.ts', "await requireCommercialIntegration(resolvedRuntime.organizationId, 'gsc')", 'await getGoogleAccessTokenForOrganizationConnection('],
    ['lib/google-ads.ts', "await requireCommercialIntegration(resolvedRuntime.organizationId, 'google_ads')", 'await getGoogleAccessTokenForOrganizationConnection('],
    ['lib/meta-ads.ts', "await requireCommercialIntegration(organizationId, 'meta_ads')", 'await getMetaAccessTokenForSyncContext('],
  ];
  for (const [path, first, second] of checks) {
    const source = read(path);
    const entry = source.indexOf(first);
    assert.ok(entry >= 0, path);
    ordered(source.slice(entry), first, second);
  }
});
