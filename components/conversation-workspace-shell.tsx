"use client";

import Link from "next/link";
import { ArrowLeft, PanelRightClose, PanelRightOpen, Sparkles, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
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
  const searchParams = useSearchParams();
  const [desktopContextOpen, setDesktopContextOpen] = useState(true);
  const [mobileContextOpen, setMobileContextOpen] = useState(false);
  const [wideLayout, setWideLayout] = useState(false);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const drawerRef = useRef<HTMLElement | null>(null);
  const mobileBarTriggerRef = useRef<HTMLButtonElement | null>(null);
  const tabletTriggerRef = useRef<HTMLButtonElement | null>(null);
  const showDesktopContext = hasConversation && desktopContextOpen && wideLayout;
  const hasExplicitLeadSelection = Boolean(searchParams.get("lead"));
  const mobileConversationOpen = hasConversation && hasExplicitLeadSelection;

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const observer = new ResizeObserver(([entry]) => setWideLayout(entry.contentRect.width >= 1020));
    observer.observe(workspace);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!hasConversation) return;

    const onShortcut = (event: KeyboardEvent) => {
      if (event.altKey && event.key.toLowerCase() === "i") {
        if (window.matchMedia("(max-width: 620px)").matches && !mobileConversationOpen) return;
        event.preventDefault();
        if (wideLayout) {
          setDesktopContextOpen((value) => !value);
        } else {
          setMobileContextOpen((value) => !value);
        }
        return;
      }

      if (event.altKey && event.key.toLowerCase() === "r") {
        if (window.matchMedia("(max-width: 620px)").matches && !mobileConversationOpen) return;
        event.preventDefault();
        const reply = document.querySelector<HTMLTextAreaElement>(
          'textarea[name="body"], textarea[id^="reply-draft-"], textarea[id^="whatsapp-reply-draft-"]',
        );
        reply?.focus();
        return;
      }

      if (
        event.key === "Escape" &&
        mobileConversationOpen &&
        !mobileContextOpen &&
        window.matchMedia("(max-width: 620px)").matches
      ) {
        event.preventDefault();
        router.push("/conversations");
      }
    };

    document.addEventListener("keydown", onShortcut);
    return () => document.removeEventListener("keydown", onShortcut);
  }, [hasConversation, mobileContextOpen, mobileConversationOpen, router, wideLayout]);

  useEffect(() => {
    if (!mobileContextOpen) return;

    const previousActive = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const drawer = drawerRef.current;
    document.body.style.overflow = "hidden";

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
      document.body.style.overflow = previousOverflow;
      const trigger = window.matchMedia("(max-width: 620px)").matches
        ? mobileBarTriggerRef.current
        : tabletTriggerRef.current;
      (trigger ?? previousActive)?.focus?.();
    };
  }, [mobileContextOpen]);

  return (
    <>
      <div
        ref={workspaceRef}
        className={`conversation-workspace relative overflow-hidden rounded-panel border border-line bg-surface ${showDesktopContext ? "inbox-context-open" : ""}`}
      >
        <div
          className={`min-h-0 overflow-hidden border-r border-line ${
            mobileConversationOpen ? "hidden min-[621px]:block" : "block"
          }`}
        >
          {inbox}
        </div>

        <div
          className={`min-h-0 min-w-0 overflow-hidden ${
            hasConversation
              ? mobileConversationOpen
                ? "flex flex-col"
                : "hidden min-[621px]:flex min-[621px]:flex-col"
              : "hidden min-[621px]:flex min-[621px]:flex-col"
          }`}
        >
          {hasConversation ? (
            <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-line bg-surface px-2.5 min-[621px]:hidden">
              <Link
                href="/conversations"
                className="inline-flex min-h-10 items-center gap-1.5 rounded-ui px-2.5 text-[12px] font-semibold text-brand-700 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700/40"
              >
                <ArrowLeft size={15} /> Inbox
              </Link>
              <button
                ref={mobileBarTriggerRef}
                type="button"
                onClick={() => setMobileContextOpen(true)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-ui px-2.5 text-[12px] font-semibold text-brand-700 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700/40"
                aria-label="Open customer context"
                aria-expanded={mobileContextOpen}
                title="Open customer context"
              >
                <Sparkles size={14} /> Context
              </button>
            </div>
          ) : null}

          {hasConversation ? <WhatsAppConnectionNotice /> : null}

          <div className="relative min-h-0 flex-1 overflow-hidden">
            <div className="h-full min-h-0">{chat}</div>

            {hasConversation ? (
              <>
                {wideLayout ? <button
                  type="button"
                  onClick={() => setDesktopContextOpen((value) => !value)}
                  className="absolute right-3 top-3 z-30 inline-flex h-9 items-center gap-1.5 rounded-ui border border-line bg-surface/95 px-2.5 text-[12px] font-semibold text-copy-muted shadow-sm backdrop-blur transition hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700/40"
                  aria-label={showDesktopContext ? "Hide customer context" : "Show customer context"}
                  title={`${showDesktopContext ? "Hide customer context" : "Show customer context"} · Alt+I`}
                >
                  {showDesktopContext ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
                  {showDesktopContext ? "Hide context" : "Customer context"}
                </button> : null}

                {!wideLayout ? <button
                  ref={tabletTriggerRef}
                  type="button"
                  onClick={() => setMobileContextOpen(true)}
                  className="absolute right-3 top-3 z-30 hidden h-9 items-center gap-1.5 rounded-ui border border-line bg-surface/95 px-2.5 text-[12px] font-semibold text-brand-700 shadow-sm backdrop-blur focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700/40 min-[621px]:inline-flex"
                  aria-label="Open customer context"
                  aria-expanded={mobileContextOpen}
                  title="Open customer context · Alt+I"
                >
                  <Sparkles size={14} /> Context
                </button> : null}
              </>
            ) : null}
          </div>
        </div>

        {showDesktopContext ? (
          <aside className="inbox-desktop-context min-h-0 overflow-y-auto border-l border-line bg-surface [scrollbar-width:thin]">
            {context}
          </aside>
        ) : null}

        {hasConversation && mobileContextOpen ? (
          <div className="fixed inset-0 z-[160]">
            <button
              type="button"
              aria-label="Close customer context"
              onClick={() => setMobileContextOpen(false)}
              className="absolute inset-0 bg-brand-950/30 backdrop-blur-[1px]"
            />
            <aside
              ref={drawerRef}
              role="dialog"
              aria-modal="true"
              aria-label="Customer context"
              className="absolute inset-y-0 right-0 flex w-full max-w-[370px] flex-col border-l border-line bg-surface shadow-[-18px_0_45px_rgba(19,46,38,0.16)] min-[621px]:max-w-[340px]"
            >
              <div className="flex h-12 shrink-0 items-center justify-between border-b border-line bg-surface px-4">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-copy-strong">
                  <Sparkles size={15} className="text-brand-700" /> Customer context
                </div>
                <button
                  type="button"
                  onClick={() => setMobileContextOpen(false)}
                  className="grid h-10 w-10 place-items-center rounded-ui text-copy-muted transition hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700/40"
                  aria-label="Close customer context"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">{context}</div>
            </aside>
          </div>
        ) : null}
      </div>

      <style>{`
        .conversations-polish {
          --conversation-border: var(--app-border);
          --conversation-surface: var(--app-surface);
          --conversation-muted: var(--app-text-muted);
        }

        .conversations-polish > section:first-of-type h1 {
          font-size: 30px !important;
          line-height: 1.15 !important;
          font-weight: 650 !important;
          letter-spacing: -0.035em !important;
          color: var(--app-brand-900) !important;
        }

        .conversations-polish > section:first-of-type p {
          font-size: 14px !important;
          line-height: 1.55 !important;
          color: var(--app-text-muted) !important;
        }

        .conversation-workspace {
          border-radius: 15px;
          box-shadow: 0 2px 14px rgba(31, 59, 45, 0.035);
        }

        .conversations-polish [class*='text-[8px]'],
        .conversations-polish [class*='text-[9px]'] {
          font-size: 11px !important;
          line-height: 1.45 !important;
        }

        .conversations-polish [class*='text-[10px]'] {
          font-size: 11.5px !important;
          line-height: 1.5 !important;
        }

        .conversation-context-pane {
          background: var(--app-surface) !important;
          color: var(--app-text) !important;
        }

        .conversation-context-pane [class*='text-[11px]'] {
          font-size: 12.5px !important;
          line-height: 1.55 !important;
        }

        .conversation-context-pane [class*='text-[13px]'] {
          font-size: 14px !important;
        }

        .conversation-context-pane section,
        .conversation-context-pane > div {
          border-color: var(--app-border) !important;
        }

        .conversations-polish textarea,
        .conversations-polish input,
        .conversations-polish select {
          font-size: 13px;
        }

        @media (max-width: 620px) {
          .conversations-polish > section:first-of-type h1 {
            font-size: 26px !important;
          }


          .conversation-workspace section.flex.h-full > header {
            padding: 10px 12px !important;
            padding-right: 12px !important;
          }

          .conversation-workspace section.flex.h-full > header > div {
            gap: 8px !important;
          }

          .conversation-workspace section.flex.h-full > header > div > div:first-child {
            width: 34px !important;
            height: 34px !important;
          }

          .conversation-workspace section.flex.h-full > header h2 {
            max-width: min(48vw, 220px);
            font-size: 14px !important;
          }

          .conversation-workspace section.flex.h-full > header [class*='mt-1'] {
            margin-top: 3px !important;
            gap: 4px 6px !important;
            font-size: 11px !important;
            line-height: 1.35 !important;
          }

          .conversation-composer button {
            min-height: 40px;
          }

          .conversation-composer button[aria-label*='Dismiss'] {
            min-width: 40px;
          }

          .conversation-composer textarea {
            min-height: 74px;
            max-height: 28dvh;
          }
        }

        @media (max-height: 680px) and (max-width: 620px) {
          .conversation-composer textarea {
            min-height: 62px;
            max-height: 22dvh;
          }
        }
      `}</style>
    </>
  );
}
