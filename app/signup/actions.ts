'use server';

import { randomUUID } from 'node:crypto';
import { verifySignupCaptcha } from '@/lib/signup/captcha';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { useMockData } from '@/lib/config';

export async function signupAction(formData: FormData) {
  if (useMockData || process.env.SALSYS_PUBLIC_SIGNUP_ENABLED !== 'true') {
    redirect('/signup?error=Registration+is+not+open.');
  }

  const fullName = String(formData.get('full_name') ?? '').trim();
  const businessName = String(formData.get('business_name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  if (fullName.length < 2 || fullName.length > 180 ||
      businessName.length < 2 || businessName.length > 180 ||
      email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      password.length < 12 || password.length > 128) {
    redirect('/signup?error=Check+your+details.+Use+at+least+12+password+characters.');
  }

  const captchaToken = String(formData.get('cf-turnstile-response') ?? '');
  if (!await verifySignupCaptcha(captchaToken)) {
    redirect('/signup?error=Security+verification+failed.+Please+try+again.');
  }

  const intentId = randomUUID();
  const admin = createAdminClient();
  const { data: reserved, error: intentError } = await admin.rpc('reserve_signup_intent_v1', {
    p_id: intentId, p_email: email, p_full_name: fullName, p_business_name: businessName,
  });
  if (intentError) redirect('/signup?error=Registration+is+temporarily+unavailable.');
  if (reserved !== true) redirect('/signup?error=Registration+limit+reached.+Please+try+again+later.');

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: 'https://salsysos.com/signup/verify',
      data: { signup_intent_id: intentId },
    },
  });

  // Never provision a workspace from unverified identities or user metadata.
  // A session here indicates unexpected auto-confirm configuration: fail closed.
  if (data.session) {
    await supabase.auth.signOut();
    redirect('/signup?error=Registration+is+temporarily+unavailable.');
  }
  if (error && error.status !== 422) {
    redirect('/signup?error=Unable+to+register.+Please+try+again+later.');
  }

  if (!error && data.user && !data.user.email_confirmed_at &&
      data.user.identities?.length) {
    const { data: accepted, error: acceptError } = await admin.rpc('accept_signup_intent_v1', {
      p_id: intentId, p_user_id: data.user.id,
    });
    if (acceptError || accepted !== true) {
      // Keep the public response neutral; never imply that an unbound identity
      // is provisionable. A support investigation may be required.
      console.warn('Signup identity acceptance incomplete');
    }
  }

  // Use a generic response for duplicate accounts to limit enumeration.
  redirect('/signup?notice=Check+your+email+for+verification+instructions.+If+you+already+have+an+account,+sign+in.');
}

export async function resendSignupVerificationAction(formData: FormData) {
  if (useMockData || process.env.SALSYS_PUBLIC_SIGNUP_ENABLED !== 'true') {
    redirect('/signup?error=Registration+is+not+open.');
  }
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const captchaToken = String(formData.get('cf-turnstile-response') ?? '');
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !await verifySignupCaptcha(captchaToken)) {
    redirect('/signup?mode=resend&error=Check+your+email+and+security+verification.');
  }
  const admin = createAdminClient();
  const { data: reserved, error } = await admin.rpc('reserve_signup_resend_v1', {
    p_email: email,
  });
  if (!error && reserved === true) {
    const supabase = await createClient();
    await supabase.auth.resend({
      type: 'signup', email,
      options: { emailRedirectTo: 'https://salsysos.com/signup/verify' },
    });
  }
  redirect('/signup?mode=resend&notice=If+an+eligible+registration+exists,+a+verification+email+may+be+sent.+If+already+verified,+sign+in.');
}
