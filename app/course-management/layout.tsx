import type { ReactNode } from "react";

import { OperationsJourneyBar } from "@/components/operations/operations-journey-bar";

export default function CourseManagementLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <OperationsJourneyBar />
      {children}
    </div>
  );
}
