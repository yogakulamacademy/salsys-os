"use client";

import { PanelRightClose, PanelRightOpen, Sparkles, X } from "lucide-react";
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
  const [desktopContextOpen, setDesktopContextOpen] = useState(true);
  const [mobileContextOpen, setMobileContextOpen] = useState(false);
  const showDesktopContext = hasConversation && desktopContextOpen;

  return (
    <div
      className={`relative grid min-h-[620px] overflow-hidden rounded-2xl border border-[#DDE7DF] bg-white shadow-[0_1px_2px_rgba(20,52,42,0.04)] dark:border-slate-800 dark:bg-slate-950 lg:h-[calc(100dvh-190px)] ${
        showDesktopContext
          ? "lg:grid-cols-[300px_minmax(0,1fr)_310px]"
          : "lg:grid-cols-[300px_minmax(0,1fr)]"
      }`}
    >
      <div className="min-h-0 overflow-hidden border-r border-[#E4EAE6] dark:border-slate-800">
        {inbox}
      </div>

      <div className="relative min-h-0 min-w-0 overflow-hidden">
        {chat}

        {hasConversation ? (
          <>
            <button
              type="button"
              onClick={() => setDesktopContextOpen((value) => !value)}
              className="absolute right-3 top-3 z-30 hidden h-8 items-center gap-1.5 rounded-lg border border-[#DDE7DF] bg-white/95 px-2.5 text-[10px] font-semibold text-[#61736A] shadow-sm backdrop-blur transition hover:bg-[#F4F8F5] hover:text-[#216551] dark:border-slate-800 dark:bg-slate-950/95 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white lg:inline-flex"
              aria-label={
                showDesktopContext
                  ? "Hide conversation intelligence"
                  : "Show conversation intelligence"
              }
              title={showDesktopContext ? "Hide intelligence" : "Show intelligence"}
            >
              {showDesktopContext ? (
                <PanelRightClose size={14} />
              ) : (
                <PanelRightOpen size={14} />
              )}
              {showDesktopContext ? "Hide insights" : "Insights"}
            </button>

            <button
              type="button"
              onClick={() => setMobileContextOpen(true)}
              className="absolute right-3 top-3 z-30 inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#DDE7DF] bg-white/95 px-2.5 text-[10px] font-semibold text-[#216551] shadow-sm backdrop-blur lg:hidden"
              aria-label="Open conversation intelligence"
            >
              <Sparkles size={13} /> Insights
            </button>
          </>
        ) : null}
      </div>

      {showDesktopContext ? (
        <aside className="hidden min-h-0 overflow-y-auto border-l border-[#E4EAE6] bg-[#F7F9F8] dark:border-slate-800 dark:bg-slate-900/20 lg:block">
          {context}
        </aside>
      ) : null}

      {hasConversation && mobileContextOpen ? (
        <div className="absolute inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close conversation intelligence"
            onClick={() => setMobileContextOpen(false)}
            className="absolute inset-0 bg-slate-950/25 backdrop-blur-[1px]"
          />
          <aside className="absolute inset-y-0 right-0 flex w-full max-w-[390px] flex-col border-l border-[#DDE7DF] bg-[#F7F9F8] shadow-[-18px_0_45px_rgba(19,46,38,0.16)]">
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-[#E4EAE6] bg-white px-4">
              <div className="flex items-center gap-2 text-[11px] font-semibold text-[#203B31]">
                <Sparkles size={13} className="text-[#216551]" /> Customer intelligence
              </div>
              <button
                type="button"
                onClick={() => setMobileContextOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-lg text-[#7D8C84] hover:bg-[#F0F5F1] hover:text-[#216551]"
                aria-label="Close insights"
              >
                <X size={15} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{context}</div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
