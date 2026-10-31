import { MarketingCommandCenterOverview } from "./marketing-command-center-overview";
import CanonicalMarketingWorkspace from "./canonical-workspace";

type MarketingPageProps = {
  searchParams: Promise<{
    view?: string;
    q?: string;
    platform?: string;
    outcome?: string;
    sort?: string;
    page?: string;
    course?: string;
    location?: string;
    country?: string;
    stage?: string;
  }>;
};

export default async function MarketingPage({ searchParams }: MarketingPageProps) {
  const query = await searchParams;
  const view = query.view || "overview";

  if (view === "overview") {
    return <MarketingCommandCenterOverview />;
  }

  return <CanonicalMarketingWorkspace searchParams={Promise.resolve(query)} />;
}
