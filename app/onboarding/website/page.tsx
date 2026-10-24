import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  ExternalLink,
  Globe2,
  HeartPulse,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';

import { verifyOnboardingWebsiteAction } from '@/app/onboarding/actions';
import { skipOnboardingWebsiteAction } from '@/app/onboarding/website/skip-action';
import { createClient } from '@/lib/supabase/server';
import {
  getTrackingPlatformWorkspace,
  type TrackingPlatformSource,
} from '@/lib/tracking-platform-data';
import { getCurrentWorkspaceContext } from '@/lib/workspace';

const steps = [
  ['business', 'Business', 'Workspace profile'],
  ['goals', 'Goals', 'What to improve'],
  ['website', 'Website', 'Tracking setup'],
  ['channels', 'Channels', 'Connect sources'],
  ['team', 'Team', 'Invite people'],
  ['finish', 'Finish', 'Readiness review'],
] as const;

function formatWhen(value: string | null) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function statusCopy(source: TrackingPlatformSource | null) {
  if (!source) {
    return {
      label: 'Not connected',
      detail: 'No browser website source is configured yet.',
      tone: 'border-slate-200 bg-slate-50 text-slate-700',
    };
  }

  if (source.healthStatus === 'healthy') {
    return {
      label: 'Connected',
      detail: 'A real browser event has been accepted within the last 24 hours.',
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    };
  }

  if (source.healthStatus === 'idle') {
    return {
      label: 'Connected · idle',
      detail: 'Events were accepted before, but no accepted event was observed within the last 24 hours.',
      tone: 'border-amber-200 bg-amber-50 text-amber-800',
    };
  }

  if (source.healthStatus === 'misconfigured') {
    return {
      label: 'Needs configuration',
      detail: 'The website source exists but does not currently satisfy the production privacy/origin configuration.',
      tone: 'border-rose-200 bg-rose-50 text-rose-800',
    };
  }

  if (source.healthStatus === 'degraded') {
    return {
      label: 'Needs attention',
      detail: 'The source has rejected events and no accepted event evidence yet.',
      tone: 'border-rose-200 bg-rose-50 text-rose-800',
    };
  }

  if (source.healthStatus === 'inactive') {
    return {
      label: 'Inactive',
      detail: 'The configured source is currently inactive.',
      tone: 'border-slate-200 bg-slate-100 text-slate-600',
    };
  }

  return {
    label: 'Waiting for first event',
    detail: 'The source is configured, but SalsysOS has not accepted a real browser event yet.',
    tone: 'border-amber-200 bg-amber-50 text-amber-800',
  };
}

function Rail({ organizationName }: { organizationName: string }) {
  return (
    <aside className="border-b border-[#dfe9e2] bg-[#123f33] px-5 py-5 text-white lg:min-h-screen lg:w-[300px] lg:border-b-0 lg:border-r lg:px-7 lg:py-8">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-white text-[11px] font-black tracking-[-0.03em] text-[#174d3d]">SO</div>
        <div>
          <div className="text-sm font-bold">SalsysOS</div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-[#9ec7b7]">Workspace setup</div>
        </div>
      </div>

      <div className="mt-7 rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#9ec7b7]">Setting up</div>
        <div className="mt-1 truncate text-sm font-bold">{organizationName}</div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-1/3 rounded-full bg-[#8de0b7]" />
        </div>
        <div className="mt-2 text-[10.5px] text-[#b7d6ca]">2 of 6 setup steps complete</div>
      </div>

      <nav className="mt-5 hidden space-y-1 lg:block" aria-label="Onboarding progress">
        {steps.map(([key, label, description], index) => {
          const complete = index < 2;
          const active = key === 'website';
          return (
            <div key={key} className={`flex items-center gap-3 rounded-xl px-3 py-3 ${active ? 'bg-white text-[#153e32]' : 'text-[#c3dcd2]'}`}>
              <div className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border text-[10px] font-bold ${complete ? 'border-[#78d7ab] bg-[#78d7ab] text-[#113f31]' : active ? 'border-[#b7d9c9] bg-[#edf7f1] text-[#23654f]' : 'border-white/15 bg-white/5 text-[#a8c8bc]'}`}>
                {complete ? <Check size={13} /> : index + 1}
              </div>
              <div>
                <div className="text-[11.5px] font-bold">{label}</div>
                <div className={`text-[10px] ${active ? 'text-[#6d8278]' : 'text-[#83aa9b]'}`}>{description}</div>
              </div>
            </div>
          );
        })}
      </nav>

      <div className="mt-5 flex items-center justify-between lg:hidden">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-[#9ec7b7]">Step 3 of 6</div>
          <div className="mt-1 text-sm font-bold">Website</div>
        </div>
        <div className="text-[11px] text-[#b7d6ca]">2 complete</div>
      </div>

      <div className="mt-8 hidden rounded-xl border border-white/10 bg-white/5 p-4 lg:block">
        <div className="flex gap-2 text-[11px] font-bold text-[#d9ebe4]"><ShieldCheck size={15} className="text-[#85d7ae]" /> Evidence-based setup</div>
        <p className="mt-2 text-[10.5px] leading-5 text-[#9fc1b4]">Website setup only completes after SalsysOS observes accepted production tracking evidence for this organization.</p>
      </div>
    </aside>
  );
}

export default async function OnboardingWebsitePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
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
      .select('completed_steps,website_url')
      .eq('organization_id', organizationId)
      .maybeSingle(),
  ]);

  if (!canManage) redirect('/dashboard');

  const completed = new Set(
    Array.isArray(onboarding?.completed_steps)
      ? onboarding.completed_steps.map((value) => String(value))
      : [],
  );

  if (!completed.has('business')) redirect('/onboarding?step=business');
  if (!completed.has('goals')) redirect('/onboarding?step=goals');
  if (completed.has('website')) redirect('/onboarding?step=channels');

  const tracking = await getTrackingPlatformWorkspace();
  if (tracking.organizationId !== organizationId) {
    throw new Error('Tracking workspace does not match the active onboarding tenant.');
  }

  const websiteSources = tracking.sources.filter((source) => source.sourceType === 'website');
  const healthy = websiteSources.find((source) => source.healthStatus === 'healthy') ?? null;
  const primary = healthy ?? websiteSources[0] ?? null;
  const status = statusCopy(primary);
  const expectedWebsite = String(onboarding?.website_url ?? '').trim();

  return (
    <main className="min-h-screen bg-[#f5f8f6] text-[#173d32] lg:flex">
      <Rail organizationName={organizationName} />

      <section className="min-w-0 flex-1">
        <div className="border-b border-[#e2ebe5] bg-white/80 px-5 py-3 backdrop-blur sm:px-8">
          <div className="mx-auto flex max-w-[1080px] items-center justify-between gap-4">
            <div className="text-[10.5px] font-bold text-[#72877c]">Workspace onboarding</div>
            <div className="flex items-center gap-2 text-[10.5px] text-[#82958b]"><HeartPulse size={13} className="text-[#3c8b68]" /> Live tracking health</div>
          </div>
        </div>

        <div className="px-5 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
          <div className="mx-auto w-full max-w-[900px]">
            {query.error ? (
              <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium leading-5 text-rose-800">{query.error}</div>
            ) : null}

            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#779184]">Step 3 · Website tracking</div>
            <h1 className="mt-2 text-[30px] font-bold tracking-[-0.04em] text-[#153e32] sm:text-[36px]">Connect your website to SalsysOS.</h1>
            <p className="mt-3 max-w-2xl text-[13px] leading-6 text-[#657b70]">Install the Universal Tracking SDK, then let SalsysOS confirm the connection from a real accepted browser event. You can also skip this for now and finish it later from Home.</p>

            <div className="mt-7 grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,.85fr)]">
              <section className="rounded-2xl border border-[#dce7df] bg-white p-5 shadow-[0_8px_30px_rgba(25,66,51,0.055)] sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#edf7f1] text-[#256b51]"><Globe2 size={20} /></div>
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#81958a]">Website source</div>
                      <h2 className="mt-1 text-base font-bold text-[#183f33]">{primary?.name ?? 'No website connected'}</h2>
                    </div>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${status.tone}`}>{status.label}</span>
                </div>

                <p className="mt-4 text-[11.5px] leading-6 text-[#667d71]">{status.detail}</p>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-[#e1e9e3] bg-[#fafcfb] p-3">
                    <div className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-[#83978c]">Expected website</div>
                    <div className="mt-1 break-all text-[11.5px] font-bold text-[#294f40]">{expectedWebsite || 'Not provided in business setup'}</div>
                  </div>
                  <div className="rounded-xl border border-[#e1e9e3] bg-[#fafcfb] p-3">
                    <div className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-[#83978c]">Observed hostname</div>
                    <div className="mt-1 break-all text-[11.5px] font-bold text-[#294f40]">{primary?.hostname ?? 'Not observed yet'}</div>
                  </div>
                  <div className="rounded-xl border border-[#e1e9e3] bg-[#fafcfb] p-3">
                    <div className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-[#83978c]">Accepted events</div>
                    <div className="mt-1 text-xl font-bold text-[#183f33]">{primary?.acceptedEventCount ?? 0}</div>
                  </div>
                  <div className="rounded-xl border border-[#e1e9e3] bg-[#fafcfb] p-3">
                    <div className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-[#83978c]">Last seen</div>
                    <div className="mt-1 text-[11.5px] font-bold text-[#294f40]">{formatWhen(primary?.lastSeenAt ?? null)}</div>
                  </div>
                </div>

                <div className="mt-5 flex items-start gap-2 rounded-xl border border-[#dce9df] bg-[#f4f9f6] p-3 text-[11px] leading-5 text-[#587466]">
                  {healthy ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-[#2c9a68]" /> : <Activity size={15} className="mt-0.5 shrink-0 text-[#4b876b]" />}
                  {healthy ? 'Connection verified from real production tracking evidence. You can continue to Channels.' : 'After installation, visit the website and generate a real page event. If you are not ready yet, skip this step and SalsysOS will keep it as a Home recommendation.'}
                </div>
              </section>

              <aside className="space-y-4">
                <section className="rounded-2xl border border-[#dce7df] bg-white p-5">
                  <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#80958a]">Connection rule</div>
                  <h3 className="mt-2 text-sm font-bold text-[#183f33]">Real evidence, not a checkbox.</h3>
                  <div className="mt-4 space-y-3 text-[11px] text-[#667d71]">
                    <div className="flex gap-2"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-[#36a675]" /><span>Source is active and correctly configured.</span></div>
                    <div className="flex gap-2"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-[#36a675]" /><span>Privacy and origin controls are valid.</span></div>
                    <div className="flex gap-2">{healthy ? <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-[#36a675]" /> : <Circle size={14} className="mt-0.5 shrink-0 text-[#a7b5ad]" />}<span>Accepted browser event observed within 24 hours.</span></div>
                  </div>
                </section>

                {websiteSources.length > 1 ? (
                  <section className="rounded-2xl border border-[#dce7df] bg-white p-5">
                    <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#80958a]">Other website sources</div>
                    <div className="mt-3 space-y-2">
                      {websiteSources.slice(1, 4).map((source) => (
                        <div key={source.id} className="flex items-center justify-between gap-3 rounded-lg border border-[#e4ebe6] px-3 py-2 text-[10.5px]">
                          <span className="truncate font-bold text-[#355647]">{source.hostname ?? source.name}</span>
                          <span className="capitalize text-[#7f9188]">{source.healthStatus.replaceAll('_', ' ')}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}
              </aside>
            </div>

            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Link href="/onboarding?step=goals" className="inline-flex items-center gap-1 text-[11.5px] font-bold text-[#657c70]"><ArrowLeft size={13} /> Back to priorities</Link>
              <div className="flex flex-wrap gap-2">
                {!healthy ? (
                  <form action={skipOnboardingWebsiteAction}>
                    <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#d7e3dc] bg-white px-4 text-xs font-bold text-[#5f766a] shadow-sm hover:bg-[#f7faf8]">Skip for now <ArrowRight size={14} /></button>
                  </form>
                ) : null}
                <Link href="/tracking/sources" className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#cfe1d6] bg-white px-4 text-xs font-bold text-[#276b51]">Install / manage tracking <ExternalLink size={13} /></Link>
                <form action={verifyOnboardingWebsiteAction}>
                  <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#1f654e] px-4 text-xs font-bold text-white shadow-sm hover:bg-[#185640]">Verify connection & continue <ArrowRight size={14} /></button>
                </form>
              </div>
            </div>

            {!healthy && primary?.healthStatus === 'misconfigured' ? (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-[11px] leading-5 text-rose-800"><TriangleAlert size={15} className="mt-0.5 shrink-0" /> This source needs configuration changes before onboarding can verify it. Open Tracking Sources for the exact source setup and health details.</div>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
