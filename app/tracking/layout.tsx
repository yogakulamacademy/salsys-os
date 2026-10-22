import type { ReactNode } from "react";

import { MeasurementControlNav } from "@/components/marketing/measurement-control-nav";

export default function TrackingLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <MeasurementControlNav />
      {children}
    </div>
  );
}
