import Link from "next/link";
import { RefreshCw, Sparkles } from "lucide-react";

import {
  FunnelExplorer,
  type FunnelCountryRow,
  type FunnelDailyRow,
  type FunnelFirstTouchRow,
  type FunnelLandingRow,
  type FunnelOverview,
  type FunnelRepeatSummary,
  type FunnelSourceRow,
} from "@/components/funnel-explorer";
import { GoogleAdsBusinessPerformance } from "@/components/google-ads-business-performance";
import { MetaAdsBusinessPerformance } from "@/components/meta-ads-business-performance";
import { PageHeader } from "@/components/ui";
import { getFunnelWorkspace } from "@/lib/funnel-data";

export default async function FunnelPage() {
  const workspace = await getFunnelWorkspace();
  const overview = workspace.funnel.overview as FunnelOverview;
  const daily = workspace.funnel.daily as FunnelDailyRow[];
  const sources = workspace.funnel.sources as FunnelSourceRow[];
  const firstTouch = workspace.funnel.firstTouch as FunnelFirstTouchRow[];
  const landingPages = workspace.funnel.landingPages as FunnelLandingRow[];
  const countries = workspace.funnel.countries as FunnelCountryRow[];
  const repeat = workspace.funnel.repeat as FunnelRepeatSummary;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Intelligence"
        title="Funnel"
        description="See where people move, convert, return or drop off."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/commercial-intelligence" className="btn-secondary">
              <Sparkles size={15} />
              Explain performance
            </Link>
            <Link href="/re-engaged" className="btn-secondary">
              <RefreshCw size={15} />
              Lead activity
            </Link>
          </div>
        }
      />

      {workspace.warning ? (
        <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
          {workspace.warning}
        </div>
      ) : null}

      <FunnelExplorer
        overview={overview}
        daily={daily}
        sources={sources}
        landingPages={landingPages}
        countries={countries}
        firstTouch={firstTouch}
        repeat={repeat}
      />

      <details className="group rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 sm:px-5">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Paid media</div>
            <div className="mt-1 text-sm font-black text-slate-900 dark:text-white">Google + Meta business evidence</div>
          </div>
          <span className="text-[10px] font-bold text-slate-400 group-open:hidden">Show</span>
          <span className="hidden text-[10px] font-bold text-slate-400 group-open:inline">Hide</span>
        </summary>
        <div className="border-t border-slate-100 p-4 dark:border-slate-900">
          <GoogleAdsBusinessPerformance data={workspace.googleAds} />
          <MetaAdsBusinessPerformance data={workspace.metaAds} />
        </div>
      </details>

      <div className="px-1 text-[10px] leading-4 text-slate-400">
        Funnel stages use observed first-party and CRM evidence. Missing behavior stays unknown; stage rates are not predicted probabilities.
      </div>
    </div>
  );
}
