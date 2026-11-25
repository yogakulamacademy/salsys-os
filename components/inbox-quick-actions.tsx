"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import {
  ArrowUpRight, CalendarDays, IndianRupee, MessageCircle, MoreHorizontal, Phone, PhoneCall, X,
} from "lucide-react";

import { LogCallPanel } from "@/components/log-call-panel";
import type { QuickReplies } from "@/lib/inbox-quick-replies";
import { showInboxToast } from "@/lib/inbox-toast";

/** Inline actions: return what happened instead of navigating (20 Nov 2026). */
type ServerAction = (formData: FormData) => Promise<{ ok: boolean; message: string }>;

export function InboxQuickActions({
  phone, canCall, profileHref, channel, replies, logAction, callAction, leadId, leadName, stageAction, mock,
}: {
  phone?: string | null;
  canCall: boolean;
  profileHref: string;
  channel: string;
  replies: QuickReplies;
  logAction?: ServerAction;
  /** Log a call in two taps (25 Nov 2026). */
  callAction?: ServerAction;
  leadId?: string;
  leadName?: string;
  stageAction?: ServerAction;
  mock: boolean;
}) {
  const [note, setNote] = useState<string | null>(null);
  const [panel, setPanel] = useState<"none" | "log" | "lost">("none");
  const [pending, startTransition] = useTransition();
  const submitInline = (action: ServerAction | undefined) => (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!action || pending) return;
    const formData = new FormData(event.currentTarget);
    const attempt = () => startTransition(async () => {
      const result = await action(formData);
      showInboxToast(result.message, result.ok ? "success" : "error", result.ok ? undefined : attempt);
      if (result.ok) setPanel("none");
    });
    attempt();
  };
  const callNumber = phone?.replace(/[^\d+]/g, "") || "";
  const [callPrompt, setCallPrompt] = useState<string | null>(null);
  // After tapping Call, ask how it went when they come back to the CRM.
  const CALL_KEY = "crm:last-call";
  const rememberCall = () => {
    try { if (leadId) sessionStorage.setItem(CALL_KEY, JSON.stringify({ leadId, at: Date.now() })); } catch { /* storage may be blocked */ }
  };
  useEffect(() => {
    if (!leadId || !callAction) return;
    const check = () => {
      if (document.visibilityState !== "visible") return;
      try {
        const raw = sessionStorage.getItem(CALL_KEY);
        if (!raw) return;
        const last = JSON.parse(raw) as { leadId?: string; at?: number };
        if (last.leadId !== leadId || !last.at) return;
        const mins = Math.round((Date.now() - last.at) / 60_000);
        if (Date.now() - last.at < 5_000 || mins > 120) return;
        sessionStorage.removeItem(CALL_KEY);
        setCallPrompt(mins < 1 ? "You tapped their number just now" : `You tapped their number ${mins} minute${mins === 1 ? "" : "s"} ago`);
        setPanel("log");
      } catch { /* ignore */ }
    };
    check();
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => { document.removeEventListener("visibilitychange", check); window.removeEventListener("focus", check); };
  }, [leadId, callAction]);
  const isInstagram = channel === "instagram";

  // Put a draft in the reply box. Composers listen for this event for their own channel.
  // The text is also copied, in case this channel only allows a template right now.
  const fill = async (body: string, label: string) => {
    window.dispatchEvent(new CustomEvent("crm:copilot-draft", { detail: { channel, body, source: "quick_reply" } }));
    let copied = false;
    try { await navigator.clipboard.writeText(body); copied = true; } catch { /* clipboard may be blocked */ }
    setNote(`${label} draft is in the reply box${copied ? " (also copied)" : ""}. Check it, then send.`);
    setPanel("none");
  };

  return (
    <section className="ibx-v2-quick-actions" aria-label="Quick actions">
      <div className="ibx-v2-context-card-head"><MoreHorizontal size={17} /><h3>Quick actions</h3></div>
      <div className="ibx-v2-quick-grid ibx-v3-quick-grid-6">
        <button type="button" className="ibx-v2-quick-tile" onClick={() => void fill(replies.fees, "Fees")}
          title="Fill the reply with fees and upcoming batches">
          <IndianRupee size={18} /><span>Send fees</span>
        </button>
        <button type="button" className="ibx-v2-quick-tile" onClick={() => void fill(replies.dates, "Batch dates")}
          title="Fill the reply with the next batch dates">
          <CalendarDays size={18} /><span>Batch dates</span>
        </button>
        {isInstagram ? (
          <button type="button" className="ibx-v2-quick-tile" onClick={() => void fill(replies.whatsapp, "WhatsApp request")}
            title="Ask for their WhatsApp number to continue there">
            <MessageCircle size={18} /><span>Ask for WhatsApp</span>
          </button>
        ) : canCall && callNumber ? (
          <a href={`tel:${callNumber}`} onClick={rememberCall} className="ibx-v2-quick-tile" aria-label="Call customer">
            <Phone size={18} /><span>Call</span>
          </a>
        ) : (
          <span className="ibx-v2-quick-tile ibx-v2-quick-disabled" title="Phone contact not available or not verified">
            <Phone size={18} /><span>Call</span>
          </span>
        )}
        <button type="button" className="ibx-v2-quick-tile" disabled={!(callAction || logAction) || mock}
          aria-expanded={panel === "log"} onClick={() => setPanel(panel === "log" ? "none" : "log")}
          title="Record a call you made or received">
          <PhoneCall size={18} /><span>Log call</span>
        </button>
        <button type="button" className="ibx-v2-quick-tile ibx-v3-quick-danger" disabled={!stageAction || mock}
          aria-expanded={panel === "lost"} onClick={() => setPanel(panel === "lost" ? "none" : "lost")}
          title="Close this lead as lost">
          <X size={18} /><span>Not interested</span>
        </button>
        <Link href={profileHref} className="ibx-v2-quick-tile" title="Open the full lead profile">
          <ArrowUpRight size={18} /><span>Profile</span>
        </Link>
      </div>

      {panel === "log" && callAction ? (
        <LogCallPanel compact leadName={leadName ?? "them"} action={callAction} prompt={callPrompt}
          onDone={() => { setPanel("none"); setCallPrompt(null); }}
          onCancel={() => { setPanel("none"); setCallPrompt(null); }} />
      ) : null}

      {panel === "log" && !callAction && logAction ? (
        <form onSubmit={submitInline(logAction)} className="ibx-v3-quick-panel">
          <input type="hidden" name="channel" value="phone" />
          <input type="hidden" name="return_to" value="conversations" />
          <div className="ibx-v3-quick-row">
            <label className="sr-only" htmlFor="quick-log-direction">Who called</label>
            <select id="quick-log-direction" name="direction" defaultValue="outbound" className="input h-9 text-[12px]">
              <option value="outbound">We called</option>
              <option value="inbound">They called</option>
            </select>
          </div>
          <label className="sr-only" htmlFor="quick-log-body">What happened on the call</label>
          <input id="quick-log-body" name="body" required className="input h-9 text-[12px]"
            placeholder="What happened? e.g. Interested in March batch, call back Friday" />
          <div className="ibx-v3-quick-row">
            <button type="submit" disabled={pending} className="btn-primary h-9 flex-1">{pending ? "Saving…" : "Save call"}</button>
            <button type="button" className="btn-secondary h-9" onClick={() => setPanel("none")}>Cancel</button>
          </div>
          <p className="text-[10px] text-copy-subtle">Records the call on the lead; nothing is sent.</p>
        </form>
      ) : null}

      {panel === "lost" && stageAction ? (
        <form onSubmit={submitInline(stageAction)} className="ibx-v3-quick-panel ibx-v3-quick-panel-danger">
          <input type="hidden" name="stage" value="lost" />
          <p className="text-[12px] font-semibold text-copy-strong">Close this lead as lost?</p>
          <p className="text-[11px] text-copy-muted">It moves to the Lost stage and is recorded in the lead history. You can change the stage back any time.</p>
          <div className="ibx-v3-quick-row">
            <button type="submit" disabled={pending} className="h-9 flex-1 rounded-lg bg-rose-700 px-3 text-[12px] font-semibold text-white disabled:opacity-60">{pending ? "Saving…" : "Yes, mark lost"}</button>
            <button type="button" className="btn-secondary h-9" onClick={() => setPanel("none")}>Keep open</button>
          </div>
        </form>
      ) : null}

      {note ? <p role="status" className="ibx-v3-quick-note">{note}</p> : null}
    </section>
  );
}
