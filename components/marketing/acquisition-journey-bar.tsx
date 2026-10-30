'use client';

import Link from 'next/link';
import { ArrowRight, CircleDollarSign, GitBranch, Megaphone, Target } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

export function AcquisitionJourneyBar() {
  const searchParams = useSearchParams();
  const campaign = searchParams.get('campaign')?.trim() || '';
  const encodedCampaign = campaign ? encodeURIComponent(campaign) : '';

  return (
    <section className="mb-4 rounded-2xl border border-violet-100 bg-violet-50/45 px-4 py-3 shadow-[0_8px_24px_rgba(87,67,197,.04)] dark:border-violet-900/40 dark:bg-violet-950/15 sm:px-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="text-[9px] font-black uppercase tracking-[.14em] text-violet-500">Marketing · Acquisition journey</div>
          <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
            {campaign ? `Following campaign “${campaign}”` : 'Move from acquisition evidence to commercial outcome'}
          </div>
          <p className="mt-1 max-w-3xl text-[10px] leading-5 text-slate-500 dark:text-slate-400">
            Campaign filters stay explicit where the destination supports them. Funnel and Revenue remain broader business views rather than pretending a campaign filter exists where it does not.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href={campaign ? `/campaigns?q=${encodedCampaign}` : '/campaigns'} className="btn-secondary">
            <Megaphone size={14} /> Campaigns
          </Link>
          <Link href="/funnel" className="btn-secondary">
            <GitBranch size={14} /> Funnel
          </Link>
          <Link href={campaign ? `/attribution?q=${encodedCampaign}` : '/attribution'} className="btn-secondary">
            <Target size={14} /> Attribution
          </Link>
          <Link href="/revenue" className="btn-primary">
            <CircleDollarSign size={14} /> Revenue <ArrowRight size={13} />
          </Link>
        </div>
      </div>
    </section>
  );
}
