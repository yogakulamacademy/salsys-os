import type { ReactNode } from "react";

import { OperationsJourneyBar } from "@/components/operations/operations-journey-bar";

import "./course-management-violet.css";

export default function CourseManagementLayout({ children }: { children: ReactNode }) {
  return (
    <div className="course-management-scope">
      <OperationsJourneyBar />
      {children}
    </div>
  );
}
