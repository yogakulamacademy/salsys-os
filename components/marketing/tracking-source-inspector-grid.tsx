"use client";

import { Activity, ArrowUpRight, RadioTower } from "lucide-react";
import { useMemo, useState } from "react";

import { MarketingInspector } from "@/components/marketing/marketing-inspector";

export type TrackingSourceInspectorItem = {
  id: string;
  name: string;
  platform: string;
  hostname: string | null;
  healthStatus: "healthy" | "idle" | "not_live" | "degraded" | "misconfigured" | "inactive";
  events24h: number;
  events7d: number;
  visitors7d: number;
  sessions7d: number;
  acceptedEventCount: number;
  duplicateEventCount: number;
  rejectedEventCount: number;
  lastSeenAt: string | null;
  sdkName: string | null;
  sdkVersion: string | null;
  privacyNoticeVersion: string | null;
};

export function TrackingSourceInspectorGrid({ sources }: { sources: TrackingSourceInspectorItem[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(() => sources.find((source) => source.id === selectedId) ?? null, [selectedId, sources]);

  if (!sources.length) return null;

  return (
    <>
      <section className="rounded-[14px] border border-[#e1e6dd] bg-white p-4 shadow-[0_10px_32px_rgba(20,43,35,.035)]">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[8px] font-black uppercase tracking-[.15em] text-[#8a978a]">Source inspector</div>
            <h2 className="mt-1 text-[15px] font-semibold tracking-[-.02em] text-[#102d27]">Inspect measurement health without leaving the workspace</h2>
            <p className="mt-1 max-w-3xl text-[10px] leading-5 text-[#758279]">Open any source to see what happened, why it matters, the supporting evidence and the next recommended action.</p>
          </div>
          <span className="text-[9px] font-semibold text-[#8a978a]">{sources.length} configured</span>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {sources.slice(0, 9).map((source) => (
            <button
              key={source.id}
              type="button"
              onClick={() => setSelectedId(source.id)}
              className="group flex items-start gap-3 rounded-xl border border-[#e2e8e1] bg-[#fbfcfa] p-3.5 text-left transition hover:-translate-y-[1px] hover:border-[#c9d8cb] hover:bg-white hover:shadow-[0_8px_24px_rgba(20,43,35,.055)]"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#edf5e9] text-[#2f6a57]"><RadioTower size={15} /></span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <strong className="truncate text-[11px] font-semibold text-[#203b32]">{source.name}</strong>
                  <ArrowUpRight size={12} className="shrink-0 text-[#8a978a] transition group-hover:text-[#153d33]" />
                </span>
                <span className="mt-1 block text-[9px] text-[#758279]">{source.platform}{source.hostname ? ` · ${source.hostname}` : ""}</span>
                <span className="mt-2 flex items-center gap-2 text-[9px] text-[#758279]">
                  <HealthDot status={source.healthStatus} />
                  {healthLabel(source.healthStatus)} · {source.events24h.toLocaleString("en-IN")} events / 24h
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>

      {selected ? (
        <MarketingInspector
          open
          onClose={() => setSelectedId(null)}
          eyebrow="Measurement source"
          title={selected.name}
          subtitle={`${selected.platform}${selected.hostname ? ` · ${selected.hostname}` : ""}`}
          statusLabel={healthLabel(selected.healthStatus)}
          statusTone={statusTone(selected.healthStatus)}
          whatHappened={whatHappened(selected)}
          whyItMatters={whyItMatters(selected)}
          metrics={[
            { label: "Events · 24h", value: selected.events24h.toLocaleString("en-IN"), note: "recent accepted source activity" },
            { label: "Events · 7d", value: selected.events7d.toLocaleString("en-IN"), note: "weekly source volume" },
            { label: "Visitors · 7d", value: selected.visitors7d.toLocaleString("en-IN"), note: "observed source visitors" },
            { label: "Sessions · 7d", value: selected.sessions7d.toLocaleString("en-IN"), note: "observed source sessions" },
          ]}
          evidence={[
            {
              label: "Accepted events",
              value: selected.acceptedEventCount.toLocaleString("en-IN"),
              detail: "Events accepted by the canonical tracking source.",
              tone: selected.acceptedEventCount > 0 ? "positive" : "watch",
            },
            {
              label: "Rejected events",
              value: selected.rejectedEventCount.toLocaleString("en-IN"),
              detail: "Rejected events need investigation when they are material relative to accepted events.",
              tone: selected.rejectedEventCount > 0 ? "watch" : "positive",
            },
            {
              label: "SDK evidence",
              value: selected.sdkName ? `${selected.sdkName}${selected.sdkVersion ? ` ${selected.sdkVersion}` : ""}` : "Unknown",
              detail: selected.sdkName ? "Latest SDK identity reported by this source." : "No SDK identity is currently available for this source.",
              tone: selected.sdkName ? "neutral" : "watch",
            },
            {
              label: "Last seen",
              value: formatWhen(selected.lastSeenAt),
              detail: "Freshness is part of source health; configured does not automatically mean live.",
              tone: selected.healthStatus === "healthy" ? "positive" : "watch",
            },
          ]}
          recommendedAction={recommendedAction(selected)}
          actions={[
            { label: "Open source health", href: "/marketing/tracking-sources#source-health", primary: true },
            { label: "Check data coverage", href: "/tracking/data-coverage" },
          ]}
          related={[
            { label: "Conversion Health", href: "/tracking/conversion-health", detail: "Verify event → identity → CRM linking." },
            { label: "Attribution", href: "/attribution", detail: "Inspect how source evidence contributes to marketing credit." },
            { label: "Analytics", href: "/analytics", detail: "Compare source traffic with downstream CRM outcomes." },
          ]}
        />
      ) : null}
    </>
  );
}

function HealthDot({ status }: { status: TrackingSourceInspectorItem["healthStatus"] }) {
  const cls = status === "healthy" ? "bg-emerald-500" : status === "misconfigured" || status === "degraded" ? "bg-rose-500" : "bg-amber-500";
  return <span className={`h-1.5 w-1.5 rounded-full ${cls}`} />;
}

function healthLabel(status: TrackingSourceInspectorItem["healthStatus"]) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (value) => value.toUpperCase());
}

function statusTone(status: TrackingSourceInspectorItem["healthStatus"]): "positive" | "watch" | "risk" | "neutral" {
  if (status === "healthy") return "positive";
  if (status === "misconfigured" || status === "degraded") return "risk";
  if (status === "idle" || status === "not_live" || status === "inactive") return "watch";
  return "neutral";
}

function whatHappened(source: TrackingSourceInspectorItem) {
  if (source.healthStatus === "healthy") return `${source.name} is receiving sufficiently recent source evidence and is currently classified as healthy.`;
  if (source.healthStatus === "idle") return `${source.name} is configured and has historical evidence, but recent activity is not fresh enough to classify the source as healthy.`;
  if (source.healthStatus === "not_live") return `${source.name} is configured, but SalsysOS does not yet have live accepted-event evidence from it.`;
  if (source.healthStatus === "misconfigured") return `${source.name} has configuration evidence that does not satisfy the expected privacy or source-auth requirements.`;
  if (source.healthStatus === "degraded") return `${source.name} is receiving problematic event evidence and is currently classified as degraded.`;
  return `${source.name} is inactive, so downstream coverage from this source should not be assumed.`;
}

function whyItMatters(source: TrackingSourceInspectorItem) {
  if (source.healthStatus === "healthy") return "Healthy source evidence improves confidence in acquisition, conversion and attribution views, although downstream completeness still depends on identity linking and provider coverage.";
  return "When a source is not healthy, acquisition volume, conversion reconciliation and attribution can be incomplete. SalsysOS should preserve those gaps as partial or unknown instead of silently inferring missing evidence.";
}

function recommendedAction(source: TrackingSourceInspectorItem) {
  if (source.healthStatus === "healthy") return "Keep monitoring freshness, rejected events and privacy evidence. No corrective action is supported by the current source-health state.";
  if (source.healthStatus === "idle") return "Verify the source is still installed on the expected property and generate a controlled test event to confirm live ingestion resumes.";
  if (source.healthStatus === "not_live") return "Complete installation, confirm consent requirements, and send a controlled test event before relying on this source in marketing analysis.";
  if (source.healthStatus === "misconfigured") return "Review source authentication, strict privacy mode, consent requirements and privacy notice version before treating its measurements as trustworthy.";
  if (source.healthStatus === "degraded") return "Inspect rejected-event evidence and SDK/source configuration before using this source for decision-making.";
  return "Confirm whether this source should remain active. Reactivate only when the property is expected to contribute measurement evidence.";
}

function formatWhen(value: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(date);
}
