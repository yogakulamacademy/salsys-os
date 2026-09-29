import { useMockData } from "@/lib/config";
import { getLeads } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import type { LeadStage } from "@/types/crm";

const activeStages = [
  "new",
  "contacted",
  "engaged",
  "qualified",
  "high_intent",
  "payment_pending",
] as const;

type AgingStatus = "healthy" | "warning" | "stuck" | "untracked";

export type PipelineSnapshotBoardLead = {
  id: string;
  name: string;
  stage: LeadStage;
  country: string;
  location: string;
  course: string;
  currentContactChannel: string;
  agingStatus: AgingStatus;
  stageEnteredAt: string | null;
  stageAgeHours: number;
  stageAgeDays: number;
  warningAfterDays: number | null;
  stuckAfterDays: number | null;
  daysOverStuckThreshold: number;
  daysSinceLastContact: number | null;
};

export type PipelineStageCount = {
  stage: string;
  leads: number;
};

export type PipelineAgingSummary = {
  stage: string;
  totalLeads: number;
  healthy: number;
  warning: number;
  stuck: number;
  medianDays: number;
  oldestDays: number;
};

export type PipelineStuckLead = {
  lead_id: string;
  lead_code: string | null;
  lead_name: string | null;
  current_stage: string;
  stage_age_days: number;
  days_over_stuck_threshold: number;
  course_name: string | null;
};

export type PipelineSnapshotMetrics = {
  activePipeline: number;
  qualifiedPlus: number;
  highIntent: number;
  paymentPending: number;
  enrolled: number;
  stuckLeads: number;
  warningLeads: number;
  medianStageAgeDays: number;
};

export type PipelineSnapshot = {
  boardLeads: PipelineSnapshotBoardLead[];
  stageCounts: PipelineStageCount[];
  agingSummary: PipelineAgingSummary[];
  stuckLeads: PipelineStuckLead[];
  metrics: PipelineSnapshotMetrics;
  fallbackUsed: boolean;
  warning: string | null;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function record(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function nullableText(value: unknown) {
  return typeof value === "string" ? value : null;
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nullableNumber(value: unknown) {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function agingStatus(value: unknown): AgingStatus {
  return value === "healthy" ||
    value === "warning" ||
    value === "stuck" ||
    value === "untracked"
    ? value
    : "untracked";
}

function mapBoardLead(value: unknown): PipelineSnapshotBoardLead | null {
  const row = record(value);
  const id = text(row.id);

  if (!id) {
    return null;
  }

  return {
    id,
    name: text(row.name, "Lead"),
    stage: text(row.stage, "new") as LeadStage,
    country: text(row.country),
    location: text(row.location),
    course: text(row.course),
    currentContactChannel: text(row.current_contact_channel, "unknown"),
    agingStatus: agingStatus(row.aging_status),
    stageEnteredAt: nullableText(row.stage_entered_at),
    stageAgeHours: numberValue(row.stage_age_hours),
    stageAgeDays: numberValue(row.stage_age_days),
    warningAfterDays: nullableNumber(row.warning_after_days),
    stuckAfterDays: nullableNumber(row.stuck_after_days),
    daysOverStuckThreshold: numberValue(row.days_over_stuck_threshold),
    daysSinceLastContact: nullableNumber(row.days_since_last_contact),
  };
}

function mapStageCount(value: unknown): PipelineStageCount | null {
  const row = record(value);
  const stage = text(row.stage);

  if (!stage) {
    return null;
  }

  return {
    stage,
    leads: numberValue(row.leads),
  };
}

function mapAgingSummary(value: unknown): PipelineAgingSummary | null {
  const row = record(value);
  const stage = text(row.stage);

  if (!stage) {
    return null;
  }

  return {
    stage,
    totalLeads: numberValue(row.total_leads),
    healthy: numberValue(row.healthy),
    warning: numberValue(row.warning),
    stuck: numberValue(row.stuck),
    medianDays: numberValue(row.median_days),
    oldestDays: numberValue(row.oldest_days),
  };
}

function mapStuckLead(value: unknown): PipelineStuckLead | null {
  const row = record(value);
  const leadId = text(row.lead_id);

  if (!leadId) {
    return null;
  }

  return {
    lead_id: leadId,
    lead_code: nullableText(row.lead_code),
    lead_name: nullableText(row.lead_name),
    current_stage: text(row.current_stage),
    stage_age_days: numberValue(row.stage_age_days),
    days_over_stuck_threshold: numberValue(row.days_over_stuck_threshold),
    course_name: nullableText(row.course_name),
  };
}

function mapSnapshot(payloadValue: unknown): PipelineSnapshot {
  const payload = record(payloadValue);
  const metricsRow = record(payload.metrics);

  const boardLeads = array(payload.board_leads)
    .map(mapBoardLead)
    .filter((row): row is PipelineSnapshotBoardLead => Boolean(row));

  const stageCounts = array(payload.stage_counts)
    .map(mapStageCount)
    .filter((row): row is PipelineStageCount => Boolean(row));

  const agingSummary = array(payload.aging_summary)
    .map(mapAgingSummary)
    .filter((row): row is PipelineAgingSummary => Boolean(row));

  const stuckLeads = array(payload.stuck_leads)
    .map(mapStuckLead)
    .filter((row): row is PipelineStuckLead => Boolean(row));

  return {
    boardLeads,
    stageCounts,
    agingSummary,
    stuckLeads,
    metrics: {
      activePipeline: numberValue(
        metricsRow.active_pipeline,
        boardLeads.length,
      ),
      qualifiedPlus: numberValue(metricsRow.qualified_plus),
      highIntent: numberValue(metricsRow.high_intent),
      paymentPending: numberValue(metricsRow.payment_pending),
      enrolled: numberValue(metricsRow.enrolled),
      stuckLeads: numberValue(
        metricsRow.stuck_leads,
        boardLeads.filter((lead) => lead.agingStatus === "stuck").length,
      ),
      warningLeads: numberValue(
        metricsRow.warning_leads,
        boardLeads.filter((lead) => lead.agingStatus === "warning").length,
      ),
      medianStageAgeDays: numberValue(
        metricsRow.median_stage_age_days,
        median(boardLeads.map((lead) => lead.stageAgeDays)),
      ),
    },
    fallbackUsed: false,
    warning: null,
  };
}

function median(values: number[]) {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }

  return (sorted[middle - 1] + sorted[middle]) / 2;
}

async function getPipelineFallback(
  reason: string | null,
): Promise<PipelineSnapshot> {
  const leads = await getLeads();

  let agingRows: UnknownRecord[] = [];
  let agingSummaryRows: UnknownRecord[] = [];

  if (!useMockData) {
    const supabase = await createClient();

    const [agingResult, summaryResult] = await Promise.all([
      supabase
        .from("v_pipeline_stage_aging")
        .select(
          `
          lead_id,
          lead_code,
          lead_name,
          current_stage,
          aging_status,
          stage_entered_at,
          stage_age_hours,
          stage_age_days,
          warning_after_days,
          stuck_after_days,
          days_over_stuck_threshold,
          days_since_last_contact,
          owner_name,
          course_name
        `,
        )
        .in("current_stage", [...activeStages])
        .order("stage_age_days", { ascending: false }),

      supabase.from("v_pipeline_stage_aging_summary").select(`
          current_stage,
          total_leads,
          healthy_leads,
          warning_leads,
          stuck_leads,
          median_stage_age_days,
          oldest_stage_age_days
        `),
    ]);

    if (!agingResult.error) {
      agingRows = (agingResult.data ?? []) as UnknownRecord[];
    }

    if (!summaryResult.error) {
      agingSummaryRows = (summaryResult.data ?? []) as UnknownRecord[];
    }
  }

  const agingByLead = new Map(agingRows.map((row) => [text(row.lead_id), row]));

  const active = leads.filter((lead) =>
    activeStages.includes(lead.stage as (typeof activeStages)[number]),
  );

  const boardLeads: PipelineSnapshotBoardLead[] = active.map((lead) => {
    const aging = agingByLead.get(lead.id) ?? {};

    return {
      id: lead.id,
      name: lead.name,
      stage: lead.stage,
      country: lead.country ?? "",
      location: lead.location ?? "",
      course: lead.course ?? "",
      currentContactChannel: lead.currentContactChannel ?? "unknown",
      agingStatus: agingStatus(aging.aging_status),
      stageEnteredAt: nullableText(aging.stage_entered_at),
      stageAgeHours: numberValue(aging.stage_age_hours),
      stageAgeDays: numberValue(aging.stage_age_days),
      warningAfterDays: nullableNumber(aging.warning_after_days),
      stuckAfterDays: nullableNumber(aging.stuck_after_days),
      daysOverStuckThreshold: numberValue(aging.days_over_stuck_threshold),
      daysSinceLastContact: nullableNumber(aging.days_since_last_contact),
    };
  });

  const stageCounts: PipelineStageCount[] = activeStages.map((stage) => ({
    stage,
    leads: leads.filter((lead) => lead.stage === stage).length,
  }));

  const agingSummary: PipelineAgingSummary[] = activeStages.map((stage) => {
    const row =
      agingSummaryRows.find((item) => text(item.current_stage) === stage) ?? {};

    return {
      stage,
      totalLeads: numberValue(row.total_leads),
      healthy: numberValue(row.healthy_leads),
      warning: numberValue(row.warning_leads),
      stuck: numberValue(row.stuck_leads),
      medianDays: numberValue(row.median_stage_age_days),
      oldestDays: numberValue(row.oldest_stage_age_days),
    };
  });

  const stuckRows = agingRows
    .filter((row) => text(row.aging_status) === "stuck")
    .sort(
      (a, b) => numberValue(b.stage_age_days) - numberValue(a.stage_age_days),
    );

  const stuckLeads: PipelineStuckLead[] = stuckRows.slice(0, 6).map((row) => ({
    lead_id: text(row.lead_id),
    lead_code: nullableText(row.lead_code),
    lead_name: nullableText(row.lead_name),
    current_stage: text(row.current_stage),
    stage_age_days: numberValue(row.stage_age_days),
    days_over_stuck_threshold: numberValue(row.days_over_stuck_threshold),
    course_name: nullableText(row.course_name),
  }));

  const activeAges = agingRows
    .map((row) => nullableNumber(row.stage_age_days))
    .filter((value): value is number => value != null);

  return {
    boardLeads,
    stageCounts,
    agingSummary,
    stuckLeads,
    metrics: {
      activePipeline: active.length,
      qualifiedPlus: leads.filter((lead) =>
        ["qualified", "high_intent", "payment_pending", "enrolled"].includes(
          lead.stage,
        ),
      ).length,
      highIntent: leads.filter((lead) => lead.stage === "high_intent").length,
      paymentPending: leads.filter((lead) => lead.stage === "payment_pending")
        .length,
      enrolled: leads.filter((lead) => lead.stage === "enrolled").length,
      stuckLeads: agingRows.filter((row) => text(row.aging_status) === "stuck")
        .length,
      warningLeads: agingRows.filter(
        (row) => text(row.aging_status) === "warning",
      ).length,
      medianStageAgeDays: median(activeAges),
    },
    fallbackUsed: true,
    warning: reason,
  };
}

export async function getPipelineSnapshot(): Promise<PipelineSnapshot> {
  if (useMockData) {
    return getPipelineFallback(null);
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_pipeline_snapshot");

  if (error) {
    return getPipelineFallback(
      `Pipeline snapshot RPC unavailable: ${error.message}`,
    );
  }

  try {
    const snapshot = mapSnapshot(data);

    if (!snapshot.boardLeads.length && snapshot.metrics.activePipeline > 0) {
      return getPipelineFallback(
        "Pipeline snapshot returned no board rows, so the legacy read path was used.",
      );
    }

    return snapshot;
  } catch (error) {
    return getPipelineFallback(
      error instanceof Error
        ? `Pipeline snapshot could not be mapped: ${error.message}`
        : "Pipeline snapshot could not be mapped.",
    );
  }
}
