import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { ConversationCollaborationDock } from "@/components/conversation-collaboration-dock";
import { CrmLeadInspectorBridge } from "@/components/crm/crm-lead-inspector-bridge";
import { InstagramWhatsAppHandoffBanner } from "@/components/instagram-whatsapp-handoff-banner";
import workspaceStyles from "@/components/marketing/marketing-workspace-frame.module.css";
import { hasCurrentWorkspaceAccess } from "@/lib/workspace-access";

export const dynamic = "force-dynamic";

// Inbox is a first-class SalsysOS workspace. Keep the shared main shell and
// existing conversation collaboration/lead-inspection tools, without nesting
// it inside the CRM workspace frame or its secondary navigation.
export default async function ConversationsLayout({ children }: { children: ReactNode }) {
  const canAccessSales = await hasCurrentWorkspaceAccess("sales");

  if (!canAccessSales) {
    redirect("/dashboard");
  }

  return (
    <>
      <div className={`inbox-standalone-scope ${workspaceStyles.studio}`}>
        <div className="min-w-0 pb-8">
          <CrmLeadInspectorBridge>
            {children}
            <ConversationCollaborationDock />
            <InstagramWhatsAppHandoffBanner />
          </CrmLeadInspectorBridge>
        </div>
      </div>
      <style>{`
        /* The full-height Inbox must not be clipped by a transformed route
           animation and must remain aligned with the main SalsysOS shell. */
        .page-transition:has(.inbox-standalone-scope) {
          animation: none !important;
          transform: none !important;
        }
        body:has(.inbox-standalone-scope) .legacy-shell-host > div {
          background: var(--app-bg) !important;
          color: var(--app-text) !important;
        }
        body:has(.inbox-standalone-scope) .legacy-shell-host main {
          background: var(--app-bg);
        }
      `}</style>
    </>
  );
}
