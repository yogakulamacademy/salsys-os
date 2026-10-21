"use client";

import Link from "next/link";
import { ArrowLeft, PanelRightClose, PanelRightOpen, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { WhatsAppConnectionNotice } from "@/components/whatsapp-connection-notice";

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
  const router = useRouter();
  const [desktopContextOpen, setDesktopContextOpen] = useState(true);
  const [mobileContextOpen, setMobileContextOpen] = useState(false);
  const drawerRef = useRef<HTMLElement | null>(null);
  const drawerTriggerRef = useRef<HTMLButtonElement | null>(null);
  const showDesktopContext = hasConversation && desktopContextOpen;

  useEffect(() => {
    if (!hasConversation) return;

    const onShortcut = (event: KeyboardEvent) => {
      if (event.altKey && event.key.toLowerCase() === "i") {
        event.preventDefault();
        if (window.matchMedia("(min-width: 1171px)").matches) {
          setDesktopContextOpen((value) => !value);
        } else {
          setMobileContextOpen((value) => !value);
        }
        return;
      }

      if (event.altKey && event.key.toLowerCase() === "r") {
        event.preventDefault();
        const reply = document.querySelector<HTMLTextAreaElement>(
          'textarea[name="body"], textarea[id^="reply-draft-"], textarea[id^="whatsapp-reply-draft-"]',
        );
        reply?.focus();
        return;
      }

      if (
        event.key === "Escape" &&
        !mobileContextOpen &&
        window.matchMedia("(max-width: 620px)").matches
      ) {
        event.preventDefault();
        router.push("/conversations");
      }
    };

    document.addEventListener("keydown", onShortcut);
    return () => document.removeEventListener("keydown", onShortcut);
  }, [hasConversation, mobileContextOpen, router]);

  useEffect(() => {
    if (!mobileContextOpen) return;

    const previousActive = document.activeElement as HTMLElement | null;
    const drawer = drawerRef.current;
    const focusables = () =>
      drawer
        ? Array.from(
            drawer.querySelectorAll<HTMLElement>(
              'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
            ),
          ).filter((element) => !element.hasAttribute("hidden"))
        : [];

    requestAnimationFrame(() => focusables()[0]?.focus());

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileContextOpen(false);
        return;
      }

      if (event.key !== "Tab") return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      (drawerTriggerRef.current ?? previousActive)?.focus?.();
    };
  }, [mobileContextOpen]);

  return (
    <div
      className={`relative min-h-[540px] overflow-hidden rounded-2xl border border-[#DCE4DF] bg-white shadow-[0_4px_18px_rgba(21,62,51,0.03)] dark:border-slate-800 dark:bg-slate-950 min-[621px]:grid min-[621px]:h-[calc(100dvh-199px)] min-[621px]:min-h-[590px] min-[621px]:grid-cols-[270px_minmax(0,1fr)] min-[1171px]:grid-cols-[285px_minmax(310px,1fr)] min-[1700px]:grid-cols-[320px_minmax(400px,1fr)] ${
        showDesktopContext
          ? "min-[1171px]:grid-cols-[285px_minmax(310px,1fr)_284px] min-[1700px]:grid-cols-[320px_minmax(400px,1fr)_310px]"
          : ""
      }`}
    >
      <div
        className={`min-h-0 overflow-hidden border-r border-[#DCE4DF] dark:border-slate-800 ${
          hasConversation ? "hidden min-[621px]:block" : "block"
        }`}
      >
        {inbox}
      </div>

      <div
        className={`min-h-0 min-w-0 overflow-hidden ${
          hasConversation ? "flex flex-col" : "hidden min-[621px]:block"
        }`}
      >
        {hasConversation ? (
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#DCE4DF] bg-white px-3 dark:border-slate-800 dark:bg-slate-950 min-[621px]:hidden">
            <Link
              href="/conversations"
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-[#216551] hover:bg-[#EDF3E6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#216551]"
            >
              <ArrowLeft size={13} /> Inbox
            </Link>
            <span className="text-[9px] text-[#596E64]">Conversation</span>
          </div>
        ) : null}

        {hasConversation ? <WhatsAppConnectionNotice /> : null}

        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div className="h-full min-h-0">{chat}</div>

          {hasConversation ? (
            <>
              <button
                type="button"
                onClick={() => setDesktopContextOpen((value) => !value)}
                className="absolute right-3 top-3 z-30 hidden h-8 items-center gap-1.5 rounded-lg border border-[#DCE4DF] bg-white/95 px-2.5 text-[10px] font-semibold text-[#596E64] shadow-sm backdrop-blur transition hover:bg-[#EDF3E6] hover:text-[#216551] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#216551] dark:border-slate-800 dark:bg-slate-950/95 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white min-[1171px]:inline-flex"
                aria-label={showDesktopContext ? "Hide CRM inspector" : "Show CRM inspector"}
                title={`${showDesktopContext ? "Hide CRM inspector" : "Show CRM inspector"} · Alt+I`}
              >
                {showDesktopContext ? (
                  <PanelRightClose size={14} />
                ) : (
                  <PanelRightOpen size={14} />
                )}
                {showDesktopContext ? "Hide context" : "Lead context"}
              </button>

              <button
                ref={drawerTriggerRef}
                type="button"
                onClick={() => setMobileContextOpen(true)}
                className="absolute right-3 top-3 z-30 inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#DCE4DF] bg-white/95 px-2.5 text-[10px] font-semibold text-[#216551] shadow-sm backdrop-blur focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#216551] dark:border-slate-800 dark:bg-slate-950/95 min-[1171px]:hidden"
                aria-label="Open CRM inspector"
                aria-expanded={mobileContextOpen}
                title="Open CRM inspector · Alt+I"
              >
                <Sparkles size={13} /> Lead context
              </button>
            </>
          ) : null}
        </div>
      </div>

      {showDesktopContext ? (
        <aside className="hidden min-h-0 overflow-y-auto border-l border-[#DCE4DF] bg-[#FDFEFB] [scrollbar-width:thin] dark:border-slate-800 dark:bg-slate-900/20 min-[1171px]:block">
          {context}
        </aside>
      ) : null}

      {hasConversation && mobileContextOpen ? (
        <div className="fixed inset-0 z-50 min-[1171px]:hidden">
          <button
            type="button"
            aria-label="Close CRM inspector"
            onClick={() => setMobileContextOpen(false)}
            className="absolute inset-0 bg-[#123A32]/30 backdrop-blur-[1px]"
          />
          <aside
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="CRM inspector"
            className="absolute inset-y-0 right-0 flex w-full max-w-[350px] flex-col border-l border-[#DCE4DF] bg-[#FDFEFB] shadow-[-18px_0_45px_rgba(19,46,38,0.16)] dark:border-slate-800 dark:bg-slate-950 min-[621px]:max-w-[320px]"
          >
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-[#DCE4DF] bg-white px-4 dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-center gap-2 text-[11px] font-semibold text-[#18362D] dark:text-slate-100">
                <Sparkles size={13} className="text-[#216551]" /> CRM inspector
              </div>
              <button
                type="button"
                onClick={() => setMobileContextOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-lg text-[#596E64] hover:bg-[#EDF3E6] hover:text-[#216551] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#216551]"
                aria-label="Close CRM inspector"
              >
                <X size={15} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">{context}</div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
