import Link from "next/link";
import { Bot } from "lucide-react";

import { Panel } from "@/components/home/command-center/panel";
import { HANDOVER_LABELS, type HandoverReason } from "@/lib/autopilot-live";
import { createClient } from "@/lib/supabase/server";

/** Home: leads the AI handed to the team, AI follow-ups ready to send, and Autopilot today. */
export async function AiAutopilotPanel() {
  const supabase = await createClient();
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const [{ data: handed, count: handedCount }, { count: active }, { count: sentToday }, { data: followups }] = await Promise.all([
    supabase.from("ai_autopilot_leads").select("lead_id, handover_reason, handover_detail, handed_over_at, leads(display_name)", { count: "exact" })
      .eq("status", "handed_over").order("handed_over_at", { ascending: false }).limit(3),
    supabase.from("ai_autopilot_leads").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("ai_autopilot_runs").select("id", { count: "exact", head: true }).eq("mode", "autopilot").eq("status", "sent").gte("created_at", since),
    supabase.from("tasks").select("id, metadata").eq("created_by_id", "ai_followup_detection_v1").eq("status", "open").lte("due_at", new Date().toISOString()).limit(200),
  ]);
  const readyFollowups = (followups ?? []).filter((t) => typeof (t.metadata as Record<string, unknown> | null)?.ai_draft === "string").length;
  const dueFollowups = (followups ?? []).length;
  const list = handed ?? [];
  return (
    <Panel id="home-ai-autopilot" icon={<Bot size={19} />} title="AI Autopilot" action={{ href: "/follow-ups", label: "Tasks" }} className="flex-[1_1_320px]">
      <div className="grid grid-cols-3 gap-2 pb-3 text-center">
        <div className="rounded-lg bg-emerald-50 px-2 py-2"><strong className="block text-lg text-emerald-900">{active ?? 0}</strong><span className="text-[11px] text-emerald-900">leads with AI</span></div>
        <div className="rounded-lg bg-brand-50 px-2 py-2"><strong className="block text-lg">{sentToday ?? 0}</strong><span className="text-[11px] text-copy-muted">AI replies, 24h</span></div>
        <div className="rounded-lg bg-amber-50 px-2 py-2"><strong className="block text-lg text-amber-900">{readyFollowups}/{dueFollowups}</strong><span className="text-[11px] text-amber-900">follow-ups drafted</span></div>
      </div>
      <div className="text-[11px] font-bold uppercase tracking-wide text-copy-muted">Needs you{handedCount ? ` · ${handedCount.toLocaleString("en-IN")}` : ""}</div>
      {list.length ? (
        <ul className="mt-1 flex flex-col">
          {list.map((row) => {
            const lead = Array.isArray(row.leads) ? row.leads[0] : row.leads;
            const reason = row.handover_reason as HandoverReason | null;
            return (
              <li key={row.lead_id}>
                <Link href={`/conversations?lead=${row.lead_id}`} className="flex flex-col rounded-lg px-2 py-1.5 hover:bg-surface-soft">
                  <span className="text-[13px] font-semibold text-copy">{(lead as { display_name?: string } | null)?.display_name || "Instagram lead"}</span>
                  <span className="text-[11px] text-rose-700">{reason ? HANDOVER_LABELS[reason] ?? reason : "Needs a person"}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
      {/* Three here keeps the first screen compact (Home at 1920x1080, 20 Nov 2026). */}
      {list.length > 0 && (handedCount ?? 0) > list.length ? (
        <Link href="/conversations?filter=all" className="mt-auto text-[13px] font-semibold text-brand-700 hover:text-brand-800">See all {handedCount?.toLocaleString("en-IN")} →</Link>
      ) : list.length > 0 ? null : (
        <p className="mt-1 text-[12px] text-copy-muted">Nothing handed over by the AI.</p>
      )}
    </Panel>
  );
}
