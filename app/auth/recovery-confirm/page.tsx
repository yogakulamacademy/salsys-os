import { KeyRound, ShieldCheck } from 'lucide-react';

import { confirmPasswordRecoveryWithGrantAction } from '@/app/actions/password-recovery';

export default async function RecoveryConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string }>;
}) {
  const query = await searchParams;
  const tokenHash = String(query.token_hash ?? '').trim();

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
            Continue password reset
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            For your security, the recovery token is only consumed after you
            press the button below. This protects reset links from automatic
            email link scanners and preview services.
          </p>
        </div>

        {!tokenHash ? (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            This password reset link is incomplete. Request a new reset email.
          </div>
        ) : (
          <form action={confirmPasswordRecoveryWithGrantAction} className="space-y-4">
            <input type="hidden" name="token_hash" value={tokenHash} />
            <button className="btn-primary w-full" type="submit">
              <KeyRound size={16} /> Continue securely
            </button>
          </form>
        )}

        <div className="mt-5 flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-500">
          <ShieldCheck size={16} className="mt-0.5 shrink-0" />
          <span>
            The link itself does not sign you in. Your recovery token is only
            verified when you explicitly continue.
          </span>
        </div>
      </div>
    </div>
  );
}
