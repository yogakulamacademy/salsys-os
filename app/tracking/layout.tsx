import type { ReactNode } from "react";

import { MeasurementControlNav } from "@/components/marketing/measurement-control-nav";

import "./tracking-workspace.css";

export default function TrackingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="tracking-workspace">
      <MeasurementControlNav />
      {children}
    </div>
  );
}
