import { KeyRound, ShieldCheck } from 'lucide-react';

import { updateRecoveredPasswordAction } from '@/app/actions/auth';

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const query = await searchParams;

  return (
    <div className="grid min-h-screen place-items-center bg-mist px-4 py-10">
      <div className="w-full max-w-md rounded-[20px] border border-line bg-surface p-7 shadow-panel sm:p-9">
        <div className="mb-7 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-brand-900 text-[14px] font-bold text-white shadow-sm">SO</div>
          <div>
            <div className="text-[15px] font-semibold text-copy-strong">SalsysOS</div>
            <div className="mt-0.5 text-[12px] text-copy-muted">Secure account recovery</div>
          </div>
        </div>

        <div className="mb-6">
          <div className="ui-page-kicker">Password recovery</div>
          <h1 className="mt-1.5 text-[26px] font-semibold tracking-[-0.035em] text-copy-strong">Choose a new password</h1>
          <p className="mt-2 text-[14px] leading-6 text-copy-muted">
            Your recovery session has been securely matched to your account and organization. Choose a new password to finish recovery.
          </p>
        </div>

        {query.error && <div className="mb-5 rounded-ui border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-medium text-red-700">{query.error}</div>}

        <form action={updateRecoveredPasswordAction} className="space-y-4">
          <label className="block">
            <span className="field-label block">New password</span>
            <input className="input w-full" name="password" type="password" autoComplete="new-password" minLength={12} required placeholder="At least 12 characters" />
          </label>

          <label className="block">
            <span className="field-label block">Confirm new password</span>
            <input className="input w-full" name="confirm_password" type="password" autoComplete="new-password" minLength={12} required placeholder="Repeat your new password" />
          </label>

          <button className="btn-primary w-full" type="submit">
            <KeyRound size={16} /> Update password
          </button>
        </form>

        <div className="mt-5 flex items-start gap-2 rounded-ui border border-line bg-surface-soft px-3.5 py-3 text-[12px] leading-5 text-copy-muted">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-brand-700" />
          <span>Recovery sessions are not carried forward as normal CRM sessions. You will sign in again after your password is changed.</span>
        </div>
      </div>
    </div>
  );
}
