"use client";

import Link from "next/link";
import { useEffect, useState, type MouseEvent, type ReactNode } from "react";

import { canonicalizeWorkspaceHref } from "@/lib/canonical-workspace-routes";
import {
  captureInvestigationScope,
  summarizeInvestigationScope,
  transferInvestigationScope,
  type InvestigationScope,
  type InvestigationScopeChip,
} from "@/lib/investigation-scope";
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
  scope?: InvestigationScope;
  appliedScope?: InvestigationScopeChip[];
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
  investigationScope,
  children,
}: {
  href: string;
  className: string;
  metricLabel: string;
  metricValue: string;
  metricDetail?: string;
  evidenceLabel?: string;
  evidenceState?: MetricEvidenceState;
  investigationScope?: InvestigationScope;
  children: ReactNode;
}) {
  const canonicalHref = canonicalizeWorkspaceHref(href);
  const [resolvedHref, setResolvedHref] = useState(canonicalHref);

  useEffect(() => {
    if (!canonicalHref.startsWith("/")) {
      setResolvedHref(canonicalHref);
      return;
    }

    try {
      const scope = resolveInvestigationScope(
        window.location.search,
        investigationScope,
      );
      setResolvedHref(
        transferInvestigationScope(canonicalHref, scope).href,
      );
    } catch {
      setResolvedHref(canonicalHref);
    }
  }, [canonicalHref, investigationScope]);

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
      const scope = resolveInvestigationScope(
        window.location.search,
        investigationScope,
      );
      const transfer = transferInvestigationScope(
        canonicalHref,
        scope,
      );
      const context: StoredMetricInvestigation = {
        sourcePath,
        sourceLabel: routeLabel(window.location.pathname),
        targetPath: transfer.href,
        metricLabel,
        metricValue,
        metricDetail,
        evidenceLabel,
        evidenceState,
        scopeLabel: summarizeInvestigationScope(transfer.scope),
        scope: transfer.scope,
        appliedScope: transfer.applied,
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
    <Link href={resolvedHref} className={className} onClick={rememberInvestigation}>
      {children}
    </Link>
  );
}

function resolveInvestigationScope(
  search: string,
  explicitScope?: InvestigationScope,
): InvestigationScope {
  const currentScope = captureInvestigationScope(search);
  if (!explicitScope) return currentScope;

  const explicit = Object.fromEntries(
    Object.entries(explicitScope).filter(
      ([, value]) => typeof value === "string" && value.trim().length > 0,
    ),
  ) as InvestigationScope;

  const merged: InvestigationScope = {
    ...currentScope,
    ...explicit,
  };

  // A concrete selected attribution dimension is stronger evidence than a
  // fuzzy finder query. Do not let the query silently narrow the destination.
  if (explicit.source || explicit.channel) {
    delete merged.q;
  }

  return merged;
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
