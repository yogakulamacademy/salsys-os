import type { ReactNode } from "react";

import { requireOperationsAccess } from "@/lib/operations-access";

export default async function EnrollmentsLayout({ children }: { children: ReactNode }) {
  await requireOperationsAccess();
  return children;
}
