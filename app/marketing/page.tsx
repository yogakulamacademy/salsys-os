import { SmartMarketingOverview } from "@/components/marketing/smart-marketing-overview";
import { getMarketingStory } from "@/lib/marketing-story-data";

import CanonicalMarketingWorkspace from "./canonical-workspace";
import { MarketingCommandCenterOverview } from "./marketing-command-center-overview";

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
    days?: string;
    steps?: string;
    classic?: string;
  }>;
};

export default async function MarketingPage({ searchParams }: MarketingPageProps) {
  const query = await searchParams;
  const view = query.view || "overview";

  if (view === "overview") {
    // Smart Overview (owner-approved prototype, 25 Nov 2026); the older command
    // centre stays as the fallback when the story can't be read.
    const story = await getMarketingStory();
    return story ? <SmartMarketingOverview story={story} /> : <MarketingCommandCenterOverview />;
  }

  return <CanonicalMarketingWorkspace searchParams={Promise.resolve(query)} />;
}
