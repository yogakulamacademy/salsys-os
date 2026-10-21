"use client";

import { useEffect, useRef, useState } from "react";

import { LeadInspector } from "@/components/crm/lead-inspector";

export function CrmLeadInspectorBridge({ children }: { children: React.ReactNode }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [leadId, setLeadId] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

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

      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }

      if (url.origin !== window.location.origin) return;

      const match = url.pathname.match(/^\/leads\/([^/]+)\/?$/);
      const candidate = match?.[1] ? decodeURIComponent(match[1]) : "";
      if (!candidate || candidate === "new") return;

      event.preventDefault();
      setLeadId(candidate);
    }

    host.addEventListener("click", handleClick);
    return () => host.removeEventListener("click", handleClick);
  }, []);

  return (
    <>
      <div ref={hostRef}>{children}</div>
      <LeadInspector leadId={leadId} onClose={() => setLeadId(null)} />
    </>
  );
}
