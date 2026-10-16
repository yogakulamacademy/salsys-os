import Link from 'next/link';
import { Mail, ShieldCheck } from 'lucide-react';

import { requestPasswordResetAction } from '@/app/actions/auth';

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const query = await searchParams;

  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-card sm:p-9">
        <div className="mb-7 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-brand font-black text-white">
            S
          </div>
          <div>
            <div className="font-bold text-slate-950">SalsysOS</div>
            <div className="text-sm text-slate-400">Secure account recovery</div>
          </div>
        </div>

        <div className="mb-6">
          <div className="eyebrow">Password recovery</div>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">
            Reset your password
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            Enter the email address used for your SalsysOS account. Your
            organization will be securely resolved from your authenticated
            account after you verify the recovery link.
          </p>
        </div>

        {query.notice && (
          <div className="mb-5 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            {query.notice}
          </div>
        )}

        {query.error && (
          <div className="mb-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {query.error}
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
            <Mail size={16} /> Send secure reset link
          </button>
        </form>

        <div className="mt-5 flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-500">
          <ShieldCheck size={16} className="mt-0.5 shrink-0" />
          <span>
            For privacy, SalsysOS shows the same confirmation whether or not an
            account exists for the email entered.
          </span>
        </div>

        <Link
          className="mt-5 block text-center text-sm font-semibold text-brand hover:underline"
          href="/login"
        >
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
