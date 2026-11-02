import { BrandMark } from "@/components/brand";
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
    <div className="grid min-h-screen place-items-center bg-mist px-4 py-10">
      <div className="w-full max-w-md rounded-[20px] border border-line bg-surface p-7 shadow-panel sm:p-9">
        <div className="mb-7 flex items-center gap-3">
          <BrandMark size="large" />
          <div>
            <div className="text-[15px] font-semibold text-copy-strong">SalsysOS</div>
            <div className="mt-0.5 text-[12px] text-copy-muted">Secure account recovery</div>
          </div>
        </div>

        <div className="mb-6">
          <div className="ui-page-kicker">Password recovery</div>
          <h1 className="mt-1.5 text-[26px] font-semibold tracking-[-0.035em] text-copy-strong">Reset your password</h1>
          <p className="mt-2 text-[14px] leading-6 text-copy-muted">
            Enter the email address used for your SalsysOS account. Your organization will be securely resolved from your authenticated account after you verify the recovery link.
          </p>
        </div>

        {query.notice && <div className="mb-5 rounded-ui border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] font-medium text-emerald-700">{query.notice}</div>}
        {query.error && <div className="mb-5 rounded-ui border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-medium text-red-700">{query.error}</div>}

        <form action={requestPasswordResetAction} className="space-y-4">
          <label className="block">
            <span className="field-label block">Email</span>
            <input className="input w-full" name="email" type="email" autoComplete="email" required placeholder="you@company.com" />
          </label>

          <button className="btn-primary w-full" type="submit">
            <Mail size={16} /> Send secure reset link
          </button>
        </form>

        <div className="mt-5 flex items-start gap-2 rounded-ui border border-line bg-surface-soft px-3.5 py-3 text-[12px] leading-5 text-copy-muted">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-brand-700" />
          <span>For privacy, SalsysOS shows the same confirmation whether or not an account exists for the email entered.</span>
        </div>

        <Link className="mt-5 block text-center text-[13px] font-semibold text-brand-700 hover:underline" href="/login">Back to sign in</Link>
      </div>
    </div>
  );
}
