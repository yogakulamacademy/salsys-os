import Link from 'next/link';
import { Mail, Sparkles } from 'lucide-react';
import { requestPasswordResetAction } from '@/app/actions/auth';
import { useMockData } from '@/lib/config';

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-card sm:p-9">
        <div className="mb-7 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-brand font-black text-white">
            S
          </div>
          <div>
            <div className="font-bold text-slate-950">SalsysOS</div>
            <div className="text-sm text-slate-400">Password recovery</div>
          </div>
        </div>

        <div className="mb-6">
          <div className="eyebrow">Account recovery</div>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">
            Reset your password
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Enter your account email and we&apos;ll send you a secure reset link.
          </p>
        </div>

        {params.notice && (
          <div className="mb-5 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            {params.notice}
          </div>
        )}

        {params.error && (
          <div className="mb-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {params.error}
          </div>
        )}

        {useMockData && (
          <div className="mb-5 flex gap-2 rounded-xl border border-orange-100 bg-orange-50 p-3 text-sm text-orange-700">
            <Sparkles size={17} className="mt-0.5 shrink-0" />
            <span>Password reset email delivery is disabled in mock mode.</span>
          </div>
        )}

        <form action={requestPasswordResetAction} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">
              Email
            </span>
            <input
              className="input"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@company.com"
            />
          </label>

          <button className="btn-primary w-full" type="submit">
            <Mail size={16} /> Send reset link
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-500">
          <Link href="/login" className="font-semibold text-brand hover:underline">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
