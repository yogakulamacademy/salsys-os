import type { ReactNode } from "react";

import { VendorWorkspaceNotice } from "@/components/vendor-workspace-notice";
import { requirePrivilegedWorkspaceAccess } from "@/lib/route-access";

export default async function WhatsAppPilotLayout({
  children,
}: {
  children: ReactNode;
}) {
  const workspace = await requirePrivilegedWorkspaceAccess();
  const canReviewPilot = workspace.role === "owner" || workspace.role === "admin";

  return (
    <>
      {canReviewPilot ? <VendorWorkspaceNotice kind="deskcomm" /> : null}
      {children}
    </>
  );
}
