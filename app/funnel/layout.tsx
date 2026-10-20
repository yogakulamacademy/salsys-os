import type { ReactNode } from "react";

import { CommercialIntelligencePanel } from "@/components/commercial-intelligence-panel";
import { buildFunnelIntelligence } from "@/lib/commercial-intelligence";
import { getFunnelWorkspace } from "@/lib/funnel-data";

export default async function FunnelLayout({
  children,
}: {
  children: ReactNode;
}) {
  const workspace = await getFunnelWorkspace();
  const intelligence = buildFunnelIntelligence(workspace);

  return (
    <>
      {children}
      <CommercialIntelligencePanel brief={intelligence} />
    </>
  );
}
