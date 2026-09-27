import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  CircleDollarSign,
  Clock3,
  Eye,
  Flame,
  Globe2,
  MousePointerClick,
  RefreshCw,
  Route,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';

import { PageHeader } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';

import {
  GoogleAdsBusinessPerformance,
} from '@/components/google-ads-business-performance';

import {
  MetaAdsBusinessPerformance,
} from '@/components/meta-ads-business-performance';

type FunnelOverview = {
  visitors: number | string | null;
  sessions: number | string | null;
  page_views: number | string | null;
  intent_visitors: number | string | null;
  high_intent_visitors: number | string | null;
  form_start_visitors: number | string | null;
  form_submit_visitors: number | string | null;
  leads: number | string | null;
  qualified_leads: number | string | null;
  payment_pending_leads: number | string | null;
  paid_leads: number | string | null;
  enrolled_leads: number | string | null;
  session_to_lead_rate: number | string | null;
  lead_to_qualified_rate: number | string | null;
  lead_to_enrollment_rate: number | string | null;
};


type DailyRow = {
  date: string;
  visitors: number | string | null;
  sessions: number | string | null;
  page_views: number | string | null;
  intent_sessions: number | string | null;
  form_start_sessions: number | string | null;
  form_submit_sessions: number | string | null;
  leads: number | string | null;
  qualified_leads: number | string | null;
  enrolled_leads: number | string | null;
};


type NewReturningRow = {
  visitor_type: string;
  visitors: number | string | null;
  sessions: number | string | null;
  page_views: number | string | null;
  intent_sessions: number | string | null;
  form_start_sessions: number | string | null;
  form_submit_sessions: number | string | null;
  linked_leads: number | string | null;
  session_to_linked_lead_rate: number | string | null;
};


type SourceRow = {
  source: string;
  medium: string;
  visitors: number | string | null;
  sessions: number | string | null;
  page_views: number | string | null;
  intent_sessions: number | string | null;
  form_start_sessions: number | string | null;
  form_submit_sessions: number | string | null;
  linked_leads: number | string | null;
  qualified_linked_leads: number | string | null;
  enrolled_linked_leads: number | string | null;
  session_to_linked_lead_rate: number | string | null;
};


type FirstTouchRow = {
  source: string;
  medium: string;
  leads: number | string | null;
  qualified_leads: number | string | null;
  enrolled_leads: number | string | null;
  repeat_visit_leads: number | string | null;
  post_lead_returners: number | string | null;
  reengaged_leads: number | string | null;
  hot_leads: number | string | null;
  avg_visits_to_lead: number | string | null;
  avg_days_to_lead: number | string | null;
  revenue_inr: number | string | null;
  revenue_usd: number | string | null;
};


type LandingRow = {
  landing_page: string;
  visitors: number | string | null;
  sessions: number | string | null;
  page_views: number | string | null;
  intent_sessions: number | string | null;
  form_start_sessions: number | string | null;
  form_submit_sessions: number | string | null;
  linked_leads: number | string | null;
  session_to_linked_lead_rate: number | string | null;
};


type CountryRow = {
  country: string;
  visitors: number | string | null;
  sessions: number | string | null;
  page_views: number | string | null;
  intent_sessions: number | string | null;
  form_submit_sessions: number | string | null;
  linked_leads: number | string | null;
  session_to_linked_lead_rate: number | string | null;
};


type EventRow = {
  event_type: string;
  event_count: number | string | null;
  visitors: number | string | null;
  linked_leads: number | string | null;
};


type RepeatSummary = {
  total_leads: number | string | null;
  leads_with_linked_web_activity: number | string | null;
  repeat_visitors_before_lead: number | string | null;
  leads_returned_after_conversion: number | string | null;
  reengaged_leads: number | string | null;
  hot_leads: number | string | null;
  warm_leads: number | string | null;
  cold_leads: number | string | null;
  closed_leads: number | string | null;
  avg_visits_to_lead: number | string | null;
  avg_days_to_lead: number | string | null;
};


type VisitDistributionRow = {
  visit_bucket: string;
  lead_count: number | string | null;
  avg_visit_number: number | string | null;
  avg_days_to_lead: number | string | null;
};


export default async function FunnelPage() {
  const supabase =
    await createClient();


  const [
    overviewResult,
    dailyResult,
    newReturningResult,
    sourceResult,
    firstTouchResult,
    landingResult,
    countryResult,
    eventResult,
    repeatResult,
    distributionResult,
  ] =
    await Promise.all([
      supabase
        .from('v_end_to_end_funnel_30d')
        .select('*')
        .maybeSingle(),

      supabase
        .from('v_funnel_daily_30d')
        .select('*')
        .order(
          'date',
          {
            ascending: true,
          }
        ),

      supabase
        .from('v_funnel_new_returning_30d')
        .select('*'),

      supabase
        .from('v_funnel_source_30d')
        .select('*')
        .order(
          'sessions',
          {
            ascending: false,
          }
        )
        .limit(20),

      supabase
        .from('v_first_touch_source_funnel_30d')
        .select('*')
        .order(
          'leads',
          {
            ascending: false,
          }
        )
        .limit(20),

      supabase
        .from('v_funnel_landing_page_30d')
        .select('*')
        .order(
          'sessions',
          {
            ascending: false,
          }
        )
        .limit(20),

      supabase
        .from('v_funnel_country_30d')
        .select('*')
        .order(
          'sessions',
          {
            ascending: false,
          }
        )
        .limit(20),

      supabase
        .from('v_funnel_event_30d')
        .select('*')
        .order(
          'event_count',
          {
            ascending: false,
          }
        ),

      supabase
        .from('v_repeat_visit_summary')
        .select('*')
        .maybeSingle(),

      supabase
        .from('v_conversion_visit_distribution')
        .select('*'),
    ]);


  const errors =
    [
      overviewResult.error,
      dailyResult.error,
      newReturningResult.error,
      sourceResult.error,
      firstTouchResult.error,
      landingResult.error,
      countryResult.error,
      eventResult.error,
      repeatResult.error,
      distributionResult.error,
    ].filter(Boolean);


  if (
    errors.length >
    0
  ) {
    throw new Error(
      `Unable to load funnel analytics: ${errors
        .map(
          (error) =>
            error?.message
        )
        .join(' | ')}`
    );
  }


  const overview =
    (
      overviewResult.data ??
      {}
    ) as FunnelOverview;


  const daily =
    (
      dailyResult.data ??
      []
    ) as DailyRow[];


  const newReturning =
    (
      newReturningResult.data ??
      []
    ) as NewReturningRow[];


  const sources =
    (
      sourceResult.data ??
      []
    ) as SourceRow[];


  const firstTouch =
    (
      firstTouchResult.data ??
      []
    ) as FirstTouchRow[];


  const landingPages =
    (
      landingResult.data ??
      []
    ) as LandingRow[];


  const countries =
    (
      countryResult.data ??
      []
    ) as CountryRow[];


  const events =
    (
      eventResult.data ??
      []
    ) as EventRow[];


  const repeat =
    (
      repeatResult.data ??
      {}
    ) as RepeatSummary;


  const distribution =
    (
      distributionResult.data ??
      []
    ) as VisitDistributionRow[];


  const maxDailySessions =
    Math.max(
      1,
      ...daily.map(
        (row) =>
          toNumber(
            row.sessions
          )
      )
    );


  const maxDailyLeads =
    Math.max(
      1,
      ...daily.map(
        (row) =>
          toNumber(
            row.leads
          )
      )
    );


  return (
    <>
      <PageHeader
        title="End-to-End Funnel"
        description="Website traffic → repeat visits → lead → qualified → payment → enrollment, with source, landing-page, country and re-engagement intelligence."
        actions={
          <Link
            href="/re-engaged"
            className="btn-secondary"
          >
            <RefreshCw
              size={16}
            />
            Re-engaged leads
          </Link>
        }
      />


      <section
        className="
          mt-6
          grid
          gap-3
          sm:grid-cols-2
          xl:grid-cols-6
        "
      >
        <StatCard
          icon={
            <Users
              size={18}
            />
          }
          label="Visitors"
          value={
            formatNumber(
              overview.visitors
            )
          }
          sub="30 days"
        />

        <StatCard
          icon={
            <Route
              size={18}
            />
          }
          label="Sessions"
          value={
            formatNumber(
              overview.sessions
            )
          }
          sub={`${formatPercent(
            overview.session_to_lead_rate
          )} session → lead`}
        />

        <StatCard
          icon={
            <Target
              size={18}
            />
          }
          label="Leads"
          value={
            formatNumber(
              overview.leads
            )
          }
          sub={`${formatNumber(
            overview.qualified_leads
          )} qualified`}
        />

        <StatCard
          icon={
            <MousePointerClick
              size={18}
            />
          }
          label="Paid leads"
          value={
            formatNumber(
              overview.paid_leads
            )
          }
          sub={`${formatNumber(
            overview.payment_pending_leads
          )} payment pending`}
        />

        <StatCard
          icon={
            <TrendingUp
              size={18}
            />
          }
          label="Enrolled"
          value={
            formatNumber(
              overview.enrolled_leads
            )
          }
          sub={`${formatPercent(
            overview.lead_to_enrollment_rate
          )} lead → enrolled`}
        />

        <StatCard
          icon={
            <Flame
              size={18}
            />
          }
          label="Re-engaged"
          value={
            formatNumber(
              repeat.reengaged_leads
            )
          }
          sub={`${formatNumber(
            repeat.hot_leads
          )} hot leads`}
        />
      </section>


      <section className="card-pad mt-4">
        <div className="eyebrow">
          Funnel
        </div>

        <div className="section-title mt-1">
          30-day conversion path
        </div>


        <div className="mt-5 overflow-x-auto">
          <div
            className="
              grid
              min-w-[980px]
              grid-cols-12
              gap-2
            "
          >
            <FunnelStep
              label="Visitors"
              value={
                overview.visitors
              }
            />

            <FunnelArrow />

            <FunnelStep
              label="Sessions"
              value={
                overview.sessions
              }
            />

            <FunnelArrow />

            <FunnelStep
              label="Intent"
              value={
                overview.intent_visitors
              }
            />

            <FunnelArrow />

            <FunnelStep
              label="Form submits"
              value={
                overview.form_submit_visitors
              }
            />

            <FunnelArrow />

            <FunnelStep
              label="Leads"
              value={
                overview.leads
              }
            />

            <FunnelArrow />

            <FunnelStep
              label="Qualified"
              value={
                overview.qualified_leads
              }
            />

            <FunnelArrow />

            <FunnelStep
              label="Paid"
              value={
                overview.paid_leads
              }
            />

            <FunnelArrow />

            <FunnelStep
              label="Enrolled"
              value={
                overview.enrolled_leads
              }
            />
          </div>
        </div>


        <div
          className="
            mt-5
            grid
            gap-3
            sm:grid-cols-3
          "
        >
          <RateCard
            label="Session → lead"
            value={
              overview.session_to_lead_rate
            }
          />

          <RateCard
            label="Lead → qualified"
            value={
              overview.lead_to_qualified_rate
            }
          />

          <RateCard
            label="Lead → enrolled"
            value={
              overview.lead_to_enrollment_rate
            }
          />
        </div>
      </section>


      <GoogleAdsBusinessPerformance />
      <MetaAdsBusinessPerformance />


      <section
        className="
          mt-4
          grid
          gap-4
          xl:grid-cols-[1.35fr_.65fr]
        "
      >
        <div className="card-pad">
          <div className="eyebrow">
            Daily trend
          </div>

          <div className="section-title mt-1">
            Sessions and leads
          </div>


          <div className="mt-5 space-y-2">
            {daily.map(
              (row) => (
                <div
                  key={
                    row.date
                  }
                  className="
                    grid
                    grid-cols-[72px_1fr_64px_1fr_54px]
                    items-center
                    gap-2
                    text-xs
                  "
                >
                  <div className="text-slate-400">
                    {formatShortDate(
                      row.date
                    )}
                  </div>

                  <ProgressBar
                    value={
                      toNumber(
                        row.sessions
                      )
                    }
                    max={
                      maxDailySessions
                    }
                  />

                  <div className="text-right font-semibold text-slate-600">
                    {formatNumber(
                      row.sessions
                    )}
                  </div>

                  <ProgressBar
                    value={
                      toNumber(
                        row.leads
                      )
                    }
                    max={
                      maxDailyLeads
                    }
                  />

                  <div className="text-right font-semibold text-slate-600">
                    {formatNumber(
                      row.leads
                    )}
                  </div>
                </div>
              )
            )}
          </div>


          <div className="mt-4 flex flex-wrap gap-4 text-[11px] text-slate-400">
            <span>
              First bar = sessions
            </span>

            <span>
              Second bar = leads
            </span>
          </div>
        </div>


        <div className="card-pad">
          <div className="eyebrow">
            Repeat behaviour
          </div>

          <div className="section-title mt-1">
            Website journey
          </div>


          <div className="mt-5 space-y-3">
            <MiniMetric
              label="Leads with website history"
              value={
                repeat.leads_with_linked_web_activity
              }
            />

            <MiniMetric
              label="Repeat visitors before lead"
              value={
                repeat.repeat_visitors_before_lead
              }
            />

            <MiniMetric
              label="Returned after becoming lead"
              value={
                repeat.leads_returned_after_conversion
              }
            />

            <MiniMetric
              label="Average visits to lead"
              value={
                formatDecimal(
                  repeat.avg_visits_to_lead,
                  1
                )
              }
              raw
            />

            <MiniMetric
              label="Average days to lead"
              value={
                formatDecimal(
                  repeat.avg_days_to_lead,
                  1
                )
              }
              raw
            />
          </div>


          <Link
            href="/re-engaged"
            className="
              mt-5
              inline-flex
              items-center
              gap-1.5
              text-sm
              font-bold
              text-brand
              hover:underline
            "
          >
            Open re-engaged queue
            <ArrowRight
              size={14}
            />
          </Link>
        </div>
      </section>


      <section
        className="
          mt-4
          grid
          gap-4
          xl:grid-cols-2
        "
      >
        <div className="card-pad">
          <div className="eyebrow">
            Visitor type
          </div>

          <div className="section-title mt-1">
            New vs returning
          </div>

          <div className="mt-5 space-y-3">
            {newReturning.map(
              (row) => (
                <div
                  key={
                    row.visitor_type
                  }
                  className="
                    rounded-xl
                    border
                    border-slate-100
                    bg-slate-50
                    p-4
                  "
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-bold text-slate-800">
                      {pretty(
                        row.visitor_type
                      )}
                    </div>

                    <div className="text-sm font-black text-slate-800">
                      {formatNumber(
                        row.visitors
                      )}{' '}
                      visitors
                    </div>
                  </div>

                  <div
                    className="
                      mt-3
                      grid
                      grid-cols-3
                      gap-3
                      text-xs
                    "
                  >
                    <SmallStat
                      label="Sessions"
                      value={
                        row.sessions
                      }
                    />

                    <SmallStat
                      label="Linked leads"
                      value={
                        row.linked_leads
                      }
                    />

                    <SmallStat
                      label="Lead rate"
                      value={
                        formatPercent(
                          row.session_to_linked_lead_rate
                        )
                      }
                      raw
                    />
                  </div>
                </div>
              )
            )}
          </div>
        </div>


        <div className="card-pad">
          <div className="eyebrow">
            Lead conversion visit
          </div>

          <div className="section-title mt-1">
            Which visit creates the lead?
          </div>


          <div
            className="
              mt-5
              grid
              gap-3
              sm:grid-cols-2
            "
          >
            {distribution.map(
              (row) => (
                <div
                  key={
                    row.visit_bucket
                  }
                  className="
                    rounded-xl
                    border
                    border-slate-100
                    bg-slate-50
                    p-4
                  "
                >
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
                    {row.visit_bucket}
                  </div>

                  <div className="mt-2 text-2xl font-black text-slate-800">
                    {formatNumber(
                      row.lead_count
                    )}
                  </div>

                  <div className="mt-1 text-xs leading-5 text-slate-400">
                    Avg #{formatDecimal(
                      row.avg_visit_number,
                      1
                    )}
                    {' · '}
                    {formatDecimal(
                      row.avg_days_to_lead,
                      1
                    )}{' '}
                    days
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      </section>


      <section className="card-pad mt-4">
        <div className="eyebrow">
          Assisted acquisition
        </div>

        <div className="section-title mt-1">
          Session source / medium performance
        </div>

        <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-400">
          This table is session-based. A lead can appear under multiple channels if they returned through different sources before or after enquiry.
        </p>


        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-3 py-3">
                  Source
                </th>

                <th className="px-3 py-3">
                  Medium
                </th>

                <th className="px-3 py-3 text-right">
                  Visitors
                </th>

                <th className="px-3 py-3 text-right">
                  Sessions
                </th>

                <th className="px-3 py-3 text-right">
                  Leads
                </th>

                <th className="px-3 py-3 text-right">
                  Qualified
                </th>

                <th className="px-3 py-3 text-right">
                  Enrolled
                </th>

                <th className="px-3 py-3 text-right">
                  Lead rate
                </th>
              </tr>
            </thead>

            <tbody>
              {sources.map(
                (row) => (
                  <tr
                    key={`${row.source}-${row.medium}`}
                    className="border-b border-slate-50 last:border-0"
                  >
                    <td className="px-3 py-3 font-bold text-slate-800">
                      {pretty(
                        row.source
                      )}
                    </td>

                    <td className="px-3 py-3 text-slate-500">
                      {pretty(
                        row.medium
                      )}
                    </td>

                    <td className="px-3 py-3 text-right">
                      {formatNumber(
                        row.visitors
                      )}
                    </td>

                    <td className="px-3 py-3 text-right">
                      {formatNumber(
                        row.sessions
                      )}
                    </td>

                    <td className="px-3 py-3 text-right font-bold">
                      {formatNumber(
                        row.linked_leads
                      )}
                    </td>

                    <td className="px-3 py-3 text-right">
                      {formatNumber(
                        row.qualified_linked_leads
                      )}
                    </td>

                    <td className="px-3 py-3 text-right">
                      {formatNumber(
                        row.enrolled_linked_leads
                      )}
                    </td>

                    <td className="px-3 py-3 text-right font-semibold text-brand">
                      {formatPercent(
                        row.session_to_linked_lead_rate
                      )}
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </section>


      <section className="card-pad mt-4">
        <div className="eyebrow">
          Canonical attribution
        </div>

        <div className="section-title mt-1">
          First-touch source → lead → enrollment → revenue
        </div>

        <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-400">
          This cohort uses the source that first introduced the lead. Revenue is net recorded CRM payment value for leads created in the latest 30 days.
        </p>


        <div className="mt-5 overflow-x-auto">
          <table className="min-w-[1100px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-3 py-3">
                  First source
                </th>

                <th className="px-3 py-3 text-right">
                  Leads
                </th>

                <th className="px-3 py-3 text-right">
                  Qualified
                </th>

                <th className="px-3 py-3 text-right">
                  Enrolled
                </th>

                <th className="px-3 py-3 text-right">
                  Repeat before lead
                </th>

                <th className="px-3 py-3 text-right">
                  Returned after lead
                </th>

                <th className="px-3 py-3 text-right">
                  Avg visits
                </th>

                <th className="px-3 py-3 text-right">
                  Avg days
                </th>

                <th className="px-3 py-3 text-right">
                  INR revenue
                </th>

                <th className="px-3 py-3 text-right">
                  USD revenue
                </th>
              </tr>
            </thead>

            <tbody>
              {firstTouch.map(
                (row) => (
                  <tr
                    key={`${row.source}-${row.medium}`}
                    className="border-b border-slate-50 last:border-0"
                  >
                    <td className="px-3 py-3">
                      <div className="font-bold text-slate-800">
                        {pretty(
                          row.source
                        )}
                      </div>

                      <div className="mt-0.5 text-xs text-slate-400">
                        {pretty(
                          row.medium
                        )}
                      </div>
                    </td>

                    <td className="px-3 py-3 text-right font-bold">
                      {formatNumber(
                        row.leads
                      )}
                    </td>

                    <td className="px-3 py-3 text-right">
                      {formatNumber(
                        row.qualified_leads
                      )}
                    </td>

                    <td className="px-3 py-3 text-right">
                      {formatNumber(
                        row.enrolled_leads
                      )}
                    </td>

                    <td className="px-3 py-3 text-right">
                      {formatNumber(
                        row.repeat_visit_leads
                      )}
                    </td>

                    <td className="px-3 py-3 text-right">
                      {formatNumber(
                        row.post_lead_returners
                      )}
                    </td>

                    <td className="px-3 py-3 text-right">
                      {formatDecimal(
                        row.avg_visits_to_lead,
                        1
                      )}
                    </td>

                    <td className="px-3 py-3 text-right">
                      {formatDecimal(
                        row.avg_days_to_lead,
                        1
                      )}
                    </td>

                    <td className="px-3 py-3 text-right font-semibold">
                      {formatCurrency(
                        row.revenue_inr,
                        'INR'
                      )}
                    </td>

                    <td className="px-3 py-3 text-right font-semibold">
                      {formatCurrency(
                        row.revenue_usd,
                        'USD'
                      )}
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </section>


      <section
        className="
          mt-4
          grid
          gap-4
          xl:grid-cols-2
        "
      >
        <div className="card-pad">
          <div className="eyebrow">
            Landing pages
          </div>

          <div className="section-title mt-1">
            Entry-page performance
          </div>


          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-3">
                    Page
                  </th>

                  <th className="px-3 py-3 text-right">
                    Sessions
                  </th>

                  <th className="px-3 py-3 text-right">
                    Leads
                  </th>

                  <th className="px-3 py-3 text-right">
                    Rate
                  </th>
                </tr>
              </thead>

              <tbody>
                {landingPages
                  .slice(
                    0,
                    12
                  )
                  .map(
                    (row) => (
                      <tr
                        key={
                          row.landing_page
                        }
                        className="border-b border-slate-50 last:border-0"
                      >
                        <td className="max-w-[360px] px-3 py-3">
                          <div className="truncate font-semibold text-slate-700">
                            {cleanUrl(
                              row.landing_page
                            )}
                          </div>
                        </td>

                        <td className="px-3 py-3 text-right">
                          {formatNumber(
                            row.sessions
                          )}
                        </td>

                        <td className="px-3 py-3 text-right">
                          {formatNumber(
                            row.linked_leads
                          )}
                        </td>

                        <td className="px-3 py-3 text-right font-semibold text-brand">
                          {formatPercent(
                            row.session_to_linked_lead_rate
                          )}
                        </td>
                      </tr>
                    )
                  )}
              </tbody>
            </table>
          </div>
        </div>


        <div className="card-pad">
          <div className="eyebrow">
            Geography
          </div>

          <div className="section-title mt-1">
            Country performance
          </div>


          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-3">
                    Country
                  </th>

                  <th className="px-3 py-3 text-right">
                    Visitors
                  </th>

                  <th className="px-3 py-3 text-right">
                    Sessions
                  </th>

                  <th className="px-3 py-3 text-right">
                    Leads
                  </th>

                  <th className="px-3 py-3 text-right">
                    Rate
                  </th>
                </tr>
              </thead>

              <tbody>
                {countries
                  .slice(
                    0,
                    12
                  )
                  .map(
                    (row) => (
                      <tr
                        key={
                          row.country
                        }
                        className="border-b border-slate-50 last:border-0"
                      >
                        <td className="px-3 py-3 font-semibold text-slate-700">
                          {row.country}
                        </td>

                        <td className="px-3 py-3 text-right">
                          {formatNumber(
                            row.visitors
                          )}
                        </td>

                        <td className="px-3 py-3 text-right">
                          {formatNumber(
                            row.sessions
                          )}
                        </td>

                        <td className="px-3 py-3 text-right">
                          {formatNumber(
                            row.linked_leads
                          )}
                        </td>

                        <td className="px-3 py-3 text-right font-semibold text-brand">
                          {formatPercent(
                            row.session_to_linked_lead_rate
                          )}
                        </td>
                      </tr>
                    )
                  )}
              </tbody>
            </table>
          </div>
        </div>
      </section>


      <section
        className="
          mt-4
          grid
          gap-4
          xl:grid-cols-[.8fr_1.2fr]
        "
      >
        <div className="card-pad">
          <div className="eyebrow">
            Behaviour
          </div>

          <div className="section-title mt-1">
            Lead temperature
          </div>


          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <TemperatureCard
              label="Hot"
              emoji="🔥"
              value={
                repeat.hot_leads
              }
            />

            <TemperatureCard
              label="Warm"
              emoji="🟠"
              value={
                repeat.warm_leads
              }
            />

            <TemperatureCard
              label="Cold"
              emoji="🔵"
              value={
                repeat.cold_leads
              }
            />

            <TemperatureCard
              label="Closed"
              emoji="⚫"
              value={
                repeat.closed_leads
              }
            />
          </div>
        </div>


        <div className="card-pad">
          <div className="eyebrow">
            Micro-conversions
          </div>

          <div className="section-title mt-1">
            CTA and intent events
          </div>


          <div
            className="
              mt-5
              grid
              gap-3
              sm:grid-cols-2
              lg:grid-cols-3
            "
          >
            {events.map(
              (row) => (
                <div
                  key={
                    row.event_type
                  }
                  className="
                    rounded-xl
                    border
                    border-slate-100
                    bg-slate-50
                    p-4
                  "
                >
                  <div className="text-xs font-semibold text-slate-400">
                    {pretty(
                      row.event_type
                    )}
                  </div>

                  <div className="mt-2 text-xl font-black text-slate-800">
                    {formatNumber(
                      row.event_count
                    )}
                  </div>

                  <div className="mt-1 text-xs text-slate-400">
                    {formatNumber(
                      row.visitors
                    )}{' '}
                    visitors ·{' '}
                    {formatNumber(
                      row.linked_leads
                    )}{' '}
                    linked leads
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      </section>


      <div
        className="
          mt-4
          rounded-xl
          border
          border-slate-100
          bg-slate-50
          px-4
          py-3
          text-xs
          leading-5
          text-slate-500
        "
      >
        Traffic and assisted-source tables use first-party website sessions. First-touch attribution uses the original tracked source attached to each lead. Organic Google query data remains aggregate Search Console context and should not be interpreted as the exact keyword typed by an individual lead.
      </div>
    </>
  );
}


function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="card-pad">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
        {icon}
        {label}
      </div>

      <div className="mt-2 text-2xl font-black text-slate-800">
        {value}
      </div>

      <div className="mt-1 text-xs text-slate-400">
        {sub}
      </div>
    </div>
  );
}


function FunnelStep({
  label,
  value,
}: {
  label: string;
  value:
    | number
    | string
    | null;
}) {
  return (
    <div className="col-span-1 rounded-xl border border-slate-100 bg-slate-50 p-3 text-center">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </div>

      <div className="mt-1 text-lg font-black text-slate-800">
        {formatNumber(
          value
        )}
      </div>
    </div>
  );
}


function FunnelArrow() {
  return (
    <div className="col-span-1 grid place-items-center text-slate-300">
      <ArrowRight
        size={18}
      />
    </div>
  );
}


function RateCard({
  label,
  value,
}: {
  label: string;
  value:
    | number
    | string
    | null;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <div className="text-xs font-semibold text-slate-400">
        {label}
      </div>

      <div className="mt-2 text-xl font-black text-slate-800">
        {formatPercent(
          value
        )}
      </div>
    </div>
  );
}


function MiniMetric({
  label,
  value,
  raw = false,
}: {
  label: string;
  value:
    | number
    | string
    | null;
  raw?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
      <div className="text-xs font-semibold text-slate-500">
        {label}
      </div>

      <div className="text-sm font-black text-slate-800">
        {raw
          ? String(
              value ??
              '—'
            )
          : formatNumber(
              value
            )}
      </div>
    </div>
  );
}


function SmallStat({
  label,
  value,
  raw = false,
}: {
  label: string;
  value:
    | number
    | string
    | null;
  raw?: boolean;
}) {
  return (
    <div>
      <div className="font-bold text-slate-700">
        {raw
          ? String(
              value ??
              '—'
            )
          : formatNumber(
              value
            )}
      </div>

      <div className="mt-0.5 text-slate-400">
        {label}
      </div>
    </div>
  );
}


function ProgressBar({
  value,
  max,
}: {
  value: number;
  max: number;
}) {
  const width =
    Math.max(
      value > 0
        ? 2
        : 0,
      Math.min(
        100,
        (
          value /
          Math.max(
            1,
            max
          )
        ) * 100
      )
    );

  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
      <div
        className="h-full rounded-full bg-slate-500"
        style={{
          width: `${width}%`,
        }}
      />
    </div>
  );
}


function TemperatureCard({
  label,
  emoji,
  value,
}: {
  label: string;
  emoji: string;
  value:
    | number
    | string
    | null;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
        <span>
          {emoji}
        </span>
        {label}
      </div>

      <div className="mt-2 text-xl font-black text-slate-800">
        {formatNumber(
          value
        )}
      </div>
    </div>
  );
}


function toNumber(
  value:
    | number
    | string
    | null
    | undefined
) {
  const number =
    Number(
      value ??
      0
    );

  return Number.isFinite(
    number
  )
    ? number
    : 0;
}


function formatNumber(
  value:
    | number
    | string
    | null
    | undefined
) {
  return new Intl.NumberFormat(
    'en-IN',
    {
      maximumFractionDigits:
        0,
    }
  ).format(
    toNumber(
      value
    )
  );
}


function formatDecimal(
  value:
    | number
    | string
    | null
    | undefined,
  digits = 1
) {
  if (
    value == null ||
    value === ''
  ) {
    return '—';
  }

  return toNumber(
    value
  ).toFixed(
    digits
  );
}


function formatPercent(
  value:
    | number
    | string
    | null
    | undefined
) {
  return `${formatDecimal(
    value,
    1
  )}%`;
}


function formatCurrency(
  value:
    | number
    | string
    | null
    | undefined,
  currency: string
) {
  const amount =
    toNumber(
      value
    );

  try {
    return new Intl.NumberFormat(
      currency ===
        'INR'
        ? 'en-IN'
        : 'en-US',
      {
        style:
          'currency',
        currency,
        maximumFractionDigits:
          0,
      }
    ).format(
      amount
    );
  } catch {
    return `${currency} ${amount}`;
  }
}


function formatShortDate(
  value: string
) {
  const date =
    new Date(
      `${value}T00:00:00Z`
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    'en-IN',
    {
      day:
        'numeric',
      month:
        'short',
      timeZone:
        'UTC',
    }
  ).format(
    date
  );
}


function cleanUrl(
  value: string
) {
  try {
    const url =
      new URL(
        value
      );

    return (
      url.pathname +
      url.search
    );
  } catch {
    return value;
  }
}


function pretty(
  value:
    | string
    | null
    | undefined
) {
  if (!value) {
    return '—';
  }

  return String(
    value
  )
    .replaceAll(
      '_',
      ' '
    )
    .replace(
      /\b\w/g,
      (
        letter
      ) =>
        letter
          .toUpperCase()
    );
}
