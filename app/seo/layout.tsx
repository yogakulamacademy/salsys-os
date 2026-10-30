import type { ReactNode } from "react";

import { MarketingJourneyBar } from "@/components/marketing/marketing-journey-bar";
import { requirePrivilegedWorkspaceAccess } from "@/lib/route-access";

export default async function SeoLayout({ children }: { children: ReactNode }) {
  await requirePrivilegedWorkspaceAccess();

  return (
    <>
      <MarketingJourneyBar />
      {children}
    </>
  );
}
