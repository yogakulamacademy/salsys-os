import type { ReactNode } from "react";

import { requirePrivilegedWorkspaceAccess } from "@/lib/route-access";

export default async function MarketingLayout({ children }: { children: ReactNode }) {
  await requirePrivilegedWorkspaceAccess();
  return children;
}
