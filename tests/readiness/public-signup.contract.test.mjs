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
  for (const name of ['signup_registration_intents', 'signup_resend_attempts']) {
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
