'use server';

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

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: 'https://salsysos.com/signup/verify',
      data: { full_name: fullName, signup_business_name: businessName },
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

  // Use a generic response for duplicate accounts to limit enumeration.
  redirect('/signup?notice=Check+your+email+for+verification+instructions.+If+you+already+have+an+account,+sign+in.');
}
