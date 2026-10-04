'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { useMockData } from '@/lib/config';
import { ACTIVE_WORKSPACE_COOKIE } from '@/lib/workspace';

export async function signInAction(formData: FormData) {
  if (useMockData) redirect('/dashboard');

  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '/dashboard');

  if (!email || !password) redirect('/login?error=Enter%20your%20email%20and%20password');

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect('/login?error=Invalid%20email%20or%20password');

  redirect(next.startsWith('/') ? next : '/dashboard');
}

export async function signOutAction() {
  if (!useMockData) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }

  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_WORKSPACE_COOKIE);

  redirect('/login');
}
