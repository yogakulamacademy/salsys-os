import type { ReactNode } from "react";

import { RevenueReadinessNotice } from "@/components/revenue-readiness-notice";
import { requirePrivilegedWorkspaceAccess } from "@/lib/route-access";

export default async function RevenueLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requirePrivilegedWorkspaceAccess();

  return (
    <div className="space-y-4">
      <RevenueReadinessNotice />
      {children}
    </div>
  );
}
