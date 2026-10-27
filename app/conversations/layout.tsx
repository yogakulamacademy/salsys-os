import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { ConversationCollaborationDock } from "@/components/conversation-collaboration-dock";
import { hasCurrentWorkspaceAccess } from "@/lib/workspace-access";

export const dynamic = "force-dynamic";

export default async function ConversationsLayout({ children }: { children: ReactNode }) {
  const canAccessSales = await hasCurrentWorkspaceAccess("sales");

  if (!canAccessSales) {
    redirect("/dashboard");
  }

  return (
    <>
      {children}
      <ConversationCollaborationDock />
    </>
  );
}
