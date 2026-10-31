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

    function handleSubmit(event: SubmitEvent) {
      if (event.defaultPrevented) return;

      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if ((form.method || "get").toLowerCase() !== "get") return;
      if (form.target && form.target !== "_self") return;

      let action: URL;
      try {
        action = new URL(form.action || window.location.href, window.location.origin);
      } catch {
        return;
      }

      if (action.origin !== window.location.origin) return;

      const params = new URLSearchParams(action.search);
      const formData = new FormData(form);
      formData.forEach((value, key) => {
        if (typeof value === "string") params.set(key, value);
      });

      const submitter = event.submitter;
      if (
        (submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement) &&
        submitter.name
      ) {
        params.set(submitter.name, submitter.value);
      }

      const query = params.toString();
      const requested = `${action.pathname}${query ? `?${query}` : ""}${action.hash}`;
      const canonical = canonicalizeWorkspaceHref(requested);
      if (canonical === requested) return;

      event.preventDefault();
      router.push(canonical);
    }

    document.addEventListener("click", handleClick, true);
    document.addEventListener("submit", handleSubmit, true);
    return () => {
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("submit", handleSubmit, true);
    };
  }, [router]);

  return null;
}
