import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CircleDollarSign,
  Clock3,
  ContactRound,
  Flame,
} from 'lucide-react';

import { PipelineBoard } from '@/components/pipeline-board';
import {
  PipelineInsights,
  type PipelineAgingPoint,
} from '@/components/pipeline-insights';
import { PageHeader, StatCard } from '@/components/ui';
import { getLeads } from '@/lib/data';
import { createClient } from '@/lib/supabase/server';


type PipelineAgingRow = {
  lead_id: string;
  lead_code: string | null;
  lead_name: string | null;

  current_stage: string;
  aging_status:
    | 'healthy'
    | 'warning'
    | 'stuck'
    | 'untracked';

  stage_entered_at: string | null;
  stage_age_hours:
    | number
    | string
    | null;
  stage_age_days:
    | number
    | string
    | null;

  warning_after_days:
    | number
    | string
    | null;
  stuck_after_days:
    | number
    | string
    | null;

  days_over_stuck_threshold:
    | number
    | string
    | null;

  days_since_last_contact:
    | number
    | string
    | null;

  owner_name: string | null;
  course_name: string | null;
};


type PipelineAgingSummaryRow = {
  current_stage: string;

  total_leads:
    | number
    | string
    | null;

  healthy_leads:
    | number
    | string
    | null;

  warning_leads:
    | number
    | string
    | null;

  stuck_leads:
    | number
    | string
    | null;

  median_stage_age_days:
    | number
    | string
    | null;

  oldest_stage_age_days:
    | number
    | string
    | null;
};


const activeStages = [
  'new',
  'contacted',
  'engaged',
  'qualified',
  'high_intent',
  'payment_pending',
] as const;


const stageLabels: Record<
  (typeof activeStages)[number],
  string
> = {
  new: 'New',
  contacted: 'Contacted',
  engaged: 'Engaged',
  qualified: 'Qualified',
  high_intent: 'High intent',
  payment_pending: 'Payment',
};


export default async function PipelinePage() {
  const supabase =
    await createClient();

  const [
    leads,
    agingResult,
    agingSummaryResult,
  ] = await Promise.all([
    getLeads(),

    supabase
      .from(
        'v_pipeline_stage_aging'
      )
      .select(`
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
      `)
      .in(
        'current_stage',
        [...activeStages]
      )
      .order(
        'stage_age_days',
        {
          ascending: false,
        }
      ),

    supabase
      .from(
        'v_pipeline_stage_aging_summary'
      )
      .select(`
        current_stage,
        total_leads,
        healthy_leads,
        warning_leads,
        stuck_leads,
        median_stage_age_days,
        oldest_stage_age_days
      `),
  ]);

  if (agingResult.error) {
    throw new Error(
      `Unable to load pipeline stage aging: ${agingResult.error.message}`
    );
  }

  if (agingSummaryResult.error) {
    throw new Error(
      `Unable to load pipeline aging summary: ${agingSummaryResult.error.message}`
    );
  }

  const agingRows =
    (agingResult.data ??
      []) as PipelineAgingRow[];

  const agingSummaryRows =
    (agingSummaryResult.data ??
      []) as PipelineAgingSummaryRow[];

  const agingByLead =
    new Map(
      agingRows.map(
        (row) => [
          row.lead_id,
          row,
        ]
      )
    );

  const summaryByStage =
    new Map(
      agingSummaryRows.map(
        (row) => [
          row.current_stage,
          row,
        ]
      )
    );

  const activeLeads =
    leads.filter(
      (lead) =>
        activeStages.includes(
          lead.stage as (
            typeof activeStages
          )[number]
        )
    );

  const qualifiedPlus =
    leads.filter(
      (lead) =>
        [
          'qualified',
          'high_intent',
          'payment_pending',
          'enrolled',
        ].includes(
          lead.stage
        )
    ).length;

  const highIntent =
    leads.filter(
      (lead) =>
        lead.stage ===
        'high_intent'
    ).length;

  const paymentPending =
    leads.filter(
      (lead) =>
        lead.stage ===
        'payment_pending'
    ).length;

  const enrolled =
    leads.filter(
      (lead) =>
        lead.stage ===
        'enrolled'
    ).length;

  const stuckLeads =
    agingRows
      .filter(
        (row) =>
          row.aging_status ===
          'stuck'
      )
      .sort(
        (a, b) =>
          toNumber(
            b.stage_age_days
          ) -
          toNumber(
            a.stage_age_days
          )
      );

  const warningLeads =
    agingRows.filter(
      (row) =>
        row.aging_status ===
        'warning'
    );

  const activeStageAges =
    agingRows
      .map(
        (row) =>
          toNumber(
            row.stage_age_days
          )
      )
      .filter(
        (value) =>
          Number.isFinite(
            value
          )
      )
      .sort(
        (a, b) =>
          a - b
      );

  const medianStageAge =
    median(
      activeStageAges
    );

  const insightData =
    activeStages.map(
      (stage) => ({
        stage:
          stageLabels[
            stage
          ],
        leads:
          leads.filter(
            (lead) =>
              lead.stage ===
              stage
          ).length,
      })
    );

  const agingInsightData:
    PipelineAgingPoint[] =
      activeStages.map(
        (stage) => {
          const row =
            summaryByStage.get(
              stage
            );

          return {
            stage:
              stageLabels[
                stage
              ],
            healthy:
              toNumber(
                row?.healthy_leads
              ),
            warning:
              toNumber(
                row?.warning_leads
              ),
            stuck:
              toNumber(
                row?.stuck_leads
              ),
            medianDays:
              toNumber(
                row?.median_stage_age_days
              ),
            oldestDays:
              toNumber(
                row?.oldest_stage_age_days
              ),
          };
        }
      );

  const boardLeads =
    activeLeads.map(
      (lead) => {
        const aging =
          agingByLead.get(
            lead.id
          );

        return {
          id:
            lead.id,
          name:
            lead.name,
          stage:
            lead.stage,
          country:
            lead.country ??
            '',
          location:
            lead.location ??
            '',
          course:
            lead.course ??
            '',
          currentContactChannel:
            lead.currentContactChannel ??
            'unknown',

          agingStatus:
            aging?.aging_status ??
            'untracked',

          stageEnteredAt:
            aging?.stage_entered_at ??
            null,

          stageAgeHours:
            toNumber(
              aging?.stage_age_hours
            ),

          stageAgeDays:
            toNumber(
              aging?.stage_age_days
            ),

          warningAfterDays:
            nullableNumber(
              aging?.warning_after_days
            ),

          stuckAfterDays:
            nullableNumber(
              aging?.stuck_after_days
            ),

          daysOverStuckThreshold:
            toNumber(
              aging?.days_over_stuck_threshold
            ),

          daysSinceLastContact:
            nullableNumber(
              aging?.days_since_last_contact
            ),
        };
      }
    );

  return (
    <>
      <PageHeader
        eyebrow="Admissions funnel"
        title="Pipeline"
        description="A live operational view of active leads, including how long each opportunity has remained in its current stage. Drag cards to move stages through the audited workflow."
        actions={
          <>
            <Link
              href="/funnel"
              className="btn-secondary"
            >
              Funnel analytics
            </Link>

            <Link
              href="/admissions"
              className="btn-primary"
            >
              Admissions Desk
              <ArrowRight
                size={15}
              />
            </Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
        <div className="animate-rise stagger-1">
          <StatCard
            label="Active pipeline"
            value={
              activeLeads.length.toLocaleString()
            }
            note="open admissions opportunities"
            icon={
              <ContactRound
                size={19}
              />
            }
          />
        </div>

        <div className="animate-rise stagger-2">
          <StatCard
            label="Qualified+"
            value={
              qualifiedPlus.toLocaleString()
            }
            note="qualified through enrolled"
            icon={
              <BadgeCheck
                size={19}
              />
            }
          />
        </div>

        <div className="animate-rise stagger-3">
          <StatCard
            label="High intent"
            value={
              highIntent.toLocaleString()
            }
            note="strong buying intent"
            icon={
              <Flame
                size={19}
              />
            }
          />
        </div>

        <div className="animate-rise stagger-4">
          <StatCard
            label="Payment pending"
            value={
              paymentPending.toLocaleString()
            }
            note="closest active stage to enrollment"
            icon={
              <CircleDollarSign
                size={19}
              />
            }
          />
        </div>

        <div className="animate-rise stagger-5">
          <StatCard
            label="Stuck leads"
            value={
              stuckLeads.length.toLocaleString()
            }
            note={`${warningLeads.length.toLocaleString()} more in warning`}
            icon={
              <AlertTriangle
                size={19}
              />
            }
          />
        </div>

        <div className="animate-rise stagger-5">
          <StatCard
            label="Median stage age"
            value={
              formatAge(
                medianStageAge
              )
            }
            note="across active pipeline"
            icon={
              <Clock3
                size={19}
              />
            }
          />
        </div>

        <div className="animate-rise stagger-5">
          <StatCard
            label="Enrolled"
            value={
              enrolled.toLocaleString()
            }
            note="closed successful enrollments"
            icon={
              <BadgeCheck
                size={19}
              />
            }
          />
        </div>
      </div>

      <div className="mt-4 animate-rise stagger-2">
        <PipelineInsights
          data={
            insightData
          }
          agingData={
            agingInsightData
          }
        />
      </div>

      {stuckLeads.length >
        0 && (
        <section className="card-pad mt-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="eyebrow">
                Needs attention
              </div>

              <div className="section-title mt-1">
                Most stuck leads
              </div>

              <p className="mt-1 text-xs leading-5 text-slate-400">
                Leads furthest beyond the configured aging threshold for their current stage.
              </p>
            </div>

            <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
              {
                stuckLeads.length
              }{' '}
              stuck
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {stuckLeads
              .slice(
                0,
                6
              )
              .map(
                (lead) => (
                  <Link
                    key={
                      lead.lead_id
                    }
                    href={`/leads/${lead.lead_id}`}
                    className="group rounded-xl border border-slate-100 bg-slate-50/70 p-4 transition hover:-translate-y-0.5 hover:border-amber-200 hover:bg-white hover:shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-black text-slate-900">
                          {lead.lead_name ||
                            lead.lead_code ||
                            'Lead'}
                        </div>

                        <div className="mt-1 truncate text-[10px] font-semibold text-slate-400">
                          {lead.course_name ||
                            'Course not set'}
                        </div>
                      </div>

                      <span className="rounded-full bg-red-100 px-2 py-1 text-[9px] font-black uppercase text-red-700">
                        Stuck
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold">
                      <span className="rounded-lg bg-white px-2 py-1 text-slate-600 ring-1 ring-black/5">
                        {prettyStage(
                          lead.current_stage
                        )}
                      </span>

                      <span className="rounded-lg bg-red-50 px-2 py-1 text-red-600">
                        {formatAge(
                          toNumber(
                            lead.stage_age_days
                          )
                        )}{' '}
                        in stage
                      </span>

                      {toNumber(
                        lead.days_over_stuck_threshold
                      ) >
                        0 && (
                        <span className="rounded-lg bg-amber-50 px-2 py-1 text-amber-700">
                          +
                          {formatAge(
                            toNumber(
                              lead.days_over_stuck_threshold
                            )
                          )}{' '}
                          over limit
                        </span>
                      )}
                    </div>

                    <div className="mt-3 text-[10px] font-bold text-brand opacity-70 transition group-hover:opacity-100">
                      Open lead →
                    </div>
                  </Link>
                )
              )}
          </div>
        </section>
      )}

      <PipelineBoard
        leads={
          boardLeads
        }
      />
    </>
  );
}


function median(
  values: number[]
) {
  if (
    values.length ===
    0
  ) {
    return 0;
  }

  const middle =
    Math.floor(
      values.length / 2
    );

  if (
    values.length %
      2 ===
    1
  ) {
    return values[
      middle
    ];
  }

  return (
    values[
      middle - 1
    ] +
    values[
      middle
    ]
  ) / 2;
}


function nullableNumber(
  value:
    | number
    | string
    | null
    | undefined
) {
  if (
    value == null ||
    value === ''
  ) {
    return null;
  }

  const number =
    Number(value);

  return Number.isFinite(
    number
  )
    ? number
    : null;
}


function toNumber(
  value:
    | number
    | string
    | null
    | undefined
) {
  const number =
    Number(value ?? 0);

  return Number.isFinite(
    number
  )
    ? number
    : 0;
}


function formatAge(
  days: number
) {
  if (
    days <
    1
  ) {
    const hours =
      Math.max(
        0,
        Math.round(
          days * 24
        )
      );

    return `${hours}h`;
  }

  if (
    days <
    10
  ) {
    return `${days.toFixed(
      1
    )}d`;
  }

  return `${Math.round(
    days
  )}d`;
}


function prettyStage(
  value: string
) {
  return value
    .replaceAll(
      '_',
      ' '
    )
    .replace(
      /\b\w/g,
      (letter) =>
        letter.toUpperCase()
    );
}
