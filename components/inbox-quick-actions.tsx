"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowUpRight, CalendarDays, IndianRupee, MessageCircle, MoreHorizontal, Phone, PhoneCall, X,
} from "lucide-react";

import type { QuickReplies } from "@/lib/inbox-quick-replies";

type ServerAction = (formData: FormData) => void | Promise<void>;

export function InboxQuickActions({
  phone, canCall, profileHref, channel, replies, logAction, stageAction, mock,
}: {
  phone?: string | null;
  canCall: boolean;
  profileHref: string;
  channel: string;
  replies: QuickReplies;
  logAction?: ServerAction;
  stageAction?: ServerAction;
  mock: boolean;
}) {
  const [note, setNote] = useState<string | null>(null);
  const [panel, setPanel] = useState<"none" | "log" | "lost">("none");
  const callNumber = phone?.replace(/[^\d+]/g, "") || "";
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
          <a href={`tel:${callNumber}`} className="ibx-v2-quick-tile" aria-label="Call customer">
            <Phone size={18} /><span>Call</span>
          </a>
        ) : (
          <span className="ibx-v2-quick-tile ibx-v2-quick-disabled" title="Phone contact not available or not verified">
            <Phone size={18} /><span>Call</span>
          </span>
        )}
        <button type="button" className="ibx-v2-quick-tile" disabled={!logAction || mock}
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

      {panel === "log" && logAction ? (
        <form action={logAction} className="ibx-v3-quick-panel">
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
            <button type="submit" className="btn-primary h-9 flex-1">Save call</button>
            <button type="button" className="btn-secondary h-9" onClick={() => setPanel("none")}>Cancel</button>
          </div>
          <p className="text-[10px] text-copy-subtle">Records the call on the lead; nothing is sent.</p>
        </form>
      ) : null}

      {panel === "lost" && stageAction ? (
        <form action={stageAction} className="ibx-v3-quick-panel ibx-v3-quick-panel-danger">
          <input type="hidden" name="stage" value="lost" />
          <p className="text-[12px] font-semibold text-copy-strong">Close this lead as lost?</p>
          <p className="text-[11px] text-copy-muted">It moves to the Lost stage and is recorded in the lead history. You can change the stage back any time.</p>
          <div className="ibx-v3-quick-row">
            <button type="submit" className="h-9 flex-1 rounded-lg bg-rose-700 px-3 text-[12px] font-semibold text-white">Yes, mark lost</button>
            <button type="button" className="btn-secondary h-9" onClick={() => setPanel("none")}>Keep open</button>
          </div>
        </form>
      ) : null}

      {note ? <p role="status" className="ibx-v3-quick-note">{note}</p> : null}
    </section>
  );
}
