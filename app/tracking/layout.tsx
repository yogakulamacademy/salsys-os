import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

import { MeasurementControlNav } from "@/components/marketing/measurement-control-nav";
import { requireAdminWorkspaceAccess } from "@/lib/route-access";
import { getTrackingWorkspace } from "@/lib/tracking-data";

import "./tracking-workspace.css";

export default async function TrackingLayout({ children }: { children: ReactNode }) {
  await requireAdminWorkspaceAccess();

  let evidenceWarning: string | null = null;

  try {
    const trackingWorkspace = await getTrackingWorkspace();
    evidenceWarning = trackingWorkspace.fallback
      ? trackingWorkspace.warning
      : null;
  } catch (error) {
    evidenceWarning =
      "Tracking overview evidence is currently unavailable. Source administration remains separate; do not interpret missing overview metrics as zero activity.";
    console.error(
      "Tracking overview evidence unavailable:",
      error instanceof Error ? error.message : String(error),
    );
  }

  return (
    <div className="tracking-workspace">
      <MeasurementControlNav />
      {evidenceWarning ? (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">Reduced tracking evidence</div>
            <p className="mt-1 text-xs leading-5">{evidenceWarning}</p>
          </div>
        </div>
      ) : null}
      {children}
    </div>
  );
}
