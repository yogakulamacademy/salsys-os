import type { ReactNode } from "react";

import { CommercialIntelligencePanel } from "@/components/commercial-intelligence-panel";
import { buildRevenueIntelligence } from "@/lib/commercial-intelligence";
import { getRevenueWorkspace } from "@/lib/revenue-data";
import { requirePrivilegedWorkspaceAccess } from "@/lib/route-access";

export default async function RevenueLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requirePrivilegedWorkspaceAccess();

  const currentMonth = new Date().toISOString().slice(0, 7);
  const workspace = await getRevenueWorkspace(currentMonth);
  const intelligence = buildRevenueIntelligence(workspace);

  return (
    <>
      {children}
      <CommercialIntelligencePanel brief={intelligence} />
    </>
  );
}
