import Link from "next/link";

import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CircleDollarSign,
  Clock3,
  ContactRound,
  Flame,
} from "lucide-react";

import { PipelineBoard } from "@/components/pipeline-board";
import {
  PipelineInsights,
  type PipelineAgingPoint,
} from "@/components/pipeline-insights";
import { PageHeader, StatCard } from "@/components/ui";
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
    <>
      <PageHeader
        eyebrow="Admissions funnel"
        title="Pipeline"
        description="A live operational view of active leads, including how long each opportunity has remained in its current stage. Drag cards to move stages through the audited workflow."
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
        <div className="mb-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
          Pipeline loaded using the fallback read path: {snapshot.warning}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
        <div className="animate-rise stagger-1">
          <StatCard
            label="Active pipeline"
            value={activePipeline.toLocaleString()}
            note="open admissions opportunities"
            icon={<ContactRound size={19} />}
          />
        </div>

        <div className="animate-rise stagger-2">
          <StatCard
            label="Qualified+"
            value={qualifiedPlus.toLocaleString()}
            note="qualified through enrolled"
            icon={<BadgeCheck size={19} />}
          />
        </div>

        <div className="animate-rise stagger-3">
          <StatCard
            label="High intent"
            value={highIntent.toLocaleString()}
            note="strong buying intent"
            icon={<Flame size={19} />}
          />
        </div>

        <div className="animate-rise stagger-4">
          <StatCard
            label="Payment pending"
            value={paymentPending.toLocaleString()}
            note="closest active stage to enrollment"
            icon={<CircleDollarSign size={19} />}
          />
        </div>

        <div className="animate-rise stagger-5">
          <StatCard
            label="Stuck leads"
            value={stuckLeadCount.toLocaleString()}
            note={`${warningLeadCount.toLocaleString()} more in warning`}
            icon={<AlertTriangle size={19} />}
          />
        </div>

        <div className="animate-rise stagger-5">
          <StatCard
            label="Median stage age"
            value={formatAge(medianStageAge)}
            note="across active pipeline"
            icon={<Clock3 size={19} />}
          />
        </div>

        <div className="animate-rise stagger-5">
          <StatCard
            label="Enrolled"
            value={enrolled.toLocaleString()}
            note="closed successful enrollments"
            icon={<BadgeCheck size={19} />}
          />
        </div>
      </div>

      <div className="mt-4 animate-rise stagger-2">
        <PipelineInsights data={insightData} agingData={agingInsightData} />
      </div>

      {stuckLeadCount > 0 && (
        <section className="card-pad mt-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="eyebrow">Needs attention</div>

              <div className="section-title mt-1">Most stuck leads</div>

              <p className="mt-1 text-xs leading-5 text-slate-400">
                Leads furthest beyond the configured aging threshold for their
                current stage.
              </p>
            </div>

            <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
              {stuckLeadCount} stuck
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {stuckLeads

              .slice(
                0,

                6,
              )

              .map((lead) => (
                <Link
                  key={lead.lead_id}
                  href={`/leads/${lead.lead_id}`}
                  className="group rounded-xl border border-slate-100 bg-slate-50/70 p-4 transition hover:-translate-y-0.5 hover:border-amber-200 hover:bg-white hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black text-slate-900">
                        {lead.lead_name || lead.lead_code || "Lead"}
                      </div>

                      <div className="mt-1 truncate text-[10px] font-semibold text-slate-400">
                        {lead.course_name || "Course not set"}
                      </div>
                    </div>

                    <span className="rounded-full bg-red-100 px-2 py-1 text-[9px] font-black uppercase text-red-700">
                      Stuck
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold">
                    <span className="rounded-lg bg-white px-2 py-1 text-slate-600 ring-1 ring-black/5">
                      {prettyStage(lead.current_stage)}
                    </span>

                    <span className="rounded-lg bg-red-50 px-2 py-1 text-red-600">
                      {formatAge(toNumber(lead.stage_age_days))} in stage
                    </span>

                    {toNumber(lead.days_over_stuck_threshold) > 0 && (
                      <span className="rounded-lg bg-amber-50 px-2 py-1 text-amber-700">
                        +{formatAge(toNumber(lead.days_over_stuck_threshold))}{" "}
                        over limit
                      </span>
                    )}
                  </div>

                  <div className="mt-3 text-[10px] font-bold text-brand opacity-70 transition group-hover:opacity-100">
                    Open lead →
                  </div>
                </Link>
              ))}
          </div>
        </section>
      )}

      <PipelineBoard leads={boardLeads} />
    </>
  );
}

function toNumber(value: number | string | null | undefined) {
  const number = Number(value ?? 0);

  return Number.isFinite(number) ? number : 0;
}

function formatAge(days: number) {
  if (days < 1) {
    const hours = Math.max(
      0,

      Math.round(days * 24),
    );

    return `${hours}h`;
  }

  if (days < 10) {
    return `${days.toFixed(1)}d`;
  }

  return `${Math.round(days)}d`;
}

function prettyStage(value: string) {
  return value

    .replaceAll(
      "_",

      " ",
    )

    .replace(
      /\b\w/g,

      (letter) => letter.toUpperCase(),
    );
}
