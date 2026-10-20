"use client";

import { PanelRightClose, PanelRightOpen } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

export function ConversationWorkspaceShell({
  inbox,
  chat,
  context,
  hasConversation,
}: {
  inbox: ReactNode;
  chat: ReactNode;
  context: ReactNode;
  hasConversation: boolean;
}) {
  const [contextOpen, setContextOpen] = useState(true);

  return (
    <div
      className={`relative grid min-h-[620px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-950 lg:h-[calc(100dvh-190px)] ${
        contextOpen
          ? "lg:grid-cols-[300px_minmax(0,1fr)_290px]"
          : "lg:grid-cols-[300px_minmax(0,1fr)]"
      }`}
    >
      <div className="min-h-0 overflow-hidden border-r border-slate-200 dark:border-slate-800">
        {inbox}
      </div>

      <div className="relative min-h-0 min-w-0 overflow-hidden">
        {chat}
        {hasConversation ? (
          <button
            type="button"
            onClick={() => setContextOpen((value) => !value)}
            className="absolute right-3 top-3 z-30 hidden h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white/95 px-2.5 text-[11px] font-semibold text-slate-500 shadow-sm backdrop-blur transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-950/95 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white lg:inline-flex"
            aria-label={contextOpen ? "Hide conversation context" : "Show conversation context"}
            title={contextOpen ? "Hide context" : "Show context"}
          >
            {contextOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
            {contextOpen ? "Hide context" : "Context"}
          </button>
        ) : null}
      </div>

      {contextOpen ? (
        <aside className="hidden min-h-0 overflow-y-auto border-l border-slate-200 bg-slate-50/35 dark:border-slate-800 dark:bg-slate-900/20 lg:block">
          {context}
        </aside>
      ) : null}
    </div>
  );
}
