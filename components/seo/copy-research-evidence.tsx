"use client";

import { useState } from "react";
import { ClipboardCopy, Check, AlertCircle } from "lucide-react";

export function CopyResearchEvidence({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-violet-700 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-violet-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
      >
        {state === "copied" ? <Check size={15} aria-hidden /> : <ClipboardCopy size={15} aria-hidden />}
        Copy evidence outline
      </button>
      <span role="status" aria-live="polite" className="inline-flex items-center gap-1 text-xs text-slate-500">
        {state === "copied" ? "Copied locally — review before reuse." : null}
        {state === "failed" ? (
          <><AlertCircle size={13} aria-hidden /> Copy unavailable in this browser.</>
        ) : null}
      </span>
    </div>
  );
}
