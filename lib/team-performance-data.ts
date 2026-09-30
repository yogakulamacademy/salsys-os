import { useMockData } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

export type TeamPerformanceSummary = {
  teamMembers: number;
  currentAssignedTotal: number;
  currentActiveLeads: number;
  assignedDuringPeriod: number;
  uniqueLeadsWorked: number;
  outboundInteractions: number;
  followupsCompleted: number;
  enrolledByStaff: number;
  needsReplyNow: number;
  overdueLeadsNow: number;
};

export type TeamPerformanceEmployee = {
  userId: string;
  employeeName: string;
  role: string;

  currentAssignedTotal: number;
  currentActiveLeads: number;
  needsReplyNow: number;
  overdueLeadsNow: number;
  overdueTasksNow: number;
  neverContactedNow: number;
  highIntentNow: number;
  paymentPendingNow: number;
  currentActionLoad: number;

  assignedDuringPeriod: number;
  leadsWorked: number;
  currentPortfolioWorked: number;
  portfolioWorkRate: number;

  outboundInteractions: number;
  whatsappReplies: number;
  phoneInteractions: number;
  emailInteractions: number;
  instagramInteractions: number;
  followupsCompleted: number;
  followupsSnoozed: number;
  stageChanges: number;

  movedContacted: number;
  movedEngaged: number;
  movedQualified: number;
  movedHighIntent: number;
  movedPaymentPending: number;
  enrolledByEmployee: number;
  movedOutOfActivePipeline: number;

  assignedCohortEnrolled: number;
  assignedCohortEnrollmentRate: number;
  workedToEnrolledRate: number;

  firstResponses: number;
  medianFirstResponseMinutes: number | null;
  firstResponseOver60m: number;
};

export type TeamRecentWork = {
  occurredAt: string;
  userId: string;
  employeeName: string;
  role: string;
  eventType: string;
  channel: string | null;
  leadId: string;
  leadCode: string;
  leadName: string;
  fromStage: string | null;
  toStage: string | null;
};

export type TeamPerformanceSnapshot = {
  range: {
    startDate: string;
    endDate: string;
    timezone: string;
  };
  summary: TeamPerformanceSummary;
  employees: TeamPerformanceEmployee[];
  recentWork: TeamRecentWork[];
};

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? (value as UnknownRecord) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function textValue(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function mapEmployee(value: unknown): TeamPerformanceEmployee {
  const row = asRecord(value);

  return {
    userId: textValue(row.user_id),
    employeeName: textValue(row.employee_name, "CRM User"),
    role: textValue(row.role, "unknown"),

    currentAssignedTotal: numberValue(row.current_assigned_total),
    currentActiveLeads: numberValue(row.current_active_leads),
    needsReplyNow: numberValue(row.needs_reply_now),
    overdueLeadsNow: numberValue(row.overdue_leads_now),
    overdueTasksNow: numberValue(row.overdue_tasks_now),
    neverContactedNow: numberValue(row.never_contacted_now),
    highIntentNow: numberValue(row.high_intent_now),
    paymentPendingNow: numberValue(row.payment_pending_now),
    currentActionLoad: numberValue(row.current_action_load),

    assignedDuringPeriod: numberValue(row.assigned_during_period),
    leadsWorked: numberValue(row.leads_worked),
    currentPortfolioWorked: numberValue(row.current_portfolio_worked),
    portfolioWorkRate: numberValue(row.portfolio_work_rate),

    outboundInteractions: numberValue(row.outbound_interactions),
    whatsappReplies: numberValue(row.whatsapp_replies),
    phoneInteractions: numberValue(row.phone_interactions),
    emailInteractions: numberValue(row.email_interactions),
    instagramInteractions: numberValue(row.instagram_interactions),
    followupsCompleted: numberValue(row.followups_completed),
    followupsSnoozed: numberValue(row.followups_snoozed),
    stageChanges: numberValue(row.stage_changes),

    movedContacted: numberValue(row.moved_contacted),
    movedEngaged: numberValue(row.moved_engaged),
    movedQualified: numberValue(row.moved_qualified),
    movedHighIntent: numberValue(row.moved_high_intent),
    movedPaymentPending: numberValue(row.moved_payment_pending),
    enrolledByEmployee: numberValue(row.enrolled_by_employee),
    movedOutOfActivePipeline: numberValue(row.moved_out_of_active_pipeline),

    assignedCohortEnrolled: numberValue(row.assigned_cohort_enrolled),
    assignedCohortEnrollmentRate: numberValue(
      row.assigned_cohort_enrollment_rate,
    ),
    workedToEnrolledRate: numberValue(row.worked_to_enrolled_rate),

    firstResponses: numberValue(row.first_responses),
    medianFirstResponseMinutes: nullableNumber(
      row.median_first_response_minutes,
    ),
    firstResponseOver60m: numberValue(row.first_response_over_60m),
  };
}

function mapRecentWork(value: unknown): TeamRecentWork {
  const row = asRecord(value);

  return {
    occurredAt: textValue(row.occurred_at),
    userId: textValue(row.user_id),
    employeeName: textValue(row.employee_name, "CRM User"),
    role: textValue(row.role, "unknown"),
    eventType: textValue(row.event_type, "activity"),
    channel: textValue(row.channel) || null,
    leadId: textValue(row.lead_id),
    leadCode: textValue(row.lead_code, "Lead"),
    leadName: textValue(row.lead_name, textValue(row.lead_code, "Lead")),
    fromStage: textValue(row.from_stage) || null,
    toStage: textValue(row.to_stage) || null,
  };
}

function emptySummary(): TeamPerformanceSummary {
  return {
    teamMembers: 0,
    currentAssignedTotal: 0,
    currentActiveLeads: 0,
    assignedDuringPeriod: 0,
    uniqueLeadsWorked: 0,
    outboundInteractions: 0,
    followupsCompleted: 0,
    enrolledByStaff: 0,
    needsReplyNow: 0,
    overdueLeadsNow: 0,
  };
}

function mapSnapshot(value: unknown): TeamPerformanceSnapshot {
  const root = asRecord(value);
  const range = asRecord(root.range);
  const summary = asRecord(root.summary);

  return {
    range: {
      startDate: textValue(range.startDate),
      endDate: textValue(range.endDate),
      timezone: textValue(range.timezone, "Asia/Kolkata"),
    },
    summary: {
      teamMembers: numberValue(summary.team_members),
      currentAssignedTotal: numberValue(summary.current_assigned_total),
      currentActiveLeads: numberValue(summary.current_active_leads),
      assignedDuringPeriod: numberValue(summary.assigned_during_period),
      uniqueLeadsWorked: numberValue(summary.unique_leads_worked),
      outboundInteractions: numberValue(summary.outbound_interactions),
      followupsCompleted: numberValue(summary.followups_completed),
      enrolledByStaff: numberValue(summary.enrolled_by_staff),
      needsReplyNow: numberValue(summary.needs_reply_now),
      overdueLeadsNow: numberValue(summary.overdue_leads_now),
    },
    employees: asArray(root.employees).map(mapEmployee),
    recentWork: asArray(root.recentWork).map(mapRecentWork),
  };
}

function mockSnapshot(
  startDate: string,
  endDate: string,
): TeamPerformanceSnapshot {
  return {
    range: {
      startDate,
      endDate,
      timezone: "Asia/Kolkata",
    },
    summary: {
      ...emptySummary(),
      teamMembers: 2,
      currentAssignedTotal: 36,
      currentActiveLeads: 33,
      assignedDuringPeriod: 22,
      uniqueLeadsWorked: 18,
      outboundInteractions: 31,
      followupsCompleted: 14,
      enrolledByStaff: 4,
      needsReplyNow: 5,
      overdueLeadsNow: 3,
    },
    employees: [
      {
        userId: "mock-admin",
        employeeName: "Arun",
        role: "admin",
        currentAssignedTotal: 12,
        currentActiveLeads: 10,
        needsReplyNow: 2,
        overdueLeadsNow: 1,
        overdueTasksNow: 1,
        neverContactedNow: 1,
        highIntentNow: 3,
        paymentPendingNow: 2,
        currentActionLoad: 9,
        assignedDuringPeriod: 7,
        leadsWorked: 8,
        currentPortfolioWorked: 7,
        portfolioWorkRate: 58.3,
        outboundInteractions: 14,
        whatsappReplies: 10,
        phoneInteractions: 2,
        emailInteractions: 1,
        instagramInteractions: 1,
        followupsCompleted: 6,
        followupsSnoozed: 1,
        stageChanges: 10,
        movedContacted: 2,
        movedEngaged: 2,
        movedQualified: 3,
        movedHighIntent: 1,
        movedPaymentPending: 1,
        enrolledByEmployee: 2,
        movedOutOfActivePipeline: 1,
        assignedCohortEnrolled: 2,
        assignedCohortEnrollmentRate: 28.6,
        workedToEnrolledRate: 25,
        firstResponses: 5,
        medianFirstResponseMinutes: 11.5,
        firstResponseOver60m: 1,
      },
      {
        userId: "mock-employee",
        employeeName: "Admissions Employee",
        role: "admissions",
        currentAssignedTotal: 24,
        currentActiveLeads: 23,
        needsReplyNow: 3,
        overdueLeadsNow: 2,
        overdueTasksNow: 2,
        neverContactedNow: 2,
        highIntentNow: 4,
        paymentPendingNow: 3,
        currentActionLoad: 14,
        assignedDuringPeriod: 15,
        leadsWorked: 12,
        currentPortfolioWorked: 11,
        portfolioWorkRate: 45.8,
        outboundInteractions: 17,
        whatsappReplies: 13,
        phoneInteractions: 1,
        emailInteractions: 2,
        instagramInteractions: 1,
        followupsCompleted: 8,
        followupsSnoozed: 2,
        stageChanges: 13,
        movedContacted: 4,
        movedEngaged: 3,
        movedQualified: 4,
        movedHighIntent: 2,
        movedPaymentPending: 2,
        enrolledByEmployee: 2,
        movedOutOfActivePipeline: 1,
        assignedCohortEnrolled: 2,
        assignedCohortEnrollmentRate: 13.3,
        workedToEnrolledRate: 16.7,
        firstResponses: 8,
        medianFirstResponseMinutes: 16,
        firstResponseOver60m: 2,
      },
    ],
    recentWork: [],
  };
}

export async function getTeamPerformanceSnapshot(
  startDate: string,
  endDate: string,
): Promise<TeamPerformanceSnapshot> {
  if (useMockData) {
    return mockSnapshot(startDate, endDate);
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_team_performance_snapshot", {
    p_start_date: startDate,
    p_end_date: endDate,
  });

  if (error) {
    throw new Error(`Unable to load team performance: ${error.message}`);
  }

  return mapSnapshot(data);
}
