import type { ReactNode } from "react";

import { OperationsJourneyBar } from "@/components/operations/operations-journey-bar";
import { requireOperationsAccess } from "@/lib/operations-access";

import "./course-management-violet.css";

export default async function CourseManagementLayout({ children }: { children: ReactNode }) {
  await requireOperationsAccess();

  return (
    <div className="course-management-scope">
      <OperationsJourneyBar />
      {children}
    </div>
  );
}
