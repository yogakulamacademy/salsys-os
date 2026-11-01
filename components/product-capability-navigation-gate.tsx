"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";

type WorkspaceCapabilityPayload = {
  capabilities?: unknown;
};

export function ProductCapabilityNavigationGate({
  children,
}: {
  children: ReactNode;
}) {
  const mock = process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false";
  const [educationEnabled, setEducationEnabled] = useState(mock);

  useEffect(() => {
    if (mock) {
      setEducationEnabled(true);
      return;
    }

    let cancelled = false;

    async function loadCapabilities() {
      try {
        const response = await fetch("/api/workspace", { cache: "no-store" });
        if (!response.ok) throw new Error("Unable to load workspace capabilities.");

        const payload = (await response.json()) as WorkspaceCapabilityPayload;
        const capabilities = Array.isArray(payload.capabilities)
          ? payload.capabilities.filter(
              (value): value is string => typeof value === "string",
            )
          : [];

        if (!cancelled) {
          setEducationEnabled(capabilities.includes("education_core"));
        }
      } catch {
        // Product navigation fails closed. Server/layout/RPC authorization is
        // still the authoritative access boundary.
        if (!cancelled) setEducationEnabled(false);
      }
    }

    void loadCapabilities();
    return () => {
      cancelled = true;
    };
  }, [mock]);

  return (
    <div
      className={
        educationEnabled
          ? "capability-education-enabled"
          : "capability-education-disabled"
      }
    >
      {children}
      <style jsx global>{`
        .capability-education-disabled a[href="/admissions"],
        .capability-education-disabled a[href^="/admissions?"],
        .capability-education-disabled a[href="/operations"],
        .capability-education-disabled a[href^="/operations?"],
        .capability-education-disabled a[href="/availability"],
        .capability-education-disabled a[href^="/availability?"],
        .capability-education-disabled a[href="/course-management"],
        .capability-education-disabled a[href^="/course-management?"],
        .capability-education-disabled a[href="/enrollments"],
        .capability-education-disabled a[href^="/enrollments?"],
        .capability-education-disabled button[aria-label="Open Operations"] {
          display: none !important;
        }
      `}</style>
    </div>
  );
}
