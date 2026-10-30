import type { ReactNode } from "react";

import { MarketingJourneyBar } from "@/components/marketing/marketing-journey-bar";

export default function SeoLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <MarketingJourneyBar />
      {children}
    </>
  );
}
