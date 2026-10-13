import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { KeyRound } from 'lucide-react';
import { updatePasswordAction } from '@/app/actions/auth';
import { createClient } from '@/lib/supabase/server';

const PASSWORD_RECOVERY_COOKIE = 'salsys-password-recovery';

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const cookieStore = await cookies();

  if (cookieStore.get(PASSWORD_RECOVERY_COOKIE)?.value !== '1') {
    redirect(
      '/forgot-password?error=Start%20a%20new%20password%20reset%20request%20before%20setting%20a%20new%20password.',
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    cookieStore.delete(PASSWORD_RECOVERY_COOKIE);
    redirect(
      '/forgot-password?error=Your%20password%20reset%20link%20is%20invalid%20or%20expired.%20Request%20a%20new%20one.',
    );
  }

  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-card sm:p-9">
        <div className="mb-7 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-brand font-black text-white">
            S
          </div>
          <div>
            <div className="font-bold text-slate-950">SalsysOS</div>
            <div className="text-sm text-slate-400">Secure password reset</div>
          </div>
        </div>

        <div className="mb-6">
          <div className="eyebrow">Account recovery</div>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">
            Set a new password
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Use at least 10 characters. Your reset session will end after the
            password is changed.
          </p>
        </div>

        {params.error && (
          <div className="mb-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {params.error}
          </div>
        )}

        <form action={updatePasswordAction} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">
              New password
            </span>
            <input
              className="input"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={10}
              required
              placeholder="At least 10 characters"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">
              Confirm new password
            </span>
            <input
              className="input"
              name="confirm_password"
              type="password"
              autoComplete="new-password"
              minLength={10}
              required
              placeholder="Repeat your new password"
            />
          </label>

          <button className="btn-primary w-full" type="submit">
            <KeyRound size={16} /> Update password
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-500">
          <Link href="/forgot-password" className="font-semibold text-brand hover:underline">
            Request a new reset link
          </Link>
        </div>
      </div>
    </div>
  );
}
