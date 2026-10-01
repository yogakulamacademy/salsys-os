import Link from "next/link";
import type { ReactNode } from "react";

import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CircleDollarSign,
  Clock3,
  ContactRound,
  Flame,
  ShieldAlert,
} from "lucide-react";

import { PipelineBoard } from "@/components/pipeline-board";
import {
  PipelineInsights,
  type PipelineAgingPoint,
} from "@/components/pipeline-insights";
import { PageHeader } from "@/components/ui";
import { getPipelineSnapshot } from "@/lib/pipeline-data";

const activeStages = [
  "new",
  "contacted",
  "engaged",
  "qualified",
  "high_intent",
  "payment_pending",
] as const;

const stageLabels: Record<(typeof activeStages)[number], string> = {
  new: "New",
  contacted: "Contacted",
  engaged: "Engaged",
  qualified: "Qualified",
  high_intent: "High intent",
  payment_pending: "Payment",
};

export default async function PipelinePage() {
  const snapshot = await getPipelineSnapshot();

  const boardLeads = snapshot.boardLeads;
  const activePipeline = snapshot.metrics.activePipeline;
  const qualifiedPlus = snapshot.metrics.qualifiedPlus;
  const highIntent = snapshot.metrics.highIntent;
  const paymentPending = snapshot.metrics.paymentPending;
  const enrolled = snapshot.metrics.enrolled;
  const stuckLeadCount = snapshot.metrics.stuckLeads;
  const warningLeadCount = snapshot.metrics.warningLeads;
  const medianStageAge = snapshot.metrics.medianStageAgeDays;
  const stuckLeads = snapshot.stuckLeads;

  const stageCountByStage = new Map(
    snapshot.stageCounts.map((row) => [row.stage, row.leads]),
  );

  const agingByStage = new Map(
    snapshot.agingSummary.map((row) => [row.stage, row]),
  );

  const insightData = activeStages.map((stage) => ({
    stage: stageLabels[stage],
    leads: stageCountByStage.get(stage) ?? 0,
  }));

  const agingInsightData: PipelineAgingPoint[] = activeStages.map((stage) => {
    const row = agingByStage.get(stage);

    return {
      stage: stageLabels[stage],
      healthy: row?.healthy ?? 0,
      warning: row?.warning ?? 0,
      stuck: row?.stuck ?? 0,
      medianDays: row?.medianDays ?? 0,
      oldestDays: row?.oldestDays ?? 0,
    };
  });

  return (
    <div className="pipeline-polish">
      <PageHeader
        eyebrow="Admissions funnel"
        title="Pipeline"
        description="Move active opportunities through the admissions journey, watch stage aging, and surface leads that need intervention before they go cold."
        actions={
          <>
            <Link href="/funnel" className="btn-secondary">
              Funnel analytics
            </Link>

            <Link href="/admissions" className="btn-primary">
              Admissions Desk
              <ArrowRight size={15} />
            </Link>
          </>
        }
      />

      {snapshot.warning && (
        <div className="pipeline-warning mb-4">
          Pipeline loaded using the fallback read path: {snapshot.warning}
        </div>
      )}

      <section className="pipeline-primary-metrics">
        <PipelineMetricCard
          icon={<ContactRound size={18} />}
          label="Active pipeline"
          value={activePipeline.toLocaleString()}
          note="Open admissions opportunities"
        />

        <PipelineMetricCard
          icon={<BadgeCheck size={18} />}
          label="Qualified+"
          value={qualifiedPlus.toLocaleString()}
          note="Qualified through enrolled"
        />

        <PipelineMetricCard
          icon={<Flame size={18} />}
          label="High intent"
          value={highIntent.toLocaleString()}
          note="Strong enrollment intent"
          accent
        />

        <PipelineMetricCard
          icon={<CircleDollarSign size={18} />}
          label="Payment pending"
          value={paymentPending.toLocaleString()}
          note="Closest active stage to enrollment"
        />

        <PipelineMetricCard
          icon={<BadgeCheck size={18} />}
          label="Enrolled"
          value={enrolled.toLocaleString()}
          note="Successful enrollments"
        />
      </section>

      <section className="pipeline-health-strip">
        <PipelineHealthMetric
          icon={<AlertTriangle size={16} />}
          label="Stuck leads"
          value={stuckLeadCount.toLocaleString()}
          note="Beyond stage threshold"
          tone={stuckLeadCount > 0 ? "danger" : "neutral"}
        />

        <PipelineHealthMetric
          icon={<ShieldAlert size={16} />}
          label="Warning"
          value={warningLeadCount.toLocaleString()}
          note="Approaching threshold"
          tone={warningLeadCount > 0 ? "warning" : "neutral"}
        />

        <PipelineHealthMetric
          icon={<Clock3 size={16} />}
          label="Median stage age"
          value={formatAge(medianStageAge)}
          note="Across active pipeline"
          tone="neutral"
        />
      </section>

      <div className="mt-4">
        <PipelineInsights data={insightData} agingData={agingInsightData} />
      </div>

      {stuckLeadCount > 0 && (
        <section className="pipeline-stuck-section mt-4">
          <div className="pipeline-section-heading">
            <div>
              <div className="eyebrow">Needs attention</div>
              <div className="section-title mt-1">Most stuck leads</div>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                Leads furthest beyond the configured aging threshold for their
                current stage.
              </p>
            </div>

            <span className="pipeline-stuck-count">
              {stuckLeadCount.toLocaleString()} stuck
            </span>
          </div>

          <div className="pipeline-stuck-grid">
            {stuckLeads.slice(0, 6).map((lead) => (
              <Link
                key={lead.lead_id}
                href={`/leads/${lead.lead_id}`}
                className="pipeline-stuck-card group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="pipeline-stuck-name">
                      {lead.lead_name || lead.lead_code || "Lead"}
                    </div>
                    <div className="pipeline-stuck-course">
                      {lead.course_name || "Course not set"}
                    </div>
                  </div>

                  <span className="pipeline-danger-badge">Stuck</span>
                </div>

                <div className="pipeline-stuck-meta">
                  <span>{prettyStage(lead.current_stage)}</span>
                  <span className="pipeline-stuck-age">
                    {formatAge(toNumber(lead.stage_age_days))} in stage
                  </span>

                  {toNumber(lead.days_over_stuck_threshold) > 0 && (
                    <span className="pipeline-over-limit">
                      +{formatAge(toNumber(lead.days_over_stuck_threshold))}{" "}
                      over limit
                    </span>
                  )}
                </div>

                <div className="pipeline-open-link">
                  Open lead <ArrowRight size={12} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <PipelineBoard leads={boardLeads} />
    </div>
  );
}

function PipelineMetricCard({
  icon,
  label,
  value,
  note,
  accent = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  note: string;
  accent?: boolean;
}) {
  return (
    <div className={`pipeline-metric-card ${accent ? "is-accent" : ""}`}>
      <div className="pipeline-metric-top">
        <span className="pipeline-metric-label">{label}</span>
        <span className="pipeline-metric-icon">{icon}</span>
      </div>
      <div className="pipeline-metric-value">{value}</div>
      <div className="pipeline-metric-note">{note}</div>
    </div>
  );
}

function PipelineHealthMetric({
  icon,
  label,
  value,
  note,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  note: string;
  tone: "neutral" | "warning" | "danger";
}) {
  return (
    <div className={`pipeline-health-item is-${tone}`}>
      <span className="pipeline-health-icon">{icon}</span>
      <div className="min-w-0">
        <div className="pipeline-health-label">{label}</div>
        <div className="pipeline-health-note">{note}</div>
      </div>
      <div className="pipeline-health-value">{value}</div>
    </div>
  );
}

function toNumber(value: number | string | null | undefined) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function formatAge(days: number) {
  if (days < 1) {
    const hours = Math.max(0, Math.round(days * 24));
    return `${hours}h`;
  }

  if (days < 10) {
    return `${days.toFixed(1)}d`;
  }

  return `${Math.round(days)}d`;
}

function prettyStage(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
