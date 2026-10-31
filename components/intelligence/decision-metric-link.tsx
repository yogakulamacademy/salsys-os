"use client";

import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";

import { canonicalizeWorkspaceHref } from "@/lib/canonical-workspace-routes";
import type { MetricEvidenceState } from "@/lib/metric-definitions";

export const METRIC_INVESTIGATION_STORAGE_KEY = "salsys.metric-investigation.v1";

export type StoredMetricInvestigation = {
  sourcePath: string;
  sourceLabel: string;
  targetPath: string;
  metricLabel: string;
  metricValue: string;
  metricDetail?: string;
  evidenceLabel?: string;
  evidenceState?: MetricEvidenceState;
  scopeLabel?: string;
  createdAt: number;
};

export function DecisionMetricLink({
  href,
  className,
  metricLabel,
  metricValue,
  metricDetail,
  evidenceLabel,
  evidenceState,
  children,
}: {
  href: string;
  className: string;
  metricLabel: string;
  metricValue: string;
  metricDetail?: string;
  evidenceLabel?: string;
  evidenceState?: MetricEvidenceState;
  children: ReactNode;
}) {
  const canonicalHref = canonicalizeWorkspaceHref(href);

  function rememberInvestigation(event: MouseEvent<HTMLAnchorElement>) {
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

    if (!canonicalHref.startsWith("/")) return;

    try {
      const sourcePath = `${window.location.pathname}${window.location.search}`;
      const context: StoredMetricInvestigation = {
        sourcePath,
        sourceLabel: routeLabel(window.location.pathname),
        targetPath: canonicalHref,
        metricLabel,
        metricValue,
        metricDetail,
        evidenceLabel,
        evidenceState,
        scopeLabel: reportingScope(window.location.search),
        createdAt: Date.now(),
      };
      window.sessionStorage.setItem(
        METRIC_INVESTIGATION_STORAGE_KEY,
        JSON.stringify(context),
      );
    } catch {
      // Navigation must remain functional even when sessionStorage is unavailable.
    }
  }

  return (
    <Link href={canonicalHref} className={className} onClick={rememberInvestigation}>
      {children}
    </Link>
  );
}

function reportingScope(search: string) {
  const params = new URLSearchParams(search);
  const period = params.get("period")?.trim();
  const from = params.get("from")?.trim();
  const to = params.get("to")?.trim();

  if (period === "custom" && from && to) return `${from} → ${to}`;
  if (period) return pretty(period);
  return undefined;
}

function routeLabel(pathname: string) {
  if (pathname === "/home") return "Command Center";
  if (pathname === "/dashboard") return "My Work";
  if (pathname === "/admissions") return "Admissions";
  if (pathname === "/marketing") return "Marketing";
  if (pathname === "/revenue") return "Revenue";
  if (pathname === "/performance") return "Performance";
  if (pathname === "/operations") return "Operations";
  if (pathname === "/follow-ups") return "Follow-ups";
  if (pathname === "/conversations") return "Inbox";
  if (pathname === "/leads") return "Leads";
  return pretty(pathname.split("/").filter(Boolean)[0] || "SalsysOS");
}

function pretty(value: string) {
  return value
    .replaceAll("-", " ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
