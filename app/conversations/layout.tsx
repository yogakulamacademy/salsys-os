import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { ConversationCollaborationDock } from "@/components/conversation-collaboration-dock";
import { CrmWorkspaceFrame } from "@/components/crm/crm-workspace-frame";
import { InstagramWhatsAppHandoffBanner } from "@/components/instagram-whatsapp-handoff-banner";
import { hasCurrentWorkspaceAccess } from "@/lib/workspace-access";

export const dynamic = "force-dynamic";

export default async function ConversationsLayout({ children }: { children: ReactNode }) {
  const canAccessSales = await hasCurrentWorkspaceAccess("sales");

  if (!canAccessSales) {
    redirect("/dashboard");
  }

  return (
    <CrmWorkspaceFrame>
      {children}
      <ConversationCollaborationDock />
      <InstagramWhatsAppHandoffBanner />
    </CrmWorkspaceFrame>
  );
}
