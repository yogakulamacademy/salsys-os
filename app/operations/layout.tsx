import type { ReactNode } from "react";

import { requireOperationsAccess } from "@/lib/operations-access";

export default async function OperationsLayout({ children }: { children: ReactNode }) {
  await requireOperationsAccess();
  return children;
}
