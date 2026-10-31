"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { canonicalizeWorkspaceHref } from "@/lib/canonical-workspace-routes";

export function CanonicalRouteBridge() {
  const router = useRouter();

  useEffect(() => {
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

      const anchor = target.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.hasAttribute("download")) return;
      if (anchor.target && anchor.target !== "_self") return;

      let url: URL;
      try {
        url = new URL(anchor.href, window.location.origin);
      } catch {
        return;
      }

      if (url.origin !== window.location.origin) return;

      const requested = `${url.pathname}${url.search}${url.hash}`;
      const canonical = canonicalizeWorkspaceHref(requested);
      if (canonical === requested) return;

      event.preventDefault();
      router.push(canonical);
    }

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [router]);

  return null;
}
