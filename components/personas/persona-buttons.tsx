"use client";

import { useTransition } from "react";

import { approveAllPersonasAction, approvePersonaAction, refreshPersonasAction } from "@/app/personas/actions";
import { toast } from "@/lib/toast";

type Kind = "refresh" | "approve" | "approve-all";

/** Re-learn, approve one, or approve all. Results show as a toast. */
export function PersonaButton({ kind, personaId, label, primary = false }: { kind: Kind; personaId?: string; label: string; primary?: boolean }) {
  const [pending, start] = useTransition();
  const run = () =>
    start(async () => {
      const result =
        kind === "refresh" ? await refreshPersonasAction()
          : kind === "approve-all" ? await approveAllPersonasAction()
          : await approvePersonaAction(personaId ?? "");
      if (result.ok) toast.success(result.message);
      else toast.error("Couldn't update personas", { description: result.message, onRetry: run });
    });
  return (
    <button type="button" onClick={run} disabled={pending} className={primary ? "btn-primary" : "btn-secondary"}>
      {pending ? (kind === "refresh" ? "Learning…" : "Saving…") : label}
    </button>
  );
}
