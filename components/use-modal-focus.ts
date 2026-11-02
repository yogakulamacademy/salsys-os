"use client";

import { useEffect, useRef, type RefObject } from "react";

const openDialogs: HTMLElement[] = [];

/** Modal-only focus, background inertness and restoration, including nested dialogs. */
export function useModalFocus(open: boolean, ref: RefObject<HTMLElement | null>, onDismiss: () => void) {
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const siblings = new Map<HTMLElement, boolean>();
    for (let node: HTMLElement | null = dialog; node && node !== document.body; node = node.parentElement) {
      for (const sibling of Array.from(node.parentElement?.children ?? [])) {
        if (sibling instanceof HTMLElement && sibling !== node && !sibling.hasAttribute("data-modal-backdrop") && !["SCRIPT", "STYLE", "LINK"].includes(sibling.tagName)) {
          siblings.set(sibling, sibling.inert);
          sibling.inert = true;
        }
      }
    }
    document.body.style.overflow = "hidden";
    openDialogs.push(dialog);
    const items = () => Array.from(dialog.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'))
      .filter(el => el.tabIndex >= 0 && !el.closest("[inert]") && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden");
    const frame = requestAnimationFrame(() => (items().find(el => el.hasAttribute("autofocus")) ?? items()[0] ?? dialog).focus());
    function handleKey(event: KeyboardEvent) {
      if (openDialogs.at(-1) !== dialog) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        dismiss.current();
      } else if (event.key === "Tab") {
        const focusable = items();
        const first = focusable[0], last = focusable.at(-1);
        if (!first) { event.preventDefault(); dialog?.focus(); return; }
        if (!dialog?.contains(document.activeElement) || event.shiftKey && document.activeElement === first) {
          event.preventDefault(); (event.shiftKey ? last : first)?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus();
        }
      }
    }
    document.addEventListener("keydown", handleKey, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKey, true);
      const index = openDialogs.lastIndexOf(dialog);
      if (index >= 0) openDialogs.splice(index, 1);
      for (const [sibling, inert] of siblings) sibling.inert = inert;
      document.body.style.overflow = previousOverflow;
      if (previousActive?.isConnected) previousActive.focus();
    };
  }, [open, ref]);
}
