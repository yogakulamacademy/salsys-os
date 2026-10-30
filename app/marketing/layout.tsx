import type { ReactNode } from "react";

import { MarketingJourneyBar } from "@/components/marketing/marketing-journey-bar";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <MarketingJourneyBar />
      {children}
    </>
  );
}
