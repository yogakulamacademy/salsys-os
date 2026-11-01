import type { ReactNode } from "react";
import { AlertTriangle, DatabaseZap } from "lucide-react";

import { OperationsJourneyBar } from "@/components/operations/operations-journey-bar";
import { isWellnessResidentialEnabledForCurrentSession } from "@/lib/education-access";
import { requireOperationsAccess } from "@/lib/operations-access";
import { createClient } from "@/lib/supabase/server";

import "./course-management-violet.css";

type CapacityReadinessRow = {
  batch_id: string;
  capacity: number | string | null;
};

export default async function CourseManagementLayout({ children }: { children: ReactNode }) {
  const workspace = await requireOperationsAccess();
  const supabase = await createClient();
  const [capacityResult, residentialEnabled] = await Promise.all([
    supabase
      .from("v_admissions_upcoming_batch_capacity")
      .select("batch_id,capacity")
      .eq("organization_id", workspace.organizationId),
    isWellnessResidentialEnabledForCurrentSession(),
  ]);

  const capacityRows = capacityResult.error
    ? null
    : ((capacityResult.data ?? []) as CapacityReadinessRow[]);
  const missingCapacityCount = capacityRows
    ? capacityRows.filter((row) => row.capacity == null || toNumber(row.capacity) <= 0).length
    : null;

  return (
    <div
      className={`course-management-scope space-y-4 ${
        residentialEnabled ? "residential-enabled" : "residential-disabled"
      }`}
      data-wellness-residential={residentialEnabled ? "enabled" : "disabled"}
    >
      <OperationsJourneyBar />

      {missingCapacityCount == null ? (
        <section className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div>
            <strong>Future capacity readiness unavailable</strong>
            <div className="mt-0.5 text-xs leading-5">
              Future batch capacity could not be verified. Summary values must not be interpreted as proof of zero seats while the canonical capacity source is unavailable.
            </div>
          </div>
        </section>
      ) : missingCapacityCount > 0 ? (
        <section className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100">
          <DatabaseZap size={16} className="mt-0.5 shrink-0" />
          <div>
            <strong>Future capacity setup incomplete</strong>
            <div className="mt-0.5 text-xs leading-5">
              {formatNumber(missingCapacityCount)} of {formatNumber(capacityRows?.length)} future active batch{capacityRows?.length === 1 ? "" : "es"} {missingCapacityCount === 1 ? "does" : "do"} not have positive capacity configured. Course Management summary totals cover recorded capacity only; missing capacity remains unknown rather than zero seats.
            </div>
          </div>
        </section>
      ) : null}

      {children}
    </div>
  );
}

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value: number | string | null | undefined) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(
    toNumber(value),
  );
}
