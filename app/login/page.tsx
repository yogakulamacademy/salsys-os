import { Building2, LockKeyhole, Sparkles } from 'lucide-react';
import { useMockData } from '@/lib/config';

export default async function LoginPage({
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
            <div className="text-sm text-slate-400">
              Sales + Analysis Operating System
            </div>
          </div>
        </div>

        <div className="mb-6">
          <div className="eyebrow">Secure tenant access</div>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">
            Organization login required
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            SalsysOS accounts are bound to a single organization for each login
            session. Open the organization-specific login link provided by your
            administrator.
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
            <span>
              Mock mode is enabled. Sign-in is bypassed until{' '}
              <code>NEXT_PUBLIC_USE_MOCK_DATA=false</code>.
            </span>
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-slate-500 shadow-sm">
              <Building2 size={17} />
            </div>
            <div>
              <div className="font-semibold text-slate-900">No organization switcher</div>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Your organization is established by the login URL and verified
                against your active membership before access is granted.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-2 text-xs font-medium text-slate-400">
          <LockKeyhole size={14} /> Tenant-isolated authentication
        </div>
      </div>
    </div>
  );
}
