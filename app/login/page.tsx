import { BrandIdentity, BrandMark } from "@/components/brand";
import Link from 'next/link';
import { LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react';

import { signInAction } from '@/app/actions/auth';
import { useMockData } from '@/lib/config';
import { SALSYSOS_VERSION_LABEL } from '@/lib/product-version';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    notice?: string;
    next?: string;
  }>;
}) {
  const params = await searchParams;

  return (
    <div className="grid min-h-screen place-items-center bg-mist px-4 py-10">
      <div className="w-full max-w-md rounded-[20px] border border-line bg-surface p-7 shadow-panel sm:p-9">
        <div className="mb-7 flex items-center gap-3">
          <BrandMark size="large" /><BrandIdentity version={SALSYSOS_VERSION_LABEL} />
        </div>

        <div className="mb-6">
          <div className="ui-page-kicker">Secure account access</div>

          <h1 className="mt-1.5 text-[26px] font-semibold tracking-[-0.035em] text-copy-strong">
            Sign in
          </h1>

          <p className="mt-2 text-[14px] leading-6 text-copy-muted">
            Use your SalsysOS account to continue. Your organization is
            securely resolved from your authenticated account.
          </p>
        </div>

        {params.notice && (
          <div className="mb-5 rounded-ui border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] font-medium text-emerald-700">
            {params.notice}
          </div>
        )}

        {params.error && (
          <div className="mb-5 rounded-ui border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-medium text-red-700">
            {params.error}
          </div>
        )}

        {useMockData && (
          <div className="mb-5 flex gap-2 rounded-ui border border-amber-200 bg-[var(--app-warning-soft)] p-3 text-[13px] text-[var(--app-warning)]">
            <Sparkles size={17} className="mt-0.5 shrink-0" />

            <span>
              Mock mode is enabled. Sign-in is bypassed until{' '}
              <code>NEXT_PUBLIC_USE_MOCK_DATA=false</code>.
            </span>
          </div>
        )}

        <form action={signInAction} className="space-y-4">
          <input
            type="hidden"
            name="next"
            value={params.next ?? '/dashboard'}
          />

          <label className="block">
            <span className="field-label block">Email</span>

            <input
              className="input w-full"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@company.com"
            />
          </label>

          <label className="block">
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <span className="text-[12px] font-semibold text-copy">Password</span>
              <Link
                href="/forgot-password"
                className="text-[12px] font-semibold text-brand-700 hover:underline"
              >
                Forgot password?
              </Link>
            </div>

            <input
              className="input w-full"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="••••••••"
            />
          </label>

          <button className="btn-primary w-full" type="submit">
            <LockKeyhole size={16} />
            Sign in
          </button>
        </form>

        <div className="mt-5 flex items-start gap-2 rounded-ui border border-line bg-surface-soft px-3.5 py-3 text-[12px] leading-5 text-copy-muted">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-brand-700" />

          <span>
            Your tenant is established by your authenticated account and
            verified against your active organization membership.
          </span>
        </div>
      </div>
    </div>
  );
}
