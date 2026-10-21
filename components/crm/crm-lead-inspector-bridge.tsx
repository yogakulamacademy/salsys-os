"use client";

import { useEffect, useRef, useState } from "react";

import { LeadInspector } from "@/components/crm/lead-inspector";

export function CrmLeadInspectorBridge({ children }: { children: React.ReactNode }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [leadId, setLeadId] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    function openLeadFromHref(href: string) {
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return false;
      }

      if (url.origin !== window.location.origin) return false;

      const match = url.pathname.match(/^\/leads\/([^/]+)\/?$/);
      const candidate = match?.[1] ? decodeURIComponent(match[1]) : "";
      if (!candidate || candidate === "new") return false;

      setLeadId(candidate);
      return true;
    }

    function handleClick(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || !host.contains(anchor)) return;
      if (anchor.dataset.nativeLeadNavigation === "true") return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;

      if (openLeadFromHref(anchor.href)) {
        event.preventDefault();
      }
    }

    host.addEventListener("click", handleClick);

    /*
     * Leads still contains the pre-Studio local preview while that large table
     * component is being migrated incrementally. When it appears, promote the
     * same authorized Lead into the shared Inspector and immediately dismiss
     * the legacy preview. This compatibility path is intentionally scoped to
     * the old drawer's unique aria label and exact /leads/:id profile link; it
     * does not infer IDs from text, table position, or browser-local state.
     */
    const observer = new MutationObserver(() => {
      const legacyClose = host.querySelector<HTMLButtonElement>(
        'button[aria-label="Close lead preview"]',
      );
      if (!legacyClose) return;

      const legacyDrawer = legacyClose.closest("aside");
      const profileLink = legacyDrawer?.querySelector<HTMLAnchorElement>(
        'a[href^="/leads/"]',
      );
      if (!profileLink) return;

      if (openLeadFromHref(profileLink.href)) {
        legacyClose.click();
      }
    });

    observer.observe(host, { childList: true, subtree: true });

    return () => {
      host.removeEventListener("click", handleClick);
      observer.disconnect();
    };
  }, []);

  return (
    <>
      <div ref={hostRef}>{children}</div>
      <LeadInspector leadId={leadId} onClose={() => setLeadId(null)} />
    </>
  );
}
