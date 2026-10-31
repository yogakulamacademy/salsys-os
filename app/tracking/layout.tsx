import type { ReactNode } from "react";

import { MeasurementControlNav } from "@/components/marketing/measurement-control-nav";
import { requireAdminWorkspaceAccess } from "@/lib/route-access";

import "./tracking-workspace.css";

export default async function TrackingLayout({ children }: { children: ReactNode }) {
  await requireAdminWorkspaceAccess();

  return (
    <div className="tracking-workspace">
      <MeasurementControlNav />
      {children}
    </div>
  );
}
