import { useMockData } from '@/lib/config';
import { createClient } from '@/lib/supabase/server';

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


export type TeamUnassignedLead = {
  id: string;
  leadCode: string;
  leadName: string;
  currentStage: string;
  intent: string;
  courseName: string | null;
  preferredLocation: string | null;
  country: string | null;
  leadCreationChannel: string | null;
  nextFollowupAt: string | null;
  lastContactedAt: string | null;
  createdAt: string;
  priorityScore: number;
  priorityReason: string;
};

export type TeamAssignmentQueue = {
  total: number;
  leads: TeamUnassignedLead[];
};


export type TeamAssignmentFairnessSummary = {
  comparisonEmployeeCount: number;
  activeEmployeeCount: number;
  recordedAssignmentEvents: number;
  uniqueLeadsAssigned: number;
  transferEvents: number;
  unassignmentEvents: number;
  currentUnassignedOpen: number;
};

export type TeamAssignmentFairnessEmployee = {
  userId: string;
  employeeName: string;
  active: boolean;
  currentOwnedTotal: number;
  currentActiveOwned: number;
  assignmentsReceived: number;
  uniqueLeadsReceived: number;
  initialAssignmentsReceived: number;
  transfersIn: number;
  transfersOut: number;
  unassignmentsFrom: number;
  sameOwnerEvents: number;
  assignmentSharePct: number;
  equalShareBaselinePct: number;
  differenceFromEqualSharePctPoints: number;
};

export type TeamAssignmentTransferPair = {
  fromOwnerId: string;
  fromOwnerName: string;
  toOwnerId: string;
  toOwnerName: string;
  transferCount: number;
};

export type TeamAssignmentHistoryItem = {
  activityId: string;
  occurredAt: string;
  leadId: string;
  leadCode: string;
  leadName: string;
  actorId: string | null;
  actorName: string;
  fromOwnerId: string | null;
  fromOwnerName: string;
  toOwnerId: string | null;
  toOwnerName: string;
  eventKind: string;
};

export type TeamAssignmentFairnessSnapshot = {
  range: {
    startDate: string;
    endDate: string;
    timezone: string;
  };
  summary: TeamAssignmentFairnessSummary;
  employees: TeamAssignmentFairnessEmployee[];
  transferPairs: TeamAssignmentTransferPair[];
  history: TeamAssignmentHistoryItem[];
  methodology: {
    assignmentSource: string;
    currentOwnershipSource: string;
    equalShareDefinition: string;
    historicalLimitation: string;
  };
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
  return value && typeof value === 'object'
    ? (value as UnknownRecord)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function textValue(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : fallback;
}

function mapEmployee(value: unknown): TeamPerformanceEmployee {
  const row = asRecord(value);

  return {
    userId: textValue(row.user_id),
    employeeName: textValue(row.employee_name, 'CRM User'),
    role: textValue(row.role, 'unknown'),

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
      row.assigned_cohort_enrollment_rate
    ),
    workedToEnrolledRate: numberValue(row.worked_to_enrolled_rate),

    firstResponses: numberValue(row.first_responses),
    medianFirstResponseMinutes: nullableNumber(
      row.median_first_response_minutes
    ),
    firstResponseOver60m: numberValue(row.first_response_over_60m),
  };
}

function mapRecentWork(value: unknown): TeamRecentWork {
  const row = asRecord(value);

  return {
    occurredAt: textValue(row.occurred_at),
    userId: textValue(row.user_id),
    employeeName: textValue(row.employee_name, 'CRM User'),
    role: textValue(row.role, 'unknown'),
    eventType: textValue(row.event_type, 'activity'),
    channel: textValue(row.channel) || null,
    leadId: textValue(row.lead_id),
    leadCode: textValue(row.lead_code, 'Lead'),
    leadName: textValue(row.lead_name, textValue(row.lead_code, 'Lead')),
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
      timezone: textValue(range.timezone, 'Asia/Kolkata'),
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
  endDate: string
): TeamPerformanceSnapshot {
  return {
    range: {
      startDate,
      endDate,
      timezone: 'Asia/Kolkata',
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
        userId: 'mock-admin',
        employeeName: 'Arun',
        role: 'admin',
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
        userId: 'mock-employee',
        employeeName: 'Admissions Employee',
        role: 'admissions',
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
  endDate: string
): Promise<TeamPerformanceSnapshot> {
  if (useMockData) {
    return mockSnapshot(startDate, endDate);
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc(
    'get_team_performance_snapshot',
    {
      p_start_date: startDate,
      p_end_date: endDate,
    }
  );

  if (error) {
    throw new Error(
      `Unable to load team performance: ${error.message}`
    );
  }

  return mapSnapshot(data);
}


function unassignedPriority(
  row: UnknownRecord
) {
  const stage =
    textValue(
      row.current_stage,
      'new'
    );

  const intent =
    textValue(
      row.intent,
      'unknown'
    );

  const lastContactedAt =
    textValue(
      row.last_contacted_at
    ) || null;

  const nextFollowupAt =
    textValue(
      row.next_followup_at
    ) || null;

  const createdAt =
    textValue(
      row.created_at
    );

  const stageWeight: Record<
    string,
    number
  > = {
    payment_pending: 100,
    high_intent: 90,
    qualified: 80,
    new: 70,
    engaged: 60,
    contacted: 50,
    nurture: 30,
    not_now: 20,
    lost: 0,
    unqualified: 0,
    duplicate: 0,
    enrolled: 0,
  };

  const intentWeight: Record<
    string,
    number
  > = {
    very_high: 18,
    high: 12,
    medium: 6,
    low: 2,
    unknown: 0,
  };

  let score =
    (
      stageWeight[
        stage
      ] ?? 25
    ) +
    (
      intentWeight[
        intent
      ] ?? 0
    );

  const reasons: string[] =
    [];

  if (
    stage ===
    'payment_pending'
  ) {
    reasons.push(
      'Payment pending'
    );
  } else if (
    stage ===
    'high_intent'
  ) {
    reasons.push(
      'High intent'
    );
  } else if (
    stage ===
    'qualified'
  ) {
    reasons.push(
      'Qualified'
    );
  }

  if (
    stage === 'new' &&
    !lastContactedAt
  ) {
    score += 18;

    reasons.push(
      'Needs first contact'
    );
  }

  if (
    intent ===
      'very_high' ||
    intent ===
      'high'
  ) {
    reasons.push(
      `${intent.replace(
        '_',
        ' '
      )} intent`
    );
  }

  if (
    nextFollowupAt
  ) {
    const due =
      new Date(
        nextFollowupAt
      ).getTime();

    if (
      Number.isFinite(
        due
      ) &&
      due <
        Date.now()
    ) {
      score += 15;

      reasons.push(
        'Follow-up overdue'
      );
    }
  }

  if (
    createdAt
  ) {
    const created =
      new Date(
        createdAt
      ).getTime();

    const ageHours =
      (
        Date.now() -
        created
      ) /
      3600000;

    if (
      Number.isFinite(
        ageHours
      ) &&
      ageHours >= 0 &&
      ageHours <= 2
    ) {
      score += 10;

      reasons.push(
        'Fresh enquiry'
      );
    }
  }

  return {
    score,
    reason:
      reasons
        .slice(
          0,
          3
        )
        .join(
          ' · '
        ) ||
      'Unassigned open lead',
  };
}

export async function getTeamAssignmentQueue(
  limit = 12
): Promise<TeamAssignmentQueue> {
  if (useMockData) {
    return {
      total: 2,
      leads: [
        {
          id: 'mock-unassigned-1',
          leadCode: 'LD-000901',
          leadName: 'New enquiry',
          currentStage: 'new',
          intent: 'high',
          courseName: '200 Hour YTT',
          preferredLocation: 'Mysore',
          country: 'Germany',
          leadCreationChannel: 'website',
          nextFollowupAt: null,
          lastContactedAt: null,
          createdAt:
            new Date()
              .toISOString(),
          priorityScore: 110,
          priorityReason:
            'Needs first contact · high intent · Fresh enquiry',
        },
        {
          id: 'mock-unassigned-2',
          leadCode: 'LD-000902',
          leadName: 'Payment enquiry',
          currentStage: 'payment_pending',
          intent: 'very_high',
          courseName: '300 Hour YTT',
          preferredLocation: 'Kerala',
          country: 'United Kingdom',
          leadCreationChannel: 'whatsapp',
          nextFollowupAt: null,
          lastContactedAt:
            new Date()
              .toISOString(),
          createdAt:
            new Date()
              .toISOString(),
          priorityScore: 118,
          priorityReason:
            'Payment pending · very high intent',
        },
      ],
    };
  }

  const supabase =
    await createClient();

  const {
    data,
    error,
    count,
  } =
    await supabase
      .from(
        'v_leads_overview'
      )
      .select(
        `
          id,
          lead_code,
          lead_name,
          current_stage,
          status,
          intent,
          course_name,
          preferred_location,
          country,
          lead_creation_channel,
          owner_user_id,
          next_followup_at,
          last_contacted_at,
          created_at
        `,
        {
          count:
            'exact',
        }
      )
      .eq(
        'status',
        'open'
      )
      .is(
        'owner_user_id',
        null
      )
      .order(
        'created_at',
        {
          ascending:
            false,
        }
      )
      .limit(
        100
      );

  if (error) {
    throw new Error(
      `Unable to load unassigned leads: ${error.message}`
    );
  }

  const leads =
    (
      data ?? []
    )
      .map(
        (
          value
        ): TeamUnassignedLead => {
          const row =
            asRecord(
              value
            );

          const priority =
            unassignedPriority(
              row
            );

          return {
            id:
              textValue(
                row.id
              ),

            leadCode:
              textValue(
                row.lead_code,
                'Lead'
              ),

            leadName:
              textValue(
                row.lead_name,
                textValue(
                  row.lead_code,
                  'Lead'
                )
              ),

            currentStage:
              textValue(
                row.current_stage,
                'new'
              ),

            intent:
              textValue(
                row.intent,
                'unknown'
              ),

            courseName:
              textValue(
                row.course_name
              ) ||
              null,

            preferredLocation:
              textValue(
                row.preferred_location
              ) ||
              null,

            country:
              textValue(
                row.country
              ) ||
              null,

            leadCreationChannel:
              textValue(
                row.lead_creation_channel
              ) ||
              null,

            nextFollowupAt:
              textValue(
                row.next_followup_at
              ) ||
              null,

            lastContactedAt:
              textValue(
                row.last_contacted_at
              ) ||
              null,

            createdAt:
              textValue(
                row.created_at
              ),

            priorityScore:
              priority.score,

            priorityReason:
              priority.reason,
          };
        }
      )
      .sort(
        (
          a,
          b
        ) => {
          if (
            a.priorityScore !==
            b.priorityScore
          ) {
            return (
              b.priorityScore -
              a.priorityScore
            );
          }

          return (
            new Date(
              b.createdAt
            ).getTime() -
            new Date(
              a.createdAt
            ).getTime()
          );
        }
      )
      .slice(
        0,
        Math.max(
          1,
          limit
        )
      );

  return {
    total:
      count ?? leads.length,
    leads,
  };
}


function booleanValue(
  value: unknown
) {
  if (
    value === true ||
    value === 'true'
  ) {
    return true;
  }

  return false;
}

function mapAssignmentEmployee(
  value: unknown
): TeamAssignmentFairnessEmployee {
  const row =
    asRecord(
      value
    );

  return {
    userId:
      textValue(
        row.user_id
      ),

    employeeName:
      textValue(
        row.employee_name,
        'Admissions Employee'
      ),

    active:
      booleanValue(
        row.active
      ),

    currentOwnedTotal:
      numberValue(
        row.current_owned_total
      ),

    currentActiveOwned:
      numberValue(
        row.current_active_owned
      ),

    assignmentsReceived:
      numberValue(
        row.assignments_received
      ),

    uniqueLeadsReceived:
      numberValue(
        row.unique_leads_received
      ),

    initialAssignmentsReceived:
      numberValue(
        row.initial_assignments_received
      ),

    transfersIn:
      numberValue(
        row.transfers_in
      ),

    transfersOut:
      numberValue(
        row.transfers_out
      ),

    unassignmentsFrom:
      numberValue(
        row.unassignments_from
      ),

    sameOwnerEvents:
      numberValue(
        row.same_owner_events
      ),

    assignmentSharePct:
      numberValue(
        row.assignment_share_pct
      ),

    equalShareBaselinePct:
      numberValue(
        row.equal_share_baseline_pct
      ),

    differenceFromEqualSharePctPoints:
      numberValue(
        row.difference_from_equal_share_pct_points
      ),
  };
}

function mapTransferPair(
  value: unknown
): TeamAssignmentTransferPair {
  const row =
    asRecord(
      value
    );

  return {
    fromOwnerId:
      textValue(
        row.from_owner_id
      ),

    fromOwnerName:
      textValue(
        row.from_owner_name,
        'CRM User'
      ),

    toOwnerId:
      textValue(
        row.to_owner_id
      ),

    toOwnerName:
      textValue(
        row.to_owner_name,
        'CRM User'
      ),

    transferCount:
      numberValue(
        row.transfer_count
      ),
  };
}

function mapAssignmentHistoryItem(
  value: unknown
): TeamAssignmentHistoryItem {
  const row =
    asRecord(
      value
    );

  return {
    activityId:
      textValue(
        row.activity_id
      ),

    occurredAt:
      textValue(
        row.occurred_at
      ),

    leadId:
      textValue(
        row.lead_id
      ),

    leadCode:
      textValue(
        row.lead_code,
        'Lead'
      ),

    leadName:
      textValue(
        row.lead_name,
        textValue(
          row.lead_code,
          'Lead'
        )
      ),

    actorId:
      textValue(
        row.actor_id
      ) ||
      null,

    actorName:
      textValue(
        row.actor_name,
        'CRM User'
      ),

    fromOwnerId:
      textValue(
        row.from_owner_id
      ) ||
      null,

    fromOwnerName:
      textValue(
        row.from_owner_name,
        'Unassigned'
      ),

    toOwnerId:
      textValue(
        row.to_owner_id
      ) ||
      null,

    toOwnerName:
      textValue(
        row.to_owner_name,
        'Unassigned'
      ),

    eventKind:
      textValue(
        row.event_kind,
        'assignment'
      ),
  };
}

function emptyAssignmentSummary(): TeamAssignmentFairnessSummary {
  return {
    comparisonEmployeeCount: 0,
    activeEmployeeCount: 0,
    recordedAssignmentEvents: 0,
    uniqueLeadsAssigned: 0,
    transferEvents: 0,
    unassignmentEvents: 0,
    currentUnassignedOpen: 0,
  };
}

function mapAssignmentFairnessSnapshot(
  value: unknown
): TeamAssignmentFairnessSnapshot {
  const root =
    asRecord(
      value
    );

  const range =
    asRecord(
      root.range
    );

  const summary =
    asRecord(
      root.summary
    );

  const methodology =
    asRecord(
      root.methodology
    );

  return {
    range: {
      startDate:
        textValue(
          range.startDate
        ),

      endDate:
        textValue(
          range.endDate
        ),

      timezone:
        textValue(
          range.timezone,
          'Asia/Kolkata'
        ),
    },

    summary: {
      comparisonEmployeeCount:
        numberValue(
          summary.comparison_employee_count
        ),

      activeEmployeeCount:
        numberValue(
          summary.active_employee_count
        ),

      recordedAssignmentEvents:
        numberValue(
          summary.recorded_assignment_events
        ),

      uniqueLeadsAssigned:
        numberValue(
          summary.unique_leads_assigned
        ),

      transferEvents:
        numberValue(
          summary.transfer_events
        ),

      unassignmentEvents:
        numberValue(
          summary.unassignment_events
        ),

      currentUnassignedOpen:
        numberValue(
          summary.current_unassigned_open
        ),
    },

    employees:
      asArray(
        root.employees
      ).map(
        mapAssignmentEmployee
      ),

    transferPairs:
      asArray(
        root.transferPairs
      ).map(
        mapTransferPair
      ),

    history:
      asArray(
        root.history
      ).map(
        mapAssignmentHistoryItem
      ),

    methodology: {
      assignmentSource:
        textValue(
          methodology.assignmentSource
        ),

      currentOwnershipSource:
        textValue(
          methodology.currentOwnershipSource
        ),

      equalShareDefinition:
        textValue(
          methodology.equalShareDefinition
        ),

      historicalLimitation:
        textValue(
          methodology.historicalLimitation
        ),
    },
  };
}

function mockAssignmentFairnessSnapshot(
  startDate: string,
  endDate: string
): TeamAssignmentFairnessSnapshot {
  return {
    range: {
      startDate,
      endDate,
      timezone:
        'Asia/Kolkata',
    },

    summary: {
      ...emptyAssignmentSummary(),
      comparisonEmployeeCount:
        3,
      activeEmployeeCount:
        3,
      recordedAssignmentEvents:
        42,
      uniqueLeadsAssigned:
        40,
      transferEvents:
        3,
      unassignmentEvents:
        1,
      currentUnassignedOpen:
        4,
    },

    employees: [
      {
        userId:
          'mock-employee-a',
        employeeName:
          'Employee A',
        active:
          true,
        currentOwnedTotal:
          18,
        currentActiveOwned:
          16,
        assignmentsReceived:
          15,
        uniqueLeadsReceived:
          15,
        initialAssignmentsReceived:
          14,
        transfersIn:
          1,
        transfersOut:
          0,
        unassignmentsFrom:
          0,
        sameOwnerEvents:
          0,
        assignmentSharePct:
          35.7,
        equalShareBaselinePct:
          33.3,
        differenceFromEqualSharePctPoints:
          2.4,
      },
      {
        userId:
          'mock-employee-b',
        employeeName:
          'Employee B',
        active:
          true,
        currentOwnedTotal:
          14,
        currentActiveOwned:
          13,
        assignmentsReceived:
          14,
        uniqueLeadsReceived:
          13,
        initialAssignmentsReceived:
          12,
        transfersIn:
          2,
        transfersOut:
          1,
        unassignmentsFrom:
          0,
        sameOwnerEvents:
          0,
        assignmentSharePct:
          33.3,
        equalShareBaselinePct:
          33.3,
        differenceFromEqualSharePctPoints:
          0,
      },
      {
        userId:
          'mock-employee-c',
        employeeName:
          'Employee C',
        active:
          true,
        currentOwnedTotal:
          12,
        currentActiveOwned:
          11,
        assignmentsReceived:
          13,
        uniqueLeadsReceived:
          12,
        initialAssignmentsReceived:
          12,
        transfersIn:
          1,
        transfersOut:
          2,
        unassignmentsFrom:
          1,
        sameOwnerEvents:
          0,
        assignmentSharePct:
          31,
        equalShareBaselinePct:
          33.3,
        differenceFromEqualSharePctPoints:
          -2.3,
      },
    ],

    transferPairs: [
      {
        fromOwnerId:
          'mock-employee-c',
        fromOwnerName:
          'Employee C',
        toOwnerId:
          'mock-employee-b',
        toOwnerName:
          'Employee B',
        transferCount:
          2,
      },
      {
        fromOwnerId:
          'mock-employee-b',
        fromOwnerName:
          'Employee B',
        toOwnerId:
          'mock-employee-a',
        toOwnerName:
          'Employee A',
        transferCount:
          1,
      },
    ],

    history: [],

    methodology: {
      assignmentSource:
        'activities.activity_type = owner_assignment',

      currentOwnershipSource:
        'leads.owner_user_id',

      equalShareDefinition:
        'Recorded assignment events divided equally across Admissions employees included in the comparison period',

      historicalLimitation:
        'Assignments that happened before owner_assignment audit logging existed are not reconstructed or guessed.',
    },
  };
}

export async function getTeamAssignmentFairnessSnapshot(
  startDate: string,
  endDate: string
): Promise<TeamAssignmentFairnessSnapshot> {
  if (useMockData) {
    return mockAssignmentFairnessSnapshot(
      startDate,
      endDate
    );
  }

  const supabase =
    await createClient();

  const {
    data,
    error,
  } =
    await supabase.rpc(
      'get_team_assignment_fairness_snapshot',
      {
        p_start_date:
          startDate,

        p_end_date:
          endDate,
      }
    );

  if (error) {
    throw new Error(
      `Unable to load assignment distribution: ${error.message}`
    );
  }

  return mapAssignmentFairnessSnapshot(
    data
  );
}
