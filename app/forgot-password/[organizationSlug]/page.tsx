import Link from 'next/link';
import { Building2, Mail, ShieldCheck } from 'lucide-react';

import { requestPasswordResetAction } from '@/app/actions/auth';

function displayOrganizationName(slug: string) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export default async function TenantForgotPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const [{ organizationSlug }, query] = await Promise.all([params, searchParams]);
  const normalizedSlug = decodeURIComponent(organizationSlug).trim().toLowerCase();
  const organizationName = displayOrganizationName(normalizedSlug) || 'Organization';

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
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <Building2 size={15} className="text-slate-500" />
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">
                Organization
              </div>
              <div className="truncate text-sm font-semibold text-slate-900">
                {organizationName}
              </div>
            </div>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            Enter your account email. The recovery link remains bound to this
            organization and cannot be used to switch tenants.
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
          <input type="hidden" name="organization_slug" value={normalizedSlug} />

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
          href={`/login/${encodeURIComponent(normalizedSlug)}`}
        >
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
