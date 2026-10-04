import type {
  Channel,
  LeadOverview,
  LeadStage,
} from '@/types/crm';

import {
  createClient,
} from '@/lib/supabase/server';

import {
  useMockData,
} from '@/lib/config';

import {
  getDashboardSourceBreakdown,
  getFollowUps,
  getLeads,
  getPipelineCounts,
} from '@/lib/data';


export type DashboardSource = {
  source: string;
  leads: number;
  qualified: number;
  share: number;
};


export type DashboardRevenueSummary = {
  currency: string;
  pipeline: number;
  weighted: number;
  collected: number;
  outstanding: number;
  opportunities: number;
};


export type DashboardBatchDemand = {
  id: string;
  batchCode: string;
  courseName: string;
  location: string;
  mode: string;
  startDate: string | null;
  endDate: string | null;
  activeDemand: number;
  hotDemand: number;
  paymentPending: number;
  enrolled: number;
  capacity: number | null;
  seatsRemaining: number | null;
};


export type DashboardMetrics = {
  total: number;
  activePipeline: number;
  qualifiedPlus: number;
  highIntent: number;
  paymentPending: number;
  enrolled: number;
  priority: number;
  newLast24h: number;
  needsReply: number;
  unread: number;
  needsFirstTouch: number;
  waitingOverHour: number;
  followupsDue: number;
};


export type DashboardSnapshot = {
  metrics: DashboardMetrics;

  counts: Record<
    LeadStage,
    number
  >;

  sources:
    DashboardSource[];

  priorityLeads:
    LeadOverview[];

  revenueSummary:
    DashboardRevenueSummary[];

  upcomingBatches:
    DashboardBatchDemand[];

  unvaluedOpenLeads:
    number;
};


const emptyCounts: Record<
  LeadStage,
  number
> = {
  new: 0,
  contacted: 0,
  engaged: 0,
  qualified: 0,
  high_intent: 0,
  payment_pending: 0,
  enrolled: 0,
  nurture: 0,
  not_now: 0,
  lost: 0,
  unqualified: 0,
  duplicate: 0,
};


async function getCurrentOrganizationId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string> {

  const { data: memberships, error: membershipError } =
    await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', userId)
      .eq('active', true)
      .limit(2);

  if (membershipError) {
    throw new Error(
      `Unable to resolve current organization: ${membershipError.message}`
    );
  }

  if (!memberships || memberships.length === 0) {
    throw new Error(
      'No active organization membership was found.'
    );
  }

  if (memberships.length > 1) {
    throw new Error(
      'Multiple active organization memberships were found. Workspace selection is required.'
    );
  }

  return String(
    memberships[0].organization_id
  );
}

export async function getDashboardSnapshot():
Promise<DashboardSnapshot> {

  if (
    useMockData
  ) {
    return getMockDashboardSnapshot();
  }


  const supabase =
    await createClient();


  const authResult =
    await supabase.auth.getUser();


  if (authResult.error) {
    throw new Error(
      `Unable to authenticate Dashboard: ${authResult.error.message}`
    );
  }


  const user =
    authResult.data.user;


  if (!user) {
    throw new Error(
      'Unable to authenticate Dashboard: user is not authenticated.'
    );
  }


  const organizationId =
    await getCurrentOrganizationId(
      supabase,
      user.id
    );


  const {
    data,
    error,
  } =
    await supabase.rpc(
      'get_dashboard_snapshot',
      {
        p_organization_id:
          organizationId,
      }
    );


  if (
    error
  ) {
    throw new Error(
      `Unable to load dashboard snapshot: ${error.message}`
    );
  }


  return normalizeSnapshot(
    data
  );
}


async function getMockDashboardSnapshot():
Promise<DashboardSnapshot> {

  const [
    leads,
    counts,
    sources,
    followups,
  ] = await Promise.all([
    getLeads(),
    getPipelineCounts(),
    getDashboardSourceBreakdown(),
    getFollowUps(),
  ]);


  const total =
    Object.values(
      counts
    ).reduce(
      (
        sum,
        value
      ) =>
        sum +
        value,
      0
    );


  const activePipeline =
    counts.new +
    counts.contacted +
    counts.engaged +
    counts.qualified +
    counts.high_intent +
    counts.payment_pending;


  const qualifiedPlus =
    counts.qualified +
    counts.high_intent +
    counts.payment_pending +
    counts.enrolled;


  const twentyFourHoursAgo =
    Date.now() -
    24 *
      60 *
      60 *
      1000;


  const newLast24h =
    leads.filter(
      (
        lead
      ) => {

        if (
          !lead.createdAt
        ) {
          return false;
        }


        const createdAt =
          new Date(
            lead.createdAt
          ).getTime();


        return (
          Number.isFinite(
            createdAt
          ) &&
          createdAt >=
            twentyFourHoursAgo
        );
      }
    ).length;


  const needsFirstTouch =
    leads.filter(
      (
        lead
      ) =>
        lead.stage ===
          'new' &&
        !lead.lastContactedAt
    ).length;


  const priorityLeads =
    [...leads]
      .filter(
        (
          lead
        ) =>
          (
            lead.stage ===
              'new' &&
            !lead.lastContactedAt
          ) ||
          [
            'qualified',
            'high_intent',
            'payment_pending',
          ].includes(
            lead.stage
          )
      )
      .sort(
        (
          a,
          b
        ) => {

          const aScore =
            mockPriorityScore(
              a
            );


          const bScore =
            mockPriorityScore(
              b
            );


          if (
            aScore !==
            bScore
          ) {
            return (
              bScore -
              aScore
            );
          }


          const aDate =
            a.createdAt
              ? new Date(
                  a.createdAt
                ).getTime()
              : 0;


          const bDate =
            b.createdAt
              ? new Date(
                  b.createdAt
                ).getTime()
              : 0;


          return (
            bDate -
            aDate
          );
        }
      )
      .slice(
        0,
        8
      );


  return {
    metrics: {
      total,
      activePipeline,
      qualifiedPlus,
      highIntent:
        counts.high_intent,
      paymentPending:
        counts.payment_pending,
      enrolled:
        counts.enrolled,
      priority:
        counts.high_intent +
        counts.payment_pending,
      newLast24h,
      needsReply:
        0,
      unread:
        0,
      needsFirstTouch,
      waitingOverHour:
        0,
      followupsDue:
        followups.length,
    },

    counts,

    sources:
      sources.map(
        (
          row
        ) => ({
          source:
            row.source,
          leads:
            row.leads,
          qualified:
            row.qualified,
          share:
            row.share,
        })
      ),

    priorityLeads,

    revenueSummary:
      [],

    upcomingBatches:
      [],

    unvaluedOpenLeads:
      0,
  };
}


function normalizeSnapshot(
  value: unknown
): DashboardSnapshot {

  const root =
    isRecord(
      value
    )
      ? value
      : {};


  const metricsRaw =
    isRecord(
      root.metrics
    )
      ? root.metrics
      : {};


  const countsRaw =
    isRecord(
      root.stage_counts
    )
      ? root.stage_counts
      : {};


  const counts: Record<
    LeadStage,
    number
  > = {
    ...emptyCounts,

    new:
      safeNumber(
        countsRaw.new
      ),

    contacted:
      safeNumber(
        countsRaw.contacted
      ),

    engaged:
      safeNumber(
        countsRaw.engaged
      ),

    qualified:
      safeNumber(
        countsRaw.qualified
      ),

    high_intent:
      safeNumber(
        countsRaw.high_intent
      ),

    payment_pending:
      safeNumber(
        countsRaw.payment_pending
      ),

    enrolled:
      safeNumber(
        countsRaw.enrolled
      ),

    nurture:
      safeNumber(
        countsRaw.nurture
      ),

    not_now:
      safeNumber(
        countsRaw.not_now
      ),

    lost:
      safeNumber(
        countsRaw.lost
      ),

    unqualified:
      safeNumber(
        countsRaw.unqualified
      ),

    duplicate:
      safeNumber(
        countsRaw.duplicate
      ),
  };


  const sources =
    Array.isArray(
      root.sources
    )
      ? root.sources
          .filter(
            isRecord
          )
          .map(
            (
              row
            ): DashboardSource => ({
              source:
                stringValue(
                  row.source,
                  'Unknown'
                ),

              leads:
                safeNumber(
                  row.leads
                ),

              qualified:
                safeNumber(
                  row.qualified
                ),

              share:
                safeNumber(
                  row.share
                ),
            })
          )
      : [];


  const priorityLeads =
    Array.isArray(
      root.priority_leads
    )
      ? root.priority_leads
          .filter(
            isRecord
          )
          .map(
            mapPriorityLead
          )
      : [];


  const revenueSummary =
    Array.isArray(
      root.revenue_summary
    )
      ? root.revenue_summary
          .filter(
            isRecord
          )
          .map(
            (
              row
            ): DashboardRevenueSummary => ({
              currency:
                stringValue(
                  row.currency
                ),

              pipeline:
                safeNumber(
                  row.pipeline
                ),

              weighted:
                safeNumber(
                  row.weighted
                ),

              collected:
                safeNumber(
                  row.collected
                ),

              outstanding:
                safeNumber(
                  row.outstanding
                ),

              opportunities:
                safeNumber(
                  row.opportunities
                ),
            })
          )
      : [];


  const upcomingBatches =
    Array.isArray(
      root.upcoming_batches
    )
      ? root.upcoming_batches
          .filter(
            isRecord
          )
          .map(
            (
              row
            ): DashboardBatchDemand => ({
              id:
                stringValue(
                  row.id
                ),

              batchCode:
                stringValue(
                  row.batch_code,
                  'Batch'
                ),

              courseName:
                stringValue(
                  row.course_name,
                  'Course'
                ),

              location:
                stringValue(
                  row.location,
                  '—'
                ),

              mode:
                stringValue(
                  row.mode,
                  '—'
                ),

              startDate:
                nullableString(
                  row.start_date
                ),

              endDate:
                nullableString(
                  row.end_date
                ),

              activeDemand:
                safeNumber(
                  row.active_demand
                ),

              hotDemand:
                safeNumber(
                  row.hot_demand
                ),

              paymentPending:
                safeNumber(
                  row.payment_pending
                ),

              enrolled:
                safeNumber(
                  row.enrolled
                ),

              capacity:
                nullableNumber(
                  row.capacity
                ),

              seatsRemaining:
                nullableNumber(
                  row.seats_remaining
                ),
            })
          )
      : [];


  return {
    metrics: {
      total:
        safeNumber(
          metricsRaw.total
        ),

      activePipeline:
        safeNumber(
          metricsRaw.active_pipeline
        ),

      qualifiedPlus:
        safeNumber(
          metricsRaw.qualified_plus
        ),

      highIntent:
        safeNumber(
          metricsRaw.high_intent
        ),

      paymentPending:
        safeNumber(
          metricsRaw.payment_pending
        ),

      enrolled:
        safeNumber(
          metricsRaw.enrolled
        ),

      priority:
        safeNumber(
          metricsRaw.priority
        ),

      newLast24h:
        safeNumber(
          metricsRaw.new_last_24h
        ),

      needsReply:
        safeNumber(
          metricsRaw.needs_reply
        ),

      unread:
        safeNumber(
          metricsRaw.unread
        ),

      needsFirstTouch:
        safeNumber(
          metricsRaw.needs_first_touch
        ),

      waitingOverHour:
        safeNumber(
          metricsRaw.waiting_over_hour
        ),

      followupsDue:
        safeNumber(
          metricsRaw.followups_due
        ),
    },

    counts,

    sources,

    priorityLeads,

    revenueSummary,

    upcomingBatches,

    unvaluedOpenLeads:
      safeNumber(
        root.unvalued_open_leads
      ),
  };
}


function mapPriorityLead(
  row: Record<
    string,
    any
  >
): LeadOverview {

  return {
    id:
      stringValue(
        row.id
      ),

    leadCode:
      stringValue(
        row.lead_code
      ),

    name:
      stringValue(
        row.lead_name,
        stringValue(
          row.lead_code,
          'Lead'
        )
      ),

    email:
      nullableString(
        row.email
      ) ??
      undefined,

    phone:
      nullableString(
        row.phone
      ) ??
      undefined,

    course:
      stringValue(
        row.course_name,
        'Not selected'
      ),

    location:
      stringValue(
        row.preferred_location,
        '—'
      ),

    country:
      stringValue(
        row.country,
        '—'
      ),

    stage:
      stringValue(
        row.current_stage,
        'new'
      ) as LeadStage,

    intent:
      stringValue(
        row.intent,
        'unknown'
      ) as LeadOverview['intent'],

    firstTouchSource:
      stringValue(
        row.first_touch_source,
        'Unknown'
      ),

    firstTouchMedium:
      stringValue(
        row.first_touch_medium,
        'Unknown'
      ),

    firstTouchCampaign:
      stringValue(
        row.first_touch_campaign,
        'Unattributed'
      ),

    leadCreationChannel:
      stringValue(
        row.lead_creation_channel,
        'other'
      ) as Channel,

    currentContactChannel:
      stringValue(
        row.current_contact_channel,
        'other'
      ) as Channel,

    owner:
      row.owner_user_id
        ? 'Assigned'
        : 'Unassigned',

    lastContactedAt:
      nullableString(
        row.last_contacted_at
      ) ??
      undefined,

    nextFollowupAt:
      nullableString(
        row.next_followup_at
      ) ??
      undefined,

    createdAt:
      stringValue(
        row.created_at
      ),

    value:
      row.enrollment_value ==
        null
        ? undefined
        : safeNumber(
            row.enrollment_value
          ),

    currency:
      nullableString(
        row.enrollment_currency
      ) ??
      undefined,
  };
}


function mockPriorityScore(
  lead: LeadOverview
) {

  let score =
    0;


  if (
    lead.stage ===
    'payment_pending'
  ) {
    score +=
      100;
  }


  if (
    lead.stage ===
    'high_intent'
  ) {
    score +=
      90;
  }


  if (
    lead.stage ===
    'qualified'
  ) {
    score +=
      70;
  }


  if (
    lead.stage ===
      'new' &&
    !lead.lastContactedAt
  ) {
    score +=
      80;
  }


  return score;
}


function safeNumber(
  value: unknown
) {

  const parsed =
    Number(
      value ??
        0
    );


  return Number.isFinite(
    parsed
  )
    ? parsed
    : 0;
}


function nullableNumber(
  value: unknown
) {

  if (
    value ===
      null ||
    value ===
      undefined ||
    value ===
      ''
  ) {
    return null;
  }


  const parsed =
    Number(
      value
    );


  return Number.isFinite(
    parsed
  )
    ? parsed
    : null;
}


function stringValue(
  value: unknown,
  fallback = ''
) {

  if (
    value ===
      null ||
    value ===
      undefined ||
    value ===
      ''
  ) {
    return fallback;
  }


  return String(
    value
  );
}


function nullableString(
  value: unknown
) {

  if (
    value ===
      null ||
    value ===
      undefined ||
    value ===
      ''
  ) {
    return null;
  }


  return String(
    value
  );
}


function isRecord(
  value: unknown
): value is Record<
  string,
  any
> {

  return Boolean(
    value &&
    typeof value ===
      'object' &&
    !Array.isArray(
      value
    )
  );
}
