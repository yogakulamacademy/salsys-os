import { KeyRound, ShieldCheck } from 'lucide-react';

import { updateRecoveredPasswordAction } from '@/app/actions/auth';

function displayOrganizationName(slug: string) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export default async function TenantResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string }>;
  searchParams: Promise<{ error?: string }>;
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
          <div className="eyebrow">{organizationName}</div>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">
            Choose a new password
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            Your recovery session is bound to this organization. After the
            password changes, you will sign in again through the tenant login.
          </p>
        </div>

        {query.error && (
          <div className="mb-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {query.error}
          </div>
        )}

        <form action={updateRecoveredPasswordAction} className="space-y-4">
          <input type="hidden" name="organization_slug" value={normalizedSlug} />

          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">
              New password
            </span>
            <input
              className="input"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
              placeholder="At least 12 characters"
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
              minLength={12}
              required
              placeholder="Repeat your new password"
            />
          </label>

          <button className="btn-primary w-full" type="submit">
            <KeyRound size={16} /> Update password
          </button>
        </form>

        <div className="mt-5 flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-500">
          <ShieldCheck size={16} className="mt-0.5 shrink-0" />
          <span>
            Recovery sessions are not carried forward as normal CRM sessions.
            A fresh tenant-specific sign-in is required after password rotation.
          </span>
        </div>
      </div>
    </div>
  );
}
