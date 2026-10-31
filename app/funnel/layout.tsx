import type { ReactNode } from "react";

import { requirePrivilegedWorkspaceAccess } from "@/lib/route-access";

export default async function FunnelLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requirePrivilegedWorkspaceAccess();
  return children;
}
