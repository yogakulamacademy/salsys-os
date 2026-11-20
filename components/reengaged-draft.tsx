"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { draftReengageMessageAction } from "@/app/re-engaged/draft-actions";
import { toast } from "@/lib/toast";

/** Same key the Inbox composer restores drafts from. */
function draftKey(leadId: string, channel: string) {
  return `salsysos:conversation-draft:v1:${leadId}:${channel}`;
}

/** "Draft message" on an Act now card: AI drafts, you edit, the Inbox sends. */
export function ReengageDraft({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState<string | null>(null);
  const [channel, setChannel] = useState<string>("instagram");
  const [handoff, setHandoff] = useState(false);
  const [pending, start] = useTransition();

  const generate = () =>
    start(async () => {
      const r = await draftReengageMessageAction(leadId);
      if (!r.ok) {
        toast.error("Couldn't draft a message", { description: r.error, onRetry: generate });
        return;
      }
      setDraft(r.draft);
      setChannel(r.channel);
      setHandoff(r.handoff);
    });

  const useInInbox = () => {
    if (!draft?.trim()) return;
    try { window.localStorage.setItem(draftKey(leadId, channel), draft); } catch { /* storage off: open anyway */ }
    router.push(`/conversations?lead=${encodeURIComponent(leadId)}`);
  };

  if (draft == null) {
    return (
      <button type="button" onClick={generate} disabled={pending} className="btn-secondary" data-testid="reengage-draft">
        {pending ? "Drafting…" : "Draft message"}
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-violet-200 bg-violet-50/60 p-3">
      <div className="flex items-center justify-between text-[10.5px] font-bold uppercase tracking-wide text-violet-700">
        <span>AI draft · you approve · {channel === "whatsapp" ? "WhatsApp" : channel === "website" ? "Email" : "Instagram"}</span>
        {handoff ? <span className="text-amber-700">Check before sending</span> : null}
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={4}
        className="mt-2 w-full resize-y rounded-lg border border-violet-200 bg-white p-2 text-[13px] leading-5 text-slate-800 outline-none focus:border-violet-400"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={useInInbox} className="btn-primary">Review & send in Inbox</button>
        <button type="button" onClick={generate} disabled={pending} className="btn-secondary">{pending ? "Drafting…" : "Another version"}</button>
        <button type="button" onClick={() => setDraft(null)} className="btn-secondary">Discard</button>
      </div>
    </div>
  );
}
