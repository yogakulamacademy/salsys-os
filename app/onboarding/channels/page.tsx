import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Facebook,
  Globe2,
  HeartPulse,
  Instagram,
  MessageCircle,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

import {
  skipOnboardingChannelsAction,
  verifyOnboardingChannelsAction,
} from '@/app/onboarding/actions';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

type Provider = 'google' | 'meta' | 'instagram' | 'whatsapp';

type Connection = {
  id: string;
  provider: Provider;
  status: string;
  account_name: string | null;
  account_email: string | null;
  last_verified_at: string | null;
};

const steps = [
  ['business', 'Business', 'Workspace profile'],
  ['goals', 'Goals', 'What to improve'],
  ['website', 'Website', 'Tracking setup'],
  ['channels', 'Channels', 'Connect sources'],
  ['team', 'Team', 'Invite people'],
  ['finish', 'Finish', 'Readiness review'],
] as const;

const providers: Array<{
  key: Provider;
  title: string;
  description: string;
  href: string;
  icon: typeof Globe2;
  goals: string[];
}> = [
  {
    key: 'whatsapp',
    title: 'WhatsApp',
    description: 'Business messaging, approved templates, conversations and operational follow-up.',
    href: '/settings/integrations/whatsapp',
    icon: MessageCircle,
    goals: ['whatsapp', 'lead_management', 'automation'],
  },
  {
    key: 'instagram',
    title: 'Instagram',
    description: 'Professional-account messaging and customer conversation operations.',
    href: '/settings/integrations',
    icon: Instagram,
    goals: ['lead_management', 'automation'],
  },
  {
    key: 'meta',
    title: 'Meta',
    description: 'Meta Ads, Pages and business assets for paid-media measurement and attribution.',
    href: '/settings/integrations',
    icon: Facebook,
    goals: ['attribution', 'revenue'],
  },
  {
    key: 'google',
    title: 'Google',
    description: 'Analytics, Search Console and Google Ads under one authorized connection.',
    href: '/settings/integrations',
    icon: Globe2,
    goals: ['attribution', 'seo', 'revenue'],
  },
];

function formatWhen(value: string | null) {
  if (!value) return 'Not verified yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not verified yet';
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function Rail({ organizationName, channelsComplete }: { organizationName: string; channelsComplete: boolean }) {
  const completeCount = channelsComplete ? 4 : 3;
  return (
    <aside className="border-b border-[#dfe9e2] bg-[#123f33] px-5 py-5 text-white lg:min-h-screen lg:w-[300px] lg:border-b-0 lg:border-r lg:px-7 lg:py-8">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-white text-[11px] font-black tracking-[-0.03em] text-[#174d3d]">SO</div>
        <div><div className="text-sm font-bold">SalsysOS</div><div className="text-[10px] uppercase tracking-[0.16em] text-[#9ec7b7]">Workspace setup</div></div>
      </div>

      <div className="mt-7 rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#9ec7b7]">Setting up</div>
        <div className="mt-1 truncate text-sm font-bold">{organizationName}</div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#8de0b7]" style={{ width: `${(completeCount / 6) * 100}%` }} /></div>
        <div className="mt-2 text-[10.5px] text-[#b7d6ca]">{completeCount} of 6 setup steps complete</div>
      </div>

      <nav className="mt-5 hidden space-y-1 lg:block" aria-label="Onboarding progress">
        {steps.map(([key, label, description], index) => {
          const complete = index < 3 || (key === 'channels' && channelsComplete);
          const active = key === 'channels';
          return (
            <div key={key} className={`flex items-center gap-3 rounded-xl px-3 py-3 ${active ? 'bg-white text-[#153e32]' : 'text-[#c3dcd2]'}`}>
              <div className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border text-[10px] font-bold ${complete ? 'border-[#78d7ab] bg-[#78d7ab] text-[#113f31]' : active ? 'border-[#b7d9c9] bg-[#edf7f1] text-[#23654f]' : 'border-white/15 bg-white/5 text-[#a8c8bc]'}`}>{complete ? <Check size={13} /> : index + 1}</div>
              <div><div className="text-[11.5px] font-bold">{label}</div><div className={`text-[10px] ${active ? 'text-[#6d8278]' : 'text-[#83aa9b]'}`}>{description}</div></div>
            </div>
          );
        })}
      </nav>

      <div className="mt-5 flex items-center justify-between lg:hidden"><div><div className="text-[10px] uppercase tracking-[0.12em] text-[#9ec7b7]">Step 4 of 6</div><div className="mt-1 text-sm font-bold">Channels</div></div><div className="text-[11px] text-[#b7d6ca]">{completeCount} complete</div></div>

      <div className="mt-8 hidden rounded-xl border border-white/10 bg-white/5 p-4 lg:block">
        <div className="flex gap-2 text-[11px] font-bold text-[#d9ebe4]"><ShieldCheck size={15} className="text-[#85d7ae]" /> Connected means connected</div>
        <p className="mt-2 text-[10.5px] leading-5 text-[#9fc1b4]">This step reads provider connection records for this tenant. Opening a provider screen never counts as completion by itself.</p>
      </div>
    </aside>
  );
}

export default async function OnboardingChannelsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const query = await searchParams;
  const supabase = await createClient();
  const workspace = await getCurrentWorkspaceContext(supabase);
  const organizationId = workspace.activeOrganizationId;
  const organizationName = workspace.activeWorkspace?.organizationName || 'Your workspace';

  if (!organizationId) redirect('/dashboard');

  const [{ data: canManage }, { data: onboarding }] = await Promise.all([
    supabase.rpc('can_manage_organization', { p_organization_id: organizationId }),
    supabase
      .from('organization_onboarding')
      .select('completed_steps,goals')
      .eq('organization_id', organizationId)
      .maybeSingle(),
  ]);

  if (!canManage) redirect('/dashboard');

  const completed = new Set(Array.isArray(onboarding?.completed_steps) ? onboarding.completed_steps.map(String) : []);
  if (!completed.has('business')) redirect('/onboarding?step=business');
  if (!completed.has('goals')) redirect('/onboarding?step=goals');
  if (!completed.has('website')) redirect('/onboarding/website');
  if (completed.has('channels')) redirect('/onboarding?step=team');

  const goals = new Set(Array.isArray(onboarding?.goals) ? onboarding.goals.map(String) : []);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('integration_connections')
    .select('id,provider,status,account_name,account_email,last_verified_at')
    .eq('organization_id', organizationId)
    .order('updated_at', { ascending: false });

  if (error) throw new Error(`Unable to load channel connections: ${error.message}`);

  const connections = (data ?? []) as Connection[];
  const connectedByProvider = new Map<Provider, Connection>();
  for (const connection of connections) {
    if (connection.status === 'connected' && !connectedByProvider.has(connection.provider)) {
      connectedByProvider.set(connection.provider, connection);
    }
  }

  const connectedCount = connectedByProvider.size;

  return (
    <main className="min-h-screen bg-[#f5f8f6] text-[#173d32] lg:flex">
      <Rail organizationName={organizationName} channelsComplete={false} />

      <section className="min-w-0 flex-1">
        <div className="border-b border-[#e2ebe5] bg-white/80 px-5 py-3 backdrop-blur sm:px-8">
          <div className="mx-auto flex max-w-[1080px] items-center justify-between gap-4"><div className="text-[10.5px] font-bold text-[#72877c]">Workspace onboarding</div><div className="flex items-center gap-2 text-[10.5px] text-[#82958b]"><HeartPulse size={13} className="text-[#3c8b68]" /> Live provider state</div></div>
        </div>

        <div className="px-5 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
          <div className="mx-auto w-full max-w-[940px]">
            {query.error ? <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium leading-5 text-rose-800">{query.error}</div> : null}

            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#779184]">Step 4 · Channels</div>
            <h1 className="mt-2 text-[30px] font-bold tracking-[-0.04em] text-[#153e32] sm:text-[36px]">Connect the channels your team uses.</h1>
            <p className="mt-3 max-w-2xl text-[13px] leading-6 text-[#657b70]">SalsysOS uses the real account-integration state below. Connect at least one provider to complete this step, or skip it for now without falsely increasing setup progress.</p>

            <div className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-[#dce7df] bg-white px-4 py-3">
              <div><div className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#80958a]">Connection summary</div><div className="mt-1 text-sm font-bold text-[#183f33]">{connectedCount} of {providers.length} providers connected</div></div>
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${connectedCount ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>{connectedCount ? 'Ready to continue' : 'Optional for now'}</span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {providers.map((provider) => {
                const connection = connectedByProvider.get(provider.key) ?? null;
                const recommended = provider.goals.some((goal) => goals.has(goal));
                const Icon = provider.icon;
                return (
                  <article key={provider.key} className={`rounded-2xl border bg-white p-5 shadow-[0_3px_14px_rgba(25,66,51,0.035)] ${recommended ? 'border-[#b9dcc7]' : 'border-[#dce7df]'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#eef7f2] text-[#286c53]"><Icon size={18} /></div>
                        <div><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-bold text-[#183f33]">{provider.title}</h2>{recommended ? <span className="rounded-full bg-[#edf7f1] px-2 py-0.5 text-[9px] font-bold text-[#357357]">Recommended</span> : null}</div><p className="mt-1 text-[10.8px] leading-5 text-[#72877c]">{provider.description}</p></div>
                      </div>
                      {connection ? <CheckCircle2 size={18} className="shrink-0 text-[#2d9b69]" /> : <span className="h-4 w-4 shrink-0 rounded-full border-2 border-[#cddbd3]" />}
                    </div>

                    <div className="mt-4 rounded-xl border border-[#e4ebe6] bg-[#fafcfb] p-3 text-[10.8px]">
                      <div className="flex items-center justify-between gap-3"><span className="text-[#81938a]">Status</span><b className={connection ? 'text-[#26815a]' : 'text-[#697c71]'}>{connection ? 'Connected' : 'Not connected'}</b></div>
                      <div className="mt-2 flex items-center justify-between gap-3"><span className="text-[#81938a]">Account</span><b className="max-w-[62%] truncate text-right text-[#3d5d4d]">{connection?.account_name ?? connection?.account_email ?? '—'}</b></div>
                      <div className="mt-2 flex items-center justify-between gap-3"><span className="text-[#81938a]">Last verified</span><span className="text-right text-[#64796d]">{formatWhen(connection?.last_verified_at ?? null)}</span></div>
                    </div>

                    <Link href={provider.href} className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg border border-[#cfe1d6] bg-[#f8fbf9] px-3 text-[11px] font-bold text-[#276b51]">{connection ? `Manage ${provider.title}` : `Connect ${provider.title}`} <ArrowRight size={12} /></Link>
                  </article>
                );
              })}
            </div>

            <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#e6e7cf] bg-[#fffdf2] p-3 text-[11px] leading-5 text-[#746c43]"><Sparkles size={14} className="mt-0.5 shrink-0" /><span><strong>Recommended</strong> is based on the goals you selected earlier. It does not create or authorize any provider connection automatically.</span></div>

            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Link href="/onboarding/website" className="inline-flex items-center gap-1 text-[11.5px] font-bold text-[#657c70]"><ArrowLeft size={13} /> Back to website</Link>
              <div className="flex flex-wrap gap-2">
                <form action={skipOnboardingChannelsAction}><button type="submit" className="h-10 rounded-lg border border-[#d7e2db] bg-white px-4 text-xs font-bold text-[#657c70]">Skip for now</button></form>
                <form action={verifyOnboardingChannelsAction}><button type="submit" className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#1f654e] px-4 text-xs font-bold text-white shadow-sm hover:bg-[#185640]">Verify & continue <ArrowRight size={14} /></button></form>
              </div>
            </div>

            <div className="mt-4 flex items-start gap-2 text-[10.8px] leading-5 text-[#7a8e83]"><ShieldCheck size={13} className="mt-0.5 shrink-0" /> Skip only advances the onboarding position; it does not add Channels to completed steps. You can return later and complete it from a real connected provider.</div>
          </div>
        </div>
      </section>
    </main>
  );
}
