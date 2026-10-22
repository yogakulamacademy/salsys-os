"use client";

import { ArrowUpRight, PlugZap } from "lucide-react";
import { useMemo, useState } from "react";

import { MarketingInspector } from "@/components/marketing/marketing-inspector";

export type IntegrationInspectorItem = {
  provider: "google" | "meta" | "instagram" | "whatsapp";
  status: string | null;
  updatedAt: string | null;
};

export function IntegrationHealthInspectorGrid({ items }: { items: IntegrationInspectorItem[] }) {
  const [selectedProvider, setSelectedProvider] = useState<IntegrationInspectorItem["provider"] | null>(null);
  const selected = useMemo(() => items.find((item) => item.provider === selectedProvider) ?? null, [items, selectedProvider]);

  return (
    <>
      <section className="rounded-[14px] border border-[#e1e6dd] bg-white p-4 shadow-[0_10px_32px_rgba(20,43,35,.035)]">
        <div>
          <div className="text-[8px] font-black uppercase tracking-[.15em] text-[#8a978a]">Provider inspector</div>
          <h2 className="mt-1 text-[15px] font-semibold tracking-[-.02em] text-[#102d27]">Inspect provider health before trusting downstream reports</h2>
          <p className="mt-1 max-w-3xl text-[10px] leading-5 text-[#758279]">Connection state is only one layer of evidence. Open a provider to see what its current state supports and what still needs verification.</p>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {items.map((item) => (
            <button
              key={item.provider}
              type="button"
              onClick={() => setSelectedProvider(item.provider)}
              className="group rounded-xl border border-[#e2e8e1] bg-[#fbfcfa] p-3.5 text-left transition hover:-translate-y-[1px] hover:border-[#c9d8cb] hover:bg-white hover:shadow-[0_8px_24px_rgba(20,43,35,.055)]"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#edf5e9] text-[#2f6a57]"><PlugZap size={15} /></span>
                <ArrowUpRight size={12} className="text-[#8a978a] transition group-hover:text-[#153d33]" />
              </div>
              <div className="mt-3 text-[11px] font-semibold text-[#203b32]">{label(item.provider)}</div>
              <div className="mt-1 flex items-center gap-2 text-[9px] text-[#758279]">
                <span className={`h-1.5 w-1.5 rounded-full ${dotClass(item.status)}`} />
                {statusLabel(item.status)}
              </div>
              <div className="mt-2 text-[8px] leading-4 text-[#8a978a]">{item.updatedAt ? `Updated ${formatWhen(item.updatedAt)}` : "No connection record"}</div>
            </button>
          ))}
        </div>
      </section>

      {selected ? (
        <MarketingInspector
          open
          onClose={() => setSelectedProvider(null)}
          eyebrow="Marketing integration"
          title={label(selected.provider)}
          subtitle="Provider connection health and downstream trust context"
          statusLabel={statusLabel(selected.status)}
          statusTone={tone(selected.status)}
          whatHappened={whatHappened(selected)}
          whyItMatters={whyItMatters(selected)}
          metrics={[
            { label: "Connection", value: statusLabel(selected.status), note: "latest SalsysOS provider state" },
            { label: "Last update", value: selected.updatedAt ? formatWhen(selected.updatedAt) : "Unknown", note: "connection metadata freshness" },
          ]}
          evidence={[
            {
              label: "Provider state",
              value: statusLabel(selected.status),
              detail: selected.status === "connected" ? "SalsysOS has a current connected-state record for this provider." : "Connection evidence is incomplete or unhealthy.",
              tone: selected.status === "connected" ? "positive" : selected.status && ["error", "expired"].includes(selected.status) ? "risk" : "watch",
            },
            {
              label: "Downstream completeness",
              value: selected.status === "connected" ? "Still requires validation" : "Partial / unknown",
              detail: "A connected provider does not by itself prove complete asset selection, historical sync, tracking coverage or attribution evidence.",
              tone: "watch",
            },
          ]}
          recommendedAction={recommendedAction(selected)}
          actions={[
            { label: `Open ${label(selected.provider)} controls`, href: controlHref(selected.provider), primary: true },
            { label: "Check data coverage", href: "/tracking/data-coverage" },
          ]}
          related={[
            { label: "Campaigns", href: "/campaigns", detail: "See connected paid-media evidence and CRM outcomes." },
            { label: "Attribution", href: "/attribution", detail: "Inspect how provider evidence contributes to source credit." },
            { label: "Tracking Sources", href: "/marketing/tracking-sources", detail: "Verify first-party source health independently of provider APIs." },
          ]}
        />
      ) : null}
    </>
  );
}

function label(provider: IntegrationInspectorItem["provider"]) {
  if (provider === "google") return "Google";
  if (provider === "meta") return "Meta";
  if (provider === "instagram") return "Instagram";
  return "WhatsApp";
}

function statusLabel(status: string | null) {
  if (!status) return "Not configured";
  return status.replaceAll("_", " ").replace(/\b\w/g, (value) => value.toUpperCase());
}

function tone(status: string | null): "positive" | "watch" | "risk" | "neutral" {
  if (status === "connected") return "positive";
  if (status === "error" || status === "expired") return "risk";
  if (!status || status === "disconnected" || status === "revoked") return "watch";
  return "neutral";
}

function dotClass(status: string | null) {
  if (status === "connected") return "bg-emerald-500";
  if (status === "error" || status === "expired") return "bg-rose-500";
  return "bg-amber-500";
}

function whatHappened(item: IntegrationInspectorItem) {
  if (item.status === "connected") return `${label(item.provider)} currently has a connected integration record in SalsysOS.`;
  if (item.status === "error") return `${label(item.provider)} currently has an integration error state that needs investigation.`;
  if (item.status === "expired") return `${label(item.provider)} connection evidence is expired and should not be treated as current.`;
  if (item.status === "revoked") return `${label(item.provider)} access was revoked, so downstream provider evidence should be treated as unavailable.`;
  if (item.status === "disconnected") return `${label(item.provider)} is disconnected from the active workspace.`;
  return `${label(item.provider)} does not currently have a provider connection record in this workspace.`;
}

function whyItMatters(item: IntegrationInspectorItem) {
  if (item.status === "connected") return "This supports provider access, but budget, attribution and campaign decisions still require asset-level sync and measurement coverage to be verified separately.";
  return "Pages that depend on this provider can be incomplete. SalsysOS should preserve those gaps as partial or unknown instead of silently substituting zero or assuming the provider is healthy.";
}

function recommendedAction(item: IntegrationInspectorItem) {
  if (item.status === "connected") return "Validate selected assets, sync freshness and downstream coverage before treating provider data as complete.";
  if (item.status === "error") return "Open the provider controls, resolve the reported connection error, then verify a fresh successful sync before relying on downstream reports.";
  if (item.status === "expired") return "Reconnect or refresh authorization, then confirm assets and data freshness after the connection becomes healthy.";
  if (item.status === "revoked") return "Reconnect only if this provider should still contribute marketing evidence to the workspace.";
  return "Connect the provider if it is required for the marketing channels this workspace actively uses.";
}

function controlHref(provider: IntegrationInspectorItem["provider"]) {
  return provider === "whatsapp" ? "/settings/integrations/whatsapp" : "/settings/integrations";
}

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(date);
}
