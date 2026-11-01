import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { canAccessEducationOperationsForCurrentWorkspace } from "@/lib/education-access";

export async function EducationOperationsGuard({
  children,
}: {
  children: ReactNode;
}) {
  const allowed = await canAccessEducationOperationsForCurrentWorkspace();

  if (!allowed) {
    notFound();
  }

  return <>{children}</>;
}
