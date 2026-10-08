import { LockKeyhole, Sparkles } from 'lucide-react';
import { signInAction } from '@/app/actions/auth';
import { useMockData } from '@/lib/config';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const params = await searchParams;
  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-card sm:p-9">
        <div className="mb-7 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-brand font-black text-white">S</div>
          <div><div className="font-bold text-slate-950">SalsysOS</div><div className="text-sm text-slate-400">Sales + Analysis Operating System</div></div>
        </div>
        <div className="mb-6"><div className="eyebrow">Secure access</div><h1 className="mt-1 text-2xl font-bold text-slate-950">Sign in</h1><p className="mt-2 text-sm leading-6 text-slate-500">Use your SalsysOS account to continue.</p></div>
        {params.error && <div className="mb-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{params.error}</div>}
        {useMockData && <div className="mb-5 flex gap-2 rounded-xl border border-orange-100 bg-orange-50 p-3 text-sm text-orange-700"><Sparkles size={17} className="mt-0.5 shrink-0" /><span>Mock mode is enabled. Sign-in is bypassed until <code>NEXT_PUBLIC_USE_MOCK_DATA=false</code>.</span></div>}
        <form action={signInAction} className="space-y-4">
          <input type="hidden" name="next" value={params.next ?? '/dashboard'} />
          <label className="block"><span className="mb-1.5 block text-sm font-semibold text-slate-700">Email</span><input className="input" name="email" type="email" autoComplete="email" required placeholder="you@company.com" /></label>
          <label className="block"><span className="mb-1.5 block text-sm font-semibold text-slate-700">Password</span><input className="input" name="password" type="password" autoComplete="current-password" required placeholder="••••••••" /></label>
          <button className="btn-primary w-full" type="submit"><LockKeyhole size={16} /> Sign in</button>
        </form>
      </div>
    </div>
  );
}
