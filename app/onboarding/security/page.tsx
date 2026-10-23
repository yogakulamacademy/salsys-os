import { KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react';
import { redirect } from 'next/navigation';

import { replaceProvisionedOwnerPasswordAction } from '@/app/onboarding/security/actions';
import { createClient } from '@/lib/supabase/server';

export default async function OnboardingSecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const query = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) redirect('/login');

  if (user.app_metadata?.require_password_change !== true) {
    redirect('/onboarding');
  }

  return (
    <main className="min-h-screen bg-[#f5f8f6] px-4 py-8 text-[#173d32] sm:px-6 sm:py-12">
      <div className="mx-auto grid w-full max-w-[1080px] overflow-hidden rounded-[28px] border border-[#dce8e1] bg-white shadow-[0_22px_70px_rgba(20,63,50,0.10)] lg:grid-cols-[0.9fr_1.1fr]">
        <section className="bg-[#123f33] px-6 py-8 text-white sm:px-9 sm:py-10 lg:min-h-[680px] lg:px-10 lg:py-12">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-white text-[12px] font-black tracking-[-0.03em] text-[#174d3d]">
              SO
            </div>
            <div>
              <div className="text-sm font-bold">SalsysOS</div>
              <div className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-[#9ec7b7]">
                Secure workspace setup
              </div>
            </div>
          </div>

          <div className="mt-14 max-w-md">
            <div className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/10 text-[#8de0b7]">
              <LockKeyhole size={22} />
            </div>
            <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.16em] text-[#8dc6b1]">
              Account security
            </p>
            <h1 className="mt-3 text-[30px] font-semibold leading-[1.12] tracking-[-0.04em] sm:text-[36px]">
              Replace your temporary password before setup begins.
            </h1>
            <p className="mt-4 text-[13px] leading-6 text-[#b7d6ca]">
              Your SalsysOS workspace has already been provisioned. This one-time security step keeps the temporary credential from becoming your long-term password.
            </p>
          </div>

          <div className="mt-10 space-y-3 lg:mt-16">
            {[
              'Your workspace and organization are already isolated.',
              'The temporary password is replaced before onboarding starts.',
              'This requirement cannot be dismissed from the browser.',
            ].map((item) => (
              <div key={item} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-[11px] leading-5 text-[#d7e9e2]">
                <ShieldCheck size={15} className="mt-0.5 shrink-0 text-[#85d7ae]" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="flex items-center px-6 py-8 sm:px-10 sm:py-12 lg:px-14">
          <div className="mx-auto w-full max-w-[480px]">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#779184]">
              First sign-in · Security
            </div>
            <h2 className="mt-2 text-[27px] font-semibold tracking-[-0.035em] text-[#183f33]">
              Choose your permanent password
            </h2>
            <p className="mt-2 text-[12px] leading-6 text-[#72877c]">
              Use at least 12 characters. After this is saved, you will continue directly into workspace onboarding.
            </p>

            {user.email ? (
              <div className="mt-5 rounded-xl border border-[#dfe9e2] bg-[#f7faf8] px-4 py-3">
                <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#879c91]">Account</div>
                <div className="mt-1 text-[12px] font-semibold text-[#315a4a]">{user.email}</div>
              </div>
            ) : null}

            {query.error ? (
              <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[11px] font-medium leading-5 text-rose-800">
                {query.error}
              </div>
            ) : null}

            <form action={replaceProvisionedOwnerPasswordAction} className="mt-6 space-y-4">
              <label className="block">
                <span className="mb-2 block text-[11px] font-bold text-[#315a4a]">New password</span>
                <input
                  className="w-full rounded-xl border border-[#d7e4dc] bg-white px-3.5 py-3 text-sm text-[#173d32] outline-none transition focus:border-[#66a98c] focus:ring-4 focus:ring-[#dff2e9]"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  required
                  placeholder="At least 12 characters"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-[11px] font-bold text-[#315a4a]">Confirm new password</span>
                <input
                  className="w-full rounded-xl border border-[#d7e4dc] bg-white px-3.5 py-3 text-sm text-[#173d32] outline-none transition focus:border-[#66a98c] focus:ring-4 focus:ring-[#dff2e9]"
                  name="confirm_password"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  required
                  placeholder="Repeat your new password"
                />
              </label>

              <button
                type="submit"
                className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#1f654e] px-4 text-[12px] font-bold text-white shadow-sm transition hover:bg-[#194f3e]"
              >
                <KeyRound size={16} />
                Save password & continue
              </button>
            </form>

            <div className="mt-5 flex items-start gap-2 rounded-xl border border-[#dfe9e2] bg-[#f7faf8] px-3.5 py-3 text-[10.5px] leading-5 text-[#72877c]">
              <ShieldCheck size={15} className="mt-0.5 shrink-0 text-[#3d8a68]" />
              <span>
                SalsysOS stores password credentials through Supabase Auth. Your password is not stored in the SalsysOS application database.
              </span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
