import type { ReactNode } from "react";

import { ConversationCollaborationDock } from "@/components/conversation-collaboration-dock";

export default function ConversationsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <ConversationCollaborationDock />
    </>
  );
}