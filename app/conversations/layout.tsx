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
        <div className="inbox-viewport-inner min-w-0">
          <CrmLeadInspectorBridge>
            {children}
            <ConversationCollaborationDock />
            <InstagramWhatsAppHandoffBanner />
          </CrmLeadInspectorBridge>
        </div>
      </div>
      <style>{`
        /* Inbox is flush with the main app header and sidebar, not a centered card.
           Restrict all geometry overrides to this route. Other pages retain the
           standard shell padding and page width. */
        .inbox-standalone-scope {
          height: 100%;
          min-height: 0;
          overflow: hidden;
        }
        .inbox-standalone-scope > .inbox-viewport-inner {
          height: 100%;
          min-height: 0;
          padding: 0 !important;
        }
        .inbox-standalone-scope .inbox-viewport-inner > div:first-child {
          height: 100%;
          min-height: 0;
        }
        .inbox-standalone-scope .ibx-v2 {
          display: flex;
          flex-direction: column;
          height: 100%;
          min-height: 0;
        }
        .inbox-standalone-scope .ibx-v2 .conversation-workspace {
          flex: 1 1 auto;
          height: auto !important;
          min-height: 0 !important;
          width: 100%;
          border: 0 !important;
          border-radius: 0 !important;
          box-shadow: none !important;
        }
        .inbox-standalone-scope .ibx-v2 .conversation-sidebar {
          border-radius: 0 !important;
        }
        /* The chat header and reply composer must stay visible at the bottom.
           Compact/short viewports should scroll the optional AI toolbar, not
           force the composer outside the clipped main-shell viewport. */
        .inbox-standalone-scope .ibx-v2 .ibx-v2-chat {
          min-height: 0;
        }
        .inbox-standalone-scope .ibx-v2 .ibx-v2-chat .ibx-v2-ai-toolbar {
          flex: 0 1 auto;
          min-height: 0;
          overflow-y: auto;
        }
        @media (max-height: 780px) {
          .inbox-standalone-scope .ibx-v2 .ibx-v2-chat .ibx-v2-ai-toolbar {
            max-height: min(24dvh, 160px);
          }
        }
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
